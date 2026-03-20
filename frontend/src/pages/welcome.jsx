// src/pages/welcome.jsx
// ============================================================
// FIRST-WIN ONBOARDING FLOW  (Audit §9.4)
// Shown immediately after onboarding completes.
//
// Flow:
//   searching → found → sent → celebrating → /dashboard
//   (or skip → /dashboard at any point)
//
// The /opportunities/refresh is already fired in Step3.handleComplete
// before navigation lands here, so Perplexity is already running.
// We just poll until the first lead appears (up to 50s).
// ============================================================

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const POLL_INTERVAL_MS = 3000
const MAX_POLLS        = 17   // ~50s total

// ── Tiny animated step tracker ───────────────────────────────────────────────
function SearchSteps({ step }) {
  const steps = ['Scanning platforms', 'Scoring relevance', 'Crafting your message']
  return (
    <div className="space-y-2 w-full max-w-xs">
      {steps.map((label, i) => (
        <div key={i} className={`flex items-center gap-2.5 transition-opacity duration-500 ${i < step ? 'opacity-100' : 'opacity-30'}`}>
          <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${
            i < step - 1
              ? 'bg-success/20 border border-success/40'
              : i === step - 1
                ? 'bg-primary/20 border border-primary/40'
                : 'bg-surface-border border border-surface-border'
          }`}>
            {i < step - 1 ? (
              <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 text-success">
                <path d="M10 3L5 8.5L2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            ) : i === step - 1 ? (
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            ) : null}
          </div>
          <p className={`text-xs font-medium ${i < step ? 'text-text-secondary' : 'text-text-muted'}`}>{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Platform badge ────────────────────────────────────────────────────────────
function PlatformBadge({ platform }) {
  const map = {
    linkedin:     { label: 'LinkedIn',     color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    twitter:      { label: 'Twitter / X',  color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
    reddit:       { label: 'Reddit',       color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    hackernews:   { label: 'HN',           color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    indiehackers: { label: 'IndieHackers', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    producthunt:  { label: 'Product Hunt', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  }
  const { label = platform, color = 'bg-surface-border text-text-muted border-surface-border' } =
    map[platform?.toLowerCase()] || {}
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${color}`}>
      {label}
    </span>
  )
}

// ── Confetti burst (pure CSS) ─────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 18 }, (_, i) => i)
  const colors = ['bg-primary', 'bg-success', 'bg-warning', 'bg-error', 'bg-sky-400', 'bg-indigo-400']
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map(i => {
        const left   = `${(i * 5.5) % 100}%`
        const delay  = `${(i * 80) % 600}ms`
        const color  = colors[i % colors.length]
        const size   = i % 3 === 0 ? 'w-3 h-1' : 'w-1.5 h-1.5 rounded-sm'
        return (
          <div
            key={i}
            className={`absolute top-0 ${size} ${color} opacity-0 animate-confetti`}
            style={{ left, animationDelay: delay, animationDuration: `${900 + (i % 4) * 200}ms` }}
          />
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WelcomePage() {
  const navigate  = useNavigate()
  const [phase, setPhase]       = useState('searching') // searching | found | sent | celebrating
  const [opportunity, setOpp]   = useState(null)
  const [searchStep, setStep]   = useState(1)
  const [copied, setCopied]     = useState(false)
  const [sending, setSending]   = useState(false)
  const polls  = useRef(0)
  const timer  = useRef(null)

  // ── Poll for first opportunity ─────────────────────────────────────────────
  useEffect(() => {
    // Advance search steps visually
    const stepTimer = setTimeout(() => setStep(2), 2000)
    const stepTimer2 = setTimeout(() => setStep(3), 5000)

    const poll = async () => {
      polls.current++
      try {
        const { data } = await api.get('/opportunities', { params: { status: 'active', limit: 1 } })
        const opp = data.opportunities?.[0]
        if (opp) {
          setOpp(opp)
          setPhase('found')
          return // stop polling
        }
      } catch { /* ignore */ }

      if (polls.current >= MAX_POLLS) {
        // Timed out — go to dashboard anyway
        navigate('/dashboard', { replace: true })
        return
      }

      timer.current = setTimeout(poll, POLL_INTERVAL_MS)
    }

    timer.current = setTimeout(poll, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(stepTimer)
      clearTimeout(stepTimer2)
      clearTimeout(timer.current)
    }
  }, [navigate])

  const handleCopy = () => {
    if (!opportunity?.prepared_message) return
    navigator.clipboard.writeText(opportunity.prepared_message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSent = async () => {
    setSending(true)
    try {
      await api.put(`/opportunities/${opportunity.id}/sent`)
    } catch { /* non-critical */ }
    setSending(false)
    setPhase('sent')
    setTimeout(() => setPhase('celebrating'), 1600)
  }

  const handleSkip = () => navigate('/dashboard', { replace: true })

  const handleDashboard = () => navigate('/dashboard', { replace: true })

  // ── PHASE: searching ───────────────────────────────────────────────────────
  if (phase === 'searching') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md text-center space-y-8 animate-fade-in-up">
          {/* Spinner */}
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-primary/10" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-2xl">🔍</div>
          </div>

          <div>
            <h1 className="text-2xl font-bold font-display text-text-primary mb-1">
              Finding your first lead…
            </h1>
            <p className="text-sm text-text-muted">
              Clutch is scanning the web for people who need exactly what you built.
            </p>
          </div>

          <div className="flex justify-center">
            <SearchSteps step={searchStep} />
          </div>

          <button
            onClick={handleSkip}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors underline-offset-2 hover:underline mt-4"
          >
            Skip and go to dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── PHASE: found ───────────────────────────────────────────────────────────
  if (phase === 'found' && opportunity) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5 animate-fade-in-up">

          {/* Header */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎯</span>
            </div>
            <h1 className="text-2xl font-bold font-display text-text-primary">Your first lead is ready</h1>
            <p className="text-sm text-text-muted mt-1">
              Clutch found someone who looks like your ideal customer. Here's their story and a message to send.
            </p>
          </div>

          {/* Lead context */}
          <div className="bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <PlatformBadge platform={opportunity.platform} />
              {opportunity.target_name && (
                <span className="text-xs text-text-muted font-medium">{opportunity.target_name}</span>
              )}
            </div>
            <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
              {opportunity.target_context}
            </p>
          </div>

          {/* Prepared message */}
          <div className="bg-primary/5 border border-primary/25 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-primary-glow font-semibold">✨ Your AI-crafted message</p>
              <button
                onClick={handleCopy}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all duration-200 ${
                  copied
                    ? 'bg-success/15 text-success border border-success/25'
                    : 'bg-primary/10 text-primary-glow hover:bg-primary/20 border border-primary/20'
                }`}
              >
                {copied ? 'Copied! ✓' : 'Copy message'}
              </button>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed italic">
              "{opportunity.prepared_message}"
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <button
              onClick={handleSent}
              disabled={sending}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold text-sm py-3.5 rounded-xl transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {sending ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Marking as sent…</>
              ) : (
                <>📤 I sent it!</>
              )}
            </button>

            <button
              onClick={handleSkip}
              className="w-full bg-surface-card border border-surface-border hover:border-primary/30 text-text-muted hover:text-text-secondary text-sm font-medium py-2.5 rounded-xl transition-all duration-200"
            >
              Go to dashboard first →
            </button>
          </div>

          <p className="text-center text-xs text-text-muted">
            This message was generated in your voice using the profile you just built.
          </p>
        </div>
      </div>
    )
  }

  // ── PHASE: sent (brief transition) ────────────────────────────────────────
  if (phase === 'sent') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="text-center space-y-4 animate-fade-in-up">
          <div className="w-20 h-20 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-9 h-9 text-success">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-lg font-bold font-display text-text-primary">Message sent 🚀</p>
          <p className="text-sm text-text-muted max-w-xs">
            You just did something most people never do.
          </p>
        </div>
      </div>
    )
  }

  // ── PHASE: celebrating ────────────────────────────────────────────────────
  if (phase === 'celebrating') {
    return (
      <div className="relative min-h-screen bg-background flex flex-col items-center justify-center p-8 overflow-hidden">
        <Confetti />

        <div className="relative text-center space-y-6 animate-fade-in-up max-w-md">
          {/* Trophy */}
          <div className="text-6xl mb-2 animate-bounce">🏆</div>

          <div>
            <h1 className="text-3xl font-bold font-display text-text-primary mb-2">
              First outreach sent.
            </h1>
            <p className="text-text-muted text-sm leading-relaxed max-w-sm mx-auto">
              You just reached out to a potential customer with an AI-crafted message tailored to your exact value proposition. That's how momentum starts.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: '1', label: 'Lead found' },
              { value: '1', label: 'Message sent' },
              { value: '∞', label: 'Potential ahead' },
            ].map(({ value, label }) => (
              <div key={label} className="bg-surface-card border border-surface-border rounded-xl p-4">
                <p className="text-2xl font-bold font-display text-primary">{value}</p>
                <p className="text-xs text-text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-surface-panel border border-surface-border rounded-xl p-4 text-left">
            <p className="text-xs text-primary-glow font-medium mb-1.5">What Clutch does every day</p>
            <ul className="space-y-1">
              {[
                'Finds new leads matching your ICP',
                'Writes personalized messages in your voice',
                'Tracks your pipeline and outcomes',
                'Coaches you with daily check-ins and tips',
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-success shrink-0 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handleDashboard}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-sm py-4 rounded-xl transition-all duration-200 shadow-lg shadow-primary/25"
          >
            Go to your dashboard →
          </button>
        </div>
      </div>
    )
  }

  return null
}
