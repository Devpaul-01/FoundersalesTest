// src/routes/calendar.js
// ============================================================
// CLUTCH CALENDAR SYSTEM — INTELLIGENCE UPGRADE
//
// AUDIT FIXES APPLIED:
//  Issue 4  — Idempotency guard on POST /:id/debrief
//  Issue 5  — AI rate limiter applied to heavy endpoints
//  Issue 6  — PUT /:id now returns 404 when event not found
//  Issue 7  — DELETE /:id now returns 404 when event not found
//  Issue 8  — buildPrepContext: user_id filter on signals query
//  Issue 9  — buildPrepContext: user_id filter on commitments query
//  Issue 10 — upsertProspect: race condition handled with conflict fallback
//  Issue 11 — updateProspectHealth: user_id filter on commitments query
//  Issue 12 — Removed conflicting flat-+8 path; single updateProspectHealth
//  Issue 13 — Debrief critical DB write decoupled from follow-up generation
//  Issue 14 — start-meeting-notes: idempotency check for existing chat
//  Issue 20 — GET /:id: 3 sequential queries replaced with Promise.all
//  Issue 21 — updateProspectLastContact folded into updateProspectHealth
//  Issue 22 — impliedDueDate("this week") computes actual end-of-week Friday
//  Issue 27 — attendee_context max-length validation (2000 chars)
//  Issue 28 — Full structured logging throughout
//  Issue 29 — Business-neutral language (any seller type, not just "founders")
// ============================================================

import { Router }    from 'express';
import rateLimit     from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateEnrichedEventPrep } from '../services/groqCalendarIntelligence.js';
import {
  generateMeetingDebrief,
  extractCommitmentsFromText,
  generateSignalAnalysis,
  generatePostMeetingFollowUp,
} from '../services/groqCalendarIntelligence.js';
import { researchProspectForMeeting } from '../services/perplexityCalendar.js';
import supabaseAdmin from '../config/supabase.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING — Issue 28
// Matches the pattern established in practice.txt and followup.txt
// ──────────────────────────────────────────
const log = (event, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return `${k}=${JSON.stringify(v)}`;
      return `${k}=${v}`;
    })
    .filter(Boolean)
    .join(' ');
  console.log(`[Calendar] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Calendar] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Calendar] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Calendar] 🤖 AI [${fn}]${entries ? ` → ${entries}` : ''}`);
};

// ──────────────────────────────────────────
// Issue 5: Rate limiter for AI-heavy calendar endpoints
// 10 AI-heavy calls per user per 5 minutes
// ──────────────────────────────────────────
const calendarAiRateLimiter = rateLimit({
  windowMs:        5 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.user?.id || req.ip,
  message: {
    error:   'RATE_LIMIT_EXCEEDED',
    message: 'Too many AI requests. Please wait a few minutes and try again.',
  },
});

// ──────────────────────────────────────────
// GET /api/calendar
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const userId = req.user.id;

  // Issue 19 (backend companion): default "from" to 14 days ago so the
  // past section shows meaningful meeting history, not just today
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 14);
  const fromDate = from || defaultFrom.toISOString().split('T')[0];

  log('List Events', { userId, from: fromDate, to: to || 'none' });

  let query = supabaseAdmin
    .from('user_events')
    .select('*, prospects(id, name, company, relationship_health_score)')
    .eq('user_id', userId)
    .gte('event_date', fromDate)
    .order('event_date', { ascending: true });

  if (to) query = query.lte('event_date', to);

  const { data: events, error } = await query;
  if (error) {
    logError('GET /', error, { userId });
    throw error;
  }

  // Attach debrief-needed flag for past events
  const now = new Date();
  const enriched = (events || []).map(e => ({
    ...e,
    debrief_needed: new Date(e.start_time || e.event_date) < now && !e.debrief_completed_at,
    health_score:   e.prospects?.relationship_health_score || null,
  }));

  log('List Events — Done', { userId, count: enriched.length });
  res.json({ events: enriched });
}));

