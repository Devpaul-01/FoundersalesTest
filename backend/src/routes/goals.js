// src/routes/goals.js
// ============================================================
// GOALS API — Extracted from growth.js (Audit §5)
// UPGRADED: Goal note coaching now receives rich context:
//   - previous goal notes (pattern recognition)
//   - recent daily check-ins (mood + answers)
//   - user memory facts (long-term context)
//   - pipeline activity summary
//   - practice session progress
//
// IMPROVEMENTS v2:
//  FEAT-01 — POST /:goalId/notes now accepts explicit_delta as a
//            separate numeric field. When provided, the AI's extracted
//            progress_delta is bypassed entirely — eliminating the
//            double-parsing fragility where the AI could extract the
//            wrong number from a note containing multiple figures.
//            The AI coaching still runs with full context; it just no
//            longer needs to extract a number the user already declared.
//
//  FEAT-02 — System prompt now includes a velocity projection block:
//            avg pace per log, projected completion date, and whether
//            the founder is ON TRACK or BEHIND PACE. This lets the coach
//            speak precisely to trajectory, not just raw numbers.
//
//  FEAT-03 — GET /pipeline-insight: lightweight AI-generated pipeline
//            health observation that connects pipeline metrics to active
//            goals. Cached 24h per user. One Groq call, high signal.
//
// Mounted at: /api/growth/goals  (see app.js)
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';

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
  console.log(`[Goals] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Goals] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Goals] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Goals] 🤖 AI [${fn}]${entries ? ` → ${entries}` : ''}`);
};

