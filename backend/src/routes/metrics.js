// src/routes/metrics.js
// ============================================================
// METRICS API
//
// GET /dashboard            — core stats from authoritative source tables
// GET /momentum             — momentum score with unified breakdown
// GET /intelligence         — AI-generated insights (server-side cached 4h)
// GET /communication-snapshot — message quality analysis
// GET /milestones           — business milestones achieved
// GET /learning             — practice/learning progress
// GET /behavioral-insights  — rule-based behavioral insights (retained for completeness)
// GET /usage                — token usage only
//
// AUDIT FIXES (2025):
//  A-01 computeMomentumScore now returns {score, breakdown} — breakdown bars
//       always match the displayed score (previously used different formulas).
//  A-02 buildChartData now correctly prefers live opp_sent over stale
//       daily_metrics.messages_sent.
//  A-03 /learning now fetches descending; best_score uses a separate MAX query
//       so it is always correct regardless of session count.
//  A-04 /communication-snapshot now computes composite_score inline from live
//       dimension averages rather than reading the stale weekly job snapshot.
//  A-05 /momentum: prevWeekOpps moved into the initial Promise.all (was sequential).
//  A-06 /intelligence now uses a per-user in-memory cache (4 h TTL) to avoid
//       firing an AI call on every non-cached page load.
//  A-07 outreachStreak now derived from the opportunities table (consistent with
//       the broader fix to stop relying on daily_metrics).
//  A-08 getUsageSummary removed from /dashboard — dashboard no longer calls it;
//       the dedicated /usage endpoint + useTokenUsage hook handle it exclusively.
//  A-09 Stale daily_metrics error-objects and pipeline_metrics errors are now
//       logged so silent failures are visible in server logs.
//  A-10 positive_rate clamped to [0, 1] on every read to guard against bad data.
//  A-11 Dead /behavioral-insights route and its helper removed.
//  A-12 Business-neutral language applied throughout: no assumption of enterprise
//       deals; wording works for any seller type.
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage, getUsageSummary } from '../services/tokenTracker.js';

const router = Router();

// ──────────────────────────────────────────
// LOGGING UTILITY  (mirrors practice.js style)
// ──────────────────────────────────────────
const log = (event, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => {
      if (v === null || v === undefined) return null;
      return `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`;
    })
    .filter(Boolean)
    .join(' ');
  console.log(`[Metrics] ${event}${parts ? ` → ${parts}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Metrics] ❌ ${fn} — ${err?.message || err}${parts ? ` | ${parts}` : ''}`);
};

const logDB = (op, table, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Metrics] 🗄️  DB ${op} → table=${table}${parts ? ` ${parts}` : ''}`);
};

// ──────────────────────────────────────────
// IN-MEMORY INTELLIGENCE CACHE  (A-06)
// Keyed by userId. Entries expire after INTELLIGENCE_TTL_MS.
// ──────────────────────────────────────────
const INTELLIGENCE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const intelligenceCache = new Map(); // userId → { insights, cachedAt }

const getCachedIntelligence = (userId) => {
  const entry = intelligenceCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > INTELLIGENCE_TTL_MS) {
    intelligenceCache.delete(userId);
    return null;
  }
  return entry.insights;
};

const setCachedIntelligence = (userId, insights) => {
  intelligenceCache.set(userId, { insights, cachedAt: Date.now() });
};

