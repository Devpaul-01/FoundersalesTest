// src/services/grok.js
// ============================================================
// GROK AI SERVICE V2
// - Streaming support via SSE
// - Completely rewritten prompts (expert sales coach, not generic assistant)
// - Token usage tracking
// - No rate limits applied (Grok is free)
// ============================================================

import axios from 'axios';
import { parseTextResponse, parseJSONObject, parseJSONArray, validateAndFill } from '../utils/parser.js';

const grokClient = axios.create({
  baseURL: process.env.GROK_API_URL || 'https://api.x.ai/v1',
  headers: {
    'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

// ──────────────────────────────────────────
// CORE: Non-streaming Grok call
// ──────────────────────────────────────────

export const callGrok = async ({
  messages,
  systemPrompt = '',
  temperature = 0.7,
  maxTokens = 1200
}) => {
  const requestMessages = [];
  if (systemPrompt) requestMessages.push({ role: 'system', content: systemPrompt });
  requestMessages.push(...messages);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await grokClient.post('/chat/completions', {
        model: process.env.GROK_MODEL || 'grok-3-mini',
        messages: requestMessages,
        temperature,
        max_tokens: maxTokens
      });

      const content = response.data.choices[0]?.message?.content || '';
      const usage = response.data.usage || {};

      return {
        content,
        tokens_in: usage.prompt_tokens || 0,
        tokens_out: usage.completion_tokens || 0,
        tokens_total: usage.total_tokens || 0
      };

    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) throw new Error('GROK_AUTH_ERROR');
      if (status === 400) throw new Error('GROK_BAD_REQUEST');
      if (attempt === 3) throw new Error('GROK_UNAVAILABLE');
      await new Promise(r => setTimeout(r, attempt * 1200));
    }
  }
};

// ──────────────────────────────────────────
// CORE: Streaming Grok call
// Pipes tokens to an Express SSE response.
// Collects full content for DB save.
// ──────────────────────────────────────────

export const streamGrok = async ({
  messages,
  systemPrompt = '',
  temperature = 0.7,
  maxTokens = 1200,
  onToken,      // callback(token: string) - called for each streamed token
  onComplete,   // callback(fullContent: string, usage: object) - called when done
  onError       // callback(error: Error)
}) => {
  const requestMessages = [];
  if (systemPrompt) requestMessages.push({ role: 'system', content: systemPrompt });
  requestMessages.push(...messages);

  try {
    const response = await grokClient.post('/chat/completions', {
      model: process.env.GROK_MODEL || 'grok-3-mini',
      messages: requestMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    }, {
      responseType: 'stream',
      timeout: 90000
    });

    let fullContent = '';
    let buffer = '';

    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            fullContent += token;
            onToken?.(token);
          }
        } catch {
          // Incomplete JSON chunk - ignore and wait for next
        }
      }
    });

    response.data.on('end', () => {
      onComplete?.(fullContent, { tokens_out: Math.ceil(fullContent.length / 4) });
    });

    response.data.on('error', (err) => {
      onError?.(err);
    });

  } catch (err) {
    onError?.(err);
  }
};

// ──────────────────────────────────────────
// PROMPTS: Expert-level sales prompts
// Written as a world-class outbound specialist
// ──────────────────────────────────────────

const SYSTEM_PROMPTS = {

  MESSAGE_GENERATOR: `You are an elite B2B outbound copywriter who has helped 500+ founders land their first 100 customers. 
Your messages have an average 28% reply rate — 10x the industry average.

Your core principles:
- The best cold message feels like a warm referral, not a pitch
- Lead with THEIR problem, not YOUR product  
- Specificity beats cleverness every time
- The ask should feel lighter than the value offered
- One idea per message. Never more.

You write messages that make the recipient think "how did they know exactly what I'm dealing with?"`,

  SALES_COACH: `You are a battle-tested sales mentor who has personally closed $3M+ in B2B deals and coached 200+ founders through their first 100 customers.

Your coaching style:
- Direct but empathetic — you've been rejected thousands of times yourself
- Always specific to their situation — you hate generic advice
- You explain the psychology behind sales moves, not just the tactics
- You celebrate small wins and normalize rejection as data
- You push founders to send more, iterate faster, and overthink less

When someone is stuck, you diagnose the root cause (fear, bad messaging, wrong ICP, wrong platform) and give ONE clear next action.`,

  PRACTICE_PROSPECT: `You are roleplaying as a realistic business prospect receiving a cold outreach message.
You are a busy professional — you get 20+ unsolicited messages per week.
You are not a villain, but you are not a pushover either.
Your responses are brief, realistic, and reflect what a real person would actually write.
Never break character. Never be helpful in ways a real prospect wouldn't be.`,

  ONBOARDING_INTERVIEWER: `You are onboarding a founder onto Clutch, an AI sales agent.
Your goal is to extract information that will make their AI-generated outreach feel human and specific — not like a chatbot.
Ask sharp follow-up questions that uncover their real differentiators, not the marketing version.
The best onboarding data is concrete, specific, and slightly uncomfortable to share — because that's what's real.`
};