const logJob = (name, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Goals] 🔄 Job [${name}]${entries ? ` → ${entries}` : ''}`);
};

// ──────────────────────────────────────────
// GET /api/growth/goals
// List all goals for the authenticated user.
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('LIST_GOALS', { userId });

  logDB('SELECT', 'user_goals', { userId, order: 'created_at desc' });
  const { data: goals, error } = await supabaseAdmin
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logError('GET /', error, { userId });
    throw error;
  }

  log('LIST_GOALS_OK', { userId, count: goals?.length || 0 });
  res.json({ goals: goals || [] });
}));

// ──────────────────────────────────────────
// POST /api/growth/goals
// Create a new goal.
// ──────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { goal_text, goal_type, target_value, target_unit, target_date } = req.body;

  log('CREATE_GOAL', {
    userId,
    goal_type:    goal_type || 'custom',
    has_target:   !!target_value,
    has_date:     !!target_date,
    textPreview:  goal_text?.slice(0, 60),
  });

  if (!goal_text?.trim()) {
    log('CREATE_GOAL_VALIDATION_FAIL', { userId, reason: 'missing goal_text' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'goal_text required' });
  }

  logDB('INSERT', 'user_goals', {
    userId,
    goal_type:    goal_type || 'custom',
    target_value: target_value || null,
    target_unit:  target_unit  || null,
    target_date:  target_date  || null,
  });

  const { data: goal, error } = await supabaseAdmin
    .from('user_goals')
    .insert({
      user_id:      userId,
      goal_text:    goal_text.trim(),
      goal_type:    goal_type || 'custom',
      target_value: target_value || null,
      target_unit:  target_unit  || null,
      target_date:  target_date  || null,
    })
    .select()
    .single();

  if (error) {
    logError('POST /', error, { userId });
    throw error;
  }

  log('CREATE_GOAL_OK', { userId, goalId: goal.id, goal_type: goal.goal_type });
  res.json({ success: true, goal });
}));

// ──────────────────────────────────────────
// PUT /api/growth/goals/:id
// Update a goal's current value, status, or text.
// ──────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = req.params.id;
  const { current_value, status, goal_text } = req.body;

  log('UPDATE_GOAL', {
    userId,
    goalId,
    has_current_value: current_value !== undefined,
    has_status:        status !== undefined,
    has_goal_text:     goal_text !== undefined,
    new_status:        status || null,
    new_value:         current_value ?? null,
  });

  const updates = { updated_at: new Date().toISOString() };
  if (current_value !== undefined) updates.current_value = current_value;
  if (status !== undefined)        updates.status        = status;
  if (goal_text !== undefined)     updates.goal_text     = goal_text;

  logDB('UPDATE', 'user_goals', { goalId, userId, fields: Object.keys(updates).join(',') });

  const { data: goal, error } = await supabaseAdmin
    .from('user_goals')
    .update(updates)
    .eq('id', goalId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    logError('PUT /:id', error, { userId, goalId });
    throw error;
  }

  if (!goal) {
    log('UPDATE_GOAL_NOT_FOUND', { userId, goalId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Goal not found' });
  }

  log('UPDATE_GOAL_OK', { userId, goalId, status: goal.status, current_value: goal.current_value });
  res.json({ success: true, goal });
}));

// ──────────────────────────────────────────
// DELETE /api/growth/goals/:id
// Delete a goal.
// ──────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const goalId = req.params.id;

  log('DELETE_GOAL', { userId, goalId });

  logDB('DELETE', 'user_goals', { goalId, userId });
  const { error } = await supabaseAdmin
    .from('user_goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId);

  if (error) {
    logError('DELETE /:id', error, { userId, goalId });
    throw error;
  }

  log('DELETE_GOAL_OK', { userId, goalId });
  res.json({ success: true });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /pipeline-insight — FEAT-03
// Lightweight AI-generated insight connecting pipeline health to active goals.
// Cached 24h per user in pipeline_insight_cache or growth_cards.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pipeline-insight', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('PIPELINE_INSIGHT_REQUEST', { userId });

  // Check for a fresh cached insight (< 24h old) stored in growth_cards
  logDB('SELECT', 'growth_cards', { userId, generated_by: 'pipeline_insight', purpose: 'cache_check' });
  const { data: cached } = await supabaseAdmin
    .from('growth_cards')
    .select('title, body, created_at')
    .eq('user_id', userId)
    .eq('generated_by', 'pipeline_insight')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .catch(() => ({ data: null }));

  if (cached?.created_at) {
    const ageMs = Date.now() - new Date(cached.created_at).getTime();
    if (ageMs < 24 * 3600 * 1000) {
      log('PIPELINE_INSIGHT_CACHE_HIT', { userId, ageHours: (ageMs / 3600000).toFixed(1) });
      return res.json({ insight: cached.body, cached: true, generated_at: cached.created_at });
    }
    log('PIPELINE_INSIGHT_CACHE_STALE', { userId, ageHours: (ageMs / 3600000).toFixed(1) });
  } else {
    log('PIPELINE_INSIGHT_CACHE_MISS', { userId });
  }

  // Fetch pipeline metrics + active goals in parallel
  log('PIPELINE_INSIGHT_FETCHING_CONTEXT', { userId });
  logDB('SELECT', 'pipeline_metrics + user_goals + opportunities', { userId, purpose: 'pipeline_insight_context' });

  const [{ data: pipelineMetrics }, { data: activeGoals }, { data: recentLostOpps }] = await Promise.all([
    supabaseAdmin.from('pipeline_metrics').select('*').eq('user_id', userId).single(),
    supabaseAdmin.from('user_goals')
      .select('goal_text, goal_type, current_value, target_value, target_unit, target_date, status')
      .eq('user_id', userId).eq('status', 'active'),
    supabaseAdmin.from('opportunities')
      .select('lost_reason, stage, last_stage_changed_at')
      .eq('user_id', userId).eq('stage', 'closed_lost')
      .not('lost_reason', 'is', null)
      .order('last_stage_changed_at', { ascending: false })
      .limit(10),
  ]);

  log('PIPELINE_INSIGHT_CONTEXT_FETCHED', {
    userId,
    hasMetrics:     !!pipelineMetrics,
    activeGoals:    activeGoals?.length || 0,
    recentLostOpps: recentLostOpps?.length || 0,
  });

  if (!pipelineMetrics && !activeGoals?.length) {
    log('PIPELINE_INSIGHT_INSUFFICIENT_DATA', { userId, reason: 'no_metrics_or_goals' });
    return res.json({ insight: null, cached: false });
  }

  // Compute days-in-stage for active deals
  logDB('SELECT', 'opportunities', { userId, purpose: 'stale_deal_check', stages: 'contacted,replied,call_demo' });
  const { data: activeDeals } = await supabaseAdmin
    .from('opportunities')
    .select('stage, last_stage_changed_at, marked_sent_at')
    .eq('user_id', userId)
    .in('stage', ['contacted', 'replied', 'call_demo']);

  const staleDeals = (activeDeals || []).filter(d => {
    const ref = d.last_stage_changed_at || d.marked_sent_at;
    if (!ref) return false;
    return (Date.now() - new Date(ref).getTime()) / 86400000 > 5;
  });

  log('PIPELINE_INSIGHT_STALE_DEALS', { userId, staleDeals: staleDeals.length, activeDeals: activeDeals?.length || 0 });

  // Build lost reason summary
  const lostReasons = {};
  for (const opp of (recentLostOpps || [])) {
    lostReasons[opp.lost_reason] = (lostReasons[opp.lost_reason] || 0) + 1;
  }
  const lostReasonSummary = Object.entries(lostReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `${r} (${c}x)`).join(', ');

  if (lostReasonSummary) {
    log('PIPELINE_INSIGHT_LOSS_PATTERNS', { userId, topReasons: lostReasonSummary });
  }

  logAI('callWithFallback (pipeline_insight)', {
    userId,
    activeGoals:    activeGoals?.length || 0,
    staleDeals,
    pipelineValue:  pipelineMetrics?.pipeline_value || 0,
    winRate:        pipelineMetrics?.win_rate_pct || 0,
  });

  const systemPrompt = `You are Clutch, an AI sales coach. Generate a 2-3 sentence pipeline health observation for a founder.