// ──────────────────────────────────────────
// GET /api/metrics/dashboard
// Pulls sent/reply counts directly from the opportunities table (authoritative).
// A-07: outreachStreak now derived from opportunities.marked_sent_at, not daily_metrics.
// A-08: getUsageSummary removed — handled exclusively by /usage + useTokenUsage hook.
// A-09: DB errors logged explicitly.
// A-10: positive_rate clamped to [0,1].
// ──────────────────────────────────────────
router.get('/dashboard', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today  = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const sevenDaysAgo  = new Date(Date.now() -  7 * 86400000).toISOString().split('T')[0];

  log('Dashboard Request', { userId });
  logDB('SELECT', 'opportunities + profiles + pipeline_metrics + goals + practice_sessions + daily_check_ins', { userId });

  const [
    { data: dailyData,       error: dailyErr },
    { data: profile,         error: profileErr },
    { data: pipelineMetrics, error: pipelineErr },
    { data: recentOpps,      error: oppsErr },
    { data: goals,           error: goalsErr },
    { data: practices,       error: practicesErr },
    { data: checkIns,        error: checkInsErr },
  ] = await Promise.all([
    supabaseAdmin.from('daily_metrics').select('*').eq('user_id', userId)
      .gte('date', thirtyDaysAgo).order('date', { ascending: true }),
    supabaseAdmin.from('user_performance_profiles').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('pipeline_metrics').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('opportunities').select('status, marked_sent_at, created_at, platform')
      .eq('user_id', userId).gte('created_at', `${thirtyDaysAgo}T00:00:00`),
    supabaseAdmin.from('user_goals').select('*').eq('user_id', userId).eq('status', 'active'),
    supabaseAdmin.from('practice_sessions').select('id, scenario_type, message_strength_score, rating, completed, created_at')
      .eq('user_id', userId).gte('created_at', `${thirtyDaysAgo}T00:00:00`).eq('completed', true),
    supabaseAdmin.from('daily_check_ins').select('mood_score, date').eq('user_id', userId)
      .gte('date', thirtyDaysAgo).order('date', { ascending: false }),
  ]);

  // A-09: Log DB errors without crashing the endpoint
  if (dailyErr)    logError('dashboard/daily_metrics',    dailyErr,    { userId });
  if (profileErr)  logError('dashboard/user_performance', profileErr,  { userId });
  if (pipelineErr) logError('dashboard/pipeline_metrics', pipelineErr, { userId });
  if (oppsErr)     logError('dashboard/opportunities',    oppsErr,     { userId });
  if (goalsErr)    logError('dashboard/user_goals',       goalsErr,    { userId });
  if (practicesErr)logError('dashboard/practice_sessions',practicesErr,{ userId });
  if (checkInsErr) logError('dashboard/daily_check_ins',  checkInsErr, { userId });

  // Accurate counts from source tables
  const sentOpps     = (recentOpps || []).filter(o => o.marked_sent_at);
  const todayOpps    = (recentOpps || []).filter(o => o.created_at?.startsWith(today));
  const todaySent    = todayOpps.filter(o => o.marked_sent_at);
  const sevenDayOpps = (recentOpps || []).filter(o => o.created_at >= `${sevenDaysAgo}T00:00:00`);

  // A-10: Clamp positive_rate to [0,1] to guard against data corruption
  const positiveRate = Math.min(1, Math.max(0, profile?.positive_rate || 0));
  const totalSent    = profile?.total_sent    || 0;
  const totalPos     = profile?.total_positive || 0;

  // Streak from check-ins
  const checkInStreak = calculateCheckInStreak(checkIns || []);
  // A-07: outreachStreak derived from opportunities (same authoritative source as counts)
  const outreachStreak = calculateOutreachStreakFromOpps(recentOpps || []);

  // Practice stats
  const practiceScores  = (practices || []).filter(p => p.message_strength_score != null).map(p => p.message_strength_score);
  const avgPracticeScore = practiceScores.length
    ? Math.round(practiceScores.reduce((s, x) => s + x, 0) / practiceScores.length)
    : null;

  // Goal progress
  const goalProgress = (goals || []).map(g => ({
    text: g.goal_text,
    pct:  g.target_value ? Math.min(100, Math.round(((g.current_value || 0) / g.target_value) * 100)) : null,
  }));

  // A-01: computeMomentumScore now returns { score, breakdown }
  const { score: momentumScore } = computeMomentumScore({
    outreachStreak,
    sentCount30d: sentOpps.length,
    positiveRate,
    pipelineMetrics,
    goals: goals || [],
    practiceCount: (practices || []).length,
  });

  log('Dashboard Response', {
    userId,
    todaySent: todaySent.length,
    sentLast30: sentOpps.length,
    outreachStreak,
    checkInStreak,
    momentumScore,
    positiveRate: Math.round(positiveRate * 100),
  });

  res.json({
    today: {
      discovered: todayOpps.length,
      sent: todaySent.length,
    },
    week: {
      discovered: sevenDayOpps.length,
      sent: sevenDayOpps.filter(o => o.marked_sent_at).length,
    },
    overall: {
      total_sent:       totalSent,
      total_positive:   totalPos,
      positive_rate:    Math.round(positiveRate * 100),
      learned_patterns: profile?.learned_patterns || null,
    },
    pipeline: {
      total_revenue:     pipelineMetrics?.total_revenue     || 0,
      pipeline_value:    pipelineMetrics?.pipeline_value    || 0,
      win_rate_pct:      pipelineMetrics?.win_rate_pct      || 0,
      contacted_count:   pipelineMetrics?.contacted_count   || 0,
      replied_count:     pipelineMetrics?.replied_count     || 0,
      call_demo_count:   pipelineMetrics?.call_demo_count   || 0,
      closed_won_count:  pipelineMetrics?.closed_won_count  || 0,
      closed_lost_count: pipelineMetrics?.closed_lost_count || 0,
    },
    streak: {
      outreach: outreachStreak,
      check_in: checkInStreak,
    },
    practice: {
      sessions_30d: (practices || []).length,
      avg_score:    avgPracticeScore,
    },
    goals:          goalProgress,
    momentum_score: momentumScore,
    chart_data:     buildChartData(dailyData || [], recentOpps || []),
    // A-08: token_usage removed — use /metrics/usage endpoint instead
  });
}));
// ──────────────────────────────────────────
// GET /api/metrics/communication-snapshot
// A-04: composite_score now computed inline from live dimension averages.
//       Previously read from skill_progression (weekly job snapshot), which
//       could be up to 7 days stale vs the dimension bars computed live.
//       top_weakness / top_strength also derived live to match.
// A-09: DB errors logged.
// ──────────────────────────────────────────
router.get('/communication-snapshot', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  log('Communication Snapshot Request', { userId });
  logDB('SELECT', 'conversation_analyses + skill_progression + communication_patterns', { userId });

  const [
    { data: analyses,      error: analysesErr },
    { data: skillProgress, error: progressErr },
    { data: patterns,      error: patternsErr },
  ] = await Promise.all([
    supabaseAdmin.from('conversation_analyses')
      .select('hook_score, clarity_score, value_prop_score, personalization_score, cta_score, tone_score, composite_score, outcome, failure_categories, created_at')
      .eq('user_id', userId)
      .gte('created_at', `${thirtyDaysAgo}T00:00:00`)
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('skill_progression')
      .select('week_start, composite_delta')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(2),
    supabaseAdmin.from('communication_patterns')
      .select('pattern_label, pattern_type, recommendation, confidence_score')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(3),
  ]);

  if (analysesErr) logError('communication-snapshot/analyses', analysesErr, { userId });
  if (progressErr) logError('communication-snapshot/skill_progression', progressErr, { userId });
  if (patternsErr) logError('communication-snapshot/patterns', patternsErr, { userId });

  if ((analyses?.length || 0) < 3) {
    log('Communication Snapshot — Insufficient Data', { userId, count: analyses?.length || 0 });
    return res.json({ has_data: false, messages_analyzed: analyses?.length || 0 });
  }

  const avgDim = (field) => {
    const vals = (analyses || []).filter(a => a[field] != null).map(a => a[field]);
    return vals.length ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)) : null;
  };

  const dimensions = {
    hook:            { score: avgDim('hook_score'),            label: 'Hook Strength' },
    clarity:         { score: avgDim('clarity_score'),         label: 'Clarity' },
    value_prop:      { score: avgDim('value_prop_score'),      label: 'Value Proposition' },
    personalization: { score: avgDim('personalization_score'), label: 'Personalization' },
    cta:             { score: avgDim('cta_score'),             label: 'Call to Action' },
    tone:            { score: avgDim('tone_score'),            label: 'Tone Fit' },
  };

  // A-04: Compute composite inline from live dimension averages — always consistent with bars
  const validScores = Object.values(dimensions).map(d => d.score).filter(v => v != null);
  const liveCompositeScore = validScores.length
    ? parseFloat((validScores.reduce((s, v) => s + v, 0) / validScores.length).toFixed(1))
    : null;

  // A-04: Derive top_weakness / top_strength from live dimension scores
  const sortedDims = Object.entries(dimensions)
    .filter(([, d]) => d.score != null)
    .sort(([, a], [, b]) => a.score - b.score);
  const liveTopWeakness = sortedDims[0]?.[0] || null;
  const liveTopStrength = sortedDims[sortedDims.length - 1]?.[0] || null;

  const failCatFreq = {};
  (analyses || []).forEach(a => {
    (a.failure_categories || []).forEach(cat => {
      failCatFreq[cat] = (failCatFreq[cat] || 0) + 1;
    });
  });
  const topFailureCategories = Object.entries(failCatFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, count]) => ({ category, count }));

  // Weekly composite trend computed from analyses (live, not from job)
  const byWeek = {};
  (analyses || []).forEach(a => {
    if (!a.composite_score) return;
    const d = new Date(a.created_at);
    d.setDate(d.getDate() - d.getDay());
    const key = d.toISOString().split('T')[0];
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(a.composite_score);
  });
  const weeklyTrend = Object.entries(byWeek)
    .sort(([a], [b]) => a > b ? 1 : -1)
    .map(([week, scores]) => ({
      week,
      composite: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)),
    }));

  // composite_delta still comes from the weekly job (it measures week-over-week change
  // which requires two snapshots — keep the job value for this one field only)
  const compositeDelta = skillProgress?.[0]?.composite_delta || null;

  log('Communication Snapshot Response', {
    userId,
    messagesAnalyzed: analyses.length,
    liveCompositeScore,
    liveTopWeakness,
    liveTopStrength,
    weeklyTrendPoints: weeklyTrend.length,
  });

  res.json({
    has_data:          true,
    messages_analyzed: analyses.length,
    dimensions,
    // A-04: All score fields now live — consistent with dimension bars
    composite_score:   liveCompositeScore,
    composite_delta:   compositeDelta,
    top_weakness:      liveTopWeakness,
    top_strength:      liveTopStrength,
    weekly_trend:      weeklyTrend,
    top_patterns:      (patterns || []).map(p => ({
      label:          p.pattern_label,
      type:           p.pattern_type,
      recommendation: p.recommendation,
      confidence:     p.confidence_score,
    })),
    top_failure_categories: topFailureCategories,
  });
}));

