// src/pages/feedback.jsx
// ============================================================
// FEEDBACK PAGE — Outcome Logging Form
//
// AUDIT FIXES APPLIED:
//   - Issue 1:  Added PENDING outcome (fully functional)
//   - Issue 2:  Fixed field name: notes → outcome_note
//   - Issue 3/4: Added is_final, scheduled_call, scheduled_call_date,
//                scheduled_call_notes to form
//   - Issue 11: Wires up practice-accepted endpoint on CTA click
//   - Issue 16: Reads and handles practice_suggestion, celebration,
//                analysis_queued from API response
//   - Issue 17: 409-specific error handled via useSubmitFeedback
//   - Issue 18: Guard redirect when opportunity_id is missing
//   - Issue 21: deal_value_usd sent as parseInt (not parseFloat)
// ============================================================

import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSubmitFeedback, useMarkPracticeAccepted } from '../services/queries'
import { useStartPractice } from '../services/queries'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import toast from 'react-hot-toast'

const OUTCOMES = [
  {
    key:      'positive',
    label:    '✅ Got a reply',
    color:    'border-surface-border bg-surface-panel text-text-muted',
    selected: 'border-success bg-success/15 text-success',
  },
  {
    key:      'negative',
    label:    '🚫 No reply / declined',
    color:    'border-surface-border bg-surface-panel text-text-muted',
    selected: 'border-error bg-error/10 text-error',
  },
  {
    key:      'pending',
    label:    '⏳ Waiting for reply',
    color:    'border-surface-border bg-surface-panel text-text-muted',
    selected: 'border-warning bg-warning/10 text-warning',
  },
]

