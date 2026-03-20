// src/jobs/index.js
// ============================================================
// BACKGROUND JOB REGISTRY — V4 (merged)
//
// NEW JOBS (V4):
//   pattern_detection      — Sunday 8pm  — Pattern Intelligence Engine
//   pattern_insights       — Sunday 8pm  — Pattern Insights (runs after detection)
//   skill_progression      — Sunday 9pm  — Weekly skill score snapshots
//   growth_push_morning    — 9am daily   — Morning growth insight push
//   growth_push_evening    — 6pm daily   — Evening action push
//
// EXISTING JOBS (unchanged):
//   message_queue_worker   — every 30s
//   opportunity_fetch      — every 6h
//   feedback_prompts       — every hour
//   performance_summary    — 2am daily
//   metrics_aggregation    — 3am daily
//   calendar_prep          — 8am daily
//   daily_tip_generation   — 7am daily
//   check_in_scheduler     — 2pm daily
//   weekly_plan            — 6pm Sunday
//   follow_up_check        — 10am daily
//   memory_extraction      — every 30 min
//   email_digest           — 6pm Sunday  (co-scheduled with weekly_plan)
//   goal_nudge_check       — 9am daily   (but after morning push)
//   adaptive_curriculum    — 11pm Sunday
//   skill_profile_agg      — 10pm Sunday (feeds into skill_progression)
// ============================================================

import cron from 'node-cron';
import {
  JOB_INTERVALS, BATCH_SIZE, BATCH_DELAY_MS,
  MIN_MESSAGES_FOR_SUMMARY, SUMMARIZE_EVERY_N_MESSAGES,
  CALENDAR_PREP_HOURS_BEFORE
} from '../config/constants.js';
import { runMessageQueueWorker } from './messageQueueWorker.js';
import { discoverOpportunities } from '../services/perplexity.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { notifyUser, Notifications } from '../services/notifications.js';
import groqService from '../services/groq.js';
import supabaseAdmin from '../config/supabase.js';

// Growth jobs
import {
  runDailyTipGeneration,
  runCheckInScheduler,
  runWeeklyPlanGeneration,
} from './growthIntelligenceScheduler.js';

// Background jobs
import { runFollowupSequenceJob }  from './followupSequenceJob.js';
import { runMemoryExtractionJob }  from './memoryExtractionJob.js';
import { runEmailDigestJob }       from './emailDigestJob.js';
import { runGoalNudgeJob, runAdaptiveCurriculumJob as _runAdaptiveCurriculumJob, runSkillProfileAggregationJob as _runSkillProfileAggregationJob } from './growthIntelligenceScheduler.js';

// V4 jobs
import { runPatternDetectionJob }  from './patternDetectionJob.js';
import { runPatternInsightsJob }   from './patternInsightsJob.js';
import { runSkillProgressionJob }  from './skillProgressionJob.js';
import { runMorningGrowthPush, runEveningGrowthPush } from './growthPushNotificationJob.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const chunk = (arr, size) => Array.from(
  { length: Math.ceil(arr.length / size) },
  (_, i) => arr.slice(i * size, i * size + size)
);

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// JOB: OPPORTUNITY FETCH (every 6h)
// ──────────────────────────────────────────
const runOpportunityJob = async () => {
  const startTime = Date.now();
  console.log(`[OpportunityJob] Starting ${new Date().toISOString()}`);
  await logJob('opportunity_fetch', 'started');

  let processed = 0, found = 0;

  try {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, tier, product_description, target_audience, voice_profile, business_name, role, industry, fcm_token')
      .eq('onboarding_completed', true)
      .eq('is_deleted', false)
      .not('product_description', 'is', null);

    if (!users?.length) {
      await logJob('opportunity_fetch', 'completed', { users_processed: 0, opportunities_found: 0, duration_ms: Date.now() - startTime });
      return;
    }

    for (const batch of chunk(users, BATCH_SIZE)) {
      const results = await Promise.allSettled(batch.map(u => processUserOpportunities(u)));
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') { processed++; found += r.value?.found || 0; }
        else console.error(`[OpportunityJob] User ${batch[i].id} failed:`, r.reason?.message);
      });
      await sleep(BATCH_DELAY_MS);
    }

    await logJob('opportunity_fetch', 'completed', {
      users_processed: processed,
      opportunities_found: found,
      duration_ms: Date.now() - startTime
    });
  } catch (err) {
    console.error('[OpportunityJob] Fatal:', err.message);
    await logJob('opportunity_fetch', 'failed', { error_message: err.message });
  }
};