// ──────────────────────────────────────────
// GET /api/calendar/alerts
// Returns pending debrief nudges + overdue commitments
// ──────────────────────────────────────────
router.get('/alerts', asyncHandler(async (req, res) => {
  const now    = new Date().toISOString();
  const userId = req.user.id;

  log('Get Alerts', { userId });

  const [eventsRes, commitmentsRes] = await Promise.all([
    supabaseAdmin
      .from('user_events')
      .select('id, title, event_date, start_time, event_type, attendee_name, outcome')
      .eq('user_id', userId)
      .lt('event_date', now.split('T')[0])
      .is('debrief_completed_at', null)
      .order('event_date', { ascending: false })
      .limit(5),

    supabaseAdmin
      .from('conversation_commitments')
      .select('id, commitment_text, due_date, prospect_id, prospects(name)')
      .eq('user_id', userId)
      .eq('owner', 'founder')
      .in('status', ['pending', 'overdue'])
      .order('due_date', { ascending: true })
      .limit(10),
  ]);

  if (eventsRes.error)      logError('GET /alerts events',      eventsRes.error,      { userId });
  if (commitmentsRes.error) logError('GET /alerts commitments', commitmentsRes.error, { userId });

  const today = new Date().toISOString().split('T')[0];
  const commitments = (commitmentsRes.data || []).map(c => ({
    ...c,
    is_overdue: c.due_date && c.due_date < today,
  }));

  const result = {
    debriefs_needed:     eventsRes.data     || [],
    overdue_commitments: commitments.filter(c => c.is_overdue),
    pending_commitments: commitments.filter(c => !c.is_overdue),
  };

  log('Get Alerts — Done', {
    userId,
    debriefs_needed:     result.debriefs_needed.length,
    overdue_commitments: result.overdue_commitments.length,
    pending_commitments: result.pending_commitments.length,
  });

  res.json(result);
}));

// ──────────────────────────────────────────
// POST /api/calendar
// ──────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const {
    title, event_date, start_time, end_time,
    event_type = 'meeting',
    notes, attendee_name, attendee_context,
    opportunity_id, prospect_id,
  } = req.body;

  const userId = req.user.id;

  log('Create Event — Request', {
    userId,
    title,
    event_date,
    event_type,
    hasAttendee:      !!attendee_name,
    hasContext:       !!attendee_context,
    hasProspectId:    !!prospect_id,
    hasOpportunityId: !!opportunity_id,
  });

  if (!title || !event_date) {
    log('Create Event — Validation Failed', { userId, missingTitle: !title, missingDate: !event_date });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'title and event_date are required',
    });
  }

  // Issue 27: server-side max-length on attendee_context to prevent prompt overflow
  if (attendee_context && attendee_context.trim().length > 2000) {
    log('Create Event — Validation Failed', { userId, reason: 'attendee_context_too_long', length: attendee_context.length });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'attendee_context must be 2000 characters or fewer',
    });
  }

  // Upsert prospect if attendee info given but no prospect_id
  let resolvedProspectId = prospect_id || null;
  if (!resolvedProspectId && attendee_name?.trim()) {
    log('Create Event — Upserting Prospect', { userId, attendee_name });
    resolvedProspectId = await upsertProspect(userId, { name: attendee_name, context: attendee_context });
    log('Create Event — Prospect Resolved', { userId, resolvedProspectId });
  }

  logDB('INSERT', 'user_events', { userId, title, event_date, event_type, resolvedProspectId });
  const { data: event, error } = await supabaseAdmin
    .from('user_events')
    .insert({
      user_id:          userId,
      title,
      event_date,
      start_time:       start_time || null,
      end_time:         end_time   || null,
      event_type,
      notes:            notes?.trim()                                || null,
      attendee_name:    attendee_name?.trim()                        || null,
      attendee_context: attendee_context?.trim().slice(0, 2000)     || null,
      opportunity_id:   opportunity_id                               || null,
      prospect_id:      resolvedProspectId,
    })
    .select()
    .single();

  if (error) {
    logError('POST /', error, { userId, title });
    throw error;
  }

  log('Create Event — Inserted', { userId, eventId: event.id });

  // Fire-and-forget: generate enriched prep + research
  log('Create Event — Triggering Background AI Prep', { eventId: event.id });
  generateAndSaveEnrichedPrep(req.user, event);
  researchProspectForMeeting(userId, event.id, event, req.user).catch(err =>
    logError('researchProspectForMeeting', err, { eventId: event.id })
  );

  log('Create Event — Done', { userId, eventId: event.id });
  res.status(201).json({
    event,
    message: 'Event created! AI prep and research will be ready shortly.',
  });
}));

