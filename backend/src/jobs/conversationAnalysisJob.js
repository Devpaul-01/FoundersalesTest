// src/jobs/conversationAnalysisJob.js
// ============================================================
// CONVERSATION AUTOPSY ENGINE
// Triggered immediately after every feedback record is created.
// Performs deep structural analysis of the outreach message and
// stores component-level scores in conversation_analyses.
//
// Analysis dimensions (all scored 0–10):
//   hook_score            — Does the first sentence create curiosity?
//   clarity_score         — Is the offer understandable in one read?
//   value_prop_score      — Is specific value communicated for THIS prospect?
//   personalization_score — Specific vs. generic
//   cta_score             — Clear, single, low-friction ask?
//   tone_score            — Platform and prospect fit
//
// Structural metadata:
//   word_count, self_referential_ratio, has_social_proof, has_specific_ask
//   failure_categories, success_signals, rewritten_message
//
// This data feeds:
//   - patternDetectionJob (weekly pattern aggregation)
//   - skillProgressionJob (weekly skill snapshots)
//   - /api/insights routes (Why You're Losing report)
//   - emailDigestJob (intelligence brief section)
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { PRO_MODEL } from '../services/groq.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ──────────────────────────────────────────
// MAIN ENTRY POINT
// Called fire-and-forget from feedback.js after any outcome is logged.
// feedbackId: UUID of the newly created feedback record
// userId:     UUID of the user
// ──────────────────────────────────────────
export const runConversationAnalysis = async (feedbackId, userId) => {
  try {
    // Load feedback + joined opportunity data
    const { data: fb, error: fbErr } = await supabaseAdmin
      .from('feedback')
      .select(`
        id, outcome, outcome_note,
        opportunities(
          id, prepared_message, platform, target_context,
          target_name, fit_score, timing_score, intent_score
        )
      `)
      .eq('id', feedbackId)
      .single();

    if (fbErr || !fb) {
      console.warn(`[ConvAnalysis] Feedback ${feedbackId} not found`);
      return;
    }

    const message = fb.opportunities?.prepared_message;
    if (!message?.trim()) {
      console.warn(`[ConvAnalysis] No message for feedback ${feedbackId} — skipping`);
      return;
    }

    // Avoid re-analyzing the same feedback twice
    const { data: existing } = await supabaseAdmin
      .from('conversation_analyses')
      .select('id')
      .eq('feedback_id', feedbackId)
      .maybeSingle();

    if (existing) {
      console.log(`[ConvAnalysis] Already analyzed feedback ${feedbackId} — skipping`);
      return;
    }

    // Load user profile for context
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('product_description, target_audience, voice_profile, archetype, industry')
      .eq('id', userId)
      .single();

    console.log(`[ConvAnalysis] Analyzing message for feedback ${feedbackId} (outcome: ${fb.outcome})`);

    const prompt = buildAnalysisPrompt(fb, user);

    const { content, tokens_in, tokens_out } = await callWithFallback({
      systemPrompt: `You are an elite sales communication analyst. You score outreach messages with surgical precision.
Your analysis must be evidence-based — quote or reference specific words/phrases from the message.
You work with all types of sellers: solo freelancers, local vendors, service providers, and high-ticket consultants.
Return ONLY valid JSON. Never add markdown fences or explanatory text outside the JSON.`,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.15,
      maxTokens: 1400,
      modelName: PRO_MODEL,
    });

    await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);

    let analysis;
    try {
      const clean = content.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(clean);
    } catch (parseErr) {
      console.error(`[ConvAnalysis] JSON parse failed for feedback ${feedbackId}:`, parseErr.message);
      return;
    }

    // Validate required fields before storing
    if (analysis.hook_score == null || analysis.clarity_score == null) {
      console.warn(`[ConvAnalysis] Incomplete analysis for feedback ${feedbackId} — not stored`);
      return;
    }

    const compositeScore = (
      (analysis.hook_score || 0) +
      (analysis.clarity_score || 0) +
      (analysis.value_prop_score || 0) +
      (analysis.personalization_score || 0) +
      (analysis.cta_score || 0) +
      (analysis.tone_score || 0)
    ) / 6;

    const { error: insertErr } = await supabaseAdmin
      .from('conversation_analyses')
      .insert({
        user_id:                userId,
        opportunity_id:         fb.opportunities?.id || null,
        feedback_id:            fb.id,
        message_text:           message,
        outcome:                fb.outcome,
        outcome_note:           fb.outcome_note || null,
        platform:               fb.opportunities?.platform || null,

        // Dimension scores (0–10)
        hook_score:             clamp(analysis.hook_score, 0, 10),
        clarity_score:          clamp(analysis.clarity_score, 0, 10),
        value_prop_score:       clamp(analysis.value_prop_score, 0, 10),
        personalization_score:  clamp(analysis.personalization_score, 0, 10),
        cta_score:              clamp(analysis.cta_score, 0, 10),
        tone_score:             clamp(analysis.tone_score, 0, 10),
        composite_score:        parseFloat(compositeScore.toFixed(2)),

        // Structural metadata
        word_count:             analysis.word_count || countWords(message),
        self_referential_ratio: clamp(analysis.self_referential_ratio || 0, 0, 1),
        has_social_proof:       !!analysis.has_social_proof,
        has_specific_ask:       !!analysis.has_specific_ask,

        // Categorized findings
        failure_categories:     Array.isArray(analysis.failure_categories) ? analysis.failure_categories : [],
        success_signals:        Array.isArray(analysis.success_signals) ? analysis.success_signals : [],
        analysis_text:          analysis.analysis_text || null,
        improvement_suggestions: analysis.improvement_suggestions || [],
        rewritten_message:      analysis.rewritten_message || null,

        // FIX-16: persist line_annotations so phrase-level fixes are stored
        // and can be re-surfaced in autopsy detail views without re-running the AI
        line_annotations: Array.isArray(analysis.line_annotations) ? analysis.line_annotations : [],

        analysis_model: 'groq_pro',
      });

    if (insertErr) {
      console.error(`[ConvAnalysis] Insert failed for feedback ${feedbackId}:`, insertErr.message);
      return;
    }

    console.log(`[ConvAnalysis] ✓ Stored analysis for feedback ${feedbackId} | composite: ${compositeScore.toFixed(1)}/10 | outcome: ${fb.outcome}`);

    // If this is a negative outcome, also update the objection tracker
    if (fb.outcome === 'negative' && fb.outcome_note) {
      await updateObjectionTracker(userId, fb.outcome_note, analysis).catch(err =>
        console.warn(`[ConvAnalysis] Objection tracker update failed:`, err.message)
      );
    }

  } catch (err) {
    console.error(`[ConvAnalysis] Fatal error for feedback ${feedbackId}:`, err.message);
  }
};

