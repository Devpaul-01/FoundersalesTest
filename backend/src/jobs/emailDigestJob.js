// src/jobs/emailDigestJob.js
// ============================================================
// WEEKLY EMAIL DIGEST — V4 Strategic Intelligence Brief
//
// V4 OVERHAUL (Feature 8 / Weakness 9):
//   Transforms from activity report → Strategic Intelligence Brief.
//
//   New sections:
//     1. COMMUNICATION DNA — 3 pattern findings from the week's conversations
//     2. SKILL MOVEMENT    — Composite score delta vs last week, fastest-growing
//                           skill, biggest gap
//     3. THE ONE THING     — Single high-leverage, hyper-specific action
//                           (not "improve CTA" but "your last 4 messages had no
//                           specific ask — add X")
//     4. WHAT'S WORKING    — Elements from positive-outcome messages + why
//     5. MARKET INTEL      — Perplexity-powered: 1 insight about how founders
//                           in this market are communicating right now
//                           (pro users, 1x/week, cached on user record)
//
//   Activity stats row retained as secondary context (not the hero).
//
// Email delivery: Google SMTP first → Resend as fallback.
// ============================================================

import supabaseAdmin    from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage }  from '../services/tokenTracker.js';
import { searchForChat, checkPerplexityUsage } from '../services/perplexity.js';
import { EMAIL_DIGEST_FROM, BATCH_DELAY_MS } from '../config/constants.js';
import nodemailer from 'nodemailer';
import { Resend }  from 'resend';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BATCH_SIZE   = 10;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.clutch.ai';

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// SMTP / RESEND
// ──────────────────────────────────────────
let gmailTransport = null;
let resendClient   = null;