const processUserOpportunities = async (user) => {
  const result = await discoverOpportunities(user.id, user);
  if (!result.opportunities?.length) return { found: 0 };

  const { data: perfProfile } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('learned_patterns, best_message_style, best_message_length')
    .eq('user_id', user.id)
    .single();

  const scored = await groqService.scoreOpportunities(user, result.opportunities);

  // Issue 5 fix: use MIN_COMPOSITE_SCORE constant, not hardcoded 5
  const qualifying = scored.filter(o =>
    ((o.fit_score || 0) + (o.timing_score || 0) + (o.intent_score || 0)) / 3 >= MIN_COMPOSITE_SCORE
  );

  // Issue 8 fix: fetch existing source_urls for this user to prevent duplicates
  const sourceUrls = qualifying.map(o => o.source_url).filter(Boolean);
  let existingUrls = new Set();
  if (sourceUrls.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from('opportunities')
      .select('source_url')
      .eq('user_id', user.id)
      .in('source_url', sourceUrls);
    existingUrls = new Set((existing || []).map(e => e.source_url));
  }

  let newCount = 0;
  for (const opp of qualifying) {
    // Issue 8 fix: skip if this source_url already exists for this user
    if (opp.source_url && existingUrls.has(opp.source_url)) {
      console.log(`[OpportunityJob] Skipping duplicate source_url for user ${user.id}: ${opp.source_url}`);
      continue;
    }

    // Issue 27 fix: generateOutreachMessage now returns { message, tokens_in, tokens_out }
    const { message, tokens_in, tokens_out } = await groqService.generateOutreachMessage(user, opp, perfProfile);
    await recordTokenUsage(user.id, 'groq', tokens_in || 0, tokens_out || 0);

    // Issue 2 fix: compute and store composite_score
    const compositeScore = ((opp.fit_score || 0) + (opp.timing_score || 0) + (opp.intent_score || 0)) / 3;

    const { error } = await supabaseAdmin.from('opportunities').insert({
      user_id:          user.id,
      platform:         opp.platform || 'reddit',
      source_url:       opp.source_url,
      target_context:   opp.target_context,
      target_name:      opp.target_name || null,   // Issue 6 fix: store target_name
      prepared_message: message,
      fit_score:        opp.fit_score,
      timing_score:     opp.timing_score,
      intent_score:     opp.intent_score,
      composite_score:  compositeScore,             // Issue 2 fix: store composite_score
      message_style:    perfProfile?.best_message_style || 'empathetic',
      message_length:   message ? message.split(' ').length : 0,
      generated_by:     result.model_used,
      status:           'pending',
      stage:            'new'
    });

    if (!error) newCount++;
    await sleep(300);
  }

  if (newCount > 0 && user.fcm_token) {
    await notifyUser(user.id, Notifications.newOpportunities(newCount));
  }

  return { found: newCount };
};

// ──────────────────────────────────────────
// JOB: FEEDBACK PROMPTS (hourly)
// ──────────────────────────────────────────
const runFeedbackPromptJob = async () => {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: opps } = await supabaseAdmin
    .from('opportunities')
    .select('id, user_id')
    .eq('status', 'sent')
    .lt('marked_sent_at', cutoff)
    .limit(100);

  if (!opps?.length) return;

  const { data: feedbackExists } = await supabaseAdmin
    .from('feedback')
    .select('opportunity_id')
    .in('opportunity_id', opps.map(o => o.id));

  const withFeedback = new Set(feedbackExists?.map(f => f.opportunity_id) || []);

  const { data: deletedUsers } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('is_deleted', true)
    .in('id', [...new Set(opps.map(o => o.user_id))]);
  const deletedIds = new Set((deletedUsers || []).map(u => u.id));

  const needPrompt = opps.filter(o =>
    !withFeedback.has(o.id) && !deletedIds.has(o.user_id)
  );

  for (const opp of needPrompt) {
    await notifyUser(opp.user_id, Notifications.feedbackPrompt({ opportunityId: opp.id }));
    await sleep(200);
  }

  if (needPrompt.length > 0) console.log(`[FeedbackJob] Sent ${needPrompt.length} prompts`);
};

