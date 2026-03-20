// src/routes/prospects.js
// ============================================================
// PROSPECT RELATIONSHIP HUB
// The missing CRM layer. Every unique contact with a timeline,
// health score, signals, and AI-generated summary.
//
// GET  /              — list all prospects with health scores
// GET  /:id           — single prospect with full timeline
// POST /              — create prospect manually
// PUT  /:id           — update prospect details
// POST /:id/refresh-summary — regenerate AI summary
// POST /:id/recalculate-health — recalculate health score
// DELETE /:id         — soft delete prospect
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { generateProspectSummary } from '../services/groqCalendarIntelligence.js';
import supabaseAdmin from '../config/supabase.js';

const router = Router();

// ──────────────────────────────────────────
// GET /api/prospects
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { sort = 'health', limit = 50 } = req.query;

  let query = supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('user_id', req.user.id)
    .order('relationship_health_score', { ascending: sort === 'health_asc' })
    .limit(parseInt(limit));

  if (sort === 'recent') {
    query = supabaseAdmin
      .from('prospects')
      .select('*')
      .eq('user_id', req.user.id)
      .order('last_contact_at', { ascending: false, nullsFirst: false })
      .limit(parseInt(limit));
  }

  const { data: prospects, error } = await query;
  if (error) throw error;

  // Count pending commitments per prospect
  const prospectIds = (prospects || []).map(p => p.id);
  let commitmentCounts = {};

  if (prospectIds.length) {
    const { data: counts } = await supabaseAdmin
      .from('conversation_commitments')
      .select('prospect_id, id')
      .in('prospect_id', prospectIds)
      .eq('owner', 'founder')
      .in('status', ['pending', 'overdue']);

    (counts || []).forEach(c => {
      commitmentCounts[c.prospect_id] = (commitmentCounts[c.prospect_id] || 0) + 1;
    });
  }

  const enriched = (prospects || []).map(p => ({
    ...p,
    pending_commitments: commitmentCounts[p.id] || 0,
  }));

  res.json({ prospects: enriched });
}));

// ──────────────────────────────────────────
// GET /api/prospects/:id
// Full timeline + signals + commitments
// ──────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { data: prospect, error } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !prospect) return res.status(404).json({ error: 'NOT_FOUND' });

  // Load all related data in parallel
  const [eventsRes, chatsRes, signalsRes, commitmentsRes] = await Promise.all([
    supabaseAdmin
      .from('user_events')
      .select('id, title, event_type, event_date, start_time, outcome, energy_score, debrief_completed_at, debrief_content')
      .eq('prospect_id', prospect.id)
      .order('event_date', { ascending: false }),

    supabaseAdmin
      .from('chats')
      .select('id, title, chat_mode, message_count, last_message_at, created_at')
      .eq('prospect_id', prospect.id)
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false }),

    supabaseAdmin
      .from('conversation_signals')
      .select('*')
      .eq('prospect_id', prospect.id)
      .eq('is_active', true)
      .order('detected_at', { ascending: false })
      .limit(20),

    supabaseAdmin
      .from('conversation_commitments')
      .select('*')
      .eq('prospect_id', prospect.id)
      .order('created_at', { ascending: false }),
  ]);

  // Build unified timeline
  const timeline = [
    ...(eventsRes.data || []).map(e => ({
      type:        'event',
      id:          e.id,
      date:        e.start_time || e.event_date,
      title:       e.title,
      subtype:     e.event_type,
      outcome:     e.outcome,
      energy:      e.energy_score,
      has_debrief: !!e.debrief_completed_at,
      summary:     e.debrief_content?.summary || null,
    })),
    ...(chatsRes.data || []).map(c => ({
      type:          'chat',
      id:            c.id,
      date:          c.last_message_at || c.created_at,
      title:         c.title,
      subtype:       c.chat_mode,
      message_count: c.message_count,
    })),
    ...(signalsRes.data || []).map(s => ({
      type:        'signal',
      id:          s.id,
      date:        s.detected_at,
      title:       `${s.signal_type.charAt(0).toUpperCase() + s.signal_type.slice(1)} signal detected`,
      signal_type: s.signal_type,
      signal_text: s.signal_text,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({
    prospect,
    timeline,
    signals:     signalsRes.data     || [],
    commitments: commitmentsRes.data || [],
    meetings:    eventsRes.data      || [],
    chats:       chatsRes.data       || [],
  });
}));

// ──────────────────────────────────────────
// POST /api/prospects
// ──────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const { name, company, title, email, linkedin_url, platform, notes } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required' });
  }

  const { data: prospect, error } = await supabaseAdmin
    .from('prospects')
    .insert({
      user_id:         req.user.id,
      name:            name.trim(),
      company:         company?.trim()      || null,
      title:           title?.trim()        || null,
      email:           email?.trim()        || null,
      linkedin_url:    linkedin_url?.trim() || null,
      platform:        platform             || null,
      notes:           notes?.trim()        || null,
      first_contact_at: new Date().toISOString(),
      last_contact_at:  new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  res.status(201).json({ prospect });
}));

// ──────────────────────────────────────────
// PUT /api/prospects/:id
// ──────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, company, title, email, linkedin_url, platform, notes, stage } = req.body;

  const { error } = await supabaseAdmin
    .from('prospects')
    .update({ name, company, title, email, linkedin_url, platform, notes, stage, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) throw error;
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// POST /api/prospects/:id/refresh-summary
// Regenerates the AI narrative summary
// ──────────────────────────────────────────
router.post('/:id/refresh-summary', asyncHandler(async (req, res) => {
  const { data: prospect } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!prospect) return res.status(404).json({ error: 'NOT_FOUND' });

  // Build timeline for context
  const { data: events } = await supabaseAdmin
    .from('user_events')
    .select('title, event_type, outcome, event_date, debrief_content')
    .eq('prospect_id', prospect.id)
    .order('event_date', { ascending: false })
    .limit(10);

  const { data: signals } = await supabaseAdmin
    .from('conversation_signals')
    .select('signal_type, signal_text, detected_at')
    .eq('prospect_id', prospect.id)
    .eq('is_active', true)
    .limit(10);

  const timeline = [
    ...(events || []).map(e => ({ type: 'event', date: e.event_date, title: e.title, outcome: e.outcome })),
    ...(signals || []).map(s => ({ type: 'signal', date: s.detected_at, signal_type: s.signal_type, signal_text: s.signal_text })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const summary = await generateProspectSummary(req.user, prospect, timeline);

  await supabaseAdmin
    .from('prospects')
    .update({ ai_summary: summary, ai_summary_updated_at: new Date().toISOString() })
    .eq('id', prospect.id);

  res.json({ success: true, summary });
}));

// ──────────────────────────────────────────
// DELETE /api/prospects/:id
// ──────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  await supabaseAdmin
    .from('prospects')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  res.json({ success: true });
}));

export default router;