PIPELINE METRICS:
- Contacted: ${pipelineMetrics?.contacted_count || 0}, Replied: ${pipelineMetrics?.replied_count || 0}
- Call/Demo: ${pipelineMetrics?.call_demo_count || 0}, Closed Won: ${pipelineMetrics?.closed_won_count || 0}
- Closed Lost: ${pipelineMetrics?.closed_lost_count || 0}
- Win Rate: ${pipelineMetrics?.win_rate_pct || 0}%
- Closed Revenue: $${pipelineMetrics?.total_revenue || 0}
- Pipeline Value: $${pipelineMetrics?.pipeline_value || 0}
- Stale deals (5+ days in stage): ${staleDeals.length}
${lostReasonSummary ? `- Top loss reasons: ${lostReasonSummary}` : ''}

ACTIVE GOALS:
${(activeGoals || []).map(g =>
  `- "${g.goal_text}": ${g.current_value || 0}/${g.target_value || '?'} ${g.target_unit || ''}${g.target_date ? ` (due ${new Date(g.target_date).toLocaleDateString()})` : ''}`
).join('\n') || 'No active goals set.'}

RULES:
- Be direct and specific. Reference actual numbers.
- Identify ONE concrete bottleneck or opportunity in the pipeline.
- Connect pipeline performance to their goals if relevant.
- If stale deals exist, mention them.
- If loss reasons appear, identify the pattern.
- Do NOT start with "I" or "Your pipeline".
- 2-3 sentences max. No bullet points.