const getGmailTransport = () => {
  if (!gmailTransport && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    gmailTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return gmailTransport;
};

const getResendClient = () => {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
};

// ──────────────────────────────────────────
// MAIN ENTRY POINT
// ──────────────────────────────────────────
export const runEmailDigestJob = async () => {
  const startTime = Date.now();
  console.log(`[EmailDigest] Starting V4 Intelligence Brief ${new Date().toISOString()}`);
  await logJob('email_digest', 'started');

  let sent = 0, failed = 0;

  try {
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, name, email, digest_email, archetype, product_description, target_audience, industry, tier, email_digest_enabled')
      .eq('onboarding_completed', true)
      .eq('is_deleted', false)
      .eq('email_digest_enabled', true)
      .not('email', 'is', null);

    if (!users?.length) {
      await logJob('email_digest', 'completed', { sent: 0, failed: 0, duration_ms: Date.now() - startTime });
      return;
    }

    console.log(`[EmailDigest] Sending to ${users.length} users`);

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch   = users.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(user => sendDigestForUser(user)));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') sent++;
        else {
          failed++;
          console.error(`[EmailDigest] Failed for ${batch[idx].email}:`, r.reason?.message);
        }
      });
      if (i + BATCH_SIZE < users.length) await sleep(BATCH_DELAY_MS);
    }

    await logJob('email_digest', 'completed', { sent, failed, duration_ms: Date.now() - startTime });
    console.log(`[EmailDigest] Done — ${sent} sent, ${failed} failed`);

  } catch (err) {
    console.error('[EmailDigest] Fatal:', err.message);
    await logJob('email_digest', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// SEND DIGEST FOR ONE USER
// ──────────────────────────────────────────
const sendDigestForUser = async (user) => {
  const toEmail      = user.digest_email || user.email;
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const today        = new Date().toISOString().split('T')[0];

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [
    metricsResult, goalsResult, pipelineResult, perfResult,
    analysesResult, progressResult, patternsResult, memoryResult,
  ] = await Promise.allSettled([
    // Activity metrics (retained as secondary context)
    supabaseAdmin.from('daily_metrics')
      .select('messages_sent, positive_outcomes, opportunities_shown')
      .eq('user_id', user.id).gte('date', sevenDaysAgo).lte('date', today),

    supabaseAdmin.from('user_goals')
      .select('goal_text, current_value, target_value, target_unit, status')
      .eq('user_id', user.id).eq('status', 'active').limit(3),

    supabaseAdmin.from('opportunities')
      .select('stage, deal_value').eq('user_id', user.id)
      .not('stage', 'in', '("new","closed_lost")'),

    supabaseAdmin.from('user_performance_profiles')
      .select('positive_rate, total_sent').eq('user_id', user.id).single(),

    // V4 NEW: this week's conversation analyses (real-world message data)
    supabaseAdmin.from('conversation_analyses')
      .select('composite_score, hook_score, clarity_score, value_prop_score, personalization_score, cta_score, tone_score, outcome, failure_categories, success_signals, analysis_text')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20),

    // V4 NEW: skill progression — current week vs last week
    supabaseAdmin.from('skill_progression')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(2),

    // V4 NEW: active communication patterns (pattern intelligence findings)
    supabaseAdmin.from('communication_patterns')
      .select('pattern_label, pattern_detail, pattern_type, confidence_score, recommendation')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false })
      .limit(5),

    // Memory facts for context
    supabaseAdmin.from('user_memory')
      .select('fact').eq('user_id', user.id).eq('is_active', true)
      .order('reinforcement_count', { ascending: false }).limit(5),
  ]);

  const metrics   = metricsResult.status   === 'fulfilled' ? metricsResult.value.data   || [] : [];
  const goals     = goalsResult.status     === 'fulfilled' ? goalsResult.value.data     || [] : [];
  const pipeline  = pipelineResult.status  === 'fulfilled' ? pipelineResult.value.data  || [] : [];
  const perf      = perfResult.status      === 'fulfilled' ? perfResult.value.data      : null;
  const analyses  = analysesResult.status  === 'fulfilled' ? analysesResult.value.data  || [] : [];
  const progress  = progressResult.status  === 'fulfilled' ? progressResult.value.data  || [] : [];
  const patterns  = patternsResult.status  === 'fulfilled' ? patternsResult.value.data  || [] : [];
  const memFacts  = memoryResult.status    === 'fulfilled' ? memoryResult.value.data    || [] : [];

  // ── Activity aggregates ──────────────────────────────────────────────────
  const sentCount     = metrics.reduce((s, d) => s + (d.messages_sent     || 0), 0);
  const positiveCount = metrics.reduce((s, d) => s + (d.positive_outcomes || 0), 0);
  const replyRatePct  = sentCount > 0 ? Math.round((positiveCount / sentCount) * 100) : 0;
  const pipelineValue = pipeline.reduce((s, o) => s + (o.deal_value || 0), 0);
  const stageCounts   = pipeline.reduce((acc, o) => { acc[o.stage] = (acc[o.stage] || 0) + 1; return acc; }, {});
  const stageItems    = Object.entries(stageCounts).map(([s, c]) => `${c} ${s.replace('_', '/')}`).join(', ') || 'empty pipeline';

  // Streak
  const metricsByDate = {};
  metrics.forEach(d => { metricsByDate[d.date] = d; });
  let streakDays = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (metricsByDate[d]?.messages_sent > 0) streakDays++;
    else if (i > 0) break;
  }

  const goalSummaries = goals.map(g =>
    `${g.goal_text}: ${g.current_value || 0}/${g.target_value || '?'} ${g.target_unit || ''}`
  ).join(', ') || 'none set';

  const isQuietWeek = sentCount === 0 && analyses.length === 0;

  // ── V4: Skill progression delta ─────────────────────────────────────────
  const currentWeek  = progress[0] || null;
  const previousWeek = progress[1] || null;
  const compositeDelta = currentWeek?.composite_score_avg != null && previousWeek?.composite_score_avg != null
    ? parseFloat((currentWeek.composite_score_avg - previousWeek.composite_score_avg).toFixed(2))
    : null;

  const DIMENSION_KEYS = ['hook_score', 'clarity_score', 'value_prop_score', 'personalization_score', 'cta_score', 'tone_score'];
  const DIMENSION_LABELS = { hook_score: 'Hook', clarity_score: 'Clarity', value_prop_score: 'Value Prop', personalization_score: 'Personalization', cta_score: 'CTA', tone_score: 'Tone' };

  // Find fastest-growing and biggest gap from current week vs previous
  let fastestGrowing = null, biggestGap = null;
  if (currentWeek && previousWeek) {
    const deltas = DIMENSION_KEYS
      .map(k => ({
        dim: DIMENSION_LABELS[k] || k,
        delta: (currentWeek[`${k}_avg`] ?? 0) - (previousWeek[`${k}_avg`] ?? 0),
        current: currentWeek[`${k}_avg`] ?? null,
      }))
      .filter(d => d.current !== null);

    fastestGrowing = deltas.sort((a, b) => b.delta - a.delta)[0] || null;
    biggestGap     = [...deltas].sort((a, b) => a.current - b.current)[0] || null;
  } else if (currentWeek) {
    const dimScores = DIMENSION_KEYS
      .map(k => ({ dim: DIMENSION_LABELS[k] || k, current: currentWeek[`${k}_avg`] ?? null }))
      .filter(d => d.current !== null);
    biggestGap = dimScores.sort((a, b) => a.current - b.current)[0] || null;
  }

  // ── V4: Winning message patterns ─────────────────────────────────────────
  const winningAnalyses = analyses.filter(a => a.outcome === 'positive');
  const topSuccessSignals = winningAnalyses.flatMap(a => a.success_signals || [])
    .reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const topWinSignal = Object.entries(topSuccessSignals).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // ── V4: Market intelligence (Perplexity, pro users, cached 7 days) ───────
  let marketIntelText = null;
  if (user.tier === 'pro' && !isQuietWeek) {
    try {
      const marketIntelKey = 'market_intel_digest_cached_at';
      const { data: userData } = await supabaseAdmin
        .from('users').select('last_digest_sent_at').eq('id', user.id).single();

      const lastIntelDate = userData?.last_digest_sent_at ? new Date(userData.last_digest_sent_at) : null;
      const staleIntel    = !lastIntelDate || (Date.now() - lastIntelDate.getTime()) > 7 * 86400000;

      if (staleIntel) {
        const usageCheck = await checkPerplexityUsage(user.id, 'pro').catch(() => ({ allowed: false }));
        if (usageCheck.allowed) {
          const query = `What communication and outreach tactics are working best for ${user.industry || 'B2B SaaS'} founders selling to ${user.target_audience || 'SMBs'} right now in 2025? Cold outreach, messaging trends.`;
          const { content: perpResult } = await searchForChat(query,
            'Find specific, current trends in B2B founder outreach and cold messaging. Focus on what converts.'
          ).catch(() => ({ content: null }));

          if (perpResult) {
            const { content: distilled, tokens_in, tokens_out } = await callWithFallback({
              systemPrompt: 'Distill into one specific, actionable sentence about what is working in cold outreach for founders in this market right now. No fluff. Return plain text only.',
              messages: [{ role: 'user', content: `Market: ${user.industry || 'B2B SaaS'} selling to ${user.target_audience || 'SMBs'}\n\nResearch:\n${perpResult.slice(0, 1000)}` }],
              temperature: 0.2,
              maxTokens: 120,
            });
            await recordTokenUsage(user.id, 'groq', tokens_in, tokens_out);
            marketIntelText = distilled?.trim() || null;
          }
        }
      }
    } catch (err) {
      console.warn(`[EmailDigest] Market intel failed for ${user.id}:`, err.message);
    }
  }

  // ── V4: Build AI intelligence brief prompt ───────────────────────────────
  let intelligence = null;
  try {
    const skillMovementText = compositeDelta !== null
      ? `Composite score moved ${compositeDelta > 0 ? '+' : ''}${compositeDelta} this week.${fastestGrowing ? ` ${fastestGrowing.dim} improved most (+${fastestGrowing.delta?.toFixed(1)}).` : ''}${biggestGap ? ` ${biggestGap.dim} is the biggest gap at ${biggestGap.current?.toFixed(1)}/10.` : ''}`
      : currentWeek
        ? `Current composite score: ${currentWeek.composite_score_avg?.toFixed(1)}/10.${biggestGap ? ` Biggest gap: ${biggestGap.dim} at ${biggestGap.current?.toFixed(1)}/10.` : ''}`
        : 'No skill score data yet this week.';

    const patternText = patterns.length
      ? patterns.slice(0, 3).map(p => `- ${p.pattern_label}: ${p.recommendation || p.pattern_detail?.slice(0, 80)}`).join('\n')
      : 'No patterns detected yet (need 5+ conversation analyses).';

    const analysesText = analyses.length
      ? `${analyses.length} messages analyzed. Avg composite: ${(analyses.reduce((s, a) => s + (a.composite_score || 0), 0) / analyses.length).toFixed(1)}/10. Positive: ${winningAnalyses.length}/${analyses.length}.`
      : 'No messages analyzed this week.';

    const winningText = topWinSignal
      ? `Top success signal in winning messages: "${topWinSignal}".`
      : '';

    const topFailures = analyses
      .filter(a => a.outcome === 'negative')
      .flatMap(a => a.failure_categories || [])
      .reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const topFailure = Object.entries(topFailures).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const promptData = isQuietWeek
      ? `A founder had a quiet week (0 messages sent, 0 outreach).
Product: ${user.product_description || 'not specified'}
Goals: ${goalSummaries}
${memFacts.length ? `What Clutch knows: ${memFacts.map(f => f.fact).join(', ')}` : ''}`

      : `FOUNDER CONTEXT:
Product: ${user.product_description || 'not specified'}
Target: ${user.target_audience || 'not specified'}
Industry: ${user.industry || 'not specified'}
Archetype: ${user.archetype || 'seller'}
${memFacts.length ? `What Clutch knows: ${memFacts.map(f => f.fact).join(', ')}` : ''}

THIS WEEK'S INTELLIGENCE:
Activity: ${sentCount} messages sent, ${positiveCount} positive replies (${replyRatePct}%)
Skill Movement: ${skillMovementText}
Communication Patterns Detected:
${patternText}
Message Analysis: ${analysesText}
${winningText}
${topFailure ? `Most common failure this week: "${topFailure}"` : ''}
${marketIntelText ? `Market Intelligence: ${marketIntelText}` : ''}
Goals: ${goalSummaries}
Pipeline: ${stageItems}`;

    const systemPrompt = isQuietWeek
      ? `Write a warm re-engagement digest. Respond only as valid JSON with no markdown.`
      : `You are the founder's AI co-founder writing their weekly Strategic Intelligence Brief.
This is NOT a newsletter. It is a precision coaching document.
Every sentence must be specific, data-backed, and actionable.
Never use: leverage, synergy, unlock, journey, empower.
Respond only as valid JSON with no markdown.`;

    const schema = isQuietWeek
      ? `{
  "headline": "<one honest sentence about the quiet week>",
  "the_one_thing": "<the single action that will break the pattern — very specific>",
  "communication_dna": null,
  "skill_movement": null,
  "what_is_working": null,
  "market_intel": null
}`
      : `{
  "headline": "<8-12 words: punchy summary of their communication performance this week>",
  "communication_dna": ["<pattern finding 1 with specific data>", "<pattern finding 2>", "<pattern finding 3 or null>"],
  "skill_movement": "<2 sentences: what moved, fastest growing skill, biggest gap — use exact numbers>",
  "the_one_thing": "<The single highest-ROI action — hyper-specific, not generic. Not 'improve your CTA' but 'Your last N messages had no specific ask. Add: Would you be open to a 15-minute call this week?'>",
  "what_is_working": "<1-2 sentences: specific message element that produced positive outcomes, with analysis of why>",
  "market_intel": ${marketIntelText ? `"<one insight about what's working in their specific market right now>"` : 'null'}
}`;

    const { content, tokens_in, tokens_out } = await callWithFallback({
      systemPrompt,
      messages: [{ role: 'user', content: `${promptData}\n\nRespond with this JSON structure:\n${schema}` }],
      temperature: 0.5,
      maxTokens:   700,
    });

    await recordTokenUsage(user.id, 'groq', tokens_in, tokens_out);
    intelligence = JSON.parse(content.replace(/```json|```/g, '').trim());

  } catch (err) {
    console.warn(`[EmailDigest] AI brief failed for ${user.id}:`, err.message);
    intelligence = isQuietWeek
      ? {
          headline:         'Every week is a reset — next week starts now.',
          the_one_thing:    'Send one message today. That is the only goal.',
          communication_dna: null, skill_movement: null, what_is_working: null, market_intel: null,
        }
      : {
          headline:         `${sentCount} messages sent — here's what the data says.`,
          communication_dna: patterns.slice(0, 2).map(p => p.pattern_label) || ['Check your insights dashboard for pattern findings.'],
          skill_movement:   compositeDelta !== null
            ? `Your composite score ${compositeDelta > 0 ? 'improved' : 'dropped'} ${Math.abs(compositeDelta).toFixed(1)} points this week.${biggestGap ? ` Biggest gap: ${biggestGap.dim}.` : ''}`
            : 'Open your Insights tab to see your skill progression chart.',
          the_one_thing:    topFailure
            ? `Your messages are failing most often on "${topFailure.replace(/_/g, ' ')}". Fix this before anything else.`
            : 'Log feedback on every message you send this week to unlock pattern insights.',
          what_is_working:  topWinSignal ? `"${topWinSignal}" is appearing in your positive-outcome messages.` : null,
          market_intel:     marketIntelText,
        };
  }

  const subject = isQuietWeek
    ? `Your Clutch brief: let's restart momentum 🚀`
    : `Intelligence brief: ${sentCount} msgs, ${positiveCount} replies — your patterns this week 📊`;

  const html = buildEmailHtml({
    user, sentCount, positiveCount, replyRatePct, streakDays,
    pipelineValue, stageItems, goals, intelligence,
    currentWeek, compositeDelta, fastestGrowing, biggestGap,
    isQuietWeek,
  });

  await sendEmail({ to: toEmail, subject, html });

  await supabaseAdmin
    .from('users')
    .update({ last_digest_sent_at: new Date().toISOString() })
    .eq('id', user.id);
};