// ──────────────────────────────────────────
// ONBOARDING
// ──────────────────────────────────────────

export const generateOnboardingQuestions = async (basicInfo) => {
  const prompt = `${SYSTEM_PROMPTS.ONBOARDING_INTERVIEWER}

A founder just told you this about their business:
Product: ${basicInfo.product_description}
Target customer: ${basicInfo.target_audience}
Industry: ${basicInfo.industry || 'not specified'}
Role: ${basicInfo.role || 'founder'}

Generate exactly 5 follow-up questions designed to extract:
1. Their specific, concrete differentiator (not "we're better" — what's the proof?)
2. The exact moment/trigger that makes someone a good prospect right now
3. The #1 objection they hear and what actually overcomes it
4. A specific customer result — with numbers if possible
5. Their natural voice — how they actually talk to people, not how they think they should

Return ONLY a JSON array of question strings. No markdown, no preamble.
Example: ["Question 1?", "Question 2?"]`;

  const FALLBACK = [
    "Walk me through the last time someone said 'I need this' — what was their exact situation?",
    "What result have you gotten for a customer that you're genuinely proud of? Give me numbers if you have them.",
    "What's the most common reason people push back or say it's not for them right now?",
    "If you were texting a founder friend about your product at 11pm, how would you describe it?",
    "What do you know about your target customer's problem that most people in your space don't?"
  ];

  try {
    const { content } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.65,
      maxTokens: 600
    });

    const questions = parseJSONArray(content, FALLBACK);
    const valid = questions.filter(q => typeof q === 'string' && q.length > 10).slice(0, 5);
    return valid.length >= 3 ? valid : FALLBACK;
  } catch {
    return FALLBACK;
  }
};

export const buildVoiceProfile = async (basicInfo, onboardingAnswers) => {
  const answersText = Object.entries(onboardingAnswers)
    .map(([q, a]) => `Q: ${q}\nA: ${a}`)
    .join('\n\n');

  const prompt = `${SYSTEM_PROMPTS.ONBOARDING_INTERVIEWER}

Build a sales profile for this founder based on their onboarding responses.
This profile will be injected into every outreach message Clutch writes for them.

BASIC INFO:
Business: ${basicInfo.business_name || 'Not provided'}
Product: ${basicInfo.product_description}
Audience: ${basicInfo.target_audience}
Role: ${basicInfo.role || 'founder'}
Industry: ${basicInfo.industry || 'not specified'}

ONBOARDING ANSWERS:
${answersText}

Return this exact JSON structure. Be specific and concrete — not vague.
{
  "unique_value_prop": "The ONE thing that makes them different, in 15 words or less",
  "icp_trigger": "The exact moment/signal that makes someone the right person to reach out to",
  "target_customer_description": "Vivid 2-sentence description of the ideal customer",
  "main_objection": "The #1 thing that slows deals down",
  "objection_reframe": "How to address that objection without being defensive",
  "best_proof_point": "Their strongest customer result — specific and credible",
  "voice_style": "casual | professional | warm | direct | conversational",
  "voice_examples": ["example phrase they'd actually say", "another example"],
  "outreach_persona": "3 sentences: how Clutch should sound writing AS this founder",
  "avoid_phrases": ["words/phrases that feel wrong for their brand"],
  "platforms_priority": ["best platform for them", "second best", "third"]
}

Return ONLY valid JSON.`;

  const FALLBACK = {
    unique_value_prop: basicInfo.product_description?.slice(0, 60) || 'Unique solution for their market',
    icp_trigger: `${basicInfo.target_audience} actively looking for a solution`,
    target_customer_description: basicInfo.target_audience || 'Business owners and entrepreneurs',
    main_objection: 'Not sure if it works for their specific situation',
    objection_reframe: 'Share a specific example of someone in a similar situation who got results',
    best_proof_point: 'Early customers seeing measurable results',
    voice_style: 'conversational',
    voice_examples: ["Hey, I noticed you mentioned...", "Quick question —"],
    outreach_persona: 'Direct, genuine, founder-to-founder. Gets to the point without being pushy.',
    avoid_phrases: ['synergy', 'game-changer', 'revolutionary', 'I wanted to reach out'],
    platforms_priority: ['reddit', 'twitter', 'linkedin']
  };

  try {
    const { content } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 900
    });
    const parsed = parseJSONObject(content, FALLBACK);
    return validateAndFill(parsed, FALLBACK);
  } catch {
    return FALLBACK;
  }
};