// ──────────────────────────────────────────
// GET /api/calendar/:id
// Returns event with all intelligence data
// Issue 20: 3 sequential queries → Promise.all
// ──────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  log('Get Event', { userId, eventId: id });

  // Issue 20: run all 3 queries in parallel
  const [eventRes, commitmentsRes, signalsRes] = await Promise.all([
    supabaseAdmin
      .from('user_events')
      .select('*, prospects(id, name, company, title, relationship_health_score, ai_summary)')
      .eq('id', id)
      .eq('user_id', userId)
      .single(),

    supabaseAdmin
      .from('conversation_commitments')
      .select('*')
      .eq('source_id', id)
      .eq('user_id', userId),

    supabaseAdmin
      .from('conversation_signals')
      .select('*')
      .eq('source_id', id)
      .eq('user_id', userId),
  ]);

  if (eventRes.error || !eventRes.data) {
    log('Get Event — Not Found', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  if (commitmentsRes.error) logError('GET /:id commitments', commitmentsRes.error, { userId, eventId: id });
  if (signalsRes.error)     logError('GET /:id signals',     signalsRes.error,     { userId, eventId: id });

  log('Get Event — Done', {
    userId,
    eventId:        id,
    commitments:    commitmentsRes.data?.length || 0,
    signals:        signalsRes.data?.length     || 0,
  });

  res.json({
    event:       eventRes.data,
    commitments: commitmentsRes.data || [],
    signals:     signalsRes.data     || [],
  });
}));