Respond ONLY as JSON: { "insight": "<2-3 sentences>" }`;

  const { content, tokens_in, tokens_out } = await callWithFallback({
    systemPrompt,
    messages: [{ role: 'user', content: 'Generate the pipeline insight.' }],
    temperature: 0.35,
    maxTokens: 200,
  });

  await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);
  logAI('callWithFallback complete', { userId, tokens_in, tokens_out });

  let insight = null;
  try {
    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
    insight = parsed.insight || null;
  } catch (parseErr) {
    logError('pipeline-insight JSON parse', parseErr, { userId, rawLength: content?.length });
  }

  if (insight) {
    // Cache it as a growth card so it shows up in growth feed too
    logDB('INSERT', 'growth_cards', { userId, generated_by: 'pipeline_insight', purpose: 'cache_and_feed' });
    await supabaseAdmin.from('growth_cards').insert({
      user_id:      userId,
      card_type:    'insight',
      title:        'Pipeline Health',
      body:         insight,
      action_label: 'View Pipeline',
      action_type:  'internal_link',
      priority:     6,
      expires_at:   new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      generated_by: 'pipeline_insight',
      metadata:     { pipeline_metrics: pipelineMetrics },
    }).catch(cacheErr => logError('pipeline-insight cache insert', cacheErr, { userId }));

    log('PIPELINE_INSIGHT_OK', { userId, insightLength: insight.length });
  } else {
    log('PIPELINE_INSIGHT_EMPTY', { userId, reason: 'ai_returned_no_insight' });
  }

  res.json({ insight, cached: false, generated_at: new Date().toISOString() });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /:goalId/notes — UPGRADED with rich context + explicit_delta (FEAT-01/02)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:goalId/notes', asyncHandler(async (req, res) => {
  const { goalId } = req.params;
  const userId = req.user.id;
  // FEAT-01: accept explicit_delta as a separate field from the frontend.
  const { note_text, explicit_delta } = req.body;

  log('LOG_GOAL_NOTE', {
    userId,
    goalId,
    noteLength:       note_text?.length || 0,
    has_explicit_delta: explicit_delta != null,
    explicit_delta:   explicit_delta ?? null,
    notePreview:      note_text?.slice(0, 60),
  });

  if (!note_text?.trim()) {
    log('LOG_GOAL_NOTE_VALIDATION_FAIL', { userId, goalId, reason: 'missing note_text' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Note text is required' });
  }

  // Fetch goal + 6 rich context signals in parallel
  log('LOG_GOAL_NOTE_FETCHING_CONTEXT', { userId, goalId, sources: 7 });
  logDB('SELECT', 'user_goals + goal_notes + daily_check_ins + user_memory + pipeline_metrics + practice_sessions + user_goals(all)', {
    userId,
    goalId,
    purpose: 'rich_coaching_context',
  });

  const [
    { data: goal },
    { data: previousNotes },
    { data: checkIns },
    { data: memoryFacts },
    { data: pipelineMetrics },
    { data: practiceSessions },
    { data: allGoals },
  ] = await Promise.all([
    supabaseAdmin.from('user_goals').select('*').eq('id', goalId).eq('user_id', userId).single(),
    supabaseAdmin.from('goal_notes').select('note_text, ai_response, progress_delta, sentiment, created_at')
      .eq('goal_id', goalId).eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
    supabaseAdmin.from('daily_check_ins').select('mood_score, answers, created_at')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('user_memory').select('fact_text, fact_category, reinforcement_count')
      .eq('user_id', userId).eq('is_active', true).order('reinforcement_count', { ascending: false }).limit(10),
    supabaseAdmin.from('pipeline_metrics').select('pipeline_value, replied_count, call_demo_count, closed_won_count, total_revenue, closed_lost_count, win_rate_pct')
      .eq('user_id', userId).single(),
    supabaseAdmin.from('practice_sessions').select('scenario_type, message_strength_score, completed, created_at')
      .eq('user_id', userId).eq('completed', true).order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('user_goals').select('goal_text, current_value, target_value, target_unit, status')
      .eq('user_id', userId).eq('status', 'active'),
  ]);

  log('LOG_GOAL_NOTE_CONTEXT_FETCHED', {
    userId,
    goalId,
    goalFound:          !!goal,
    previousNotes:      previousNotes?.length || 0,
    recentCheckIns:     checkIns?.length || 0,
    memoryFacts:        memoryFacts?.length || 0,
    hasPipelineMetrics: !!pipelineMetrics,
    practiceSessions:   practiceSessions?.length || 0,
    otherActiveGoals:   (allGoals?.length || 0) - 1,
  });

  if (!goal) {
    log('LOG_GOAL_NOTE_NOT_FOUND', { userId, goalId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Goal not found' });
  }

  log('LOG_GOAL_NOTE_GOAL_STATE', {
    userId,
    goalId,
    goalText:       goal.goal_text?.slice(0, 60),
    currentValue:   goal.current_value ?? 0,
    targetValue:    goal.target_value ?? null,
    targetUnit:     goal.target_unit  || null,
    daysUntilTarget: goal.target_date
      ? Math.ceil((new Date(goal.target_date) - new Date()) / 86400000)
      : null,
    status: goal.status,
  });

  // Build context blocks
  const notesContext = previousNotes?.length
    ? `PREVIOUS LOGS FOR THIS GOAL (newest first):\n${previousNotes.map((n, i) =>
        `[${i + 1}] ${new Date(n.created_at).toLocaleDateString()} | delta: ${n.progress_delta ?? 0} | mood: ${n.sentiment ?? 'unknown'}\n  "${n.note_text}"\n  Coach said: "${(n.ai_response || '').slice(0, 120)}..."`
      ).join('\n')}`
    : 'PREVIOUS LOGS: None — this is their first log for this goal.';

  const avgMood = checkIns?.length
    ? (checkIns.reduce((s, c) => s + (c.mood_score || 3), 0) / checkIns.length).toFixed(1)
    : null;

  const moodContext = checkIns?.length
    ? `RECENT MOOD SCORES (1-5): ${checkIns.map(c => c.mood_score ?? '?').join(', ')} → avg ${avgMood}/5\nLatest check-in: ${
        checkIns[0]?.answers
          ? Object.entries(checkIns[0].answers).slice(0, 2).map(([q, a]) => `"${q}": "${a}"`).join(' | ')
          : 'no answers'
      }`
    : '';

  const memoryContext = memoryFacts?.length
    ? `WHAT CLUTCH KNOWS ABOUT THIS FOUNDER:\n${memoryFacts.map(f => `[${f.fact_category}] ${f.fact_text}`).join('\n')}`
    : '';

  const pipelineContext = pipelineMetrics
    ? `PIPELINE: $${pipelineMetrics.pipeline_value?.toLocaleString() || 0} value | ${pipelineMetrics.replied_count || 0} replies | ${pipelineMetrics.call_demo_count || 0} demos | ${pipelineMetrics.closed_won_count || 0} won ($${pipelineMetrics.total_revenue?.toLocaleString() || 0}) | win rate: ${pipelineMetrics.win_rate_pct || 0}%`
    : '';

  const practiceContext = practiceSessions?.length
    ? `PRACTICE: ${practiceSessions.length} completed sessions. Avg score: ${Math.round(
        practiceSessions.filter(s => s.message_strength_score).reduce((s, p) => s + (p.message_strength_score || 0), 0) /
        Math.max(1, practiceSessions.filter(s => s.message_strength_score).length)
      )}/100`
    : '';

  const otherGoalsContext = allGoals?.filter(g => g.goal_text !== goal.goal_text).length
    ? `OTHER ACTIVE GOALS:\n${allGoals.filter(g => g.goal_text !== goal.goal_text)
        .map(g => `- "${g.goal_text}": ${g.current_value ?? 0}/${g.target_value ?? '?'} ${g.target_unit ?? ''}`).join('\n')}`
    : '';

  // ── FEAT-02: Velocity projection ──────────────────────────────
  const progressHistory = previousNotes?.map(n => n.progress_delta || 0) || [];
  const avgProgressPerLog = progressHistory.length
    ? (progressHistory.reduce((s, d) => s + d, 0) / progressHistory.length).toFixed(1)
    : null;
  const pctComplete = goal.target_value
    ? Math.round(((goal.current_value || 0) / goal.target_value) * 100)
    : null;
  const daysUntilTarget = goal.target_date
    ? Math.ceil((new Date(goal.target_date) - new Date()) / 86400000)
    : null;

  let velocityBlock = '';
  let projectedStatus = null;

  if (avgProgressPerLog && parseFloat(avgProgressPerLog) > 0 && goal.target_value) {
    const remaining  = goal.target_value - (goal.current_value || 0);
    const logsNeeded = Math.ceil(remaining / parseFloat(avgProgressPerLog));

    let avgDaysBetweenLogs = null;
    if (previousNotes?.length >= 2) {
      const timestamps = previousNotes.map(n => new Date(n.created_at).getTime()).sort((a, b) => a - b);
      const gaps = timestamps.slice(1).map((t, i) => (t - timestamps[i]) / 86400000);
      avgDaysBetweenLogs = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    }

    let projectionStr = '';
    if (avgDaysBetweenLogs && remaining > 0) {
      const projectedDays = Math.ceil(logsNeeded * avgDaysBetweenLogs);
      const projectedDate = new Date(Date.now() + projectedDays * 86400000);
      const isOnTrack     = !daysUntilTarget || projectedDays <= daysUntilTarget;
      projectedStatus     = isOnTrack ? 'ON_TRACK' : 'BEHIND_PACE';
      projectionStr       = ` | Projected: ${projectedDate.toLocaleDateString()} (${isOnTrack ? 'ON TRACK ✓' : `BEHIND PACE — ${projectedDays - (daysUntilTarget || 0)} days late ⚠️`})`;
    }

    velocityBlock = `Velocity: avg +${avgProgressPerLog} ${goal.target_unit || ''}/log | ${remaining > 0 ? `~${logsNeeded} more logs needed` : 'target reached'}${projectionStr}`;

    log('LOG_GOAL_NOTE_VELOCITY', {
      userId,
      goalId,
      avgProgressPerLog,
      logsNeeded,
      avgDaysBetweenLogs: avgDaysBetweenLogs?.toFixed(1) || null,
      projectedStatus:    projectedStatus || 'unknown',
      pctComplete:        pctComplete ?? null,
    });
  }

  logAI('callWithFallback (goal_note_coaching)', {
    userId,
    goalId,
    previousNotes:      previousNotes?.length || 0,
    avgMood,
    projectedStatus,
    has_explicit_delta: explicit_delta != null,
    pctComplete:        pctComplete ?? null,
  });

  const systemPrompt = `You are Clutch, an AI sales coach with deep memory of this founder's journey.