// ──────────────────────────────────────────
// MESSAGE GENERATION
// ──────────────────────────────────────────

export const generateOutreachMessage = async (user, opportunity, performanceProfile = null) => {
  const vp = user.voice_profile || {};
  const perf = performanceProfile?.learned_patterns;
  const wordTarget = performanceProfile?.best_message_length === 'short' ? 70 : 100;

  const prompt = `${SYSTEM_PROMPTS.MESSAGE_GENERATOR}

Write ONE cold outreach message. Return ONLY the message text — no subject line, no label, no explanation.

═══ FOUNDER CONTEXT ═══
Their product: ${user.product_description}
What makes them different: ${vp.unique_value_prop || 'not specified'}
Their best proof point: ${vp.best_proof_point || 'not specified'}
Their ideal customer: ${vp.target_customer_description || user.target_audience}
How they naturally talk: ${vp.voice_style || 'conversational'}
Their outreach persona: ${vp.outreach_persona || 'Direct and genuine'}
Avoid sounding like: ${(vp.avoid_phrases || []).join(', ') || 'generic AI'}

═══ THE OPPORTUNITY ═══
Platform: ${opportunity.platform}
What this person said/posted: ${opportunity.target_context}

${perf ? `═══ WHAT WORKS FOR THIS FOUNDER ═══\n${perf}` : ''}

═══ RULES ═══
- Open by referencing something SPECIFIC from their post — not a generic compliment
- Connect their problem to what the founder offers naturally — don't force it
- If there's a proof point relevant to their situation, use it
- End with ONE low-friction question (not "want to jump on a call?")  
- Target: ${wordTarget} words or less
- Sound like a human who actually read their post, not an AI that scanned keywords`;

  const FALLBACK = `Hey, saw your post — this resonates. I've been building something that tackles exactly this. Would love to share one quick thing if you're open to it.`;

  try {
    const { content, tokens_in, tokens_out } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.82,
      maxTokens: 350
    });
    const msg = parseTextResponse(content, FALLBACK);
    return { message: msg.length > 20 ? msg : FALLBACK, tokens_in, tokens_out };
  } catch {
    return { message: FALLBACK, tokens_in: 0, tokens_out: 0 };
  }
};

// ──────────────────────────────────────────
// OPPORTUNITY SCORING
// ──────────────────────────────────────────