export default function FeedbackPage() {
  const [searchParams]   = useSearchParams()
  const opportunityId    = searchParams.get('opportunity_id')
  const navigate         = useNavigate()

  // Form state
  const [outcome,          setOutcome]          = useState('')
  const [dealValue,        setDealValue]        = useState('')
  const [outcomeNote,      setOutcomeNote]      = useState('')
  const [isFinal,          setIsFinal]          = useState(false)
  const [scheduledCall,    setScheduledCall]    = useState(false)
  const [callDate,         setCallDate]         = useState('')
  const [callNotes,        setCallNotes]        = useState('')

  // Post-submit state — holds the API response when a practice suggestion is shown
  const [practiceResult,   setPracticeResult]   = useState(null)
  const [practiceLoading,  setPracticeLoading]  = useState(false)

  const submitFeedback      = useSubmitFeedback()
  const markPracticeAccepted = useMarkPracticeAccepted()
  const startPractice       = useStartPractice()

  // ── Guard: no opportunity selected ────────────────────────────────────────
  // Issue 18: redirect instead of silently failing on submit
  if (!opportunityId) {
    return (
      <>
        <TopBar title="Log Outcome" backTo="/opportunities" />
        <PageContent>
          <div className="max-w-md flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-4">🔍</span>
            <h2 className="text-lg font-bold text-text-primary mb-2">No opportunity selected</h2>
            <p className="text-sm text-text-muted mb-6">
              Open this page from an opportunity card to log your outcome.
            </p>
            <Button onClick={() => navigate('/opportunities')}>Go to Opportunities</Button>
          </div>
        </PageContent>
      </>
    )
  }

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!outcome) {
      toast.error('Please select an outcome')
      return
    }

    try {
      const data = await submitFeedback.mutateAsync({
        opportunity_id:       opportunityId,
        outcome,
        // Issue 2: correct field name (was: notes)
        outcome_note:         outcomeNote.trim() || undefined,
        // Issue 21: parseInt not parseFloat
        deal_value_usd:       dealValue ? parseInt(dealValue, 10) : undefined,
        // Issue 4: these fields now included
        is_final:             isFinal          || undefined,
        scheduled_call:       scheduledCall    || undefined,
        scheduled_call_date:  scheduledCall && callDate     ? callDate              : undefined,
        scheduled_call_notes: scheduledCall && callNotes    ? callNotes.trim()      : undefined,
      })

      // Issue 16a: Surface practice suggestion (negative outcome)
      if (data.practice_suggestion?.show) {
        setPracticeResult(data.practice_suggestion)
        // Do NOT navigate yet — stay on page to show the CTA
        return
      }

      // Issue 16b: Surface celebration toast (positive outcome)
      if (data.celebration?.show) {
        toast.success(data.celebration.message, { duration: 4000 })
      }

      // Issue 16c: Inform user analysis is running
      if (data.analysis_queued) {
        toast('Clutch is analysing this conversation 🧠', {
          icon:     '🔍',
          duration: 3000,
        })
      }

      // Success for pending outcome
      if (outcome === 'pending') {
        toast("Got it — we'll remind you again when more time passes.")
      }

      navigate('/opportunities')

    } catch {
      // Errors are handled by useSubmitFeedback.onError (including 409)
    }
  }

  // ── Practice CTA handler ───────────────────────────────────────────────────
  // Issue 11: wires up practice-accepted endpoint + starts practice session
  const handleStartPractice = async () => {
    if (!practiceResult) return
    setPracticeLoading(true)
    try {
      // 1. Mark the practice as accepted (non-blocking if it fails)
      await markPracticeAccepted.mutateAsync(opportunityId).catch(() => {})

      // 2. Start the practice session with the detected scenario
      const res = await startPractice.mutateAsync({
        scenario_type: practiceResult.scenario_type || 'polite_decline',
      })

      navigate(`/practice/${res.session_id}`)
    } catch {
      toast.error('Failed to start practice. Try from the Practice page.')
      navigate('/opportunities')
    } finally {
      setPracticeLoading(false)
    }
  }

  const handleSkipPractice = () => {
    navigate('/opportunities')
  }

  // ── Post-submit: Practice Suggestion Screen ────────────────────────────────
  if (practiceResult) {
    return (
      <>
        <TopBar title="Turn This Into a Win" backTo="/opportunities" />
        <PageContent>
          <div className="max-w-md">
            <div className="bg-surface-panel border border-surface-border rounded-2xl p-6 mb-6">
              <h2 className="text-lg font-bold font-display text-text-primary mb-2">
                {practiceResult.title}
              </h2>
              <p className="text-sm text-text-muted leading-relaxed">
                {practiceResult.message}
              </p>
            </div>

            <div className="space-y-3">
              <Button
                fullWidth
                onClick={handleStartPractice}
                loading={practiceLoading}
              >
                🎯 {practiceResult.cta || 'Start Practice Round'}
              </Button>
              <Button
                fullWidth
                variant="ghost"
                onClick={handleSkipPractice}
                disabled={practiceLoading}
              >
                Skip for now
              </Button>
            </div>

            {submitFeedback.data?.encouragement && (
              <p className="mt-6 text-xs text-text-muted text-center italic">
                "{submitFeedback.data.encouragement}"
              </p>
            )}
          </div>
        </PageContent>
      </>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="Log Outcome" backTo="/opportunities" />
      <PageContent>
        <div className="max-w-md">

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-lg font-bold font-display text-text-primary mb-1">
              How did it go?
            </h2>
            <p className="text-sm text-text-muted">
              Logging outcomes helps Clutch learn what works for you.
            </p>
          </div>

          {/* Outcome selector */}
          <div className="space-y-3 mb-6">
            {OUTCOMES.map(o => (
              <button
                key={o.key}
                onClick={() => {
                  setOutcome(o.key)
                  // Reset dependent fields when switching outcome
                  setIsFinal(false)
                  setScheduledCall(false)
                  setCallDate('')
                  setCallNotes('')
                }}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all duration-150 ${
                  outcome === o.key ? o.selected : o.color
                }`}
              >
                <span className="text-sm font-medium">{o.label}</span>
              </button>
            ))}
          </div>

          {/* POSITIVE-specific fields */}
          {outcome === 'positive' && (
            <div className="space-y-4 mb-6 animate-fade-in-up">
              <Input
                label="Deal value (optional)"
                type="number"
                placeholder="0"
                value={dealValue}
                onChange={e => setDealValue(e.target.value)}
                icon={<span className="text-sm text-text-muted">$</span>}
                hint="What's the potential deal worth?"
              />

              {/* Scheduled call toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-primary-glow"
                  checked={scheduledCall}
                  onChange={e => setScheduledCall(e.target.checked)}
                />
                <span className="text-sm text-text-primary">Did they schedule a call or demo?</span>
              </label>

              {scheduledCall && (
                <div className="pl-7 space-y-3 animate-fade-in-up">
                  <Input
                    label="Call date (optional)"
                    type="date"
                    value={callDate}
                    onChange={e => setCallDate(e.target.value)}
                    hint="Adds this to your Clutch Calendar"
                  />
                  <Textarea
                    label="Call notes (optional)"
                    placeholder="What do you want to prepare for this call?"
                    value={callNotes}
                    onChange={e => setCallNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              )}

              {/* Closed won toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-primary-glow"
                  checked={isFinal}
                  onChange={e => setIsFinal(e.target.checked)}
                />
                <span className="text-sm text-text-primary">Mark as closed won 🏆</span>
              </label>
            </div>
          )}

          {/* NEGATIVE-specific fields */}
          {outcome === 'negative' && (
            <div className="space-y-3 mb-6 animate-fade-in-up">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-error"
                  checked={isFinal}
                  onChange={e => setIsFinal(e.target.checked)}
                />
                <span className="text-sm text-text-primary">
                  Close this lead permanently
                  <span className="text-text-muted ml-1 text-xs">(no more follow-up reminders)</span>
                </span>
              </label>
            </div>
          )}

          {/* Notes — shown for all outcomes */}
          {outcome && (
            <Textarea
              label="Notes (optional)"
              placeholder={
                outcome === 'negative'
                  ? "What did they say? What objection came up?"
                  : outcome === 'pending'
                  ? "Any details about where things stand?"
                  : "What worked? What would you do differently?"
              }
              value={outcomeNote}
              onChange={e => setOutcomeNote(e.target.value)}
              rows={3}
              className="mb-6"
              maxLength={1000}
            />
          )}

          <Button
            fullWidth
            onClick={handleSubmit}
            loading={submitFeedback.isPending}
            disabled={!outcome}
          >
            Log Outcome
          </Button>

        </div>
      </PageContent>
    </>
  )
}
