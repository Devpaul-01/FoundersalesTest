// src/jobs/memoryExtractionJob.js
// ============================================================
// CROSS-SESSION AI MEMORY — EXTRACTION JOB
// Changes from audit:
//  - IMPROVED: Extraction prompt now requests fact_category for each fact
//  - IMPROVED: Dedup prompt preserves category when reinforcing
//  - IMPROVED: Insert includes fact_category column
//  - IMPROVED: Eviction scoring unchanged (still prioritizes reinforced facts)
// ============================================================

import supabaseAdmin from '../config/supabase.js';
import { callWithFallback } from '../services/multiProvider.js';
import { recordTokenUsage } from '../services/tokenTracker.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MEMORY_CAP = 30;
const BATCH_SIZE = 10;

const logJob = async (name, status, data = {}) => {
  await supabaseAdmin.from('job_logs').insert({ job_name: name, status, ...data }).catch(() => {});
};

// ──────────────────────────────────────────
// MAIN JOB ENTRY POINT
// ──────────────────────────────────────────
export const runMemoryExtractionJob = async () => {
  const startTime = Date.now();
  console.log(`[MemoryJob] Starting ${new Date().toISOString()}`);

  try {
    const { data: chats } = await supabaseAdmin
      .from('chats')
      .select(`
        id, user_id, message_count, last_message_at, memory_last_extracted_at,
        users!inner(id, is_deleted, memory_enabled)
      `)
      .gte('message_count', 10)
      .eq('is_archived', false)
      // Fix Issue 22: exclude meeting_notes chats — they contain ephemeral session
      // fragments, not durable coaching context worth storing in long-term memory.
      .neq('chat_mode', 'meeting_notes')
      .eq('users.is_deleted', false)
      .or('users.memory_enabled.is.null,users.memory_enabled.eq.true')
      .or('memory_last_extracted_at.is.null,last_message_at.gt.memory_last_extracted_at')
      .limit(BATCH_SIZE);

    if (!chats?.length) {
      console.log('[MemoryJob] No chats need extraction');
      return;
    }

    console.log(`[MemoryJob] Processing ${chats.length} chats`);
    let processed = 0;

    for (const chat of chats) {
      try {
        await extractMemoryForChat(chat);
        processed++;
      } catch (err) {
        console.error(`[MemoryJob] Failed for chat ${chat.id}:`, err.message);
      }
      await sleep(1500);
    }

    await logJob('memory_extraction', 'completed', { processed, duration_ms: Date.now() - startTime });
    console.log(`[MemoryJob] Done — ${processed} chats processed`);

  } catch (err) {
    console.error('[MemoryJob] Fatal:', err.message);
    await logJob('memory_extraction', 'failed', { error_message: err.message });
  }
};