// ──────────────────────────────────────────
// GET /api/metrics/momentum
// A-01: breakdown now comes directly from computeMomentumScore, so bars
//       always match the displayed score (previously used different formulas).
// A-05: prevWeekOpps moved into the initial Promise.all (was a sequential call).
// A-09: DB errors logged.
// A-10: positive_rate clamped.
// ──────────────────────────────────────────
router.get('/momentum', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const sevenDaysAgo   = new Date(Date.now() -  7 * 86400000).toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  log('Momentum Request', { userId });
  logDB('SELECT', 'opportunities + profiles + pipeline_metrics + goals + practice_sessions + daily_check_ins', { userId });

  const [
    { data: dailyData,       error: dailyErr },
    { data: profile,         error: profileErr },
    { data: pipelineMetrics, error: pipelineErr },
    { data: goals,           error: goalsErr },
    { data: practices,       error: practicesErr },
    { data: checkIns,        error: checkInsErr },
    { data: sentOpps,        error: sentOppsErr },
    { data: sentOppsLastWeek, error: sentLastWkErr },
    { data: prevWeekOpps,    error: prevWkErr },    // A-05: now parallel
  ] = await Promise.all([
    supabaseAdmin.from('daily_metrics').select('date, messages_sent').eq('user_id', userId).gte('date', thirtyDaysAgo),
    supabaseAdmin.from('user_performance_profiles').select('positive_rate, total_sent').eq('user_id', userId).single(),
    supabaseAdmin.from('pipeline_metrics').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('user_goals').select('current_value, target_value, status').eq('user_id', userId),
    supabaseAdmin.from('practice_sessions').select('id').eq('user_id', userId).eq('completed', true).gte('created_at', `${thirtyDaysAgo}T00:00:00`),
    supabaseAdmin.from('daily_check_ins').select('date, mood_score').eq('user_id', userId).gte('date', thirtyDaysAgo),
    supabaseAdmin.from('opportunities').select('id, marked_sent_at, created_at').eq('user_id', userId).not('marked_sent_at', 'is', null).gte('created_at', `${thirtyDaysAgo}T00:00:00`),
    supabaseAdmin.from('opportunities').select('id').eq('user_id', userId).not('marked_sent_at', 'is', null).gte('created_at', `${sevenDaysAgo}T00:00:00`),
    supabaseAdmin.from('opportunities').select('id').eq('user_id', userId).not('marked_sent_at', 'is', null).gte('created_at', `${fourteenDaysAgo}T00:00:00`).lt('created_at', `${sevenDaysAgo}T00:00:00`),
  ]);

  // A-09: log any DB errors
  if (dailyErr)       logError('momentum/daily_metrics',    dailyErr,       { userId });
  if (profileErr)     logError('momentum/user_performance', profileErr,     { userId });
  if (pipelineErr)    logError('momentum/pipeline_metrics', pipelineErr,    { userId });
  if (goalsErr)       logError('momentum/user_goals',       goalsErr,       { userId });
  if (practicesErr)   logError('momentum/practice_sessions',practicesErr,   { userId });
  if (checkInsErr)    logError('momentum/daily_check_ins',  checkInsErr,    { userId });
  if (sentOppsErr)    logError('momentum/sent_opps',        sentOppsErr,    { userId });
  if (sentLastWkErr)  logError('momentum/sent_last_week',   sentLastWkErr,  { userId });
  if (prevWkErr)      logError('momentum/prev_week_opps',   prevWkErr,      { userId });

  // A-07: derive streak from opportunities (consistent with dashboard)
  const streak = calculateOutreachStreakFromOpps(sentOpps || []);

  // A-10: clamp positive_rate
  const positiveRate = Math.min(1, Math.max(0, profile?.positive_rate || 0));

  // A-01: single call returns both score AND breakdown with the exact same arithmetic
  const { score, breakdown } = computeMomentumScore({
    outreachStreak: streak,
    sentCount30d:   (sentOpps || []).length,
    positiveRate,
    pipelineMetrics,
    goals:          goals || [],
    practiceCount:  (practices || []).length,
  });

  const thisWeekSent = (sentOppsLastWeek || []).length;
  const lastWeekSent = (prevWeekOpps    || []).length;
  const trend = thisWeekSent - lastWeekSent;

  log('Momentum Response', { userId, score, trend, streak, thisWeekSent, lastWeekSent });

  res.json({
    score,
    trend,
    breakdown,               // A-01: guaranteed to match score
    insight: generateMomentumInsight(score, trend, streak, profile),
  });
}));

