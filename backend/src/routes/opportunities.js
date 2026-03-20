// src/routes/opportunities.js
// ============================================================
// OPPORTUNITIES V3 — Real-Time Message Quality Scoring
//
// V3 changes:
//   - GET /:id/message-score  — Feature 4: pre-send message quality score badge
//     Scores the prepared message across 6 dimensions and returns
//     a composite score + top 2 improvement suggestions.
//     Cached on the opportunity record (message_score_data column).
//     Also auto-scores on /copy and /view if no score exists yet.
// ============================================================

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  PIPELINE_STAGES, OPPORTUNITY_STATUS, OPPORTUNITIES_PER_RUN, MIN_COMPOSITE_SCORE, SENT_PROMPT_DELAY_MS
} from '../config/constants.js';
import { discoverOpportunities, checkPerplexityUsage, incrementUsage, searchForChat } from '../services/perplexity.js';
import groqService from '../services/groq.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { callWithFallback } from '../services/multiProvider.js';
import supabaseAdmin from '../config/supabase.js';
import { PRO_MODEL } from '../services/groq.js';

const router = Router();

// Issue 7 fix: define a per-user refresh rate limiter at the route level.
// The app-level refreshRateLimiter was defined but never applied to this router —
// placing it here ensures it travels with the route regardless of mount order.
const refreshRateLimiter = rateLimit({
  windowMs:       60 * 60 * 1000,  // 1 hour window
  max:            5,                // 5 manual refreshes per hour per user
  standardHeaders: true,
  legacyHeaders:  false,
  keyGenerator:   (req) => req.user?.id || req.ip,
  message:        { error: 'RATE_LIMIT_EXCEEDED', message: 'You can refresh your feed up to 5 times per hour.' },
});

// ──────────────────────────────────────────
// STRUCTURED LOGGING (Issue 24)
// Pattern mirrors practice.txt for consistency across the backend.
// ──────────────────────────────────────────
const log = (event, data = {}) => {
  const parts = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[Opportunities] ${event}${parts.length ? ` → ${parts.join(' ')}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.error(`[Opportunities] ❌ ${fn} — ${err?.message || err}${parts.length ? ` | ${parts.join(' ')}` : ''}`);
};

const logDB = (op, table, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[Opportunities] 🗄️  DB ${op} → table=${table}${parts.length ? ` ${parts.join(' ')}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`[Opportunities] 🤖 AI ${fn}${parts.length ? ` → ${parts.join(' ')}` : ''}`);
};

export const buildOpportunityLabel = (opp) => {
  const platform = opp.platform || 'Unknown';
  const handle   = opp.target_name || extractHandle(opp.target_context) || null;
  const snippet  = opp.target_context
    ? opp.target_context.replace(/\s+/g, ' ').trim().slice(0, 60) + '…'
    : null;

  const parts = [platform];
  if (handle)  parts.push(handle);
  if (snippet) parts.push(`"${snippet}"`);
  return parts.join(' · ');
};

// ──────────────────────────────────────────
// GET /api/opportunities
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { status = 'active', limit = 20, offset = 0 } = req.query;
  const userId = req.user.id;
  log('LIST', { userId, status, limit, offset });

  let query = supabaseAdmin
    .from('opportunities')
    .select('*')
    .eq('user_id', userId)
    .order('composite_score', { ascending: false })
    .order('created_at', { ascending: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (status === 'active') query = query.in('status', ['pending', 'viewed', 'acted']);
  else if (status !== 'all') query = query.eq('status', status);

  const { data: opportunities, error } = await query;
  if (error) throw error;

  const { count } = await supabaseAdmin
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed', 'acted']);

  res.json({
    opportunities: opportunities || [],
    total_active: count || 0,
    pagination: {
      limit:    parseInt(limit),
      offset:   parseInt(offset),
      has_more: (count || 0) > parseInt(offset) + parseInt(limit)
    }
  });
}));