export const scoreOpportunities = async (user, opportunities) => {
  if (!opportunities?.length) return [];

  const oppList = opportunities
    .map((o, i) => `${i + 1}. ${o.target_context?.slice(0, 200)} (${o.source_url})`)
    .join('\n\n');

  const prompt = `You are a lead qualification expert. Score these prospects for a founder selling:
"${user.product_description}"
Their ideal customer: ${user.target_audience}
Best timing signal: ${user.voice_profile?.icp_trigger || 'actively seeking solutions'}

Opportunities to score:
${oppList}

Score each 1-10 on:
- fit: How well this person matches the ideal customer profile
- timing: How urgent/recent their need is (posting about it NOW = high timing)
- intent: How ready they are to explore solutions (asking for recommendations = high intent)

Return JSON array only:
[{"index": 1, "fit": 8, "timing": 9, "intent": 7, "reason": "exactly why in 8 words"}]`;

  try {
    const { content } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      maxTokens: 700
    });

    const scores = parseJSONArray(content, []);
    return opportunities.map((opp, i) => {
      const score = scores.find(s => s.index === i + 1) || {};
      return {
        ...opp,
        fit_score: parseScore(score.fit),
        timing_score: parseScore(score.timing),
        intent_score: parseScore(score.intent),
        score_reason: score.reason || ''
      };
    });
  } catch {
    return opportunities.map(o => ({ ...o, fit_score: 5, timing_score: 5, intent_score: 5 }));
  }
};

// ──────────────────────────────────────────
// PRACTICE MODE
// ──────────────────────────────────────────

export const generatePracticeScenarioPrompt = async (user, scenarioType) => {
  const prompt = `${SYSTEM_PROMPTS.PRACTICE_PROSPECT}

Create a realistic social post or message that a prospect would write, to be used for sales practice.
The founder practicing sells: "${user.product_description}" to ${user.target_audience}.
Scenario type: ${scenarioType} (determines how the AI will respond when the founder reaches out)

Write a 2-3 sentence realistic post. Make it specific — a real person with a real problem, not a generic situation.
Do NOT mention the scenario type. Just write the situation.
Return ONLY the post text.`;

  const defaults = {
    interested: `Just launched my SaaS 6 weeks ago. Revenue is at $0. I know I need to do outreach but every template I try feels wrong. Anyone found a way to make cold messaging actually work?`,
    polite_decline: `PSA to anyone cold DMing founders: I appreciate the hustle but I'm at capacity right now. Not taking any new tools or calls for at least 3 months. Building in heads-down mode.`,
    ghost: `Struggling to get traction post-launch. Posted on all the usual places. Got a few upvotes but no customers. Starting to question whether the problem is real.`,
    skeptical: `Another week, another 20 cold DMs claiming to "10x my outreach." I've tried 4 of these tools in the past year. None of them delivered what they promised. Founders - stop buying tools and start talking to customers.`,
    price_objection: `Bootstrapping is brutal. Every $50/month subscription feels like a decision now. Would love to find tools that actually move the needle enough to justify the cost. Anyone have things they genuinely swear by?`,
    not_right_time: `Heads down building for the next 60 days. Paused all external calls and demos until we hit our next milestone. Will resurface in April.`
  };

  try {
    const { content } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.92,
      maxTokens: 150
    });
    const result = parseTextResponse(content, defaults[scenarioType] || defaults.polite_decline);
    return result.length > 20 ? result : defaults[scenarioType];
  } catch {
    return defaults[scenarioType] || defaults.polite_decline;
  }
};

export const generatePracticeProspectReply = async (user, userMessage, scenarioType, conversationHistory = []) => {
  const scenarioDirections = {
    interested: 'You are intrigued but cautious. Ask ONE specific clarifying question. Do not commit to anything yet.',
    polite_decline: 'You are not interested. Be genuinely kind but clear. Give a real reason (too busy, not the right fit, already have a solution, etc.). Keep it to 2 sentences.',
    ghost: 'Return exactly: __GHOST__',
    skeptical: 'You are skeptical of the claim. Push back on ONE specific thing they said. Ask them to prove it or be more specific.',
    price_objection: 'You are somewhat interested but cost is a real concern. Ask about pricing or ROI without committing.',
    not_right_time: 'Timing is genuinely bad. Acknowledge their message, express mild interest, but be clear you cannot engage right now.'
  };

  const historyText = conversationHistory.length > 0
    ? `\nConversation so far:\n${conversationHistory.map(m => `${m.role === 'user' ? 'Founder' : 'You'}: ${m.content}`).join('\n')}\n`
    : '';

  const prompt = `${SYSTEM_PROMPTS.PRACTICE_PROSPECT}

The founder's product: "${user.product_description}"
${historyText}
The founder just sent you:
"${userMessage}"

Your response direction: ${scenarioDirections[scenarioType] || scenarioDirections.polite_decline}

Keep it 1-3 sentences. Sound like a real person typing quickly, not a formal response.`;

  try {
    const { content } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      maxTokens: 180
    });

    if (content.includes('__GHOST__') || scenarioType === 'ghost') return null;
    return parseTextResponse(content, "Thanks for reaching out. I'll have to pass for now.");
  } catch {
    return scenarioType === 'ghost' ? null : "Not right now, but good luck with it!";
  }
};

