// src/routes/insights.js
// ============================================================
// INSIGHTS API — Premium Communication Intelligence Layer
//
// Routes:
//   GET  /api/insights/summary             — Dashboard summary widget data
//   GET  /api/insights/weekly              — Weekly prospect insights
//   POST /api/insights/weekly/dismiss/:id  — Dismiss a weekly insight
//   GET  /api/insights/signals/summary     — Signal counts for heat map
//   GET  /api/insights/commitments/summary — Overdue + due-soon count
//   GET  /api/insights/why-losing          — "Why You're Losing" AI report
//   GET  /api/insights/patterns            — All detected communication patterns
//   GET  /api/insights/skill-progression   — Weekly skill score chart data
//   GET  /api/insights/autopsies           — Paginated conversation autopsies
//   GET  /api/insights/autopsies/:id       — Single autopsy detail + rewrite
//   GET  /api/insights/objections          — Objection frequency tracker
//   POST /api/insights/analyze-message     — On-demand Pitch Diagnostic tool
//   GET  /api/insights/velocity            — Per-dimension week-over-week delta
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { PRO_MODEL } from '../services/groq.js';
import { runConversationAnalysis } from '../jobs/conversationAnalysisJob.js';
import { searchForChat, checkPerplexityUsage } from '../services/perplexity.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING UTILITIES
// Mirrors the pattern established in practice.js for consistency.
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
  console.log(`[Insights] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Insights] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Insights] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Insights] 🤖 AI [${fn}]${entries ? ` → ${entries}` : ''}`);
};

// ──────────────────────────────────────────
// GET /api/insights/summary
// Lightweight summary for the dashboard widget.
// Returns key metrics in a single fast call.
// ──────────────────────────────────────────
router.get('/summary', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('SUMMARY Request', { userId });

  logDB('SELECT parallel', 'communication_patterns + skill_progression + conversation_analyses', { userId, window: '30d' });

  const [patternsResult, progressResult, analysesResult] = await Promise.allSettled([
    supabaseAdmin
      .from('communication_patterns')
      .select('pattern_label, pattern_type, confidence_score, affected_outcome')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(3),

    supabaseAdmin
      .from('skill_progression')
      .select('composite_score_avg, composite_delta, top_weakness, top_strength, positive_outcome_rate, week_start')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(2),

    supabaseAdmin
      .from('conversation_analyses')
      .select('outcome, composite_score, created_at')
      .eq('user_id', userId)
      .not('outcome', 'is', null)  // FIX-02: exclude on-demand analyses (no outcome) from win-rate calc
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending: false }),
  ]);

  if (patternsResult.status === 'rejected') logError('SUMMARY/patterns query', patternsResult.reason, { userId });
  if (progressResult.status === 'rejected') logError('SUMMARY/skill_progression query', progressResult.reason, { userId });
  if (analysesResult.status === 'rejected') logError('SUMMARY/conversation_analyses query', analysesResult.reason, { userId });

  const patterns  = patternsResult.status  === 'fulfilled' ? patternsResult.value.data  || [] : [];
  const weeks     = progressResult.status  === 'fulfilled' ? progressResult.value.data  || [] : [];
  const analyses  = analysesResult.status  === 'fulfilled' ? analysesResult.value.data  || [] : [];

  const currentWeek   = weeks[0] || null;
  const positiveCount = analyses.filter(a => a.outcome === 'positive').length;
  const totalCount    = analyses.length;
  const positiveRate  = totalCount > 0 ? parseFloat((positiveCount / totalCount).toFixed(3)) : null;

  log('SUMMARY Response', {
    userId,
    patterns_count:    patterns.length,
    analyses_30d:      totalCount,
    positive_rate_30d: positiveRate,
    has_skill_data:    !!currentWeek,
    composite_score:   currentWeek?.composite_score_avg ?? null,
  });

  res.json({
    has_patterns:       patterns.length > 0,
    top_pattern:        patterns[0] || null,
    patterns_count:     patterns.length,
    composite_score:    currentWeek?.composite_score_avg || null,
    composite_delta:    currentWeek?.composite_delta || null,
    top_weakness:       currentWeek?.top_weakness || null,
    top_strength:       currentWeek?.top_strength || null,
    positive_rate_30d:  positiveRate,
    messages_analyzed:  totalCount,
    has_enough_data:    totalCount >= 3,
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/weekly
// Returns non-dismissed weekly prospect insights.
// ──────────────────────────────────────────
router.get('/weekly', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('WEEKLY INSIGHTS Request', { userId });

  logDB('SELECT', 'prospect_insights', { userId, filter: 'is_dismissed=false, not expired' });

  const { data: insights, error } = await supabaseAdmin
    .from('prospect_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    logError('WEEKLY INSIGHTS query', error, { userId });
    throw error;
  }

  log('WEEKLY INSIGHTS Response', { userId, count: insights?.length || 0 });
  res.json({ insights: insights || [] });
}));

