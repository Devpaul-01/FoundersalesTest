// src/services/perplexity.js
// ============================================================
// PERPLEXITY SONAR SERVICE — Multi-Platform + Smart Cost Routing
//
// FIX: Graceful fallback when PERPLEXITY_API_KEY is not set.
// Previously the service would create an axios client with
// 'Bearer undefined' and all calls would silently fail with
// a 401 or throw. Now we detect the missing key at startup
// and route all calls through the Groq fallback immediately,
// which generates realistic practice examples instead.
//
// The PERPLEXITY_AVAILABLE flag controls this:
//   - true:  API key is set → real searches attempted
//   - false: no key → always use Groq fallback
//
// This means the app works perfectly even before you subscribe
// to Perplexity. needsChatSearch still fires (uses Groq to
// detect intent) but will skip the Perplexity call and answer
// from Groq's knowledge instead.
// ============================================================

import axios from 'axios';
import { parseJSONArray } from '../utils/parser.js';
import {
  PERPLEXITY_LIMITS,
  PERPLEXITY_GLOBAL_DAILY_CAP,
  PERPLEXITY_COST_PER_CALL_CENTS,
  OPPORTUNITIES_PER_RUN,
  SUPPORTED_PLATFORMS,
  ARCHETYPE_PLATFORM_DEFAULTS,
} from '../config/constants.js';
import supabaseAdmin from '../config/supabase.js';

// ── API key availability check ────────────────────────────────────────────────
const PERPLEXITY_API_KEY   = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_AVAILABLE = !!(PERPLEXITY_API_KEY?.trim());

if (!PERPLEXITY_AVAILABLE) {
  console.warn('[Perplexity] PERPLEXITY_API_KEY not set — all calls will use Groq fallback until key is configured.');
}

const perplexityClient = PERPLEXITY_AVAILABLE
  ? axios.create({
      baseURL: process.env.PERPLEXITY_API_URL || 'https://api.perplexity.ai',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type':  'application/json'
      },
      timeout: 45000
    })
  : null;

// ============================================================
// SMART COST ROUTER
// Groq determines if this query actually needs real-time search.
// Returns true only if the user profile strongly suggests fresh
// leads would be found right now.
// ============================================================

export const needsRealTimeSearch = async (user) => {
  // Fast-path: skip if profile is too thin
  if (!user.product_description || user.product_description.length < 30) {
    return { needed: false, reason: 'profile_too_thin' };
  }
  if (!user.target_audience || user.target_audience.length < 20) {
    return { needed: false, reason: 'no_target_audience' };
  }

  // If Perplexity not available, no point deciding — we'll use Groq fallback anyway
  if (!PERPLEXITY_AVAILABLE) {
    return { needed: false, reason: 'perplexity_not_configured' };
  }

  const { callGroq } = await import('./groq.js');

  const prompt = `You are deciding whether to make an expensive real-time web search API call.

Analyze this user profile and decide: does a live search right now have a GOOD CHANCE of finding specific, relevant people expressing the problem this product solves?

Product: "${user.product_description}"
Target audience: "${user.target_audience}"
ICP trigger: "${user.voice_profile?.icp_trigger || 'not specified'}"
Preferred platforms: ${JSON.stringify(user.preferred_platforms || [])}
Archetype: "${user.archetype || 'seller'}"

Answer ONLY with this exact JSON (no markdown, no explanation):
{"needed": true, "reason": "one short sentence why"}
OR
{"needed": false, "reason": "one short sentence why not"}

Lean toward false if:
- The ICP trigger is too vague to find in posts (e.g. "anyone who wants to grow")
- The product is too generic (e.g. "productivity tool for everyone")
- The archetype is creator/learner/professional (these users rarely need lead discovery)

Lean toward true if:
- There is a specific, searchable pain point in the audience description
- The product solves a niche, concrete problem with clear signals
- Preferred platforms have active communities discussing this problem`;

  try {
    const { content } = await callGroq({
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens:   80,
    });

    const clean  = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (typeof parsed.needed === 'boolean') {
      console.log(`[SmartRouter] Real-time search ${parsed.needed ? 'NEEDED' : 'SKIPPED'}: ${parsed.reason}`);
      return parsed;
    }
    return { needed: true, reason: 'parse_fallback' };
  } catch (err) {
    console.warn('[SmartRouter] Decision failed, defaulting to Groq fallback:', err.message);
    return { needed: false, reason: 'error_fallback' };
  }
};

// ============================================================
// PLATFORM DETECTION
// ============================================================