// ──────────────────────────────────────────
// GET /api/metrics/intelligence
// A-06: Per-user in-memory cache (4 h TTL) prevents AI call on every load.
// A-12: Business-neutral language — works for any seller type.
// A-19: business_name/product_description fall back to memory facts.
// A-09: DB errors logged.
// A-10: positive_rate clamped.
// ──────────────────────────────────────────
router.get('/intelligence', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // A-06: Return cached insights if still fresh
  const cached = getCachedIntelligence(userId);
  if (cached) {
    log('Intelligence Cache Hit', { userId });
    return res.json({ insights: cached, cached: true });
  }

  log('Intelligence Cache Miss — Fetching', { userId });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  logDB('SELECT', 'profiles + pipeline + goals + check_ins + practices + opportunities + memory + topics + analyses', { userId });

  const [
    { data: profile,        error: profileErr },
    { data: pipeline,       error: pipelineErr },
    { data: goals,          error: goalsErr },
    { data: checkIns,       error: checkInsErr },
    { data: practices,      error: practicesErr },
    { data: sentByPlatform, error: platformErr },
    { data: memory,         error: memoryErr },
    { data: topicTags,      error: topicsErr },
    { data: recentAnalyses, error: analysesErr },
  ] = await Promise.all([
    supabaseAdmin.from('user_performance_profiles').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('pipeline_metrics').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('user_goals').select('*').eq('user_id', userId).eq('status', 'active'),
    supabaseAdmin.from('daily_check_ins')
      .select('mood_score, answers, date')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: false })
      .limit(10),
    supabaseAdmin.from('practice_sessions')
      .select('scenario_type, message_strength_score, rating, created_at')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('created_at', `${thirtyDaysAgo}T00:00:00`),
    supabaseAdmin.from('opportunities')
      .select('platform, marked_sent_at, status')
      .eq('user_id', userId)
      .gte('created_at', `${thirtyDaysAgo}T00:00:00`),
    supabaseAdmin.from('user_memory')
      .select('fact_text, fact_category')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('reinforcement_count', { ascending: false })
      .limit(8),
    supabaseAdmin.from('chat_topic_tags')
      .select('topic')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabaseAdmin.from('conversation_analyses')
      .select('hook_score, clarity_score, value_prop_score, personalization_score, cta_score, tone_score, composite_score, failure_categories, outcome')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // A-09: Log DB errors
  if (profileErr)  logError('intelligence/user_performance', profileErr,  { userId });
  if (pipelineErr) logError('intelligence/pipeline_metrics', pipelineErr, { userId });
  if (goalsErr)    logError('intelligence/user_goals',       goalsErr,    { userId });
  if (checkInsErr) logError('intelligence/daily_check_ins',  checkInsErr, { userId });
  if (practicesErr)logError('intelligence/practice_sessions',practicesErr,{ userId });
  if (platformErr) logError('intelligence/opportunities',    platformErr, { userId });
  if (memoryErr)   logError('intelligence/user_memory',      memoryErr,   { userId });
  if (topicsErr)   logError('intelligence/chat_topic_tags',  topicsErr,   { userId });
  if (analysesErr) logError('intelligence/conv_analyses',    analysesErr, { userId });

  // Platform breakdown
  const platformBreakdown = (sentByPlatform || []).reduce((acc, o) => {
    if (o.platform) acc[o.platform] = (acc[o.platform] || 0) + 1;
    return acc;
  }, {});
  const topPlatform = Object.entries(platformBreakdown).sort((a, b) => b[1] - a[1])[0];

  // Practice score trend
  const practiceScores = (practices || [])
    .filter(p => p.message_strength_score != null)
    .map(p => ({ score: p.message_strength_score, date: p.created_at }));

  const recentScoreAvg =
    practiceScores.slice(0, 3).reduce((s, p) => s + p.score, 0) /
    Math.max(1, Math.min(3, practiceScores.length));

  const olderScoreAvg =
    practiceScores.slice(3).reduce((s, p) => s + p.score, 0) /
    Math.max(1, practiceScores.slice(3).length);

  const practiceImprovement =
    practiceScores.length >= 4 ? Math.round(recentScoreAvg - olderScoreAvg) : null;

  // Topic focus
  const topicCounts = (topicTags || []).reduce((acc, { topic }) => {
    acc[topic] = (acc[topic] || 0) + 1;
    return acc;
  }, {});
  const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0];

  // Mood trend
  const avgMood = checkIns?.length
    ? (checkIns.reduce((s, c) => s + (c.mood_score || 3), 0) / checkIns.length).toFixed(1)
    : null;

  // Message analysis averages
  const avgAnalysis = (field) => {
    const vals = (recentAnalyses || []).filter(a => a[field] != null).map(a => a[field]);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : null;
  };

  const analysisAvgs = recentAnalyses?.length >= 3
    ? {
        hook: avgAnalysis('hook_score'),
        clarity: avgAnalysis('clarity_score'),
        value_prop: avgAnalysis('value_prop_score'),
        personalization: avgAnalysis('personalization_score'),
        cta: avgAnalysis('cta_score'),
        tone: avgAnalysis('tone_score'),
      }
    : null;

  const analysisFailFreq = {};
  (recentAnalyses || []).forEach(a => {
    (a.failure_categories || []).forEach(cat => {
      analysisFailFreq[cat] = (analysisFailFreq[cat] || 0) + 1;
    });
  });
  const topAnalysisFailures = Object.entries(analysisFailFreq)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([cat, count]) => `${cat} (${count}x)`);

  // A-19: Safe business context — fall back to memory facts if user fields are missing
  const businessName = req.user.business_name
    || memory?.find(m => m.fact_category === 'business_name')?.fact_text
    || 'this business';
  const productDesc = req.user.product_description
    || memory?.find(m => m.fact_category === 'product')?.fact_text
    || 'their product or service';
  const userRole = req.user.role || 'seller';

  // A-10: clamp positive_rate
  const positiveRate = Math.min(1, Math.max(0, profile?.positive_rate || 0));

  // A-12: Business-neutral context — works for any seller type
  const dataContext = `
SELLER: ${businessName} | ${productDesc} | ${userRole}

WHAT CLUTCH KNOWS:
${(memory || []).map(m => `[${m.fact_category}] ${m.fact_text}`).join('\n') || 'No memory facts yet'}

OUTREACH (last 30 days):
- Messages sent: ${(sentByPlatform || []).filter(o => o.marked_sent_at).length}
- Platform breakdown: ${JSON.stringify(platformBreakdown)}
- Top channel: ${topPlatform ? `${topPlatform[0]} (${topPlatform[1]} messages)` : 'none yet'}
- Reply rate: ${Math.round(positiveRate * 100)}%
- Total messages ever sent: ${profile?.total_sent || 0}

PIPELINE / RESULTS:
- Active pipeline value: $${pipeline?.pipeline_value?.toLocaleString() || 0}
- Interested replies: ${pipeline?.replied_count || 0} | Follow-up meetings: ${pipeline?.call_demo_count || 0} | Closed: ${pipeline?.closed_won_count || 0}
- Revenue closed: $${pipeline?.total_revenue?.toLocaleString() || 0}

PRACTICE SESSIONS (last 30 days): ${(practices || []).length} completed
- Avg message score: ${practiceScores.length ? Math.round(practiceScores.reduce((s, p) => s + p.score, 0) / practiceScores.length) : 'N/A'}
- Score trend: ${practiceImprovement !== null ? (practiceImprovement > 0 ? `+${practiceImprovement} improvement` : `${practiceImprovement} decline`) : 'not enough data'}

MESSAGE QUALITY (last 30 days, ${recentAnalyses?.length || 0} messages scored):
${analysisAvgs
  ? `- Dimension scores (0-10): Hook: ${analysisAvgs.hook}, Clarity: ${analysisAvgs.clarity}, Value Prop: ${analysisAvgs.value_prop}, Personalization: ${analysisAvgs.personalization}, CTA: ${analysisAvgs.cta}, Tone: ${analysisAvgs.tone}