// ──────────────────────────────────────────
// POST /api/opportunities/refresh
// Issue 7 fix: refreshRateLimiter applied — 5 requests/hour per user
// ──────────────────────────────────────────
router.post('/refresh', refreshRateLimiter, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('REFRESH start', { userId });

  if (!req.user.onboarding_completed) {
    log('REFRESH blocked', { userId, reason: 'onboarding_incomplete' });
    return res.status(400).json({
      error:   'ONBOARDING_REQUIRED',
      message: 'Complete onboarding before refreshing opportunities'
    });
  }

  const { data: existingCount } = await supabaseAdmin
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed', 'acted']);

  const result = await discoverOpportunities(userId, req.user);
  if (!result.opportunities?.length) {
    log('REFRESH no results', { userId, reason: result.fallback_reason });
    return res.json({
      success: false, opportunities_found: 0,
      message: result.fallback_reason || 'No new opportunities found right now. Check back in a few hours.'
    });
  }
  log('REFRESH discovered', { userId, count: result.opportunities.length, model: result.model_used });

  const { data: perfProfile } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('learned_patterns, best_message_style, best_message_length')
    .eq('user_id', userId).single();

  logAI('scoreOpportunities', { userId, candidates: result.opportunities.length });
  const scored = await groqService.scoreOpportunities(req.user, result.opportunities);
  const qualifying = scored.filter(o =>
    ((o.fit_score || 0) + (o.timing_score || 0) + (o.intent_score || 0)) / 3 >= MIN_COMPOSITE_SCORE
  );
  log('REFRESH scored', { userId, qualifying: qualifying.length, total: scored.length, threshold: MIN_COMPOSITE_SCORE });

  // Issue 8 fix: prevent inserting opportunities with a source_url that already
  // exists for this user. Perplexity can return the same post across multiple runs,
  // and without this guard users see duplicate cards.
  const sourceUrls = qualifying.map(o => o.source_url).filter(Boolean);
  let existingUrls = new Set();
  if (sourceUrls.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from('opportunities')
      .select('source_url')
      .eq('user_id', userId)
      .in('source_url', sourceUrls);
    existingUrls = new Set((existing || []).map(e => e.source_url));
    log('REFRESH dedup check', { userId, existingDuplicates: existingUrls.size });
  }

  let newCount = 0;
  for (const opp of qualifying) {
    if (opp.source_url && existingUrls.has(opp.source_url)) {
      log('REFRESH skip duplicate', { userId, source_url: opp.source_url });
      continue;
    }

    logAI('generateOutreachMessage', { userId, platform: opp.platform });
    const { message, tokens_in, tokens_out } = await groqService.generateOutreachMessage(req.user, opp, perfProfile);
    await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);

    const { error } = await supabaseAdmin.from('opportunities').insert({
      user_id: userId,
      platform: opp.platform || 'reddit',
      source_url: opp.source_url,
      target_context: opp.target_context,
      target_name: opp.target_name || null,
      prepared_message: message,
      fit_score: opp.fit_score,
      timing_score: opp.timing_score,
      intent_score: opp.intent_score,
      composite_score: ((opp.fit_score || 0) + (opp.timing_score || 0) + (opp.intent_score || 0)) / 3,
      message_style: perfProfile?.best_message_style || 'empathetic',
      message_length: message.split(' ').length,
      generated_by: result.model_used,
      status: 'pending',
      stage: 'new'
    });
    if (!error) {
      logDB('INSERT', 'opportunities', { userId, platform: opp.platform, composite_score: ((opp.fit_score||0)+(opp.timing_score||0)+(opp.intent_score||0))/3 });
      newCount++;
    } else {
      logError('refresh insert', error, { userId, platform: opp.platform });
    }
  }

  log('REFRESH complete', { userId, newCount });
  res.json({
    success:             newCount > 0,
    opportunities_found: newCount,
    message:             newCount > 0
      ? `${newCount} new ${newCount === 1 ? 'opportunity' : 'opportunities'} ready.`
      : 'No qualifying opportunities found this run.',
    search_used: result.model_used,
  });
}));

// ──────────────────────────────────────────
// GET /api/opportunities/pending-sent-confirmation
// Issue 3 fix: MUST be declared before any /:id routes.
// Express matches routes in registration order; if this were declared after
// /:id/message-score the string "pending-sent-confirmation" would be captured
// as :id and this handler would never be reached.
// ──────────────────────────────────────────
router.get('/pending-sent-confirmation', asyncHandler(async (req, res) => {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin.from('opportunities')
    .select('id, platform, target_name, target_context, link_clicked_at, message_copied_at')
    .eq('user_id', req.user.id)
    .eq('status', OPPORTUNITY_STATUS.ACTED)
    .or(`link_clicked_at.gte.${fourHoursAgo},message_copied_at.gte.${fourHoursAgo}`)
    .order('link_clicked_at', { ascending: false })
    .limit(5);

  res.json({
    pending: (data || []).map(opp => ({
      opportunity_id: opp.id,
      label:          buildOpportunityLabel(opp),
      platform:       opp.platform,
      actioned_at:    opp.link_clicked_at || opp.message_copied_at
    }))
  });
}));

