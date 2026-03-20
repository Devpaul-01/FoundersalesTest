// src/routes/chat.js
// ============================================================
// CHAT SYSTEM — PRODUCTION HARDENED
//
// Fixes applied (see audit):
//  ✅ Issue 04 — getAttachmentData now enforces user_id ownership
//  ✅ Issue 05 — message_count uses atomic RPC (increment_chat_stats)
//  ✅ Issue 06 — memory facts no longer double-injected in streaming path
//  ✅ Issue 07 — memory facts now fetched in non-streaming path too
//  ✅ Issue 08 — active goals + latest check-in fetched for AI context
//  ✅ Issue 09 — needsChatSearch skipped when force_search already known
//  ✅ Issue 10 — tagChatTopic removed (no downstream consumer)
//  ✅ Issue 12 — message_count incremented for BOTH user + AI messages
//  ✅ Issue 13 — empty AI response saved with fallback error text
//  ✅ Issue 16 — attachment-only messages now accepted
//  ✅ Issue 23 — structured logging throughout
//  ✅ Issue 25 — getChatHistory limit aligned to 8
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { CHAT_TYPES } from '../config/constants.js';

import { callWithFallback, streamWithFallback } from '../services/multiProvider.js';
import groqService from '../services/groq.js';
import { streamAndSave, initSSE, sendSSE, endSSE } from '../services/streaming.js';
import { needsChatSearch, searchForChat, checkPerplexityUsage, incrementUsage } from '../services/perplexity.js';
import { preprocessAttachmentsForGrok, buildGrokAttachmentPrompt } from '../utils/attachmentProcessor.js';
import { recordTokenUsage } from '../services/tokenTracker.js';
import { generateMeetingNotesResponse, synthesizeMeetingNotes } from '../services/groqCalendarIntelligence.js';
import supabaseAdmin from '../config/supabase.js';

const router = Router();

const CHAT_MODES = {
  GENERAL:        'general',
  MEETING_NOTES:  'meeting_notes',
  PREP:           'prep',
  FOLLOWUP_COACH: 'followup_coach',
};

// ──────────────────────────────────────────
// STRUCTURED LOGGING UTILITIES
// Mirrors the pattern established in practice.js for consistency.
// ──────────────────────────────────────────
const log = (event, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return `${k}=${JSON.stringify(v)}`;
      return `${k}=${v}`;
    })
    .filter(Boolean)
    .join(' ');
  console.log(`[Chat] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Chat] ❌ ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Chat] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Chat] 🤖 AI [${fn}]${entries ? ` → ${entries}` : ''}`);
};


// ──────────────────────────────────────────
// GET /api/chat
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { type, mode, limit = 20, offset = 0 } = req.query;
  log('LIST_CHATS', { userId: req.user.id, type, mode, limit, offset });

  let query = supabaseAdmin
    .from('chats')
    .select(`
      id, title, chat_type, chat_mode, opportunity_id, prospect_id, event_id,
      created_at, updated_at, last_message_at, message_count, is_archived
    `)
    .eq('user_id', req.user.id)
    .eq('is_archived', false)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

  if (type) query = query.eq('chat_type', type);
  if (mode) query = query.eq('chat_mode', mode);

  const { data: chats, error } = await query;
  if (error) {
    logError('LIST_CHATS', error, { userId: req.user.id });
    throw error;
  }

  log('LIST_CHATS_OK', { userId: req.user.id, count: chats?.length || 0 });
  res.json({ chats: chats || [] });
}));


