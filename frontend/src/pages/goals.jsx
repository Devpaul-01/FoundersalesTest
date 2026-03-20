// src/pages/goals.jsx
// ============================================================
// GOALS PAGE
//
// IMPROVEMENTS:
//  UI-01 — GoalsAtAGlance strip: compact horizontal summary at the top
//           of the page showing all active goals at a single glance.
//           No new API call — derived from the same useGoals() response.
//
//  UI-02 — Velocity projection on each GoalCard: shows avg pace/log
//           and whether the founder is ON TRACK or BEHIND PACE against
//           their deadline. Computed client-side from existing data.
//
//  UI-03 — explicit_delta: progressAmount is now sent as a separate
//           numeric param rather than being embedded in the note string.
//           Prevents AI from extracting the wrong number from notes
//           containing multiple figures.
//
//  UI-04 — PipelineInsight card at top of page: AI-generated 2-3 sentence
//           observation connecting pipeline health to active goals.
//           Cached 24h server-side. Rendered only when insight is available.
// ============================================================

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import Button from '../components/ui/Button'
import {
  useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal,
  useGoalNotes, useLogGoalNote, useDeleteGoalNote, useCreateChat,
  usePipelineInsight,
} from '../services/queries'
import { SkeletonCard } from '../components/ui/Skeleton'
import toast from 'react-hot-toast'

const GOAL_TYPES = [
  { key: 'revenue',    label: 'Revenue',     icon: '💰' },
  { key: 'clients',    label: 'Clients',     icon: '🤝' },
  { key: 'learning',   label: 'Learning',    icon: '📚' },
  { key: 'visibility', label: 'Visibility',  icon: '📣' },
  { key: 'custom',     label: 'Custom',      icon: '🎯' },
]

const GOAL_UNITS = ['clients', 'USD', 'followers', 'sessions', 'posts', 'calls', 'deals', '%']

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Computes velocity projection for a goal.
 * Returns { avgDelta, projectedDays, isOnTrack, projectedDate } or null.
 */
const computeVelocity = (goal, notes) => {
  if (!goal.target_value || !notes?.length) return null
  const deltas = notes.map(n => n.progress_delta || 0)
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length
  if (avgDelta <= 0) return null

  const remaining = goal.target_value - (goal.current_value || 0)
  if (remaining <= 0) return null

  const logsNeeded = Math.ceil(remaining / avgDelta)

  // Estimate avg days between logs
  let avgDaysBetween = 3 // fallback: assume every 3 days
  if (notes.length >= 2) {
    const timestamps = [...notes]
      .map(n => new Date(n.created_at).getTime())
      .sort((a, b) => a - b)
    const gaps = timestamps.slice(1).map((t, i) => (t - timestamps[i]) / 86400000)
    avgDaysBetween = gaps.reduce((s, g) => s + g, 0) / gaps.length
  }

  const projectedDays  = Math.ceil(logsNeeded * avgDaysBetween)
  const projectedDate  = new Date(Date.now() + projectedDays * 86400000)
  const daysUntilDeadline = goal.target_date
    ? Math.ceil((new Date(goal.target_date) - new Date()) / 86400000)
    : null

  const isOnTrack = daysUntilDeadline === null || projectedDays <= daysUntilDeadline
  const daysLate  = !isOnTrack ? projectedDays - daysUntilDeadline : 0

  return { avgDelta: +avgDelta.toFixed(1), projectedDays, projectedDate, isOnTrack, daysLate, logsNeeded }
}

// ── Pipeline Insight Card (UI-04) ─────────────────────────────────────────────
function PipelineInsightCard() {
  const { data, isLoading } = usePipelineInsight()

  if (isLoading) return (
    <div className="h-14 skeleton rounded-xl mb-4" />
  )

  if (!data?.insight) return null

  return (
    <div className="mb-5 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3.5 flex items-start gap-3">
      <span className="text-base shrink-0 mt-0.5">📊</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-primary-glow uppercase tracking-wide mb-1">Pipeline Health</p>
        <p className="text-xs text-text-secondary leading-relaxed">{data.insight}</p>
      </div>
    </div>
  )
}