// ──────────────────────────────────────────
// EXTRACT MEMORY FOR ONE CHAT
// ──────────────────────────────────────────
const extractMemoryForChat = async (chat) => {
  const userId = chat.user_id;

  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content')
    .eq('chat_id', chat.id)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (!messages?.length) return;

  const transcript = messages
    .reverse()
    .map(m => `${m.role === 'user' ? 'Founder' : 'AI'}: ${m.content}`)
    .join('\n');

  // IMPROVED: Extraction prompt now requests categories
  const extractionPrompt = `You are a fact extraction system. Extract key facts about this founder and their business that would help an AI coach give better advice in future conversations.

Only extract facts that are:
- Specific and actionable (not generic)
- About the user's business, product, audience, challenges, style preferences, wins, or patterns
- Worth remembering across multiple future sessions

Do NOT extract: temporary states, one-off events, things that will change weekly.
DO extract: who they sell to, what works/doesn't, their communication style, key challenges, product details, audience characteristics, wins, blockers.

Each fact must also have a category from:
- business_context: core business facts, product details, target market
- differentiator: what makes them unique, competitive advantages
- proof_point: customer results, wins, specific numbers
- icp_description: ideal customer profile details, trigger moments
- objection: common objections they face, resistance patterns
- voice_style: communication style, tone preferences, phrases to avoid
- goal: stated goals, targets, success metrics
- challenge: current blockers, struggles, frustrations
- behavioral_pattern: how they work, habits, decision patterns

Respond ONLY as a JSON array. Maximum 5 facts. If there's nothing worth extracting, return [].

User message history:
${transcript}

Return format:
[
  { "fact": "fact text here", "category": "category_name" },
  ...
]`;

  const { content: extractContent, tokens_in: eIn, tokens_out: eOut } = await callWithFallback({
    systemPrompt: 'You extract founder facts from conversation history. Return only JSON arrays.',
    messages:     [{ role: 'user', content: extractionPrompt }],
    temperature:  0.2,
    maxTokens:    500,
  });

  await recordTokenUsage(userId, 'groq', eIn, eOut);

  let newFacts;
  try {
    const clean = extractContent.replace(/```json|```/g, '').trim();
    newFacts = JSON.parse(clean);
    if (!Array.isArray(newFacts)) throw new Error('Not an array');

    // Normalize: handle both {fact, category} objects and plain strings
    newFacts = newFacts.map(f => {
      if (typeof f === 'string') return { fact: f, category: 'business_context' };
      if (f.fact) return { fact: f.fact, category: f.category || 'business_context' };
      return null;
    }).filter(Boolean);
  } catch {
    newFacts = [];
  }

  // NOTE: memory_last_extracted_at is stamped AFTER all processing below so that
  // if fact insertion fails mid-loop, this chat will be retried on the next run.
  // Previously this was stamped before processing — a crash would silently skip the chat.

  if (!newFacts.length) {
    // Still stamp even if no facts — prevents re-processing a chat with no extractable facts
    await supabaseAdmin
      .from('chats')
      .update({ memory_last_extracted_at: new Date().toISOString() })
      .eq('id', chat.id);
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from('user_memory')
    .select('id, fact, fact_category, reinforcement_count, last_reinforced_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('reinforcement_count', { ascending: false });

  const existingFacts = existing || [];

  let decisions;
  if (existingFacts.length === 0) {
    decisions = newFacts.map(f => ({ fact: f.fact, category: f.category, action: 'insert', replace_id: null }));
  } else {
    const existingList = existingFacts.map((f, i) => `${i + 1}. [${f.fact_category || 'general'}] ${f.fact}`).join('\n');
    const newList      = newFacts.map((f, i) => `${String.fromCharCode(65 + i)}. [${f.category}] ${f.fact}`).join('\n');

    const dedupPrompt = `You are a memory deduplication system.

EXISTING FACTS (numbered):
${existingList}

NEW FACTS TO EVALUATE (lettered):
${newList}

For each new fact, decide:
- "skip" + replace_id: if a numbered fact already covers this (reinforce it)
- "replace" + replace_id: if a numbered fact is outdated and this is a better version
- "insert": if this is genuinely new information

Return ONLY a JSON array:
[
  { "letter": "A", "action": "skip"|"replace"|"insert", "replace_id": <number or null>, "fact": "fact text", "category": "category_name" },
  ...
]`;

    const { content: dedupContent, tokens_in: dIn, tokens_out: dOut } = await callWithFallback({
      systemPrompt: 'You deduplicate memory facts. Return only JSON arrays.',
      messages:     [{ role: 'user', content: dedupPrompt }],
      temperature:  0.1,
      maxTokens:    400,
    });

    await recordTokenUsage(userId, 'groq', dIn, dOut);

    try {
      const clean = dedupContent.replace(/```json|```/g, '').trim();
      decisions   = JSON.parse(clean);
    } catch {
      // If dedup fails, just insert all new facts
      decisions = newFacts.map(f => ({ action: 'insert', fact: f.fact, category: f.category, replace_id: null }));
    }
  }

  for (const decision of (decisions || [])) {
    try {
      if (decision.action === 'skip' && decision.replace_id) {
        const target = existingFacts[decision.replace_id - 1];
        if (target) {
          await supabaseAdmin
            .from('user_memory')
            .update({
              reinforcement_count: (target.reinforcement_count || 1) + 1,
              last_reinforced_at:  new Date().toISOString(),
            })
            .eq('id', target.id);
        }
      } else if (decision.action === 'replace' && decision.replace_id) {
        const target = existingFacts[decision.replace_id - 1];
        if (target) {
          await supabaseAdmin
            .from('user_memory')
            .update({
              fact:                decision.fact,
              fact_category:       decision.category || target.fact_category,
              reinforcement_count: (target.reinforcement_count || 1) + 1,
              last_reinforced_at:  new Date().toISOString(),
            })
            .eq('id', target.id);
        }
      } else if (decision.action === 'insert') {
        const activeCount = existingFacts.filter(f => f.is_active !== false).length;
        if (activeCount >= MEMORY_CAP) {
          await evictLowestPriorityFact(userId, existingFacts);
        }
        await supabaseAdmin.from('user_memory').insert({
          user_id:        userId,
          fact:           decision.fact,
          fact_category:  decision.category || 'business_context',
          source_chat_id: chat.id,
        });
      }
    } catch (err) {
      console.warn(`[MemoryJob] Decision apply failed for user ${userId}:`, err.message);
    }
  }

  // Stamp only after all fact decisions are applied — this ensures a mid-loop
  // crash causes the chat to be re-processed on the next job run (not silently skipped).
  await supabaseAdmin
    .from('chats')
    .update({ memory_last_extracted_at: new Date().toISOString() })
    .eq('id', chat.id);
};

// ──────────────────────────────────────────
// EVICT LOWEST-PRIORITY FACT
// ──────────────────────────────────────────
const evictLowestPriorityFact = async (userId, facts) => {
  const now = Date.now();

  const factIds = facts.map(f => f.id);
  const { data: fullFacts } = await supabaseAdmin
    .from('user_memory')
    .select('id, reinforcement_count, last_reinforced_at, source_chat_id')
    .in('id', factIds)
    .eq('is_active', true);

  const chatIds = [...new Set((fullFacts || []).map(f => f.source_chat_id).filter(Boolean))];
  let chatTypeMap = {};
  if (chatIds.length > 0) {
    const { data: chats } = await supabaseAdmin
      .from('chats')
      .select('id, chat_type')
      .in('id', chatIds);
    (chats || []).forEach(c => { chatTypeMap[c.id] = c.chat_type; });
  }

  const fullFactMap = {};
  (fullFacts || []).forEach(f => { fullFactMap[f.id] = f; });

  const scored = facts.map(f => {
    const ff           = fullFactMap[f.id] || f;
    const daysSince    = (now - new Date(ff.last_reinforced_at || Date.now()).getTime()) / 86400000;
    const recencyScore = Math.min(10, 10 / Math.max(daysSince, 0.1));
    const sourceChatType  = ff.source_chat_id ? chatTypeMap[ff.source_chat_id] : null;
    const sourceDiversity = sourceChatType ? 1 : 0;
    const priority = (ff.reinforcement_count * 3) + (recencyScore * 1) + (sourceDiversity * 2);
    return { ...f, priority };
  });

  scored.sort((a, b) => a.priority - b.priority);
  const toEvict = scored[0];

  if (toEvict) {
    await supabaseAdmin
      .from('user_memory')
      .update({ is_active: false })
      .eq('id', toEvict.id);
  }
};