// ──────────────────────────────────────────
// POST /api/chat
// ──────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const {
    title, chat_type = CHAT_TYPES.GENERAL, chat_mode = CHAT_MODES.GENERAL,
    opportunity_id, initial_context, prospect_id, event_id,
  } = req.body;

  log('CREATE_CHAT', { userId: req.user.id, chat_type, chat_mode, opportunity_id, event_id });

  if (!Object.values(CHAT_TYPES).includes(chat_type)) {
    log('CREATE_CHAT_VALIDATION_FAIL', { userId: req.user.id, chat_type });
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `chat_type must be one of: ${Object.values(CHAT_TYPES).join(', ')}`,
    });
  }

  let chatTitle = title;
  if (!chatTitle) {
    if (opportunity_id) {
      const { data: opp } = await supabaseAdmin
        .from('opportunities')
        .select('target_name, target_context, platform')
        .eq('id', opportunity_id)
        .eq('user_id', req.user.id)
        .single();
      chatTitle = opp ? `Outreach: ${opp.target_name || opp.platform}` : 'New conversation';
    } else {
      chatTitle = 'New conversation';
    }
  }

  logDB('INSERT', 'chats', { userId: req.user.id, chat_type, chat_mode });
  const { data: chat, error } = await supabaseAdmin
    .from('chats')
    .insert({
      user_id:        req.user.id,
      title:          chatTitle,
      chat_type,
      chat_mode:      chat_mode || CHAT_MODES.GENERAL,
      opportunity_id: opportunity_id || null,
      prospect_id:    prospect_id   || null,
      event_id:       event_id      || null,
    })
    .select()
    .single();

  if (error) {
    logError('CREATE_CHAT_INSERT', error, { userId: req.user.id });
    throw error;
  }

  // Inject opportunity context as system message
  if (opportunity_id) {
    const { data: opp } = await supabaseAdmin
      .from('opportunities')
      .select('target_context, prepared_message, platform, source_url')
      .eq('id', opportunity_id)
      .single();

    if (opp) {
      logDB('INSERT', 'chat_messages', { chatId: chat.id, role: 'system', source: 'opportunity_context' });
      await supabaseAdmin.from('chat_messages').insert({
        chat_id: chat.id,
        user_id: req.user.id,
        role:    'system',
        content: `Context: You're helping with outreach for someone on ${opp.platform}.\n\nTheir situation: ${opp.target_context}\n\nDraft message: ${opp.prepared_message}`,
      });
    }
  }

  // Inject initial context (from calendar event prep, meeting notes mode, etc.)
  if (initial_context && typeof initial_context === 'string') {
    logDB('INSERT', 'chat_messages', { chatId: chat.id, role: 'system', source: 'initial_context', length: initial_context.length });
    await supabaseAdmin.from('chat_messages').insert({
      chat_id: chat.id,
      user_id: req.user.id,
      role:    'system',
      content: initial_context.slice(0, 4000),
    });
  }

  log('CREATE_CHAT_OK', { userId: req.user.id, chatId: chat.id, chat_type, chat_mode });
  res.status(201).json({ chat });
}));


// ──────────────────────────────────────────
// GET /api/chat/:chatId
// ──────────────────────────────────────────
router.get('/:chatId', asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { limit = 50, before } = req.query;
  log('GET_CHAT', { userId: req.user.id, chatId, limit, before });

  const { data: chat, error: chatError } = await supabaseAdmin
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .eq('user_id', req.user.id)
    .single();

  if (chatError || !chat) {
    log('GET_CHAT_NOT_FOUND', { userId: req.user.id, chatId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Chat not found' });
  }

  let msgQuery = supabaseAdmin
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(parseInt(limit));

  if (before) msgQuery = msgQuery.lt('created_at', before);

  const { data: messages, error: msgError } = await msgQuery;
  if (msgError) {
    logError('GET_CHAT_MESSAGES', msgError, { chatId });
    throw msgError;
  }

  // Load linked event for meeting-notes chats
  let linkedEvent = null;
  if (chat.event_id && chat.chat_mode === CHAT_MODES.MEETING_NOTES) {
    const { data: ev } = await supabaseAdmin
      .from('user_events')
      .select('id, title, event_type, attendee_name, start_time, event_date, debrief_completed_at')
      .eq('id', chat.event_id)
      .single();
    linkedEvent = ev;
    log('GET_CHAT_LINKED_EVENT', { chatId, eventId: chat.event_id, found: !!ev });
  }

  log('GET_CHAT_OK', { userId: req.user.id, chatId, messageCount: messages?.length || 0 });
  res.json({ chat, messages: messages || [], linked_event: linkedEvent });
}));