// ──────────────────────────────────────────
// POST /api/insights/weekly/dismiss/:id
// ──────────────────────────────────────────
router.post('/weekly/dismiss/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  log('DISMISS INSIGHT Request', { userId, insightId: id });

  logDB('UPDATE', 'prospect_insights', { id, userId, is_dismissed: true });

  await supabaseAdmin
    .from('prospect_insights')
    .update({ is_dismissed: true })
    .eq('id', id)
    .eq('user_id', userId);

  log('DISMISS INSIGHT Done', { userId, insightId: id });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// GET /api/insights/signals/summary
// Signal counts for dashboard heat map
// ──────────────────────────────────────────
router.get('/signals/summary', asyncHandler(async (req, res) => {
  const userId     = req.user.id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo  = new Date(Date.now() -  7 * 86400000).toISOString();

  log('SIGNALS SUMMARY Request', { userId, window: '30d' });
  logDB('SELECT', 'conversation_signals', { userId, filter: 'is_active=true', since: thirtyDaysAgo });

  const { data: signals } = await supabaseAdmin
    .from('conversation_signals')
    .select('signal_type, prospect_id, detected_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('detected_at', thirtyDaysAgo);

  const summary = { buying: 0, risk: 0, timing: 0, engagement: 0 };
  (signals || []).forEach(s => {
    if (summary[s.signal_type] !== undefined) summary[s.signal_type]++;
  });

  // Hot prospects = those with buying signals in last 7 days
  const hotProspectIds = new Set(
    (signals || [])
      .filter(s => s.signal_type === 'buying' && s.detected_at > sevenDaysAgo)
      .map(s => s.prospect_id)
      .filter(Boolean)
  );

  log('SIGNALS SUMMARY Response', {
    userId,
    total_signals:   (signals || []).length,
    hot_prospects:   hotProspectIds.size,
    buying:          summary.buying,
    risk:            summary.risk,
    timing:          summary.timing,
    engagement:      summary.engagement,
  });

  res.json({
    signal_counts:    summary,
    hot_prospect_ids: [...hotProspectIds],
    total_signals:    (signals || []).length,
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/commitments/summary
// For dashboard — overdue + due-soon count
// ──────────────────────────────────────────
router.get('/commitments/summary', asyncHandler(async (req, res) => {
  const userId  = req.user.id;
  const today   = new Date().toISOString().split('T')[0];
  const twoDays = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

  log('COMMITMENTS SUMMARY Request', { userId, today });
  logDB('SELECT', 'conversation_commitments', { userId, owner: 'founder', status: 'pending|overdue' });

  const { data: commitments } = await supabaseAdmin
    .from('conversation_commitments')
    .select('status, due_date, owner')
    .eq('user_id', userId)
    .eq('owner', 'founder')
    .in('status', ['pending', 'overdue']);

  const overdue  = (commitments || []).filter(c => c.status === 'overdue' || (c.due_date && c.due_date < today)).length;
  const due_soon = (commitments || []).filter(c => c.due_date && c.due_date >= today && c.due_date <= twoDays).length;
  const pending  = (commitments || []).length - overdue - due_soon;

  log('COMMITMENTS SUMMARY Response', { userId, total: (commitments || []).length, overdue, due_soon, pending });
  res.json({ overdue, due_soon, pending, total: (commitments || []).length });
}));

// ──────────────────────────────────────────
// GET /api/insights/why-losing
// Generates the "Why You're Losing" AI intelligence report.
// Cached for 24h per user unless forced=true.
// ──────────────────────────────────────────
router.get('/why-losing', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const forced = req.query.forced === 'true';

  log('WHY-LOSING Request', { userId, forced });

  // FIX-05: guard forced refreshes — max 1 force per user per 15 minutes
  if (forced) {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    logDB('SELECT', 'growth_cards', { userId, generated_by: 'ai_why_losing_report', since: fifteenMinutesAgo, purpose: 'force_rate_limit_check' });

    const { data: recentForced } = await supabaseAdmin
      .from('growth_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('generated_by', 'ai_why_losing_report')
      .gte('created_at', fifteenMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (recentForced) {
      log('WHY-LOSING Force-Refresh Rate-Limited', { userId, reason: 'generated_within_15min' });

      // Still serve the latest cached version but tell the client it's rate-limited
      const { data: latest } = await supabaseAdmin
        .from('growth_cards')
        .select('metadata, created_at')
        .eq('user_id', userId)
        .eq('generated_by', 'ai_why_losing_report')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest?.metadata?.report) {
        log('WHY-LOSING Serving Cached Report (rate-limited)', { userId, cachedAt: latest.created_at });
        return res.json({ report: latest.metadata.report, cached: true, rate_limited: true });
      }
    }
  }

  // Check 24h cache (only for non-forced requests)
  if (!forced) {
    logDB('SELECT', 'growth_cards', { userId, generated_by: 'ai_why_losing_report', purpose: '24h_cache_check' });
    const { data: cached } = await supabaseAdmin
      .from('growth_cards')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('generated_by', 'ai_why_losing_report')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (cached?.metadata?.report) {
      log('WHY-LOSING Cache Hit', { userId, cachedAt: cached.created_at });
      return res.json({ report: cached.metadata.report, cached: true });
    }

    log('WHY-LOSING Cache Miss — Generating Fresh Report', { userId });
  }

  // Load all required data in parallel
  logDB('SELECT parallel', 'communication_patterns + conversation_analyses + skill_progression + objection_tracker', { userId });

  const [patternsResult, analysesResult, progressResult, objectionsResult] = await Promise.allSettled([
    supabaseAdmin
      .from('communication_patterns')
      .select('pattern_label, pattern_detail, pattern_type, confidence_score, recommendation, affected_outcome')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(5),

    supabaseAdmin
      .from('conversation_analyses')
      .select('outcome, outcome_note, failure_categories, hook_score, clarity_score, value_prop_score, personalization_score, cta_score, word_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),

    supabaseAdmin
      .from('skill_progression')
      .select('*')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(3),

    supabaseAdmin
      .from('objection_tracker')
      .select('objection_type, occurrence_count')
      .eq('user_id', userId)
      .order('occurrence_count', { ascending: false })
      .limit(5),
  ]);

  if (patternsResult.status   === 'rejected') logError('WHY-LOSING/patterns query',    patternsResult.reason,   { userId });
  if (analysesResult.status   === 'rejected') logError('WHY-LOSING/analyses query',    analysesResult.reason,   { userId });
  if (progressResult.status   === 'rejected') logError('WHY-LOSING/progression query', progressResult.reason,   { userId });
  if (objectionsResult.status === 'rejected') logError('WHY-LOSING/objections query',  objectionsResult.reason, { userId });

  const patterns   = patternsResult.status   === 'fulfilled' ? patternsResult.value.data   || [] : [];
  const analyses   = analysesResult.status   === 'fulfilled' ? analysesResult.value.data   || [] : [];
  const weeks      = progressResult.status   === 'fulfilled' ? progressResult.value.data   || [] : [];
  const objections = objectionsResult.status === 'fulfilled' ? objectionsResult.value.data || [] : [];

  const negativeAnalyses = analyses.filter(a => a.outcome === 'negative');
  const positiveAnalyses = analyses.filter(a => a.outcome === 'positive');
  const currentWeek      = weeks[0] || null;

  // FIX-06: hasEnoughData must be based on real-outcome analyses only (not on-demand Pitch Diagnostic runs)
  const outcomeAnalyses = analyses.filter(a => a.outcome != null);
  const hasEnoughData   = outcomeAnalyses.length >= 3;

  log('WHY-LOSING Data Loaded', {
    userId,
    patterns_count:    patterns.length,
    total_analyses:    outcomeAnalyses.length,
    negative_analyses: negativeAnalyses.length,
    positive_analyses: positiveAnalyses.length,
    objections_count:  objections.length,
    has_skill_data:    !!currentWeek,
    has_enough_data:   hasEnoughData,
  });

  if (!hasEnoughData) {
    log('WHY-LOSING Insufficient Data', { userId, analyses_count: outcomeAnalyses.length, minimum_required: 3 });
    return res.json({
      report: {
        primary_diagnosis: null,
        evidence_summary:  null,
        immediate_fix:     null,
        skill_to_focus:    null,
        encouraging_note:  "Log the outcomes of your outreach messages to unlock your personal communication analysis.",
        data_status:       'insufficient',
      },
      patterns:        [],
      has_enough_data: false,
      analyses_count:  outcomeAnalyses.length,
      analyses_needed: 3,
    });
  }

  // Build the AI report prompt
  const reportPrompt = buildWhyLosingPrompt(
    req.user, patterns, negativeAnalyses, positiveAnalyses, currentWeek, objections
  );

  logAI('callWithFallback/why-losing-report', {
    userId,
    model:          PRO_MODEL,
    negative_count: negativeAnalyses.length,
    positive_count: positiveAnalyses.length,
    patterns_count: patterns.length,
  });

  const { content, tokens_in, tokens_out } = await callWithFallback({
    systemPrompt: `You are a clear-eyed but empathetic sales communication coach.
Generate precise, evidence-based diagnoses for any type of seller — from solo freelancers and local vendors to high-ticket service providers.
Reference specific data points. Never give generic advice. Every recommendation must be immediately actionable.
Return ONLY valid JSON.`,
    messages: [{ role: 'user', content: reportPrompt }],
    temperature: 0.25,
    maxTokens: 600,
    modelName: PRO_MODEL,
  });

  await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);
  logAI('callWithFallback/why-losing-report DONE', { userId, tokens_in, tokens_out });

  let report;
  try {
    const clean = content.replace(/```json|```/g, '').trim();
    report = JSON.parse(clean);
    log('WHY-LOSING Report Parsed', { userId, skill_to_focus: report.skill_to_focus, data_status: report.data_status });
  } catch (parseErr) {
    logError('WHY-LOSING JSON parse', parseErr, { userId, contentPreview: content?.slice(0, 100) });
    report = {
      primary_diagnosis: 'Unable to generate analysis. Log more outreach outcomes for better insights.',
      evidence_summary:  null,
      immediate_fix:     null,
      skill_to_focus:    currentWeek?.top_weakness || null,
      encouraging_note:  'Every logged outcome makes your analysis more accurate.',
      data_status:       'parse_error',
    };
  }

  // Cache the report as a growth card metadata
  logDB('INSERT', 'growth_cards', { userId, generated_by: 'ai_why_losing_report', priority: 10 });
  await supabaseAdmin.from('growth_cards').insert({
    user_id:      userId,
    card_type:    'insight',
    title:        report.primary_diagnosis?.slice(0, 120) || 'Your Communication Analysis',
    body:         [report.evidence_summary, report.immediate_fix].filter(Boolean).join('\n\n'),
    action_label: 'Explore with Clutch AI',
    action_type:  'internal_chat',
    priority:     10,
    expires_at:   new Date(Date.now() + 7 * 86400000).toISOString(),
    generated_by: 'ai_why_losing_report',
    metadata:     { report }
  }).catch(err => logError('WHY-LOSING cache insert', err, { userId })); // Non-critical

  log('WHY-LOSING Report Generated and Cached', { userId, skill_to_focus: report.skill_to_focus });

  res.json({
    report,
    patterns,
    top_autopsies:   negativeAnalyses.slice(0, 3),
    skill_current:   currentWeek,
    has_enough_data: true,
    analyses_count:  outcomeAnalyses.length,
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/patterns
// All active communication patterns, sorted by confidence.
// ──────────────────────────────────────────
router.get('/patterns', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('PATTERNS Request', { userId });

  logDB('SELECT', 'communication_patterns', { userId, filter: 'is_active=true', order: 'confidence_score DESC' });

  const { data: patterns, error } = await supabaseAdmin
    .from('communication_patterns')
    .select('id, pattern_label, pattern_detail, pattern_type, confidence_score, recommendation, affected_outcome, occurrences, created_at')  // FIX-17: explicit columns instead of select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('confidence_score', { ascending: false });

  if (error) {
    logError('PATTERNS query', error, { userId });
    throw error;
  }

  log('PATTERNS Response', {
    userId,
    total:       patterns?.length || 0,
    has_patterns: (patterns?.length || 0) > 0,
    top_confidence: patterns?.[0]?.confidence_score ?? null,
  });

  res.json({
    patterns:     patterns || [],
    total:        patterns?.length || 0,
    has_patterns: (patterns?.length || 0) > 0,
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/skill-progression
// Weekly skill scores for chart rendering (last 12 weeks).
// ──────────────────────────────────────────
router.get('/skill-progression', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const limit  = Math.min(parseInt(req.query.limit) || 12, 24);

  log('SKILL-PROGRESSION Request', { userId, limit });

  // FIX-10: run both queries in parallel — they are independent
  logDB('SELECT parallel', 'skill_progression + user_skill_profile', { userId, limit });

  const [{ data: weeks, error }, { data: practiceHistory }] = await Promise.all([
    supabaseAdmin
      .from('skill_progression')
      .select('*')
      .eq('user_id', userId)
      .order('week_start', { ascending: true })
      .limit(limit),

    supabaseAdmin
      .from('user_skill_profile')
      .select('period_start, overall_avg, clarity_avg, value_avg, discovery_avg, objection_avg, brevity_avg, cta_avg, weakest_axis, strongest_axis')
      .eq('user_id', userId)
      .order('period_start', { ascending: true })
      .limit(limit),
  ]);

  if (error) {
    logError('SKILL-PROGRESSION query', error, { userId });
    throw error;
  }

  const currentWeek  = weeks?.[weeks.length - 1] || null;
  const previousWeek = weeks?.[weeks.length - 2] || null;

  log('SKILL-PROGRESSION Response', {
    userId,
    weeks_returned:       weeks?.length || 0,
    practice_periods:     practiceHistory?.length || 0,
    has_data:             (weeks?.length || 0) > 0,
    current_composite:    currentWeek?.composite_score_avg ?? null,
    composite_delta:      currentWeek?.composite_delta ?? null,
  });

  res.json({
    weeks:            weeks || [],
    practice_history: practiceHistory || [],
    current_week:     currentWeek,
    previous_week:    previousWeek,
    has_data:         (weeks?.length || 0) > 0,
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/autopsies
// Paginated list of conversation autopsies.
// ──────────────────────────────────────────
router.get('/autopsies', asyncHandler(async (req, res) => {
  const userId  = req.user.id;
  const limit   = parseInt(req.query.limit) || 20;
  const offset  = parseInt(req.query.offset) || 0;
  const outcome = req.query.outcome; // optional filter: 'positive' | 'negative'

  log('AUTOPSIES Request', { userId, limit, offset, outcome: outcome || 'all' });

  // Validate outcome filter
  if (outcome && outcome !== 'positive' && outcome !== 'negative') {
    log('AUTOPSIES Validation Failed', { userId, reason: 'invalid_outcome_filter', provided: outcome });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: "outcome filter must be 'positive' or 'negative'",
    });
  }

  logDB('SELECT', 'conversation_analyses', { userId, outcome: outcome || 'all', limit, offset });

  let query = supabaseAdmin
    .from('conversation_analyses')
    .select('id, outcome, outcome_note, platform, hook_score, clarity_score, value_prop_score, personalization_score, cta_score, tone_score, composite_score, word_count, failure_categories, success_signals, analysis_text, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (outcome === 'positive' || outcome === 'negative') {
    query = query.eq('outcome', outcome);
  }

  const { data: autopsies, error } = await query;
  if (error) {
    logError('AUTOPSIES query', error, { userId });
    throw error;
  }

  // FIX-03: apply the same outcome filter to the count query so total/has_more are accurate
  logDB('SELECT count', 'conversation_analyses', { userId, outcome: outcome || 'all', purpose: 'pagination' });

  let countQuery = supabaseAdmin
    .from('conversation_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (outcome === 'positive' || outcome === 'negative') {
    countQuery = countQuery.eq('outcome', outcome);
  }

  const { count } = await countQuery;

  log('AUTOPSIES Response', {
    userId,
    returned:  autopsies?.length || 0,
    total:     count || 0,
    has_more:  (count || 0) > offset + limit,
    offset,
    outcome:   outcome || 'all',
  });

  res.json({
    autopsies:   autopsies || [],
    total:       count || 0,
    has_more:    (count || 0) > offset + limit,
    has_data:    (count || 0) > 0,
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/autopsies/:id
// Full autopsy detail including rewritten message.
// Feature 7: Cross-references matching practice sessions so the founder
// can see "You practiced this exact scenario and scored X/100."
// ──────────────────────────────────────────
router.get('/autopsies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  log('AUTOPSY DETAIL Request', { userId, autopsyId: id });

  logDB('SELECT', 'conversation_analyses', { id, userId });
  const { data: autopsy, error } = await supabaseAdmin
    .from('conversation_analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !autopsy) {
    log('AUTOPSY DETAIL Not Found', { userId, autopsyId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Autopsy not found' });
  }

  log('AUTOPSY DETAIL Loaded', {
    userId,
    autopsyId:       id,
    outcome:         autopsy.outcome,
    composite_score: autopsy.composite_score,
    platform:        autopsy.platform,
    has_opportunity: !!autopsy.opportunity_id,
    failure_count:   (autopsy.failure_categories || []).length,
  });

  // Load the original opportunity for context
  let opportunity = null;
  if (autopsy.opportunity_id) {
    logDB('SELECT', 'opportunities', { id: autopsy.opportunity_id, purpose: 'autopsy_context' });
    const { data: opp } = await supabaseAdmin
      .from('opportunities')
      .select('target_context, target_name, platform, source_url')
      .eq('id', autopsy.opportunity_id)
      .single();
    opportunity = opp;
    log('AUTOPSY DETAIL Opportunity Loaded', { userId, autopsyId: id, hasOpportunity: !!opp });
  }

  // ── Feature 7: Practice Session Cross-Reference ─────────────────────────
  // Map the outcome/objection type to the most relevant practice scenario type.
  // If the user has practiced that scenario, surface their best score + the
  // AI's top coaching recommendation from that session.
  let practice_context = null;

  const OBJECTION_TO_SCENARIO = {
    price:       'price_objection',
    trust:       'skeptical',
    timing:      'not_right_time',
    ghost:       'ghost',
    fit:         'polite_decline',
    competition: 'skeptical',
    other:       null,
  };

  // Derive which scenario matches this autopsy (from failure_categories or outcome_note)
  const failCats = autopsy.failure_categories || [];
  let targetScenario = null;

  if (failCats.includes('no_response') || autopsy.outcome === 'ghost') {
    targetScenario = 'ghost';
  } else if (failCats.some(c => ['price_objection', 'too_expensive'].includes(c))) {
    targetScenario = 'price_objection';
  } else if (failCats.some(c => ['trust', 'skeptical', 'credibility'].includes(c))) {
    targetScenario = 'skeptical';
  } else if (failCats.some(c => ['timing', 'not_right_time'].includes(c))) {
    targetScenario = 'not_right_time';
  }

  log('AUTOPSY DETAIL Scenario Mapping', {
    userId,
    autopsyId:      id,
    fail_cats:      failCats.join(',') || 'none',
    target_scenario: targetScenario || 'none_matched',
  });

  if (targetScenario) {
    logDB('SELECT', 'practice_sessions', { userId, scenario_type: targetScenario, purpose: 'cross_reference', limit: 5 });

    const { data: practiceSessions } = await supabaseAdmin
      .from('practice_sessions')
      .select('id, scenario_type, skill_scores, session_debrief, coaching_annotations, created_at')
      .eq('user_id', userId)
      .eq('scenario_type', targetScenario)
      .eq('completed', true)
      .not('skill_scores', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (practiceSessions?.length) {
      const scores = practiceSessions.map(s => s.skill_scores?.session_score).filter(Boolean);
      const bestSession = practiceSessions.reduce((best, s) =>
        (s.skill_scores?.session_score || 0) > (best.skill_scores?.session_score || 0) ? s : best
      , practiceSessions[0]);
      const avgScore = scores.length ? parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : null;

      // Pull the most actionable coaching recommendation from the best session
      const topCoachingNote = bestSession?.session_debrief?.coachable_moment
        || bestSession?.coaching_annotations?.[0]?.feedback
        || null;

      practice_context = {
        scenario_type:     targetScenario,
        sessions_count:    practiceSessions.length,
        avg_score:         avgScore,
        best_score:        bestSession?.skill_scores?.session_score || null,
        best_session_id:   bestSession?.id || null,
        top_coaching_note: topCoachingNote,
        improvement_trend: scores.length >= 2
          ? parseFloat((scores[0] - scores[scores.length - 1]).toFixed(1))
          : null,
        message: avgScore !== null
          ? `You've practiced this scenario ${practiceSessions.length} time${practiceSessions.length > 1 ? 's' : ''} and averaged ${avgScore}/100. ${avgScore < 60 ? 'This is an active gap — more practice here will directly lift your real-world conversion.' : 'Your practice scores are solid. Focus on applying the opening reframe below.'}`
          : null,
      };

      log('AUTOPSY DETAIL Practice Cross-Reference Found', {
        userId,
        autopsyId:      id,
        scenario:       targetScenario,
        sessions_count: practiceSessions.length,
        avg_score:      avgScore,
        best_score:     practice_context.best_score,
      });
    } else {
      // User has NOT practiced this scenario yet — prompt them to
      practice_context = {
        scenario_type:  targetScenario,
        sessions_count: 0,
        avg_score:      null,
        message:        `You haven't practiced the ${targetScenario.replace(/_/g, ' ')} scenario yet. Starting a session would directly target this exact failure pattern.`,
        cta_practice:   true,
      };

      log('AUTOPSY DETAIL No Practice Found', { userId, autopsyId: id, scenario: targetScenario });
    }
  }

  log('AUTOPSY DETAIL Response', {
    userId,
    autopsyId:       id,
    has_opportunity: !!opportunity,
    has_practice_ctx: !!practice_context,
    scenario_matched: targetScenario || 'none',
  });

  res.json({
    autopsy,
    opportunity:      opportunity || null,
    practice_context,               // null if no matching scenario could be inferred
  });
}));

// ──────────────────────────────────────────
// GET /api/insights/objections
// Objection frequency tracker.
// Weakness 10: For the user's #1 objection type, fetches Perplexity-powered
// market intelligence about how founders in similar markets handle it.
// Cached 7 days on the objection_tracker row (best_response field).
// ──────────────────────────────────────────
router.get('/objections', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('OBJECTIONS Request', { userId, tier: req.user.tier || 'free' });

  logDB('SELECT', 'objection_tracker', { userId, order: 'occurrence_count DESC' });
  const { data: objections, error } = await supabaseAdmin
    .from('objection_tracker')
    .select('*')
    .eq('user_id', userId)
    .order('occurrence_count', { ascending: false });

  if (error) {
    logError('OBJECTIONS query', error, { userId });
    throw error;
  }

  // Load practice scores for each objection type
  logDB('SELECT', 'practice_sessions', { userId, filter: 'completed=true, has_skill_scores', limit: 50 });

  const { data: practiceByType } = await supabaseAdmin
    .from('practice_sessions')
    .select('scenario_type, skill_scores')
    .eq('user_id', userId)
    .eq('completed', true)
    .not('skill_scores', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const SCENARIO_TO_OBJECTION = {
    price_objection: 'price',
    skeptical:       'trust',
    not_right_time:  'timing',
    ghost:           'ghost',
    polite_decline:  'other',
  };

  const practiceScopeMap = {};
  (practiceByType || []).forEach(s => {
    const objType = SCENARIO_TO_OBJECTION[s.scenario_type];
    if (objType && s.skill_scores?.session_score != null) {
      if (!practiceScopeMap[objType]) practiceScopeMap[objType] = [];
      practiceScopeMap[objType].push(s.skill_scores.session_score);
    }
  });

  const enrichedObjections = (objections || []).map(obj => {
    const practiceScores = practiceScopeMap[obj.objection_type] || [];
    const avgPracticeScore = practiceScores.length
      ? parseFloat((practiceScores.reduce((s, v) => s + v, 0) / practiceScores.length).toFixed(1))
      : null;
    return { ...obj, practice_sessions_count: practiceScores.length, avg_practice_score: avgPracticeScore };
  });

  log('OBJECTIONS Data Loaded', {
    userId,
    objection_types:   enrichedObjections.length,
    top_objection:     enrichedObjections[0]?.objection_type || 'none',
    top_count:         enrichedObjections[0]?.occurrence_count || 0,
    practice_sessions: practiceByType?.length || 0,
  });

  // ── Weakness 10: Perplexity market intel for #1 objection ────────────────
  // Pro users only. Cached 7 days in best_response with '[MARKET]' prefix.
  let market_intel = null;
  const topObj = enrichedObjections[0];

  if (topObj && req.user.tier === 'pro') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    // FIX-09: use market_intel_generated_at instead of last_seen_at.
    // last_seen_at resets whenever a new objection of this type is logged,
    // which made the market intel cache effectively immortal for active users.
    const cachedIntel = topObj.best_response?.startsWith('[MARKET]')
      && topObj.market_intel_generated_at && new Date(topObj.market_intel_generated_at) > sevenDaysAgo;

    if (cachedIntel) {
      log('OBJECTIONS Market Intel Cache Hit', { userId, objection_type: topObj.objection_type, generatedAt: topObj.market_intel_generated_at });
      try {
        const parsed = JSON.parse(topObj.best_response.replace('[MARKET]', '').trim());
        market_intel = { objection_type: topObj.objection_type, ...parsed, cached: true };
      } catch (parseErr) {
        logError('OBJECTIONS market intel cache parse', parseErr, { userId, objection_type: topObj.objection_type });
      }
    } else {
      log('OBJECTIONS Market Intel Cache Miss — Checking Perplexity Quota', { userId, objection_type: topObj.objection_type });

      const usageCheck = await checkPerplexityUsage(userId, 'pro').catch(() => ({ allowed: false }));
      log('OBJECTIONS Perplexity Usage Check', { userId, allowed: usageCheck.allowed, reason: usageCheck.reason || 'ok' });

      if (usageCheck.allowed) {
        try {
          logDB('SELECT', 'users', { userId, purpose: 'market_intel_context' });
          const { data: user } = await supabaseAdmin.from('users')
            .select('product_description, target_audience, industry').eq('id', userId).single();

          const query = `How do successful ${user?.industry || 'B2B SaaS'} sellers handle "${topObj.objection_type}" objections in outreach to ${user?.target_audience || 'customers'}? Specific response frameworks that convert.`;

          log('OBJECTIONS Perplexity Search', { userId, objection_type: topObj.objection_type, queryLen: query.length });

          // FIX-18: race the Perplexity call against an 8s timeout so a hung request
          // doesn't block the entire /objections response for minutes
          const perplexityTimeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Perplexity timeout')), 8000)
          );
          const { content: perpResult } = await Promise.race([
            searchForChat(query,
              'Find specific tactical objection-handling frameworks used by successful sellers in this market. Focus on what actually works.'
            ),
            perplexityTimeout,
          ]);

          if (perpResult) {
            log('OBJECTIONS Perplexity Search Success', { userId, objection_type: topObj.objection_type, resultLen: perpResult.length });

            logAI('callWithFallback/market-intel-distill', { userId, objection_type: topObj.objection_type });
            const { content: distilled, tokens_in, tokens_out } = await callWithFallback({
              systemPrompt: 'Distill into 2-3 specific tactical objection-handling responses a founder can use verbatim. Return only JSON: {"bullets": ["...", "..."], "summary": "one sentence on the pattern that works"}. No markdown.',
              messages: [{ role: 'user', content: `Objection: ${topObj.objection_type}\nMarket: selling ${user?.product_description?.slice(0, 100) || 'software'} to ${user?.target_audience?.slice(0, 100) || 'SMBs'}\n\nResearch:\n${perpResult.slice(0, 1200)}` }],
              temperature: 0.2,
              maxTokens:   350,
            });
            await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);
            logAI('callWithFallback/market-intel-distill DONE', { userId, tokens_in, tokens_out });

            try {
              const parsed = JSON.parse(distilled.replace(/```json|```/g, '').trim());
              market_intel = { objection_type: topObj.objection_type, ...parsed, cached: false };

              // FIX-09: stamp market_intel_generated_at so cache expiry is isolated from objection activity
              logDB('UPDATE', 'objection_tracker', { id: topObj.id, userId, action: 'cache_market_intel' });
              await supabaseAdmin.from('objection_tracker')
                .update({
                  best_response:             `[MARKET]${JSON.stringify(parsed)}`,
                  market_intel_generated_at: new Date().toISOString(),
                })
                .eq('id', topObj.id).catch(err => logError('OBJECTIONS cache update', err, { userId, objectionId: topObj.id }));

              log('OBJECTIONS Market Intel Generated and Cached', { userId, objection_type: topObj.objection_type });
            } catch (parseErr) {
              logError('OBJECTIONS market intel distill parse', parseErr, { userId, objection_type: topObj.objection_type });
            }
          }
        } catch (err) {
          logError('OBJECTIONS Perplexity enrichment', err, { userId, objection_type: topObj.objection_type });
        }
      } else {
        log('OBJECTIONS Market Intel Skipped — Quota Exhausted', { userId, reason: usageCheck.reason });
      }
    }
  } else if (topObj && req.user.tier !== 'pro') {
    log('OBJECTIONS Market Intel Skipped — Free Tier', { userId, tier: req.user.tier || 'free' });
  }

  log('OBJECTIONS Response', {
    userId,
    objection_types: enrichedObjections.length,
    has_market_intel: !!market_intel,
    market_intel_cached: market_intel?.cached ?? null,
  });

  res.json({
    objections:    enrichedObjections,
    total_types:   enrichedObjections.length,
    top_objection: enrichedObjections[0] || null,
    market_intel,  // null for free users / Perplexity unavailable
  });
}));

// ──────────────────────────────────────────
// POST /api/insights/analyze-message
// On-demand Pitch Diagnostic tool.
// Analyzes any message the user pastes in.
// Rate limited to 10 per user per hour.
// ──────────────────────────────────────────
router.post('/analyze-message', asyncHandler(async (req, res) => {
  const { message, platform, prospect_context, outcome_context } = req.body;
  const userId = req.user.id;

  log('ANALYZE-MESSAGE Request', {
    userId,
    platform:         platform || 'unknown',
    message_len:      message?.length || 0,
    has_prospect_ctx: !!prospect_context,
    has_outcome_ctx:  !!outcome_context,
  });

  // ── Input validation ────────────────────────────────────────────────────
  if (!message?.trim() || message.trim().length < 20) {
    log('ANALYZE-MESSAGE Validation Failed', { userId, reason: 'message_too_short', len: message?.length || 0 });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'Message must be at least 20 characters'
    });
  }

  // FIX-11: reject oversized inputs — prevents token abuse and AI timeouts
  if (message.trim().length > 3000) {
    log('ANALYZE-MESSAGE Validation Failed', { userId, reason: 'message_too_long', len: message.trim().length });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'Message is too long. Please paste a single outreach message (max 3000 characters).'
    });
  }

  // ── Rate limit check: max 10 on-demand analyses per hour ────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  logDB('SELECT count', 'conversation_analyses', { userId, feedback_id: 'null', since: oneHourAgo, purpose: 'rate_limit_check' });

  const { count: recentCount } = await supabaseAdmin
    .from('conversation_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('feedback_id', null) // on-demand analyses have no feedback_id
    .gte('created_at', oneHourAgo);

  if ((recentCount || 0) >= 10) {
    log('ANALYZE-MESSAGE Rate Limited', { userId, recent_count: recentCount, limit: 10, window: '1h' });
    return res.status(429).json({
      error:   'RATE_LIMIT',
      message: 'Too many on-demand analyses. Please wait a few minutes.'
    });
  }

  log('ANALYZE-MESSAGE Rate Limit OK', { userId, recent_count: recentCount || 0, remaining: 10 - (recentCount || 0) });

  // ── Pre-compute structural metadata ─────────────────────────────────────
  const wordCount    = message.trim().split(/\s+/).length;
  const sentences    = message.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const selfRefCount = sentences.filter(s => /^\s*(i |we |our |my )/i.test(s)).length;
  const selfRefRatio = sentences.length > 0 ? +(selfRefCount / sentences.length).toFixed(3) : 0;

  log('ANALYZE-MESSAGE Pre-computed Metadata', {
    userId,
    word_count:       wordCount,
    sentence_count:   sentences.length,
    self_ref_ratio:   selfRefRatio,
  });

  const prompt = `Analyze this outreach message for a seller. Be specific — quote phrases from the message when explaining scores.

SELLER:
Product/Service: ${req.user.product_description || 'not specified'}
Target customers: ${req.user.target_audience || 'not specified'}

PLATFORM: ${platform || 'unknown'}
${prospect_context ? `PROSPECT CONTEXT: ${prospect_context.slice(0, 400)}` : ''}
${outcome_context ? `OUTCOME CONTEXT: ${outcome_context}` : ''}

MESSAGE (${wordCount} words):
"${message}"

Pre-computed: word count = ${wordCount}, self-referential ratio = ${selfRefRatio}

Score 0–10 per dimension (integers). Be critical.

Return ONLY this JSON:
{
  "hook_score": 0-10,
  "clarity_score": 0-10,
  "value_prop_score": 0-10,
  "personalization_score": 0-10,
  "cta_score": 0-10,
  "tone_score": 0-10,
  "composite_score": weighted_average_0_to_10,
  "word_count": ${wordCount},
  "self_referential_ratio": ${selfRefRatio},
  "has_social_proof": true_or_false,
  "has_specific_ask": true_or_false,
  "failure_categories": ["weak_hook"|"no_value_proof"|"too_generic"|"too_long"|"unclear_ask"|"feature_not_outcome"|"wrong_tone"|"over_explained"|"self_focused"|"no_personalization"|"no_social_proof"|"weak_cta"],
  "success_signals": ["what works"],
  "analysis_text": "2-3 sentences. Specific. Quote exact phrases. Explain why.",
  "line_annotations": [
    {"phrase": "exact quoted phrase from message", "issue": "what's wrong with it", "fix": "how to rewrite it"}
  ],
  "improvement_suggestions": [
    {"priority": 1, "dimension": "hook", "suggestion": "specific instruction", "example": "rewritten element"}
  ],
  "rewritten_message": "Full improved version. Max 120 words. Score 8+."
}`;

  logAI('callWithFallback/analyze-message', { userId, model: PRO_MODEL, word_count: wordCount, platform: platform || 'unknown' });

  const { content, tokens_in, tokens_out } = await callWithFallback({
    systemPrompt: 'You are an elite sales communication analyst. Return only JSON. No markdown.',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.15,
    maxTokens: 1400,
    modelName: PRO_MODEL,
  });

  await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);
  logAI('callWithFallback/analyze-message DONE', { userId, tokens_in, tokens_out });

  let analysis;
  try {
    const clean = content.replace(/```json|```/g, '').trim();
    analysis = JSON.parse(clean);
    log('ANALYZE-MESSAGE AI Response Parsed', {
      userId,
      composite_score:    analysis.composite_score,
      failure_categories: (analysis.failure_categories || []).join(',') || 'none',
      has_rewrite:        !!analysis.rewritten_message,
      annotations_count:  (analysis.line_annotations || []).length,
    });
  } catch (parseErr) {
    logError('ANALYZE-MESSAGE JSON parse', parseErr, { userId, contentPreview: content?.slice(0, 100) });
    return res.status(500).json({ error: 'ANALYSIS_FAILED', message: 'Could not analyze message. Please try again.' });
  }

  // Store as on-demand analysis (no feedback_id or opportunity_id)
  logDB('INSERT', 'conversation_analyses', { userId, source: 'on_demand', platform: platform || null });

  await supabaseAdmin.from('conversation_analyses').insert({
    user_id:                 userId,
    opportunity_id:          null,
    feedback_id:             null,
    message_text:            message,
    outcome:                 null,
    platform:                platform || null,
    hook_score:              analysis.hook_score,
    clarity_score:           analysis.clarity_score,
    value_prop_score:        analysis.value_prop_score,
    personalization_score:   analysis.personalization_score,
    cta_score:               analysis.cta_score,
    tone_score:              analysis.tone_score,
    composite_score:         analysis.composite_score,
    word_count:              wordCount,
    self_referential_ratio:  selfRefRatio,
    has_social_proof:        !!analysis.has_social_proof,
    has_specific_ask:        !!analysis.has_specific_ask,
    failure_categories:      analysis.failure_categories || [],
    success_signals:         analysis.success_signals || [],
    analysis_text:           analysis.analysis_text || null,
    improvement_suggestions: analysis.improvement_suggestions || [],
    rewritten_message:       analysis.rewritten_message || null,
    analysis_model:          'groq_pro',
  }).catch(err => logError('ANALYZE-MESSAGE DB insert', err, { userId })); // Non-critical — don't block the response

  log('ANALYZE-MESSAGE Complete', { userId, composite_score: analysis.composite_score, word_count: wordCount });
  res.json({ analysis });
}));

// ──────────────────────────────────────────
// GET /api/insights/velocity
// Per-dimension week-over-week delta.
// Reads the last 2 skill_progression rows and
// computes the change for all 6 dimensions +
// composite. No AI — pure arithmetic. Fast.
// ──────────────────────────────────────────
router.get('/velocity', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('VELOCITY Request', { userId });

  logDB('SELECT', 'skill_progression', { userId, limit: 4, order: 'week_start DESC' });

  const { data: weeks, error } = await supabaseAdmin
    .from('skill_progression')
    .select(
      'week_start, composite_score_avg, hook_score_avg, clarity_score_avg, ' +
      'value_prop_score_avg, personalization_score_avg, cta_score_avg, tone_score_avg, ' +
      'top_weakness, top_strength, composite_delta'
    )
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(4); // 4 weeks lets us spot trends beyond just last-week delta

  if (error) {
    logError('VELOCITY query', error, { userId });
    throw error;
  }

  if (!weeks || weeks.length < 2) {
    log('VELOCITY Insufficient Data', { userId, weeks_available: weeks?.length || 0, minimum_required: 2 });
    return res.json({
      has_data:        false,
      weeks_available: weeks?.length || 0,
      message:         'At least 2 weeks of data required to compute velocity.',
    });
  }

  const current  = weeks[0];
  const previous = weeks[1];

  const DIMENSIONS = [
    { key: 'hook',            field: 'hook_score_avg' },
    { key: 'clarity',         field: 'clarity_score_avg' },
    { key: 'value_prop',      field: 'value_prop_score_avg' },
    { key: 'personalization', field: 'personalization_score_avg' },
    { key: 'cta',             field: 'cta_score_avg' },
    { key: 'tone',            field: 'tone_score_avg' },
  ];

  const deltas = {};
  let biggestGain = null;  // { key, delta }
  let biggestDrop = null;  // { key, delta }

  for (const { key, field } of DIMENSIONS) {
    const curr = current[field];
    const prev = previous[field];

    if (curr == null || prev == null) {
      deltas[key] = null;
      continue;
    }

    const delta = parseFloat((curr - prev).toFixed(2));
    deltas[key] = { current: curr, previous: prev, delta };

    if (delta > 0 && (biggestGain === null || delta > biggestGain.delta)) {
      biggestGain = { key, delta };
    }
    if (delta < 0 && (biggestDrop === null || delta < biggestDrop.delta)) {
      biggestDrop = { key, delta };
    }
  }

  const compositeDelta = current.composite_delta ??
    (current.composite_score_avg != null && previous.composite_score_avg != null
      ? parseFloat((current.composite_score_avg - previous.composite_score_avg).toFixed(2))
      : null);

  // Directional status: improving / declining / mixed / stable
  const nonNullDeltas  = Object.values(deltas).filter(d => d != null).map(d => d.delta);
  const positiveCount  = nonNullDeltas.filter(d => d > 0.05).length;
  const negativeCount  = nonNullDeltas.filter(d => d < -0.05).length;

  let trend_status = 'stable';
  if (positiveCount >= 4)                           trend_status = 'improving';
  else if (negativeCount >= 4)                      trend_status = 'declining';
  else if (positiveCount > negativeCount)           trend_status = 'mixed_positive';
  else if (negativeCount > positiveCount)           trend_status = 'mixed_negative';

  // Human-readable summary sentence
  const LABEL = {
    hook: 'Hook', clarity: 'Clarity', value_prop: 'Value Prop',
    personalization: 'Personalization', cta: 'CTA', tone: 'Tone',
  };

  let summary = null;
  if (biggestGain && biggestDrop) {
    summary = `${LABEL[biggestGain.key]} improved the most (+${biggestGain.delta.toFixed(1)}) while ${LABEL[biggestDrop.key]} dropped the most (${biggestDrop.delta.toFixed(1)}).`;
  } else if (biggestGain) {
    summary = `${LABEL[biggestGain.key]} improved the most this week (+${biggestGain.delta.toFixed(1)}).`;
  } else if (biggestDrop) {
    summary = `${LABEL[biggestDrop.key]} had the sharpest drop this week (${biggestDrop.delta.toFixed(1)}).`;
  } else {
    summary = 'All dimensions were stable compared to last week.';
  }

  log('VELOCITY Response', {
    userId,
    current_week:    current.week_start,
    previous_week:   previous.week_start,
    composite_delta: compositeDelta,
    trend_status,
    biggest_gain:    biggestGain ? `${biggestGain.key} +${biggestGain.delta}` : 'none',
    biggest_drop:    biggestDrop ? `${biggestDrop.key} ${biggestDrop.delta}` : 'none',
    top_weakness:    current.top_weakness,
  });

  res.json({
    has_data:          true,
    current_week:      current.week_start,
    previous_week:     previous.week_start,
    composite_delta:   compositeDelta,
    composite_current: current.composite_score_avg,
    trend_status,
    summary,
    biggest_gain:      biggestGain,
    biggest_drop:      biggestDrop,
    dimensions:        deltas,
    top_weakness:      current.top_weakness,
    top_strength:      current.top_strength,
  });
}));

// ──────────────────────────────────────────
// WHY LOSING PROMPT BUILDER
// ──────────────────────────────────────────
const buildWhyLosingPrompt = (user, patterns, negativeAnalyses, positiveAnalyses, currentWeek, objections) => {
  const avgScore = (arr, field) => {
    const vals = arr.filter(a => a[field] != null).map(a => a[field]);
    return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : 'N/A';
  };

  const failureFreq = {};
  negativeAnalyses.forEach(a => {
    (a.failure_categories || []).forEach(cat => {
      failureFreq[cat] = (failureFreq[cat] || 0) + 1;
    });
  });
  const topFailures = Object.entries(failureFreq).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // FIX-19: business-neutral language — "seller" not "founder", "customers" not "SMBs"
  return `Generate a "Why You're Losing Sales" intelligence report for this seller.

SELLER:
Product/Service: ${user.product_description || 'not specified'}
Target customers: ${user.target_audience || 'not specified'}

DATA SUMMARY:
Total messages analyzed: ${negativeAnalyses.length + positiveAnalyses.length}
Positive outcomes: ${positiveAnalyses.length} | Negative outcomes: ${negativeAnalyses.length}
Positive rate: ${negativeAnalyses.length + positiveAnalyses.length > 0 ? Math.round(positiveAnalyses.length / (positiveAnalyses.length + negativeAnalyses.length) * 100) : 0}%

LOSING MESSAGE SCORES:
Hook: ${avgScore(negativeAnalyses, 'hook_score')}/10 | Clarity: ${avgScore(negativeAnalyses, 'clarity_score')}/10
Value Prop: ${avgScore(negativeAnalyses, 'value_prop_score')}/10 | Personalization: ${avgScore(negativeAnalyses, 'personalization_score')}/10
CTA: ${avgScore(negativeAnalyses, 'cta_score')}/10 | Tone: ${avgScore(negativeAnalyses, 'tone_score')}/10

WINNING MESSAGE SCORES (for comparison):
Hook: ${avgScore(positiveAnalyses, 'hook_score')}/10 | Clarity: ${avgScore(positiveAnalyses, 'clarity_score')}/10
Value Prop: ${avgScore(positiveAnalyses, 'value_prop_score')}/10 | Personalization: ${avgScore(positiveAnalyses, 'personalization_score')}/10
CTA: ${avgScore(positiveAnalyses, 'cta_score')}/10 | Tone: ${avgScore(positiveAnalyses, 'tone_score')}/10

TOP FAILURE PATTERNS:
${topFailures.map(([cat, count]) => `${cat}: ${count}x`).join(', ') || 'none'}

TOP OBJECTIONS RECEIVED:
${objections.slice(0, 3).map(o => `${o.objection_type}: ${o.occurrence_count}x`).join(', ') || 'none logged'}

DETECTED COMMUNICATION PATTERNS:
${patterns.slice(0, 3).map(p => `• ${p.pattern_label}: ${p.pattern_detail}`).join('\n') || 'none yet'}

CURRENT SKILL SNAPSHOT:
${currentWeek ? `Composite: ${currentWeek.composite_score_avg}/10 | Weakness: ${currentWeek.top_weakness} | Change: ${currentWeek.composite_delta > 0 ? '+' : ''}${currentWeek.composite_delta || 0}` : 'No data'}

Based on this data, generate a precise diagnostic report.

Return ONLY this JSON:
{
  "primary_diagnosis": "1 sentence — the single root cause causing the most losses, citing a specific score or pattern",
  "evidence_summary": "2 sentences — what data proves this diagnosis. Use specific numbers.",
  "immediate_fix": "1 concrete action to take today. Not vague. Very specific to their data.",
  "skill_to_focus": "hook | clarity | value_prop | personalization | cta | tone — the dimension with highest ROI",
  "encouraging_note": "1 sentence — genuine, specific encouragement based on the actual data (not generic)",
  "data_status": "sufficient"
}`;
};

export default router;
