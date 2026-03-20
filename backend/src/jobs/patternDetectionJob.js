// src/jobs/patternDetectionJob.js
// ============================================================
// PATTERN INTELLIGENCE ENGINE
// Runs weekly (Sunday 8pm) for users with 5+ conversation analyses.
//
// What it does:
//   1. Aggregates all conversation_analyses per user (last 60 days)
//   2. Compares winning vs losing message characteristics
//   3. Identifies 2–4 recurring communication patterns using Groq (PRO model)
//   4. Optionally enriches with Perplexity market intelligence (Pro users only)
//   5. Stores patterns in communication_patterns table
//   6. Generates high-priority Pattern Intelligence growth cards
//
// Integration:
//   - Reads: conversation_analyses, user_skill_profile, practice_sessions
//   - Writes: communication_patterns, growth_cards
//   - Triggered: weekly cron (Sunday 8pm) + optionally on-demand
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { searchForChat } from '../services/perplexity.js';
import { PRO_MODEL } from '../services/groq.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIN_ANALYSES_REQUIRED = 5;

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// MAIN ENTRY POINT
// ──────────────────────────────────────────
export const runPatternDetectionJob = async () => {
  const startTime = Date.now();
  console.log(`[PatternDetection] Starting ${new Date().toISOString()}`);
  await logJob('pattern_detection', 'started');

  let processed = 0, patternsFound = 0;

  try {
    // Find all users who have enough analyses to detect patterns
    const { data: eligibleRows } = await supabaseAdmin
      .from('conversation_analyses')
      .select('user_id')
      .gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString());

    if (!eligibleRows?.length) {
      console.log('[PatternDetection] No eligible users found');
      await logJob('pattern_detection', 'completed', { processed: 0, patterns_found: 0, duration_ms: Date.now() - startTime });
      return;
    }

    // Count analyses per user and filter for minimum
    const userCounts = {};
    eligibleRows.forEach(r => { userCounts[r.user_id] = (userCounts[r.user_id] || 0) + 1; });
    const eligibleUserIds = Object.entries(userCounts)
      .filter(([, count]) => count >= MIN_ANALYSES_REQUIRED)
      .map(([userId]) => userId);

    console.log(`[PatternDetection] ${eligibleUserIds.length} users eligible (≥${MIN_ANALYSES_REQUIRED} analyses)`);

    for (const userId of eligibleUserIds) {
      try {
        const count = await detectPatternsForUser(userId);
        patternsFound += count;
        processed++;
      } catch (err) {
        console.error(`[PatternDetection] Failed for user ${userId}:`, err.message);
      }
      await sleep(2500);
    }

    await logJob('pattern_detection', 'completed', {
      processed,
      patterns_found: patternsFound,
      duration_ms: Date.now() - startTime
    });
    console.log(`[PatternDetection] Done — ${patternsFound} patterns detected across ${processed} users`);

  } catch (err) {
    console.error('[PatternDetection] Fatal:', err.message);
    await logJob('pattern_detection', 'failed', { error_message: err.message, duration_ms: Date.now() - startTime });
  }
};