// ──────────────────────────────────────────
// PUT /api/chat/:chatId/rename
// ──────────────────────────────────────────
router.put('/:chatId/rename', asyncHandler(async (req, res) => {
  const { title } = req.body;
  const { chatId } = req.params;

  if (!title?.trim()) {
    log('RENAME_VALIDATION_FAIL', { chatId, userId: req.user.id });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title is required' });
  }

  log('RENAME_CHAT', { userId: req.user.id, chatId });

  const { data, error } = await supabaseAdmin
    .from('chats')
    .update({ title: title.trim() })
    .eq('id', chatId)
    .eq('user_id', req.user.id)
    .select('id, title')
    .single();

  if (error || !data) {
    log('RENAME_CHAT_NOT_FOUND', { userId: req.user.id, chatId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Chat not found' });
  }

  log('RENAME_CHAT_OK', { userId: req.user.id, chatId, newTitle: data.title });
  res.json({ success: true, id: data.id, title: data.title });
}));


// ──────────────────────────────────────────
// POST /api/chat/:chatId/message (NON-STREAMING)
// Used by meeting-notes mode and fallback paths.
// ──────────────────────────────────────────
router.post('/:chatId/message', asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { content, attachment_ids = [], force_search = false } = req.body;

  log('MESSAGE_NON_STREAM', { userId: req.user.id, chatId, contentLen: content?.length, attachments: attachment_ids.length });

  // Fix Issue 16: require content OR attachments — not both
  if (!content?.trim() && !attachment_ids?.length) {
    log('MESSAGE_VALIDATION_FAIL', { chatId, reason: 'no_content_no_attachments' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Message content or attachment required' });
  }

  const chat = await verifyChat(chatId, req.user.id);
  if (!chat) {
    log('MESSAGE_CHAT_NOT_FOUND', { userId: req.user.id, chatId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Chat not found' });
  }

  // Fix Issue 04: enforce ownership
  const attachments       = attachment_ids.length ? await getAttachmentData(attachment_ids, req.user.id) : [];
  const processedAttach   = attachments.length ? await preprocessAttachmentsForGrok(attachments) : [];
  const attachmentContext = buildGrokAttachmentPrompt(processedAttach);

  logDB('INSERT', 'chat_messages', { chatId, role: 'user', attachments: attachments.length });
  await supabaseAdmin.from('chat_messages').insert({
    chat_id:     chatId,
    user_id:     req.user.id,
    role:        'user',
    content:     content || '',
    attachments: attachments.length ? attachments : [],
  });

  // Fix Issue 12: count user message
  await updateChatStats(chatId);

  // ── Meeting notes mode ───────────────────────────────────────────────────
  if (chat.chat_mode === CHAT_MODES.MEETING_NOTES) {
    log('MESSAGE_MEETING_NOTES_MODE', { chatId });
    const history      = await getChatHistory(chatId, 8);
    const eventContext = await getEventContext(chat.event_id);

    logAI('generateMeetingNotesResponse', { chatId, historyLen: history.length });
    const response = await generateMeetingNotesResponse(content, history, eventContext);

    // Fix Issue 13: guard empty response
    const aiContent = response.content?.trim()
      ? response.content
      : 'Got it — keep going, what else happened?';

    logDB('INSERT', 'chat_messages', { chatId, role: 'assistant', model: 'groq-meeting-notes' });
    const { data: msgRow } = await supabaseAdmin.from('chat_messages').insert({
      chat_id:    chatId,
      user_id:    req.user.id,
      role:       'assistant',
      content:    aiContent,
      model_used: 'groq-meeting-notes',
    }).select('id').single();

    // Fix Issue 12: count assistant message
    await updateChatStats(chatId);

    log('MESSAGE_MEETING_NOTES_OK', { chatId, messageId: msgRow?.id, is_end: response.is_end });
    return res.json({
      content:    aiContent,
      message_id: msgRow?.id,
      is_end:     response.is_end,
    });
  }

  // ── Standard non-streaming ───────────────────────────────────────────────
  const history = await getChatHistory(chatId, 8);

  // Fix Issue 07 + 08: fetch memory, goals, and check-in in parallel
  const [perfProfileResult, memoryFactsResult, goalsResult, checkInResult] = await Promise.all([
    supabaseAdmin
      .from('user_performance_profiles')
      .select('learned_patterns, positive_rate, total_sent')
      .eq('user_id', req.user.id)
      .single(),
    supabaseAdmin
      .from('user_memories')
      .select('fact')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .order('reinforcement_count', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('user_goals')
      .select('goal_text, target_value, target_unit, current_value')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .limit(1),
    supabaseAdmin
      .from('daily_check_ins')
      .select('mood_score, answers')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const perfProfile   = perfProfileResult.data;
  const memoryFacts   = memoryFactsResult.data || [];
  const activeGoals   = goalsResult.data || [];
  const recentCheckIn = checkInResult.data || null;

  let chatContext = '';
  if (chat.opportunity_id) {
    const { data: opp } = await supabaseAdmin
      .from('opportunities')
      .select('target_context, prepared_message, platform, target_name')
      .eq('id', chat.opportunity_id)
      .single();
    if (opp) {
      chatContext = `\n\n── Opportunity Context ──\nPlatform: ${opp.platform}\nTarget: ${opp.target_name || 'unknown'}\nTheir situation: ${opp.target_context || 'not specified'}\nDraft message: ${opp.prepared_message || 'none yet'}\n──`;
    }
  }

  logAI('getCoachResponse_nonStream', { chatId, historyLen: history.length, memoryFacts: memoryFacts.length });
  const { systemPrompt, messages } = await groqService.getCoachResponse(
    req.user,
    content + (attachmentContext ? `\n\n${attachmentContext}` : ''),
    history,
    perfProfile,
    processedAttach,
    // Fix Issue 06: pass memoryFacts once here — getCoachResponse handles embedding
    { chatContext, memoryFacts, activeGoals, recentCheckIn },
  );

  logAI('callWithFallback', { chatId });
  const { content: aiContent, tokens_in, tokens_out, model_used } = await callWithFallback({
    systemPrompt,
    messages,
    temperature: 0.7,
    maxTokens:   800,
  });

  // Fix Issue 13: guard empty response
  const finalContent = aiContent?.trim()
    ? aiContent
    : "I wasn't able to generate a response. Please try rephrasing your message.";

  logDB('INSERT', 'chat_messages', { chatId, role: 'assistant', model: model_used });
  await supabaseAdmin.from('chat_messages').insert({
    chat_id:    chatId,
    user_id:    req.user.id,
    role:       'assistant',
    content:    finalContent,
    model_used: model_used || 'groq',
  });

  // Fix Issue 12: count assistant message
  await updateChatStats(chatId);
  await recordTokenUsage(req.user.id, 'groq', tokens_in, tokens_out);

  log('MESSAGE_NON_STREAM_OK', { chatId, model: model_used, tokensIn: tokens_in, tokensOut: tokens_out });
  res.json({ content: finalContent });
}));


// ──────────────────────────────────────────
// POST /api/chat/:chatId/stream (STREAMING)
// Primary path for all standard chat interactions.
// ──────────────────────────────────────────
router.post('/:chatId/stream', asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { content, attachment_ids = [], force_search = false } = req.body;

  log('STREAM_START', {
    userId: req.user.id, chatId,
    contentLen: content?.length || 0,
    attachments: attachment_ids.length,
    force_search,
  });

  // Fix Issue 16: require content OR attachments
  if (!content?.trim() && !attachment_ids?.length) {
    log('STREAM_VALIDATION_FAIL', { chatId, reason: 'no_content_no_attachments' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Message content or attachment required' });
  }

  const chat = await verifyChat(chatId, req.user.id);
  if (!chat) {
    log('STREAM_CHAT_NOT_FOUND', { userId: req.user.id, chatId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Chat not found' });
  }

  log('STREAM_CHAT_VERIFIED', { chatId, chat_type: chat.chat_type, chat_mode: chat.chat_mode });

  // Fix Issue 04: enforce ownership
  const attachments       = attachment_ids.length ? await getAttachmentData(attachment_ids, req.user.id) : [];
  const processedAttach   = attachments.length ? await preprocessAttachmentsForGrok(attachments) : [];
  const attachmentContext = buildGrokAttachmentPrompt(processedAttach);

  if (attachment_ids.length > 0 && attachments.length !== attachment_ids.length) {
    log('STREAM_ATTACHMENT_OWNERSHIP_FILTERED', {
      chatId,
      requested: attachment_ids.length,
      authorized: attachments.length,
    });
  }

  logDB('INSERT', 'chat_messages', { chatId, role: 'user', attachments: attachments.length });
  await supabaseAdmin.from('chat_messages').insert({
    chat_id:     chatId,
    user_id:     req.user.id,
    role:        'user',
    content:     content || '',
    attachments: attachments.length ? attachments : [],
  });

  // Fix Issue 12: count user message immediately
  await updateChatStats(chatId);

  // ── Meeting notes mode ───────────────────────────────────────────────────
  if (chat.chat_mode === CHAT_MODES.MEETING_NOTES) {
    log('STREAM_MEETING_NOTES_MODE', { chatId });
    initSSE(res);
    const history      = await getChatHistory(chatId, 8);
    const eventContext = await getEventContext(chat.event_id);

    logAI('generateMeetingNotesResponse', { chatId, historyLen: history.length });
    const response = await generateMeetingNotesResponse(content, history, eventContext);

    // Fix Issue 13: guard empty response
    const aiContent = response.content?.trim()
      ? response.content
      : 'Got it — keep going, what else happened?';

    logDB('INSERT', 'chat_messages', { chatId, role: 'assistant', model: 'groq-meeting-notes' });
    const { data: msgRow } = await supabaseAdmin.from('chat_messages').insert({
      chat_id:    chatId,
      user_id:    req.user.id,
      role:       'assistant',
      content:    aiContent,
      model_used: 'groq-meeting-notes',
    }).select('id').single();

    // Fix Issue 12: count assistant message
    await updateChatStats(chatId);

    const words = aiContent.split(' ');
    for (let i = 0; i < words.length; i++) {
      sendSSE(res, 'token', { token: (i === 0 ? '' : ' ') + words[i] });
    }
    sendSSE(res, 'complete', { message_id: msgRow?.id, is_end: response.is_end, model_used: 'groq-meeting-notes' });
    endSSE(res);

    log('STREAM_MEETING_NOTES_OK', { chatId, messageId: msgRow?.id, is_end: response.is_end });
    return;
  }

  // ── Standard streaming chat ──────────────────────────────────────────────
  const history = await getChatHistory(chatId, 8);

  log('STREAM_CONTEXT_FETCH_START', { chatId, historyLen: history.length });

  // Fix Issue 08: fetch all context signals in a single parallel round-trip
  const [perfProfileResult, memoryFactsResult, goalsResult, checkInResult] = await Promise.all([
    supabaseAdmin
      .from('user_performance_profiles')
      .select('learned_patterns, positive_rate, total_sent')
      .eq('user_id', req.user.id)
      .single(),
    supabaseAdmin
      .from('user_memories')
      .select('fact')
      .eq('user_id', req.user.id)
      .eq('is_active', true)
      .order('reinforcement_count', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('user_goals')
      .select('goal_text, target_value, target_unit, current_value')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .limit(1),
    supabaseAdmin
      .from('daily_check_ins')
      .select('mood_score, answers')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  const perfProfile   = perfProfileResult.data;
  const memoryFacts   = memoryFactsResult.data || [];
  const activeGoals   = goalsResult.data || [];
  const recentCheckIn = checkInResult.data || null;

  log('STREAM_CONTEXT_FETCHED', {
    chatId,
    memoryFacts: memoryFacts.length,
    hasGoal:    activeGoals.length > 0,
    hasMood:    !!recentCheckIn?.mood_score,
    hasPerfProfile: !!perfProfile,
  });

  let chatContext = '';
  if (chat.opportunity_id) {
    const { data: opp } = await supabaseAdmin
      .from('opportunities')
      .select('target_context, prepared_message, platform, target_name')
      .eq('id', chat.opportunity_id)
      .single();
    if (opp) {
      chatContext = `\n\n── Opportunity Context ──\nPlatform: ${opp.platform}\nTarget: ${opp.target_name || 'unknown'}\nTheir situation: ${opp.target_context || 'not specified'}\nDraft message: ${opp.prepared_message || 'none yet'}\n──`;
      log('STREAM_OPP_CONTEXT_LOADED', { chatId, platform: opp.platform });
    }
  }

  logAI('getCoachResponse', { chatId, historyLen: history.length, memoryFacts: memoryFacts.length, hasGoal: activeGoals.length > 0 });

  const { systemPrompt, messages } = await groqService.getCoachResponse(
    req.user,
    content + (attachmentContext ? `\n\n${attachmentContext}` : ''),
    history,
    perfProfile,
    processedAttach,
    // Fix Issue 06: pass memoryFacts ONLY here.
    // getCoachResponse embeds them into fullContextBlock on message 1 and every 10th.
    // We do NOT append them again after this call (was previously double-injected).
    { chatContext, memoryFacts, activeGoals, recentCheckIn },
  );

  // Fix Issue 09: skip needsChatSearch entirely when force_search is already
  // set — this eliminates an extra ~200ms Groq call on every non-search message.
  // When force_search=true, user explicitly toggled web search in the UI.
  // When force_search=false, we still check intent (only when Perplexity is live).
  let useSearch = force_search;
  if (!force_search) {
    log('STREAM_SEARCH_INTENT_CHECK', { chatId, snippet: content.slice(0, 60) });
    useSearch = await needsChatSearch(content).then(r => r.needs_search).catch(() => false);
    log('STREAM_SEARCH_INTENT_RESULT', { chatId, useSearch });
  }

  if (useSearch) {
    const usageCheck = await checkPerplexityUsage(req.user.id, req.user.tier || 'free');
    log('STREAM_PERPLEXITY_USAGE', { chatId, allowed: usageCheck.allowed });
    if (usageCheck.allowed) {
      log('STREAM_ROUTING_PERPLEXITY', { chatId });
      await streamPerplexityResponse({
        res, userId: req.user.id, chatId,
        userMessage: content,
        systemPrompt,
        supabase: supabaseAdmin,
      });
      return;
    }
    log('STREAM_PERPLEXITY_LIMIT_HIT', { chatId });
  }

  log('STREAM_ROUTING_GROQ', { chatId });
  await streamAndSave({
    res,
    systemPrompt,
    messages,
    chatId,
    userId:   req.user.id,
    supabase: supabaseAdmin,
    metadata: { model_used: 'groq-multi' },
    streamFn: streamWithFallback,
  });

  // Fix Issue 10: tagChatTopic REMOVED.
  // It fired one extra Groq call per message to classify topic into chat_topic_tags,
  // but that table has no downstream consumers in any route, job, or frontend component.
  // Re-enable when topic-based filtering or analytics is built.

  log('STREAM_COMPLETE', { chatId, userId: req.user.id });
}));


// ──────────────────────────────────────────
// POST /api/chat/:chatId/end-meeting
// ──────────────────────────────────────────
router.post('/:chatId/end-meeting', asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  log('END_MEETING', { userId: req.user.id, chatId });

  const chat = await verifyChat(chatId, req.user.id);
  if (!chat) {
    log('END_MEETING_NOT_FOUND', { userId: req.user.id, chatId });
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  if (chat.chat_mode !== CHAT_MODES.MEETING_NOTES) {
    log('END_MEETING_WRONG_MODE', { chatId, chat_mode: chat.chat_mode });
    return res.status(400).json({ error: 'NOT_MEETING_NOTES', message: 'This endpoint is for meeting notes chats only' });
  }

  const { data: noteMessages } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .in('role', ['user'])
    .order('created_at', { ascending: true });

  if (!noteMessages?.length) {
    log('END_MEETING_NO_NOTES', { chatId });
    return res.json({ success: true, synthesis: null, message: 'No notes captured.' });
  }

  log('END_MEETING_SYNTHESIZING', { chatId, noteCount: noteMessages.length });

  let eventContext = {};
  if (chat.event_id) {
    const { data: ev } = await supabaseAdmin
      .from('user_events')
      .select('title, event_type, attendee_name, start_time, event_date')
      .eq('id', chat.event_id)
      .single();
    if (ev) eventContext = ev;
  }

  logAI('synthesizeMeetingNotes', { chatId, noteCount: noteMessages.length });
  const synthesis = await synthesizeMeetingNotes(req.user, eventContext, noteMessages);

  logDB('UPDATE', 'chats', { chatId, debrief_generated: true });
  await supabaseAdmin.from('chats').update({ debrief_generated: true }).eq('id', chatId);

  log('END_MEETING_OK', {
    chatId,
    hasCommitments: synthesis?.commitments?.length > 0,
    hasSignals:     synthesis?.signals?.length > 0,
  });
  res.json({
    success:  true,
    synthesis,
    chat_id:  chatId,
    event_id: chat.event_id,
    message:  'Meeting notes synthesized! Review your debrief before saving.',
  });
}));


// ──────────────────────────────────────────
// DELETE /api/chat/:chatId
// ──────────────────────────────────────────
router.delete('/:chatId', asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  log('DELETE_CHAT', { userId: req.user.id, chatId });

  const { data: chat } = await supabaseAdmin
    .from('chats')
    .select('id')
    .eq('id', chatId)
    .eq('user_id', req.user.id)
    .single();

  if (!chat) {
    log('DELETE_CHAT_NOT_FOUND', { userId: req.user.id, chatId });
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  logDB('UPDATE', 'chats', { chatId, is_archived: true });
  await supabaseAdmin.from('chats').update({ is_archived: true }).eq('id', chatId);

  log('DELETE_CHAT_OK', { userId: req.user.id, chatId });
  res.json({ success: true });
}));


// ──────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────

const streamPerplexityResponse = async ({ res, userId, chatId, userMessage, systemPrompt, supabase }) => {
  initSSE(res);
  let clientConnected = true;
  res.on('close', () => {
    clientConnected = false;
    log('PERPLEXITY_CLIENT_DISCONNECTED', { chatId, userId });
  });

  logDB('INSERT', 'chat_messages', { chatId, role: 'assistant', model: 'perplexity', status: 'pending' });
  const { data: messageRow } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId, user_id: userId, role: 'assistant',
      content: '', delivery_status: 'pending', model_used: 'perplexity', is_streamed: true,
    })
    .select('id')
    .single();

  sendSSE(res, 'message_id', { id: messageRow.id });
  sendSSE(res, 'provider_switch', { provider: 'perplexity', reason: 'real_time_search' });

  try {
    log('PERPLEXITY_SEARCH', { chatId, snippet: userMessage.slice(0, 60) });
    const { content, citations } = await searchForChat(userMessage, systemPrompt);
    if (!clientConnected) return;

    // Fix Issue 13: guard empty search response
    let finalContent = content?.trim() || '[Real-time search returned no results. Please try again.]';
    if (citations?.length > 0) {
      const citeText = '\n\n**Sources:** ' + citations.slice(0, 3).map((c, i) => `[${i + 1}] ${c.url || c}`).join(' · ');
      finalContent += citeText;
    }

    const words = finalContent.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (!clientConnected) break;
      sendSSE(res, 'token', { token: (i === 0 ? '' : ' ') + words[i] });
      if (i % 8 === 7) await new Promise(r => setTimeout(r, 20));
    }

    logDB('UPDATE', 'chat_messages', { messageId: messageRow.id, status: 'delivered' });
    await supabase.from('chat_messages').update({
      content:         finalContent,
      delivery_status: 'delivered',
      delivered_at:    new Date().toISOString(),
      model_used:      'perplexity',
    }).eq('id', messageRow.id);

    // Fix Issue 12: count assistant message; Fix Issue 05: atomic via RPC
    await updateChatStats(chatId);

    const tokensOut = Math.ceil(finalContent.length / 4);
    await recordTokenUsage(userId, 'perplexity', 0, tokensOut);
    const today = new Date().toISOString().split('T')[0];
    await supabase.rpc('increment_perplexity_usage', { p_user_id: userId, p_date: today, p_cost_cents: 5 }).catch(() => {});

    if (clientConnected) {
      sendSSE(res, 'complete', { message_id: messageRow.id, tokens_used: tokensOut, model_used: 'perplexity' });
      endSSE(res);
    }
    log('PERPLEXITY_STREAM_OK', { chatId, messageId: messageRow.id, tokensOut });
  } catch (err) {
    logError('streamPerplexityResponse', err, { chatId });
    await supabase.from('chat_messages').update({
      content:         '[Real-time search failed. Please try again.]',
      delivery_status: 'delivered',
    }).eq('id', messageRow.id);
    if (clientConnected) {
      sendSSE(res, 'error', { message: 'Search failed.' });
      endSSE(res);
    }
  }
};

const verifyChat = async (chatId, userId) => {
  const { data } = await supabaseAdmin
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .eq('user_id', userId)
    .single();
  return data;
};

const estimateTokens = (text) => Math.ceil((text || '').length / 4);

// Fix Issue 25: default maxMessages=8 — aligned with getCoachResponse's internal
// history slice so we never fetch more than we'll actually use.
const getChatHistory = async (chatId, maxMessages = 8) => {
  const tokenBudget = parseInt(process.env.GROQ_CONTEXT_TOKEN_LIMIT || '32000') * 0.6;

  const { data } = await supabaseAdmin
    .from('chat_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(maxMessages);

  if (!data?.length) return [];

  let tokenCount = 0;
  const window   = [];
  for (const msg of data) {
    const msgTokens = estimateTokens(msg.content);
    if (tokenCount + msgTokens > tokenBudget && window.length >= 2) break;
    window.push({ role: msg.role, content: msg.content });
    tokenCount += msgTokens;
  }
  return window.reverse();
};

// Fix Issue 04: added userId — only return files owned by this user.
// Previously any UUID could be passed and the system would fetch any user's files.
const getAttachmentData = async (attachmentIds, userId) => {
  if (!attachmentIds?.length) return [];
  const { data } = await supabaseAdmin
    .from('file_uploads')
    .select('id, public_url, original_filename, file_type, mime_type')
    .in('id', attachmentIds)
    .eq('user_id', userId); // ← security: ownership enforcement
  return data || [];
};

const getEventContext = async (eventId) => {
  if (!eventId) return {};
  const { data } = await supabaseAdmin
    .from('user_events')
    .select('id, title, event_type, attendee_name, start_time, event_date, attendee_context, prep_content')
    .eq('id', eventId)
    .single();
  return data || {};
};

// Fix Issue 05 + Issue 12: atomic increment via RPC for both user AND assistant messages.
//
// Required SQL (run once in Supabase SQL editor):
//   CREATE OR REPLACE FUNCTION increment_chat_stats(p_chat_id UUID)
//   RETURNS void LANGUAGE sql AS $$
//     UPDATE chats
//     SET message_count   = COALESCE(message_count, 0) + 1,
//         last_message_at = NOW()
//     WHERE id = p_chat_id;
//   $$;
//
const updateChatStats = async (chatId) => {
  const { error: rpcError } = await supabaseAdmin
    .rpc('increment_chat_stats', { p_chat_id: chatId });

  if (rpcError) {
    // Graceful fallback if RPC not yet deployed — non-atomic but won't crash
    log('UPDATE_CHAT_STATS_RPC_FALLBACK', { chatId, error: rpcError.message });
    const { data: chatRow } = await supabaseAdmin
      .from('chats')
      .select('message_count')
      .eq('id', chatId)
      .single();
    await supabaseAdmin.from('chats').update({
      last_message_at: new Date().toISOString(),
      message_count:   (chatRow?.message_count || 0) + 1,
    }).eq('id', chatId);
  }
};

export default router;