// ──────────────────────────────────────────
// PUT /api/calendar/:id
// Issue 6: Returns 404 when event not found or wrong user
// ──────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  const {
    title, event_date, start_time, end_time,
    event_type, notes, attendee_name, attendee_context,
    prospect_id,
  } = req.body;

  log('Update Event', { userId, eventId: id });

  // Issue 27: validate on update too
  if (attendee_context && attendee_context.trim().length > 2000) {
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'attendee_context must be 2000 characters or fewer',
    });
  }

  logDB('UPDATE', 'user_events', { id, userId });
  const { data: updated, error } = await supabaseAdmin
    .from('user_events')
    .update({ title, event_date, start_time, end_time, event_type, notes, attendee_name, attendee_context, prospect_id })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .single();

  // Issue 6: return 404 if no row matched (event not found or wrong user)
  if (error || !updated) {
    log('Update Event — Not Found or Unauthorised', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  log('Update Event — Done', { userId, eventId: id });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// DELETE /api/calendar/:id
// Issue 7: Returns 404 when event not found or wrong user
// ──────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  log('Delete Event', { userId, eventId: id });

  // Issue 7: verify ownership before delete
  logDB('SELECT', 'user_events', { id, userId, purpose: 'ownership_check' });
  const { data: existing } = await supabaseAdmin
    .from('user_events')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    log('Delete Event — Not Found or Unauthorised', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  logDB('DELETE', 'user_events', { id, userId });
  await supabaseAdmin
    .from('user_events')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  log('Delete Event — Done', { userId, eventId: id });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// POST /api/calendar/:id/regenerate-prep
// Issue 5: AI rate limiter applied
// ──────────────────────────────────────────
router.post('/:id/regenerate-prep', calendarAiRateLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  log('Regenerate Prep', { userId, eventId: id });

  const { data: event } = await supabaseAdmin
    .from('user_events')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!event) {
    log('Regenerate Prep — Event Not Found', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  logAI('generateEnrichedEventPrep', { eventId: id, hasProspect: !!event.prospect_id });
  const prepContext = await buildPrepContext(req.user, event);
  const prep        = await generateEnrichedEventPrep(req.user, event, prepContext);

  logDB('UPDATE', 'user_events', { id, prep_generated: true });
  await supabaseAdmin
    .from('user_events')
    .update({ prep_content: prep, prep_generated: true, prep_generated_at: new Date().toISOString() })
    .eq('id', event.id);

  log('Regenerate Prep — Done', { userId, eventId: id });
  res.json({ success: true, prep_content: prep });
}));

// ──────────────────────────────────────────
// POST /api/calendar/:id/research
// Issue 5: AI rate limiter applied
// ──────────────────────────────────────────
router.post('/:id/research', calendarAiRateLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  log('Trigger Research', { userId, eventId: id });

  const { data: event } = await supabaseAdmin
    .from('user_events')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!event) {
    log('Trigger Research — Event Not Found', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  // Clear existing research so it gets re-generated
  logDB('UPDATE', 'user_events', { id, research_generated_at: null });
  await supabaseAdmin
    .from('user_events')
    .update({ research_generated_at: null })
    .eq('id', event.id);

  log('Trigger Research — Firing Background Research', { eventId: id });
  researchProspectForMeeting(userId, event.id, event, req.user).catch(err =>
    logError('researchProspectForMeeting manual', err, { eventId: id })
  );

  res.json({ success: true, message: 'Research triggered — refresh in a moment' });
}));

// ──────────────────────────────────────────
// POST /api/calendar/:id/debrief
// Issue 4:  Idempotency guard added
// Issue 5:  AI rate limiter applied
// Issue 13: Critical DB write decoupled from follow-up generation
// ──────────────────────────────────────────
router.post('/:id/debrief', calendarAiRateLimiter, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  const {
    outcome,
    energy_score,
    meeting_notes,
    founder_commitments  = [],
    prospect_commitments = [],
    chat_id,
  } = req.body;

  log('Submit Debrief — Request', {
    userId,
    eventId:             id,
    outcome,
    hasNotes:            !!meeting_notes,
    chatId:              chat_id,
    founderCommitments:  founder_commitments.length,
    prospectCommitments: prospect_commitments.length,
  });

  if (!outcome) {
    log('Submit Debrief — Validation Failed', { userId, eventId: id, reason: 'missing_outcome' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'outcome is required' });
  }

  logDB('SELECT', 'user_events', { id, userId });
  const { data: event } = await supabaseAdmin
    .from('user_events')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!event) {
    log('Submit Debrief — Event Not Found', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  // Issue 4: Idempotency guard — block re-submission
  if (event.debrief_completed_at) {
    log('Submit Debrief — Already Submitted', { userId, eventId: id, completedAt: event.debrief_completed_at });
    return res.status(409).json({
      error:   'CONFLICT',
      message: 'A debrief has already been submitted for this event.',
    });
  }

  // If notes came from a chat session, pull messages from it
  let allNotes = meeting_notes || '';
  if (chat_id && !allNotes) {
    log('Submit Debrief — Loading Notes from Chat', { chatId: chat_id });
    const { data: chatMessages } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('chat_id', chat_id)
      .in('role', ['user'])
      .order('created_at', { ascending: true });

    if (chatMessages?.length) {
      allNotes = chatMessages.map(m => m.content).join('\n');
      log('Submit Debrief — Chat Notes Loaded', { chatId: chat_id, messageCount: chatMessages.length });
    }
  }

  log('Submit Debrief — Starting AI Analysis', {
    eventId:    id,
    outcome,
    notesLen:   allNotes.length,
  });

  // Run all AI analysis in parallel
  logAI('parallel [debrief + commitments + signals]', { eventId: id });
  const [debrief, extractedCommitments, signals] = await Promise.all([
    generateMeetingDebrief(req.user, event, allNotes, outcome),
    extractCommitmentsFromText(
      allNotes + '\n' + founder_commitments.join('\n') + '\n' + prospect_commitments.join('\n'),
      event.attendee_name
    ),
    generateSignalAnalysis(allNotes, event.attendee_name, outcome),
  ]);

  logAI('parallel complete', {
    eventId:              id,
    debrief_has_summary:  !!debrief?.summary,
    commitments_found:    extractedCommitments.length,
    signals_found:        signals.length,
  });

  // Merge manually entered commitments with AI-extracted ones
  const founderManual  = founder_commitments.map(t => ({ text: t, owner: 'founder',  implicit_due: 'unclear' }));
  const prospectManual = prospect_commitments.map(t => ({ text: t, owner: 'prospect', implicit_due: 'unclear' }));
  const allCommitments = [...extractedCommitments, ...founderManual, ...prospectManual];

  // Deduplicate by similarity
  const seenTexts = new Set();
  const dedupedCommitments = allCommitments.filter(c => {
    const key = c.text.toLowerCase().slice(0, 40);
    if (seenTexts.has(key)) return false;
    seenTexts.add(key);
    return true;
  });

  log('Submit Debrief — Commitments Deduplicated', { eventId: id, final: dedupedCommitments.length });

  // Build debrief content object
  const debriefContent = {
    summary:          debrief.summary,
    what_worked:      debrief.what_worked,
    what_to_improve:  debrief.what_to_improve,
    coachable_moment: debrief.coachable_moment,
    next_step:        debrief.next_step_recommendation,
    raw_notes:        allNotes.slice(0, 5000),
  };

  // ──────────────────────────────────────────
  // Issue 13: CRITICAL PATH — Save debrief FIRST, then generate follow-up async.
  // This ensures the debrief is never lost even if follow-up generation fails.
  // ──────────────────────────────────────────
  logDB('UPDATE', 'user_events', { id, debrief_completed_at: 'NOW()', outcome });
  await supabaseAdmin
    .from('user_events')
    .update({
      outcome,
      energy_score:         energy_score || energyFromOutcome(outcome),
      meeting_notes:        allNotes.slice(0, 5000),
      debrief_content:      debriefContent,
      debrief_completed_at: new Date().toISOString(),
      signals_extracted:    true,
    })
    .eq('id', event.id);

  log('Submit Debrief — Event Updated', { eventId: id });

  // Save commitments to DB
  if (dedupedCommitments.length) {
    const commitmentRows = dedupedCommitments.map(c => ({
      user_id:         userId,
      prospect_id:     event.prospect_id || null,
      source_type:     'meeting_debrief',
      source_id:       event.id,
      commitment_text: c.text,
      owner:           c.owner || 'founder',
      status:          'pending',
      due_date:        impliedDueDate(c.implicit_due),
    }));

    logDB('INSERT', 'conversation_commitments', { count: commitmentRows.length, eventId: id });
    await supabaseAdmin.from('conversation_commitments').insert(commitmentRows);
    log('Submit Debrief — Commitments Saved', { eventId: id, count: commitmentRows.length });
  }

  // Save signals to DB
  if (signals.length) {
    const signalRows = signals.map(s => ({
      user_id:     userId,
      prospect_id: event.prospect_id || null,
      source_type: 'meeting_debrief',
      source_id:   event.id,
      signal_type: s.type,
      signal_text: s.text,
      confidence:  s.confidence || 0.7,
    }));

    logDB('INSERT', 'conversation_signals', { count: signalRows.length, eventId: id });
    await supabaseAdmin.from('conversation_signals').insert(signalRows);
    log('Submit Debrief — Signals Saved', { eventId: id, count: signalRows.length });
  }

  // Issue 12: single updateProspectHealth covers health + last_contact_at (no separate call needed)
  if (event.prospect_id) {
    log('Submit Debrief — Triggering Prospect Health Update', { prospectId: event.prospect_id });
    updateProspectHealth(userId, event.prospect_id).catch(err =>
      logError('updateProspectHealth', err, { prospectId: event.prospect_id })
    );
  }

  // Update opportunity stage if linked and outcome is positive
  if (event.opportunity_id && ['hot', 'positive'].includes(outcome)) {
    logDB('UPDATE', 'opportunities', { id: event.opportunity_id, newStage: 'replied' });
    await supabaseAdmin
      .from('opportunities')
      .update({ stage: 'replied', last_stage_changed_at: new Date().toISOString() })
      .eq('id', event.opportunity_id)
      .eq('stage', 'contacted');
    log('Submit Debrief — Opportunity Stage Advanced', { opportunityId: event.opportunity_id });
  }

  // Issue 13: Generate follow-up in background — non-critical path
  log('Submit Debrief — Triggering Background Follow-up Generation', { eventId: id });
  generatePostMeetingFollowUp(req.user, event, debrief, dedupedCommitments, signals)
    .then(followUpOptions => {
      logAI('generatePostMeetingFollowUp complete', { eventId: id });
      return supabaseAdmin
        .from('user_events')
        .update({
          follow_up_options:      followUpOptions,
          follow_up_generated_at: new Date().toISOString(),
        })
        .eq('id', event.id);
    })
    .then(() => log('Submit Debrief — Follow-up Saved', { eventId: id }))
    .catch(err => logError('generatePostMeetingFollowUp', err, { eventId: id }));

  log('Submit Debrief — Done', {
    userId,
    eventId:     id,
    outcome,
    commitments: dedupedCommitments.length,
    signals:     signals.length,
  });

  res.json({
    success:           true,
    debrief:           debriefContent,
    commitments:       dedupedCommitments,
    signals,
    follow_up_options: null, // populated async — refresh the event to see options
    message:           '✅ Debrief saved! Follow-up options are being generated.',
  });
}));