// ──────────────────────────────────────────
// ANALYSIS PROMPT BUILDER
// ──────────────────────────────────────────
const buildAnalysisPrompt = (fb, user) => {
  const message     = fb.opportunities?.prepared_message || '';
  const platform    = fb.opportunities?.platform || 'unknown';
  const prospect    = fb.opportunities?.target_context?.slice(0, 400) || 'unknown';
  const outcome     = fb.outcome;
  const outcomeNote = fb.outcome_note || 'no additional notes';

  const wordCount         = countWords(message);
  const selfRefCount      = countSelfReferentialSentences(message);
  const totalSentences    = message.split(/[.!?]+/).filter(s => s.trim().length > 3).length;
  const selfRefRatio      = totalSentences > 0 ? +(selfRefCount / totalSentences).toFixed(3) : 0;

  return `Analyze this outreach message sent by a seller. Be specific — quote phrases from the message when explaining scores.

SELLER CONTEXT:
Product/Service: ${user?.product_description || 'not specified'}
Target customers: ${user?.target_audience || 'not specified'}
Archetype: ${user?.archetype || 'seller'}

PLATFORM: ${platform}
PROSPECT CONTEXT: ${prospect}

OUTREACH MESSAGE (${wordCount} words):
"${message}"

OUTCOME: ${outcome.toUpperCase()} — "${outcomeNote}"

Pre-computed metadata:
- Word count: ${wordCount}
- Self-referential ratio: ${selfRefRatio} (fraction of sentences starting with I/We/Our/My)
- Total sentences: ${totalSentences}

Score each dimension 0–10 (integers preferred). Be critical — average messages score 4–6, exceptional ones score 8–10:

hook_score: Does the FIRST SENTENCE make the reader want to continue? (0 = opens with "I am" or "We are", 10 = immediately addresses prospect's world)
clarity_score: Is the core offer understandable in one read without re-reading? (0 = confusing, 10 = crystal clear)
value_prop_score: Does it communicate SPECIFIC value to THIS prospect, not generic claims? (0 = "we help companies grow", 10 = named specific outcome with proof)
personalization_score: Is this clearly written for THIS specific person, or could it be sent to anyone? (0 = fully templated, 10 = hyper-specific to their context)
cta_score: Is there a single clear, low-friction ask? (0 = no ask or multiple asks, 10 = perfect single ask)
tone_score: Does the tone match the platform norms and prospect's apparent seniority/style? (0 = completely mismatched, 10 = perfect fit)

Return ONLY this JSON object:
{
  "hook_score": 0-10,
  "clarity_score": 0-10,
  "value_prop_score": 0-10,
  "personalization_score": 0-10,
  "cta_score": 0-10,
  "tone_score": 0-10,
  "word_count": ${wordCount},
  "self_referential_ratio": ${selfRefRatio},
  "has_social_proof": true_or_false,
  "has_specific_ask": true_or_false,
  "failure_categories": ["weak_hook"|"no_value_proof"|"too_generic"|"too_long"|"unclear_ask"|"feature_not_outcome"|"wrong_tone"|"over_explained"|"self_focused"|"no_personalization"|"no_social_proof"|"weak_cta"],
  "success_signals": ["what specific element worked, even if outcome was negative"],
  "analysis_text": "2-3 sentences of specific, blunt diagnosis. Quote the exact phrase that caused the problem. Explain the mechanism of failure.",
  "improvement_suggestions": [
    {"priority": 1, "dimension": "hook|clarity|value_prop|personalization|cta|tone", "suggestion": "specific actionable instruction", "example": "rewritten version of that specific element"},
    {"priority": 2, "dimension": "...", "suggestion": "...", "example": "..."}
  ],
  "rewritten_message": "Full improved version. Max 120 words. Score 8+ across all dimensions. Uses prospect's specific context. Leads with their world."
}`;
};

