// src/routes/feedback.js
// ============================================================
// FEEDBACK SYSTEM V3 — AI event prep + Conversation Autopsy Engine
//
// V3 changes:
//   - POST /api/feedback now triggers runConversationAnalysis
//     fire-and-forget after every FINAL outcome is logged.
//   - The analysis runs within 30 seconds of feedback creation
//     and stores structured scores in conversation_analyses.
//   - GET /api/feedback/history now includes analysis summary
//     data alongside each historical feedback record.
//
// AUDIT FIXES APPLIED:
//   - Issue 1/13: Added PENDING outcome support throughout
//   - Issue 2:    Backend now reads outcome_note (was: notes)
//   - Issue 4:    is_final, scheduled_call, scheduled_call_date,
//                 scheduled_call_notes now fully handled
//   - Issue 5:    updatePerformanceStats is now atomic via RPC
//   - Issue 12:   feedback/pending uses two-step query (no nested subquery)
//   - Issue 18:   opportunity_id guard added at route level
//   - Issue 21:   deal_value_usd consistently uses parseInt
//   - Issue 24:   outcome_note, scheduled_call_notes length-capped
//   - Issue 25:   calendar event creation failure is logged but non-fatal
//   - Logging:    Full structured logging added throughout
//
// REQUIRED MIGRATIONS (run once in Supabase SQL editor):
// ─────────────────────────────────────────────────────
// 1. Atomic performance stats (Issue 5):
//
//   CREATE OR REPLACE FUNCTION increment_performance_stats(
//     p_user_id UUID, p_is_positive BOOLEAN
//   ) RETURNS VOID AS $$
//   BEGIN
//     INSERT INTO user_performance_profiles
//       (user_id, total_sent, total_positive, total_negative, positive_rate)
//     VALUES (
//       p_user_id, 1,
//       CASE WHEN p_is_positive THEN 1 ELSE 0 END,
//       CASE WHEN p_is_positive THEN 0 ELSE 1 END,
//       CASE WHEN p_is_positive THEN 1.0 ELSE 0.0 END
//     )
//     ON CONFLICT (user_id) DO UPDATE SET
//       total_sent     = user_performance_profiles.total_sent + 1,
//       total_positive = user_performance_profiles.total_positive
//                        + (CASE WHEN p_is_positive THEN 1 ELSE 0 END),
//       total_negative = user_performance_profiles.total_negative
//                        + (CASE WHEN p_is_positive THEN 0 ELSE 1 END),
//       positive_rate  = ROUND(
//         (user_performance_profiles.total_positive
//          + (CASE WHEN p_is_positive THEN 1 ELSE 0 END))::NUMERIC
//         / (user_performance_profiles.total_sent + 1), 4
//       );
//   END;
//   $$ LANGUAGE plpgsql;
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { FEEDBACK_OUTCOMES, PIPELINE_STAGES, OPPORTUNITY_STATUS } from '../config/constants.js';
import { notifyUser, Notifications } from '../services/notifications.js';
import { generateEventPrep } from '../services/groq.js';
import supabaseAdmin from '../config/supabase.js';
import { runConversationAnalysis } from '../jobs/conversationAnalysisJob.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING UTILITIES
// Mirrors the pattern established in practice.js
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
  console.log(`[Feedback] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Feedback] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Feedback] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

// ──────────────────────────────────────────
// POST /api/feedback
//
// PENDING outcome behaviour:
//   - A pending feedback CAN be submitted and stored.
//   - It does NOT count in performance stats (outcome is not final).
//   - It does NOT mark the opportunity as DONE.
//   - It does NOT trigger conversation analysis.
//   - If a pending record already exists, submitting a final outcome
//     (positive/negative) UPDATES the existing record instead of
//     returning 409. This allows users to update once they hear back.
// ──────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const {
    opportunity_id,
    outcome,
    outcome_note,
    deal_value_usd,
    scheduled_call,
    scheduled_call_date,
    scheduled_call_notes,
    is_final
  } = req.body;

  const userId = req.user.id;

  log('Submit Feedback — Request', {
    userId,
    opportunity_id,
    outcome,
    has_note:       !!outcome_note,
    deal_value_usd: deal_value_usd || null,
    scheduled_call: scheduled_call || false,
    is_final:       is_final || false,
  });

  // ── Input validation ──────────────────────────────────────────────────────
  if (!opportunity_id || !outcome) {
    log('Validation Failed — Missing required fields', { userId, opportunity_id, outcome });
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'opportunity_id and outcome are required'
    });
  }

  if (!Object.values(FEEDBACK_OUTCOMES).includes(outcome)) {
    log('Validation Failed — Invalid outcome', { userId, outcome });
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `outcome must be: ${Object.values(FEEDBACK_OUTCOMES).join(' | ')}`
    });
  }

  // ── Fetch opportunity (verify ownership) ─────────────────────────────────
  logDB('SELECT', 'opportunities', { id: opportunity_id, userId });
  const { data: opportunity, error: oppError } = await supabaseAdmin
    .from('opportunities')
    .select('id, user_id, stage, target_name, target_context, platform, prepared_message')
    .eq('id', opportunity_id)
    .eq('user_id', userId)
    .single();

  if (oppError || !opportunity) {
    log('Opportunity Not Found', { userId, opportunity_id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  log('Opportunity Found', { opportunity_id, stage: opportunity.stage, platform: opportunity.platform });

  // ── Duplicate / update-pending check ─────────────────────────────────────
  // Use maybeSingle() — .single() throws if no row found.
  logDB('SELECT', 'feedback', { opportunity_id, userId, purpose: 'duplicate_check' });
  const { data: existingFeedback } = await supabaseAdmin
    .from('feedback')
    .select('id, outcome')
    .eq('opportunity_id', opportunity_id)
    .eq('user_id', userId)
    .maybeSingle();

  // Determine whether this is an update from pending→final
  const isFinalOutcome = outcome !== FEEDBACK_OUTCOMES.PENDING;
  const isUpdatingPending = existingFeedback?.outcome === FEEDBACK_OUTCOMES.PENDING && isFinalOutcome;

  if (existingFeedback && !isUpdatingPending) {
    log('Duplicate Feedback Blocked', { userId, opportunity_id, existingOutcome: existingFeedback.outcome });
    return res.status(409).json({
      error: 'ALREADY_SUBMITTED',
      message: 'Feedback already recorded for this opportunity'
    });
  }

  if (isUpdatingPending) {
    log('Updating Pending Feedback to Final Outcome', {
      userId,
      opportunity_id,
      from: existingFeedback.outcome,
      to: outcome,
    });
  }

  // ── Determine new pipeline stage ─────────────────────────────────────────
  const newStage = determineStage({
    outcome, deal_value_usd, scheduled_call, is_final, currentStage: opportunity.stage
  });

  log('Stage Determined', { currentStage: opportunity.stage, newStage, outcome });

  // ── Sanitise text fields ──────────────────────────────────────────────────
  const sanitisedNote      = outcome_note?.trim().slice(0, 1000) || null;
  const sanitisedCallNotes = scheduled_call_notes?.trim().slice(0, 500) || null;
  const sanitisedDealValue = deal_value_usd ? parseInt(deal_value_usd) : null;

  // ── Insert or update feedback record ─────────────────────────────────────
  let feedbackId;

  if (isUpdatingPending) {
    // UPDATE existing pending record with the final outcome
    logDB('UPDATE', 'feedback', { id: existingFeedback.id, outcome });
    const { data: updatedFeedback, error: updateErr } = await supabaseAdmin
      .from('feedback')
      .update({
        outcome,
        outcome_note:         sanitisedNote,
        deal_value_usd:       sanitisedDealValue,
        scheduled_call:       scheduled_call || false,
        is_final:             is_final || false,
        scheduled_call_date:  scheduled_call_date || null,
        scheduled_call_notes: sanitisedCallNotes,
        practice_suggested:   outcome === FEEDBACK_OUTCOMES.NEGATIVE,
        updated_at:           new Date().toISOString(),
      })
      .eq('id', existingFeedback.id)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (updateErr) throw updateErr;
    feedbackId = updatedFeedback.id;
    log('Feedback Record Updated', { feedbackId, outcome });

  } else {
    // INSERT new feedback record
    logDB('INSERT', 'feedback', { opportunity_id, outcome, userId });
    const { data: newFeedback, error: feedbackError } = await supabaseAdmin
      .from('feedback')
      .insert({
        user_id:              userId,
        opportunity_id,
        outcome,
        outcome_note:         sanitisedNote,
        deal_value_usd:       sanitisedDealValue,
        scheduled_call:       scheduled_call || false,
        is_final:             is_final || false,
        scheduled_call_date:  scheduled_call_date || null,
        scheduled_call_notes: sanitisedCallNotes,
        practice_suggested:   outcome === FEEDBACK_OUTCOMES.NEGATIVE,
      })
      .select('id')
      .single();

    if (feedbackError) throw feedbackError;
    feedbackId = newFeedback.id;
    log('Feedback Record Inserted', { feedbackId, outcome });
  }

  // ── Update opportunity stage + status ─────────────────────────────────────
  // Pending outcomes keep the opportunity ACTIVE (status stays SENT)
  // so the follow-up / feedback prompt jobs continue to work normally.
  const oppUpdate = isFinalOutcome
    ? { stage: newStage, status: OPPORTUNITY_STATUS.DONE }
    : { stage: newStage }; // pending: don't close the opportunity

  logDB('UPDATE', 'opportunities', { id: opportunity_id, ...oppUpdate });
  await supabaseAdmin
    .from('opportunities')
    .update(oppUpdate)
    .eq('id', opportunity_id);

  // ── Performance stats (only for final outcomes) ───────────────────────────
  // Uses atomic RPC to avoid race conditions under concurrent submissions.
  // NOTE: requires increment_performance_stats() SQL function (see migration above).
  if (isFinalOutcome) {
    log('Updating Performance Stats', { userId, outcome });
    await updatePerformanceStats(userId, outcome);
  } else {
    log('Skipping Performance Stats — Outcome is Pending', { userId });
  }

  // ── V3: Trigger Conversation Autopsy (final outcomes only) ────────────────
  // Only runs if the opportunity has a prepared_message (virtually always true).
  // Fire-and-forget — failure is logged but must not block the response.
  const shouldAnalyse = isFinalOutcome && feedbackId && opportunity.prepared_message;
  if (shouldAnalyse) {
    log('Triggering Conversation Analysis', { feedbackId, userId });
    runConversationAnalysis(feedbackId, userId).catch(err =>
      logError('runConversationAnalysis trigger', err, { feedbackId, userId })
    );
  }

  // ── Calendar event creation (positive + call scheduled) ──────────────────
  let calendarPrompt = null;
  let eventCreated   = null;

  if (scheduled_call && newStage === PIPELINE_STAGES.CALL_DEMO) {
    log('Creating Calendar Event', { opportunity_id, target: opportunity.target_name });
    try {
      const { data: newEvent } = await supabaseAdmin
        .from('user_events')
        .insert({
          user_id:          userId,
          title:            `Call with ${opportunity.target_name || 'prospect'}`,
          event_date:       scheduled_call_date
            ? new Date(scheduled_call_date).toISOString().split('T')[0]
            : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          event_type:       'call_demo',
          notes:            sanitisedCallNotes || `Follow-up from ${opportunity.platform} outreach`,
          opportunity_id,
          attendee_name:    opportunity.target_name,
          attendee_context: opportunity.target_context
        })
        .select()
        .single();

      if (newEvent) {
        eventCreated = newEvent;
        // Fire-and-forget — event prep generation must not block the response
        generateAndSaveEventPrep(req.user, newEvent);
        calendarPrompt = {
          show:            true,
          event_id:        newEvent.id,
          suggested_title: newEvent.title,
          opportunity_id,
          message:         "Call added to Clutch Calendar. AI prep (talking points, research) will be ready shortly."
        };
        log('Calendar Event Created', { eventId: newEvent.id, title: newEvent.title });
      }
    } catch (calErr) {
      // Issue 25: calendar event creation is best-effort and must not fail the response
      logError('calendar event creation', calErr, { opportunity_id });
    }
  }

  // ── Branch: PENDING response ──────────────────────────────────────────────
  if (outcome === FEEDBACK_OUTCOMES.PENDING) {
    log('Submit Feedback — Response: Pending', { userId, opportunity_id, feedbackId });
    return res.json({
      success:             true,
      outcome,
      new_stage:           newStage,
      calendar_prompt:     null,
      practice_suggestion: { show: false },
      analysis_queued:     false,
      message:             "Got it. Clutch will remind you again once more time passes.",
    });
  }

  // ── Branch: NEGATIVE response ─────────────────────────────────────────────
  if (outcome === FEEDBACK_OUTCOMES.NEGATIVE) {
    const practiceType = detectScenarioFromNote(sanitisedNote);
    log('Submit Feedback — Response: Negative', { userId, opportunity_id, feedbackId, practiceType });
    return res.json({
      success:     true,
      outcome,
      new_stage:   newStage,
      calendar_prompt: null,
      practice_suggestion: {
        show:          true,
        title:         "Turn this into a learning moment",
        message:       buildPracticeMessage(sanitisedNote, opportunity.platform),
        cta:           "Start Practice Round",
        scenario_type: practiceType,
        action:        'OPEN_PRACTICE_MODE'
      },
      analysis_queued: shouldAnalyse,
      encouragement:   getEncouragement(userId),
      message:         "Tracked. Clutch is analyzing this conversation for patterns.",
    });
  }

  // ── Branch: POSITIVE response ─────────────────────────────────────────────
  log('Submit Feedback — Response: Positive', { userId, opportunity_id, feedbackId, newStage });
  return res.json({
    success:         true,
    outcome,
    new_stage:       newStage,
    calendar_prompt: calendarPrompt,
    event_created:   eventCreated ? { id: eventCreated.id, title: eventCreated.title } : null,
    practice_suggestion: { show: false },
    analysis_queued: shouldAnalyse,
    celebration: {
      show:    true,
      message: newStage === PIPELINE_STAGES.CLOSED_WON
        ? `🎉 Closed${sanitisedDealValue ? ` — $${sanitisedDealValue.toLocaleString()} logged` : ''}!`
        : "Positive outcome! Keep the momentum going.",
    },
    message: "Logged. Clutch is learning what works for you.",
  });
}));

// ──────────────────────────────────────────
// GET /api/feedback/pending
// Returns opportunities that were sent ≥48h ago without feedback.
// Uses a two-step query instead of a nested subquery (more reliable).
// ──────────────────────────────────────────
router.get('/pending', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  log('Get Pending Feedback', { userId, cutoff });

  // Step 1: get opportunity IDs that already have feedback for this user
  logDB('SELECT', 'feedback', { userId, purpose: 'pending_exclusion_list' });
  const { data: existingFeedback } = await supabaseAdmin
    .from('feedback')
    .select('opportunity_id')
    .eq('user_id', userId);

  const feedbackOpportunityIds = (existingFeedback || []).map(f => f.opportunity_id);

  // Step 2: fetch sent opportunities older than cutoff, excluding those with feedback
  logDB('SELECT', 'opportunities', { userId, cutoff, excluding: feedbackOpportunityIds.length });
  let query = supabaseAdmin
    .from('opportunities')
    .select('id, platform, target_context, target_name, marked_sent_at, stage')
    .eq('user_id', userId)
    .eq('status', OPPORTUNITY_STATUS.SENT)
    .lt('marked_sent_at', cutoff)
    .order('marked_sent_at', { ascending: true })
    .limit(5);

  if (feedbackOpportunityIds.length > 0) {
    query = query.not('id', 'in', `(${feedbackOpportunityIds.map(id => `"${id}"`).join(',')})`);
  }

  const { data } = await query;

  log('Pending Feedback Result', { userId, count: data?.length || 0 });
  res.json({ pending: data || [], count: data?.length || 0 });
}));

// ──────────────────────────────────────────
// GET /api/feedback/history
// V3: includes analysis_summary from conversation_analyses
// ──────────────────────────────────────────
router.get('/history', asyncHandler(async (req, res) => {
  const { limit = 30, offset = 0 } = req.query;
  const userId = req.user.id;

  log('Get Feedback History', { userId, limit, offset });

  const { data: history, error } = await supabaseAdmin
    .from('feedback')
    .select(`
      id, outcome, outcome_note, created_at,
      deal_value_usd, scheduled_call, is_final,
      practice_suggested, practice_accepted,
      opportunities(platform, target_context, target_name, stage, source_url, prepared_message)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (error) throw error;

  // Batch-load conversation analyses (avoids N+1)
  const feedbackIds = (history || []).map(h => h.id);
  logDB('SELECT', 'conversation_analyses', { feedbackIds: feedbackIds.length });
  const { data: analyses } = feedbackIds.length > 0
    ? await supabaseAdmin
        .from('conversation_analyses')
        .select('feedback_id, composite_score, hook_score, personalization_score, failure_categories, analysis_text')
        .in('feedback_id', feedbackIds)
    : { data: [] };

  const analysisMap = {};
  (analyses || []).forEach(a => { analysisMap[a.feedback_id] = a; });

  logDB('SELECT', 'user_performance_profiles', { userId });
  const { data: profile } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('total_sent, total_positive, total_negative, positive_rate, learned_patterns')
    .eq('user_id', userId)
    .single();

  log('Feedback History Returned', { userId, count: history?.length || 0, analysesFound: analyses?.length || 0 });

  res.json({
    history: (history || []).map(h => ({
      ...h,
      analysis_summary: analysisMap[h.id] || null,
    })),
    stats: profile || { total_sent: 0, total_positive: 0, positive_rate: 0 }
  });
}));

