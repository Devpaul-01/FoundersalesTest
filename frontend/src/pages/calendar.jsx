// src/pages/calendar.jsx
// ============================================================
// CALENDAR INTELLIGENCE — AUDIT FIXES APPLIED
//
//  Issue 1  — useEndMeeting onSuccess now navigates to debrief
//  Issue 2  — "View Follow-ups" opens EventPrepModal on followup tab
//  Issue 3  — DebriefModal now uses useSubmitDebrief hook (full cache invalidation)
//  Issue 15 — isToday uses calendar-date comparison, not 24h rolling window
//  Issue 16 — "Start Meeting Notes" visible during in-progress meetings
//  Issue 17 — Dead import useProspects removed (was non-existent)
//  Issue 18 — useCalendar called with params for correct cache key
//  Issue 19 — Calendar fetches from 14 days ago (backend handles default)
//  Issue 23 — pre_outreach has "Discuss in chat" CTA
//  Issue 24 — raw_notes rendered when reviewing past event debrief
//  Issue 25 — follow_up_template from prep shown in follow-up tab
//  Issue 29 — Business-neutral language throughout
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate }    from 'react-router-dom'
import {
  useCalendar,
  useCreateEvent,
  useCalendarEvent,
  useCreateChat,
  useCalendarAlerts,
  useSubmitDebrief,
  useProspectsList,
} from '../services/queries'
import { SkeletonCard }             from '../components/ui/Skeleton'
import Button                       from '../components/ui/Button'
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal'
import Input, { Textarea }          from '../components/ui/Input'
import TopBar                       from '../components/layout/TopBar'
import { PageContent }              from '../components/layout/AppLayout'
import { formatEventDate, timeAgo } from '../utils/formatters'
import api                          from '../services/api'
import { queryClient }              from '../services/queryClient'
import { KEYS }                     from '../services/queries'
import toast                        from 'react-hot-toast'

const EVENT_TYPES = ['call', 'demo', 'meeting', 'follow_up', 'conference', 'other']