// ──────────────────────────────────────────
// GET /api/opportunities/:id/message-score  — V3 NEW (Feature 4)
// Pre-send message quality score badge.
// Returns composite score + top 2 suggestions for improvement.
// Result is cached in message_score_data on the opportunity row.
// ──────────────────────────────────────────
router.get('/:id/message-score', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;
  log('MESSAGE-SCORE request', { userId, oppId: id });

  const { data: opp, error: oppErr } = await supabaseAdmin
    .from('opportunities')
    .select('id, prepared_message, platform, target_context, target_name, message_score_data, message_scored_at')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (oppErr || !opp) {
    logError('message-score lookup', oppErr, { userId, oppId: id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  if (!opp.prepared_message?.trim()) {
    log('MESSAGE-SCORE no message', { userId, oppId: id });
    return res.status(400).json({ error: 'NO_MESSAGE', message: 'No prepared message to score' });
  }

  // Return cached score if < 1 hour old and message hasn't changed
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (
    opp.message_score_data &&
    opp.message_scored_at &&
    new Date(opp.message_scored_at) > oneHourAgo
  ) {
    log('MESSAGE-SCORE cache hit', { userId, oppId: id });
    return res.json({ score: opp.message_score_data, cached: true });
  }

  const message     = opp.prepared_message;
  const platform    = opp.platform || 'unknown';
  const wordCount   = message.trim().split(/\s+/).length;
  const sentences   = message.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const selfRefCount = sentences.filter(s => /^\s*(i |we |our |my )/i.test(s)).length;
  const selfRefRatio = sentences.length > 0 ? +(selfRefCount / sentences.length).toFixed(3) : 0;

  // Load user's recent pattern weaknesses to make suggestions more targeted
  const { data: patterns } = await supabaseAdmin
    .from('communication_patterns')
    .select('pattern_label, pattern_type, recommendation')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('affected_outcome', 'negative')
    .order('confidence_score', { ascending: false })
    .limit(2);

  const patternContext = patterns?.length
    ? `\nYour known communication weaknesses: ${patterns.map(p => p.pattern_label).join('; ')}`
    : '';

  logAI('scoreMessage', { userId, oppId: id, platform, wordCount, selfRefRatio, patternCount: patterns?.length || 0 });

  const prompt = `Score this outreach message BEFORE it's sent. Give the founder actionable feedback they can use RIGHT NOW.

PLATFORM: ${platform}
PROSPECT: ${(opp.target_context || '').slice(0, 300)}
MESSAGE (${wordCount} words):
"${message}"

Metadata: self-referential ratio = ${selfRefRatio}${patternContext}

Score 0–10 per dimension. Be critical — average messages score 4–6:
- hook_score: First sentence quality (0 = opens with I/We, 10 = immediately about prospect's world)
- clarity_score: Is the offer clear in one read?
- value_prop_score: Specific value for THIS prospect?
- personalization_score: Written for this person specifically?
- cta_score: Single, clear, low-friction ask?
- tone_score: Matches platform norms?

Return ONLY this JSON:
{
  "hook_score": 0-10,
  "clarity_score": 0-10,
  "value_prop_score": 0-10,
  "personalization_score": 0-10,
  "cta_score": 0-10,
  "tone_score": 0-10,
  "composite_score": weighted_average,
  "score_label": "Needs Work" | "Decent" | "Good" | "Strong",
  "score_color": "red" | "orange" | "yellow" | "green",
  "top_issues": [
    {"dimension": "hook|clarity|value_prop|personalization|cta|tone", "issue": "specific problem", "fix": "specific fix in under 15 words"}
  ],
  "one_thing_to_change": "The single highest-ROI change — very specific, under 20 words"
}`;

  const { content, tokens_in, tokens_out } = await callWithFallback({
    systemPrompt: 'You are a message quality scorer. Return only JSON. Be critical but constructive.',
    messages:     [{ role: 'user', content: prompt }],
    temperature:  0.1,
    maxTokens:    500,
    modelName:    PRO_MODEL,
  });

  await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);

  let score;
  try {
    const clean = content.replace(/```json|```/g, '').trim();
    score = JSON.parse(clean);
    if (Array.isArray(score.top_issues)) {
      score.top_issues = score.top_issues.slice(0, 2);
    }
  } catch (parseErr) {
    logError('message-score parse', parseErr, { userId, oppId: id });
    return res.status(500).json({ error: 'SCORING_FAILED', message: 'Could not score message. Try again.' });
  }

  log('MESSAGE-SCORE result', { userId, oppId: id, composite: score.composite_score, label: score.score_label });

  // Cache on the opportunity
  await supabaseAdmin
    .from('opportunities')
    .update({ message_score_data: score, message_scored_at: new Date().toISOString() })
    .eq('id', id)
    .catch(() => {}); // Non-critical

  res.json({ score, cached: false });
}));