// ── Goals at a Glance strip (UI-01) ───────────────────────────────────────────
function GoalsAtAGlance({ goals }) {
  const active = goals.filter(g => g.status === 'active' && g.target_value != null)
  if (!active.length) return null

  return (
    <div className="mb-5">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Active Goals</p>
      <div className="flex flex-wrap gap-2">
        {active.map(g => {
          const pct  = Math.min(100, Math.round(((g.current_value || 0) / g.target_value) * 100))
          const icon = GOAL_TYPES.find(t => t.key === g.goal_type)?.icon || '🎯'
          const color = pct >= 100 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#6366F1'
          return (
            <div
              key={g.id}
              className="flex items-center gap-2 bg-surface-card border border-surface-border rounded-xl px-3 py-2"
            >
              <span className="text-sm">{icon}</span>
              <div>
                <p className="text-[11px] font-medium text-text-secondary leading-none truncate max-w-[130px]">
                  {g.goal_text.length > 28 ? g.goal_text.slice(0, 28) + '…' : g.goal_text}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-16 h-1.5 bg-surface-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color }}>{pct}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Goal Form ─────────────────────────────────────────────────────────────────
function GoalForm({ onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    goal_text:    '',
    goal_type:    'custom',
    target_value: '',
    target_unit:  '',
    target_date:  '',
  })

  const handleSubmit = () => {
    if (!form.goal_text.trim()) { toast('Please describe your goal'); return }
    onSubmit({
      ...form,
      target_value: form.target_value ? parseFloat(form.target_value) : null,
    })
  }

  return (
    <div className="bg-surface-card border border-primary/20 rounded-2xl p-5 space-y-4 animate-fade-in-up">
      <h3 className="text-sm font-semibold text-text-primary">New Goal</h3>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1.5">What do you want to achieve? *</label>
        <input
          type="text"
          placeholder="e.g. Get 5 paying clients this month"
          value={form.goal_text}
          onChange={e => setForm({ ...form, goal_text: e.target.value })}
          className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1.5">Category</label>
        <div className="flex flex-wrap gap-2">
          {GOAL_TYPES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setForm({ ...form, goal_type: t.key })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                form.goal_type === t.key
                  ? 'bg-primary border-primary text-white'
                  : 'bg-surface-panel border-surface-border text-text-muted hover:border-surface-mid'
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">Target (optional)</label>
          <input
            type="number"
            placeholder="e.g. 5"
            value={form.target_value}
            onChange={e => setForm({ ...form, target_value: e.target.value })}
            className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5">Unit</label>
          <select
            value={form.target_unit}
            onChange={e => setForm({ ...form, target_unit: e.target.value })}
            className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary focus:outline-none focus:border-primary/60 transition-all"
          >
            <option value="">— select —</option>
            {GOAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-muted mb-1.5">Deadline (optional)</label>
        <input
          type="date"
          value={form.target_date}
          onChange={e => setForm({ ...form, target_date: e.target.value })}
          className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button fullWidth loading={loading} onClick={handleSubmit}>Save Goal</Button>
      </div>
    </div>
  )
}

// ── Goal Journal Entry ────────────────────────────────────────────────────────
function JournalEntry({ note, onDelete }) {
  const [showCoaching, setShowCoaching] = useState(false)
  const dateStr = new Date(note.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })

  return (
    <div className="border-l-2 border-surface-border pl-3 py-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-primary leading-snug">{note.note_text}</p>
          <div className="flex items-center gap-3 mt-1">
            {note.progress_delta !== 0 && (
              <span className={`text-xs font-semibold ${note.progress_delta > 0 ? 'text-success' : 'text-error'}`}>
                {note.progress_delta > 0 ? '+' : ''}{note.progress_delta}
              </span>
            )}
            <span className="text-xs text-text-muted">{dateStr}</span>
            {note.ai_response && (
              <button
                onClick={() => setShowCoaching(s => !s)}
                className="text-xs text-primary-glow hover:underline transition-colors"
              >
                {showCoaching ? 'Hide coaching ↑' : 'See coaching →'}
              </button>
            )}
          </div>
          {showCoaching && note.ai_response && (
            <div className="mt-2 p-2.5 bg-primary/5 border border-primary/15 rounded-lg">
              <p className="text-xs text-text-secondary leading-relaxed">{note.ai_response}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => onDelete(note.id)}
          className="p-1 text-text-muted hover:text-error transition-colors shrink-0"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Goal Card ─────────────────────────────────────────────────────────────────
function GoalCard({ goal, onUpdate, onDelete }) {
  const [showLogForm, setShowLogForm]       = useState(false)
  const [showJournal, setShowJournal]       = useState(false)
  const [achievedNote, setAchievedNote]     = useState('')
  const [challengeNote, setChallengeNote]   = useState('')
  const [progressAmount, setProgressAmount] = useState('')
  const [lastAiResponse, setLastAiResponse] = useState(null)
  const [aiLoading, setAiLoading]           = useState(false)

  const logNote    = useLogGoalNote(goal.id)
  const deleteNote = useDeleteGoalNote(goal.id)
  const createChat = useCreateChat()
  const navigate   = useNavigate()

  // Fetch notes only when journal is open (needed for velocity too when open)
  const { data: notes = [], isLoading: notesLoading } = useGoalNotes(showJournal || showLogForm ? goal.id : null)

  const hasTarget = goal.target_value != null
  const pct = hasTarget
    ? Math.min(100, Math.round(((goal.current_value || 0) / goal.target_value) * 100))
    : null

  const statusColor = {
    active:    'text-primary-glow',
    completed: 'text-success',
    paused:    'text-text-muted',
  }

  const handleComplete = () => onUpdate({ id: goal.id, status: 'completed' })
  const handlePause    = () => onUpdate({ id: goal.id, status: goal.status === 'paused' ? 'active' : 'paused' })

  // UI-03: Send explicit_delta as a dedicated field — not embedded in note_text
  const handleLogNote = async () => {
    const parts = [achievedNote.trim()]
    if (challengeNote.trim()) parts.push(`Challenges: ${challengeNote.trim()}`)
    const noteText = parts.filter(Boolean).join('. ')
    if (!noteText) { toast('What happened? Write something first.'); return }

    const explicitDelta = progressAmount ? parseFloat(progressAmount) : null

    setAiLoading(true)
    setLastAiResponse(null)
    try {
      // UI-03: pass explicit_delta separately from note_text
      const result = await logNote.mutateAsync({ note_text: noteText, explicit_delta: explicitDelta })
      setLastAiResponse(result)
      setAchievedNote('')
      setChallengeNote('')
      setProgressAmount('')
    } finally {
      setAiLoading(false)
    }
  }

  const handleGetHelp = async () => {
    try {
      const { chat } = await createChat.mutateAsync({
        chat_type: 'general',
        title: `Goal Help: ${goal.goal_text.slice(0, 40)}`,
      })
      const autoMessage = [
        `I need help with my goal: "${goal.goal_text}"`,
        goal.target_value
          ? `Target: ${goal.current_value || 0} / ${goal.target_value} ${goal.target_unit || ''}`
          : '',
        goal.status === 'active' ? 'What should I focus on to make progress this week?' : '',
      ].filter(Boolean).join('. ')
      navigate(`/chat/${chat.id}`, { state: { autoMessage } })
    } catch {
      toast.error('Could not open chat')
    }
  }

  // UI-02: Velocity projection — computed from loaded notes
  const velocity = showJournal || notes.length > 0
    ? computeVelocity(goal, notes)
    : null

  // Compute velocity even if journal not open (needs notes loaded)
  // We load notes lazily — only show velocity when notes are available
  const daysUntilTarget = goal.target_date
    ? Math.ceil((new Date(goal.target_date) - new Date()) / 86400000)
    : null

  return (
    <div className={`bg-surface-card border rounded-xl p-4 transition-all ${goal.status === 'completed' ? 'border-success/30 opacity-75' : 'border-surface-border'}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-text-muted">
              {GOAL_TYPES.find(t => t.key === goal.goal_type)?.icon || '🎯'}
            </span>
            <span className={`text-xs font-semibold ${statusColor[goal.status] || 'text-text-muted'}`}>
              {goal.status?.toUpperCase()}
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary leading-snug">{goal.goal_text}</p>
        </div>

        <div className="flex gap-1 shrink-0">
          {goal.status !== 'completed' && (
            <button onClick={handleComplete} className="p-1.5 rounded-lg text-text-muted hover:text-success hover:bg-success/10 transition-colors text-xs" title="Mark complete">✓</button>
          )}
          <button onClick={handlePause} className="p-1.5 rounded-lg text-text-muted hover:text-warning hover:bg-warning/10 transition-colors text-xs" title={goal.status === 'paused' ? 'Resume' : 'Pause'}>
            {goal.status === 'paused' ? '▶' : '⏸'}
          </button>
          <button onClick={() => onDelete(goal.id)} className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors text-xs" title="Delete">✕</button>
        </div>
      </div>

      {/* Progress bar */}
      {hasTarget ? (
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-text-muted">{goal.current_value || 0} / {goal.target_value} {goal.target_unit}</span>
            <span className="text-xs font-semibold text-primary-glow">{pct}%</span>
          </div>
          <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${goal.status === 'completed' ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted mb-2">No target set</p>
      )}

      {/* UI-02: Velocity projection + deadline row */}
      {(velocity || daysUntilTarget !== null) && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {daysUntilTarget !== null && (
            <span className={`text-[10px] font-medium ${daysUntilTarget <= 7 ? 'text-warning' : 'text-text-muted'}`}>
              📅 {daysUntilTarget > 0 ? `${daysUntilTarget}d left` : 'Deadline passed'}
            </span>
          )}
          {velocity && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              velocity.isOnTrack
                ? 'bg-success/10 text-success border-success/20'
                : 'bg-error/10 text-error border-error/20'
            }`}>
              {velocity.isOnTrack
                ? `✓ On pace · +${velocity.avgDelta} ${goal.target_unit || ''}/log`
                : `⚠ Behind ~${velocity.daysLate}d · +${velocity.avgDelta}/log avg`}
            </span>
          )}
        </div>
      )}

      {/* Deadline row (if no velocity) */}
      {!velocity && goal.target_date && !daysUntilTarget && (
        <p className="text-xs text-text-muted mb-3">
          📅 Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}

      {/* Action row */}
      {goal.status === 'active' && (
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={handleGetHelp}
            className="text-xs text-primary-glow border border-primary/20 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-all font-medium"
          >
            🧠 Ask Clutch
          </button>

          {!showLogForm && (
            <button
              onClick={() => setShowLogForm(true)}
              className="flex-1 text-xs text-center text-text-muted hover:text-primary-glow border border-dashed border-surface-border hover:border-primary/30 rounded-lg py-1.5 transition-all"
            >
              + Log progress
            </button>
          )}
        </div>
      )}

      {/* Log form */}
      {showLogForm && (
        <div className="mt-2 space-y-3">
          {/* Numeric progress — sent as explicit_delta, NOT embedded in note */}
          {hasTarget && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={progressAmount}
                onChange={e => setProgressAmount(e.target.value)}
                placeholder={`Add to ${goal.target_unit || 'progress'}`}
                className="w-28 px-3 py-2 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-all"
              />
              <span className="text-xs text-text-muted">{goal.target_unit}</span>
            </div>
          )}

          {/* What did you do? */}
          <textarea
            rows={2}
            value={achievedNote}
            onChange={e => setAchievedNote(e.target.value)}
            placeholder="What did you do? (e.g. 'Sent 12 cold DMs, 2 replied positively')"
            className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
          />

          {/* Any blockers? */}
          <textarea
            rows={2}
            value={challengeNote}
            onChange={e => setChallengeNote(e.target.value)}
            placeholder="Any blockers or challenges? (optional)"
            className="w-full px-3 py-2.5 text-sm bg-surface-panel border border-surface-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
          />

          <div className="flex justify-between items-center gap-2">
            <button
              onClick={() => { setShowLogForm(false); setAchievedNote(''); setChallengeNote(''); setProgressAmount(''); setLastAiResponse(null) }}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" loading={aiLoading} onClick={handleLogNote}>
              Log &amp; get coaching →
            </Button>
          </div>
        </div>
      )}

      {/* AI coaching response */}
      {aiLoading && (
        <div className="mt-3 p-3 bg-primary/5 border border-primary/15 rounded-xl animate-pulse">
          <div className="h-3 bg-primary/20 rounded w-1/3 mb-2" />
          <div className="h-3 bg-primary/10 rounded w-full mb-1" />
          <div className="h-3 bg-primary/10 rounded w-5/6" />
        </div>
      )}

      {!aiLoading && lastAiResponse && (
        <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-sm">🧠</span>
            {lastAiResponse.progress_delta !== 0 && lastAiResponse.new_value != null && (
              <span className="text-xs font-semibold text-success">
                Progress updated: {lastAiResponse.progress_delta > 0 ? '+' : ''}{lastAiResponse.progress_delta}
                {hasTarget ? ` → ${lastAiResponse.new_value} / ${goal.target_value} ${goal.target_unit || ''}` : ''}
              </span>
            )}
            {lastAiResponse.goal_completed && (
              <span className="text-xs font-bold text-success ml-1">🎉 Goal complete!</span>
            )}
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {lastAiResponse.coaching_response}
          </p>
        </div>
      )}

      {/* Journal toggle */}
      <button
        onClick={() => setShowJournal(s => !s)}
        className="mt-3 text-xs text-text-muted hover:text-primary-glow transition-colors"
      >
        {showJournal ? '↑ Hide journal' : '📓 View coaching history'}
      </button>

      {/* Goal journal */}
      {showJournal && (
        <div className="mt-3 space-y-3">
          {notesLoading ? (
            <SkeletonCard lines={2} />
          ) : notes.length === 0 ? (
            <p className="text-xs text-text-muted py-2">No notes yet. Log your first progress above.</p>
          ) : (
            notes.map(note => (
              <JournalEntry
                key={note.id}
                note={note}
                onDelete={(noteId) => deleteNote.mutate(noteId)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Goals Page ────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const { data: goals = [], isLoading } = useGoals()
  const createGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const [showForm, setShowForm] = useState(false)

  const activeGoals    = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')
  const pausedGoals    = goals.filter(g => g.status === 'paused')

  const handleCreate = async (data) => {
    await createGoal.mutateAsync(data)
    setShowForm(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this goal?')) return
    await deleteGoal.mutateAsync(id)
  }

  return (
    <>
      <TopBar
        title="Goals"
        actions={
          !showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              + New Goal
            </Button>
          )
        }
      />
      <PageContent>
        <div className="mb-5">
          <h1 className="text-xl font-bold font-display text-text-primary">Your Goals</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Clutch uses your goals to personalize every tip, check-in, and strategy
          </p>
        </div>

        {/* UI-04: Pipeline health insight */}
        <PipelineInsightCard />

        {/* UI-01: Goals at a glance strip */}
        {!isLoading && goals.length > 0 && <GoalsAtAGlance goals={goals} />}

        {showForm && (
          <div className="mb-6">
            <GoalForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              loading={createGoal.isPending}
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : goals.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-2">No goals yet</h3>
            <p className="text-sm text-text-muted mb-5 max-w-xs mx-auto">
              Set your first goal and Clutch will help you make progress every week.
            </p>
            <Button onClick={() => setShowForm(true)}>Create your first goal →</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeGoals.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Active</p>
                {activeGoals.map(g => (
                  <GoalCard key={g.id} goal={g} onUpdate={data => updateGoal.mutate(data)} onDelete={handleDelete} />
                ))}
              </div>
            )}
            {pausedGoals.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Paused</p>
                {pausedGoals.map(g => (
                  <GoalCard key={g.id} goal={g} onUpdate={data => updateGoal.mutate(data)} onDelete={handleDelete} />
                ))}
              </div>
            )}
            {completedGoals.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Completed</p>
                {completedGoals.map(g => (
                  <GoalCard key={g.id} goal={g} onUpdate={data => updateGoal.mutate(data)} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        )}
      </PageContent>
    </>
  )
}