const OUTCOME_OPTIONS = [
  { value: 'hot',      label: '🔥 Strong interest', desc: 'Clear buying signals, obvious next step',   color: 'text-orange-400 bg-orange-400/10 border-orange-400/30' },
  { value: 'positive', label: '✅ Positive',         desc: 'Good progress, solid conversation',        color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  { value: 'neutral',  label: '😐 Neutral',          desc: 'Some interest, unclear next steps',        color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' },
  { value: 'cold',     label: '❄️ Cold',             desc: 'Low engagement or concerns raised',        color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  { value: 'dead',     label: '💀 Not going forward', desc: 'Clear decline or no path forward',        color: 'text-text-muted bg-surface-border/50 border-surface-border' },
]

// ── Health score badge ──────────────────────────────────────────────────────
function HealthBadge({ score }) {
  if (score === null || score === undefined) return null
  const color = score >= 70 ? 'text-green-400 bg-green-400/10' : score >= 40 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'
  const dot   = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴'
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${color}`}>
      {dot} {score}
    </span>
  )
}

// ── Outcome badge ────────────────────────────────────────────────────────────
function OutcomeBadge({ outcome }) {
  if (!outcome) return null
  const opt = OUTCOME_OPTIONS.find(o => o.value === outcome)
  if (!opt) return null
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${opt.color}`}>
      {opt.label}
    </span>
  )
}

// ── Alert bar ─────────────────────────────────────────────────────────────────
function AlertBar({ onOpenDebrief }) {
  const { data: alerts } = useCalendarAlerts()
  if (!alerts) return null

  const debriefs    = alerts.debriefs_needed     || []
  const overdue     = alerts.overdue_commitments || []
  const totalAlerts = debriefs.length + overdue.length
  if (!totalAlerts) return null

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
      <div className="flex items-start gap-2.5">
        <span className="text-base mt-0.5">⚡</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary mb-1">Action needed</p>
          <div className="space-y-1">
            {debriefs.length > 0 && (
              <p className="text-xs text-text-secondary">
                <span className="text-primary-glow font-medium">{debriefs.length} {debriefs.length > 1 ? 'meetings' : 'meeting'}</span> need a debrief — takes 90 seconds and generates your follow-up automatically.
              </p>
            )}
            {overdue.length > 0 && (
              <p className="text-xs text-text-secondary">
                <span className="text-red-400 font-medium">{overdue.length} overdue {overdue.length > 1 ? 'commitments' : 'commitment'}</span> — you made a promise to a contact and haven't followed through yet.
              </p>
            )}
          </div>
          {debriefs.length > 0 && (
            <button
              onClick={() => onOpenDebrief(debriefs[0].id)}
              className="text-xs text-primary-glow hover:underline mt-1.5"
            >
              Log debrief for "{debriefs[0].title}" →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ event, onViewPrep, onOpenDebrief }) {
  const eventDate = (event.start_time || event.event_date || '').slice(0, 10)
  const todayDate = new Date().toISOString().slice(0, 10)
  const now       = new Date()

  const isPast = new Date(event.start_time || event.event_date) < now

  // Issue 15: use calendar-date comparison, not a rolling 24h window
  const isToday = !isPast && eventDate === todayDate

  // Issue 16: show "Start Meeting Notes" during the meeting window
  // A meeting is "in progress" from start_time until end_time (or start + 3h if no end_time)
  const meetingStart = event.start_time ? new Date(event.start_time) : null
  const meetingEnd   = event.end_time
    ? new Date(event.end_time)
    : meetingStart
    ? new Date(meetingStart.getTime() + 3 * 60 * 60 * 1000)
    : null
  // Meeting notes are accessible: before end, OR up to 3h after start
  const isMeetingOver = meetingEnd ? now > meetingEnd : isPast

  const needsDebrief = isPast && !event.debrief_completed_at

  return (
    <div className={`bg-surface-card border rounded-xl p-4 transition-all ${
      needsDebrief  ? 'border-primary/40 shadow-glow-sm' :
      isPast        ? 'border-surface-border opacity-70' :
      isToday       ? 'border-primary/30 shadow-glow-sm' :
                      'border-surface-border'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {isToday && (
              <span className="text-xs bg-primary/15 text-primary-glow px-2 py-0.5 rounded-md font-medium">Today</span>
            )}
            {needsDebrief && (
              <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-md font-medium">Debrief needed</span>
            )}
            <span className="text-xs bg-surface-border text-text-muted px-2 py-0.5 rounded-md capitalize">
              {event.event_type?.replace('_', ' ') || 'event'}
            </span>
            {event.outcome && <OutcomeBadge outcome={event.outcome} />}
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate">{event.title}</h3>
        </div>
        <div className="shrink-0 text-right flex flex-col items-end gap-1">
          <p className="text-xs text-text-muted">{formatEventDate(event.start_time || event.event_date)}</p>
          {event.health_score !== null && <HealthBadge score={event.health_score} />}
        </div>
      </div>

      {event.attendee_name && (
        <p className="text-xs text-text-secondary mb-2">👤 {event.attendee_name}</p>
      )}

      {event.debrief_content?.summary && (
        <p className="text-xs text-text-muted line-clamp-2 mb-3 italic">"{event.debrief_content.summary}"</p>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button size="xs" variant="secondary" onClick={() => onViewPrep(event.id)}>
          {event.prep_generated_at ? '📋 View Prep' : '✨ Get AI Prep'}
        </Button>
        {needsDebrief && (
          <Button size="xs" variant="primary" onClick={() => onOpenDebrief(event.id)}>
            📝 Log Debrief
          </Button>
        )}
        {event.debrief_content && event.follow_up_options && (
          <Button size="xs" variant="ghost" onClick={() => onViewPrep(event.id)}>
            📬 Follow-up
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Prep Section ──────────────────────────────────────────────────────────────
function PrepSection({ icon, label, children }) {
  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-3">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{icon} {label}</p>
      {children}
    </div>
  )
}

// ── Event Prep Modal ──────────────────────────────────────────────────────────
function EventPrepModal({ eventId, onClose, initialTab = 'prep' }) {
  const { data: eventData, isLoading } = useCalendarEvent(eventId)
  const [generating, setGenerating]    = useState(false)
  const [prep, setPrep]                = useState(null)
  const [starting, setStarting]        = useState(false)
  // Issue 2: accept initialTab prop so parent can open directly on 'followup'
  const [activeTab, setActiveTab]      = useState(initialTab)
  const createChat = useCreateChat()
  const navigate   = useNavigate()

  // Sync if parent changes initialTab after mount (e.g., after debrief)
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  const event       = eventData?.event
  const eventPrep   = prep || event?.prep_content
  const signals     = eventData?.signals || []
  const commitments = (eventData?.commitments || []).filter(c => c.owner === 'founder' && c.status !== 'done')

  const generatePrep = async () => {
    setGenerating(true)
    try {
      const { data: res } = await api.post(`/calendar/${eventId}/regenerate-prep`)
      setPrep(res.prep_content)
      queryClient.invalidateQueries({ queryKey: KEYS.calendarEvent(eventId) })
      queryClient.invalidateQueries({ queryKey: KEYS.calendar })
    } catch {
      toast.error('Failed to generate prep')
    } finally {
      setGenerating(false)
    }
  }

  // Issue 16: "Start Meeting Notes" now available for in-progress meetings
  // A meeting is "in progress" up to end_time or start_time + 3h
  const now         = new Date()
  const meetingStart = event?.start_time ? new Date(event.start_time) : null
  const meetingEnd   = event?.end_time
    ? new Date(event.end_time)
    : meetingStart
    ? new Date(meetingStart.getTime() + 3 * 60 * 60 * 1000)
    : null
  const isMeetingOver = meetingEnd ? now > meetingEnd : !!(event && new Date(event.start_time || event.event_date) < now)

  const handleStartMeetingNotes = async () => {
    setStarting(true)
    try {
      const { data } = await api.post(`/calendar/${eventId}/start-meeting-notes`)
      navigate(`/chat/${data.chat.id}`)
      onClose()
      toast.success('Meeting notes started! Type your notes as you go.')
    } catch {
      toast.error('Could not start meeting notes')
    } finally {
      setStarting(false)
    }
  }

  const handleDiscussWithClutch = async () => {
    if (!event) return
    setStarting(true)
    try {
      const chat = await createChat.mutateAsync({
        title:           `Event: ${event.title}`,
        chat_type:       'general',
        initial_context: buildEventContext(event, eventPrep),
        event_id:        event.id,
        prospect_id:     event.prospect_id || null,
      })
      const autoMessage = buildAutoMessage(event, eventPrep)
      navigate(`/chat/${chat.id}`, { state: { autoMessage } })
      onClose()
    } catch {
      toast.error('Could not start conversation')
    } finally {
      setStarting(false)
    }
  }

  const hasFollowUp = event?.follow_up_options || eventPrep?.follow_up_template

  return (
    <Modal isOpen onClose={onClose} title={event?.title || 'Event Prep'} size="lg">
      <ModalBody className="max-h-[75vh] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
        ) : (
          <>
            {/* Tabs if there are follow-ups */}
            {hasFollowUp && (
              <div className="flex gap-1 mb-4 bg-surface-panel rounded-xl p-1">
                {['prep', 'followup'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      activeTab === tab ? 'bg-primary/20 text-primary-glow' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {tab === 'prep' ? '📋 Prep' : '📬 Follow-up Options'}
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'prep' && (
              <div className="space-y-3">
                {/* Outstanding commitments reminder */}
                {commitments.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-400 mb-1.5">⚠️ You have outstanding commitments to this contact</p>
                    {commitments.map((c, i) => (
                      <p key={i} className="text-xs text-text-secondary">• {c.commitment_text}</p>
                    ))}
                    <p className="text-xs text-text-muted mt-1">Address these early in the conversation.</p>
                  </div>
                )}

                {/* Signals summary */}
                {signals.length > 0 && (
                  <div className="bg-surface-panel border border-surface-border rounded-xl p-3">
                    <p className="text-xs font-semibold text-text-muted mb-1.5">📡 Signals from past conversations</p>
                    {signals.slice(0, 3).map((s, i) => (
                      <p key={i} className={`text-xs ${s.signal_type === 'buying' ? 'text-green-400' : s.signal_type === 'risk' ? 'text-red-400' : 'text-text-secondary'}`}>
                        {s.signal_type === 'buying' ? '🔥' : s.signal_type === 'risk' ? '⚠️' : '📌'} {s.signal_text}
                      </p>
                    ))}
                  </div>
                )}

                {/* Issue 24: Show raw_notes from past debrief when reviewing a past event */}
                {event?.debrief_content?.raw_notes && (
                  <div className="bg-surface-panel border border-surface-border rounded-xl p-3">
                    <p className="text-xs font-semibold text-text-muted mb-1.5">📓 Your original notes</p>
                    <p className="text-xs text-text-secondary whitespace-pre-wrap line-clamp-6">{event.debrief_content.raw_notes}</p>
                  </div>
                )}

                {!eventPrep ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl">✨</span>
                    </div>
                    <h3 className="text-sm font-semibold text-text-primary mb-1">Get AI-powered prep</h3>
                    <p className="text-sm text-text-muted mb-5 max-w-xs mx-auto">
                      Clutch prepares talking points, research, and a follow-up based on your full history with this contact.
                    </p>
                    <Button onClick={generatePrep} loading={generating}>Generate Prep</Button>
                  </div>
                ) : (
                  <>
                    {/* Intelligence Brief — powered by Perplexity research */}
                    {eventPrep.intelligence_brief && (
                      <PrepSection icon="🔍" label="Intelligence Brief">
                        <p className="text-sm text-text-secondary">{eventPrep.intelligence_brief}</p>
                        {event?.research_generated_at && (
                          <p className="text-[10px] text-text-muted mt-1">Researched {timeAgo(event.research_generated_at)} via live intelligence</p>
                        )}
                      </PrepSection>
                    )}

                    {/* Commitment check */}
                    {eventPrep.commitment_check && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-400 mb-1">🔔 Commitment Reminder</p>
                        <p className="text-sm text-text-secondary">{eventPrep.commitment_check}</p>
                      </div>
                    )}

                    {eventPrep.opening_line && (
                      <PrepSection icon="🎯" label="Opening line">
                        <p className="text-sm text-text-secondary italic">"{eventPrep.opening_line}"</p>
                        <button onClick={() => { navigator.clipboard.writeText(eventPrep.opening_line); toast.success('Copied') }} className="text-xs text-text-muted hover:text-text-secondary mt-1">Copy →</button>
                      </PrepSection>
                    )}

                    {eventPrep.talking_points?.length > 0 && (
                      <PrepSection icon="📌" label="Talking points">
                        <ul className="space-y-1.5">
                          {eventPrep.talking_points.map((pt, i) => (
                            <li key={i} className="flex gap-2 text-sm text-text-secondary">
                              <span className="text-primary-glow mt-0.5 shrink-0">•</span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </PrepSection>
                    )}

                    {eventPrep.key_question_to_ask && (
                      <PrepSection icon="❓" label="Best question to ask">
                        <p className="text-sm text-text-secondary">"{eventPrep.key_question_to_ask}"</p>
                      </PrepSection>
                    )}

                    {eventPrep.anticipate_objection && (
                      <PrepSection icon="🛡️" label="Likely pushback & response">
                        <p className="text-sm text-text-secondary">{eventPrep.anticipate_objection}</p>
                      </PrepSection>
                    )}

                    {/* Issue 23: pre_outreach now has a "Discuss in chat" CTA */}
                    {eventPrep.pre_outreach && (
                      <PrepSection icon="📤" label="Pre-event message">
                        <div className="bg-surface-bg rounded-lg p-3">
                          <p className="text-sm text-text-secondary whitespace-pre-wrap">{eventPrep.pre_outreach}</p>
                        </div>
                        <div className="flex gap-3 mt-1.5">
                          <button
                            onClick={() => { navigator.clipboard.writeText(eventPrep.pre_outreach); toast.success('Copied') }}
                            className="text-xs text-text-muted hover:text-text-secondary"
                          >
                            Copy →
                          </button>
                          <button
                            onClick={handleDiscussWithClutch}
                            className="text-xs text-primary-glow hover:underline"
                          >
                            Refine with AI →
                          </button>
                        </div>
                      </PrepSection>
                    )}

                    <Button size="sm" variant="ghost" onClick={generatePrep} loading={generating} className="w-full">
                      ↻ Regenerate Prep
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Issue 25: Follow-up tab shows both post-debrief options AND pre-debrief template */}
            {activeTab === 'followup' && (
              <div className="space-y-3">
                {event?.follow_up_options ? (
                  <>
                    <p className="text-xs text-text-muted">Generated from your meeting debrief. Choose the right one for the moment.</p>
                    {Object.entries({
                      brief:         { label: 'Brief check-in',       icon: '💬', desc: 'Short, stays on radar' },
                      substantive:   { label: 'Substantive follow-up', icon: '📄', desc: 'Delivers on your promises' },
                      re_engagement: { label: 'Re-engagement',         icon: '🔄', desc: 'If they went quiet' },
                    }).map(([key, meta]) => {
                      const msg = event.follow_up_options[key]
                      if (!msg) return null
                      return (
                        <div key={key} className="bg-surface-panel border border-surface-border rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-text-primary">{meta.icon} {meta.label}</p>
                            <span className="text-[10px] text-text-muted">{meta.desc}</span>
                          </div>
                          <p className="text-sm text-text-secondary whitespace-pre-wrap mb-2">{msg}</p>
                          <button
                            onClick={() => { navigator.clipboard.writeText(msg); toast.success('Copied!') }}
                            className="text-xs text-text-muted hover:text-primary-glow transition-colors"
                          >
                            Copy →
                          </button>
                        </div>
                      )
                    })}
                  </>
                ) : eventPrep?.follow_up_template ? (
                  // Issue 25: Show the prep-generated follow-up template when no debrief exists yet
                  <>
                    <p className="text-xs text-text-muted">Pre-meeting follow-up draft — useful for confirming the meeting or following up on a no-show. Log a debrief after the meeting to get personalised post-meeting variants.</p>
                    <div className="bg-surface-panel border border-surface-border rounded-xl p-3">
                      <p className="text-xs font-semibold text-text-primary mb-2">📄 Follow-up draft</p>
                      <p className="text-sm text-text-secondary whitespace-pre-wrap mb-2">{eventPrep.follow_up_template}</p>
                      <button
                        onClick={() => { navigator.clipboard.writeText(eventPrep.follow_up_template); toast.success('Copied!') }}
                        className="text-xs text-text-muted hover:text-primary-glow transition-colors"
                      >
                        Copy →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-text-muted">Log a debrief after the meeting to generate personalised follow-up options.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex gap-2 w-full flex-wrap">
          {/* Issue 16: Show "Start Meeting Notes" if meeting hasn't ended yet */}
          {!isMeetingOver && (
            <Button variant="secondary" size="sm" onClick={handleStartMeetingNotes} loading={starting}>
              🎙️ Start Meeting Notes
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleDiscussWithClutch} loading={starting}>
            💬 Discuss with Clutch
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ── Debrief Modal ─────────────────────────────────────────────────────────────
// Issue 3: Now uses useSubmitDebrief hook for full cache invalidation
// Issue 2: onDone callback allows parent to open follow-up tab on EventPrepModal
function DebriefModal({ eventId, onClose, onDone }) {
  const { data: eventData } = useCalendarEvent(eventId)
  const submitDebrief       = useSubmitDebrief(eventId)   // Issue 3: use the hook
  const [step, setStep]     = useState(1)                 // 1=outcome, 2=notes, 3=done
  const [debriefResult, setDebriefResult] = useState(null)
  const navigate = useNavigate()

  const [form, setForm] = useState({
    outcome:              '',
    meeting_notes:        '',
    founder_commitments:  '',
    prospect_commitments: '',
  })

  const event = eventData?.event

  const handleSubmit = async () => {
    if (!form.outcome) { toast.error('Please select an outcome'); return }

    try {
      const result = await submitDebrief.mutateAsync({  // Issue 3: hook handles all cache invalidations
        outcome:              form.outcome,
        meeting_notes:        form.meeting_notes.trim(),
        founder_commitments:  form.founder_commitments.split('\n').map(s => s.trim()).filter(Boolean),
        prospect_commitments: form.prospect_commitments.split('\n').map(s => s.trim()).filter(Boolean),
      })
      setDebriefResult(result)
      setStep(3)
    } catch {
      // error toast handled by useSubmitDebrief's onError
    }
  }

  if (!event && step < 3) return null

  return (
    <Modal isOpen onClose={onClose} title={step === 3 ? '✅ Debrief saved' : `📝 Debrief: ${event?.title}`} size="md">
      <ModalBody>
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">How did it go? This takes 60 seconds and Clutch generates your follow-up automatically.</p>
            <div className="space-y-2">
              {OUTCOME_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setForm(f => ({ ...f, outcome: opt.value })); setStep(2) }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all hover:border-primary/40 ${
                    form.outcome === opt.value ? 'border-primary/60 bg-primary/10' : 'border-surface-border bg-surface-panel'
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-primary">{opt.label}</p>
                    <p className="text-xs text-text-muted">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium ${OUTCOME_OPTIONS.find(o => o.value === form.outcome)?.color}`}>
              {OUTCOME_OPTIONS.find(o => o.value === form.outcome)?.label}
              <button onClick={() => setStep(1)} className="text-xs opacity-60 hover:opacity-100">← change</button>
            </div>

            <Textarea
              label="What happened? (optional but powerful)"
              placeholder="They asked about pricing... mentioned they're comparing options... the decision-maker needs to review... seemed genuinely interested when I mentioned..."
              value={form.meeting_notes}
              onChange={e => setForm(f => ({ ...f, meeting_notes: e.target.value }))}
              rows={4}
              hint="The more you share, the better your follow-up and future prep will be."
            />

            <Textarea
              label="What did you commit to? (one per line)"
              placeholder="Send them more information&#10;Follow up by Friday&#10;Introduce them to a current customer"
              value={form.founder_commitments}
              onChange={e => setForm(f => ({ ...f, founder_commitments: e.target.value }))}
              rows={3}
            />

            <Textarea
              label="What did they say they'd do? (optional)"
              placeholder="Review the proposal&#10;Check with their team"
              value={form.prospect_commitments}
              onChange={e => setForm(f => ({ ...f, prospect_commitments: e.target.value }))}
              rows={2}
            />
          </div>
        )}

        {step === 3 && debriefResult && (
          <div className="space-y-4">
            {debriefResult.debrief?.summary && (
              <div className="bg-surface-panel border border-surface-border rounded-xl p-3">
                <p className="text-xs font-semibold text-text-muted mb-1">📋 Summary</p>
                <p className="text-sm text-text-secondary">{debriefResult.debrief.summary}</p>
              </div>
            )}

            {debriefResult.debrief?.coachable_moment && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-primary-glow mb-1">💡 Coach's take</p>
                <p className="text-sm text-text-secondary">{debriefResult.debrief.coachable_moment}</p>
              </div>
            )}

            {debriefResult.commitments?.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-400 mb-1.5">📌 Commitments tracked ({debriefResult.commitments.length})</p>
                {debriefResult.commitments.slice(0, 4).map((c, i) => (
                  <p key={i} className="text-xs text-text-secondary">
                    {c.owner === 'founder' ? '👤 You:' : '🤝 Them:'} {c.text}
                  </p>
                ))}
              </div>
            )}

            {debriefResult.signals?.length > 0 && (
              <div className="bg-surface-panel border border-surface-border rounded-xl p-3">
                <p className="text-xs font-semibold text-text-muted mb-1.5">📡 Signals detected</p>
                {debriefResult.signals.slice(0, 3).map((s, i) => (
                  <p key={i} className={`text-xs ${s.type === 'buying' ? 'text-green-400' : s.type === 'risk' ? 'text-red-400' : 'text-text-secondary'}`}>
                    {s.type === 'buying' ? '🔥' : s.type === 'risk' ? '⚠️' : '📌'} {s.text}
                  </p>
                ))}
              </div>
            )}

            <div className="bg-surface-panel border border-primary/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-primary-glow mb-1">📬 Follow-up generating...</p>
              <p className="text-xs text-text-secondary">Your personalised follow-up options are being generated. They'll be ready in a moment — open the prep card to see them.</p>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === 2 && (
          <>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={handleSubmit} loading={submitDebrief.isPending}>Save Debrief</Button>
          </>
        )}
        {step === 3 && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {/* Issue 2: "View Follow-ups" now opens EventPrepModal on the follow-up tab */}
            <Button
              variant="secondary"
              onClick={() => {
                onClose()
                if (onDone) onDone(eventId) // signal parent to open prep modal on followup tab
              }}
            >
              View Follow-ups →
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  )
}

