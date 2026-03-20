// src/jobs/followupSequenceJob.js
// ============================================================
// FEATURE 1: FOLLOW-UP SEQUENCES
// Runs daily at 10am. Detects cold leads and generates
// personalised follow-up messages via Groq.
//
// Stages that trigger:
//   contacted  → 4 days of silence
//   replied    → 6 days of silence (they replied but went quiet)
//   call_demo  → 3 days post-meeting (follow-through)
//
// Limits:
//   - Max 2 follow-ups per lead (follow_up_count < 2)
//   - Min 5 days between re-sends for the same lead
//
// IMPORTANT — backfill before first run:
//   UPDATE opportunities
//   SET last_stage_changed_at = updated_at
//   WHERE last_stage_changed_at IS NULL
//   AND stage IN ('contacted', 'replied', 'call_demo');
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { notifyUser } from '../services/notifications.js';
import { FOLLOW_UP_THRESHOLDS, BATCH_SIZE } from '../config/constants.js';

const FOLLOWUP_BATCH_DELAY_MS = 1500; // guide spec: 1.5s between batches

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// MAIN JOB ENTRY POINT
// ──────────────────────────────────────────
export const runFollowupSequenceJob = async () => {
  const startTime = Date.now();
  console.log(`[FollowupJob] Starting ${new Date().toISOString()}`);
  await logJob('followup_sequence', 'started');

  let processed = 0, generated = 0;

  try {
    // Build per-stage cutoff timestamps
    const now = Date.now();
    const cutoffs = {
      contacted: new Date(now - FOLLOW_UP_THRESHOLDS.contacted * 86400000).toISOString(),
      replied:   new Date(now - FOLLOW_UP_THRESHOLDS.replied   * 86400000).toISOString(),
      call_demo: new Date(now - FOLLOW_UP_THRESHOLDS.call_demo  * 86400000).toISOString(),
    };
    const resendCutoff = new Date(now - 5 * 86400000).toISOString(); // 5-day min between re-sends

    // Fetch qualifying opportunities across all three stages
    const stageFilter = [
  `and(stage.eq.contacted,last_stage_changed_at.lt.${cutoffs.contacted})`,
  `and(stage.eq.replied,last_stage_changed_at.lt.${cutoffs.replied})`,
  `and(stage.eq.call_demo,last_stage_changed_at.lt.${cutoffs.call_demo})`,
].join(',');

    // Issue 18: paginated fetch — no hard row cap
    let opps = [];
    let page = 0;
    const PAGE_SIZE = 100;
    while (true) {
      const { data: pageData } = await supabaseAdmin
        .from('opportunities')
        .select(`
          id, user_id, platform, target_name, target_context,
          prepared_message, stage, follow_up_count, follow_up_sent_at,
          last_stage_changed_at,
          users!inner(id, product_description, target_audience, voice_profile, business_name, fcm_token, is_deleted)
        `)
        .lt('follow_up_count', 2)
        .or(`follow_up_sent_at.is.null,follow_up_sent_at.lt.${resendCutoff}`)
        .or(stageFilter)
        .eq('users.is_deleted', false)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (!pageData?.length) break;
      opps = opps.concat(pageData);
      if (pageData.length < PAGE_SIZE) break;
      page++;
    }

    if (!opps?.length) {
      await logJob('followup_sequence', 'completed', { opps_processed: 0, generated: 0, duration_ms: Date.now() - startTime });
      return;
    }

    // Filter: last_stage_changed_at must be older than stage-specific threshold
    const qualifying = opps.filter(opp => {
      const changedAt = opp.last_stage_changed_at;
      if (!changedAt) return false;
      const cutoff = cutoffs[opp.stage];
      return new Date(changedAt) < new Date(cutoff);
    });

    console.log(`[FollowupJob] ${qualifying.length} qualifying leads (from ${opps.length} fetched)`);

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < qualifying.length; i += BATCH_SIZE) {
      const batch = qualifying.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(opp => processFollowup(opp)));
      results.forEach((r, idx) => {
        processed++;
        if (r.status === 'fulfilled' && r.value?.generated) generated++;
        else if (r.status === 'rejected') {
          console.error(`[FollowupJob] Opp ${batch[idx].id} failed:`, r.reason?.message);
        }
      });
      if (i + BATCH_SIZE < qualifying.length) await sleep(FOLLOWUP_BATCH_DELAY_MS);
    }

    await logJob('followup_sequence', 'completed', {
      opps_processed:  processed,
      generated,
      duration_ms:     Date.now() - startTime,
    });
    console.log(`[FollowupJob] Done — ${generated}/${processed} follow-ups generated`);

  } catch (err) {
    console.error('[FollowupJob] Fatal:', err.message);
    await logJob('followup_sequence', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// PROCESS A SINGLE OPPORTUNITY
// ──────────────────────────────────────────
const processFollowup = async (opp) => {
  const user = opp.users;
  if (!user) return { generated: false };

  const { data: perfProfile } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('learned_patterns, best_message_style')
    .eq('user_id', user.id)
    .single();

  const stageContext = {
    contacted: 'You sent an initial outreach and they have not responded.',
    replied:   'They replied to your initial outreach but went quiet after their reply.',
    call_demo: 'You had a call or demo with them and have not followed up since.',
  };

  const systemPrompt = `You are a follow-up message generator for someone doing outreach.
Write a brief, human follow-up message based on the context below.
The follow-up must:
- Reference the original message naturally without quoting it verbatim
- Be 2-4 sentences maximum
- Match the sender's voice profile
- Feel like a real person checking in, not an automated sequence
- For stage "replied": acknowledge they responded before and keep it warm
- For stage "call_demo": reference the conversation/meeting directly
Respond with ONLY the message text, nothing else.`;

  const voiceStyle  = user.voice_profile?.voice_style || 'conversational';
  const userMessage = `
Sender info:
- Product: ${user.product_description || 'not specified'}
- Voice style: ${voiceStyle}
- Performance patterns: ${perfProfile?.learned_patterns || 'none yet'}

Original outreach message:
"${opp.prepared_message || '(not available)'}"

Prospect context:
${opp.target_context || '(no context)'}

Stage: ${opp.stage}
Situation: ${stageContext[opp.stage]}

Write the follow-up message now.
  `.trim();

  const { content, tokens_in, tokens_out, model_used } = await callWithFallback({
    systemPrompt,
    messages:    [{ role: 'user', content: userMessage }],
    temperature: 0.6,
    maxTokens:   200,
  });

  await recordTokenUsage(user.id, 'groq', tokens_in, tokens_out);

  const newCount = (opp.follow_up_count || 0) + 1;

  // Update the opportunity
  await supabaseAdmin
    .from('opportunities')
    .update({
      follow_up_message: content.trim(),
      follow_up_count:   newCount,
      follow_up_sent_at: new Date().toISOString(),
    })
    .eq('id', opp.id);

  // Insert a high-priority growth card
  const stageLabel = { contacted: 'contacted', replied: 'replied-to', call_demo: 'post-meeting' }[opp.stage] || opp.stage;
  await supabaseAdmin.from('growth_cards').insert({
    user_id:      user.id,
    card_type:    'follow_up',
    title:        `Follow up with your ${stageLabel} lead`,
    body:         content.trim(),
    action_label: 'Mark as sent',
    action_type:  'follow_up_action',
    priority:     9,
    expires_at:   new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    generated_by: 'ai_followup',
    metadata:     { opportunity_id: opp.id, stage: opp.stage, follow_up_count: newCount },
  });

  // Push notification
  if (user.fcm_token) {
    await notifyUser(user.id, {
      title: `Time to follow up 📬`,
      body:  `Your lead has been quiet for a few days. A follow-up message is ready.`,
      data:  { type: 'follow_up', opportunity_id: opp.id },
    }).catch(() => {});
  }

  return { generated: true };
};
