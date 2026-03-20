// src/routes/followup.js
// ============================================================
// FOLLOW-UP SEQUENCES — Feature 1
// Exposes follow-up data and user actions (dismiss / mark sent).
// The actual follow-up generation is done by the background job
// in src/jobs/followupSequenceJob.js
//
// AUDIT FIXES APPLIED:
//   - Issue 7:  POST /:id/sent now also updates follow_up_sent_at
//               so the 5-day cooldown is measured from actual send
//               time, not generation time
//   - Issue 8:  All UPDATE queries now include .eq('user_id')
//               filter — prevents cross-user data mutation
//   - Issue 14: dismiss now increments follow_up_count and sets
//               follow_up_dismissed_at to record dismissal history
//   - Logging:  Full structured logging added throughout
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import { PIPELINE_STAGES } from '../config/constants.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING UTILITIES
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
  console.log(`[Followup] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Followup] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Followup] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

// ──────────────────────────────────────────
// GET /api/followup
// List all opportunities with a pending follow-up for this user
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('Get Follow-ups', { userId });

  logDB('SELECT', 'opportunities', {
    userId,
    filter: 'follow_up_message IS NOT NULL, stage IN (contacted/replied/call_demo)',
  });

  const { data: opps, error } = await supabaseAdmin
    .from('opportunities')
    .select(`
      id, platform, target_name, target_context, stage,
      follow_up_message, follow_up_count, follow_up_sent_at,
      marked_sent_at, last_stage_changed_at, composite_score
    `)
    .eq('user_id', userId)
    .not('follow_up_message', 'is', null)
    .in('stage', [PIPELINE_STAGES.CONTACTED, PIPELINE_STAGES.REPLIED, PIPELINE_STAGES.CALL_DEMO])
    .order('follow_up_sent_at', { ascending: false })
    .limit(20);

  if (error) {
    logError('GET /', error, { userId });
    throw error;
  }

  log('Follow-ups Returned', { userId, count: opps?.length || 0 });
  res.json({ followups: opps || [] });
}));

// ──────────────────────────────────────────
// POST /api/followup/:id/dismiss
// User dismisses a follow-up suggestion.
// Clears the message and increments follow_up_count so the job
// treats this as a consumed follow-up slot (max 2 per lead).
// Also records follow_up_dismissed_at for analytics.
//
// Issue 8 fix: UPDATE now includes .eq('user_id') — prevents any
//              authenticated user from dismissing another user's follow-up.
// Issue 14 fix: follow_up_count incremented on dismiss.
// ──────────────────────────────────────────
router.post('/:id/dismiss', asyncHandler(async (req, res) => {
  const oppId = req.params.id;
  const userId = req.user.id;

  log('Dismiss Follow-up — Request', { oppId, userId });

  // Verify ownership with select first
  logDB('SELECT', 'opportunities', { id: oppId, userId, purpose: 'ownership_check' });
  const { data: opp } = await supabaseAdmin
    .from('opportunities')
    .select('id, follow_up_count')
    .eq('id', oppId)
    .eq('user_id', userId)
    .single();

  if (!opp) {
    log('Dismiss — Opportunity Not Found or Unauthorised', { oppId, userId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  const newCount = (opp.follow_up_count || 0) + 1;

  log('Dismiss Follow-up — Clearing Message', { oppId, userId, newFollowUpCount: newCount });

  // Issue 8: .eq('user_id') added to UPDATE for security (not just SELECT)
  // Issue 14: increment follow_up_count so this slot is consumed
  logDB('UPDATE', 'opportunities', {
    id: oppId,
    userId,
    follow_up_message:      null,
    follow_up_count:        newCount,
    follow_up_dismissed_at: 'NOW()',
  });

  const { error: updateError } = await supabaseAdmin
    .from('opportunities')
    .update({
      follow_up_message:      null,
      follow_up_count:        newCount,
      follow_up_dismissed_at: new Date().toISOString(),
    })
    .eq('id', oppId)
    .eq('user_id', userId); // Issue 8: security filter

  if (updateError) {
    logError('dismiss update', updateError, { oppId, userId });
    throw updateError;
  }

  log('Dismiss Follow-up — Done', { oppId, userId, newFollowUpCount: newCount });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// POST /api/followup/:id/sent
// User confirms they sent the follow-up.
// Clears the follow-up message, resets last_stage_changed_at
// (so the next nudge won't fire immediately), and — critically —
// also updates follow_up_sent_at to NOW().
//
// Issue 7 fix: follow_up_sent_at was not updated here before, meaning
//              the 5-day cooldown in the job started from GENERATION time
//              not SEND time. Now the cooldown starts from actual send.
// Issue 8 fix: UPDATE now includes .eq('user_id').
// ──────────────────────────────────────────
router.post('/:id/sent', asyncHandler(async (req, res) => {
  const oppId = req.params.id;
  const userId = req.user.id;

  log('Mark Follow-up Sent — Request', { oppId, userId });

  // Verify ownership with select first
  logDB('SELECT', 'opportunities', { id: oppId, userId, purpose: 'ownership_check' });
  const { data: opp } = await supabaseAdmin
    .from('opportunities')
    .select('id, stage, follow_up_count')
    .eq('id', oppId)
    .eq('user_id', userId)
    .single();

  if (!opp) {
    log('Mark Sent — Opportunity Not Found or Unauthorised', { oppId, userId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  const now = new Date().toISOString();

  log('Mark Follow-up Sent — Updating', {
    oppId,
    userId,
    stage:          opp.stage,
    follow_up_count: opp.follow_up_count,
  });

  // Issue 7:  follow_up_sent_at updated to NOW() — cooldown now measured from send time
  // Issue 8:  .eq('user_id') added to UPDATE for security
  logDB('UPDATE', 'opportunities', {
    id:                     oppId,
    userId,
    follow_up_message:      null,
    last_stage_changed_at:  'NOW()',
    follow_up_sent_at:      'NOW()',  // Issue 7 fix
  });

  const { error: updateError } = await supabaseAdmin
    .from('opportunities')
    .update({
      follow_up_message:     null,
      last_stage_changed_at: now,
      follow_up_sent_at:     now,   // Issue 7 fix: was missing, causing incorrect cooldown
    })
    .eq('id', oppId)
    .eq('user_id', userId); // Issue 8: security filter

  if (updateError) {
    logError('mark sent update', updateError, { oppId, userId });
    throw updateError;
  }

  log('Mark Follow-up Sent — Done', { oppId, userId, updatedAt: now });
  res.json({ success: true });
}));

export default router;
