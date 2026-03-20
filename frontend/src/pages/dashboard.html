import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import { useDashboard, useMarkSent, usePendingConfirmations, useStartPractice } from '../services/queries'
import { useGrowthFeed, useMarkCardRead, useDismissCard, useSubmitCheckIn, useTodayCheckIn } from '../services/queries'
import { SkeletonCard } from '../components/ui/Skeleton'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { PlatformBadge } from '../components/ui/Badge'
import { formatDollars, formatPercent, timeAgo } from '../utils/formatters'
import { GROWTH_CARD_ICONS, GROWTH_CARD_LABELS,ARCHETYPE_ICONS, ARCHETYPE_LABELS } from '../utils/constants'
import api from '../services/api'
import { queryClient } from '../services/queryClient'
import { KEYS } from '../services/queries'
import Button from '../components/ui/Button'
import toast from 'react-hot-toast'

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-text-primary', icon }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-text-muted font-medium">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  )
}

// ── Sent Confirmation Banner ──────────────────────────────────────────────────
function SentConfirmationBanner() {
  const { data: pending = [] } = usePendingConfirmations()
  const markSent = useMarkSent()

  useEffect(() => {
    const check = () => queryClient.invalidateQueries({ queryKey: KEYS.pendingConfirmations })
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  if (!pending.length) return null
  const item = pending[0]

  return (
    <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-5 animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">📤</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">Did you send this message?</p>
          <p className="text-sm text-text-muted mt-0.5 truncate">{item.label}</p>
          {pending.length > 1 && <p className="text-xs text-text-muted mt-1">+{pending.length - 1} more</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="success" onClick={() => markSent.mutate(item.opportunity_id)} loading={markSent.isPending}>Yes ✓</Button>
          <Button size="sm" variant="ghost" onClick={() => {
            api.put(`/opportunities/${item.opportunity_id}`, { status: 'viewed' }).catch(() => {})
            queryClient.invalidateQueries({ queryKey: KEYS.pendingConfirmations })
          }}>No</Button>
        </div>
      </div>
    </div>
  )
}

// ── Goal Progress Widget ──────────────────────────────────────────────────────
function GoalProgress({ goals }) {
  if (!goals?.length) return null
  const goal = goals[0]
  const pct  = goal.target_value
    ? Math.min(100, Math.round(((goal.current_value || 0) / goal.target_value) * 100))
    : null

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">🎯</span>
          <p className="text-xs text-text-muted font-medium">Active Goal</p>
        </div>
        {pct !== null && (
          <span className="text-xs font-semibold text-primary-glow">{pct}%</span>
        )}
      </div>
      <p className="text-sm font-medium text-text-primary mb-2 leading-snug">{goal.goal_text}</p>
      {pct !== null && (
        <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {goal.target_date && (
        <p className="text-xs text-text-muted mt-1.5">
          Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
    </div>
  )
}

// ── Check-In Modal ────────────────────────────────────────────────────────────
function CheckInModal({ checkIn, onClose, onSubmit }) {
  const [answers, setAnswers] = useState({})
  const [mood, setMood]       = useState(null)
  const [loading, setLoading] = useState(false)
  const questions = checkIn?.questions || []
  const MOODS = ['😔', '😐', '🙂', '😄', '🔥']

  const handleSubmit = async () => {
    if (!Object.keys(answers).length) { toast('Please answer at least one question'); return }
    setLoading(true)
    try {
      await onSubmit(answers, mood)
      onClose()
    } catch { toast.error('Could not save check-in') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold font-display text-text-primary">Daily Check-in 👋</h3>
            <p className="text-xs text-text-muted mt-0.5">Quick reflection — takes 2 minutes</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors">✕</button>
        </div>

        {/* Mood selector */}
        <div className="mb-5">
          <p className="text-xs text-text-muted font-medium mb-2">How are you feeling today?</p>
          <div className="flex gap-3 justify-center">
            {MOODS.map((emoji, i) => (
              <button
                key={i}
                onClick={() => setMood(i + 1)}
                className={`text-2xl p-2 rounded-xl transition-all duration-150 ${mood === i + 1 ? 'bg-primary/10 scale-125' : 'hover:bg-surface-hover'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4 mb-5">
          {questions.map((q, i) => (
            <div key={i}>
              <p className="text-sm font-medium text-text-primary mb-1.5">{q}</p>
              <textarea
                placeholder="Your answer..."
                value={answers[q] || ''}
                onChange={e => setAnswers({ ...answers, [q]: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>Skip today</Button>
          <Button fullWidth loading={loading} onClick={handleSubmit}>Submit →</Button>
        </div>
      </div>
    </div>
  )
}

// ── Growth Card ───────────────────────────────────────────────────────────────
function GrowthCard({ card, onRead, onDismiss, navigate, onPracticeStart, startingPractice }) {
  const icon = GROWTH_CARD_ICONS[card.card_type] || '💡'

  // For practice_weakness, action_label lives in metadata (not top-level)
  const actionLabel = card.action_label || card.metadata?.action_label

  const handleAction = () => {
    onRead(card.id)
    // Feature 7: practice_weakness cards directly start a targeted drill session
    if (card.card_type === 'practice_weakness' && card.metadata?.action_scenario && onPracticeStart) {
      onPracticeStart(card.metadata.action_scenario)
      return
    }
    if (card.action_type === 'internal_chat')    navigate('/chat')
    else if (card.action_type === 'practice')    navigate('/practice')
    else if (card.action_type === 'follow_up_action') {
      const oppId = card.metadata?.opportunity_id
      navigate('/opportunities', oppId ? { state: { highlightId: oppId } } : {})
    }
    else if (card.action_type === 'internal_goals') navigate('/goals')
    else if (card.action_type === 'external_link' && card.action_url) window.open(card.action_url, '_blank')
  }

  const isPracticeWeakness = card.card_type === 'practice_weakness'

  return (
    <div className={`bg-surface-card border rounded-xl p-4 transition-all duration-150 ${
      isPracticeWeakness
        ? (card.is_read ? 'border-surface-border opacity-80' : 'border-error/25 bg-error/2')
        : (card.is_read ? 'border-surface-border opacity-80' : 'border-primary/20 bg-primary/2')
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`text-xs font-semibold uppercase tracking-wider ${
              isPracticeWeakness ? 'text-error' : card.is_read ? 'text-text-muted' : 'text-primary-glow'
            }`}>
              {GROWTH_CARD_LABELS[card.card_type] || card.card_type}
            </span>
            <button
              onClick={() => onDismiss(card.id)}
              className="text-text-muted hover:text-text-secondary text-xs transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
          <h4 className="text-sm font-semibold text-text-primary mb-1 leading-snug">{card.title}</h4>
          <p className="text-sm text-text-muted leading-relaxed">{card.body}</p>

          {/* Feature 7: Show the targeted drill tip + evidence for weakness cards */}
          {isPracticeWeakness && card.tip && (
            <div className="mt-2 bg-surface-panel border border-surface-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-0.5">Drill tip</p>
              <p className="text-xs text-text-secondary leading-relaxed">{card.tip}</p>
            </div>
          )}
          {isPracticeWeakness && card.metadata?.evidence && (
            <p className="text-[10px] text-text-muted mt-1.5 italic">{card.metadata.evidence}</p>
          )}

          {actionLabel && (
            <button
              onClick={handleAction}
              disabled={isPracticeWeakness && startingPractice}
              className="mt-3 text-xs font-semibold text-primary-glow hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {isPracticeWeakness && startingPractice ? 'Starting session…' : actionLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Opportunity Card (compact, for unified feed) ──────────────────────────────
function OpportunityFeedCard({ opp, onMarkSent, navigate }) {
  const [expanded, setExpanded] = useState(false)
  const score = opp.composite_score || ((opp.fit_score + opp.timing_score + opp.intent_score) / 3)

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl hover:border-surface-mid transition-all duration-150">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2 mb-2">
          <PlatformBadge platform={opp.platform} />
          {score >= 7 && <span className="text-xs bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded-full font-medium">Hot lead</span>}
        </div>
        <p className="text-sm text-text-secondary leading-relaxed line-clamp-2">{opp.target_context}</p>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border pt-3">
          <p className="text-xs text-text-muted font-medium mb-2">Prepared message</p>
          <p className="text-sm text-text-secondary bg-surface-panel rounded-lg p-3 leading-relaxed mb-3 text-xs">{opp.prepared_message}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { window.open(opp.source_url, '_blank'); }}>View post ↗</Button>
            <Button size="sm" variant="success" onClick={() => onMarkSent(opp.id)}>Mark Sent ✓</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/opportunities')}>See all →</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Archetype Badge ───────────────────────────────────────────────────────────
function ArchetypeBadge({ archetype }) {
  if (!archetype) return null
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-text-muted bg-surface-panel border border-surface-border px-2 py-1 rounded-full">
      <span>{ARCHETYPE_ICONS[archetype]}</span>
      <span>{ARCHETYPE_LABELS[archetype]}</span>
    </span>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user }          = useAuthStore()
  const { data, isLoading } = useDashboard()
  const { data: feedData, isLoading: feedLoading } = useGrowthFeed()
  const markCardRead      = useMarkCardRead()
  const dismissCard       = useDismissCard()
  const markSent          = useMarkSent()
  const submitCheckIn     = useSubmitCheckIn()
  const { data: checkInData } = useTodayCheckIn()
  const startPractice     = useStartPractice()
  const navigate          = useNavigate()
  const [showCheckIn, setShowCheckIn]         = useState(false)
  const [checkInDone, setCheckInDone]         = useState(false)
  const [startingPractice, setStartingPractice] = useState(false)

  // Feature 7: directly start a targeted drill session from a practice_weakness growth card
  const handlePracticeWeaknessAction = async (scenario_type) => {
    setStartingPractice(true)
    try {
      const res = await startPractice.mutateAsync({ scenario_type })
      navigate(`/practice/${res.session_id}`)
    } catch { toast.error('Could not start practice session') }
    finally { setStartingPractice(false) }
  }

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name     = user?.name?.split(' ')[0] || 'there'
  const archetype = user?.archetype || feedData?.archetype || 'seller'

  // Adaptive stats based on archetype
  const getStats = () => {
    const base = data || {}
    const commonStreak = { label: 'Streak', value: `${base.streak ?? 0} days`, sub: 'Keep it going', color: 'text-warning', icon: '🔥' }
    if (archetype === 'creator' || archetype === 'professional') {
      return [
        { label: 'Actions Today',    value: base.today?.sent ?? 0,                         sub: `${base.today?.shown ?? 0} items`,  icon: '⚡' },
        { label: 'Growth Cards',     value: feedData?.feed?.filter(f => f.feed_type === 'growth_card').length ?? 0, sub: 'Personalized for you', icon: '🌱' },
        { label: 'Goal Progress',    value: feedData?.goals?.[0] ? `${Math.round(((feedData.goals[0].current_value || 0) / (feedData.goals[0].target_value || 1)) * 100)}%` : '—', sub: feedData?.goals?.[0]?.goal_text?.slice(0, 25) || 'No goal set', color: 'text-primary-glow', icon: '🎯' },
        commonStreak
      ]
    }
    if (archetype === 'learner') {
      return [
        { label: 'Practice Done',    value: base.practice_count ?? 0,                      sub: 'sessions total',  icon: '💪' },
        { label: 'Tips Received',    value: feedData?.feed?.filter(f => f.feed_type === 'growth_card' && f.card_type === 'tip').length ?? 0, sub: 'personalized tips', icon: '💡' },
        { label: 'Check-ins',        value: base.checkin_streak ?? 0,                      sub: 'day streak',       color: 'text-success', icon: '✅' },
        commonStreak
      ]
    }
    // Default: seller / builder / freelancer
    return [
      { label: 'Sent Today',       value: base.today?.sent ?? 0,                           sub: `${base.today?.shown ?? 0} shown`,    icon: '📤' },
      { label: 'Positive Rate',    value: formatPercent(base.overall?.positive_rate),       sub: `${base.overall?.total_positive ?? 0} replies`, color: 'text-success', icon: '📈' },
      { label: 'Pipeline Value',   value: formatDollars(base.pipeline?.pipeline_value),     sub: `${base.pipeline?.contacted_count ?? 0} active`, color: 'text-primary-glow', icon: '💰' },
      commonStreak
    ]
  }

  const stats = getStats()
  const feed  = feedData?.feed || []

  // Show check-in prompt if it's after noon and not done today
  const shouldPromptCheckIn = !checkInDone && checkInData?.is_new && hour >= 12

  const handleCheckInSubmit = async (answers, mood) => {
    await submitCheckIn.mutateAsync({ answers, mood_score: mood })
    setCheckInDone(true)
    toast.success('Check-in saved! Your tip for tomorrow has been updated 🌱')
  }

  return (
    <>
      <TopBar title="Dashboard" />
      <PageContent>
        {/* Greeting + archetype */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold font-display text-text-primary">{greeting}, {name} 👋</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {archetype === 'learner'   ? 'Keep learning, keep growing' :
               archetype === 'creator'   ? 'Create, connect, grow' :
               archetype === 'professional' ? 'Build your reputation every day' :
               "Here's your growth feed"}
            </p>
          </div>
          <ArchetypeBadge archetype={archetype} />
        </div>

        {/* Pending sent confirmation */}
        <SentConfirmationBanner />

        {/* Goal progress */}
        {feedData?.goals?.length > 0 && <GoalProgress goals={feedData.goals} />}

        {/* Check-in prompt banner */}
        {shouldPromptCheckIn && !showCheckIn && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-5 flex items-center gap-3 animate-slide-up">
            <span className="text-2xl">✏️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">Quick check-in ready</p>
              <p className="text-xs text-text-muted mt-0.5">Clutch has personalized questions for you today</p>
            </div>
            <Button size="sm" onClick={() => setShowCheckIn(true)}>Check in →</Button>
          </div>
        )}

        {/* Stats row */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((s, i) => <StatCard key={i} {...s} />)}
          </div>
        )}

        {/* Unified Feed */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Your Growth Feed</h2>
          {feedData?.total_active_opps > 0 && (
            <button onClick={() => navigate('/opportunities')} className="text-xs text-primary-glow hover:text-primary transition-colors">
              {feedData.total_active_opps} leads →
            </button>
          )}
        </div>

        {feedLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : feed.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-4xl mb-3 block">🌱</span>
            <p className="text-sm font-medium text-text-primary">Setting up your growth feed...</p>
            <p className="text-xs text-text-muted mt-1 mb-4">This takes about a minute on your first visit</p>
            <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: KEYS.growthFeed })}>
              Refresh
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {feed.map(item =>
              item.feed_type === 'growth_card' ? (
                <GrowthCard
                  key={`card-${item.id}`}
                  card={item}
                  onRead={id => markCardRead.mutate(id)}
                  onDismiss={id => dismissCard.mutate(id)}
                  navigate={navigate}
                  onPracticeStart={handlePracticeWeaknessAction}
                  startingPractice={startingPractice}
                />
              ) : (
                <OpportunityFeedCard
                  key={`opp-${item.id}`}
                  opp={item}
                  onMarkSent={id => markSent.mutate(id)}
                  navigate={navigate}
                />
              )
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {[
            { label: 'Find leads',     icon: '🎯',  to: '/opportunities', color: 'bg-primary/5 border-primary/20 hover:border-primary/40' },
            { label: 'Practice',       icon: '💪',  to: '/practice',      color: 'bg-surface-card border-surface-border hover:border-surface-mid' },
            { label: 'Ask Clutch',     icon: '💬',  to: '/chat',          color: 'bg-surface-card border-surface-border hover:border-surface-mid' },
            { label: 'My Goals',       icon: '🎯',  to: '/goals',         color: 'bg-surface-card border-surface-border hover:border-surface-mid' },
          ].map(({ label, icon, to, color }) => (
            <button key={to} onClick={() => navigate(to)}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-150 text-left ${color}`}
            >
              <span className="text-xl">{icon}</span>
              <span className="text-sm font-medium text-text-secondary">{label}</span>
            </button>
          ))}
        </div>
      </PageContent>

      {/* Check-in Modal */}
      {showCheckIn && checkInData?.check_in && (
        <CheckInModal
          checkIn={checkInData.check_in}
          onClose={() => setShowCheckIn(false)}
          onSubmit={handleCheckInSubmit}
        />
      )}
    </>
  )
}
