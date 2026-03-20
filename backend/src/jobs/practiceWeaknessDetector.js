// ============================================================
// messageQueueWorker — V4 PATCH
// Add this function and the call at the end of handleSkillScores.
//
// What it does (Feature 7 — close the Practice → Real World loop):
//   After every practice session is scored, check whether the user
//   has a PERSISTENT weakness across 5+ recent sessions. If so,
//   generate a targeted growth card that surfaces in the Growth
//   feed and creates a Pattern Intelligence finding.
//
// HOW TO INTEGRATE:
//   1. Copy the `checkAndGenerateWeaknessCard` function below into
//      messageQueueWorker.js (after the handleSkillScores function).
//   2. At the END of handleSkillScores (after the retry comparison
//      block), add this call:
//
//        // Feature 7: Check persistent weakness → growth card
//        await checkAndGenerateWeaknessCard({ user_id, session_id, skillScores }).catch(err =>
//          logError('handleSkillScores → checkAndGenerateWeaknessCard', err, { sessionId: session_id })
//        );
//
// ============================================================

// ── AXIS LABELS (matches groq.js generateMultiAxisScores output) ────────────
const AXIS_LABEL = {
  clarity:          'Clarity',
  value_delivery:   'Value Delivery',
  discovery:        'Discovery Questions',
  objection_handling: 'Objection Handling',
  brevity:          'Brevity',
  cta:              'CTA',
};

const LOW_SCORE_THRESHOLD = 55;   // below this = "low" (0–100 scale)
const SESSIONS_REQUIRED   = 5;    // need at least 5 sessions to confirm pattern
const CARD_COOLDOWN_DAYS  = 14;   // don't regenerate the same card within 2 weeks