const PLATFORM_URL_PATTERNS = [
  { platform: SUPPORTED_PLATFORMS.REDDIT,       pattern: /reddit\.com/i },
  { platform: SUPPORTED_PLATFORMS.LINKEDIN,     pattern: /linkedin\.com/i },
  { platform: SUPPORTED_PLATFORMS.TWITTER,      pattern: /twitter\.com|x\.com/i },
  { platform: SUPPORTED_PLATFORMS.FACEBOOK,     pattern: /facebook\.com/i },
  { platform: SUPPORTED_PLATFORMS.INSTAGRAM,    pattern: /instagram\.com/i },
  { platform: SUPPORTED_PLATFORMS.PRODUCTHUNT,  pattern: /producthunt\.com/i },
  { platform: SUPPORTED_PLATFORMS.INDIEHACKERS, pattern: /indiehackers\.com/i },
  { platform: SUPPORTED_PLATFORMS.HACKERNEWS,   pattern: /news\.ycombinator\.com/i },
  { platform: SUPPORTED_PLATFORMS.QUORA,        pattern: /quora\.com/i },
  { platform: SUPPORTED_PLATFORMS.YOUTUBE,      pattern: /youtube\.com/i },
];

const detectPlatformFromUrl = (url) => {
  for (const { platform, pattern } of PLATFORM_URL_PATTERNS) {
    if (pattern.test(url)) return platform;
  }
  return 'web';
};

// ============================================================
// MULTI-PLATFORM SEARCH QUERY BUILDER
// ============================================================

const PLATFORM_SEARCH_CONTEXTS = {
  reddit:       'Reddit posts and comments where people are asking for help',
  linkedin:     'LinkedIn posts where professionals are expressing challenges or seeking solutions',
  twitter:      'Tweets and X posts where people are venting about problems or asking for recommendations',
  facebook:     'Facebook group posts and public discussions about challenges',
  instagram:    'Instagram posts, captions, or Reels comments expressing frustration or needs',
  producthunt:  'Product Hunt discussions, launches, or comment threads showing demand',
  indiehackers: 'Indie Hackers forum posts or milestone posts discussing problems',
  hackernews:   'Hacker News "Ask HN" posts or discussion threads',
  quora:        'Quora questions where people are asking about this problem',
  youtube:      'YouTube video comments or community posts expressing pain points',
};

const buildMultiPlatformQuery = (user) => {
  const product    = user.product_description || 'their product';
  const audience   = user.target_audience     || 'entrepreneurs';
  const trigger    = user.voice_profile?.icp_trigger || '';
  const archetype  = user.archetype || 'seller';

  const userPlatforms = user.preferred_platforms?.length
    ? user.preferred_platforms
    : ARCHETYPE_PLATFORM_DEFAULTS[archetype] || ['reddit', 'linkedin', 'twitter'];

  const platformContexts = userPlatforms
    .map(p => PLATFORM_SEARCH_CONTEXTS[p])
    .filter(Boolean)
    .join(', and ');

  return `Search across ${platformContexts} for ${OPPORTUNITIES_PER_RUN} recent posts from the last 72 hours where ${audience} are:
- Asking for help with problems that "${product}" solves
- Expressing frustration with challenges related to their work or goals
- Actively seeking recommendations, tools, or solutions
${trigger ? `- Showing signs of: ${trigger}` : ''}

For each result provide:
1. The direct URL to the post, thread, or comment
2. The username, handle, or author name
3. A 2-3 sentence summary of what they said and what problem they have
4. Why this is a relevant opportunity for someone selling "${product}"
5. Which platform this is from

Focus on posts where the person has a genuine, specific problem — not general discussions.
Prioritize posts from the last 24 hours. Include only public posts.
Return results from across the listed platforms, not just one.`;
};

// ============================================================
// USAGE TRACKING
// ============================================================

export const checkPerplexityUsage = async (userId, tier = 'free') => {
  const today = new Date().toISOString().split('T')[0];
  const limit = PERPLEXITY_LIMITS[tier] || PERPLEXITY_LIMITS.free;

  const { data: globalUsage } = await supabaseAdmin
    .from('global_usage')
    .select('perplexity_calls')
    .eq('date', today)
    .single();

  if ((globalUsage?.perplexity_calls || 0) >= PERPLEXITY_GLOBAL_DAILY_CAP) {
    return { allowed: false, reason: 'global_cap', used: 0, limit };
  }

  const { data: userUsage } = await supabaseAdmin
    .from('perplexity_usage')
    .select('call_count')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  const used = userUsage?.call_count || 0;
  return {
    allowed: used < limit,
    reason:  used >= limit ? 'daily_limit' : null,
    used,
    limit
  };
};

export const incrementUsage = async (userId) => {
  const today = new Date().toISOString().split('T')[0];

  await supabaseAdmin.from('perplexity_usage').upsert(
    { user_id: userId, date: today, call_count: 1 },
    { onConflict: 'user_id,date', ignoreDuplicates: false }
  ).catch(() => {});

  await supabaseAdmin.from('global_usage').upsert(
    { date: today, perplexity_calls: 1 },
    { onConflict: 'date', ignoreDuplicates: false }
  ).catch(() => {});
};