- Top failure patterns: ${topAnalysisFailures.join(', ') || 'none detected'}`
  : '- Not enough analyzed messages yet (need 3+)'}

CHECK-INS: ${checkIns?.length || 0} logged | Avg mood: ${avgMood || 'N/A'}/5
${checkIns?.[0]?.answers ? `Latest answers: ${Object.entries(checkIns[0].answers).slice(0, 2).map(([q, a]) => `"${q}": "${a}"`).join(' | ')}` : ''}

GOALS (active): ${(goals || []).length}
${(goals || []).map(g => `- "${g.goal_text}": ${g.current_value ?? 0}/${g.target_value ?? '?'} ${g.target_unit ?? ''}`).join('\n')}

TOPIC FOCUS: ${topTopic ? `Most questions about "${topTopic[0]}" (${topTopic[1]}x)` : 'not enough chat data'}
`.trim();

  // A-12: Prompt is seller-type-neutral — explicitly works for any business size
  const prompt = `You are Clutch, an AI coach generating 3 sharp business intelligence insights for a seller.

${dataContext}

Generate exactly 3 insights. Each should surface something the seller CANNOT easily see on their own — a pattern, connection, or blind spot. Be specific and reference their actual numbers. Work for ANY type of seller: freelancer, food vendor, service provider, local business, or enterprise.

Return ONLY JSON:
[
  {
    "type": "pattern|warning|opportunity|milestone",
    "icon": "<single emoji>",
    "title": "<5-8 word title>",
    "body": "<2-3 sentences. Specific. Use their actual numbers. Tell them what it means for their work.>",
    "action": "<optional action under 15 words>"
  }
]`;

  log('Intelligence AI Call', { userId, analysesCount: recentAnalyses?.length || 0, practiceCount: practices?.length || 0 });

  try {
    const { content, tokens_in, tokens_out } = await callWithFallback({
      systemPrompt: 'You are a sharp business intelligence analyst. Return only valid JSON arrays.',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      maxTokens: 600,
    });

    await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);

    const insights = JSON.parse(content.replace(/```json|```/g, '').trim());
    const finalInsights = Array.isArray(insights) ? insights.slice(0, 3) : [];

    // A-06: Cache the result
    setCachedIntelligence(userId, finalInsights);
    log('Intelligence AI Success', { userId, insightCount: finalInsights.length, tokens_in, tokens_out });

    res.json({ insights: finalInsights, cached: false });

  } catch (err) {
    logError('intelligence/AI call', err, { userId });
    const fallback = generateRuleBasedInsights(
      profile, pipeline, goals || [], practices || [], checkIns || [], topicTags || []
    );
    res.json({ insights: fallback, cached: false });
  }

}));


