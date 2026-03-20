// src/services/notifications.js
// Firebase Cloud Messaging push notification service

import { getMessaging } from '../config/firebase.js';
import supabaseAdmin from '../config/supabase.js';

/**
 * Send a push notification to a specific device token.
 * Silently handles failed/expired tokens.
 */
export const sendPushNotification = async (fcmToken, { title, body, data = {} }) => {
  if (!fcmToken) return { sent: false, reason: 'no_token' };

  const messaging = getMessaging();
  if (!messaging) return { sent: false, reason: 'firebase_not_initialized' };

  const message = {
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])  // FCM requires string values
    ),
    token: fcmToken,
    android: { priority: 'high', notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } }
  };

  try {
    await messaging.send(message);
    return { sent: true };
  } catch (err) {
    // Invalid/expired token - clean it up so we don't keep trying
    if (
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token'
    ) {
      await supabaseAdmin
        .from('users')
        .update({ fcm_token: null })
        .eq('fcm_token', fcmToken)
        .catch(() => {});  // Don't throw if cleanup fails
    }
    console.warn('[Notifications] Push failed:', err.code || err.message);
    return { sent: false, reason: err.code };
  }
};

/**
 * Send notification to a user by their user ID.
 * Looks up their FCM token from DB.
 */
export const notifyUser = async (userId, notification) => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('fcm_token')
    .eq('id', userId)
    .single();

  if (!user?.fcm_token) return { sent: false, reason: 'no_token' };

  return sendPushNotification(user.fcm_token, notification);
};

// Pre-built notification templates
export const Notifications = {
  newOpportunities: (count) => ({
    title: `${count} new ${count === 1 ? 'opportunity' : 'opportunities'} ready 🎯`,
    body: 'Clutch found people who need what you offer. Tap to review.',
    data: { type: 'new_opportunities', count: String(count) }
  }),

  feedbackPrompt: (context) => ({
    title: "Quick check-in 👋",
    body: `How did your outreach go? Tap to let Clutch know.`,
    data: { type: 'feedback_prompt', opportunity_id: context.opportunityId || '' }
  }),

  practiceReminder: () => ({
    title: "3-minute practice 💪",
    body: "Build confidence before your next outreach. Quick scenario waiting.",
    data: { type: 'practice_reminder' }
  }),

  streakAlert: (days) => ({
    title: `${days}-day streak! 🔥`,
    body: "You're on a roll. Keep the momentum going.",
    data: { type: 'streak', days: String(days) }
  }),

  fallbackSearchNotice: () => ({
    title: "Search limit reached",
    body: "Today's live search is done. Practice opportunities are ready instead.",
    data: { type: 'search_limit' }
  }),
  dailyTip: (tipTitle) => ({
    title: `Your growth tip for today 🌱`,
    body:  tipTitle || 'A personalized tip is ready for you',
    data:  { type: 'daily_tip' }
  }),

  checkInPrompt: (firstName, question) => ({
    title: `Check in, ${firstName || 'there'} 👋`,
    body:  question || 'Quick daily reflection — takes 2 minutes',
    data:  { type: 'check_in_prompt' }
  }),

  weeklyPlan: (focusArea) => ({
    title: 'Your weekly growth plan is ready 📋',
    body:  focusArea ? `This week: ${focusArea}` : 'Tap to see your personalized plan',
    data:  { type: 'weekly_plan' }
  }),

  goalMilestone: (pct, goalText) => ({
    title: `${pct}% toward your goal! 🎯`,
    body:  goalText?.slice(0, 60) || 'Keep pushing — you\'re making real progress',
    data:  { type: 'goal_milestone' }
  })
};

export default { sendPushNotification, notifyUser, Notifications };
