// src/jobs/growthPushNotificationJob.js
// ============================================================
// GROWTH PUSH NOTIFICATION JOB
// Sends up to 2 targeted push notifications per user per day.
//
// Schedule:
//   Run 1 — 9am daily:  Morning insight push
//     • If user has unread Pattern Intelligence cards → surfaces top insight
//     • Else if user has unread growth tips          → surfaces top tip
//     • Else                                          → motivation/streak nudge
//
//   Run 2 — 6pm daily:  Evening action push
//     • Surfaces an actionable growth challenge for the evening
//     • Or a "practice your weakness" nudge if skill data exists
//     • Skipped if user already has 2+ push notifications today
//
// Anti-spam rules:
//   - Max 2 pushes per user per 24 hours (tracked in push_notification_log)
//   - Min 6 hours between pushes for same user
//   - Skipped entirely for users who had no app activity in last 14 days (avoid churned users)
//   - Only sends to users who have an fcm_token
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { notifyUser } from '../services/notifications.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// RUN 1: MORNING INSIGHT PUSH (9am)
// ──────────────────────────────────────────
export const runMorningGrowthPush = async () => {
  const startTime = Date.now();
  console.log(`[GrowthPush/Morning] Starting ${new Date().toISOString()}`);
  await logJob('growth_push_morning', 'started');

  let sent = 0;

  try {
    const users = await getEligibleUsers();
    console.log(`[GrowthPush/Morning] ${users.length} eligible users`);

    for (const user of users) {
      try {
        // Check daily push count — max 2 per day
        if (await getDailyPushCount(user.id) >= 2) continue;

        // Check min 6h gap from last push
        if (await getHoursSinceLastPush(user.id) < 6) continue;

        const notification = await buildMorningNotification(user);
        if (!notification) continue;

        const result = await notifyUser(user.id, notification);
        if (result?.sent) {
          await logPushSent(user.id, 'morning_growth', notification.title);
          sent++;
        }
      } catch (err) {
        console.warn(`[GrowthPush/Morning] Failed for user ${user.id}:`, err.message);
      }
      await sleep(150);
    }

    await logJob('growth_push_morning', 'completed', { sent, duration_ms: Date.now() - startTime });
    console.log(`[GrowthPush/Morning] Done — ${sent} notifications sent`);
  } catch (err) {
    console.error('[GrowthPush/Morning] Fatal:', err.message);
    await logJob('growth_push_morning', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// RUN 2: EVENING ACTION PUSH (6pm)
// ──────────────────────────────────────────
export const runEveningGrowthPush = async () => {
  const startTime = Date.now();
  console.log(`[GrowthPush/Evening] Starting ${new Date().toISOString()}`);
  await logJob('growth_push_evening', 'started');

  let sent = 0;

  try {
    const users = await getEligibleUsers();
    console.log(`[GrowthPush/Evening] ${users.length} eligible users`);

    for (const user of users) {
      try {
        // Max 2 per day
        if (await getDailyPushCount(user.id) >= 2) continue;

        // Min 6h gap from last push
        if (await getHoursSinceLastPush(user.id) < 6) continue;

        const notification = await buildEveningNotification(user);
        if (!notification) continue;

        const result = await notifyUser(user.id, notification);
        if (result?.sent) {
          await logPushSent(user.id, 'evening_growth', notification.title);
          sent++;
        }
      } catch (err) {
        console.warn(`[GrowthPush/Evening] Failed for user ${user.id}:`, err.message);
      }
      await sleep(150);
    }

    await logJob('growth_push_evening', 'completed', { sent, duration_ms: Date.now() - startTime });
    console.log(`[GrowthPush/Evening] Done — ${sent} notifications sent`);
  } catch (err) {
    console.error('[GrowthPush/Evening] Fatal:', err.message);
    await logJob('growth_push_evening', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// MORNING NOTIFICATION BUILDER
// Priority: Pattern Intelligence → Unread tip → Streak/Motivation
// ──────────────────────────────────────────
const buildMorningNotification = async (user) => {
  const userId = user.id;

  // 1. Check for unread Pattern Intelligence cards (highest priority)
  const { data: patternCard } = await supabaseAdmin
    .from('growth_cards')
    .select('id, title, body')
    .eq('user_id', userId)
    .eq('generated_by', 'ai_pattern_detection')
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (patternCard) {
    return {
      title: `Pattern detected in your outreach 🔍`,
      body:  patternCard.title || 'Clutch found a key pattern in your conversations. Tap to see what it means.',
      data:  { type: 'pattern_insight', card_id: patternCard.id }
    };
  }

  // 2. Check for unread high-priority growth tip
  const { data: tipCard } = await supabaseAdmin
    .from('growth_cards')
    .select('id, title, card_type')
    .eq('user_id', userId)
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .in('card_type', ['tip', 'insight', 'challenge'])
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tipCard) {
    const typeEmoji = { tip: '💡', insight: '✨', challenge: '⚡' }[tipCard.card_type] || '💡';
    return {
      title: `Your growth tip is waiting ${typeEmoji}`,
      body:  tipCard.title || 'A personalized insight is ready for you today.',
      data:  { type: 'daily_tip', card_id: tipCard.id }
    };
  }

  // 3. Check for pending feedback opportunities to log
  const { data: pendingFeedback } = await supabaseAdmin
    .from('opportunities')
    .select('id, platform, target_name')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .lt('marked_sent_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (pendingFeedback) {
    const platform = pendingFeedback.platform || 'outreach';
    return {
      title: `Log your ${platform} result 📊`,
      body:  `Tell Clutch what happened with your message — it helps detect patterns in your communication.`,
      data:  { type: 'feedback_prompt', opportunity_id: pendingFeedback.id }
    };
  }

  // 4. Streak motivation
  const streak = user.check_in_streak || 0;
  if (streak >= 3) {
    return {
      title: `${streak}-day streak! Keep going 🔥`,
      body:  `You're building real momentum. Quick daily check-in to stay on track.`,
      data:  { type: 'streak', days: String(streak) }
    };
  }

  // 5. Generic morning nudge for users with no recent activity
  return {
    title: `Good morning — ready to grow? ☀️`,
    body:  `Review your growth tips and practice your pitch in under 3 minutes.`,
    data:  { type: 'morning_nudge' }
  };
};

// ──────────────────────────────────────────
// EVENING NOTIFICATION BUILDER
// Priority: Weakness practice → Challenge card → Pending opportunity → Practice nudge
// ──────────────────────────────────────────
const buildEveningNotification = async (user) => {
  const userId = user.id;

  // 1. Check if user has a known weak skill and hasn't practiced it recently
  const { data: latestProgression } = await supabaseAdmin
    .from('skill_progression')
    .select('top_weakness, composite_score_avg, composite_delta')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestProgression?.top_weakness) {
    const weakness = latestProgression.top_weakness;
    const weaknessLabel = DIMENSION_LABELS[weakness] || weakness;

    // Check if they've done any practice in last 2 days
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const { data: recentPractice } = await supabaseAdmin
      .from('practice_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('created_at', twoDaysAgo)
      .limit(1)
      .maybeSingle();

    if (!recentPractice) {
      return {
        title: `3 minutes to fix your ${weaknessLabel} 💪`,
        body:  `This is your #1 skill gap. A quick practice session could move the needle tonight.`,
        data:  { type: 'practice_weakness', weakness }
      };
    }
  }

  // 2. Check for an unread challenge card
  const { data: challengeCard } = await supabaseAdmin
    .from('growth_cards')
    .select('id, title')
    .eq('user_id', userId)
    .eq('card_type', 'challenge')
    .eq('is_read', false)
    .eq('is_dismissed', false)
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeCard) {
    return {
      title: `Evening challenge waiting ⚡`,
      body:  challengeCard.title || `A quick 3-minute challenge is ready to sharpen your skills.`,
      data:  { type: 'challenge', card_id: challengeCard.id }
    };
  }

  // 3. Practice nudge — general (if no specific weakness targeted)
  const { data: practiceSessions } = await supabaseAdmin
    .from('practice_sessions')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!practiceSessions) {
    // First-time practice nudge
    return {
      title: `Try your first practice session 🎯`,
      body:  `Simulate a real sales conversation and get instant coaching feedback. Takes 3 minutes.`,
      data:  { type: 'practice_first_time' }
    };
  }

  // 4. Generic evening reflection prompt
  return {
    title: `How did your outreach go today? 🤔`,
    body:  `Log your results and let Clutch find patterns in your conversations.`,
    data:  { type: 'evening_reflection' }
  };
};

// ──────────────────────────────────────────
// USER ELIGIBILITY
// Only users with fcm_token who were active in last 14 days
// ──────────────────────────────────────────
const getEligibleUsers = async () => {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, check_in_streak, archetype, name')
    .eq('onboarding_completed', true)
    .eq('is_deleted', false)
    .not('fcm_token', 'is', null)
    .or(`last_check_in_at.gte.${fourteenDaysAgo},last_tip_generated_at.gte.${fourteenDaysAgo}`);

  return users || [];
};

// ──────────────────────────────────────────
// PUSH LOG HELPERS
// Uses push_notification_log table for anti-spam enforcement
// ──────────────────────────────────────────
const getDailyPushCount = async (userId) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin
    .from('push_notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', startOfDay.toISOString());

  return count || 0;
};

const getHoursSinceLastPush = async (userId) => {
  const { data: latest } = await supabaseAdmin
    .from('push_notification_log')
    .select('sent_at')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.sent_at) return Infinity;
  return (Date.now() - new Date(latest.sent_at).getTime()) / 3600000;
};

const logPushSent = async (userId, pushType, title) => {
  await supabaseAdmin
    .from('push_notification_log')
    .insert({
      user_id:    userId,
      push_type:  pushType,
      title:      title?.slice(0, 200) || null,
      sent_at:    new Date().toISOString(),
    })
    .catch(err => console.warn('[GrowthPush] Log insert failed:', err.message));
};

// ──────────────────────────────────────────
// DIMENSION LABELS
// ──────────────────────────────────────────
const DIMENSION_LABELS = {
  hook:            'Hook Strength',
  clarity:         'Message Clarity',
  value_prop:      'Value Proposition',
  personalization: 'Personalization',
  cta:             'Call to Action',
  tone:            'Tone Fit',
};

export default { runMorningGrowthPush, runEveningGrowthPush };