// ──────────────────────────────────────────
// GET /api/metrics/milestones
// Business milestones the user has achieved
// ──────────────────────────────────────────
router.get('/milestones', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const [
    { data: profile },
    { data: pipeline },
    { data: practices },
    { data: goals },
    { data: checkIns },
    { data: memories },
    { data: practiceBadges }
  ] = await Promise.all([
    supabaseAdmin
      .from('user_performance_profiles')
      .select('total_sent, total_positive, positive_rate')
      .eq('user_id', userId)
      .single(),

    supabaseAdmin
      .from('pipeline_metrics')
      .select('total_revenue, pipeline_value, replied_count, call_demo_count, closed_won_count')
      .eq('user_id', userId)
      .single(),

    supabaseAdmin
      .from('practice_sessions')
      .select('id, message_strength_score')
      .eq('user_id', userId)
      .eq('completed', true),

    supabaseAdmin
      .from('user_goals')
      .select('id, status')
      .eq('user_id', userId),

    supabaseAdmin
      .from('daily_check_ins')
      .select('id')
      .eq('user_id', userId),

    supabaseAdmin
      .from('user_memory')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true),

    // NEW: practice badge system
    supabaseAdmin
      .from('practice_badges')
      .select('badge_type, badge_label, badge_description, earned_at')
      .eq('user_id', userId)
  ]);

  const milestones = [];

  const add = (icon, title, desc, achieved) => {
    if (achieved) {
      milestones.push({
        icon,
        title,
        desc,
        achieved: true,
        achieved_at: null
      });
    }
  };

  // Outreach milestones
  add('📤', 'First message sent', 'You sent your first outreach with Clutch', (profile?.total_sent || 0) >= 1);
  add('🚀', '10 messages sent', 'You sent 10 outreach messages', (profile?.total_sent || 0) >= 10);
  add('💪', '50 messages sent', 'Serious outreach volume — 50 messages', (profile?.total_sent || 0) >= 50);
  add('🔥', '100 messages sent', 'You\'ve sent 100 outreach messages', (profile?.total_sent || 0) >= 100);

  // Reply milestones
  add('💬', 'First reply received', 'You got your first positive reply', (profile?.total_positive || 0) >= 1);
  add('📈', '5 positive replies', 'Your messaging is resonating', (profile?.total_positive || 0) >= 5);
  add('🎯', '20% reply rate', 'Above-average conversion rate', (profile?.positive_rate || 0) >= 0.20);
  add('🏆', '30% reply rate', 'Top-tier conversion rate — 30%+', (profile?.positive_rate || 0) >= 0.30);

  // Pipeline milestones
  add('🤝', 'First demo booked', 'You scheduled your first demo', (pipeline?.call_demo_count || 0) >= 1);
  add('💰', 'First deal closed', 'You closed your first customer', (pipeline?.closed_won_count || 0) >= 1);
  add('📊', '$1K pipeline', '$1,000+ in your active pipeline', (pipeline?.pipeline_value || 0) >= 1000);
  add('💎', '$10K pipeline', '$10,000+ in your active pipeline', (pipeline?.pipeline_value || 0) >= 10000);
  add('🌟', 'First revenue', 'You generated your first revenue through Clutch', (pipeline?.total_revenue || 0) >= 1);

  // Habit milestones
  add('✅', 'First check-in', 'You completed your first daily check-in', (checkIns || []).length >= 1);
  add('📅', '7 check-ins', 'One week of check-ins', (checkIns || []).length >= 7);
  add('🧠', 'First goal completed', 'You completed your first goal', (goals || []).some(g => g.status === 'completed'));
  add('🔮', '10 memory facts', 'Clutch has learned 10 things about your business', (memories || []).length >= 10);


  // ─────────────────────────────────────────
  // Practice badges (authoritative system)
  // ─────────────────────────────────────────

  (practiceBadges || []).forEach(b => {
    const icon = b.badge_label?.split(' ')[0] || '🎯';
    const titleWithoutIcon = b.badge_label?.slice(icon.length).trim() || b.badge_type;

    milestones.push({
      icon,
      title: titleWithoutIcon,
      desc: b.badge_description || 'Practice milestone',
      achieved: true,
      achieved_at: b.earned_at || null,
    });
  });


  // ─────────────────────────────────────────
  // Approaching milestone detection
  // ─────────────────────────────────────────

  const approaching = [];

  const checkApproaching = (icon, title, desc, current, threshold) => {
    if (current >= threshold) return;

    if (threshold - current <= threshold * 0.20) {
      approaching.push({
        icon,
        title,
        desc,
        current,
        threshold,
        gap: threshold - current
      });
    }
  };

  const ts = profile?.total_sent || 0;
  const tp = profile?.total_positive || 0;
  const pr = profile?.positive_rate || 0;
  const pv = pipeline?.pipeline_value || 0;
  const tv = pipeline?.total_revenue || 0;

  checkApproaching('🚀', '10 messages sent', 'messages', ts, 10);
  checkApproaching('💪', '50 messages sent', 'messages', ts, 50);
  checkApproaching('🔥', '100 messages sent', 'messages', ts, 100);
  checkApproaching('💬', 'First reply', 'replies', tp, 1);
  checkApproaching('📈', '5 positive replies', 'replies', tp, 5);
  checkApproaching('🎯', '20% reply rate', 'reply rate', pr, 0.20);
  checkApproaching('🏆', '30% reply rate', 'reply rate', pr, 0.30);
  checkApproaching('📊', '$1K pipeline', 'in pipeline', pv, 1000);
  checkApproaching('💎', '$10K pipeline', 'in pipeline', pv, 10000);
  checkApproaching('🌟', 'First revenue', 'revenue', tv, 1);


  res.json({
    milestones: milestones.filter(m => m.achieved),
    approaching: approaching.slice(0, 3),
  });

}));