// ──────────────────────────────────────────
// DETECT PATTERNS FOR ONE USER
// Returns the number of patterns stored.
// ──────────────────────────────────────────
const detectPatternsForUser = async (userId) => {
  // Load all conversation analyses (last 60 days)
  const { data: analyses } = await supabaseAdmin
    .from('conversation_analyses')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 60 * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(40);

  if (!analyses?.length || analyses.length < MIN_ANALYSES_REQUIRED) return 0;

  // Load user profile
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('product_description, target_audience, archetype, tier')
    .eq('id', userId)
    .single();

  if (!user) return 0;

  // Load practice skill profile for cross-referencing
  const { data: skillRows } = await supabaseAdmin
    .from('user_skill_profile')
    .select('clarity_avg, value_avg, discovery_avg, objection_avg, brevity_avg, cta_avg, weakest_axis')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .limit(2);

  const practiceSkills = skillRows?.[0] || null;

  // Segment by outcome
  const winning = analyses.filter(a => a.outcome === 'positive');
  const losing  = analyses.filter(a => a.outcome === 'negative');

  // Aggregate statistics
  const avg = (arr, field) => {
    const vals = arr.filter(a => a[field] != null).map(a => a[field]);
    return vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : null;
  };

  const winStats = buildStats(winning, avg);
  const loseStats = buildStats(losing, avg);

  // Collect all failure categories across losing messages
  const failureCategoryFreq = {};
  losing.forEach(a => {
    (a.failure_categories || []).forEach(cat => {
      failureCategoryFreq[cat] = (failureCategoryFreq[cat] || 0) + 1;
    });
  });
  const topFailureCategories = Object.entries(failureCategoryFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, count]) => `${cat} (${count}x)`);

  // Build the pattern detection prompt
  const prompt = buildPatternPrompt(user, analyses, winning, losing, winStats, loseStats, topFailureCategories, practiceSkills);

  const { content, tokens_in, tokens_out } = await callWithFallback({
    systemPrompt: `You are a communication pattern analyst for a sales coaching platform.
You identify SPECIFIC, EVIDENCE-BASED patterns from real message data.
Never generate generic advice. Every pattern must be supported by the numbers provided.
Return only valid JSON arrays.`,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    maxTokens: 1000,
    modelName: PRO_MODEL,
  });

  await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);

  let patterns;
  try {
    const clean = content.replace(/```json|```/g, '').trim();
    patterns = JSON.parse(clean);
    if (!Array.isArray(patterns)) throw new Error('Not an array');
  } catch (parseErr) {
    console.warn(`[PatternDetection] JSON parse failed for user ${userId}:`, parseErr.message);
    return 0;
  }

  if (!patterns.length) return 0;

  // Optionally enrich top pattern with Perplexity market intelligence (Pro users only)
  if (user.tier === 'pro' && patterns.length > 0 && losing.length >= 5) {
    await enrichWithMarketIntelligence(userId, user, patterns[0]).catch(err =>
      console.warn(`[PatternDetection] Market intel enrichment failed for user ${userId}:`, err.message)
    );
  }

  // Store all patterns and generate growth cards
  let storedCount = 0;
  for (const pattern of patterns) {
    if (!pattern.pattern_label || !pattern.pattern_detail) continue;

    try {
      // Upsert pattern (dedup by label)
      const { data: upserted } = await supabaseAdmin
        .from('communication_patterns')
        .upsert({
          user_id:            userId,
          pattern_type:       pattern.pattern_type || 'weakness',
          pattern_label:      pattern.pattern_label,
          pattern_detail:     pattern.pattern_detail,
          affected_outcome:   pattern.affected_outcome || 'negative',
          confidence_score:   clamp(pattern.confidence_score, 0, 10),
          evidence_count:     analyses.length,
          recommendation:     pattern.recommendation || null,
          is_active:          true,
          last_reinforced_at: new Date().toISOString(),
        }, { onConflict: 'user_id,pattern_label', ignoreDuplicates: false })
        .select('id')
        .single();

      // Generate a high-priority Pattern Intelligence growth card
      const cardBody = buildPatternCardBody(pattern);
      await supabaseAdmin.from('growth_cards').insert({
        user_id:      userId,
        card_type:    'insight',
        title:        pattern.pattern_label,
        body:         cardBody,
        action_label: 'Work on this with Clutch',
        action_type:  'internal_chat',
        priority:     10,
        expires_at:   new Date(Date.now() + 7 * 86400000).toISOString(),
        generated_by: 'ai_pattern_detection',
        metadata: {
          pattern_type:   pattern.pattern_type,
          evidence_count: analyses.length,
          confidence:     pattern.confidence_score,
          pattern_id:     upserted?.id || null,
          winning_count:  winning.length,
          losing_count:   losing.length,
        }
      });

      storedCount++;
    } catch (err) {
      console.warn(`[PatternDetection] Failed to store pattern for user ${userId}:`, err.message);
    }
  }

  console.log(`[PatternDetection] ✓ ${storedCount} patterns stored for user ${userId}`);
  return storedCount;
};

// ──────────────────────────────────────────
// MARKET INTELLIGENCE ENRICHMENT (Pro users, Perplexity)
// Enriches the top pattern with "what works in this market" context.
// Only fires once per user per week max.
// ──────────────────────────────────────────
const enrichWithMarketIntelligence = async (userId, user, topPattern) => {
  // Check if we've already run market intel for this user this week
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recentIntel } = await supabaseAdmin
    .from('growth_cards')
    .select('id')
    .eq('user_id', userId)
    .eq('generated_by', 'ai_market_intel')
    .gte('created_at', weekAgo)
    .limit(1);

  if (recentIntel?.length) {
    console.log(`[PatternDetection] Market intel already generated this week for ${userId} — skipping`);
    return;
  }

  const searchQuery = [
    `What are the most effective cold outreach strategies for`,
    user.target_audience || 'B2B founders',
    `in ${new Date().getFullYear()}?`,
    `What messaging approaches get the highest reply rates?`,
    topPattern.pattern_label ? `How to avoid: ${topPattern.pattern_label}` : '',
  ].filter(Boolean).join(' ');

  const { content: marketIntel } = await searchForChat(
    searchQuery,
    'Find specific, data-backed insights about what makes cold outreach effective for this audience. Focus on message structure, timing, and proven tactics.'
  );

  if (!marketIntel?.trim()) return;

  // Store market intel as a special growth card
  await supabaseAdmin.from('growth_cards').insert({
    user_id:      userId,
    card_type:    'resource',
    title:        `What's working in your market right now`,
    body:         `Based on your communication patterns, here's what top performers in your space are doing:\n\n${marketIntel.slice(0, 700)}`,
    action_label: 'Apply this to my messaging',
    action_type:  'internal_chat',
    priority:     8,
    expires_at:   new Date(Date.now() + 7 * 86400000).toISOString(),
    generated_by: 'ai_market_intel',
    metadata:     {
      source:          'perplexity',
      query:           searchQuery.slice(0, 200),
      related_pattern: topPattern.pattern_label,
    }
  });

  console.log(`[PatternDetection] ✓ Market intel card generated for user ${userId}`);
};

