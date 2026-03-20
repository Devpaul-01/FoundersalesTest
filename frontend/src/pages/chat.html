// src/pages/chat.jsx — MEETING NOTES MODE ADDED
// ============================================================
// Meeting notes mode gives founders a minimal, fast interface
// to capture notes during live calls. The AI acts as a silent
// partner — not a coach — accepting fragments and asking one
// smart question at a time.
//
// Changes:
//  - Detect chat_mode === 'meeting_notes' → render MeetingNotesWindow
//  - MeetingNotesWindow: minimal UI, large input, "End Meeting" button
//  - End Meeting → calls /api/chat/:id/end-meeting → synthesis
//  - SynthesisCard shown after meeting ends with debrief + link to event
//  - ChatListPanel shows meeting-notes chats under separate section
// ============================================================

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useChats, useCreateChat, useChatMessages, useRenameChat, useDeleteChat, useSuggestions } from '../services/queries'
import { useStream } from '../hooks/useStream'
import { useRealtimeChat } from '../hooks/useRealtimeChat'
import { useUploadFile, useDeleteFile } from '../services/queries'
import { SkeletonCard } from '../components/ui/Skeleton'
import Button from '../components/ui/Button'
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal'
import Input from '../components/ui/Input'
import { ClutchAvatar } from '../components/ui/Avatar'
import { formatShortDate, formatFileSize, renderMarkdown } from '../utils/formatters'
import { DEFAULT_CHAT_SUGGESTIONS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../utils/constants'
import { queryClient } from '../services/queryClient'
import { KEYS } from '../services/queries'
import toast from 'react-hot-toast'
import api from '../services/api'

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isStreaming, streamContent }) {
  const isUser    = msg.role === 'user'
  const content   = isStreaming && !isUser ? streamContent || '' : msg.content || ''

  if (msg.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-text-muted bg-surface-panel px-3 py-1 rounded-full border border-surface-border">
          {msg.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start mb-3`}>
      {!isUser && <ClutchAvatar size="sm" className="mt-1 shrink-0" />}
      <div className={isUser ? 'max-w-[82%] group' : 'flex-1 min-w-0 group'}>
        {isUser ? (
          <div className="bubble-user">
            <span className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            {msg.attachments?.length > 0 && (
              <div className="mt-2 space-y-1">
                {msg.attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
                    <span className="text-xs">{att.type === 'image' ? '🖼️' : '📄'}</span>
                    <span className="text-xs text-text-secondary truncate">{att.filename || att.original_filename}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-1">
            <span
              className={`text-sm leading-relaxed prose-chat text-text-secondary ${isStreaming ? 'streaming-cursor' : ''}`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) || '' }}
            />
          </div>
        )}
        <div className={`flex items-center gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-text-muted">{formatShortDate(msg.created_at)}</span>
          {!isUser && (
            <>
              <button onClick={() => { navigator.clipboard.writeText(msg.content || ''); toast.success('Copied') }} className="text-[10px] text-text-muted hover:text-text-secondary">copy</button>
              {msg.model_used === 'perplexity' && (
                <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
                  🌐 Web search used
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── File chip ──────────────────────────────────────────────────────────────────
function FileChip({ file, onRemove }) {
  return (
    <div className="flex items-center gap-2 bg-surface-panel border border-surface-border rounded-lg px-3 py-1.5 text-xs">
      <span>{file.type?.startsWith('image') ? '🖼️' : '📄'}</span>
      <span className="text-text-secondary max-w-[120px] truncate">{file.name}</span>
      <span className="text-text-muted">({formatFileSize(file.size)})</span>
      <button onClick={onRemove} className="text-text-muted hover:text-error transition-colors ml-1">×</button>
    </div>
  )
}

// ── Standard chat input ────────────────────────────────────────────────────────
function ChatInput({ chatId, onSend, disabled }) {
  const [content, setContent]         = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading]     = useState(false)
  const [searchEnabled, setSearchEnabled] = useState(false)
  // Fix Issue 14: local sending guard prevents rapid double-taps
  const [sending, setSending]         = useState(false)
  const fileInputRef  = useRef()
  const textareaRef   = useRef()
  const uploadFile    = useUploadFile()
  const deleteFile    = useDeleteFile()

  const isDisabled = disabled || sending || uploading

  const handleSend = () => {
    if (!content.trim() && !attachments.length) return
    if (isDisabled) return
    setSending(true)
    const attachmentIds = attachments.filter(a => a.id).map(a => a.id)
    onSend(content.trim(), attachmentIds, searchEnabled)
    setContent('')
    setAttachments([])
    // Release after a short tick — enough to block double-tap without locking the UI
    setTimeout(() => setSending(false), 400)
  }

  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    if (file.size > MAX_FILE_SIZE) { toast.error('File too large (max 10MB)'); return }
    setUploading(true)
    try {
      const { file: uploaded } = await uploadFile.mutateAsync({ file, chatId })
      setAttachments(prev => [...prev, { file, id: uploaded.id, url: uploaded.url }])
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = async (idx) => {
    const att = attachments[idx]
    if (att.id) deleteFile.mutate(att.id)
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [content])

  return (
    <div className="border-t border-surface-border bg-surface-panel px-3 pt-3 pb-12">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, i) => <FileChip key={i} file={att.file} onRemove={() => removeAttachment(i)} />)}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          className="w-9 h-9 rounded-full bg-surface-mid border border-surface-border flex items-center justify-center shrink-0 mb-0.5 hover:bg-surface-hover transition-colors text-text-primary disabled:opacity-50"
        >
          {uploading ? <div className="w-3.5 h-3.5 border-2 border-text-muted/40 border-t-text-secondary rounded-full animate-spin" /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
        <input ref={fileInputRef} type="file" className="hidden" accept={ALLOWED_FILE_TYPES.join(',')} onChange={handleFileChange} />

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask Clutch anything…"
            disabled={isDisabled}
            rows={1}
            className="w-full bg-surface-mid border border-surface-border rounded-2xl px-4 py-2.5 pr-20 text-sm text-text-primary placeholder-text-muted resize-none outline-none focus:border-primary/40 transition-colors disabled:opacity-50"
          />
          <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
            <button
              onClick={() => setSearchEnabled(s => !s)}
              title={searchEnabled ? 'Web search ON' : 'Web search OFF'}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all ${searchEnabled ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-surface-border text-text-muted hover:text-text-secondary'}`}
            >
              🌐
            </button>
            <button
              onClick={handleSend}
              disabled={isDisabled || (!content.trim() && !attachments.length)}
              className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-bright transition-colors"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── MEETING NOTES WINDOW — specialized minimal UI ─────────────────────────────
function MeetingNotesWindow({ chatId, chat, onBack }) {
  const { data: chatData } = useChatMessages(chatId)
  const messages  = (chatData?.messages || []).filter(m => m.role !== 'system')
  const linkedEvent = chatData?.linked_event
  const bottomRef  = useRef()

  const [content, setContent]      = useState('')
  const [sending, setSending]      = useState(false)
  const [ending, setEnding]        = useState(false)
  const [synthesis, setSynthesis]  = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = async () => {
    const text = content.trim()
    if (!text) return
    setSending(true)
    setContent('')
    try {
      const res = await api.post(`/chat/${chatId}/message`, { content: text })
      queryClient.invalidateQueries({ queryKey: KEYS.chatMessages(chatId) })
      if (res.data.is_end) {
        handleEndMeeting()
      }
    } catch {
      toast.error('Failed to send note')
    } finally {
      setSending(false)
    }
  }

  const handleEndMeeting = async () => {
    setEnding(true)
    try {
      const res = await api.post(`/chat/${chatId}/end-meeting`)
      setSynthesis(res.data.synthesis)
      queryClient.invalidateQueries({ queryKey: KEYS.chatMessages(chatId) })
    } catch {
      toast.error('Failed to end meeting')
    } finally {
      setEnding(false)
    }
  }

  // If meeting has ended, show synthesis + debrief CTA
  if (synthesis) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-surface-border">
          <button onClick={onBack} className="text-text-muted hover:text-text-primary">←</button>
          <div>
            <p className="text-sm font-semibold text-text-primary">Meeting complete</p>
            {linkedEvent && <p className="text-xs text-text-muted">{linkedEvent.title}</p>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-container px-4 py-4 space-y-4">
          {synthesis.full_debrief?.summary && (
            <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
              <p className="text-xs font-semibold text-text-muted mb-2">📋 Meeting summary</p>
              <p className="text-sm text-text-secondary">{synthesis.full_debrief.summary}</p>
            </div>
          )}

          {synthesis.commitments?.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-400 mb-2">📌 Commitments extracted</p>
              {synthesis.commitments.map((c, i) => (
                <p key={i} className="text-xs text-text-secondary">
                  {c.owner === 'founder' ? '👤 You:' : '🤝 Them:'} {c.text}
                </p>
              ))}
            </div>
          )}

          {synthesis.signals?.length > 0 && (
            <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
              <p className="text-xs font-semibold text-text-muted mb-2">📡 Signals detected</p>
              {synthesis.signals.map((s, i) => (
                <p key={i} className={`text-xs ${s.type === 'buying' ? 'text-green-400' : s.type === 'risk' ? 'text-red-400' : 'text-text-secondary'}`}>
                  {s.type === 'buying' ? '🔥' : '⚠️'} {s.text}
                </p>
              ))}
            </div>
          )}

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-primary-glow mb-2">✅ Save your debrief</p>
            <p className="text-sm text-text-secondary mb-3">
              Rate the meeting and save your debrief to generate follow-up options and update your prospect's health score.
            </p>
            {linkedEvent && (
              <Button onClick={() => navigate('/calendar', { state: { openDebrief: linkedEvent.id } })}>
                Log debrief for {linkedEvent.attendee_name || 'this meeting'}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-surface-border bg-amber-500/5">
        <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm">←</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">🎙️ Meeting Notes</span>
            <p className="text-sm font-semibold text-text-primary truncate">{chat?.title}</p>
          </div>
          {linkedEvent && <p className="text-xs text-text-muted">with {linkedEvent.attendee_name || 'prospect'}</p>}
        </div>
        <Button size="xs" variant="secondary" onClick={handleEndMeeting} loading={ending}>
          End Meeting
        </Button>
      </div>

      {/* Instructions banner */}
      {messages.length === 0 && (
        <div className="bg-surface-panel border-b border-surface-border px-4 py-3">
          <p className="text-xs text-text-muted">
            <strong className="text-text-secondary">Type your notes as fragments.</strong> No need for structure — just capture what's happening. 
            Clutch asks smart questions to help you get more. Type <span className="font-mono bg-surface-border px-1 rounded">done</span> when the meeting ends.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-container px-4 py-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
            {msg.role === 'user' ? (
              <div className="inline-block max-w-[85%] bg-surface-panel border border-surface-border rounded-xl px-3 py-2 text-left">
                <p className="text-sm text-text-primary">{msg.content}</p>
              </div>
            ) : (
              <div className="inline-block max-w-[85%] text-left">
                <p className="text-sm text-text-secondary italic">{msg.content}</p>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Notes input */}
      <div className="border-t border-surface-border bg-surface-panel px-3 pt-3 pb-12">
        <div className="flex items-end gap-2">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Type a note… e.g. 'asked about pricing', 'mentioned competitor X', 'CTO needs to approve'"
            disabled={sending}
            rows={2}
            className="flex-1 bg-surface-mid border border-surface-border rounded-2xl px-4 py-2.5 pr-12 text-sm text-text-primary placeholder-text-muted resize-none outline-none focus:border-amber-500/40 transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={sending || !content.trim()}
            className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mb-0.5 text-white disabled:opacity-40 hover:bg-amber-400 transition-colors"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Standard Chat Window ───────────────────────────────────────────────────────
function ChatWindow({ chatId, onBack }) {
  const { data: chatData, isLoading } = useChatMessages(chatId)
  const chat = chatData?.chat

  const [renameOpen, setRenameOpen] = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const renameChat = useRenameChat()
  const deleteChat = useDeleteChat()
  const navigate   = useNavigate()
  const location   = useLocation()
  const bottomRef  = useRef()

  // Fix Issue 14: ref-based guard prevents double-sends
  const sendingRef = useRef(false)

  // Fix Issue 03 + 19: correct useStream call signature.
  // onComplete fires a single cache invalidation as a safety net after the stream
  // closes. Realtime handles live updates during streaming; this is the cleanup pass.
  const onComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: KEYS.chatMessages(chatId) })
  }, [chatId])

  const onError = useCallback((errMsg) => {
    toast.error(errMsg || 'Message failed. Please try again.')
  }, [])

  const {
    isStreaming: streaming,
    streamContent,
    streamProvider,
    startStream,
  } = useStream({ chatId, onComplete, onError })

  // streamProvider === 'perplexity' means web search is active (Issue 03)
  const isSearching = streamProvider === 'perplexity'

  // Fix Issue 14: wrapped sender — blocks new sends while streaming
  const handleSend = useCallback((content, attachmentIds = [], forceSearch = false) => {
    if (sendingRef.current || streaming) return
    sendingRef.current = true
    startStream(content, attachmentIds, forceSearch).finally(() => {
      sendingRef.current = false
    })
  }, [startStream, streaming])

  useRealtimeChat(chatId)

  // Fix Issue 20: filter AFTER streaming is declared.
  // Hide empty assistant placeholder rows while a stream is in-flight to prevent
  // a ghost empty bubble appearing alongside the live streaming preview.
  const messages = (chatData?.messages || []).filter(m => {
    if (m.role === 'system') return false
    if (streaming && m.role === 'assistant' && !m.content?.trim()) return false
    return true
  })

  // Fix Issue 11: pagination cursor for loading earlier messages
  const [beforeCursor, setBeforeCursor] = useState(null)
  const [olderMessages, setOlderMessages] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 50

  const loadEarlierMessages = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const cursor = beforeCursor || messages[0]?.created_at
      if (!cursor) { setHasMore(false); return }
      const res = await api.get(`/chat/${chatId}`, { params: { limit: PAGE_SIZE, before: cursor } })
      const older = (res.data.messages || []).filter(m => m.role !== 'system')
      if (older.length < PAGE_SIZE) setHasMore(false)
      if (older.length > 0) {
        setOlderMessages(prev => [...older, ...prev])
        setBeforeCursor(older[0].created_at)
      } else {
        setHasMore(false)
      }
    } catch {
      toast.error('Failed to load earlier messages')
    } finally {
      setLoadingMore(false)
    }
  }

  // Merge older + current messages into one ordered list
  const allMessages = [...olderMessages, ...messages]

  if (chat?.chat_mode === 'meeting_notes') {
    return <MeetingNotesWindow chatId={chatId} chat={chat} onBack={onBack} />
  }

  // Auto-message from calendar "Discuss with Clutch"
  const autoMessageSent = useRef(false)
  useEffect(() => {
    if (!location.state?.autoMessage || autoMessageSent.current) return
    autoMessageSent.current = true
    const msg = location.state.autoMessage
    window.history.replaceState({}, '')
    setTimeout(() => handleSend(msg, [], false), 300)
  }, [location.state?.autoMessage])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamContent])

  const handleRename = async () => {
    if (!newTitle.trim()) return
    try {
      await renameChat.mutateAsync({ chatId, title: newTitle.trim() })
      queryClient.invalidateQueries({ queryKey: KEYS.chats() })
      setRenameOpen(false)
    } catch {
      toast.error('Failed to rename')
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this conversation?')) return
    try {
      await deleteChat.mutateAsync(chatId)
      navigate('/chat')
    } catch {
      toast.error('Failed to delete')
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col min-w-0 p-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-surface-border">
        <button onClick={onBack} className="lg:hidden text-text-muted hover:text-text-primary">←</button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{chat?.title || 'Chat'}</p>
          {chat?.chat_mode === 'prep' && <p className="text-xs text-text-muted">Prep session</p>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { setNewTitle(chat?.title || ''); setRenameOpen(true) }} className="text-xs text-text-muted hover:text-text-secondary px-2 py-1">Rename</button>
          <button onClick={handleDelete} className="text-xs text-text-muted hover:text-error px-2 py-1">Delete</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-container px-4 py-4">
        {/* Fix Issue 11: load earlier messages button */}
        {allMessages.length > 0 && hasMore && (
          <div className="flex justify-center mb-3">
            <button
              onClick={loadEarlierMessages}
              disabled={loadingMore}
              className="text-xs text-text-muted hover:text-text-secondary bg-surface-panel border border-surface-border rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {allMessages.length === 0 && !streaming ? (
          <ChatEmptyState chatId={chatId} onSend={handleSend} />
        ) : (
          allMessages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isStreaming={streaming && msg.id === allMessages[allMessages.length - 1]?.id}
              streamContent={streamContent}
            />
          ))
        )}

        {streaming && (
          <>
            {isSearching ? (
              <div className="flex gap-2.5 items-start mb-1">
                <ClutchAvatar size="sm" className="mt-1 shrink-0" />
                <div className="py-2 px-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 text-xs text-blue-400">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    Searching the web in real-time…
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-2.5 items-start mb-1">
                <ClutchAvatar size="sm" className="mt-1 shrink-0" />
                <div className="py-1">
                  <span className="text-sm text-text-muted streaming-cursor" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput chatId={chatId} onSend={handleSend} disabled={streaming} />

      <Modal isOpen={renameOpen} onClose={() => setRenameOpen(false)} title="Rename chat" size="sm">
        <ModalBody>
          <Input label="Chat name" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename()} autoFocus />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
          <Button onClick={handleRename} loading={renameChat.isPending}>Save</Button>
        </ModalFooter>
      </Modal>
    </div>
  
  )
}



// ── Empty state ────────────────────────────────────────────────────────────────
function ChatEmptyState({ chatId, onSend }) {
  const { data: suggestions } = useSuggestions()
  const chips = suggestions || DEFAULT_CHAT_SUGGESTIONS

  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-primary-glow">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1">Ask Clutch anything</h3>
      <p className="text-sm text-text-muted mb-6 max-w-xs">Your AI sales coach is ready. Get help with messaging, objections, and strategy.</p>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {chips.slice(0, 4).map((chip, i) => (
          <button key={i} onClick={() => onSend(chip, [], false)} className="text-sm text-text-muted bg-surface-panel border border-surface-border rounded-xl px-4 py-2.5 hover:border-primary/30 hover:text-text-secondary hover:bg-primary/5 transition-all text-left">
            {chip}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Chat list sidebar ──────────────────────────────────────────────────────────
function ChatListPanel({ activeId }) {
  const { data: allChats = [], isLoading } = useChats()
  const createChat = useCreateChat()
  const navigate   = useNavigate()

  const general     = allChats.filter(c => c.chat_type === 'general' && c.chat_mode !== 'meeting_notes')
  const opportunity = allChats.filter(c => c.chat_type === 'opportunity')
  const meetingNotes = allChats.filter(c => c.chat_mode === 'meeting_notes')

  const handleNew = async () => {
    try {
      const { chat } = await createChat.mutateAsync({ chat_type: 'general' })
      navigate(`/chat/${chat.id}`)
    } catch {
      toast.error('Failed to create chat')
    }
  }

  const ChatItem = ({ chat }) => (
    <button
      onClick={() => navigate(`/chat/${chat.id}`)}
      className={`w-full flex flex-col items-start px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
        activeId === chat.id ? 'bg-primary/10 text-primary-glow' : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
      }`}
    >
      <div className="flex items-center gap-2 w-full">
        <span className="text-sm font-medium truncate flex-1">{chat.title}</span>
        {chat.chat_type === 'opportunity' && (
          <span className="shrink-0 text-[9px] font-semibold bg-primary/15 text-primary-glow border border-primary/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Outreach</span>
        )}
        {chat.chat_mode === 'meeting_notes' && (
          <span className="shrink-0 text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Notes</span>
        )}
      </div>
      <span className="text-xs text-text-muted mt-0.5">{chat.message_count || 0} messages</span>
    </button>
  )

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 h-14 border-b border-surface-border">
        <h2 className="text-sm font-semibold text-text-primary">Conversations</h2>
        <Button size="xs" onClick={handleNew} loading={createChat.isPending}>+ New</Button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container px-2 py-3 space-y-4">
        {isLoading ? (
          <div className="space-y-2 px-1">{[...Array(4)].map((_, i) => <div key={i} className="h-10 skeleton rounded-xl" />)}</div>
        ) : (
          <>
            {meetingNotes.length > 0 && (
              <div>
                <p className="text-xs text-amber-400 font-medium px-2 mb-1.5">🎙️ Meeting Notes</p>
                <div className="space-y-0.5">{meetingNotes.map(c => <ChatItem key={c.id} chat={c} />)}</div>
              </div>
            )}
            {opportunity.length > 0 && (
              <div>
                <p className="text-xs text-text-muted font-medium px-2 mb-1.5">🎯 Opportunity Chats</p>
                <div className="space-y-0.5">{opportunity.map(c => <ChatItem key={c.id} chat={c} />)}</div>
              </div>
            )}
            <div>
              <p className="text-xs text-text-muted font-medium px-2 mb-1.5">💬 General</p>
              <div className="space-y-0.5">
                {general.length === 0 ? (
                  <p className="text-xs text-text-muted px-2 py-2">No conversations yet</p>
                ) : (
                  general.map(c => <ChatItem key={c.id} chat={c} />)
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { '*': wildcard } = useParams()
  const chatId = wildcard?.replace('/', '')
  const navigate = useNavigate()

  return (
    <div className="flex h-full overflow-hidden">
      <div className={`shrink-0 border-r border-surface-border bg-surface-panel flex flex-col ${chatId ? 'hidden lg:flex lg:w-72' : 'flex w-full lg:w-72'}`}>
        <ChatListPanel activeId={chatId} />
      </div>
      <div className={`flex-1 flex-col min-w-0 ${chatId ? 'flex' : 'hidden lg:flex'}`}>
        {!chatId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-primary-glow">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Select a conversation</h3>
              <p className="text-xs text-text-muted">or start a new one</p>
            </div>
          </div>
        ) : (
          <ChatWindow chatId={chatId} onBack={() => navigate('/chat')} />
        )}
      </div>
    </div>
  )
}