// ──────────────────────────────────────────
// POST /api/calendar/:id/start-meeting-notes
// Issue 14: Idempotency — returns existing chat if already started
// ──────────────────────────────────────────
router.post('/:id/start-meeting-notes', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  log('Start Meeting Notes', { userId, eventId: id });

  const { data: event } = await supabaseAdmin
    .from('user_events')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!event) {
    log('Start Meeting Notes — Event Not Found', { userId, eventId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Event not found' });
  }

  // Issue 14: Check for existing meeting-notes chat for this event
  logDB('SELECT', 'chats', { eventId: id, chatMode: 'meeting_notes', purpose: 'idempotency_check' });
  const { data: existingChat } = await supabaseAdmin
    .from('chats')
    .select('id, title')
    .eq('event_id', event.id)
    .eq('chat_mode', 'meeting_notes')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .maybeSingle();

  if (existingChat) {
    log('Start Meeting Notes — Returning Existing Chat', { userId, eventId: id, chatId: existingChat.id });
    return res.json({ chat: existingChat, event });
  }

  // Create a new meeting-notes chat
  logDB('INSERT', 'chats', { userId, eventId: id, chatMode: 'meeting_notes' });
  const { data: chat, error } = await supabaseAdmin
    .from('chats')
    .insert({
      user_id:     userId,
      title:       `Meeting Notes: ${event.title}`,
      chat_type:   'general',
      chat_mode:   'meeting_notes',
      event_id:    event.id,
      prospect_id: event.prospect_id || null,
    })
    .select()
    .single();

  if (error) {
    logError('start-meeting-notes chat insert', error, { userId, eventId: id });
    throw error;
  }

  // Issue 29: Business-neutral language — "contact" not "prospect", "user" not "founder"
  const contextParts = [
    `[MEETING NOTES SESSION]`,
    `Event: ${event.title}`,
    `Type: ${event.event_type || 'meeting'}`,
    `With: ${event.attendee_name || 'Contact'}`,
    `Date: ${event.start_time || event.event_date}`,
    event.attendee_context ? `Context: ${event.attendee_context}` : null,
    event.prep_content?.opening_line ? `Prep opening: "${event.prep_content.opening_line}"` : null,
    ``,
    `You are in MEETING NOTES MODE. Accept fragmented notes, ask smart follow-up questions.`,
    `When the user types "done", "end", or "meeting over", reply: __END_MEETING__`,
  ].filter(Boolean).join('\n');

  logDB('INSERT', 'chat_messages', { chatId: chat.id, role: 'system' });
  await supabaseAdmin.from('chat_messages').insert({
    chat_id: chat.id,
    user_id: userId,
    role:    'system',
    content: contextParts,
  });

  log('Start Meeting Notes — Done', { userId, eventId: id, chatId: chat.id });
  res.status(201).json({ chat, event });
}));

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