FOUNDER: ${req.user.business_name || 'Unknown'} | ${req.user.product_description || 'No description'} | ${req.user.role || 'founder'} | ${req.user.industry || ''}
${memoryContext}

GOAL: "${goal.goal_text}"
Progress: ${goal.current_value ?? 0} / ${goal.target_value ?? '?'} ${goal.target_unit ?? ''}${pctComplete !== null ? ` (${pctComplete}%)` : ''}${daysUntilTarget !== null ? ` | ${daysUntilTarget} days left` : ''}
${velocityBlock}

${notesContext}

${moodContext}
${pipelineContext}
${practiceContext}
${otherGoalsContext}

TODAY'S NOTE: "${note_text.trim()}"
${explicit_delta != null ? `NUMERIC PROGRESS LOGGED: ${explicit_delta} ${goal.target_unit || ''} (user-confirmed — do not re-extract this number, just reference it in coaching)` : ''}

COACHING RULES:
- You have their full history above. USE IT. Reference specifics.
- First log: acknowledge starting point, set what you'll watch.
- Returning log: reference what changed since last time. Compare to pattern.
- If BEHIND PACE is shown in velocity, address it directly with urgency. Name the gap in days.
- If ON TRACK, briefly acknowledge and push for acceleration.
- If pipeline is stagnant and goal relates to sales, connect those dots explicitly.
- If win_rate is low alongside a revenue/clients goal, say so plainly.
- Low mood (< 2.5 avg) + slow progress = acknowledge momentum dip briefly.
- ONE concrete next action. Not a list. One thing. Make it specific to their product and goal.
- NEVER say "Great job!", "Keep it up!", "That's amazing!"
- NEVER be generic. Every sentence should be impossible to say to a different founder.