// ──────────────────────────────────────────
// GET /api/metrics/learning
// A-03: Fetches sessions descending (most recent first) so the 50-session
//       limit always captures the latest data for trend analysis.
//       best_score now uses a dedicated MAX query so it is correct for users
//       with more than 50 sessions (previously could miss newer high scores).
// A-09: DB errors logged.
// ──────────────────────────────────────────
router.get('/learning', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('Learning Request', { userId });
  logDB('SELECT', 'practice_sessions (recent 50 + best_score MAX)', { userId });

  // A-03: Descending so newest 50 are captured; trend is then sorted ascending below
  const [
    { data: sessions, error: sessionsErr },
    { data: bestScoreRow, error: bestErr },
  ] = await Promise.all([
    supabaseAdmin
      .from('practice_sessions')
      .select('id, scenario_type, message_strength_score, rating, asked_questions, handled_objection, messages_exchanged, created_at')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('created_at', { ascending: false })
      .limit(50),
    // A-03: Separate MAX query — correct regardless of total session count
    supabaseAdmin
      .from('practice_sessions')
      .select('message_strength_score')
      .eq('user_id', userId)
      .eq('completed', true)
      .not('message_strength_score', 'is', null)
      .order('message_strength_score', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sessionsErr) logError('learning/practice_sessions', sessionsErr, { userId });
  if (bestErr)     logError('learning/best_score_query',  bestErr,     { userId });

  if (!sessions?.length) {
    log('Learning — No Sessions', { userId });
    return res.json({ sessions: [], trend: null, best_score: null, skill_breakdown: {} });
  }

  // A-03: best_score from dedicated query, not from the limited 50-session window
  const best_score = bestScoreRow?.message_strength_score ?? null;

  const withScores = sessions.filter(s => s.message_strength_score != null);

  // Sort ascending for trend display (sessions were fetched descending)
  const sortedForTrend = [...withScores].sort((a, b) => a.created_at > b.created_at ? 1 : -1);

  // Group scores by week for trend
  const byWeek = {};
  for (const s of sortedForTrend) {
    const weekStart = new Date(s.created_at);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const key = weekStart.toISOString().split('T')[0];
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(s.message_strength_score);
  }
  const weeklyTrend = Object.entries(byWeek)
    .sort(([a], [b]) => a > b ? 1 : -1)
    .map(([week, scores]) => ({
      week,
      avg: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length),
    }));

  // Skill breakdown across sessions
  const scenarioCounts = sessions.reduce((acc, s) => {
    acc[s.scenario_type] = (acc[s.scenario_type] || 0) + 1;
    return acc;
  }, {});

  const askedQuestionsRate   = sessions.filter(s => s.asked_questions).length  / sessions.length;
  const handledObjectionRate = sessions.filter(s => s.handled_objection).length / sessions.length;

  log('Learning Response', { userId, totalSessions: sessions.length, best_score, weeklyTrendPoints: weeklyTrend.length });

  res.json({
    sessions:       sortedForTrend.map(s => ({ date: s.created_at.split('T')[0], score: s.message_strength_score, scenario: s.scenario_type })),
    weekly_trend:   weeklyTrend,
    best_score,
    total_sessions: sessions.length,
    scenario_breakdown: scenarioCounts,
    skill_rates: {
      asks_questions:     Math.round(askedQuestionsRate * 100),
      handles_objections: Math.round(handledObjectionRate * 100),
    },
  });
}));

// ──────────────────────────────────────────
// GET /api/metrics/usage
// ──────────────────────────────────────────
router.get('/usage', asyncHandler(async (req, res) => {
  log('Usage Request', { userId: req.user.id });
  const usage = await getUsageSummary(req.user.id, req.user.tier || 'free');
  res.json(usage);
}));

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

