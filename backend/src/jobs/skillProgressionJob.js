// src/jobs/skillProgressionJob.js
// ============================================================
// SKILL PROGRESSION TRACKER
// Runs weekly (Sunday 9pm, after pattern detection).
//
// What it does:
//   1. Aggregates conversation_analyses scores for the past week
//   2. Merges with practice session skill scores (user_skill_profile)
//   3. Stores a composite weekly snapshot in skill_progression
//   4. Computes week-over-week delta for each dimension
//   5. Sends a push notification celebrating improvement or
//      encouraging focus on the weakest skill
//
// This data drives:
//   - The Skill Radar chart on the /insights page
//   - The week-over-week delta section in the weekly email digest
//   - The "Your One Focus" CTA in growth cards
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { notifyUser } from '../services/notifications.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// MAIN ENTRY POINT
// ──────────────────────────────────────────
export const runSkillProgressionJob = async () => {
  const startTime = Date.now();
  console.log(`[SkillProgressionJob] Starting ${new Date().toISOString()}`);
  await logJob('skill_progression', 'started');

  let processed = 0;
  const weekStart = getWeekStart();

  try {
    // Find users with any activity this week (conversation analyses OR practice sessions)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [{ data: convUsers }, { data: practiceUsers }] = await Promise.all([
      supabaseAdmin
        .from('conversation_analyses')
        .select('user_id')
        .gte('created_at', sevenDaysAgo),
      supabaseAdmin
        .from('practice_sessions')
        .select('user_id')
        .eq('completed', true)
        .gte('created_at', sevenDaysAgo),
    ]);

    const uniqueUserIds = [
      ...new Set([
        ...(convUsers || []).map(r => r.user_id),
        ...(practiceUsers || []).map(r => r.user_id),
      ])
    ];

    if (!uniqueUserIds.length) {
      console.log('[SkillProgressionJob] No active users this week');
      await logJob('skill_progression', 'completed', { processed: 0, duration_ms: Date.now() - startTime });
      return;
    }

    console.log(`[SkillProgressionJob] Processing ${uniqueUserIds.length} users`);

    for (const userId of uniqueUserIds) {
      try {
        await snapshotSkillsForUser(userId, weekStart, sevenDaysAgo);
        processed++;
      } catch (err) {
        console.error(`[SkillProgressionJob] Failed for user ${userId}:`, err.message);
      }
      await sleep(500);
    }

    await logJob('skill_progression', 'completed', { processed, duration_ms: Date.now() - startTime });
    console.log(`[SkillProgressionJob] Done — ${processed} users processed`);

  } catch (err) {
    console.error('[SkillProgressionJob] Fatal:', err.message);
    await logJob('skill_progression', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// SNAPSHOT SKILLS FOR ONE USER
// ──────────────────────────────────────────
const snapshotSkillsForUser = async (userId, weekStart, sevenDaysAgo) => {
  // Load conversation analyses from this week
  const { data: analyses } = await supabaseAdmin
    .from('conversation_analyses')
    .select('hook_score, clarity_score, value_prop_score, personalization_score, cta_score, tone_score, outcome, word_count')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo);

  // Load practice skill profile from this week (aggregated by runSkillProfileAggregationJob)
  const { data: practiceProfile } = await supabaseAdmin
    .from('user_skill_profile')
    .select('clarity_avg, value_avg, discovery_avg, objection_avg, brevity_avg, cta_avg, overall_avg, weakest_axis, strongest_axis, sessions_count')
    .eq('user_id', userId)
    .gte('period_start', sevenDaysAgo)
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Compute averages from conversation analyses
  const convAnalysisCount = analyses?.length || 0;
  const avg = (field) => {
    if (!convAnalysisCount) return null;
    const vals = (analyses || []).filter(a => a[field] != null).map(a => a[field]);
    return vals.length ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;
  };

  const positiveCount = (analyses || []).filter(a => a.outcome === 'positive').length;
  const positiveRate  = convAnalysisCount > 0 ? parseFloat((positiveCount / convAnalysisCount).toFixed(3)) : null;

  // Map conversation analysis scores to the skill_progression schema
  // Hook → hook_score_avg
  // Clarity → blend of conversation clarity + practice clarity
  const hookAvg          = avg('hook_score');
  const clarityConvAvg   = avg('clarity_score');
  const valuePropAvg     = avg('value_prop_score');
  const personalizationAvg = avg('personalization_score');
  const ctaConvAvg       = avg('cta_score');
  const toneAvg          = avg('tone_score');

  // Blend practice and real-world clarity/cta if both available
  const clarityBlended = blend(clarityConvAvg, practiceProfile?.clarity_avg != null ? practiceProfile.clarity_avg / 10 : null);
  const ctaBlended     = blend(ctaConvAvg, practiceProfile?.cta_avg != null ? practiceProfile.cta_avg / 10 : null);

  // Compute composite
  const allScores = [hookAvg, clarityBlended, valuePropAvg, personalizationAvg, ctaBlended, toneAvg].filter(v => v != null);
  const compositeAvg = allScores.length ? parseFloat((allScores.reduce((s, v) => s + v, 0) / allScores.length).toFixed(2)) : null;

  // Determine top weakness and strength
  const scoreDimensions = [
    { name: 'hook',            score: hookAvg },
    { name: 'clarity',         score: clarityBlended },
    { name: 'value_prop',      score: valuePropAvg },
    { name: 'personalization', score: personalizationAvg },
    { name: 'cta',             score: ctaBlended },
    { name: 'tone',            score: toneAvg },
  ].filter(d => d.score != null).sort((a, b) => a.score - b.score);

  const topWeakness = scoreDimensions[0]?.name || practiceProfile?.weakest_axis || null;
  const topStrength = scoreDimensions[scoreDimensions.length - 1]?.name || practiceProfile?.strongest_axis || null;
  const hasAnyData = compositeAvg != null || (practiceProfile?.sessions_count || 0) > 0;
  if (!hasAnyData) {
  console.log(`[SkillProgressionJob] ⚠ Skipping all-null upsert for user ${userId} — no analyses or practice sessions found`);
  return;
}

  // Load previous week's snapshot for delta computation
  const { data: prevWeek } = await supabaseAdmin
    .from('skill_progression')
    .select('*')
    .eq('user_id', userId)
    .lt('week_start', weekStart)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Compute composite delta
  const prevComposite = prevWeek?.composite_score_avg;
  const compositeDelta = compositeAvg != null && prevComposite != null
    ? parseFloat((compositeAvg - prevComposite).toFixed(2))
    : null;

  // Upsert the snapshot
  await supabaseAdmin
    .from('skill_progression')
    .upsert({
      user_id:                   userId,
      week_start:                weekStart,
      hook_score_avg:            hookAvg,
      clarity_score_avg:         clarityBlended,
      value_prop_score_avg:      valuePropAvg,
      personalization_score_avg: personalizationAvg,
      cta_score_avg:             ctaBlended,
      tone_score_avg:            toneAvg,
      composite_score_avg:       compositeAvg,
      positive_outcome_rate:     positiveRate,
      messages_analyzed:         convAnalysisCount,
      practice_sessions:         practiceProfile?.sessions_count || 0,
      top_weakness:              topWeakness,
      top_strength:              topStrength,
      composite_delta:           compositeDelta,
    }, { onConflict: 'user_id,week_start' });

  // Send a push notification with the progress summary
  await sendProgressNotification(userId, {
    compositeAvg,
    compositeDelta,
    topWeakness,
    topStrength,
    messagesAnalyzed:   convAnalysisCount,
    practiceSessions:   practiceProfile?.sessions_count || 0,
    positiveRate,
  });

  console.log(`[SkillProgressionJob] ✓ Snapshot stored for user ${userId} | composite: ${compositeAvg ?? 'N/A'}/10 | delta: ${compositeDelta ?? 'N/A'}`);
};

// ──────────────────────────────────────────
// PUSH NOTIFICATION FOR SKILL PROGRESS
// ──────────────────────────────────────────
const sendProgressNotification = async (userId, { compositeAvg, compositeDelta, topWeakness, topStrength, messagesAnalyzed, positiveRate }) => {
  try {
    let title, body;

    if (compositeDelta != null && compositeDelta > 0.3) {
      title = `Your communication is improving 📈`;
      body  = `Score up ${compositeDelta.toFixed(1)} points this week. ${topStrength ? `Strongest skill: ${DIMENSION_LABELS[topStrength] || topStrength}.` : ''}`;
    } else if (compositeDelta != null && compositeDelta < -0.3) {
      title = `Time to sharpen your messaging 🎯`;
      body  = topWeakness
        ? `Your ${DIMENSION_LABELS[topWeakness] || topWeakness} score needs attention. Clutch has a tip ready.`
        : `Check your weekly intelligence report for insights.`;
    } else if (messagesAnalyzed > 0) {
      title = `Weekly performance snapshot ready 📊`;
      body  = positiveRate != null
        ? `${Math.round(positiveRate * 100)}% positive rate this week. Tap to see your communication breakdown.`
        : `Your weekly performance insights are ready. Tap to review.`;
    } else {
      // No messages this week — encourage activity
      title = `Start logging outcomes for insights 💡`;
      body  = `Mark your outreach results to unlock your communication patterns.`;
    }

    await notifyUser(userId, {
      title,
      body,
      data: { type: 'skill_progression', week: getWeekStart() }
    });
  } catch (err) {
    console.warn(`[SkillProgressionJob] Push notification failed for ${userId}:`, err.message);
  }
};

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────
const blend = (a, b) => {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return parseFloat(((a + b) / 2).toFixed(2));
};

const getWeekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
};

const DIMENSION_LABELS = {
  hook:            'Hook Strength',
  clarity:         'Message Clarity',
  value_prop:      'Value Proposition',
  personalization: 'Personalization',
  cta:             'Call to Action',
  tone:            'Tone Fit',
};

export default { runSkillProgressionJob };
