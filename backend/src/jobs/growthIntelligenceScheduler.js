// src/jobs/growthIntelligenceScheduler.js
// ============================================================
// GROWTH INTELLIGENCE SCHEDULER
// Queues daily tips, check-in prompts, and weekly plans
// for all active users via message_queue
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import groqService from '../services/groq.js';
import { notifyUser } from '../services/notifications.js';
import { QUEUE_JOB_TYPES } from '../config/constants.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chunk = (arr, size) => Array.from(
  { length: Math.ceil(arr.length / size) },
  (_, i) => arr.slice(i * size, i * size + size)
);

// ─────────────────────────────────────────────────────────────────────────────
// DAILY TIP GENERATION JOB (runs at 7am)
// Generates a personalized growth card for each active user
// who hasn't had a tip generated in the last 20 hours.
// ─────────────────────────────────────────────────────────────────────────────
export const runDailyTipGeneration = async () => {
  console.log('[GrowthScheduler] Daily tip generation starting...');
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, archetype, product_description, target_audience, voice_profile, business_name, bio, industry, role, fcm_token')
    .eq('onboarding_completed', true)
    .eq('is_deleted', false)
    .not('product_description', 'is', null)
    .or(`last_tip_generated_at.is.null,last_tip_generated_at.lt.${cutoff}`);

  if (!users?.length) {
    console.log('[GrowthScheduler] No users need tip generation');
    return;
  }

  console.log(`[GrowthScheduler] Generating tips for ${users.length} users`);
  let generated = 0;

  for (const batch of chunk(users, 5)) {
    await Promise.allSettled(batch.map(user => generateAndStoreTip(user)));
    generated += batch.length;
    await sleep(2000);
  }

  console.log(`[GrowthScheduler] Daily tips generated for ${generated} users`);
};