// ──────────────────────────────────────────
// POST /api/feedback/practice-accepted
// ──────────────────────────────────────────
router.post('/practice-accepted', asyncHandler(async (req, res) => {
  const { opportunity_id } = req.body;
  const userId = req.user.id;

  log('Practice Accepted', { userId, opportunity_id });

  if (opportunity_id) {
    logDB('UPDATE', 'feedback', { opportunity_id, practice_accepted: true });
    await supabaseAdmin
      .from('feedback')
      .update({ practice_accepted: true })
      .eq('opportunity_id', opportunity_id)
      .eq('user_id', userId);
  }

  log('Practice Accepted — Updated', { userId, opportunity_id });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

/**
 * Determines the new pipeline stage from the feedback outcome and context.
 *
 * Pending outcomes keep the lead at its current stage (or bump to CONTACTED
 * if it is still NEW). They do not close anything.
 */
function determineStage({ outcome, deal_value_usd, scheduled_call, is_final, currentStage }) {
  if (outcome === FEEDBACK_OUTCOMES.NEGATIVE && is_final) return PIPELINE_STAGES.CLOSED_LOST;
  if (outcome === FEEDBACK_OUTCOMES.POSITIVE && deal_value_usd) return PIPELINE_STAGES.CLOSED_WON;
  if (outcome === FEEDBACK_OUTCOMES.POSITIVE && scheduled_call) return PIPELINE_STAGES.CALL_DEMO;
  if (outcome === FEEDBACK_OUTCOMES.POSITIVE) {
    const stageOrder = [
      PIPELINE_STAGES.NEW, PIPELINE_STAGES.CONTACTED, PIPELINE_STAGES.REPLIED,
      PIPELINE_STAGES.CALL_DEMO, PIPELINE_STAGES.CLOSED_WON, PIPELINE_STAGES.CLOSED_LOST,
    ];
    const currentIdx = stageOrder.indexOf(currentStage);
    const repliedIdx = stageOrder.indexOf(PIPELINE_STAGES.REPLIED);
    return currentIdx >= repliedIdx ? currentStage : PIPELINE_STAGES.REPLIED;
  }
  return currentStage !== PIPELINE_STAGES.NEW && currentStage !== PIPELINE_STAGES.CONTACTED
    ? currentStage : PIPELINE_STAGES.CONTACTED;
}

/**
 * Atomically increments performance stats via a Postgres RPC function.
 * Requires the increment_performance_stats() SQL function (see migration at top).
 * Falls back gracefully with a warning if the function does not yet exist.
 */
async function updatePerformanceStats(userId, outcome) {
  const isPositive = outcome === FEEDBACK_OUTCOMES.POSITIVE;
  logDB('RPC', 'increment_performance_stats', { userId, isPositive });
  const { error } = await supabaseAdmin.rpc('increment_performance_stats', {
    p_user_id:     userId,
    p_is_positive: isPositive,
  });
  if (error) {
    // If the RPC function hasn't been deployed yet, fall back to the
    // non-atomic read-modify-write so the feature doesn't break in dev.
    console.warn('[Feedback] ⚠️  RPC increment_performance_stats not found — falling back to non-atomic update. Run the migration!', error.message);
    await updatePerformanceStatsFallback(userId, isPositive);
  }
}

/** Non-atomic fallback — remove once the RPC migration has been applied. */
async function updatePerformanceStatsFallback(userId, isPositive) {
  const { data: profile } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('total_sent, total_positive, total_negative')
    .eq('user_id', userId)
    .single();

  const newSent     = (profile?.total_sent     || 0) + 1;
  const newPositive = (profile?.total_positive  || 0) + (isPositive ? 1 : 0);
  const newNegative = (profile?.total_negative  || 0) + (isPositive ? 0 : 1);

  await supabaseAdmin
    .from('user_performance_profiles')
    .upsert({
      user_id:        userId,
      total_sent:     newSent,
      total_positive: newPositive,
      total_negative: newNegative,
      positive_rate:  newPositive / newSent
    }, { onConflict: 'user_id' });
}

async function generateAndSaveEventPrep(user, event) {
  try {
    log('Generating Event Prep', { eventId: event.id, userId: user.id });
    const prep = await generateEventPrep(user, event);
    await supabaseAdmin
      .from('user_events')
      .update({
        prep_generated:    true,
        prep_content:      prep,
        prep_generated_at: new Date().toISOString()
      })
      .eq('id', event.id);
    log('Event Prep Saved', { eventId: event.id });
  } catch (err) {
    logError('generateAndSaveEventPrep', err, { eventId: event.id });
  }
}

function buildPracticeMessage(note, platform) {
  const n = note?.toLowerCase() || '';
  if (n.includes('ghost') || n.includes('no response') || n.includes('ignored')) {
    return "Getting ghosted is the most common outcome in outreach. A 3-minute practice session will help you write messages that get noticed — and make it sting less next time.";
  }
  if (n.includes('price') || n.includes('expensive') || n.includes('cost')) {
    return "Price objections mean interest — they just need more convincing. Practice handling this exact scenario to sharpen your response.";
  }
  if (n.includes('later') || n.includes('busy') || n.includes('timing')) {
    return "Timing objections are recoverable. Practice re-engaging 'not right now' prospects and learn when to push vs when to wait.";
  }
  return "Every negative outcome teaches you something. A quick practice round will help you handle this better next time.";
}

function detectScenarioFromNote(note) {
  const n = note?.toLowerCase() || '';
  if (n.includes('ghost') || n.includes('no response')) return 'ghost';
  if (n.includes('price') || n.includes('expensive') || n.includes('budget')) return 'price_objection';
  if (n.includes('later') || n.includes('timing') || n.includes('busy')) return 'not_right_time';
  if (n.includes('skeptic') || n.includes('doubt') || n.includes('prove')) return 'skeptical';
  return 'polite_decline';
}

/**
 * Returns a random encouragement message.
 * Uses a Fisher-Yates-seeded approach based on the userId's last character
 * so the same user doesn't always see the same message in succession.
 * Not cryptographically random — purely cosmetic.
 */
const ENCOURAGEMENT_MSGS = [
  "The best closers get rejected constantly. It's how they learn faster.",
  "Every 'no' you survive makes the next one easier to handle.",
  "Rejection rate doesn't define success. Outreach rate does.",
  "Every message that doesn't land is data. Use it.",
  "Top performers have a 30% reply rate. 70% of their messages still get ignored.",
  "Persistence is the differentiator. Keep going.",
  "Each conversation — win or loss — is a rep that makes you sharper.",
];

function getEncouragement(userId) {
  // Use userId last char as a seed offset — ensures variation across successive calls
  const seed = userId ? userId.charCodeAt(userId.length - 1) : 0;
  const timeSlot = Math.floor(Date.now() / (1000 * 60 * 60 * 4)); // rotates every 4 hours
  const idx = (seed + timeSlot) % ENCOURAGEMENT_MSGS.length;
  return ENCOURAGEMENT_MSGS[idx];
}

export default router;
