// src/pages/pipeline.jsx
// ============================================================
// PIPELINE — Kanban board
//
// IMPROVEMENTS:
//  UI-01 — Cards now show a "days in stage" badge with traffic-light
//           colour coding (green ≤3d, yellow 4-6d, red 7+d). Cards within
//           each column are sorted by staleness (most overdue first) so
//           the deals that need attention always rise to the top.
//
//  UI-02 — "Follow-up ready" badge is now interactive. Clicking it expands
//           an inline panel with the follow-up message and a copy button so
//           founders can act immediately without leaving the pipeline.
//
//  UI-03 — Stage regression warning: moving a deal backward (e.g. Replied
//           → Contacted) shows a confirmation prompt. closed_lost is exempt
//           since it's always intentional and triggers the lost reason modal.
//
//  UI-04 — Lost Reason modal: when a deal is moved to closed_lost, a modal
//           collects the reason before the move is confirmed. This data
//           powers loss-pattern analysis in goal coaching and the weekly digest.
//
//  UI-05 — Column headers now show the total deal value for that stage.
// ============================================================

import React, { useState } from 'react'
import { usePipeline, useUpdateStage, useCreateEvent } from '../services/queries'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SkeletonCard } from '../components/ui/Skeleton'
import { PlatformBadge, ScoreBar } from '../components/ui/Badge'
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS } from '../utils/constants'
import { formatDollars, timeAgo, truncate } from '../utils/formatters'
import toast from 'react-hot-toast'

const STAGES = [
  PIPELINE_STAGES.CONTACTED,
  PIPELINE_STAGES.REPLIED,
  PIPELINE_STAGES.CALL_DEMO,
  PIPELINE_STAGES.CLOSED_WON,
  PIPELINE_STAGES.CLOSED_LOST,
]

// Stage order for regression detection (closed_lost excluded — it's always intentional)
const STAGE_ORDER = ['contacted', 'replied', 'call_demo', 'closed_won']

