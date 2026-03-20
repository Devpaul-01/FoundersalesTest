// src/routes/growth.js
// ============================================================
// GROWTH INTELLIGENCE API
// Powers: unified feed, daily tips, check-ins, archetypes, plans, history
//
// REFACTOR (Audit §5): All /goals routes extracted to routes/goals.js
// Mounted at /api/growth/goals in app.js.
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import groqService from '../services/groq.js';
import { notifyUser } from '../services/notifications.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING (Issue 25)
// Consistent with practice.txt and opportunities.txt logging patterns.
// ──────────────────────────────────────────
const log = (event, data = {}) => {
  const parts = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[Growth] ${event}${parts.length ? ` → ${parts.join(' ')}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.error(`[Growth] ❌ ${fn} — ${err?.message || err}${parts.length ? ` | ${parts.join(' ')}` : ''}`);
};

const logDB = (op, table, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[Growth] 🗄️  DB ${op} → table=${table}${parts.length ? ` ${parts.join(' ')}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[Growth] 🤖 AI ${fn}${parts.length ? ` → ${parts.join(' ')}` : ''}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/growth/feed
// Unified feed: growth_cards + recent opportunities, merged and sorted.
// Growth cards are primary for non-Seller archetypes.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/feed', asyncHandler(async (req, res) => {
  const userId    = req.user.id;
  const archetype = req.user.archetype || 'seller';
  const limit     = parseInt(req.query.limit) || 20;
  log('FEED request', { userId, archetype, limit });

  const now   = new Date().toISOString();
  const today = now.split('T')[0];

  // Parallel fetch: growth cards + recent opportunities
  const [cardsResult, oppsResult] = await Promise.allSettled([
    supabaseAdmin
      .from('growth_cards')
      .select('id, card_type, title, body, action_label, action_type, priority, metadata, created_at, is_read')
      .eq('user_id', userId)
      .eq('is_dismissed', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),

    supabaseAdmin
      .from('opportunities')
      // Issue 4 fix: 'score' column does not exist on the opportunities table.
      // All inserts write to 'composite_score' — use that for select and ordering.
      .select('id, target_name, target_context, platform, prepared_message, composite_score, created_at')
      .eq('user_id', userId)
      .eq('stage', 'new')
      .order('composite_score', { ascending: false })
      .limit(5),
  ]);

  const cards = cardsResult.status === 'fulfilled' ? cardsResult.value.data || [] : [];
  const opps  = oppsResult.status  === 'fulfilled' ? oppsResult.value.data  || [] : [];
  log('FEED fetched', { userId, cards: cards.length, opps: opps.length });

  // Check if first-time user (no cards ever generated)
  const { count } = await supabaseAdmin
    .from('growth_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count === 0) {
    log('FEED first-time user — triggering card generation', { userId });
    generateFirstTimeCards(userId, req.user).catch(err =>
      logError('generateFirstTimeCards', err, { userId })
    );
  }

  // Get active goals for context
  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('id, goal_text, current_value, target_value, target_unit, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(3);

  res.json({
    cards:    cards,
    opportunities: opps,
    goals:    goals || [],
    archetype,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/growth/cards/:id/read
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cards/:id/read', asyncHandler(async (req, res) => {
  log('CARD READ', { userId: req.user.id, cardId: req.params.id });
  await supabaseAdmin
    .from('growth_cards')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  logDB('UPDATE', 'growth_cards', { cardId: req.params.id, is_read: true });
  res.json({ success: true });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/growth/cards/:id/dismiss
// ─────────────────────────────────────────────────────────────────────────────
router.post('/cards/:id/dismiss', asyncHandler(async (req, res) => {
  log('CARD DISMISS', { userId: req.user.id, cardId: req.params.id });
  await supabaseAdmin
    .from('growth_cards')
    .update({ is_dismissed: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  logDB('UPDATE', 'growth_cards', { cardId: req.params.id, is_dismissed: true });
  res.json({ success: true });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/growth/checkin/today
// Returns today's check-in or generates fresh questions if none exists.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/checkin/today', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today  = new Date().toISOString().split('T')[0];
  log('CHECKIN TODAY request', { userId, today });

  const { data: existing } = await supabaseAdmin
    .from('daily_check_ins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (existing) {
    log('CHECKIN TODAY cache hit', { userId, checkInId: existing.id, processed: !!existing.processed_at });
    return res.json({ check_in: existing, is_new: false });
  }

  const { data: recentMessages } = await supabaseAdmin
    .from('chat_messages')
    .select('content, role')
    .eq('user_id', userId)
    // Issue 16 fix: include BOTH roles. Previously only 'assistant' messages were fetched,
    // missing the user's own words. User messages reveal what they're actually thinking
    // and doing — far more valuable for generating specific, relevant check-in questions.
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(8);

  const chatContext = recentMessages
    ?.map(m => m.content?.slice(0, 200))
    .join(' | ')
    .slice(0, 600) || '';

  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('goal_text, target_value, target_unit, current_value')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(2);

  logAI('generateCheckInQuestions', { userId, archetype: req.user.archetype || 'seller' });
  const questions = await groqService.generateCheckInQuestions(
    req.user, req.user.archetype || 'seller', chatContext, goals || []
  );

  const { data: newCheckIn } = await supabaseAdmin
    .from('daily_check_ins')
    .insert({ user_id: userId, date: today, questions, chat_context: chatContext })
    .select()
    .single();

  logDB('INSERT', 'daily_check_ins', { userId, date: today, checkInId: newCheckIn?.id });
  log('CHECKIN TODAY created', { userId, checkInId: newCheckIn?.id });
  res.json({ check_in: newCheckIn, is_new: true });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/growth/checkin
// Submit answers to today's check-in.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkin', asyncHandler(async (req, res) => {
  const { answers, mood_score, date } = req.body;
  const userId = req.user.id;
  const today  = date || new Date().toISOString().split('T')[0];
  log('CHECKIN SUBMIT', { userId, today, mood_score, hasAnswers: !!answers });

  if (!answers || typeof answers !== 'object') {
    log('CHECKIN SUBMIT validation fail', { userId, reason: 'no answers' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'answers required' });
  }

  // Issue 19 fix: cap answers payload size to prevent large objects being stored
  // and later injected verbatim into Groq prompts (security + prompt injection risk).
  const answersJson = JSON.stringify(answers);
  if (answersJson.length > 5000) {
    log('CHECKIN SUBMIT validation fail', { userId, reason: 'answers_too_large', size: answersJson.length });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'Check-in answers are too long. Please keep each answer under 500 characters.',
    });
  }

  const { data: checkIn } = await supabaseAdmin
    .from('daily_check_ins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  if (!checkIn) {
    log('CHECKIN SUBMIT not found', { userId, today });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'No check-in found for today' });
  }

  // Issue 20 fix: block re-submission of an already-completed check-in.
  if (checkIn.processed_at) {
    log('CHECKIN SUBMIT already completed', { userId, checkInId: checkIn.id });
    return res.status(409).json({
      error:   'ALREADY_SUBMITTED',
      message: 'You have already completed today\'s check-in.',
      check_in_streak: req.user.check_in_streak || 0,
    });
  }

  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('goal_text, current_value, target_value, target_unit')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(3);

  logAI('generateCheckInResponse', { userId, archetype: req.user.archetype || 'seller', mood_score });
  const { response_text, next_tip_seed } = await groqService.generateCheckInResponse(
    req.user, req.user.archetype || 'seller', checkIn.questions, answers, goals || [],
    mood_score || null
  );

  await supabaseAdmin
    .from('daily_check_ins')
    .update({
      answers,
      mood_score:   mood_score || null,
      ai_response:  response_text,
      processed_at: new Date().toISOString()
    })
    .eq('id', checkIn.id);
  logDB('UPDATE', 'daily_check_ins', { checkInId: checkIn.id, userId, processed: true });

  const newStreak = await computeCheckInStreak(userId, today);

  await supabaseAdmin
    .from('users')
    .update({ last_check_in_at: new Date().toISOString(), check_in_streak: newStreak })
    .eq('id', userId);
  logDB('UPDATE', 'users', { userId, check_in_streak: newStreak });

  generateTipFromCheckIn(userId, req.user, answers, next_tip_seed, goals, mood_score).catch(err =>
    logError('generateTipFromCheckIn (async)', err, { userId })
  );

  log('CHECKIN SUBMIT complete', { userId, streak: newStreak });
  res.json({
    success:         true,
    ai_response:     response_text,
    check_in_streak: newStreak,
    message:         'Check-in saved. Your growth tip for tomorrow has been updated.'
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/growth/history
// Returns paginated past daily tips and weekly plans.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const limit  = parseInt(req.query.limit) || 30;
  const offset = parseInt(req.query.offset) || 0;
  const type   = req.query.type;
  log('HISTORY request', { userId, type, limit, offset });

  let query = supabaseAdmin
    .from('growth_cards')
    .select('id, card_type, title, body, action_label, generated_by, created_at, is_read, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (type === 'tips') {
    query = query.in('card_type', ['tip', 'challenge', 'reflection', 'resource']);
  } else if (type === 'plans') {
    query = query.eq('card_type', 'strategy').eq('generated_by', 'ai_weekly');
  } else {
    // Issue 22 fix: include 'ai_pattern_detection' in the default view.
    // Pattern Intelligence cards were previously excluded from history because
    // only ai_daily/ai_weekly/ai_checkin were listed — users couldn't find them later.
    query = query.in('generated_by', ['ai_daily', 'ai_weekly', 'ai_checkin', 'ai_pattern_detection']);
  }

  const { data: cards, error } = await query;
  if (error) {
    logError('history query', error, { userId, type });
    throw error;
  }

  log('HISTORY result', { userId, count: cards?.length || 0 });
  res.json({ cards: cards || [], total: cards?.length || 0 });
}));

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/growth/archetype/detect
// ─────────────────────────────────────────────────────────────────────────────
router.post('/archetype/detect', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('ARCHETYPE DETECT request', { userId });

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('product_description, target_audience, role, industry, bio, onboarding_answers, archetype, archetype_detected_at')
    .eq('id', userId)
    .single();

  if (!user?.product_description) {
    log('ARCHETYPE DETECT blocked', { userId, reason: 'onboarding_incomplete' });
    return res.status(400).json({ error: 'ONBOARDING_REQUIRED', message: 'Complete onboarding first' });
  }

  // Issue 18 fix: add a 7-day cooldown to prevent unbounded PRO_MODEL calls
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  if (
    user.archetype &&
    user.archetype_detected_at &&
    new Date(user.archetype_detected_at) > sevenDaysAgo
  ) {
    log('ARCHETYPE DETECT cache hit', { userId, archetype: user.archetype, detectedAt: user.archetype_detected_at });
    return res.json({
      success:    true,
      archetype:  user.archetype,
      confidence: null,
      cached:     true,
      message:    'Archetype was detected recently. Re-detection available after 7 days.',
    });
  }

  logAI('detectUserArchetype', { userId });
  const result = await groqService.detectUserArchetype(user, user.onboarding_answers || {});

  await supabaseAdmin
    .from('users')
    .update({ archetype: result.archetype, archetype_detected_at: new Date().toISOString() })
    .eq('id', userId);

  logDB('UPDATE', 'users', { userId, archetype: result.archetype, confidence: result.confidence });
  log('ARCHETYPE DETECT complete', { userId, archetype: result.archetype, confidence: result.confidence });
  res.json({ success: true, archetype: result.archetype, confidence: result.confidence, cached: false });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/growth/plan
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('PLAN request', { userId, archetype: req.user.archetype || 'seller' });

  const weekStart = getWeekStart();
  const { data: existingCard } = await supabaseAdmin
    .from('growth_cards')
    .select('*')
    .eq('user_id', userId)
    .eq('card_type', 'strategy')
    .eq('generated_by', 'ai_weekly')
    .gte('created_at', weekStart)
    .single();

  if (existingCard) {
    log('PLAN cache hit', { userId, cardId: existingCard.id });
    return res.json({ plan: existingCard, cached: true });
  }

  const { data: goals } = await supabaseAdmin
    .from('user_goals').select('*').eq('user_id', userId).eq('status', 'active').limit(3);

  const { data: metrics } = await supabaseAdmin
    .from('user_performance_profiles').select('*').eq('user_id', userId).single();

  // Issue 15 fix: fetch recent check-ins to enrich weekly plan generation
  const { data: recentCheckIns } = await supabaseAdmin
    .from('daily_check_ins')
    .select('answers, mood_score, date')
    .eq('user_id', userId)
    .not('processed_at', 'is', null)
    .order('date', { ascending: false })
    .limit(3);

  logAI('generateWeeklyPlan', { userId, goals: goals?.length || 0, checkIns: recentCheckIns?.length || 0 });
  const plan = await groqService.generateWeeklyPlan(
    req.user, req.user.archetype || 'seller', metrics, goals || [], recentCheckIns || []
  );

  const { data: card } = await supabaseAdmin
    .from('growth_cards')
    .insert({
      user_id:      userId,
      card_type:    'strategy',
      title:        plan.title,
      body:         plan.body,
      action_label: 'Explore this week\'s plan with Clutch',
      action_type:  'internal_chat',
      priority:     9,
      expires_at:   getNextWeekStart(),
      generated_by: 'ai_weekly',
      metadata:     { daily_actions: plan.daily_actions, focus_area: plan.focus_area }
    })
    .select()
    .single();

  logDB('INSERT', 'growth_cards', { userId, cardId: card?.id, type: 'strategy', focus: plan.focus_area });
  log('PLAN generated', { userId, cardId: card?.id, focus: plan.focus_area });
  res.json({ plan: card, cached: false });
}));

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const generateFirstTimeCards = async (userId, user) => {
  const archetype = user.archetype || 'seller';
  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('goal_text, target_value, target_unit, current_value')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(2);

  // IMPROVED (session 1): fetch memory facts and inject into user context
  const { data: memoryFacts } = await supabaseAdmin
    .from('user_memory')
    .select('fact')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('reinforcement_count', { ascending: false })
    .limit(5);

  const enrichedUser = { ...user, _memoryFacts: memoryFacts || [] };

  const tips       = await groqService.generateDailyTips(enrichedUser, archetype, goals || [], []);
  const priorities = [8, 6, 4];
  const expiresAt  = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.from('growth_cards').insert(
    tips.map((tip, i) => ({
      user_id:      userId,
      card_type:    tip.card_type || 'tip',
      title:        tip.title,
      body:         tip.body,
      // FIX (session 1): always route to internal_chat, never internal_goals
      action_label: tip.action_label || 'Explore with Clutch AI',
      action_type:  'internal_chat',
      priority:     priorities[i] ?? 4,
      expires_at:   expiresAt,
      generated_by: 'ai_daily',
      metadata:     tip.metadata || {}
    }))
  );

  await supabaseAdmin
    .from('users')
    .update({ last_tip_generated_at: new Date().toISOString() })
    .eq('id', userId);
};

// IMPROVED (session 1): accepts mood_score so tips adapt tone to user's energy level
const generateTipFromCheckIn = async (userId, user, answers, seed, goals, moodScore = null) => {
  const archetype    = user.archetype || 'seller';
  // IMPROVED (session 1): include mood_score so generateDailyTip can adapt tone
  const recentCheckIns = [{ answers, seed, mood_score: moodScore }];
  const tip = await groqService.generateDailyTip(user, archetype, goals, recentCheckIns);

  await supabaseAdmin.from('growth_cards').insert({
    user_id:      userId,
    card_type:    tip.card_type || 'tip',
    title:        tip.title,
    body:         tip.body,
    // FIX (session 1): consistent action routing — always internal_chat
    action_label: tip.action_label || 'Explore with Clutch AI',
    action_type:  'internal_chat',
    priority:     9,
    expires_at:   new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
    generated_by: 'ai_checkin',
    metadata:     tip.metadata || {}
  });

  await supabaseAdmin
    .from('users')
    .update({ last_tip_generated_at: new Date().toISOString() })
    .eq('id', userId);
};

// NEW (session 1): Computes check_in_streak by counting consecutive days with submitted check-ins
const computeCheckInStreak = async (userId, today) => {
  const { data: checkIns } = await supabaseAdmin
    .from('daily_check_ins')
    .select('date, processed_at')
    .eq('user_id', userId)
    .not('processed_at', 'is', null)  // only count submitted check-ins
    .order('date', { ascending: false })
    .limit(60);

  if (!checkIns?.length) return 1;  // today is the first

  const datesWithCheckIn = new Set(checkIns.map(c => c.date));
  datesWithCheckIn.add(today);  // include today

  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (datesWithCheckIn.has(d)) {
      streak++;
    } else if (i > 0) {
      break;  // gap found — streak ends
    }
  }

  return streak;
};

const getWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const getNextWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export default router;
