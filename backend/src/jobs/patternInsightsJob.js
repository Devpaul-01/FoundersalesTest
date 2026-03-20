// src/jobs/patternInsightsJob.js
// ============================================================
// WEEKLY PATTERN INSIGHTS JOB
// Runs once weekly. Analyzes across all meetings, signals,
// and commitments to generate actionable insights for each user.
//
// Insights generated:
//  - Recurring prospect questions / topics
//  - Stall points in the pipeline
//  - Commitment completion rate
//  - Win patterns (what's correlated with good outcomes)
//  - Cooling prospects (response time deteriorating)
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { generateWeeklyPatternInsights } from '../services/groqCalendarIntelligence.js';
import { generateProspectSummary } from '../services/groqCalendarIntelligence.js';
import { notifyUser } from '../services/notifications.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BATCH_DELAY_MS = 2000;

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// MAIN ENTRY POINT
// ──────────────────────────────────────────
export const runPatternInsightsJob = async () => {
  const startTime = Date.now();
  console.log(`[PatternInsightsJob] Starting ${new Date().toISOString()}`);
  await logJob('pattern_insights', 'started');

  let processed = 0;

  try {
    // Find users who have at least 3 meeting debriefs
    const { data: users } = await supabaseAdmin
      .from('user_events')
      .select('user_id')
      .not('debrief_completed_at', 'is', null)
      .gte('debrief_completed_at', new Date(Date.now() - 30 * 86400000).toISOString());

    // Deduplicate user IDs
    const uniqueUserIds = [...new Set((users || []).map(u => u.user_id))];

    console.log(`[PatternInsightsJob] Processing ${uniqueUserIds.length} users`);

    for (let i = 0; i < uniqueUserIds.length; i++) {
      const userId = uniqueUserIds[i];
      try {
        await processUserInsights(userId);
        processed++;
      } catch (err) {
        console.error(`[PatternInsightsJob] Failed for user ${userId}:`, err.message);
      }
      if (i < uniqueUserIds.length - 1) await sleep(BATCH_DELAY_MS);
    }

    // Also refresh AI summaries for prospects with new interactions
    await refreshStaleProspectSummaries();

    // Mark overdue commitments
    await markOverdueCommitments();

    await logJob('pattern_insights', 'completed', { processed, duration_ms: Date.now() - startTime });
    console.log(`[PatternInsightsJob] Done — ${processed} users processed`);

  } catch (err) {
    console.error('[PatternInsightsJob] Fatal:', err.message);
    await logJob('pattern_insights', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// PROCESS ONE USER
// ──────────────────────────────────────────
const processUserInsights = async (userId) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Load recent debriefs
  const { data: recentDebriefs } = await supabaseAdmin
    .from('user_events')
    .select('outcome, energy_score, meeting_notes, debrief_content, event_type, attendee_name, event_date')
    .eq('user_id', userId)
    .not('debrief_completed_at', 'is', null)
    .gte('debrief_completed_at', thirtyDaysAgo)
    .order('event_date', { ascending: false })
    .limit(20);

  if (!recentDebriefs?.length) return;

  // Load signal frequency
  const { data: recentSignals } = await supabaseAdmin
    .from('conversation_signals')
    .select('signal_type, signal_text')
    .eq('user_id', userId)
    .gte('detected_at', thirtyDaysAgo);

  const signalFrequency = {};
  (recentSignals || []).forEach(s => {
    signalFrequency[s.signal_type] = (signalFrequency[s.signal_type] || 0) + 1;
  });

  // Commitment stats
  const { data: commitments } = await supabaseAdmin
    .from('conversation_commitments')
    .select('status, owner')
    .eq('user_id', userId)
    .eq('owner', 'founder')
    .gte('created_at', thirtyDaysAgo);

  const commitmentStats = {
    total:     (commitments || []).length,
    completed: (commitments || []).filter(c => c.status === 'done').length,
    overdue:   (commitments || []).filter(c => c.status === 'overdue').length,
  };

  // Stage progressions (from pipeline)
  const { data: stageChanges } = await supabaseAdmin
    .from('opportunities')
    .select('stage')
    .eq('user_id', userId)
    .gte('last_stage_changed_at', thirtyDaysAgo);

  // Find repeated topics in meeting notes
  const allNotes = (recentDebriefs || [])
    .map(d => d.meeting_notes || d.debrief_content?.raw_notes || '')
    .join(' ');

  const repeatQuestions = detectRepeatTopics(allNotes);

  // Load user profile for context
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('product_description, target_audience, voice_profile, business_name')
    .eq('id', userId)
    .single();

  if (!user) return;

  const analysisData = {
    recentDebriefs:    recentDebriefs || [],
    signalFrequency,
    commitmentStats,
    stageProgressions: stageChanges   || [],
    repeatQuestions,
  };

  const insights = await generateWeeklyPatternInsights(user, analysisData);

  if (!insights?.length) return;

  // Clear old non-dismissed insights before inserting new ones
  await supabaseAdmin
    .from('prospect_insights')
    .update({ is_dismissed: true })
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .lt('created_at', thirtyDaysAgo);

  // Insert new insights
  const rows = insights.map(i => ({
    user_id:          userId,
    insight_type:     i.type,
    title:            i.title,
    body:             i.body,
    suggested_action: i.suggested_action || null,
    affected_count:   i.affected_count   || 1,
    expires_at:       new Date(Date.now() + 14 * 86400000).toISOString(), // Expire in 2 weeks
  }));

  await supabaseAdmin.from('prospect_insights').insert(rows);

  // Push notification for new insights (if meaningful)
  const highValueInsights = insights.filter(i => i.type === 'stall' || i.type === 'question_cluster');
  if (highValueInsights.length) {
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('fcm_token')
      .eq('id', userId)
      .single();

    if (userData?.fcm_token) {
      await notifyUser(userId, {
        title: '📊 Your weekly sales insights are ready',
        body:  `${insights.length} new pattern${insights.length > 1 ? 's' : ''} found in your recent conversations.`,
        data:  { type: 'weekly_insights' },
      }).catch(() => {});
    }
  }

  console.log(`[PatternInsightsJob] Generated ${insights.length} insights for user ${userId}`);
};

// ──────────────────────────────────────────
// REFRESH STALE PROSPECT SUMMARIES
// Refreshes AI summaries for prospects that had activity in the last week
// ──────────────────────────────────────────
const refreshStaleProspectSummaries = async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Find prospects with recent activity and stale/missing summaries
  const { data: prospects } = await supabaseAdmin
    .from('prospects')
    .select('id, user_id, name, company, relationship_health_score')
    .gte('last_contact_at', sevenDaysAgo)
    .or(`ai_summary_updated_at.is.null,ai_summary_updated_at.lt.${sevenDaysAgo}`)
    .limit(20);

  if (!prospects?.length) return;

  for (const prospect of prospects) {
    try {
      const [eventsRes, signalsRes] = await Promise.all([
        supabaseAdmin
          .from('user_events')
          .select('title, event_type, outcome, event_date, debrief_content')
          .eq('prospect_id', prospect.id)
          .order('event_date', { ascending: false })
          .limit(5),
        supabaseAdmin
          .from('conversation_signals')
          .select('signal_type, signal_text, detected_at')
          .eq('prospect_id', prospect.id)
          .eq('is_active', true)
          .limit(5),
      ]);

      const timeline = [
        ...(eventsRes.data || []).map(e => ({ type: 'event', date: e.event_date, title: e.title, outcome: e.outcome })),
        ...(signalsRes.data || []).map(s => ({ type: 'signal', date: s.detected_at, signal_type: s.signal_type, signal_text: s.signal_text })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      if (!timeline.length) continue;

      const { data: user } = await supabaseAdmin
        .from('users')
        .select('product_description, voice_profile, target_audience')
        .eq('id', prospect.user_id)
        .single();

      const summary = await generateProspectSummary(user, prospect, timeline);

      await supabaseAdmin
        .from('prospects')
        .update({ ai_summary: summary, ai_summary_updated_at: new Date().toISOString() })
        .eq('id', prospect.id);

      await sleep(1000); // be gentle with Groq
    } catch (err) {
      console.warn(`[PatternInsightsJob] Summary refresh failed for prospect ${prospect.id}:`, err.message);
    }
  }
};

// ──────────────────────────────────────────
// MARK OVERDUE COMMITMENTS
// ──────────────────────────────────────────
const markOverdueCommitments = async () => {
  const today = new Date().toISOString().split('T')[0];
  await supabaseAdmin
    .from('conversation_commitments')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', today);
};

// ──────────────────────────────────────────
// HELPER: Detect repeated topics in notes text
// ──────────────────────────────────────────
const detectRepeatTopics = (notesText) => {
  if (!notesText) return [];

  const topicPatterns = [
    { topic: 'pricing / cost',   pattern: /\b(price|pricing|cost|budget|expensive|afford|how much)\b/gi },
    { topic: 'integration',      pattern: /\b(integrat|connect|api|sync|plugin|compatibility)\b/gi },
    { topic: 'timeline',         pattern: /\b(when|timeline|deadline|launch|go.?live|start date)\b/gi },
    { topic: 'competitor',       pattern: /\b(competitor|alternative|vs\.|instead|already using|switched from)\b/gi },
    { topic: 'ROI / results',    pattern: /\b(roi|return|results|outcome|impact|prove it|case study)\b/gi },
    { topic: 'security / trust', pattern: /\b(security|compliance|gdpr|hipaa|trust|privacy|data)\b/gi },
    { topic: 'decision maker',   pattern: /\b(decision|approval|ceo|cto|board|stakeholder|my boss|my team)\b/gi },
    { topic: 'support / onboarding', pattern: /\b(support|onboard|training|help|documentation|setup)\b/gi },
  ];

  return topicPatterns
    .map(({ topic, pattern }) => {
      const matches = (notesText.match(pattern) || []).length;
      return { topic, count: matches };
    })
    .filter(t => t.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
};
