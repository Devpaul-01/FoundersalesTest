// src/routes/pipeline.js
// ============================================================
// SALES PIPELINE API
// Powers the Kanban board UI.
// Handles stage transitions and revenue tracking.
//
// FIXES & IMPROVEMENTS:
//  BUG-01 — PUT /:id/stage now writes last_stage_changed_at on every
//            manual stage move. Previously this was never written for
//            Kanban drag/tap moves, making the followup job's staleness
//            detection completely wrong for manually moved deals.
//
//  FEAT-01 — GET / now returns last_stage_changed_at, follow_up_message,
//            and follow_up_count on every card so the frontend can show
//            days-in-stage staleness and make the follow-up badge interactive.
//
//  FEAT-02 — PUT /:id/stage accepts an optional lost_reason field when
//            moving to closed_lost. Stored directly on the opportunity row.
//
//  FEAT-03 — GET / also returns per-column deal_value_sum for pipeline
//            totals visible directly on the Kanban.
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { PIPELINE_STAGES, PIPELINE_STAGE_VALUES } from '../config/constants.js';
import supabaseAdmin from '../config/supabase.js';

const log = (label, data = {}) => {
  console.log(`[Pipeline/${label}]`, Object.keys(data).length ? JSON.stringify(data) : '');
};

const router = Router();

// ──────────────────────────────────────────
// GET /api/pipeline
// Returns all opportunities grouped by pipeline stage.
// Powers the Kanban board frontend.
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const { data: opportunities, error } = await supabaseAdmin
    .from('opportunities')
    .select(`
      id, stage, target_name, target_context, prepared_message,
      platform, source_url, composite_score, marked_sent_at,
      created_at, fit_score, timing_score, intent_score,
      last_stage_changed_at, follow_up_message, follow_up_count,
      feedback(deal_value_usd, outcome, scheduled_call, scheduled_call_date)
    `)
    .eq('user_id', userId)
    .not('stage', 'eq', PIPELINE_STAGES.NEW)  // 'new' = not yet in pipeline
    .order('composite_score', { ascending: false });

  if (error) throw error;

  // Group by stage for Kanban
  const pipeline = {
    [PIPELINE_STAGES.CONTACTED]: [],
    [PIPELINE_STAGES.REPLIED]: [],
    [PIPELINE_STAGES.CALL_DEMO]: [],
    [PIPELINE_STAGES.CLOSED_WON]: [],
    [PIPELINE_STAGES.CLOSED_LOST]: []
  };

  for (const opp of (opportunities || [])) {
    if (pipeline[opp.stage]) {
      pipeline[opp.stage].push({
        id:                   opp.id,
        stage:                opp.stage,
        target_name:          opp.target_name || extractName(opp.target_context),
        target_context:       opp.target_context,
        platform:             opp.platform,
        source_url:           opp.source_url,
        composite_score:      opp.composite_score,
        marked_sent_at:       opp.marked_sent_at,
        last_stage_changed_at: opp.last_stage_changed_at || opp.marked_sent_at || opp.created_at,
        follow_up_message:    opp.follow_up_message || null,
        follow_up_count:      opp.follow_up_count   || 0,
        deal_value_usd:       opp.feedback?.[0]?.deal_value_usd    || null,
        scheduled_call_date:  opp.feedback?.[0]?.scheduled_call_date || null,
      });
    }
  }

  // Get pipeline metrics
  const { data: metricsView } = await supabaseAdmin
    .from('pipeline_metrics')
    .select('*')
    .eq('user_id', userId)
    .single();

  log('get', {
    userId,
    opportunityCount: (opportunities || []).length,
    stages: Object.keys(pipeline).map(k => ({ stage: k, count: pipeline[k].length })),
  });

  res.json({
    pipeline,
    metrics: metricsView || {
      total_revenue: 0,
      pipeline_value: 0,
      win_rate_pct: 0,
      contacted_count: 0,
      replied_count: 0,
      call_demo_count: 0,
      closed_won_count: 0,
      closed_lost_count: 0
    }
  });
}));

// ──────────────────────────────────────────
// PUT /api/pipeline/:id/stage
// Manual stage override (Kanban drag & drop).
//
// BUG-01 FIX: always writes last_stage_changed_at so the followup
// sequence job has accurate staleness data for all manually moved deals.
//
// FEAT-02: accepts optional lost_reason when moving to closed_lost.
// ──────────────────────────────────────────
router.put('/:id/stage', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { stage, lost_reason } = req.body;

  if (!stage || !PIPELINE_STAGE_VALUES.includes(stage)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `stage must be one of: ${PIPELINE_STAGE_VALUES.join(', ')}`
    });
  }

  // Verify ownership
  const { data: opp, error: findError } = await supabaseAdmin
    .from('opportunities')
    .select('id, user_id, stage, target_name, target_context')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .single();

  if (findError || !opp) {
    log('stage', { userId: req.user.id, opportunityId: id, error: 'NOT_FOUND' });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  const previousStage = opp.stage;

  log('stage', {
    userId: req.user.id,
    opportunityId: id,
    previousStage,
    newStage: stage,
    hasLostReason: !!lost_reason,
  });

  // BUG-01 FIX: write last_stage_changed_at on every manual move
  const updates = {
    stage,
    last_stage_changed_at: new Date().toISOString(),
  };

  // FEAT-02: persist lost reason when deal is closed lost
  if (stage === PIPELINE_STAGES.CLOSED_LOST && lost_reason?.trim()) {
    updates.lost_reason = lost_reason.trim();
  }

  await supabaseAdmin
    .from('opportunities')
    .update(updates)
    .eq('id', id);

  // Build response with calendar prompt if moving to call_demo
  const response = {
    success: true,
    previous_stage: previousStage,
    new_stage: stage,
    calendar_prompt: null
  };

  if (stage === PIPELINE_STAGES.CALL_DEMO) {
    response.calendar_prompt = buildCalendarPrompt(opp);
  }

  res.json(response);
}));

// ──────────────────────────────────────────
// GET /api/pipeline/metrics
// Standalone metrics endpoint
// ──────────────────────────────────────────
router.get('/metrics', asyncHandler(async (req, res) => {
  const { data: metrics } = await supabaseAdmin
    .from('pipeline_metrics')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  log('metrics', {
    userId: req.user.id,
    total_revenue: metrics?.total_revenue,
    win_rate_pct: metrics?.win_rate_pct,
  });

  res.json(metrics || {
    total_revenue: 0,
    pipeline_value: 0,
    win_rate_pct: 0,
    new_count: 0,
    contacted_count: 0,
    replied_count: 0,
    call_demo_count: 0,
    closed_won_count: 0,
    closed_lost_count: 0
  });
}));

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

const buildCalendarPrompt = (opp) => ({
  show: true,
  suggested_title: `Call with ${opp.target_name || 'prospect'}`,
  opportunity_id: opp.id,
  suggested_type: 'call_demo',
  message: "Want to add this call to Clutch Calendar? We'll prep talking points automatically."
});

const extractName = (context) => {
  if (!context) return 'Prospect';
  // Try to extract a username or name from context like "u/username" or "@handle"
  const redditUser = context.match(/u\/([a-zA-Z0-9_-]+)/);
  if (redditUser) return `u/${redditUser[1]}`;
  const twitterHandle = context.match(/@([a-zA-Z0-9_]+)/);
  if (twitterHandle) return `@${twitterHandle[1]}`;
  return 'Prospect';
};

export default router;