// ============================================================
// PERPLEXITY API CALL
// ============================================================

const callPerplexity = async (query) => {
  if (!PERPLEXITY_AVAILABLE || !perplexityClient) {
    throw new Error('PERPLEXITY_UNAVAILABLE: API key not configured');
  }

  const response = await perplexityClient.post('/chat/completions', {
    model:    process.env.PERPLEXITY_MODEL || 'sonar-pro',
    messages: [{ role: 'user', content: query }],
    max_tokens:               2000,
    temperature:              0.2,
    return_citations:         true,
    return_related_questions: false,
  });

  return {
    content:   response.data.choices[0]?.message?.content || '',
    citations: response.data.citations || []
  };
};

const parseMultiPlatformOpportunities = (rawText, citations = []) => {
  const opportunities = [];
  const urlPattern    = /https?:\/\/[^\s<>"{}|\\^[\]`]+/g;

  // Try to extract structured URL + context pairs
  const lines    = rawText.split('\n');
  let currentUrl = null;
  let context    = [];

  for (const line of lines) {
    const urlMatch = line.match(urlPattern)?.[0]?.replace(/[.,;)]+$/, '');
    if (urlMatch && urlMatch.length > 20) {
      // Save previous entry
      if (currentUrl && context.length > 0) {
        opportunities.push({
          platform:       detectPlatformFromUrl(currentUrl),
          source_url:     currentUrl,
          target_context: context.join(' ').trim(),
          prepared_message: null
        });
      }
      currentUrl = urlMatch;
      context    = [line.replace(urlMatch, '').trim()].filter(Boolean);
    } else if (currentUrl && line.trim()) {
      context.push(line.trim());
    }
  }

  // Save last entry
  if (currentUrl && context.length > 0) {
    opportunities.push({
      platform:       detectPlatformFromUrl(currentUrl),
      source_url:     currentUrl,
      target_context: context.join(' ').trim(),
      prepared_message: null
    });
  }

  // Also check citations
  for (const cite of citations) {
    const urlData = typeof cite === 'string' ? { url: cite } : cite;
    if (!urlData?.url) continue;

    const alreadyAdded = opportunities.some(o => o.source_url === urlData.url);
    if (!alreadyAdded) {
      const platform = detectPlatformFromUrl(urlData.url);
      const context  = urlData.title || urlData.context || 'Found relevant discussion';
      opportunities.push({
        platform,
        source_url:     urlData.url,
        target_context: context,
        prepared_message: null
      });
    }
  }

  // Fallback: any URL with enough context
  if (opportunities.length === 0) {
    const anyUrls = [...rawText.matchAll(urlPattern)]
      .map(m => m[0].replace(/[.,;)]+$/, ''))
      .filter(url => url.length > 20)
      .slice(0, 5);

    for (const url of anyUrls) {
      opportunities.push({
        platform:       detectPlatformFromUrl(url),
        source_url:     url,
        target_context: 'Found relevant discussion — click to view full context',
        prepared_message: null
      });
    }
  }

  return opportunities;
};

// ============================================================
// GROQ FALLBACK (when Perplexity limit hit, unavailable, or not configured)
// ============================================================

const searchWithGroqFallback = async (user) => {
  const { callGroq } = await import('./groq.js');

  const platforms = user.preferred_platforms?.length
    ? user.preferred_platforms
    : ARCHETYPE_PLATFORM_DEFAULTS[user.archetype || 'seller'] || ['reddit', 'linkedin'];

  const prompt = `Generate ${Math.min(OPPORTUNITIES_PER_RUN, 6)} realistic practice outreach opportunities for someone who sells:
"${user.product_description}"
Target audience: ${user.target_audience}
Archetype: ${user.archetype || 'seller'}
Preferred platforms: ${platforms.join(', ')}

Since this is a fallback (no live search available), create realistic fictional example scenarios of the type of person this user should be reaching out to.
Distribute examples across the preferred platforms listed above.

Return ONLY a JSON array:
[{
  "platform": "reddit",
  "source_url": "https://reddit.com/r/[relevant_subreddit]/comments/example",
  "target_context": "Vivid description of a real-seeming person and what specific problem they posted about",
  "note": "Practice example"
}]

Make contexts feel real — include specific details, realistic frustrations, and platform-appropriate language.`;

  try {
    const { content } = await callGroq({
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.75,
      maxTokens:   900
    });
    const examples = parseJSONArray(content, []);
    return {
      opportunities: examples.map(e => ({ ...e, is_example: true, prepared_message: null })),
      model_used:    'groq_fallback',
      notice:        PERPLEXITY_AVAILABLE
        ? "You've used today's live search limit. Showing practice opportunities instead. Resets at midnight."
        : "Live search not yet configured. Showing example opportunities to practice with.",
      is_fallback:   true
    };
  } catch (err) {
    console.error('[Perplexity] Groq fallback failed:', err.message);
    return { opportunities: [], model_used: 'groq_fallback', notice: "Could not generate examples.", is_fallback: true };
  }
};