export const runAdaptiveCurriculumJob = async () => {
  console.log('[CurriculumJob] Starting...');
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Find users who practiced this week
  const { data: activeUsers } = await supabaseAdmin
    .from('practice_sessions')
    .select('user_id')
    .eq('completed', true)
    .gte('created_at', sevenDaysAgo);

  if (!activeUsers?.length) return;

  const userIds = [...new Set(activeUsers.map(u => u.user_id))];
  console.log(`[CurriculumJob] Generating curricula for ${userIds.length} users`);

  for (const userId of userIds) {
    try {
      const [{ data: user }, { data: skillRows }, { data: recentSessions }] = await Promise.all([
        supabaseAdmin.from('users').select('*').eq('id', userId).single(),
        supabaseAdmin.from('user_skill_profile').select('*').eq('user_id', userId).order('period_start', { ascending: false }).limit(4),
        supabaseAdmin.from('practice_sessions').select('scenario_type').eq('user_id', userId).eq('completed', true).order('created_at', { ascending: false }).limit(10),
      ]);

      if (!user) continue;

      const curriculum = await groqService.generateAdaptiveCurriculum(user, skillRows || [], recentSessions || []);
      if (!curriculum) continue;

      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      await supabaseAdmin.from('practice_curriculum').upsert({
        user_id: userId, curriculum, expires_at: expiresAt, created_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      await notifyUser(userId, {
        title: 'Your practice plan for this week is ready 🎯',
        body:  'Clutch analyzed your skill scores and has a personalized plan for you.',
        data:  { type: 'curriculum_ready' },
      });

      await new Promise(r => setTimeout(r, 500)); // rate limit
    } catch (err) {
      console.error(`[CurriculumJob] Failed for user ${userId}:`, err.message);
    }
  }

  console.log(`[CurriculumJob] Done`);
};

export const runSkillProfileAggregationJob = async () => {
  console.log('[SkillProfileJob] Starting...');
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const periodStart  = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const periodEnd    = new Date().toISOString().split('T')[0];

  const { data: users } = await supabaseAdmin.from('users')
    .select('id').eq('onboarding_completed', true).eq('is_deleted', false);

  if (!users?.length) return;

  console.log(`[SkillProfileJob] Processing ${users.length} users`);

  // Issue 12 fix: batch users in groups of 10 with a 1s sleep between batches
  // Prevents serial N+1 DB hammering at scale (was unbatched, no sleep before)
  const BATCH_SIZE = 10;
  let processed = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(batch.map(async ({ id: userId }) => {
      try {
        const { data: sessions } = await supabaseAdmin.from('practice_sessions')
          .select('skill_scores').eq('user_id', userId).eq('completed', true)
          .gte('created_at', sevenDaysAgo).not('skill_scores', 'is', null);

        if (!sessions?.length) return;

        const axes = ['clarity', 'value', 'discovery', 'objection_handling', 'brevity', 'cta_strength'];
        const avgs = {};
        for (const axis of axes) {
          const vals = sessions.filter(s => s.skill_scores?.axes?.[axis] != null).map(s => s.skill_scores.axes[axis]);
          avgs[axis] = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
        }

        const overallVals = sessions.filter(s => s.skill_scores?.session_score != null).map(s => s.skill_scores.session_score);
        const overallAvg  = overallVals.length > 0 ? +(overallVals.reduce((a, b) => a + b, 0) / overallVals.length).toFixed(2) : null;

        const axisEntries = Object.entries(avgs).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
        const weakest     = axisEntries[0]?.[0]  || null;
        const strongest   = axisEntries[axisEntries.length - 1]?.[0] || null;

        await supabaseAdmin.from('user_skill_profile').insert({
          user_id: userId, period_start: periodStart, period_end: periodEnd,
          clarity_avg: avgs.clarity, value_avg: avgs.value, discovery_avg: avgs.discovery,
          objection_avg: avgs.objection_handling, brevity_avg: avgs.brevity, cta_avg: avgs.cta_strength,
          overall_avg: overallAvg, sessions_count: sessions.length,
          weakest_axis: weakest, strongest_axis: strongest,
        });
        processed++;
      } catch (err) {
        console.error(`[SkillProfileJob] Failed for user ${userId}:`, err.message);
      }
    }));

    // Sleep 1s between batches to avoid overwhelming the DB
    if (i + BATCH_SIZE < users.length) await sleep(1000);
  }

  console.log(`[SkillProfileJob] Done — ${processed} profiles updated`);
};


const generateAndStoreTip = async (user) => {
  try {
    const archetype = user.archetype || 'seller';

    const { data: goals } = await supabaseAdmin
      .from('user_goals')
      .select('goal_text, target_value, target_unit, current_value')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(2);

    // Get last 2 check-in answers for context
    const { data: recentCheckIns } = await supabaseAdmin
      .from('daily_check_ins')
      .select('answers, ai_response')
      .eq('user_id', user.id)
      .not('answers', 'eq', '{}')
      .order('date', { ascending: false })
      .limit(2);

    // Generate up to 3 varied tips (tip, challenge, reflection)
    const tips = await groqService.generateDailyTips(user, archetype, goals || [], recentCheckIns || []);

    const priorities = [8, 6, 4];
    const expiresAt  = new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin.from('growth_cards').insert(
      tips.map((tip, i) => ({
        user_id:      user.id,
        card_type:    tip.card_type || 'tip',
        title:        tip.title,
        body:         tip.body,
        action_label: tip.action_label,
        action_type:  tip.action_type,
        priority:     priorities[i] ?? 4,
        expires_at:   expiresAt,
        generated_by: 'ai_daily',
        metadata:     tip.metadata || {}
      }))
    );

    await supabaseAdmin
      .from('users')
      .update({ last_tip_generated_at: new Date().toISOString() })
      .eq('id', user.id);

    // Push notification uses the first (highest-priority) tip
    if (user.fcm_token) {
      await notifyUser(user.id, {
        title: `Your growth tips for today 🌱`,
        body:  tips[0].title,
        data:  { type: 'daily_tip' }
      });
    }
  } catch (err) {
    console.error(`[GrowthScheduler] Tip generation failed for user ${user.id}:`, err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHECK-IN SCHEDULER (runs at 2pm, sends prompts for 3pm delivery)
// Sends a personalized check-in notification to users who:
// - Have a check_in_time set to 15:xx (default)
// - Haven't checked in today
// ─────────────────────────────────────────────────────────────────────────────
export const runCheckInScheduler = async () => {
  console.log('[GrowthScheduler] Check-in scheduler running...');
  const today = new Date().toISOString().split('T')[0];

  // Fetch users who haven't checked in today — need full profile for question generation
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, fcm_token, check_in_time, name, archetype, product_description, target_audience, voice_profile, business_name')
    .eq('onboarding_completed', true)
    .eq('is_deleted', false)
    .or(`last_check_in_at.is.null,last_check_in_at.lt.${today}T00:00:00`);

  if (!users?.length) return;

  const now         = new Date();
  const currentHour = now.getHours();

  for (const user of users) {
    const preferredHour = parseInt(user.check_in_time?.split(':')[0] || '15');
    if (Math.abs(currentHour - preferredHour) > 0) continue;
    if (!user.fcm_token) continue;

    // Pre-generate personalized questions and save to daily_check_ins
    // so when the user opens the app, questions are already there (no loading)
    await preGenerateCheckIn(user, today).catch(err =>
      console.error(`[GrowthScheduler] Pre-gen check-in failed for ${user.id}:`, err.message)
    );

    // Re-fetch the questions we just saved (or use fallback for notification)
    const { data: checkIn } = await supabaseAdmin
      .from('daily_check_ins')
      .select('questions')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    const firstQuestion = checkIn?.questions?.[0] || getFallbackQuestion(user.archetype);
    const firstName     = user.name?.split(' ')[0] || 'there';

    await notifyUser(user.id, {
      title: `Quick check-in, ${firstName} 👋`,
      body:  firstQuestion,
      data:  { type: 'check_in_prompt' }
    });

    await sleep(150); // Rate-limit notifications
  }

  console.log('[GrowthScheduler] Check-in prompts sent');
};

const getFallbackQuestion = (archetype) => {
  const fallbacks = {
    seller:       "How's the outreach going today?",
    builder:      'Any customer conversations today?',
    freelancer:   'Any new client leads or project updates?',
    creator:      'How did your content perform today?',
    professional: 'Any meaningful connections made today?',
    learner:      'What did you practice or learn today?',
  };
  return fallbacks[archetype || 'seller'];
};

const preGenerateCheckIn = async (user, today) => {
  // Don't overwrite if already exists
  const { data: existing } = await supabaseAdmin
    .from('daily_check_ins')
    .select('id')
    .eq('user_id', user.id)
    .eq('date', today)
    .single();

  if (existing) return;

  // Get recent coach chat context (last 3 messages)
  const { data: recentMessages } = await supabaseAdmin
    .from('chat_messages')
    .select('content')
    .eq('user_id', user.id)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(4);

  const chatContext = recentMessages
    ?.map(m => m.content?.slice(0, 150))
    .join(' | ')
    .slice(0, 500) || '';

  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('goal_text, target_value, target_unit, current_value')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(2);

  // Use the personalized AI question generator
  const questions = await groqService.generateCheckInQuestions(
    user, user.archetype || 'seller', chatContext, goals || []
  );

  await supabaseAdmin.from('daily_check_ins').insert({
    user_id:      user.id,
    date:         today,
    questions,
    chat_context: chatContext,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PLAN GENERATION (runs Sunday 6pm)
// ─────────────────────────────────────────────────────────────────────────────
export const runWeeklyPlanGeneration = async () => {
  console.log('[GrowthScheduler] Weekly plan generation starting...');

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, archetype, product_description, target_audience, voice_profile, business_name, fcm_token')
    .eq('onboarding_completed', true)
    .eq('is_deleted', false)
    .not('product_description', 'is', null);

  if (!users?.length) return;

  for (const batch of chunk(users, 3)) {
    await Promise.allSettled(batch.map(user => generateWeeklyPlanForUser(user)));
    await sleep(3000);
  }

  console.log(`[GrowthScheduler] Weekly plans generated`);
};

const generateWeeklyPlanForUser = async (user) => {
  try {
    const [{ data: goals }, { data: metrics }, { data: recentCheckIns }] = await Promise.all([
      supabaseAdmin.from('user_goals').select('*').eq('user_id', user.id).eq('status', 'active').limit(3),
      supabaseAdmin.from('user_performance_profiles').select('*').eq('user_id', user.id).single(),
      // Issue 15 fix: pass recent check-ins so the weekly plan reflects the user's
      // actual activity and mood, not just abstract performance metrics
      supabaseAdmin
        .from('daily_check_ins')
        .select('answers, mood_score, date')
        .eq('user_id', user.id)
        .not('processed_at', 'is', null)
        .order('date', { ascending: false })
        .limit(3),
    ]);

    const plan = await groqService.generateWeeklyPlan(
      user, user.archetype || 'seller', metrics, goals || [], recentCheckIns || []
    );

    const nextWeekExpiry = new Date();
    nextWeekExpiry.setDate(nextWeekExpiry.getDate() + 7);

    await supabaseAdmin.from('growth_cards').insert({
      user_id:      user.id,
      card_type:    'strategy',
      title:        plan.title,
      body:         plan.body,
      action_label: 'See full plan',
      action_type:  'internal_chat',
      priority:     10,
      expires_at:   nextWeekExpiry.toISOString(),
      generated_by: 'ai_weekly',
      metadata:     { daily_actions: plan.daily_actions, focus_area: plan.focus_area }
    });

    if (user.fcm_token) {
      await notifyUser(user.id, {
        title: 'Your weekly growth plan is ready 📋',
        body:  plan.focus_area ? `This week: ${plan.focus_area}` : 'Tap to see your personalized plan',
        data:  { type: 'weekly_plan' }
      });
    }
  } catch (err) {
    console.error(`[GrowthScheduler] Weekly plan failed for user ${user.id}:`, err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ARCHETYPE DETECTION FOR NEW USERS
// Called after onboarding completes (from onboarding.js route)
// ─────────────────────────────────────────────────────────────────────────────
export const detectAndSaveArchetype = async (userId, user) => {
  try {
    const result = await groqService.detectUserArchetype(user, user.onboarding_answers || {});
    await supabaseAdmin
      .from('users')
      .update({
        archetype:             result.archetype,
        archetype_detected_at: new Date().toISOString()
      })
      .eq('id', userId);

    console.log(`[GrowthScheduler] Archetype detected for ${userId}: ${result.archetype} (${Math.round(result.confidence * 100)}% confidence)`);
    return result.archetype;
  } catch (err) {
    console.error(`[GrowthScheduler] Archetype detection failed for ${userId}:`, err.message);
    return 'seller';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GOAL NUDGE JOB (runs at 9am daily)
// Notifies users who have active goals that are either:
//   - Within 7 days of their target date, OR
//   - Have had no progress note logged in the last 5 days
// Minimum 3 days between nudges per goal (last_goal_nudge_at).
//
// DB requirements (run before first use):
//   ALTER TABLE user_goals
//     ADD COLUMN IF NOT EXISTS last_goal_nudge_at timestamptz;
// ─────────────────────────────────────────────────────────────────────────────
export const runGoalNudgeJob = async () => {
  console.log('[GoalNudge] Starting...');
  const now         = Date.now();
  const nudgeCutoff = new Date(now - 3  * 86400000).toISOString(); // 3-day min between nudges
  const staleCutoff = new Date(now - 5  * 86400000).toISOString(); // no note in 5 days
  const deadlineCutoff = new Date(now + 7 * 86400000).toISOString(); // target within 7 days

  try {
    // Fetch active goals that haven't been nudged recently
    const { data: goals } = await supabaseAdmin
      .from('user_goals')
      .select(`
        id, user_id, goal_text, target_date, last_goal_nudge_at,
        users!inner(id, fcm_token, is_deleted)
      `)
      .eq('status', 'active')
      .eq('users.is_deleted', false)
      .or(`last_goal_nudge_at.is.null,last_goal_nudge_at.lt.${nudgeCutoff}`)
      .limit(200);

    if (!goals?.length) {
      console.log('[GoalNudge] No goals need nudging');
      return;
    }

    // Fetch recent goal notes to check staleness
    const goalIds = goals.map(g => g.id);
    const { data: recentNotes } = await supabaseAdmin
      .from('goal_notes')
      .select('goal_id, created_at')
      .in('goal_id', goalIds)
      .gte('created_at', staleCutoff);

    const recentNoteGoalIds = new Set((recentNotes || []).map(n => n.goal_id));

    let nudged = 0;
    for (const goal of goals) {
      const user = goal.users;
      if (!user?.fcm_token) continue;

      const deadlineSoon  = goal.target_date && new Date(goal.target_date) <= new Date(deadlineCutoff);
      const noteStale     = !recentNoteGoalIds.has(goal.id);

      if (!deadlineSoon && !noteStale) continue;

      // Compute days since last note
      const mostRecentNote = (recentNotes || [])
        .filter(n => n.goal_id === goal.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const daysSinceNote = mostRecentNote
        ? Math.round((now - new Date(mostRecentNote.created_at).getTime()) / 86400000)
        : null;

      const body = deadlineSoon
        ? `Your goal "${goal.goal_text.slice(0, 50)}" is coming up soon — want to log progress?`
        : `You haven't logged progress on "${goal.goal_text.slice(0, 40)}" in ${daysSinceNote ?? '5+'} days — want to talk it through with Clutch?`;

      await notifyUser(user.id, {
        title: `Goal check-in 🎯`,
        body,
        data:  { type: 'goal_nudge', goal_id: goal.id },
      }).catch(() => {});

      await supabaseAdmin
        .from('user_goals')
        .update({ last_goal_nudge_at: new Date().toISOString() })
        .eq('id', goal.id);

      nudged++;
      await sleep(200);
    }

    console.log(`[GoalNudge] Done — ${nudged} nudges sent`);
  } catch (err) {
    console.error('[GoalNudge] Fatal:', err.message);
  }
};

export default {
  runDailyTipGeneration,
  runCheckInScheduler,
  runWeeklyPlanGeneration,
  detectAndSaveArchetype,
  runGoalNudgeJob,
};