// ──────────────────────────────────────────
// PATTERN PROMPT BUILDER
// ──────────────────────────────────────────
const buildPatternPrompt = (user, allAnalyses, winning, losing, winStats, loseStats, topFailures, practiceSkills) => {
  const practiceSection = practiceSkills
    ? `\nPRACTICE SESSION SKILL SCORES (last week):
Clarity: ${practiceSkills.clarity_avg ?? 'N/A'}/100 | Value: ${practiceSkills.value_avg ?? 'N/A'}/100 | Discovery: ${practiceSkills.discovery_avg ?? 'N/A'}/100
Objection handling: ${practiceSkills.objection_avg ?? 'N/A'}/100 | Brevity: ${practiceSkills.brevity_avg ?? 'N/A'}/100 | CTA: ${practiceSkills.cta_avg ?? 'N/A'}/100
Weakest practice axis: ${practiceSkills.weakest_axis || 'N/A'}`
    : '';

  return `Analyze this founder's outreach message history and identify 2–4 specific, evidence-based communication patterns.

FOUNDER:
Product: ${user.product_description || 'not specified'}
Target audience: ${user.target_audience || 'not specified'}
Archetype: ${user.archetype || 'seller'}

OUTCOME SUMMARY:
Total messages analyzed: ${allAnalyses.length}
Winning messages: ${winning.length} | Losing messages: ${losing.length}
Overall positive rate: ${allAnalyses.length > 0 ? Math.round(winning.length / allAnalyses.length * 100) : 0}%

WINNING MESSAGE STATS (${winning.length} messages):
- Avg hook score: ${winStats.hook}/10
- Avg personalization: ${winStats.personalization}/10
- Avg value prop: ${winStats.value_prop}/10
- Avg CTA: ${winStats.cta}/10
- Avg word count: ${winStats.word_count} words
- Social proof present: ${winStats.social_proof_pct}% of messages
- Self-referential ratio avg: ${winStats.self_ref}

LOSING MESSAGE STATS (${losing.length} messages):
- Avg hook score: ${loseStats.hook}/10
- Avg personalization: ${loseStats.personalization}/10
- Avg value prop: ${loseStats.value_prop}/10
- Avg CTA: ${loseStats.cta}/10
- Avg word count: ${loseStats.word_count} words
- Social proof present: ${loseStats.social_proof_pct}% of messages
- Self-referential ratio avg: ${loseStats.self_ref}

TOP FAILURE CATEGORIES (from losing messages):
${topFailures.join(', ') || 'none detected'}

RECENT OUTCOME NOTES (what prospects said/did):
${losing.slice(0, 8).map(a => a.outcome_note).filter(Boolean).map(n => `- "${n}"`).join('\n') || 'no notes recorded'}
${practiceSection}

Identify 2–4 patterns that are SPECIFIC and BACKED BY THE DATA ABOVE.
Each pattern must include a specific number or comparison from the stats.
DO NOT generate generic advice like "be more personalized" without citing the specific score gap.

Return ONLY a JSON array:
[
  {
    "pattern_type": "ghost_trigger" | "success_signal" | "weakness" | "objection_type",
    "pattern_label": "Specific, data-backed finding in 8 words max",
    "pattern_detail": "2-3 sentences with specific numbers. E.g. 'Your messages that exceeded 150 words had a 12% positive rate vs 38% for shorter messages.'",
    "affected_outcome": "negative" | "positive" | "both",
    "confidence_score": 5-10,
    "recommendation": "One specific, immediately actionable fix. Not vague advice."
  }
]`;
};

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────
const buildStats = (arr, avgFn) => ({
  hook:              avgFn(arr, 'hook_score') ?? 'N/A',
  clarity:           avgFn(arr, 'clarity_score') ?? 'N/A',
  value_prop:        avgFn(arr, 'value_prop_score') ?? 'N/A',
  personalization:   avgFn(arr, 'personalization_score') ?? 'N/A',
  cta:               avgFn(arr, 'cta_score') ?? 'N/A',
  tone:              avgFn(arr, 'tone_score') ?? 'N/A',
  word_count:        arr.length ? Math.round(arr.reduce((s, a) => s + (a.word_count || 0), 0) / arr.length) : 0,
  social_proof_pct:  arr.length ? Math.round(arr.filter(a => a.has_social_proof).length / arr.length * 100) : 0,
  self_ref:          avgFn(arr, 'self_referential_ratio') ?? 'N/A',
});

const buildPatternCardBody = (pattern) => {
  const lines = [pattern.pattern_detail];
  if (pattern.recommendation) {
    lines.push(`\n→ ${pattern.recommendation}`);
  }
  return lines.join('\n');
};

const clamp = (val, min, max) => {
  if (val == null) return min;
  return Math.min(max, Math.max(min, val));
};

export default { runPatternDetectionJob };