// ============================================================
// MAIN EXPORT
// ============================================================

export const discoverOpportunities = async (userId, user) => {
  // If Perplexity not configured, skip directly to Groq fallback
  if (!PERPLEXITY_AVAILABLE) {
    return await searchWithGroqFallback(user);
  }

  const tier       = user.tier || 'free';
  const usageCheck = await checkPerplexityUsage(userId, tier);

  if (!usageCheck.allowed) {
    console.log(`[Perplexity] Limit hit for ${userId} (${usageCheck.reason}), falling back to Groq`);
    return await searchWithGroqFallback(user);
  }

  // Smart cost router: ask Groq if real-time search is even needed
  const routerDecision = await needsRealTimeSearch(user);
  if (!routerDecision.needed) {
    console.log(`[SmartRouter] Skipping Perplexity for ${userId}: ${routerDecision.reason}`);
    return await searchWithGroqFallback(user);
  }

  try {
    const query   = buildMultiPlatformQuery(user);
    const { content, citations } = await callPerplexity(query);

    await incrementUsage(userId);

    const rawOpportunities = parseMultiPlatformOpportunities(content, citations);

    return {
      opportunities: rawOpportunities,
      model_used:    'perplexity',
      is_fallback:   false,
      notice:        null,
      usage: {
        used:  usageCheck.used + 1,
        limit: usageCheck.limit
      }
    };
  } catch (err) {
    console.error(`[Perplexity] Search failed for ${userId}:`, err.message);
    const fallback = await searchWithGroqFallback(user);
    return { ...fallback, notice: "Live search had an issue. Showing example opportunities instead." };
  }
};

// ============================================================
// CHAT SEARCH ROUTER
// Determines if a user's chat message needs real-time search.
// Used by chat.js stream route only.
// ============================================================

/**
 * Fast check: does this chat message require real-time web search?
 * Uses Groq (cheapest model, ~200ms).
 * Returns { needs_search: boolean, reason: string }
 *
 * NOTE: This always returns false when Perplexity is not configured,
 * so the caller falls through to Groq for the actual answer.
 */
export const needsChatSearch = async (message) => {
  // If Perplexity not available, never route to it
  if (!PERPLEXITY_AVAILABLE) {
    return { needs_search: false, reason: 'perplexity_not_configured' };
  }

  const { callGroq: cg } = await import('./groq.js');

  const prompt = `You decide if a user's question needs a real-time web search to answer accurately.

Question: "${message.slice(0, 400)}"

Answer ONLY with this JSON (no markdown):
{"needs_search": true, "reason": "one short sentence"}
OR
{"needs_search": false, "reason": "one short sentence"}

Search IS needed for: current news, recent events, today's prices/data, "latest" anything, specific current roles/positions, live market info.
Search is NOT needed for: sales strategy advice, coaching, product feedback, how-to questions, writing help, explaining concepts, personal business advice.`;

  try {
    const { content } = await cg({
      messages:    [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens:   60,
    });
    const clean  = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (typeof parsed.needs_search === 'boolean') {
      console.log(`[ChatRouter] Search ${parsed.needs_search ? 'NEEDED' : 'SKIPPED'}: ${parsed.reason}`);
      return parsed;
    }
    return { needs_search: false, reason: 'parse_fallback' };
  } catch (err) {
    console.warn('[ChatRouter] needsChatSearch failed, defaulting to no search:', err.message);
    return { needs_search: false, reason: 'error_fallback' };
  }
};

/**
 * Call Perplexity for a real-time chat response.
 * Returns { content: string, citations: array }
 * Throws if Perplexity not configured.
 */
export const searchForChat = async (message, systemContext = '') => {
  if (!PERPLEXITY_AVAILABLE || !perplexityClient) {
    throw new Error('PERPLEXITY_UNAVAILABLE: API key not configured');
  }

  const response = await perplexityClient.post('/chat/completions', {
    model:    process.env.PERPLEXITY_MODEL || 'sonar-pro',
    messages: [
      {
        role:    'system',
        content: systemContext
          ? `${systemContext}\n\nAnswer using current, real-time information. Be concise and direct.`
          : 'You are a helpful assistant. Answer using current, real-time information. Be concise and direct.',
      },
      { role: 'user', content: message },
    ],
    max_tokens:               1000,
    temperature:              0.3,
    return_citations:         true,
    return_related_questions: false,
  });

  return {
    content:   response.data.choices[0]?.message?.content || '',
    citations: response.data.citations || [],
  };
};

export default { discoverOpportunities, checkPerplexityUsage, needsRealTimeSearch };