async function generateAndSaveEnrichedPrep(user, event) {
  log('Background Prep — Starting', { userId: user.id, eventId: event.id });
  try {
    const context = await buildPrepContext(user, event);
    const prep    = await generateEnrichedEventPrep(user, event, context);

    logDB('UPDATE', 'user_events', { id: event.id, prep_generated: true });
    await supabaseAdmin
      .from('user_events')
      .update({ prep_content: prep, prep_generated: true, prep_generated_at: new Date().toISOString() })
      .eq('id', event.id);

    log('Background Prep — Done', { userId: user.id, eventId: event.id });
  } catch (err) {
    logError('generateAndSaveEnrichedPrep', err, { userId: user.id, eventId: event.id });
  }
}

// Issues 8, 9: user_id filters added to all service-key queries in buildPrepContext
async function buildPrepContext(user, event) {
  const context = {};

  if (event.prospect_id) {
    log('Build Prep Context — Loading Prospect Data', { userId: user.id, prospectId: event.prospect_id });

    const [eventsRes, signalsRes, commitmentsRes] = await Promise.all([
      supabaseAdmin
        .from('user_events')
        .select('title, event_type, outcome, event_date, debrief_content')
        .eq('prospect_id', event.prospect_id)
        .eq('user_id', user.id)          // Issue 8/9: user_id isolation fix
        .neq('id', event.id)
        .order('event_date', { ascending: false })
        .limit(5),

      supabaseAdmin
        .from('conversation_signals')
        .select('signal_type, signal_text, detected_at')
        .eq('prospect_id', event.prospect_id)
        .eq('user_id', user.id)          // Issue 8: user_id isolation fix
        .eq('is_active', true)
        .order('detected_at', { ascending: false })
        .limit(10),

      supabaseAdmin
        .from('conversation_commitments')
        .select('commitment_text, owner, status, due_date')
        .eq('prospect_id', event.prospect_id)
        .eq('user_id', user.id)          // Issue 9: user_id isolation fix
        .in('status', ['pending', 'overdue'])
        .eq('owner', 'founder'),
    ]);

    if (eventsRes.data?.length) {
      context.prospectTimeline = eventsRes.data
        .map(e => `${e.event_date}: ${e.event_type} — ${e.outcome || 'no debrief'}. ${e.debrief_content?.summary || ''}`)
        .join('\n');
    }
    context.previousSignals        = signalsRes.data    || [];
    context.outstandingCommitments = commitmentsRes.data || [];

    log('Build Prep Context — Done', {
      userId:    user.id,
      prospectId: event.prospect_id,
      timeline:   eventsRes.data?.length  || 0,
      signals:    signalsRes.data?.length  || 0,
      commits:    commitmentsRes.data?.length || 0,
    });
  }

  if (event.perplexity_research) {
    context.perplexityResearch = event.perplexity_research;
  }

  return context;
}