// ── MAIN FUNCTION ────────────────────────────────────────────────────────────
const checkAndGenerateWeaknessCard = async ({ user_id, session_id, skillScores }) => {
  if (!skillScores?.axes) return;  // nothing to analyse

  // 1. Load last 10 completed sessions (most recent first)
  const { data: recentSessions } = await supabaseAdmin
    .from('practice_sessions')
    .select('id, scenario_type, skill_scores, created_at')
    .eq('user_id', user_id)
    .eq('completed', true)
    .not('skill_scores', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentSessions || recentSessions.length < SESSIONS_REQUIRED) return;

  // 2. Compute per-axis averages across those sessions
  const axisAccum = {};
  let sessionsCounted = 0;

  for (const s of recentSessions) {
    const axes = s.skill_scores?.axes;
    if (!axes || typeof axes !== 'object') continue;
    sessionsCounted++;
    for (const [axis, score] of Object.entries(axes)) {
      if (typeof score !== 'number') continue;
      if (!axisAccum[axis]) axisAccum[axis] = [];
      axisAccum[axis].push(score);
    }
  }

  if (sessionsCounted < SESSIONS_REQUIRED) return;

  const axisAvgs = Object.entries(axisAccum)
    .filter(([, scores]) => scores.length >= SESSIONS_REQUIRED)
    .map(([axis, scores]) => ({
      axis,
      avg: parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)),
      sessions: scores.length,
    }))
    .sort((a, b) => a.avg - b.avg);  // ascending: weakest first

  const persistentWeakness = axisAvgs.find(a => a.avg < LOW_SCORE_THRESHOLD);
  if (!persistentWeakness) return;

  // 3. Check cooldown: has a growth card for this specific weakness been generated recently?
  const cooldownSince = new Date(Date.now() - CARD_COOLDOWN_DAYS * 86400000).toISOString();
  const { data: recentCard } = await supabaseAdmin
    .from('growth_cards')
    .select('id')
    .eq('user_id', user_id)
    .eq('generated_by', 'practice_weakness_detector')
    .ilike('title', `%${persistentWeakness.axis}%`)
    .gte('created_at', cooldownSince)
    .limit(1)
    .maybeSingle();

  if (recentCard) {
    log('Weakness Card Skipped — Cooldown Active', {
      userId: user_id, axis: persistentWeakness.axis, avg: persistentWeakness.avg
    });
    return;
  }

  log('Persistent Weakness Detected — Generating Growth Card', {
    userId:   user_id,
    axis:     persistentWeakness.axis,
    avg:      persistentWeakness.avg,
    sessions: persistentWeakness.sessions,
  });

  // 4. Load user profile for personalised card copy
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('name, product_description, target_audience, archetype')
    .eq('id', user_id)
    .single();

  // 5. Load any real-world conversation analyses to cross-reference the weakness
  const { data: realWorldAnalyses } = await supabaseAdmin
    .from('conversation_analyses')
    .select('composite_score, failure_categories, outcome, created_at')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(10);

  const negativeRealWorld = (realWorldAnalyses || []).filter(a => a.outcome === 'negative').length;
  const totalRealWorld    = (realWorldAnalyses || []).length;
  const realWorldContext  = totalRealWorld > 0
    ? `They also have ${negativeRealWorld}/${totalRealWorld} negative real-world outreach outcomes in recent conversations.`
    : '';

  // 6. Generate card content with Groq (free, no Perplexity spend)
  const axisLabel = AXIS_LABEL[persistentWeakness.axis] || persistentWeakness.axis;
  const prompt = `A founder practicing sales outreach has a persistent weakness in "${axisLabel}".

Practice data (last ${persistentWeakness.sessions} sessions):
- Average ${axisLabel} score: ${persistentWeakness.avg}/100
- All recent axis averages: ${axisAvgs.map(a => `${AXIS_LABEL[a.axis] || a.axis}: ${a.avg}`).join(', ')}
${realWorldContext}

Founder context:
- Product: ${user?.product_description?.slice(0, 120) || 'not specified'}
- Target: ${user?.target_audience?.slice(0, 80) || 'not specified'}

Write a Growth Card (insight card) that:
1. Names the specific weakness in plain language
2. Explains WHY this axis kills deals (be specific, not generic)
3. Gives ONE concrete drill they can do in the next practice session to improve it
4. States the expected impact on conversion if they fix it

Return ONLY JSON:
{
  "title": "Your ${axisLabel} score is holding you back (${persistentWeakness.avg}/100 avg)",
  "body": "2-3 sentences explaining the problem and its deal impact",
  "action_label": "Practice This Now",
  "action_scenario": "${persistentWeakness.axis === 'objection_handling' ? 'price_objection' : persistentWeakness.axis === 'discovery' ? 'not_right_time' : 'skeptical'}",
  "tip": "The one-sentence drill for next session",
  "evidence": "One specific data point from their scores"
}`;

  let cardContent = null;
  try {
    const { content } = await groqService.callWithOptions?.({
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens:   400,
    }) || await import('../services/multiProvider.js').then(m => m.callWithFallback({
      systemPrompt: 'You write focused, evidence-based coaching cards. Return only valid JSON.',
      messages:     [{ role: 'user', content: prompt }],
      temperature:  0.3,
      maxTokens:    400,
    }));

    cardContent = JSON.parse(content.replace(/```json|```/g, '').trim());
  } catch (err) {
    // Fallback card if AI fails
    cardContent = {
      title:           `Your ${axisLabel} score is your biggest gap (${persistentWeakness.avg}/100)`,
      body:            `Across your last ${persistentWeakness.sessions} practice sessions, ${axisLabel} is your lowest-scoring skill at ${persistentWeakness.avg}/100. This directly affects how prospects perceive your outreach and is likely contributing to low reply rates.`,
      action_label:    'Practice This Now',
      action_scenario: null,
      tip:             `In your next session, focus exclusively on ${axisLabel} — let everything else be imperfect.`,
      evidence:        `${persistentWeakness.sessions} sessions at ${persistentWeakness.avg}/100 average`,
    };
  }

  // 7. Insert the growth card
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();  // 30 days
  const { error: insertErr } = await supabaseAdmin.from('growth_cards').insert({
    user_id,
    card_type:    'practice_weakness',
    generated_by: 'practice_weakness_detector',
    title:        cardContent.title,
    body:         cardContent.body,
    tip:          cardContent.tip,
    priority:     9,  // High priority — just below pattern intelligence (10)
    expires_at:   expiresAt,
    metadata: {
      axis:              persistentWeakness.axis,
      avg_score:         persistentWeakness.avg,
      sessions_count:    persistentWeakness.sessions,
      action_label:      cardContent.action_label,
      action_scenario:   cardContent.action_scenario,
      evidence:          cardContent.evidence,
      triggered_by_session: session_id,
    },
  });

  if (insertErr) {
    log('Weakness Card Insert Failed', { userId: user_id, axis: persistentWeakness.axis, error: insertErr.message });
    return;
  }

  // 8. Also upsert a communication_patterns entry so it shows in /insights/patterns
  await supabaseAdmin.from('communication_patterns').upsert({
    user_id,
    pattern_type:       'weakness',
    pattern_label:      `Low ${axisLabel} in practice (${persistentWeakness.avg}/100 avg)`,
    pattern_detail:     `Across ${persistentWeakness.sessions} practice sessions, ${axisLabel} is consistently below ${LOW_SCORE_THRESHOLD}/100. This is your most actionable practice gap.`,
    confidence_score:   Math.min(10, parseFloat((persistentWeakness.sessions / 10 * 10).toFixed(1))),
    evidence_count:     persistentWeakness.sessions,
    affected_outcome:   'negative',
    recommendation:     cardContent.tip,
    is_active:          true,
    last_reinforced_at: new Date().toISOString(),
  }, { onConflict: 'user_id,pattern_label' }).catch(() => {});

  // 9. Push notification (optional — only if user has FCM token)
  await notifyUser(user_id, {
    title: `Practice insight: your ${axisLabel} gap 📊`,
    body:  `Scoring ${persistentWeakness.avg}/100 across ${persistentWeakness.sessions} sessions — here's one drill to fix it.`,
    data:  { type: 'practice_weakness_card', axis: persistentWeakness.axis },
  }).catch(() => {});

  log('Weakness Growth Card Created', {
    userId:  user_id,
    axis:    persistentWeakness.axis,
    avg:     persistentWeakness.avg,
    sessions: persistentWeakness.sessions,
  });
};

// ── EXPORT for use in messageQueueWorker ────────────────────────────────────
export { checkAndGenerateWeaknessCard };

// ────────────────────────────────────────────────────────────────────────────
// INTEGRATION DIFF — add this to the end of handleSkillScores in
// messageQueueWorker.js, right before the closing log line:
//
//   // Feature 7: Persistent practice weakness → growth card
//   await checkAndGenerateWeaknessCard({ user_id, session_id, skillScores }).catch(err =>
//     logError('handleSkillScores → weaknessCard', err, { sessionId: session_id })
//   );
//
// And add the import at the top of messageQueueWorker.js:
//   import { checkAndGenerateWeaknessCard } from './practiceWeaknessDetector.js';
// ────────────────────────────────────────────────────────────────────────────