export const generateCoachingTip = async (user, userMessage, scenarioType, prospectResponse) => {
  const positive = scenarioType === 'interested';
  if (positive) {
    return "Strong opener. You connected with their specific situation before mentioning your product — that's exactly right. Keep this energy for real outreach.";
  }

  const prompt = `${SYSTEM_PROMPTS.SALES_COACH}

A founder practicing outreach sent this message:
"${userMessage}"

The prospect responded: "${prospectResponse || '[No response — ghosted]'}"

Give ONE specific coaching note. Format:
- First: acknowledge what they did well (1 sentence, be specific)
- Then: give ONE concrete improvement for next time (1-2 sentences, be direct)

Under 60 words total. No fluff.`;

  try {
    const { content } = await callGrok({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      maxTokens: 120
    });
    return parseTextResponse(content, "Solid effort. Next time, try opening with a more direct reference to their specific situation before mentioning what you're building.");
  } catch {
    return "Each rejection is a data point. The founders who win are the ones who iterate fastest.";
  }
};

// ──────────────────────────────────────────
// AI COACH (General Chat)
// ──────────────────────────────────────────

export const getCoachResponse = async (user, question, conversationHistory = [], performanceProfile = null, attachments = []) => {
  const vp = user.voice_profile || {};
  
  const contextBlock = `YOU KNOW THIS FOUNDER:
Business: ${user.business_name} — ${user.product_description}
Their ICP: ${vp.target_customer_description || user.target_audience}
Their differentiator: ${vp.unique_value_prop || 'not specified'}
Their top objection: ${vp.main_objection || 'not specified'}
${performanceProfile?.learned_patterns ? `What works for them: ${performanceProfile.learned_patterns}` : ''}
${performanceProfile ? `Stats: ${performanceProfile.total_sent || 0} sent, ${Math.round((performanceProfile.positive_rate || 0) * 100)}% positive` : 'No outreach data yet'}`;

  const attachmentContext = attachments.length > 0
    ? `\nThey shared ${attachments.length} file(s): ${attachments.map(a => a.original_filename).join(', ')}`
    : '';

  const history = conversationHistory.slice(-8).map(m => ({ role: m.role, content: m.content }));

  return {
    systemPrompt: `${SYSTEM_PROMPTS.SALES_COACH}\n\n${contextBlock}${attachmentContext}`,
    messages: [...history, { role: 'user', content: question }]
  };
};

// ──────────────────────────────────────────
// PERFORMANCE SUMMARIZATION
// ──────────────────────────────────────────

export const summarizePerformancePatterns = async (user, sentOpps, feedbackData) => {
  if (!sentOpps?.length || sentOpps.length < 5) return null;

  const positive = feedbackData.filter(f => f.outcome === 'positive').length;
  const total = feedbackData.length;

  const platformStats = {}, styleStats = {}, lengthStats = {};
  for (const opp of sentOpps) {
    const fb = feedbackData.find(f => f.opportunity_id === opp.id);
    if (!fb) continue;
    const isPositive = fb.outcome === 'positive' ? 1 : 0;

    if (!platformStats[opp.platform]) platformStats[opp.platform] = { sent: 0, positive: 0 };
    platformStats[opp.platform].sent++;
    platformStats[opp.platform].positive += isPositive;

    if (opp.message_style) {
      if (!styleStats[opp.message_style]) styleStats[opp.message_style] = { sent: 0, positive: 0 };
      styleStats[opp.message_style].sent++;
      styleStats[opp.message_style].positive += isPositive;
    }

    if (opp.message_length) {
      const bucket = opp.message_length < 60 ? 'short' : opp.message_length < 120 ? 'medium' : 'long';
      if (!lengthStats[bucket]) lengthStats[bucket] = { sent: 0, positive: 0 };
      lengthStats[bucket].sent++;
      lengthStats[bucket].positive += isPositive;
    }
  }

  const prompt = `${SYSTEM_PROMPTS.SALES_COACH}

Analyze this founder's outreach data and write a 2-sentence insight summary.
Be specific and data-driven. This will be used to improve their future messages.

Overall: ${total} sent, ${positive} positive (${Math.round(positive/total*100)}%)
By platform: ${JSON.stringify(platformStats)}
By style: ${JSON.stringify(styleStats)}  
By length: ${JSON.stringify(lengthStats)}

Example good summary: "Best results on Reddit (40% positive). Short messages under 80 words with empathetic openers outperform longer direct pitches 3:1."
Return ONLY the 2-sentence summary. No JSON.`;

  try {
    const { content } = await callGrok({ messages: [{ role: 'user', content: prompt }], temperature: 0.4, maxTokens: 150 });
    return parseTextResponse(content, null);
  } catch {
    return null;
  }
};