// Issue 10: Race condition handled — insert uses conflict fallback
async function upsertProspect(userId, { name, context }) {
  const { data: existing } = await supabaseAdmin
    .from('prospects')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', name.trim())
    .limit(1)
    .maybeSingle();                // maybeSingle won't throw on 0 rows

  if (existing) {
    log('Upsert Prospect — Found Existing', { userId, name, id: existing.id });
    return existing.id;
  }

  try {
    logDB('INSERT', 'prospects', { userId, name });
    const { data: created, error } = await supabaseAdmin
      .from('prospects')
      .insert({
        user_id:          userId,
        name:             name.trim(),
        notes:            context?.trim() || null,
        first_contact_at: new Date().toISOString(),
        last_contact_at:  new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      // Issue 10: concurrent insert hit unique constraint — fall back to select
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        log('Upsert Prospect — Conflict, Falling Back to Select', { userId, name });
        const { data: fallback } = await supabaseAdmin
          .from('prospects')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', name.trim())
          .limit(1)
          .maybeSingle();
        return fallback?.id || null;
      }
      throw error;
    }

    log('Upsert Prospect — Created', { userId, name, id: created?.id });
    return created?.id || null;
  } catch (err) {
    logError('upsertProspect', err, { userId, name });
    return null;
  }
}