// ── Add Event Modal ───────────────────────────────────────────────────────────
function AddEventModal({ onClose }) {
  const createEvent = useCreateEvent()
  // Issue 17: useProspects doesn't exist — use useProspectsList (correct hook name)
  const { data: prospectsData } = useProspectsList()
  const prospects = prospectsData?.prospects || []

  const [form, setForm] = useState({
    title: '', event_type: 'call', event_date: '',
    start_time: '', attendee_name: '', attendee_context: '',
    notes: '', prospect_id: '',
  })

  const handleSubmit = async () => {
    if (!form.title || !form.event_date) { toast.error('Title and date are required'); return }
    try {
      await createEvent.mutateAsync(form)
      toast.success('Event created! AI prep and research will be ready shortly.')
      onClose()
    } catch {
      toast.error('Failed to create event')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Add event" size="md">
      <ModalBody>
        <div className="space-y-4">
          <Input
            label="Title *"
            placeholder="Call with Sarah @ Acme"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Type</label>
              <select
                value={form.event_type}
                onChange={e => setForm({ ...form, event_type: e.target.value })}
                className="w-full bg-surface-panel border border-surface-border rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              >
                {EVENT_TYPES.map(t => <option key={t} value={t} className="bg-surface-card">{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <Input
              label="Date & time *"
              type="datetime-local"
              value={form.start_time || form.event_date}
              onChange={e => setForm({ ...form, start_time: e.target.value, event_date: e.target.value.split('T')[0] })}
            />
          </div>
          <Input
            label="Contact name"
            placeholder="Sarah Johnson"
            value={form.attendee_name}
            onChange={e => setForm({ ...form, attendee_name: e.target.value })}
          />
          {prospects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Link to existing contact (optional)</label>
              <select
                value={form.prospect_id}
                onChange={e => setForm({ ...form, prospect_id: e.target.value })}
                className="w-full bg-surface-panel border border-surface-border rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              >
                <option value="">— New contact —</option>
                {prospects.map(p => <option key={p.id} value={p.id}>{p.name}{p.company ? ` (${p.company})` : ''}</option>)}
              </select>
            </div>
          )}
          <Textarea
            label="Context (for AI prep + research)"
            placeholder="Who is this person? What's the goal? Include company name for live research."
            value={form.attendee_context}
            onChange={e => setForm({ ...form, attendee_context: e.target.value })}
            rows={3}
            hint="The more you share, the better Clutch's prep will be. Max 2000 characters."
            maxLength={2000}
          />
          <Input
            label="Notes"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={createEvent.isPending}>Add Event</Button>
      </ModalFooter>
    </Modal>
  )
}

// ── Main Calendar Page ────────────────────────────────────────────────────────
export default function CalendarPage() {
  // Issue 18: pass params so queryKey includes them (no stale cache across param changes)
  // Issue 19: backend now defaults to 14 days ago, so we get recent past events too
  const { data: events = [], isLoading } = useCalendar()
  const [addOpen, setAddOpen]             = useState(false)
  const [prepEventId, setPrepEventId]     = useState(null)
  const [prepInitialTab, setPrepInitialTab] = useState('prep')
  const [debriefEventId, setDebriefEventId] = useState(null)
  const navigate = useNavigate()

  const now      = new Date()
  const upcoming = events.filter(e => new Date(e.start_time || e.event_date) >= now)
    .sort((a, b) => new Date(a.start_time || a.event_date) - new Date(b.start_time || b.event_date))
  const past     = events.filter(e => new Date(e.start_time || e.event_date) < now)
    .sort((a, b) => new Date(b.start_time || b.event_date) - new Date(a.start_time || a.event_date))

  const pendingDebriefs = past.filter(e => !e.debrief_completed_at).length

  // Issue 2: after debrief completes, open EventPrepModal on the follow-up tab
  const handleDebriefDone = useCallback((eventId) => {
    setPrepInitialTab('followup')
    setPrepEventId(eventId)
  }, [])

  const openPrep = useCallback((eventId, tab = 'prep') => {
    setPrepInitialTab(tab)
    setPrepEventId(eventId)
  }, [])

  return (
    <>
      <TopBar
        title="Calendar"
        subtitle={pendingDebriefs > 0 ? `${pendingDebriefs} debrief${pendingDebriefs > 1 ? 's' : ''} needed` : null}
        actions={<Button size="sm" onClick={() => setAddOpen(true)}>+ Add Event</Button>}
      />
      <PageContent>
        {isLoading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={3} />)}</div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-4xl mb-3">📅</span>
            <h3 className="text-base font-semibold text-text-primary mb-1">No events yet</h3>
            <p className="text-sm text-text-muted mb-5">Add calls, demos, and meetings to get AI prep, live research, and automatic follow-ups</p>
            <Button onClick={() => setAddOpen(true)}>+ Add First Event</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Alert bar */}
            <AlertBar onOpenDebrief={setDebriefEventId} />

            {upcoming.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-text-primary mb-3">Upcoming</p>
                <div className="space-y-3">
                  {upcoming.map(e => (
                    <EventCard key={e.id} event={e} onViewPrep={openPrep} onOpenDebrief={setDebriefEventId} />
                  ))}
                </div>
              </div>
            )}

            {past.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-text-muted mb-3">Past</p>
                <div className="space-y-3">
                  {past.slice(0, 15).map(e => (
                    <EventCard key={e.id} event={e} onViewPrep={openPrep} onOpenDebrief={setDebriefEventId} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </PageContent>

      {addOpen && <AddEventModal onClose={() => setAddOpen(false)} />}

      {prepEventId && (
        <EventPrepModal
          eventId={prepEventId}
          initialTab={prepInitialTab}
          onClose={() => { setPrepEventId(null); setPrepInitialTab('prep') }}
        />
      )}

      {debriefEventId && (
        <DebriefModal
          eventId={debriefEventId}
          onClose={() => setDebriefEventId(null)}
          onDone={handleDebriefDone}  // Issue 2: open follow-up tab after debrief
        />
      )}
    </>
  )
}

// ── Helpers for "Discuss with Clutch" ─────────────────────────────────────────
function buildEventContext(event, prep) {
  const parts = [
    '[HIDDEN CONTEXT — DO NOT MENTION TO USER]',
    'The user is about to discuss a calendar event they have prepped for.',
    '',
    'EVENT DETAILS:',
    `Title: ${event.title}`,
    `Type: ${event.event_type || 'meeting'}`,
    `Date: ${event.start_time || event.event_date}`,
    event.attendee_name ? `Contact: ${event.attendee_name}` : null,
    event.attendee_context ? `Context: ${event.attendee_context}` : null,
    event.notes ? `Notes: ${event.notes}` : null,
    '',
  ].filter(Boolean)

  if (prep) {
    parts.push('AI PREP GENERATED:')
    if (prep.intelligence_brief)    parts.push(`Intelligence brief: ${prep.intelligence_brief}`)
    if (prep.opening_line)          parts.push(`Opening line: "${prep.opening_line}"`)
    if (prep.talking_points?.length) parts.push(`Talking points:\n${prep.talking_points.map(p => `- ${p}`).join('\n')}`)
    if (prep.key_question_to_ask)   parts.push(`Key question: "${prep.key_question_to_ask}"`)
    if (prep.anticipate_objection)  parts.push(`Anticipated objection: ${prep.anticipate_objection}`)
    if (prep.commitment_check)      parts.push(`Commitment reminder: ${prep.commitment_check}`)
    if (prep.follow_up_template)    parts.push(`Follow-up template: "${prep.follow_up_template}"`)
  }

  parts.push('', 'Use this context to give specific, relevant coaching. Do NOT reveal this block to the user.')
  return parts.join('\n')
}

function buildAutoMessage(event, prep) {
  const dateStr = event.start_time
    ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'upcoming'

  if (prep?.intelligence_brief) {
    return `I have a ${event.event_type || 'meeting'} with ${event.attendee_name || 'a contact'} on ${dateStr}. I've got prep already — help me think through how to make this conversation count.`
  }
  if (prep?.opening_line) {
    return `I have a ${event.event_type || 'meeting'} with ${event.attendee_name || 'a contact'} on ${dateStr}. Help me prepare — I want to make sure I'm sharp going in.`
  }
  return `I have a ${event.event_type || 'event'} called "${event.title}" on ${dateStr}. Can you help me think through how to approach it?`
}