// ──────────────────────────────────────────
// JOB: PERFORMANCE SUMMARIZATION (2am daily)
// ──────────────────────────────────────────
const runPerformanceSummaryJob = async () => {
  console.log('[SummaryJob] Starting');

  const { data: profiles } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('user_id, total_sent, messages_at_last_summary, last_summarized_at');

  if (!profiles?.length) return;

  const needsSummary = profiles.filter(p =>
    p.total_sent >= MIN_MESSAGES_FOR_SUMMARY &&
    (p.total_sent - (p.messages_at_last_summary || 0)) >= SUMMARIZE_EVERY_N_MESSAGES
  );

  for (const profile of needsSummary) {
    await summarizeUserPerformance(profile.user_id);
    await sleep(1500);
  }

  console.log(`[SummaryJob] Summarized ${needsSummary.length} users`);
};

const summarizeUserPerformance = async (userId) => {
  const { data: recentFeedback } = await supabaseAdmin
    .from('feedback')
    .select('outcome, outcome_note, opportunities(platform, target_context)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!recentFeedback?.length) return;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('product_description, target_audience, voice_profile')
    .eq('id', userId)
    .single();

  const summary = await groqService.summarizePerformancePatterns(user, recentFeedback);
  if (!summary) return;

  await supabaseAdmin
    .from('user_performance_profiles')
    .upsert({
      user_id:                  userId,
      learned_patterns:         summary.learned_patterns,
      best_message_style:       summary.best_message_style,
      best_message_length:      summary.best_message_length,
      main_objection:           summary.main_objection,
      objection_reframe:        summary.objection_reframe,
      messages_at_last_summary: summary.messages_at_last_summary,
      last_summarized_at:       new Date().toISOString()
    }, { onConflict: 'user_id' });
};

// ──────────────────────────────────────────
// JOB: METRICS AGGREGATION (3am daily)
// ──────────────────────────────────────────
const runMetricsJob = async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('onboarding_completed', true)
    .eq('is_deleted', false);

  if (!users?.length) return;

  for (const { id: userId } of users) {
    await aggregateUserMetrics(userId, yesterday);
    await sleep(200);
  }
};

const aggregateUserMetrics = async (userId, date) => {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd   = `${date}T23:59:59.999Z`;

  const { data: opps } = await supabaseAdmin
    .from('opportunities')
    .select('id, viewed_at, link_clicked_at, message_copied_at, marked_sent_at')
    .eq('user_id', userId)
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  const { data: feedback } = await supabaseAdmin
    .from('feedback')
    .select('outcome')
    .eq('user_id', userId)
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  const sent     = (opps || []).filter(o => o.marked_sent_at).length;
  const positive = (feedback || []).filter(f => f.outcome === 'positive').length;

  await supabaseAdmin.from('daily_metrics').upsert({
    user_id: userId,
    date,
    opportunities_shown:  opps?.length || 0,
    opportunities_viewed: (opps || []).filter(o => o.viewed_at).length,
    links_clicked:        (opps || []).filter(o => o.link_clicked_at).length,
    messages_copied:      (opps || []).filter(o => o.message_copied_at).length,
    messages_sent:        sent,
    positive_outcomes:    positive,
    negative_outcomes:    (feedback?.length || 0) - positive,
    execution_rate:       opps?.length > 0 ? sent / opps.length : 0,
    positive_rate:        sent > 0 ? positive / sent : 0
  }, { onConflict: 'user_id,date' });
};