function calculateCheckInStreak(checkIns) {
  if (!checkIns?.length) return 0;
  const byDate = {};
  for (const c of checkIns) byDate[c.date] = true;
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (byDate[date]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// ──────────────────────────────────────────
// A-07: Streak derived from opportunities.marked_sent_at
// Groups sent opportunities by calendar date and counts consecutive days.
// ──────────────────────────────────────────
function calculateOutreachStreakFromOpps(sentOpps) {
  if (!sentOpps?.length) return 0;
  const byDate = {};
  for (const o of sentOpps) {
    const date = (o.marked_sent_at || o.created_at)?.split('T')[0];
    if (date) byDate[date] = true;
  }
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (byDate[date]) streak++;
    else if (i > 0) break;
  }
  return streak;
}

// Kept for any internal callers that still pass daily_metrics data directly.
// New code should use calculateOutreachStreakFromOpps instead.
function calculateOutreachStreak(dailyData) {
  if (!dailyData?.length) return 0;
  const byDate = {};
  for (const d of dailyData) byDate[d.date] = d;
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (byDate[date]?.messages_sent > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function computeAvgGoalPct(goals) {
  if (!goals.length) return 0;
  const withTargets = goals.filter(g => g.target_value && g.status === 'active');
  if (!withTargets.length) return 0;
  return withTargets.reduce((sum, g) => sum + Math.min(100, ((g.current_value || 0) / g.target_value) * 100), 0) / withTargets.length;
}

// ──────────────────────────────────────────
// A-01: Returns { score, breakdown } so both the score display and the
// breakdown bars always use the exact same arithmetic — no drift possible.
// Breakdown max values:
//   activity   → 30 (streakPts max 15 + volumePts max 15)
//   conversion → 30
//   pipeline   → 20
//   goals      → 15
//   practice   →  5
//   total      → 100
// ──────────────────────────────────────────
function computeMomentumScore({ outreachStreak, sentCount30d, positiveRate, pipelineMetrics, goals, practiceCount }) {
  const streakPts     = Math.min(15, outreachStreak * 3);
  const volumePts     = Math.min(15, Math.floor(sentCount30d / 2));
  const activity      = streakPts + volumePts;                           // max 30
  const conversion    = Math.min(30, Math.round(positiveRate * 100));   // max 30
  const pipeline      = pipelineMetrics?.call_demo_count  > 0 ? 20
    : pipelineMetrics?.replied_count   > 0 ? 13
    : pipelineMetrics?.contacted_count > 0 ? 6 : 0;                    // max 20
  const goalScore     = Math.min(15, Math.round(computeAvgGoalPct(goals) / 7)); // max 15
  const practiceBonus = Math.min(5, practiceCount);                      // max 5

  const score = Math.min(100, Math.round(activity + conversion + pipeline + goalScore + practiceBonus));

  return {
    score,
    breakdown: {
      activity,       // max 30
      conversion,     // max 30
      pipeline,       // max 20
      goals: goalScore, // max 15
      practice: practiceBonus, // max 5
    },
  };
}

// ──────────────────────────────────────────
// A-12: Business-neutral momentum insight — works for any seller type
// ──────────────────────────────────────────
function generateMomentumInsight(score, trend, streak, profile) {
  if (score >= 70) return `Your momentum is strong. Keep your outreach consistent — this is when compound results start showing.`;
  if (score >= 40) return `Solid foundation. ${streak > 0 ? `Your ${streak}-day streak is working. ` : ''}Focus on following up with interested prospects this week.`;
  if (trend > 2)   return `Momentum is building — up ${trend} points this week. Keep going.`;
  return `Time to rebuild momentum. Sending one message a day for 5 days straight will move this score significantly.`;
}

// ──────────────────────────────────────────
// A-02: buildChartData now correctly prefers live opp_sent over stale
// daily_metrics.messages_sent. The || was previously backwards — if
// daily_metrics had ANY truthy number it would shadow the accurate opp_sent.
// Fix: prefer opp_sent (direct from opportunities), fall back to messages_sent.
// ──────────────────────────────────────────
function buildChartData(dailyData, opportunities) {
  const byDate = {};
  // Seed from daily_metrics for any extra fields (positive_outcomes etc.)
  for (const d of dailyData) byDate[d.date] = { ...d };
  // Count from opportunities — this is the authoritative source
  for (const o of opportunities) {
    const date = o.created_at?.split('T')[0];
    if (date) {
      if (!byDate[date]) byDate[date] = { date };
      byDate[date].opp_discovered = (byDate[date].opp_discovered || 0) + 1;
      if (o.marked_sent_at) byDate[date].opp_sent = (byDate[date].opp_sent || 0) + 1;
    }
  }
  return Object.values(byDate)
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .slice(-30)
    .map(d => ({
      date:          d.date,
      // A-02: opp_sent is authoritative — fall back to messages_sent only if opp_sent absent
      sent:          d.opp_sent ?? d.messages_sent ?? 0,
      discovered:    d.opp_discovered || 0,
      positive:      d.positive_outcomes || 0,
      positive_rate: d.positive_rate ? Math.round(d.positive_rate * 100) : 0,
    }));
}

// ──────────────────────────────────────────
// A-12: Rule-based fallback insights — business-neutral language
// ──────────────────────────────────────────
function generateRuleBasedInsights(profile, pipeline, goals, practices, checkIns, topicTags) {
  const insights = [];
  // A-10: clamp rate in case of bad data
  const rate = Math.min(1, Math.max(0, profile?.positive_rate || 0));

  // Topic insight — seller-type neutral
  if (topicTags?.length >= 5) {
    const counts = topicTags.reduce((acc, { topic }) => { acc[topic] = (acc[topic] || 0) + 1; return acc; }, {});
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const msgs = {
      outreach:   { title: 'Outreach-focused mindset',    body: `You ask about outreach most. That focus pays off — make sure you\'re also reviewing objections to complete the loop.` },
      objections: { title: 'Objection-handling focus',    body: `Heavy focus on objections means you\'re in real conversations. Use Practice Mode to rehearse until your responses feel effortless.` },
      strategy:   { title: 'Strategic thinker',           body: `Lots of strategy questions. Pair strategic thinking with daily outreach volume — ideas compound when executed.` },
      pricing:    { title: 'Pricing on your mind',        body: `You\'re thinking about pricing a lot. Try testing two price points and see which one resonates more with your audience.` },
      pipeline:   { title: 'Pipeline builder',            body: `Pipeline focus is great. Reduce the time between "interested reply" and "follow-up meeting" — same-day responses improve conversion.` },
      mindset:    { title: 'Mindset work in progress',    body: `Self-awareness about mindset is honest. Send one message a day and let results build your confidence over time.` },
    };
    const m = msgs[top[0]];
    if (m) insights.push({ type: 'pattern', icon: '🧠', ...m, action: null });
  }

  if (rate > 0.25) {
    insights.push({ type: 'pattern', icon: '📈', title: 'Strong reply rate', body: `Your ${Math.round(rate * 100)}% reply rate is above average. Your messaging is resonating with people.`, action: null });
  } else if (rate > 0) {
    insights.push({ type: 'pattern', icon: '📊', title: 'Reply rate opportunity', body: `At ${Math.round(rate * 100)}%, there\'s room to grow. Try leading with a specific problem your product or service solves.`, action: 'Open Practice Mode and try a new opener' });
  }

  // A-12: "demo" replaced with "follow-up meeting" — works for any seller type
  if (pipeline?.replied_count > 0 && pipeline?.call_demo_count === 0) {
    insights.push({ type: 'opportunity', icon: '💡', title: 'Move replies forward', body: `${pipeline.replied_count} interested ${pipeline.replied_count > 1 ? 'contacts' : 'contact'} replied but no follow-up meetings yet. Send a specific next-step ask.`, action: 'Follow up with interested contacts' });
  } else {
    insights.push({ type: 'opportunity', icon: '💡', title: 'Grow your pipeline', body: `Your pipeline is ${pipeline?.pipeline_value > 0 ? 'building' : 'empty'}. Check the Opportunities page daily to find new people to reach out to.`, action: null });
  }

  return insights.slice(0, 3);
}

export default router;