// ──────────────────────────────────────────
// EMAIL DELIVERY — Gmail → Resend fallback
// ──────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const gmail = getGmailTransport();
  if (gmail) {
    try {
      await gmail.sendMail({ from: EMAIL_DIGEST_FROM, to, subject, html });
      return;
    } catch (err) {
      const isPermanent = err.responseCode >= 400 && err.responseCode < 500;
      if (isPermanent) throw err;
      console.warn(`[EmailDigest] Gmail transient failure, falling back to Resend:`, err.message);
    }
  }
  const resend = getResendClient();
  if (!resend) throw new Error('No email provider configured');
  const { error } = await resend.emails.send({ from: EMAIL_DIGEST_FROM, to, subject, html });
  if (error) throw new Error(`Resend error: ${error.message}`);
};

// ──────────────────────────────────────────
// V4 EMAIL TEMPLATE — Strategic Intelligence Brief
// ──────────────────────────────────────────
const buildEmailHtml = ({
  user, sentCount, positiveCount, replyRatePct, streakDays,
  pipelineValue, stageItems, goals, intelligence,
  currentWeek, compositeDelta, fastestGrowing, biggestGap,
  isQuietWeek,
}) => {
  const firstName   = user.name?.split(' ')[0] || 'there';
  const settingsUrl = `${FRONTEND_URL}/settings?tab=notifications`;
  const insightsUrl = `${FRONTEND_URL}/insights`;

  const { headline, communication_dna, skill_movement, the_one_thing, what_is_working, market_intel } = intelligence;

  // Goal rows
  const goalRows = goals.length
    ? goals.map(g => {
        const pct = g.target_value
          ? Math.min(100, Math.round(((g.current_value || 0) / g.target_value) * 100))
          : null;
        return `
          <tr><td style="padding:6px 0;">
            <p style="margin:0 0 4px;font-size:13px;color:#e2e8f0;">${g.goal_text}</p>
            ${pct !== null ? `
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="background:#1e293b;border-radius:4px;height:6px;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="background:#6366f1;border-radius:4px;height:6px;width:${pct}%;">&nbsp;</td>
                  </tr></table>
                </td>
                <td width="36" style="padding-left:8px;font-size:11px;color:#94a3b8;">${pct}%</td>
              </tr></table>
            ` : '<p style="font-size:12px;color:#64748b;margin:2px 0 0;">No target set</p>'}
          </td></tr>`;
      }).join('')
    : `<tr><td style="font-size:13px;color:#64748b;padding:6px 0;">No active goals.</td></tr>`;

  // Skill score bar for current week
  const SKILL_DIMS = [
    { key: 'hook_score_avg',            label: 'Hook' },
    { key: 'clarity_score_avg',         label: 'Clarity' },
    { key: 'value_prop_score_avg',      label: 'Value Prop' },
    { key: 'personalization_score_avg', label: 'Personalization' },
    { key: 'cta_score_avg',             label: 'CTA' },
    { key: 'tone_score_avg',            label: 'Tone' },
  ];

  const skillBars = currentWeek
    ? SKILL_DIMS
        .filter(d => currentWeek[d.key] != null)
        .map(d => {
          const score = currentWeek[d.key];
          const pct   = Math.round(score * 10);
          const color = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';
          return `
            <tr>
              <td width="110" style="font-size:11px;color:#94a3b8;padding:3px 8px 3px 0;">${d.label}</td>
              <td style="padding:3px 0;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="background:#1e293b;border-radius:4px;height:6px;width:100%;">
                    <table cellpadding="0" cellspacing="0"><tr>
                      <td style="background:${color};border-radius:4px;height:6px;width:${pct}%;">&nbsp;</td>
                    </tr></table>
                  </td>
                  <td width="28" style="padding-left:6px;font-size:11px;color:#94a3b8;">${score.toFixed(1)}</td>
                </tr></table>
              </td>
            </tr>`;
        }).join('')
    : '';

  // Communication DNA bullets
  const dnaBullets = (communication_dna || []).filter(Boolean).map(finding => `
    <tr><td style="padding:6px 0;border-bottom:1px solid #1e293b;">
      <p style="margin:0;font-size:13px;color:#e2e8f0;line-height:1.6;">🔍 ${finding}</p>
    </td></tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1e293b;border-radius:16px;overflow:hidden;">

        <!-- HERO -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:40px 40px 32px;">
          <p style="margin:0 0 4px;font-size:11px;color:#a5b4fc;text-transform:uppercase;letter-spacing:1.5px;">Clutch AI · Weekly Intelligence Brief</p>
          <h1 style="margin:8px 0 12px;font-size:24px;color:#fff;font-weight:800;line-height:1.3;">${headline}</h1>
          <p style="margin:0;color:#c7d2fe;font-size:13px;">Hey ${firstName} — your co-founder-level brief for the week.</p>
        </td></tr>

        <!-- ACTIVITY STATS (secondary context row) -->
        <tr><td style="padding:24px 40px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${[
                { label: 'Sent',     value: sentCount,     color: '#6366f1' },
                { label: 'Replies',  value: positiveCount, color: '#10b981' },
                { label: 'Rate',     value: `${replyRatePct}%`, color: '#f59e0b' },
                { label: 'Streak',   value: `${streakDays}🔥`,  color: '#e2e8f0' },
              ].map(stat => `
                <td width="25%" align="center" style="padding:0 4px;">
                  <div style="background:#0f172a;border-radius:10px;padding:12px 6px;">
                    <p style="margin:0;font-size:20px;font-weight:800;color:${stat.color};">${stat.value}</p>
                    <p style="margin:3px 0 0;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">${stat.label}</p>
                  </div>
                </td>`).join('')}
            </tr>
          </table>
        </td></tr>

        ${!isQuietWeek && dnaBullets ? `
        <!-- COMMUNICATION DNA -->
        <tr><td style="padding:28px 40px 0;">
          <p style="margin:0 0 12px;font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:1.5px;">🧬 Communication DNA This Week</p>
          <table width="100%" cellpadding="0" cellspacing="0">${dnaBullets}</table>
        </td></tr>` : ''}

        ${skill_movement ? `
        <!-- SKILL MOVEMENT -->
        <tr><td style="padding:24px 40px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:1.5px;">📈 Skill Movement</p>
              ${compositeDelta !== null ? `
                <p style="margin:0 0 10px;font-size:22px;font-weight:800;color:${compositeDelta >= 0 ? '#10b981' : '#ef4444'};">
                  ${compositeDelta >= 0 ? '▲' : '▼'} ${Math.abs(compositeDelta).toFixed(2)} pts this week
                </p>` : ''}
              <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;line-height:1.5;">${skill_movement}</p>
              ${skillBars ? `<table width="100%" cellpadding="0" cellspacing="0">${skillBars}</table>` : ''}
              <p style="margin:10px 0 0;"><a href="${insightsUrl}" style="font-size:12px;color:#6366f1;text-decoration:none;">View full progression chart →</a></p>
            </td></tr>
          </table>
        </td></tr>` : ''}

        <!-- THE ONE THING -->
        ${the_one_thing ? `
        <tr><td style="padding:24px 40px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1f2e;border:1px solid #4f46e5;border-radius:12px;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;color:#a5b4fc;letter-spacing:1.5px;">🎯 The One Thing</p>
              <p style="margin:0;font-size:15px;color:#e2e8f0;font-weight:600;line-height:1.6;">${the_one_thing}</p>
            </td></tr>
          </table>
        </td></tr>` : ''}

        ${what_is_working ? `
        <!-- WHAT'S WORKING -->
        <tr><td style="padding:24px 40px 0;">
          <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;color:#94a3b8;letter-spacing:1.5px;">✅ What's Working</p>
          <p style="margin:0;font-size:13px;color:#e2e8f0;line-height:1.6;">${what_is_working}</p>
        </td></tr>` : ''}

        ${market_intel ? `
        <!-- MARKET INTELLIGENCE -->
        <tr><td style="padding:24px 40px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0 0 6px;font-size:10px;text-transform:uppercase;color:#a5b4fc;letter-spacing:1.5px;">🌐 Market Intel</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;font-style:italic;">${market_intel}</p>
            </td></tr>
          </table>
        </td></tr>` : ''}

        <!-- PIPELINE -->
        <tr><td style="padding:20px 40px 0;">
          <p style="margin:0 0 4px;font-size:10px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Pipeline</p>
          <p style="margin:0;font-size:13px;color:#cbd5e1;">${stageItems}${pipelineValue > 0 ? ` · $${pipelineValue.toLocaleString()} value` : ''}</p>
        </td></tr>

        ${goals.length ? `
        <!-- GOALS -->
        <tr><td style="padding:16px 40px 0;">
          <p style="margin:0 0 8px;font-size:10px;text-transform:uppercase;color:#64748b;letter-spacing:1px;">Goals</p>
          <table width="100%" cellpadding="0" cellspacing="0">${goalRows}</table>
        </td></tr>` : ''}

        <!-- CTA -->
        <tr><td style="padding:32px 40px;" align="center">
          <a href="${insightsUrl}" style="display:inline-block;background:#6366f1;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">View Full Intelligence Dashboard →</a>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding:0 40px 32px;" align="center">
          <p style="margin:0;font-size:11px;color:#475569;line-height:1.6;">
            Weekly intelligence digest · <a href="${settingsUrl}" style="color:#6366f1;text-decoration:none;">Update preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
};