// ──────────────────────────────────────────
// CALENDAR / EVENT PREP
// ──────────────────────────────────────────

export const generateEventPrep = async (user, event) => {
  const vp = user.voice_profile || {};

  const prompt = `${SYSTEM_PROMPTS.SALES_COACH}

Prepare this founder for an upcoming business event.

FOUNDER: ${user.business_name} — ${user.product_description}
Their differentiator: ${vp.unique_value_prop || 'unique in their market'}
Their top proof point: ${vp.best_proof_point || 'growing customer base'}

EVENT:
Title: ${event.title}
Type: ${event.event_type}
Date: ${event.event_date}
${event.attendee_name ? `Person/Audience: ${event.attendee_name}` : ''}
${event.attendee_context ? `Context: ${event.attendee_context}` : ''}
${event.notes ? `Notes: ${event.notes}` : ''}

Return JSON with this structure:
{
  "talking_points": ["3-5 specific, punchy talking points — not generic"],
  "opening_line": "A strong, specific opening line for this exact event",
  "key_question_to_ask": "The ONE most valuable question to ask the other party",
  "anticipate_objection": "The most likely pushback and how to handle it",
  "pre_outreach": "A 2-sentence message to send BEFORE the event (if applicable)",
  "follow_up_template": "A natural follow-up message to send within 24h after"
}

Return ONLY valid JSON.`;

  const FALLBACK = {
    talking_points: ['What you do and who you help', 'Your best customer result', 'Why now is the right time'],
    opening_line: `I build ${user.product_description} — I work with ${user.target_audience}.`,
    key_question_to_ask: 'What\'s the biggest challenge you\'re facing right now with this?',
    anticipate_objection: 'They may ask about ROI — have a specific example ready.',
    pre_outreach: `Looking forward to connecting at ${event.title}. I have something relevant to share.`,
    follow_up_template: `Great meeting you at ${event.title}. As promised — here's that thing I mentioned. Worth a quick look?`
  };

  try {
    const { content } = await callGrok({ messages: [{ role: 'user', content: prompt }], temperature: 0.6, maxTokens: 800 });
    const parsed = parseJSONObject(content, FALLBACK);
    return validateAndFill(parsed, FALLBACK);
  } catch {
    return FALLBACK;
  }
};

// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

const parseScore = (value, opts = { min: 1, max: 10, defaultVal: 5 }) => {
  if (typeof value === 'number') return Math.min(opts.max, Math.max(opts.min, Math.round(value)));
  if (typeof value === 'string') {
    const fraction = value.match(/(\d+)\s*\/\s*\d+/);
    if (fraction) return Math.min(opts.max, Math.max(opts.min, parseInt(fraction[1])));
    const num = parseInt(value);
    if (!isNaN(num)) return Math.min(opts.max, Math.max(opts.min, num));
  }
  return opts.defaultVal;
};

export default {
  callGrok, streamGrok,
  generateOnboardingQuestions, buildVoiceProfile,
  generateOutreachMessage, scoreOpportunities,
  generatePracticeScenarioPrompt, generatePracticeProspectReply, generateCoachingTip,
  getCoachResponse, summarizePerformancePatterns, generateEventPrep
};