const LOST_REASONS = [
  { value: 'no_response',   label: 'No response / ghosted' },
  { value: 'price',         label: 'Price too high' },
  { value: 'bad_timing',    label: 'Wrong timing' },
  { value: 'not_a_fit',     label: 'Not a fit' },
  { value: 'competitor',    label: 'Chose a competitor' },
  { value: 'other',         label: 'Other' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const daysInStage = (lastChangedAt) => {
  if (!lastChangedAt) return null
  return Math.floor((Date.now() - new Date(lastChangedAt).getTime()) / 86400000)
}

const staleBadge = (days) => {
  if (days === null || days < 0) return null
  if (days <= 3)  return { bg: 'bg-success/10',  text: 'text-success',  border: 'border-success/20',  label: `${days}d` }
  if (days <= 6)  return { bg: 'bg-warning/10',  text: 'text-warning',  border: 'border-warning/20',  label: `${days}d ⚠` }
  return             { bg: 'bg-error/10',    text: 'text-error',    border: 'border-error/20',    label: `${days}d 🔴` }
}

// ── Mobile stage picker — shown as an inline list on tap ─────────────────────
function StagePicker({ currentStage, onSelect, onClose }) {
  return (
    <div className="mt-2 rounded-xl border border-surface-border bg-surface-card overflow-hidden animate-fade-in">
      <p className="px-3 py-2 text-[10px] text-text-muted font-semibold uppercase tracking-wider border-b border-surface-border">
        Move to stage
      </p>
      {STAGES.filter(s => s !== currentStage).map(stage => (
        <button
          key={stage}
          onClick={(e) => { e.stopPropagation(); onSelect(stage); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: STAGE_COLORS[stage] }}
          />
          {STAGE_LABELS[stage]}
        </button>
      ))}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="w-full px-3 py-2 text-xs text-text-muted hover:text-text-secondary border-t border-surface-border transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}

// ── Lost Reason Modal ─────────────────────────────────────────────────────────
function LostReasonModal({ opp, onConfirm, onSkip }) {
  const [selected, setSelected] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!selected) { toast('Select a reason — it helps you spot patterns.'); return }
    setSubmitting(true)
    const reason = selected === 'other' && customNote.trim()
      ? `other: ${customNote.trim()}`
      : selected
    await onConfirm(reason)
    setSubmitting(false)
  }

  const name = opp?.target_name || 'this prospect'

  return (
    <Modal isOpen onClose={onSkip} title="Why did this deal not close?" size="sm">
      <ModalBody>
        <p className="text-xs text-text-muted mb-4">
          Tracking loss reasons helps Clutch coach you on patterns — no pressure, but it's worth 5 seconds.
        </p>
        <p className="text-xs font-medium text-text-secondary mb-3">Deal with <span className="text-text-primary">{name}</span></p>
        <div className="space-y-2">
          {LOST_REASONS.map(r => (
            <button
              key={r.value}
              onClick={() => setSelected(r.value)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${
                selected === r.value
                  ? 'bg-primary/10 border-primary/40 text-text-primary'
                  : 'bg-surface-panel border-surface-border text-text-secondary hover:border-surface-mid'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${selected === r.value ? 'border-primary bg-primary' : 'border-surface-mid'}`}>
                {selected === r.value && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
              </span>
              {r.label}
            </button>
          ))}
        </div>
        {selected === 'other' && (
          <Input
            className="mt-3"
            placeholder="Brief note (optional)"
            value={customNote}
            onChange={e => setCustomNote(e.target.value)}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onSkip}>Skip</Button>
        <Button onClick={handleConfirm} loading={submitting}>Confirm &amp; close</Button>
      </ModalFooter>
    </Modal>
  )
}

// ── Pipeline Card ─────────────────────────────────────────────────────────────
function PipelineCard({ opp, onMoveStage }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging
  } = useSortable({ id: opp.id })
  const [pickerOpen, setPickerOpen]     = useState(false)
  const [followupOpen, setFollowupOpen] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const hasFollowUp = !!opp.follow_up_message && (opp.follow_up_count || 0) > 0
  const days        = daysInStage(opp.last_stage_changed_at)
  const stale       = staleBadge(days)

  const handleCopyFollowup = () => {
    if (opp.follow_up_message) {
      navigator.clipboard.writeText(opp.follow_up_message).then(() => toast.success('Follow-up copied!'))
    }
  }

  const CardMeta = () => (
    <>
      {/* Staleness + follow-up row */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {/* Follow-up badge — now clickable */}
        {hasFollowUp && (
          <button
            onClick={(e) => { e.stopPropagation(); setFollowupOpen(f => !f) }}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-warning/10 border border-warning/20 rounded-lg hover:bg-warning/20 transition-colors"
          >
            <span className="text-[10px]">📬</span>
            <span className="text-[10px] font-semibold text-warning">
              {followupOpen ? 'Hide follow-up ↑' : 'Follow-up ready →'}
            </span>
          </button>
        )}
        {/* Days-in-stage badge */}
        {stale && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border ${stale.bg} ${stale.text} ${stale.border}`}>
            {stale.label}
          </span>
        )}
      </div>

      {/* Follow-up message panel */}
      {hasFollowUp && followupOpen && (
        <div className="mb-2 p-2.5 bg-warning/5 border border-warning/15 rounded-xl">
          <p className="text-[10px] font-semibold text-warning mb-1.5 uppercase tracking-wide">Follow-up message</p>
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap line-clamp-4">
            {opp.follow_up_message}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); handleCopyFollowup() }}
            className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-warning hover:text-warning/80 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
              <rect x="5" y="5" width="9" height="9" rx="1.5" /><path d="M2 11V2h9" strokeLinecap="round"/>
            </svg>
            Copy message
          </button>
        </div>
      )}

      {opp.target_name && (
        <p className="text-xs font-medium text-text-secondary mb-1">{opp.target_name}</p>
      )}
      <p className="text-xs text-text-muted leading-relaxed line-clamp-2 mb-2">
        {truncate(opp.target_context, 80)}
      </p>
      {opp.marked_sent_at && (
        <p className="text-[10px] text-text-muted">Sent {timeAgo(opp.marked_sent_at)}</p>
      )}
      {opp.deal_value_usd && (
        <p className="text-[10px] font-semibold text-success mt-0.5">{formatDollars(opp.deal_value_usd)}</p>
      )}
    </>
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="bg-surface-panel border border-surface-border rounded-xl p-3.5 transition-all hover:border-surface-mid"
    >
      {/* Drag handle area — desktop only */}
      <div
        {...listeners}
        className="hidden md:block cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <PlatformBadge platform={opp.platform} />
          <div className="w-20 shrink-0">
            <ScoreBar score={parseFloat(opp.composite_score || 0)} size="sm" />
          </div>
        </div>
        <CardMeta />
      </div>

      {/* Mobile view — not draggable, tap ⋯ to move */}
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-2 mb-2">
          <PlatformBadge platform={opp.platform} />
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-16">
              <ScoreBar score={parseFloat(opp.composite_score || 0)} size="sm" />
            </div>
            {/* Move button */}
            <button
              onClick={(e) => { e.stopPropagation(); setPickerOpen(p => !p) }}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-card border border-surface-border text-text-muted hover:text-text-secondary hover:border-primary/40 transition-all"
              title="Move to stage"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <CardMeta />

        {/* Inline stage picker */}
        {pickerOpen && (
          <StagePicker
            currentStage={opp.stage}
            onSelect={(stage) => { onMoveStage(opp.id, stage); setPickerOpen(false) }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

// ── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ stage, opps, onMoveStage }) {
  const color = STAGE_COLORS[stage]
  const label = STAGE_LABELS[stage]

  // UI-01: Sort by days_in_stage descending within each column
  // (most stale deals surface to the top so founders act on the right ones)
  const sorted = [...opps].sort((a, b) => {
    const dA = daysInStage(a.last_stage_changed_at) ?? -1
    const dB = daysInStage(b.last_stage_changed_at) ?? -1
    return dB - dA
  })

  // UI-05: Total deal value for this column
  const columnValue = opps.reduce((sum, o) => sum + (o.deal_value_usd || 0), 0)

  return (
    <div className="flex flex-col w-[240px] shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-text-secondary">{label}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {columnValue > 0 && (
            <span className="text-[10px] font-semibold text-success">{formatDollars(columnValue)}</span>
          )}
          <span className="text-xs text-text-muted bg-surface-border px-2 py-0.5 rounded-full">
            {opps.length}
          </span>
        </div>
      </div>

      <SortableContext items={sorted.map(o => o.id)} strategy={verticalListSortingStrategy}>
        <div className={`flex-1 space-y-2 min-h-[120px] p-2 rounded-xl border-2 border-dashed transition-colors ${opps.length === 0 ? 'border-surface-border' : 'border-transparent'}`}>
          {sorted.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-xs text-text-muted text-center">
              Drop leads here
            </div>
          ) : (
            sorted.map(opp => (
              <PipelineCard key={opp.id} opp={opp} onMoveStage={onMoveStage} />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PipelinePage() {
  const { data, isLoading } = usePipeline()
  const updateStage = useUpdateStage()
  const createEvent  = useCreateEvent()
  const [activeId, setActiveId]         = useState(null)
  const [calendarModal, setCalendarModal] = useState(null)
  const [eventForm, setEventForm]       = useState({ title: '', event_date: '', notes: '' })
  const [eventLoading, setEventLoading] = useState(false)

  // UI-04: Lost reason modal state — stores the pending move until reason is provided
  const [lostReasonPending, setLostReasonPending] = useState(null) // { id, targetStage }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const pipeline = data?.pipeline || {}
  const metrics  = data?.metrics  || {}

  const allOpps    = Object.values(pipeline).flat()
  const getStageOpps = (stage) => pipeline[stage] || []
  const findOpp      = (id)    => allOpps.find(o => o.id === id)
  const findStage    = (id)    => findOpp(id)?.stage

  // Core move handler — called by both DnD and mobile picker
  const handleMoveStage = async (id, targetStage) => {
    const currentStage = findStage(id)
    if (!currentStage || currentStage === targetStage) return

    // UI-03: Stage regression warning
    const currentIdx = STAGE_ORDER.indexOf(currentStage)
    const targetIdx  = STAGE_ORDER.indexOf(targetStage)
    if (currentIdx > 0 && targetIdx >= 0 && targetIdx < currentIdx) {
      const ok = window.confirm(
        `Moving this deal backward to "${STAGE_LABELS[targetStage]}". Continue?`
      )
      if (!ok) return
    }

    // UI-04: Intercept closed_lost — collect reason first
    if (targetStage === PIPELINE_STAGES.CLOSED_LOST) {
      setLostReasonPending({ id, targetStage })
      return
    }

    await commitMove(id, targetStage)
  }

  // Executes the actual API call + side effects after any pre-checks pass
  const commitMove = async (id, targetStage, lostReason = null) => {
    const opp = findOpp(id)
    await updateStage.mutateAsync({ id, stage: targetStage, lost_reason: lostReason })
    if (targetStage === PIPELINE_STAGES.CALL_DEMO && opp) {
      setCalendarModal(opp)
      setEventForm({
        title:          `Call with ${opp.target_name || opp.platform || 'prospect'}`,
        event_date:     '',
        event_type:     'call',
        notes:          '',
        opportunity_id: opp.id,
      })
    }
  }

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    let targetStage = null
    for (const stage of STAGES) {
      if (getStageOpps(stage).some(o => o.id === over.id)) {
        targetStage = stage; break
      }
    }
    if (targetStage) await handleMoveStage(active.id, targetStage)
  }

  const handleCreateEvent = async () => {
    if (!eventForm.event_date) { toast.error('Please pick a date'); return }
    setEventLoading(true)
    try {
      await createEvent.mutateAsync(eventForm)
      setCalendarModal(null)
    } catch {
      toast.error('Failed to create event')
    } finally {
      setEventLoading(false)
    }
  }

  const activeOpp = activeId ? allOpps.find(o => o.id === activeId) : null
  const lostOpp   = lostReasonPending ? findOpp(lostReasonPending.id) : null

  return (
    <>
      <TopBar title="Pipeline" />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="p-6 pb-4 shrink-0">
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-card border border-surface-border rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">Closed Revenue</p>
              <p className="text-xl font-bold font-display text-success">
                {formatDollars(metrics.total_revenue || 0)}
              </p>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">Pipeline Value</p>
              <p className="text-xl font-bold font-display text-primary-glow">
                {formatDollars(metrics.pipeline_value || 0)}
              </p>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">Win Rate</p>
              <p className="text-xl font-bold font-display text-text-primary">
                {metrics.win_rate_pct || 0}%
              </p>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-xl p-4">
              <p className="text-xs text-text-muted mb-1">Active Deals</p>
              <p className="text-xl font-bold font-display text-text-primary">
                {allOpps.filter(o => !['closed_won', 'closed_lost'].includes(o.stage)).length}
              </p>
            </div>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 overflow-x-auto">
          <div className="px-6 pb-6 min-w-max">
            {isLoading ? (
              <div className="flex gap-5 pt-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-[240px] shrink-0 space-y-3">
                    <div className="h-6 skeleton rounded-lg w-28" />
                    {[...Array(2)].map((_, j) => <SkeletonCard key={j} lines={3} />)}
                  </div>
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={({ active }) => setActiveId(active.id)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <div className="flex gap-5 pt-2">
                  {STAGES.map(stage => (
                    <KanbanColumn
                      key={stage}
                      stage={stage}
                      opps={getStageOpps(stage)}
                      onMoveStage={handleMoveStage}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {activeOpp && (
                    <div className="bg-surface-panel border border-primary/40 rounded-xl p-3.5 shadow-glow w-[240px] rotate-1">
                      <PlatformBadge platform={activeOpp.platform} />
                      <p className="text-xs text-text-muted mt-2 line-clamp-2">
                        {truncate(activeOpp.target_context, 60)}
                      </p>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      {/* Schedule call modal */}
      <Modal
        isOpen={!!calendarModal}
        onClose={() => setCalendarModal(null)}
        title="Schedule a call?"
        size="sm"
      >
        <ModalBody>
          <p className="text-sm text-text-muted mb-4">
            You moved this to Call/Demo. Want to add it to your calendar?
          </p>
          <div className="space-y-3">
            <Input
              label="Event title"
              value={eventForm.title}
              onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
            />
            <Input
              label="Date & time"
              type="datetime-local"
              value={eventForm.event_date}
              onChange={e => setEventForm({ ...eventForm, event_date: e.target.value })}
            />
            <Input
              label="Notes (optional)"
              value={eventForm.notes}
              onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
              placeholder="Context, prep notes…"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setCalendarModal(null)}>Skip</Button>
          <Button onClick={handleCreateEvent} loading={eventLoading}>Add to calendar</Button>
        </ModalFooter>
      </Modal>

      {/* UI-04: Lost Reason modal */}
      {lostReasonPending && lostOpp && (
        <LostReasonModal
          opp={lostOpp}
          onConfirm={async (reason) => {
            await commitMove(lostReasonPending.id, lostReasonPending.targetStage, reason)
            setLostReasonPending(null)
          }}
          onSkip={async () => {
            await commitMove(lostReasonPending.id, lostReasonPending.targetStage, null)
            setLostReasonPending(null)
          }}
        />
      )}
    </>
  )
}