// ──────────────────────────────────────────
// JOB: CALENDAR PREP (8am daily)
// ──────────────────────────────────────────
const runCalendarPrepJob = async () => {
  const tomorrow = new Date(Date.now() + CALENDAR_PREP_HOURS_BEFORE * 3600000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const { data: events } = await supabaseAdmin
    .from('user_events')
    .select('*, users(id, product_description, target_audience, voice_profile, business_name, fcm_token, is_deleted)')
    .gte('event_date', today)
    .lte('event_date', tomorrow)
    .eq('prep_generated', false);

  if (!events?.length) return;

  for (const event of events) {
    if (event.users?.is_deleted) continue;

    try {
      const prep = await groqService.generateEventPrep(event.users, event);
      await supabaseAdmin.from('user_events').update({
        prep_content: prep,
        prep_generated: true,
        prep_generated_at: new Date().toISOString()
      }).eq('id', event.id);

      if (event.users?.fcm_token) {
        await notifyUser(event.users.id, {
          title: `Prep ready for "${event.title}" 📋`,
          body: 'Talking points and follow-up templates are ready. Tap to review.',
          data: { type: 'event_prep', event_id: event.id }
        });
      }

      await sleep(1000);
    } catch (err) {
      console.error(`[CalendarJob] Prep failed for event ${event.id}:`, err.message);
    }
  }

  if (events.length > 0) console.log(`[CalendarJob] Prepped ${events.length} events`);
};

// ──────────────────────────────────────────
// ADAPTIVE CURRICULUM + SKILL PROFILE
// Issue 17 fix: These were previously re-implemented here, creating dangerous
// code duplication. They are now imported from growthIntelligenceScheduler.js
// so any bug fix only needs to happen in one place.
// ──────────────────────────────────────────
const runAdaptiveCurriculumJob      = _runAdaptiveCurriculumJob;
const runSkillProfileAggregationJob = _runSkillProfileAggregationJob;

// ──────────────────────────────────────────
// REGISTER ALL JOBS
// ──────────────────────────────────────────
export const startAllJobs = () => {
  console.log('[Jobs] Registering background jobs...');

  // ── HIGH-FREQUENCY ───────────────────────────────────────────────────────
  cron.schedule(JOB_INTERVALS.MESSAGE_QUEUE_WORKER, () =>
    runMessageQueueWorker().catch(err => console.error('[Jobs] MessageQueueWorker error:', err.message)));

  cron.schedule(JOB_INTERVALS.MEMORY_EXTRACTION, () =>
    runMemoryExtractionJob().catch(err => console.error('[Jobs] MemoryExtraction error:', err.message)));

  cron.schedule(JOB_INTERVALS.OPPORTUNITY_FETCH, () =>
    runOpportunityJob().catch(err => console.error('[Jobs] OpportunityFetch error:', err.message)));

  cron.schedule(JOB_INTERVALS.FEEDBACK_PROMPTS, () =>
    runFeedbackPromptJob().catch(err => console.error('[Jobs] FeedbackPrompts error:', err.message)));

  // ── DAILY ────────────────────────────────────────────────────────────────
  cron.schedule(JOB_INTERVALS.PERFORMANCE_SUMMARY, () =>
    runPerformanceSummaryJob().catch(err => console.error('[Jobs] PerformanceSummary error:', err.message)));

  cron.schedule(JOB_INTERVALS.METRICS_AGGREGATION, () =>
    runMetricsJob().catch(err => console.error('[Jobs] MetricsAggregation error:', err.message)));

  cron.schedule(JOB_INTERVALS.CALENDAR_PREP, () =>
    runCalendarPrepJob().catch(err => console.error('[Jobs] CalendarPrep error:', err.message)));

  cron.schedule(JOB_INTERVALS.DAILY_TIP_GENERATION, () =>
    runDailyTipGeneration().catch(err => console.error('[Jobs] DailyTip error:', err.message)));

  // 9am daily — morning growth push, then goal nudge (order matters)
  cron.schedule(JOB_INTERVALS.GROWTH_PUSH_MORNING, () =>
    runMorningGrowthPush().catch(err => console.error('[Jobs] MorningGrowthPush error:', err.message)));   // [V4 NEW]

  cron.schedule(JOB_INTERVALS.GOAL_NUDGE_CHECK, () =>
    runGoalNudgeJob().catch(err => console.error('[Jobs] GoalNudge error:', err.message)));

  cron.schedule(JOB_INTERVALS.FOLLOW_UP_CHECK, () =>
    runFollowupSequenceJob().catch(err => console.error('[Jobs] FollowupSequence error:', err.message)));

  cron.schedule(JOB_INTERVALS.CHECK_IN_SCHEDULER, () =>
    runCheckInScheduler().catch(err => console.error('[Jobs] CheckIn error:', err.message)));

  // 6pm daily — evening growth push
  cron.schedule(JOB_INTERVALS.GROWTH_PUSH_EVENING, () =>
    runEveningGrowthPush().catch(err => console.error('[Jobs] EveningGrowthPush error:', err.message)));   // [V4 NEW]

  // ── SUNDAY PIPELINE (runs in order) ──────────────────────────────────────
  // 6pm — weekly plan + email digest (co-scheduled)
  cron.schedule(JOB_INTERVALS.WEEKLY_PLAN, () => {
    runWeeklyPlanGeneration().catch(err => console.error('[Jobs] WeeklyPlan error:', err.message));
    runEmailDigestJob().catch(err => console.error('[Jobs] EmailDigest error:', err.message));
  });

  // 8pm — pattern detection; 8:15pm — pattern insights (offset prevents race condition)
  cron.schedule(JOB_INTERVALS.PATTERN_DETECTION, () =>
    runPatternDetectionJob().catch(err => console.error('[Jobs] PatternDetection error:', err.message)));  // [V4 NEW]

  cron.schedule(JOB_INTERVALS.PATTERN_INSIGHTS, () =>
    runPatternInsightsJob().catch(err => console.error('[Jobs] PatternInsights error:', err.message)));    // [V4 NEW] — 15min after detection

  // 9pm — skill progression snapshot
  cron.schedule(JOB_INTERVALS.SKILL_PROGRESSION, () =>
    runSkillProgressionJob().catch(err => console.error('[Jobs] SkillProgression error:', err.message))); // [V4 NEW]

  // 10pm — skill profile aggregation (feeds into skill_progression)
  cron.schedule('0 22 * * 0', () =>
    runSkillProfileAggregationJob().catch(err => console.error('[Jobs] SkillProfileAgg error:', err.message)));

  // 11pm — adaptive curriculum (uses skill profile data)
  cron.schedule('0 23 * * 0', () =>
    runAdaptiveCurriculumJob().catch(err => console.error('[Jobs] AdaptiveCurriculum error:', err.message)));

  console.log('[Jobs] All registered:');
  console.log('  Message queue worker:     every 30 seconds');
  console.log('  Memory extraction:        every 30 min');
  console.log('  Opportunity fetch:        every 6 hours');
  console.log('  Feedback prompts:         every hour');
  console.log('  Performance summary:      2am daily');
  console.log('  Metrics aggregation:      3am daily');
  console.log('  Calendar prep:            8am daily');
  console.log('  Daily tip generation:     7am daily');
  console.log('  Morning growth push:      9am daily       [V4 NEW]');
  console.log('  Goal nudge:               9am daily');
  console.log('  Follow-up sequences:      10am daily');
  console.log('  Check-in scheduler:       2pm daily');
  console.log('  Evening growth push:      6pm daily       [V4 NEW]');
  console.log('  Weekly plan + digest:     6pm Sunday');
  console.log('  Pattern detection:        8:00pm Sunday    [V4 NEW]');
  console.log('  Pattern insights:         8:15pm Sunday    [V4 NEW — offset 15min after detection]');
  console.log('  Skill progression:        9pm Sunday      [V4 NEW]');
  console.log('  Skill profile agg:        10pm Sunday');
  console.log('  Adaptive curriculum:      11pm Sunday');
};

export {
  runOpportunityJob,
  runFeedbackPromptJob,
  runPerformanceSummaryJob,
  runMetricsJob,
  runCalendarPrepJob
};