${explicit_delta != null
  ? 'NOTE: The user already told you the numeric progress. Set progress_delta to 0 — the system will use their explicit value instead. Focus your response purely on the qualitative coaching.'
  : 'Extract the numeric progress from the note if mentioned.'}

Respond ONLY as JSON:
{
  "progress_delta": <number — extract numeric progress ONLY if explicit_delta was not provided. Otherwise always 0.>,
  "coaching_response": "<3-5 sentences. Specific. References their history and velocity. ONE next action.>",
  "needs_tip_card": <true if stuck/frustrated/significantly behind pace>,
  "tip_context": "<if needs_tip_card: one specific sentence on what kind of tip helps most. null otherwise>"
}`.trim();

  const { content, tokens_in, tokens_out } = await callWithFallback({
    systemPrompt,
    messages:    [{ role: 'user', content: 'Analyze this progress note and respond as instructed.' }],
    temperature: 0.4,
    maxTokens:   500,
  });

  await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);
  logAI('callWithFallback complete', { userId, goalId, tokens_in, tokens_out });

  let parsed;
  try {
    parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
    log('LOG_GOAL_NOTE_AI_PARSED', {
      userId,
      goalId,
      progress_delta_from_ai: parsed.progress_delta,
      needs_tip_card:         parsed.needs_tip_card,
      coaching_length:        parsed.coaching_response?.length || 0,
    });
  } catch (parseErr) {
    logError('goal_note AI JSON parse', parseErr, { userId, goalId, rawLength: content?.length });
    parsed = {
      progress_delta:    0,
      coaching_response: 'Note saved. Keep logging — patterns across entries make coaching better.',
      needs_tip_card:    false,
      tip_context:       null,
    };
  }

  // FEAT-01: use explicit_delta when provided; otherwise use AI extraction
  const delta    = explicit_delta != null
    ? (parseFloat(explicit_delta) || 0)
    : (parseFloat(parsed.progress_delta) || 0);
  const newValue = Math.max(0, (goal.current_value ?? 0) + delta);

  log('LOG_GOAL_NOTE_PROGRESS', {
    userId,
    goalId,
    delta_source:    explicit_delta != null ? 'explicit_user' : 'ai_extracted',
    delta,
    old_value:       goal.current_value ?? 0,
    new_value:       newValue,
    goal_completed:  goal.target_value ? newValue >= goal.target_value : false,
  });

  if (delta !== 0) {
    logDB('RPC', 'increment_goal_progress', { goalId, delta });
    await supabaseAdmin.rpc('increment_goal_progress', { p_goal_id: goalId, p_delta: delta });
  }

  if (goal.target_value && newValue >= goal.target_value && goal.status === 'active') {
    log('LOG_GOAL_NOTE_GOAL_COMPLETED', { userId, goalId, finalValue: newValue, targetValue: goal.target_value });
    logDB('UPDATE', 'user_goals', { goalId, status: 'completed' });
    await supabaseAdmin.from('user_goals')
      .update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', goalId);
  }

  logDB('INSERT', 'goal_notes', { userId, goalId, delta, sentiment: parsed.needs_tip_card ? 'negative' : delta > 0 ? 'positive' : 'neutral' });
  const { data: note, error: noteError } = await supabaseAdmin.from('goal_notes').insert({
    goal_id:        goalId,
    user_id:        userId,
    note_text:      note_text.trim(),
    ai_response:    parsed.coaching_response,
    progress_delta: delta,
    sentiment:      parsed.needs_tip_card ? 'negative' : delta > 0 ? 'positive' : 'neutral',
  }).select().single();

  if (noteError) {
    logError('goal_note INSERT', noteError, { userId, goalId });
    throw noteError;
  }

  log('LOG_GOAL_NOTE_SAVED', { userId, goalId, noteId: note.id, delta, newValue });

  // Fire-and-forget tip card generation
  if (parsed.needs_tip_card && parsed.tip_context) {
    logJob('tip_card_generation', { userId, goalId, status: 'triggered', tip_context: parsed.tip_context?.slice(0, 80) });

    (async () => {
      try {
        logAI('callWithFallback (tip_card)', { userId, goalId });
        const { content: tc, tokens_in: tIn, tokens_out: tOut } = await callWithFallback({
          systemPrompt: `Generate a growth tip. Context: ${parsed.tip_context}. Goal: ${goal.goal_text}. Product: ${req.user.product_description ?? ''}. Respond ONLY as JSON: { "title": "<10 words max>", "body": "<2-3 sentences actionable advice>" }`,
          messages: [{ role: 'user', content: 'Generate the tip.' }],
          temperature: 0.5, maxTokens: 150,
        });
        await recordTokenUsage(userId, 'groq', tIn, tOut);

        const tip = JSON.parse(tc.replace(/```json|```/g, '').trim());
        logDB('INSERT', 'growth_cards', { userId, goalId, card_type: 'tip', generated_by: 'goal_note_ai' });
        await supabaseAdmin.from('growth_cards').insert({
          user_id:      userId,
          card_type:    'tip',
          title:        tip.title,
          body:         tip.body,
          action_label: 'Log more progress',
          action_type:  'internal_chat',
          priority:     7,
          expires_at:   new Date(Date.now() + 86400000).toISOString(),
          generated_by: 'goal_note_ai',
          metadata:     { goal_id: goalId },
        });
        logJob('tip_card_generation', { userId, goalId, status: 'success' });
      } catch (tipErr) {
        logError('tip_card_generation', tipErr, { userId, goalId });
      }
    })();
  }

  log('LOG_GOAL_NOTE_OK', {
    userId,
    goalId,
    noteId:        note.id,
    delta,
    new_value:     newValue,
    goal_completed: goal.target_value ? newValue >= goal.target_value : false,
    tip_card_queued: !!(parsed.needs_tip_card && parsed.tip_context),
  });

  res.status(201).json({
    success:           true,
    note,
    coaching_response: parsed.coaching_response,
    progress_delta:    delta,
    new_value:         newValue,
    goal_completed:    goal.target_value ? newValue >= goal.target_value : false,
  });
}));

// ──────────────────────────────────────────
// GET /api/growth/goals/:goalId/notes
// Retrieve notes history for a goal.
// ──────────────────────────────────────────
router.get('/:goalId/notes', asyncHandler(async (req, res) => {
  const { goalId } = req.params;
  const userId = req.user.id;

  log('LIST_GOAL_NOTES', { userId, goalId });

  logDB('SELECT', 'user_goals', { goalId, userId, purpose: 'ownership_check' });
  const { data: goal, error: goalError } = await supabaseAdmin
    .from('user_goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single();

  if (goalError || !goal) {
    log('LIST_GOAL_NOTES_NOT_FOUND', { userId, goalId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Goal not found' });
  }

  logDB('SELECT', 'goal_notes', { goalId, userId, limit: 50 });
  const { data: notes, error: notesError } = await supabaseAdmin
    .from('goal_notes')
    .select('id, note_text, ai_response, progress_delta, sentiment, created_at')
    .eq('goal_id', goalId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (notesError) {
    logError('GET /:goalId/notes', notesError, { userId, goalId });
    throw notesError;
  }

  log('LIST_GOAL_NOTES_OK', { userId, goalId, count: notes?.length || 0 });
  res.json({ notes: notes || [] });
}));

// ──────────────────────────────────────────
// DELETE /api/growth/goals/:goalId/notes/:noteId
// Remove a single note from a goal.
// ──────────────────────────────────────────
router.delete('/:goalId/notes/:noteId', asyncHandler(async (req, res) => {
  const { goalId, noteId } = req.params;
  const userId = req.user.id;

  log('DELETE_GOAL_NOTE', { userId, goalId, noteId });

  logDB('DELETE', 'goal_notes', { noteId, userId });
  const { error } = await supabaseAdmin
    .from('goal_notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId);

  if (error) {
    logError('DELETE /:goalId/notes/:noteId', error, { userId, goalId, noteId });
    throw error;
  }

  log('DELETE_GOAL_NOTE_OK', { userId, goalId, noteId });
  res.json({ success: true });
}));

export default router;