// ──────────────────────────────────────────
// OBJECTION TRACKER UPDATER
// Called when a negative outcome has a note.
// Classifies the objection type and upserts into objection_tracker.
// ──────────────────────────────────────────
const updateObjectionTracker = async (userId, outcomeNote, analysis) => {
  const objectionType   = classifyObjection(outcomeNote);
  const objectionPhrase = outcomeNote?.slice(0, 300) || '';

  const { error } = await supabaseAdmin.rpc('upsert_objection_count', {
    p_user_id:        userId,
    p_objection_type: objectionType,
    p_phrase:         objectionPhrase,
  });

  if (error) {
    // Fallback if RPC not deployed yet
    console.warn('[ConvAnalysis] RPC upsert_objection_count failed, using fallback:', error.message);
    const { data: existing } = await supabaseAdmin
      .from('objection_tracker')
      .select('id, occurrence_count')
      .eq('user_id', userId)
      .eq('objection_type', objectionType)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('objection_tracker')
        .update({ occurrence_count: existing.occurrence_count + 1, last_seen_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('objection_tracker')
        .insert({ user_id: userId, objection_type: objectionType, objection_phrase: objectionPhrase, occurrence_count: 1 });
    }
  } else {
    console.log(`[ConvAnalysis] ✓ Objection tracker updated atomically — type: ${objectionType}, user: ${userId}`);
  }
};
// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────
const clamp = (val, min, max) => Math.min(max, Math.max(min, val ?? min));

const countWords = (text) => {
  if (!text?.trim()) return 0;
  return text.trim().split(/\s+/).length;
};

const countSelfReferentialSentences = (text) => {
  if (!text?.trim()) return 0;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
  return sentences.filter(s => /^\s*(i |we |our |my )/i.test(s)).length;
};

const classifyObjection = (note) => {
  if (!note) return 'other';
  const n = note.toLowerCase();
  if (/ghost|no response|no reply|didn't respond|never heard|ignored/i.test(n)) return 'ghost';
  if (/price|expensive|cost|budget|afford|spend/i.test(n))                       return 'price';
  if (/timing|later|busy|not (right|a good) time|too soon/i.test(n))             return 'timing';
  if (/trust|prove|evidence|skeptic|doubt|not sure/i.test(n))                    return 'trust';
  if (/competitor|already using|current (solution|vendor)|happy with/i.test(n))  return 'competition';
  if (/not (the right|a) fit|different (audience|market)|not what/i.test(n))     return 'fit';
  return 'other';
};

export default { runConversationAnalysis };
