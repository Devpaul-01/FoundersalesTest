import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useOpportunities, useMarkSent, useMarkClick, useMarkCopy,
  useRefreshFeed, useRegenerateMessage, useCreateOpportunityChat,
  useStartPractice, useOpportunityIntel
} from '../services/queries'
import { SkeletonCard } from '../components/ui/Skeleton'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { PlatformBadge, ScoreBar } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal'
import { truncate, timeAgo } from '../utils/formatters'
import { SCENARIO_LABELS, SCENARIO_COLORS } from '../utils/constants'
import toast from 'react-hot-toast'

// ── Utility: detect link type from URL ─────────────────────────────────────
const getViewButtonLabel = (url = '', platform = '') => {
  if (!url) return 'View Link'
  try {
    const u = url.toLowerCase()
    // Profile patterns
    if (/linkedin\.com\/in\//.test(u))          return 'View Profile'
    if (/twitter\.com\/(?!.*\/status\/)/.test(u)) return 'View Profile'
    if (/x\.com\/(?!.*\/status\/)/.test(u))       return 'View Profile'
    if (/reddit\.com\/user\//.test(u))            return 'View Profile'
    if (/instagram\.com\/(?!(p|reel|stories|explore)\/)[^/]+\/?$/.test(u)) return 'View Profile'
    if (/github\.com\/[^/]+$/.test(u))            return 'View Profile'
    // Post / content patterns
    if (/linkedin\.com\/(posts|feed|pulse)/.test(u)) return 'View Post'
    if (/twitter\.com\/.*\/status\//.test(u))        return 'View Tweet'
    if (/x\.com\/.*\/status\//.test(u))              return 'View Tweet'
    if (/reddit\.com\/r\/.*\/comments\//.test(u))    return 'View Post'
    if (/indiehackers\.com\/(post|product)/.test(u)) return 'View Post'
    if (/news\.ycombinator\.com\/item/.test(u))      return 'View Thread'
    if (/quora\.com\/.*\/answer/.test(u))            return 'View Answer'
    if (/quora\.com\//.test(u))                      return 'View Question'
    if (/youtube\.com\/(watch|shorts)/.test(u))      return 'Watch Video'
    if (/producthunt\.com\/posts/.test(u))           return 'View Launch'
    // Fallback by platform
    const fallbacks = {
      linkedin: 'View Post', twitter: 'View Tweet', reddit: 'View Post',
      instagram: 'View Post', youtube: 'Watch Video', producthunt: 'View Launch',
      indiehackers: 'View Post', hackernews: 'View Thread', quora: 'View Question',
    }
    return fallbacks[platform] || 'View Link'
  } catch { return 'View Link' }
}

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'sent', label: 'Sent' },
  { key: 'all', label: 'All' },
]

// ── Quick Intel Panel ───────────────────────────────────────────────────────
function QuickIntelPanel({ opp }) {
  const fetchIntel = useOpportunityIntel(opp.id)

  const hasIntel   = !!opp.intel_snapshot
  const isFailed   = !!opp.intel_fetch_failed
  const isStale    = hasIntel && opp.intel_generated_at &&
    new Date(opp.intel_generated_at) < new Date(Date.now() - 3 * 86400000)

  // Issue 21 fix: auto-trigger a refresh when intel exists but is stale.
  // Previously isStale was computed but never acted on — the user had to manually
  // click "Refresh ↻". Now we silently re-fetch on mount if the data is old.
  useEffect(() => {
    if (isStale && !fetchIntel.isPending) {
      fetchIntel.mutate()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isFailed && !hasIntel) {
    return <p className="text-xs text-text-muted mt-2">Intel unavailable for this prospect.</p>
  }

  if (!hasIntel && !fetchIntel.isPending) {
    return (
      <button
        onClick={() => fetchIntel.mutate()}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary-glow transition-colors mt-2"
      >
        🔍 Load quick intel
      </button>
    )
  }

  if (fetchIntel.isPending) {
    return (
      <div className="mt-3 p-3 bg-surface-panel border border-surface-border rounded-xl animate-pulse">
        <p className="text-xs text-text-muted">Searching for prospect context…</p>
      </div>
    )
  }

  const intel = opp.intel_snapshot
  if (!intel || (!intel.bullets?.length && !intel.relevance_note)) {
    return <p className="text-xs text-text-muted mt-2">No relevant intel found.</p>
  }

  return (
    <div className="mt-3 bg-surface-panel border border-surface-border rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🔍</span>
          <p className="text-xs font-semibold text-text-secondary">
            Quick Intel{intel.company ? ` · ${intel.company}` : ''}
          </p>
        </div>
        {isStale && (
          <button
            onClick={() => fetchIntel.mutate()}
            className="text-xs text-primary-glow hover:underline transition-colors"
          >
            Refresh ↻
          </button>
        )}
      </div>
      {intel.bullets?.length > 0 && (
        <ul className="space-y-1 mb-2">
          {intel.bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-text-secondary leading-snug">
              <span className="text-primary-glow shrink-0 mt-px">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {intel.relevance_note && (
        <p className="text-xs text-text-muted italic border-t border-surface-border pt-2 mt-2">
          Why it matters: {intel.relevance_note}
        </p>
      )}
    </div>
  )
}

function OpportunityCard({ opp, onMarkSent, onOpenChat, onView, onClick, onCopy, onRegen, regenLoading, onPractice, chatLoading, practiceLoading }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleExpand = () => {
    if (!expanded) onView(opp.id)
    setExpanded(!expanded)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(opp.prepared_message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onCopy(opp.id)
      toast.success('Message copied!')
    } catch {
      toast.error('Could not copy')
    }
  }

  const handleViewPost = () => {
    window.open(opp.source_url, '_blank', 'noopener')
    onClick(opp.id)
  }

  const score = opp.composite_score || ((opp.fit_score + opp.timing_score + opp.intent_score) / 3)
  const hasFollowUp = !!opp.follow_up_message && (opp.follow_up_count || 0) > 0

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl hover:border-surface-mid transition-all duration-150 animate-fade-in-up">
      {/* Card header */}
      <div className="p-4 cursor-pointer" onClick={handleExpand}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <PlatformBadge platform={opp.platform} />
            {opp.target_name && (
              <span className="text-xs text-text-muted font-medium">{opp.target_name}</span>
            )}
            {/* Follow-up ready badge — Feature 1 */}
            {hasFollowUp && (
              <span className="text-[10px] font-semibold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-full">
                📬 Follow-up ready
              </span>
            )}
          </div>
          <div className="shrink-0 w-32">
            <ScoreBar score={parseFloat(score)} />
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
          {opp.target_context}
        </p>
      </div>

      {/* Expanded: prepared message + Quick Intel + actions */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border pt-4 animate-fade-in">
          {/* Follow-up message block */}
          {hasFollowUp && (
            <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 mb-3">
              <p className="text-xs font-semibold text-warning mb-1.5">📬 Follow-up message ready</p>
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap text-xs">
                {opp.follow_up_message}
              </p>
            </div>
          )}

          <div className="bg-surface-panel rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-text-muted font-medium">Prepared message</p>
              <div className="flex gap-1.5">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-card border border-surface-border text-text-muted hover:text-text-secondary hover:border-surface-mid transition-all"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => onRegen(opp.id)}
                  disabled={regenLoading}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-card border border-surface-border text-text-muted hover:text-text-secondary hover:border-surface-mid transition-all disabled:opacity-50"
                >
                  {regenLoading ? '↻' : '↺ Regen'}
                </button>
              </div>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {opp.prepared_message}
            </p>
          </div>

          {/* Quick Intel — Feature 5 */}
          <QuickIntelPanel opp={opp} />

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <Button size="sm" variant="secondary" onClick={handleViewPost}>
              {getViewButtonLabel(opp.source_url, opp.platform)} ↗
            </Button>
            <Button size="sm" variant="success" onClick={() => onMarkSent(opp.id)}>
              Mark Sent ✓
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => onOpenChat(opp)}
              loading={chatLoading}
            >
              Ask Clutch →
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onPractice(opp)}
              loading={practiceLoading}
            >
              Practice 🎯
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OpportunitiesPage() {
  const [tab, setTab] = useState('active')
  const { data, isLoading } = useOpportunities(tab)
  const markSent      = useMarkSent()
  const markClick     = useMarkClick()
  const markCopy      = useMarkCopy()
  const refreshFeed   = useRefreshFeed()
  const regenerate    = useRegenerateMessage()
  const createChat    = useCreateOpportunityChat()
  const startPractice = useStartPractice()
  const [regenId, setRegenId]                         = useState(null)
  const [chatLoadingId, setChatLoadingId]             = useState(null)
  const [practiceLoadingId, setPracticeLoadingId]     = useState(null)
  const [practiceModal, setPracticeModal]             = useState(null) // { opp }
  const [practiceType, setPracticeType]               = useState(null)
  const navigate = useNavigate()

  const SCENARIO_ICONS = {
    interested: '✨', polite_decline: '🙅', ghost: '👻',
    skeptical: '🤨', price_objection: '💰', not_right_time: '⏰',
  }
  const PRACTICE_TYPES = Object.keys(SCENARIO_LABELS)

  const opportunities = data?.opportunities || []

  // Opens an opportunity chat and fires the AI's first message automatically
  const handleOpenChat = async (opp) => {
    setChatLoadingId(opp.id)
    try {
      const { chat_id } = await createChat.mutateAsync(opp.id)
      const autoMessage =
        `Help me with this ${opp.platform} opportunity:\n\n` +
        `**Who they are:** ${opp.target_context?.slice(0, 300) || 'A potential lead'}\n\n` +
        `**My prepared message:**\n${opp.prepared_message || 'Not yet generated'}\n\n` +
        `Please review my message, suggest specific improvements, and help me think through the best way to approach this person.`
      navigate(`/chat/${chat_id}`, { state: { autoMessage } })
    } catch {
      toast.error('Failed to open chat')
    } finally {
      setChatLoadingId(null)
    }
  }

  // Step 1: user clicks Practice → modal opens to pick type
  const handlePracticeClick = (opp) => {
    setPracticeType(null)
    setPracticeModal({ opp })
  }

  // Step 2: user picks type and confirms → start session with opp context
  const handlePracticeStart = async () => {
    if (!practiceType) { toast('Pick a response type first'); return }
    const opp = practiceModal.opp
    setPracticeLoadingId(opp.id)
    try {
      const res = await startPractice.mutateAsync({
        scenario_type:       practiceType,
        opportunity_context: opp.target_context || opp.prepared_message || '',
      })
      setPracticeModal(null)
      navigate(`/practice/${res.session_id}`)
    } catch {
      toast.error('Failed to start practice session')
    } finally {
      setPracticeLoadingId(null)
    }
  }

  const handleRegen = async (id) => {
    setRegenId(id)
    await regenerate.mutateAsync({ id })
    setRegenId(null)
  }

  return (
    <>
      <TopBar
        title="Opportunities"
        actions={
          <Button
            size="sm"
            variant="secondary"
            loading={refreshFeed.isPending}
            onClick={() => refreshFeed.mutate()}
            icon={<span className="text-xs">↻</span>}
          >
            Refresh Feed
          </Button>
        }
      />
      <PageContent>
        {/* Fallback notice */}
        {data?.is_fallback && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-3.5 mb-5 flex gap-2 text-sm">
            <span>⚠️</span>
            <p className="text-text-secondary">
              Live search limit reached. Showing practice opportunities — resets at midnight.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-surface-panel p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                tab === t.key
                  ? 'bg-surface-card text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-4xl mb-4">🔍</span>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              {tab === 'active' ? 'Clutch is searching for leads…' : 'No opportunities here'}
            </h3>
            <p className="text-sm text-text-muted mb-5 max-w-xs">
              {tab === 'active'
                ? 'New leads are usually found within minutes. Try refreshing.'
                : 'Mark some opportunities as sent to see them here.'}
            </p>
            {tab === 'active' && (
              <Button variant="secondary" onClick={() => refreshFeed.mutate()} loading={refreshFeed.isPending}>
                Refresh Now
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {opportunities.map(opp => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                onMarkSent={(id) => markSent.mutate(id)}
                onOpenChat={handleOpenChat}
                onPractice={handlePracticeClick}
                onView={(id) => markClick.mutate(id)}
                onClick={(id) => markClick.mutate(id)}
                onCopy={(id) => markCopy.mutate(id)}
                onRegen={handleRegen}
                regenLoading={regenId === opp.id && regenerate.isPending}
                chatLoading={chatLoadingId === opp.id}
                practiceLoading={practiceLoadingId === opp.id}
              />
            ))}
          </div>
        )}
      </PageContent>

      {/* ── Practice type picker modal ── */}
      {practiceModal && (
        <Modal isOpen onClose={() => setPracticeModal(null)} title="Practice this opportunity">
          <ModalBody>
            <p className="text-xs text-text-muted mb-4">
              Clutch will generate a practice scenario based on this lead.
              Choose how the prospect should respond.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PRACTICE_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPracticeType(type)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                    practiceType === type
                      ? 'border-primary bg-primary/10'
                      : 'border-surface-border bg-surface-panel hover:border-surface-mid'
                  }`}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: `${SCENARIO_COLORS[type]}18`, color: SCENARIO_COLORS[type] }}
                  >
                    {SCENARIO_ICONS[type] || '💬'}
                  </span>
                  <p className="text-xs font-medium text-text-primary truncate">{SCENARIO_LABELS[type]}</p>
                </button>
              ))}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setPracticeModal(null)}>Cancel</Button>
            <Button
              disabled={!practiceType}
              loading={!!practiceLoadingId}
              onClick={handlePracticeStart}
            >
              Start practice →
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  )
}