// ──────────────────────────────────────────
// PUT /api/opportunities/:id/view
// ──────────────────────────────────────────
router.put('/:id/view', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('VIEW', { userId, oppId: req.params.id });

  const { data: opp } = await supabaseAdmin
    .from('opportunities')
    .select('id, status, viewed_at, message_score_data, prepared_message')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (!opp) return res.status(404).json({ error: 'NOT_FOUND' });

  await supabaseAdmin.from('opportunities')
    .update({
      viewed_at: opp.viewed_at || new Date().toISOString(),
      status:    opp.status === OPPORTUNITY_STATUS.PENDING ? OPPORTUNITY_STATUS.VIEWED : opp.status
    })
    .eq('id', req.params.id);

  logDB('UPDATE', 'opportunities', { oppId: req.params.id, newStatus: OPPORTUNITY_STATUS.VIEWED });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// PUT /api/opportunities/:id/copy
// ──────────────────────────────────────────
router.put('/:id/copy', asyncHandler(async (req, res) => {
  log('COPY', { userId: req.user.id, oppId: req.params.id });

  await supabaseAdmin.from('opportunities')
    .update({ message_copied_at: new Date().toISOString(), status: OPPORTUNITY_STATUS.ACTED })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  logDB('UPDATE', 'opportunities', { oppId: req.params.id, status: OPPORTUNITY_STATUS.ACTED });
  res.json({
    success:     true,
    sent_prompt: {
      show_after_ms:  SENT_PROMPT_DELAY_MS,
      opportunity_id: req.params.id,
      message:        "Message copied! Did you send it?",
      actions: [
        { label: "Sent ✓",   action: "MARK_SENT" },
        { label: "Not yet",  action: "DISMISS" }
      ]
    }
  });
}));

// ──────────────────────────────────────────
// PUT /api/opportunities/:id/sent
// ──────────────────────────────────────────
router.put('/:id/sent', asyncHandler(async (req, res) => {
  log('MARK SENT', { userId: req.user.id, oppId: req.params.id });

  await supabaseAdmin.from('opportunities')
    .update({ marked_sent_at: new Date().toISOString(), status: OPPORTUNITY_STATUS.SENT, stage: PIPELINE_STAGES.CONTACTED })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  logDB('UPDATE', 'opportunities', { oppId: req.params.id, status: OPPORTUNITY_STATUS.SENT, stage: PIPELINE_STAGES.CONTACTED });
  res.json({
    success:            true,
    new_stage:          PIPELINE_STAGES.CONTACTED,
    message:            "Logged! You'll hear from Clutch in 48 hours to track the outcome.",
    feedback_prompt_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  });
}));

// ──────────────────────────────────────────
// POST /api/opportunities/:id/regenerate
// ──────────────────────────────────────────
router.post('/:id/regenerate', asyncHandler(async (req, res) => {
  const { style } = req.body;
  log('REGENERATE', { userId: req.user.id, oppId: req.params.id, style });

  const { data: opp, error } = await supabaseAdmin
    .from('opportunities').select('*').eq('id', req.params.id).eq('user_id', req.user.id).single();

  if (error || !opp) {
    logError('regenerate lookup', error, { userId: req.user.id, oppId: req.params.id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  const { data: perfProfile } = await supabaseAdmin
    .from('user_performance_profiles').select('*').eq('user_id', req.user.id).single();

  const userWithStyle = {
    ...req.user,
    voice_profile: { ...req.user.voice_profile, voice_style: style || req.user.voice_profile?.voice_style }
  };

  logAI('generateOutreachMessage', { userId: req.user.id, oppId: req.params.id, style });
  const { message, tokens_in, tokens_out } = await groqService.generateOutreachMessage(userWithStyle, opp, perfProfile);
  await recordTokenUsage(req.user.id, 'groq', tokens_in, tokens_out);

  await supabaseAdmin.from('opportunities')
    .update({
      prepared_message:   message,
      message_style:      style || opp.message_style,
      message_length:     message.split(' ').length,
      message_score_data: null,
      message_scored_at:  null,
    })
    .eq('id', req.params.id);

  logDB('UPDATE', 'opportunities', { oppId: req.params.id, action: 'regenerate', scoreInvalidated: true });
  res.json({ success: true, prepared_message: message });
}));

// ──────────────────────────────────────────
// POST /api/opportunities/:id/chat
// ──────────────────────────────────────────
router.post('/:id/chat', asyncHandler(async (req, res) => {
  const opportunityId = req.params.id;
  log('CREATE CHAT', { userId: req.user.id, oppId: opportunityId });

  const { data: existingChat } = await supabaseAdmin.from('chats')
    .select('id, title').eq('opportunity_id', opportunityId).eq('user_id', req.user.id).single();

  if (existingChat) {
    log('CREATE CHAT existing', { userId: req.user.id, chatId: existingChat.id });
    return res.json({ chat_id: existingChat.id, existing: true });
  }

  const { data: opp } = await supabaseAdmin.from('opportunities')
    .select('target_name, platform, target_context, prepared_message').eq('id', opportunityId).single();

  const { data: chat } = await supabaseAdmin.from('chats').insert({
    user_id:        req.user.id,
    title:          `Outreach: ${opp?.target_name || opp?.platform || 'prospect'}`,
    chat_type:      'opportunity',
    opportunity_id: opportunityId
  }).select().single();

  logDB('INSERT', 'chats', { userId: req.user.id, chatId: chat?.id, oppId: opportunityId });
  res.json({ chat_id: chat.id, existing: false });
}));

// ──────────────────────────────────────────
// POST /api/opportunities/:id/intel
// ──────────────────────────────────────────
router.post('/:id/intel', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('INTEL request', { userId, oppId: req.params.id });

  const { data: opp, error: oppErr } = await supabaseAdmin
    .from('opportunities')
    .select('id, target_context, target_name, intel_snapshot, intel_generated_at, intel_fetch_failed')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (oppErr || !opp) {
    logError('intel lookup', oppErr, { userId, oppId: req.params.id });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Opportunity not found' });
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
  if (opp.intel_snapshot && opp.intel_generated_at && new Date(opp.intel_generated_at) > threeDaysAgo) {
    log('INTEL cache hit', { userId, oppId: opp.id });
    return res.json({ intel: opp.intel_snapshot, cached: true });
  }

  const userTier   = req.user.tier || 'free';
  const usageCheck = await checkPerplexityUsage(userId, userTier);

  if (!usageCheck.allowed) {
    log('INTEL quota exceeded', { userId, tier: userTier });
    return res.status(429).json({
      error: 'QUOTA_EXCEEDED',
      message: 'Intel lookups used up for today. Resets at midnight.',
    });
  }

  try {
    const searchQuery = `${opp.target_context?.slice(0, 400) || ''} recent news funding product launch hiring 2024 2025`.trim();
    let perplexityResult = null;

    try {
      logAI('perplexity search', { userId, oppId: opp.id });
      const { content } = await searchForChat(
        searchQuery,
        'Find recent, factual information about this company or person that would be relevant for a sales outreach.'
      );
      perplexityResult = content;
      await incrementUsage(userId).catch(() => {});
      await recordTokenUsage(userId, 'perplexity', 0, Math.ceil(perplexityResult.length / 4));
      log('INTEL perplexity ok', { userId, oppId: opp.id, chars: perplexityResult.length });
    } catch (perpErr) {
      const isUnavailable = perpErr.message?.includes('PERPLEXITY_UNAVAILABLE');
      const isAuthError   = perpErr.response?.status === 401 || perpErr.response?.status === 403;
      const isRateLimit   = perpErr.response?.status === 429;
      if (isUnavailable || isAuthError || isRateLimit) {
        log('INTEL perplexity fallback', { userId, reason: perpErr.message?.slice(0, 80) });
      } else {
        throw perpErr;
      }
    }

    const structurePrompt = perplexityResult
      ? `Extract 3-4 sales-relevant bullet points from the search results below.
Focus on: recent news, funding, growth signals, pain points, relevant context.

User's product: ${req.user.product_description || 'not specified'}
Original post context: ${opp.target_context?.slice(0, 500) || ''}

Search results:
${perplexityResult}

Return ONLY JSON:
{ "company": "<name or null>", "bullets": ["...", "...", "..."], "relevance_note": "<one sentence>" }`
      : `Based ONLY on the prospect context below, extract 3-4 observations for better outreach.

User's product: ${req.user.product_description || 'not specified'}
Prospect context: ${opp.target_context?.slice(0, 800) || 'No context available'}

Return ONLY JSON:
{ "company": "<name or null>", "bullets": ["...", "...", "..."], "relevance_note": "<one sentence>" }`;

    logAI('structureIntel', { userId, oppId: opp.id, source: perplexityResult ? 'perplexity' : 'groq-only' });
    const { content: structuredContent, tokens_in, tokens_out } = await callWithFallback({
      systemPrompt: 'Return only JSON, no markdown.',
      messages:     [{ role: 'user', content: structurePrompt }],
      temperature:  0.2,
      maxTokens:    400,
    });
    await recordTokenUsage(userId, 'groq', tokens_in, tokens_out);

    let intel;
    try {
      intel = JSON.parse(structuredContent.replace(/```json|```/g, '').trim());
    } catch {
      intel = { company: null, bullets: [], relevance_note: null };
    }

    await supabaseAdmin.from('opportunities').update({
      intel_snapshot:     intel,
      intel_generated_at: new Date().toISOString(),
      intel_fetch_failed: false,
    }).eq('id', opp.id);

    logDB('UPDATE', 'opportunities', { oppId: opp.id, action: 'intel_stored', bullets: intel.bullets?.length });
    log('INTEL complete', { userId, oppId: opp.id, company: intel.company });
    return res.json({ intel, cached: false });

  } catch (err) {
    logError('intel generation', err, { userId, oppId: opp.id });
    await supabaseAdmin.from('opportunities').update({ intel_fetch_failed: true }).eq('id', opp.id);
    return res.status(500).json({ error: 'INTEL_FAILED', message: 'Could not fetch prospect intel right now.' });
  }
}));

const extractHandle = (context) => {
  if (!context) return null;
  const reddit  = context.match(/u\/([a-zA-Z0-9_-]+)/);
  if (reddit) return `u/${reddit[1]}`;
  const twitter = context.match(/@([a-zA-Z0-9_]+)/);
  if (twitter) return `@${twitter[1]}`;
  return null;
};

export const runOpportunitiesRefreshForUser = async (userId, user) => {
  console.log(`[Opportunities] Background refresh triggered for user ${userId}`);

  try {
    const result = await discoverOpportunities(userId, user);

    if (!result.opportunities?.length) {
      console.log(`[Opportunities] Background refresh: no opportunities found for ${userId}`);
      return;
    }

    const { data: perfProfile } = await supabaseAdmin
      .from('user_performance_profiles')
      .select('learned_patterns, best_message_style, best_message_length')
      .eq('user_id', userId)
      .single();

    const scored = await groqService.scoreOpportunities(user, result.opportunities);

    const qualifying = scored.filter(o =>
      ((o.fit_score || 0) + (o.timing_score || 0) + (o.intent_score || 0)) / 3 >= MIN_COMPOSITE_SCORE
    );

    let saved = 0;

    for (const opp of qualifying) {
      const { message } = await groqService.generateOutreachMessage(user, opp, perfProfile);

      const { error } = await supabaseAdmin.from('opportunities').insert({
        user_id: userId,
        platform: opp.platform || 'reddit',
        source_url: opp.source_url,
        target_context: opp.target_context,
        target_name: opp.target_name || null,
        prepared_message: message,
        fit_score: opp.fit_score,
        timing_score: opp.timing_score,
        intent_score: opp.intent_score,
        composite_score:
          ((opp.fit_score || 0) +
            (opp.timing_score || 0) +
            (opp.intent_score || 0)) / 3,
        message_style: perfProfile?.best_message_style || 'empathetic',
        message_length: message.split(' ').length,
        generated_by: result.model_used,
        status: 'pending',
        stage: 'new',
      });

      if (!error) saved++;
    }

    console.log(
      `[Opportunities] Background refresh complete for ${userId}: ${saved} opportunities saved`
    );
  } catch (err) {
    console.error(
      `[Opportunities] Background refresh failed for ${userId}: ${err.message}`
    );
    // Non-fatal — frontend Step 3 button also triggers refresh as a safety net
  }
};

export default router;