// Issues 11, 12, 21: Single authoritative health function.
// Last contact is updated in the same DB write (no separate updateProspectLastContact call).
async function updateProspectHealth(userId, prospectId) {
  const now = new Date();
  log('Update Prospect Health — Starting', { userId, prospectId });

  const [eventsRes, signalsRes, commitmentsRes] = await Promise.all([
    supabaseAdmin
      .from('user_events')
      .select('outcome, energy_score, event_date')
      .eq('prospect_id', prospectId)
      .eq('user_id', userId)
      .order('event_date', { ascending: false })
      .limit(10),

    supabaseAdmin
      .from('conversation_signals')
      .select('signal_type, detected_at')
      .eq('prospect_id', prospectId)
      .eq('user_id', userId)
      .eq('is_active', true),

    supabaseAdmin
      .from('conversation_commitments')
      .select('owner, status, due_date')
      .eq('prospect_id', prospectId)
      .eq('user_id', userId),          // Issue 11: user_id filter added
  ]);

  let score = 50;

  const lastEvent = eventsRes.data?.[0];
  if (lastEvent) {
    const daysSince = (now - new Date(lastEvent.event_date)) / 86400000;
    if      (daysSince < 3)  score += 20;
    else if (daysSince < 7)  score += 10;
    else if (daysSince < 14) score += 0;
    else if (daysSince < 30) score -= 15;
    else                     score -= 30;

    const outcomeBonus = { hot: 20, positive: 10, neutral: 0, cold: -10, dead: -30 };
    score += outcomeBonus[lastEvent.outcome] || 0;
  }

  const recentSignals = (signalsRes.data || []).filter(s => {
    const days = (now - new Date(s.detected_at)) / 86400000;
    return days < 14;
  });
  score += recentSignals.filter(s => s.signal_type === 'buying').length *  8;
  score -= recentSignals.filter(s => s.signal_type === 'risk').length   * 10;

  const overdueCount = (commitmentsRes.data || []).filter(c =>
    c.owner === 'founder' && c.status === 'overdue'
  ).length;
  score -= overdueCount * 12;

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  // Issue 21: fold last_contact_at into this single update — no separate function needed
  logDB('UPDATE', 'prospects', { prospectId, finalScore });
  await supabaseAdmin
    .from('prospects')
    .update({
      relationship_health_score: finalScore,
      health_updated_at:         now.toISOString(),
      last_contact_at:           now.toISOString(), // Issue 21 fix: was a separate round-trip
    })
    .eq('id', prospectId);

  log('Update Prospect Health — Done', { userId, prospectId, finalScore });
}

function energyFromOutcome(outcome) {
  return { hot: 5, positive: 4, neutral: 3, cold: 2, dead: 1 }[outcome] || 3;
}

// Issue 22: "this week" now correctly computes Friday of the current week
function impliedDueDate(implicit) {
  const today = new Date();
  if (!implicit || implicit === 'unclear') return null;

  if (implicit === 'tomorrow') {
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  }

  if (implicit === 'this week') {
    // Find this week's Friday (day 5). If today is already Friday, keep it.
    // If Saturday(6) or Sunday(0), use next Friday.
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    const daysUntilFriday = dayOfWeek <= 5
      ? (5 - dayOfWeek)          // Mon–Fri: 0–4 days away
      : (5 - dayOfWeek + 7);     // Sat/Sun: 6 or 5 days to next Friday
    today.setDate(today.getDate() + daysUntilFriday);
    return today.toISOString().split('T')[0];
  }

  if (implicit === 'this month') {
    today.setDate(today.getDate() + 21);
    return today.toISOString().split('T')[0];
  }

  return null;
}

export default router;
