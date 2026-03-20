// src/pages/insights.jsx
// ============================================================
// INSIGHTS — Communication Intelligence Layer
//
// Sections:
// 1. Summary header strip (win rate, composite score, messages analyzed, patterns)
// 2. Practice Priority Nudge — top-of-page #1 focus card (if weakness detected)
// 3. Signal Heat — buying/risk/timing/engagement signals + hot prospects
// 4. Commitments Alert — overdue + due-soon action items
// 5. Weekly Prospect Insights — dismissable prospect_insights cards
// 6. Why You're Losing — AI report (cached 24h, refreshable) [FIXED data shape]
// 7. Communication Patterns — detected patterns with recommendations
// 8. Skill Progression — 12-week composite + dimension chart
// 9. Conversation Autopsies — paginated message-level breakdowns
// 10. Objection Tracker — frequency + practice gap + market intel
// 11. Pitch Diagnostic — on-demand message analyzer [FIXED result unwrap]
// ============================================================

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import {
  useInsightsSummary, useInsightsWhyLosing, useInsightsPatterns,
  useInsightsSkillProgression, useInsightsAutopsies, useInsightsObjections,
  useInsightsAnalyzeMessage,
  useInsightsVelocity,
  useSignalsSummary,
  useCommitmentsSummary,
  useWeeklyInsights,
  useDismissInsight,
} from '../services/queries'
import { ROUTES } from '../utils/constants'
import toast from 'react-hot-toast'
import {
  Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement,
  RadialLinearScale, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Radar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement,
  RadialLinearScale, Title, Tooltip, Legend, Filler)

// ── Helpers ──────────────────────────────────────────────────────────────────
const SCORE_COLOR = (s, max = 10) => {
  const pct = (s / max) * 100
  if (pct >= 75) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  return '#EF4444'
}

const PATTERN_TYPE_META = {
  success_signal: { icon: '✅', label: 'What works',     border: 'border-success/25', bg: 'bg-success/5',  accent: 'text-success' },
  weakness:       { icon: '⚠️', label: 'Weakness found', border: 'border-warning/25', bg: 'bg-warning/5',  accent: 'text-warning' },
  ghost_trigger:  { icon: '👻', label: 'Ghost trigger',  border: 'border-error/25',   bg: 'bg-error/5',    accent: 'text-error' },
  objection_type: { icon: '🎯', label: 'Objection type', border: 'border-primary/25', bg: 'bg-primary/5',  accent: 'text-primary-glow' },
}

const DIMENSION_LABELS = {
  hook_score_avg:            'Hook',
  clarity_score_avg:         'Clarity',
  value_prop_score_avg:      'Value Prop',
  personalization_score_avg: 'Personalization',
  cta_score_avg:             'CTA',
  tone_score_avg:            'Tone',
}

const OBJECTION_ICONS = {
  ghost:       '👻',
  price:       '💰',
  timing:      '⏰',
  trust:       '🤔',
  competition: '⚔️',
  fit:         '🎯',
  other:       '💬',
}

// Maps top_weakness → most relevant practice scenario
const WEAKNESS_TO_SCENARIO = {
  hook:            'ghost',
  personalization: 'skeptical',
  value_prop:      'polite_decline',
  cta:             'price_objection',
  clarity:         'skeptical',
  tone:            'not_right_time',
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, subtitle, children, action, badge }) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{title}</p>
            {badge && (
              <span className="text-[10px] font-semibold bg-primary/10 text-primary-glow px-2 py-0.5 rounded-full">{badge}</span>
            )}
          </div>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── 1. Summary strip ─────────────────────────────────────────────────────────
function SummaryStrip() {
  const { data: summary, isLoading } = useInsightsSummary()

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-2.5 mb-6">
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
    </div>
  )

  const winRate = summary?.positive_rate_30d != null
    ? `${Math.round(summary.positive_rate_30d * 100)}%`
    : '—'

  const stats = [
    { icon: '✉️', label: 'Analyzed',       value: summary?.messages_analyzed ?? 0 },
    { icon: '🏆', label: 'Win rate (30d)',  value: winRate, highlight: summary?.positive_rate_30d >= 0.3 },
    { icon: '📈', label: 'Composite',       value: summary?.composite_score != null ? `${summary.composite_score}/10` : '—', delta: summary?.composite_delta },
    { icon: '🧠', label: 'Patterns',        value: summary?.patterns_count ?? 0 },
  ]

  return (
    <div className="grid grid-cols-2 gap-2.5 mb-6">
      {stats.map(s => (
        <div
          key={s.label}
          className={`bg-surface-card border rounded-xl p-3 text-center ${
            s.highlight ? 'border-success/30 bg-success/5' : 'border-surface-border'
          }`}
        >
          <p className="text-base mb-0.5">{s.icon}</p>
          <div className="flex items-center justify-center gap-1">
            <p className="text-base font-bold font-display text-text-primary">{s.value}</p>
            {s.delta != null && s.delta !== 0 && (
              <span className={`text-[10px] font-semibold ${s.delta > 0 ? 'text-success' : 'text-error'}`}>
                {s.delta > 0 ? '↑' : '↓'}{Math.abs(s.delta).toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-[10px] text-text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

// ── 2. Velocity — per-dimension week-over-week delta ─────────────────────────
const TREND_STATUS_META = {
  improving:      { icon: '🚀', label: 'Improving',      color: 'text-success',      bg: 'bg-success/5',   border: 'border-success/20' },
  declining:      { icon: '📉', label: 'Declining',      color: 'text-error',        bg: 'bg-error/5',     border: 'border-error/20' },
  mixed_positive: { icon: '📈', label: 'Mixed — trending up',   color: 'text-success', bg: 'bg-success/5', border: 'border-success/20' },
  mixed_negative: { icon: '⚠️', label: 'Mixed — trending down', color: 'text-warning', bg: 'bg-warning/5', border: 'border-warning/20' },
  stable:         { icon: '➡️', label: 'Stable',         color: 'text-text-muted',   bg: 'bg-surface-panel', border: 'border-surface-border' },
}

const DIM_LABELS = {
  hook: 'Hook', clarity: 'Clarity', value_prop: 'Value Prop',
  personalization: 'Personalization', cta: 'CTA', tone: 'Tone',
}

function VelocitySection() {
  const { data, isLoading } = useInsightsVelocity()

  if (isLoading) return <div className="h-32 skeleton rounded-xl mb-6" />
  if (!data?.has_data) return null

  const meta   = TREND_STATUS_META[data.trend_status] || TREND_STATUS_META.stable
  const dims   = data.dimensions || {}
  const sorted = Object.entries(dims)
    .filter(([, v]) => v != null)
    .sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta)) // biggest movers first

  const fmtDelta = (d) => `${d > 0 ? '+' : ''}${d.toFixed(1)}`

  return (
    <div className={`mb-6 border ${meta.border} ${meta.bg} rounded-xl overflow-hidden`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-text-primary">This Week's Velocity</p>
              <span className={`text-[10px] font-semibold ${meta.color}`}>{meta.label}</span>
            </div>
            {data.summary && (
              <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{data.summary}</p>
            )}
          </div>
        </div>
        {data.composite_delta != null && (
          <div className="text-right shrink-0">
            <p className={`text-lg font-bold font-display ${data.composite_delta > 0 ? 'text-success' : data.composite_delta < 0 ? 'text-error' : 'text-text-muted'}`}>
              {fmtDelta(data.composite_delta)}
            </p>
            <p className="text-[10px] text-text-muted">composite</p>
          </div>
        )}
      </div>

      {/* Per-dimension delta bars */}
      {sorted.length > 0 && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-2">Dimension movement</p>
          {sorted.map(([key, v]) => {
            const isGain = v.delta > 0.05
            const isDrop = v.delta < -0.05
            const barPct = Math.min(100, Math.abs(v.delta) / 3 * 100) // 3-point swing = full bar
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[10px] text-text-muted w-20 shrink-0">{DIM_LABELS[key]}</span>
                <div className="flex-1 flex items-center gap-2">
                  {/* Neutral baseline + directional bar */}
                  <div className="flex-1 relative h-2 bg-surface-border rounded-full overflow-hidden">
                    {isDrop && (
                      <div
                        className="absolute right-1/2 top-0 h-full bg-error/60 rounded-l-full"
                        style={{ width: `${barPct / 2}%` }}
                      />
                    )}
                    {isGain && (
                      <div
                        className="absolute left-1/2 top-0 h-full bg-success/60 rounded-r-full"
                        style={{ width: `${barPct / 2}%` }}
                      />
                    )}
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 w-px h-full bg-surface-mid" />
                  </div>
                </div>
                <span className={`text-[11px] font-bold w-10 text-right shrink-0 ${isGain ? 'text-success' : isDrop ? 'text-error' : 'text-text-muted'}`}>
                  {fmtDelta(v.delta)}
                </span>
                <span className="text-[10px] text-text-muted w-8 text-right shrink-0">
                  {v.current?.toFixed(1)}
                </span>
              </div>
            )
          })}
          <p className="text-[10px] text-text-muted pt-1">
            vs. week of {new Date(data.previous_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {data.top_weakness && <> · Weakest: <span className="text-warning font-medium">{DIM_LABELS[data.top_weakness]}</span></>}
            {data.top_strength && <> · Strongest: <span className="text-success font-medium">{DIM_LABELS[data.top_strength]}</span></>}
          </p>
        </div>
      )}
    </div>
  )
}

// ── 3. Practice Priority Nudge ────────────────────────────────────────────────
// FIX-12: removed redundant useInsightsSkillProgression() call.
// top_weakness is already returned by /summary (currentWeek?.top_weakness).
// The skill-progression endpoint fetches 12 weeks of chart data and is much
// heavier — firing it here just to get a fallback value that's already present
// in the lighter summary response was wasteful.
function PracticePriorityNudge() {
  const { data: summary } = useInsightsSummary()
  const navigate = useNavigate()

  const weakness = summary?.top_weakness
  if (!weakness || !summary?.has_enough_data) return null

  const scenario = WEAKNESS_TO_SCENARIO[weakness.toLowerCase().replace(/[\s-]/g, '_')]
  if (!scenario) return null

  const dimensionLabel = weakness.charAt(0).toUpperCase() + weakness.slice(1).replace(/_/g, ' ')

  return (
    <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
      <span className="text-2xl shrink-0">🎯</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary mb-0.5">Your #1 Leverage Point</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          Your <span className="text-primary-glow font-medium">{dimensionLabel}</span> score is your weakest
          dimension. The <span className="font-medium">{scenario.replace(/_/g, ' ')}</span> practice scenario
          directly targets this gap — highest ROI action available right now.
        </p>
      </div>
      <button
        onClick={() => navigate(ROUTES.PRACTICE)}
        className="text-[11px] font-semibold text-primary-glow bg-primary/10 px-3 py-1.5 rounded-lg shrink-0 hover:bg-primary/20 transition-colors"
      >
        Practice →
      </button>
    </div>
  )
}

// ── 3. Signal Heat ────────────────────────────────────────────────────────────
function SignalHeatSection() {
  const { data, isLoading } = useSignalsSummary()

  if (isLoading) return <div className="h-28 skeleton rounded-xl mb-8" />

  const counts   = data?.signal_counts   || {}
  const hotCount = data?.hot_prospect_ids?.length || 0
  const total    = data?.total_signals   || 0

  if (total === 0 && hotCount === 0) return (
    <Section title="Signal Heat" subtitle="Buying & risk signals from your conversations (last 30 days)">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">📡</p>
        <p className="text-xs text-text-muted">No signals yet. As you log conversations and outcomes, buying intent and risk signals will appear here.</p>
      </div>
    </Section>
  )

  const signals = [
    { key: 'buying',     icon: '🔥', label: 'Buying',   color: 'text-success',      bg: 'bg-success/10',  border: 'border-success/20' },
    { key: 'engagement', icon: '💬', label: 'Engaged',  color: 'text-primary-glow', bg: 'bg-primary/10',  border: 'border-primary/20' },
    { key: 'timing',     icon: '⏰', label: 'Timing',   color: 'text-warning',      bg: 'bg-warning/10',  border: 'border-warning/20' },
    { key: 'risk',       icon: '⚠️', label: 'At Risk',  color: 'text-error',        bg: 'bg-error/10',    border: 'border-error/20' },
  ]

  return (
    <Section
      title="Signal Heat"
      subtitle={`${total} active signal${total !== 1 ? 's' : ''} across your conversations (last 30 days)`}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {signals.map(s => (
            <div key={s.key} className={`${s.bg} border ${s.border} rounded-xl p-3 flex items-center gap-3`}>
              <span className="text-xl shrink-0">{s.icon}</span>
              <div>
                <p className={`text-lg font-bold font-display ${s.color}`}>{counts[s.key] || 0}</p>
                <p className="text-[10px] text-text-muted">{s.label} signals</p>
              </div>
            </div>
          ))}
        </div>
        {hotCount > 0 && (
          <div className="bg-success/8 border border-success/25 rounded-xl p-3 flex items-start gap-3">
            <span className="text-xl shrink-0">🚀</span>
            <div>
              <p className="text-xs font-semibold text-success">
                {hotCount} hot prospect{hotCount !== 1 ? 's' : ''} — buying signal in last 7 days
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">These prospects showed purchase intent recently. Reach out now.</p>
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── 4. Commitments Alert ──────────────────────────────────────────────────────
function CommitmentsAlertSection() {
  const { data } = useCommitmentsSummary()
  const navigate = useNavigate()

  const overdue  = data?.overdue  || 0
  const due_soon = data?.due_soon || 0

  if (overdue === 0 && due_soon === 0) return null

  return (
    <div className="mb-6">
      <div className={`border rounded-xl p-4 flex items-start gap-3 ${
        overdue > 0 ? 'bg-error/5 border-error/25' : 'bg-warning/5 border-warning/25'
      }`}>
        <span className="text-2xl shrink-0">{overdue > 0 ? '🚨' : '⏳'}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold mb-0.5 ${overdue > 0 ? 'text-error' : 'text-warning'}`}>
            {overdue > 0
              ? `${overdue} overdue commitment${overdue !== 1 ? 's' : ''}`
              : `${due_soon} commitment${due_soon !== 1 ? 's' : ''} due soon`}
          </p>
          <p className="text-xs text-text-secondary leading-relaxed">
            {overdue > 0
              ? `${overdue} unmet promise${overdue !== 1 ? 's' : ''} to prospects — this is damaging trust right now.`
              : `${due_soon} commitment${due_soon !== 1 ? 's' : ''} due within 48 hours. Follow through to keep momentum alive.`}
            {overdue > 0 && due_soon > 0 && ` Also ${due_soon} more due soon.`}
          </p>
        </div>
        <button
          onClick={() => navigate(ROUTES.PROSPECTS)}
          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
            overdue > 0 ? 'text-error bg-error/10 hover:bg-error/20' : 'text-warning bg-warning/10 hover:bg-warning/20'
          }`}
        >
          Review →
        </button>
      </div>
    </div>
  )
}

// ── 5. Weekly Prospect Insights ───────────────────────────────────────────────
function WeeklyInsightsSection() {
  const { data }  = useWeeklyInsights()
  const dismiss   = useDismissInsight()

  const insights = data?.insights || []
  if (!insights.length) return null

  return (
    <Section
      title="Prospect Insights"
      subtitle={`${insights.length} active insight${insights.length !== 1 ? 's' : ''} about your pipeline`}
    >
      <div className="space-y-2.5">
        {insights.map(insight => (
          <div key={insight.id} className="bg-surface-card border border-surface-border rounded-xl p-4 flex items-start gap-3">
            <span className="text-xl shrink-0 mt-0.5">
              {insight.insight_type === 'stall' ? '🔴'
                : insight.insight_type === 'timing_alert' ? '⏰'
                : insight.insight_type === 'win_pattern' ? '✅'
                : '💡'}
            </span>
            <div className="flex-1 min-w-0">
              {insight.title && (
                <p className="text-xs font-semibold text-text-primary mb-0.5">{insight.title}</p>
              )}
              <p className="text-xs text-text-secondary leading-relaxed">{insight.insight_text || insight.body}</p>
              {insight.action_label && (
                <p className="text-[11px] text-primary-glow mt-1.5 font-medium">→ {insight.action_label}</p>
              )}
            </div>
            <button
              onClick={() => dismiss.mutate(insight.id)}
              className="text-text-muted hover:text-text-secondary text-xs shrink-0 mt-0.5 transition-colors"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── 6. Why You're Losing ──────────────────────────────────────────────────────
// FIXED: correctly maps flat API shape:
//   { primary_diagnosis, evidence_summary, immediate_fix, skill_to_focus, encouraging_note }
// FIX-13: added isError state so a 503/network failure shows a graceful card
//         instead of a blank section that gives no feedback to the user.
function WhyLosingSection() {
  const { data, isLoading, isError, refetch, isFetching } = useInsightsWhyLosing()

  if (isLoading) return (
    <div className="mb-8">
      <div className="h-4 skeleton rounded w-40 mb-3" />
      <div className="h-40 skeleton rounded-xl" />
    </div>
  )

  // FIX-13: graceful error state — API failed (503, network error, etc.)
  if (isError) return (
    <Section title="Why You're Losing" subtitle="AI communication report">
      <div className="bg-surface-panel border border-error/20 rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <p className="text-sm text-text-muted">Could not load your report right now.</p>
        <button
          onClick={() => refetch()}
          className="mt-3 text-xs font-semibold text-primary-glow hover:underline"
        >
          Try again →
        </button>
      </div>
    </Section>
  )

  const report = data?.report

  if (!report || report.data_status === 'insufficient') return (
    <Section title="Why You're Losing" subtitle="Log 3+ outreach outcomes to unlock your AI communication report.">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm text-text-muted">Mark your outreach outcomes to start generating your communication report.</p>
        {data?.analyses_count != null && (
          <p className="text-xs text-text-muted mt-2 opacity-70">
            {data.analyses_count} / {data.analyses_needed || 3} outcomes logged
          </p>
        )}
      </div>
    </Section>
  )

  const SKILL_LABELS = {
    hook: 'Hook', clarity: 'Clarity', value_prop: 'Value Prop',
    personalization: 'Personalization', cta: 'CTA', tone: 'Tone',
  }
  const skillLabel = SKILL_LABELS[report.skill_to_focus] || report.skill_to_focus

  // Subtitle reflects rate-limited state too
  const subtitle = data?.rate_limited
    ? 'Refresh limit reached · try again in 15 minutes'
    : data?.cached
    ? 'Cached · refreshes every 24h'
    : `AI analysis of ${data?.analyses_count || 0} messages`

  return (
    <Section
      title="Why You're Losing"
      subtitle={subtitle}
      badge="AI Report"
      action={
        <button
          onClick={() => refetch()}
          disabled={isFetching || data?.rate_limited}
          className="text-[11px] text-primary-glow hover:underline disabled:opacity-50 transition-colors"
        >
          {isFetching ? 'Refreshing…' : data?.rate_limited ? 'Rate limited' : 'Refresh'}
        </button>
      }
    >
      <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">

        {report.primary_diagnosis && (
          <div className="px-5 py-4 border-b border-surface-border bg-error/4">
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-1.5">Root cause</p>
            <p className="text-xs font-semibold text-text-primary leading-relaxed">{report.primary_diagnosis}</p>
          </div>
        )}

        {report.evidence_summary && (
          <div className="px-5 py-4 border-b border-surface-border">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">📊</span>
              <div>
                <p className="text-xs font-semibold text-text-primary mb-1">Evidence</p>
                <p className="text-xs text-text-secondary leading-relaxed">{report.evidence_summary}</p>
              </div>
            </div>
          </div>
        )}

        {report.immediate_fix && (
          <div className="px-5 py-4 border-b border-surface-border bg-primary/3">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">⚡</span>
              <div>
                <p className="text-xs font-semibold text-primary-glow mb-1">Do this today</p>
                <p className="text-xs text-text-secondary leading-relaxed">{report.immediate_fix}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 py-4 flex items-center justify-between gap-4">
          {skillLabel && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Focus dimension</p>
              <p className="text-xs font-semibold text-primary-glow mt-0.5">{skillLabel}</p>
            </div>
          )}
          {report.encouraging_note && (
            <p className="text-[11px] text-text-muted leading-relaxed text-right flex-1">{report.encouraging_note}</p>
          )}
        </div>
      </div>
    </Section>
  )
}

// ── 7. Communication Patterns ─────────────────────────────────────────────────
function PatternsSection() {
  const { data, isLoading } = useInsightsPatterns()

  if (isLoading) return (
    <div className="mb-8 space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
    </div>
  )

  const patterns = data?.patterns || []

  if (!patterns.length) return (
    <Section title="Communication Patterns" subtitle="Detected from your message history">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">🧬</p>
        <p className="text-sm text-text-muted">Send and log outcomes for 5+ messages to detect your communication patterns.</p>
      </div>
    </Section>
  )

  return (
    <Section
      title="Communication Patterns"
      subtitle={`${patterns.length} pattern${patterns.length !== 1 ? 's' : ''} detected`}
    >
      <div className="space-y-3">
        {patterns.map((p, i) => {
          const meta = PATTERN_TYPE_META[p.pattern_type] || PATTERN_TYPE_META.weakness
          return (
            <div key={p.id || i} className={`border ${meta.border} ${meta.bg} rounded-xl p-4`}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold ${meta.accent}`}>{p.pattern_label}</p>
                    <span className="text-[10px] text-text-muted shrink-0 font-medium">
                      {p.confidence_score?.toFixed(0)}/10 confidence
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mt-1">{p.pattern_detail}</p>
                  {p.recommendation && (
                    <div className="mt-2 flex items-start gap-1.5">
                      <span className="text-[11px] text-primary-glow shrink-0">→</span>
                      <p className="text-[11px] text-primary-glow font-medium">{p.recommendation}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── 8. Skill Progression Chart ────────────────────────────────────────────────
function SkillProgressionSection() {
  const { data, isLoading } = useInsightsSkillProgression()
  const [view, setView] = useState('composite')

  if (isLoading) return <div className="h-56 skeleton rounded-xl mb-8" />

  const weeks = data?.weeks || []
  if (!weeks.length) return (
    <Section title="Skill Progression" subtitle="Weekly skill scores over time">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">📈</p>
        <p className="text-sm text-text-muted">Log outcomes for 5+ messages to track your skill progression.</p>
      </div>
    </Section>
  )

  const current  = data?.current_week
  const previous = data?.previous_week
  const delta    = current && previous && current.composite_score_avg != null && previous.composite_score_avg != null
    ? parseFloat((current.composite_score_avg - previous.composite_score_avg).toFixed(2))
    : null

  const compositeData = {
    labels: weeks.map(w => { const [,m,d] = w.week_start.split('-'); return `${m}/${d}` }),
    datasets: [{
      label: 'Composite Score',
      data: weeks.map(w => w.composite_score_avg),
      borderColor: '#6366F1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#6366F1',
    }],
  }

  const radarData = current ? {
    labels: Object.values(DIMENSION_LABELS),
    datasets: [{
      label: 'This week',
      data: [current.hook_score_avg, current.clarity_score_avg, current.value_prop_score_avg,
             current.personalization_score_avg, current.cta_score_avg, current.tone_score_avg]
        .map(v => v != null ? parseFloat((v * 10).toFixed(1)) : 0),
      borderColor: '#6366F1',
      backgroundColor: 'rgba(99,102,241,0.15)',
      pointBackgroundColor: '#6366F1',
    }, previous ? {
      label: 'Last week',
      data: [previous.hook_score_avg, previous.clarity_score_avg, previous.value_prop_score_avg,
             previous.personalization_score_avg, previous.cta_score_avg, previous.tone_score_avg]
        .map(v => v != null ? parseFloat((v * 10).toFixed(1)) : 0),
      borderColor: '#475569',
      backgroundColor: 'rgba(71,85,105,0.08)',
      borderDash: [4, 4],
      pointBackgroundColor: '#475569',
    } : null].filter(Boolean),
  } : null

  const radarOptions = {
    responsive: true, maintainAspectRatio: false,
    scales: { r: { min: 0, max: 100, grid: { color: '#1E293B' }, ticks: { color: '#64748B', font: { size: 9 }, stepSize: 25 }, pointLabels: { color: '#94A3B8', font: { size: 10 } } } },
    plugins: { legend: { display: true, labels: { color: '#64748B', font: { size: 10 }, boxWidth: 12 } } },
  }

  return (
    <Section
      title="Skill Progression"
      subtitle={`${weeks.length} weeks of data${delta != null ? ` · ${delta > 0 ? '+' : ''}${delta} this week` : ''}`}
      action={
        <div className="flex gap-1 bg-surface-panel border border-surface-border rounded-lg p-0.5">
          {['composite', 'radar'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${view === v ? 'bg-primary text-white' : 'text-text-muted hover:text-text-secondary'}`}>
              {v === 'composite' ? 'Trend' : 'Radar'}
            </button>
          ))}
        </div>
      }
    >
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        {view === 'composite' ? (
          <>
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">Composite Score (0–10) · {weeks.length} weeks</p>
            <div className="h-40">
              <Line data={compositeData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { color: '#1E293B' }, ticks: { color: '#64748B', font: { size: 10 } } },
                  y: { min: 0, max: 10, grid: { color: '#1E293B' }, ticks: { color: '#64748B', font: { size: 10 } } },
                },
              }} />
            </div>
            {current && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {Object.entries(DIMENSION_LABELS).map(([field, label]) => {
                  const score = current[field]
                  if (score == null) return null
                  const isWeakest = current.top_weakness && label.toLowerCase().includes(current.top_weakness.toLowerCase().replace(/_/g, ' ').split(' ')[0])
                  return (
                    <div key={field} className={`text-center rounded-lg p-1.5 ${isWeakest ? 'bg-error/8 border border-error/15' : ''}`}>
                      <p className="text-base font-bold font-display" style={{ color: SCORE_COLOR(score) }}>{score?.toFixed(1)}</p>
                      <p className={`text-[9px] ${isWeakest ? 'text-error font-medium' : 'text-text-muted'}`}>{label}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : radarData ? (
          <>
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">This Week vs Last Week (0–100)</p>
            <div className="h-52"><Radar data={radarData} options={radarOptions} /></div>
          </>
        ) : (
          <p className="text-xs text-text-muted text-center py-8">Not enough data for radar view yet.</p>
        )}
      </div>
    </Section>
  )
}

// ── 9. Conversation Autopsies ─────────────────────────────────────────────────
// FIX-14: added offset pagination state + Load More button.
// The hook already supported offset but the UI never wired it up,
// meaning users could never access records past the first 20.
function AutopsiesSection() {
  const [filter, setFilter]     = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [offset, setOffset]     = useState(0)
  const [allAutopsies, setAllAutopsies] = useState([])
  const PAGE_SIZE = 20

  const { data, isLoading, isFetching } = useInsightsAutopsies({ filter, limit: PAGE_SIZE, offset })

  // When filter changes, reset pagination and accumulated list
  const handleFilterChange = (f) => {
    if (f === filter) return
    setFilter(f)
    setOffset(0)
    setAllAutopsies([])
    setExpanded(null)
  }

  // Accumulate pages as user loads more
  React.useEffect(() => {
    if (!data?.autopsies) return
    if (offset === 0) {
      setAllAutopsies(data.autopsies)
    } else {
      setAllAutopsies(prev => {
        const existingIds = new Set(prev.map(a => a.id))
        const fresh = data.autopsies.filter(a => !existingIds.has(a.id))
        return [...prev, ...fresh]
      })
    }
  }, [data?.autopsies, offset])

  if (isLoading && offset === 0) return (
    <div className="mb-8 space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
    </div>
  )

  const total   = data?.total || 0
  const hasMore = data?.has_more ?? false

  const OUTCOME_META = {
    positive: { label: 'Positive', dot: 'bg-success',    text: 'text-success' },
    negative: { label: 'Negative', dot: 'bg-error',      text: 'text-error' },
    neutral:  { label: 'Neutral',  dot: 'bg-text-muted', text: 'text-text-muted' },
  }
  const BAR_COLOR = (s) => s >= 7.5 ? '#10B981' : s >= 5 ? '#F59E0B' : '#EF4444'

  return (
    <Section
      title="Message Autopsies"
      subtitle={`${total} messages analyzed`}
      action={
        <div className="flex gap-1 bg-surface-panel border border-surface-border rounded-lg p-0.5">
          {['all', 'positive', 'negative'].map(f => (
            <button key={f} onClick={() => handleFilterChange(f)}
              className={`text-[10px] px-2 py-1 rounded-md font-medium capitalize transition-colors ${filter === f ? 'bg-primary text-white' : 'text-text-muted hover:text-text-secondary'}`}>
              {f}
            </button>
          ))}
        </div>
      }
    >
      {!allAutopsies.length && !isLoading ? (
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
          <p className="text-2xl mb-2">🔬</p>
          <p className="text-sm text-text-muted">Log outcomes on your sent messages to see autopsies.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allAutopsies.map((a) => {
            const meta = OUTCOME_META[a.outcome] || OUTCOME_META.neutral
            const isExpanded = expanded === a.id
            const scores = [
              { label: 'Hook',     value: a.hook_score },
              { label: 'Clarity',  value: a.clarity_score },
              { label: 'Value',    value: a.value_prop_score },
              { label: 'Personal', value: a.personalization_score },
              { label: 'CTA',      value: a.cta_score },
              { label: 'Tone',     value: a.tone_score },
            ]

            return (
              <div key={a.id} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-panel/50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : a.id)}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-text-primary truncate">
                        {a.platform ? `[${a.platform}] ` : ''}{a.outcome_note?.slice(0, 60) || 'Message analyzed'}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-bold text-text-primary">{a.composite_score?.toFixed(1)}/10</span>
                        <span className={`text-[10px] font-medium ${meta.text}`}>{meta.label}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-1.5">
                      {scores.map(s => (
                        <div key={s.label} className="flex-1">
                          <div className="h-1 bg-surface-border rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(s.value / 10) * 100}%`, backgroundColor: BAR_COLOR(s.value) }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <span className="text-text-muted text-xs">{isExpanded ? '↑' : '↓'}</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-surface-border px-4 pb-4 pt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {scores.map(s => (
                        <div key={s.label} className="text-center bg-surface-panel rounded-lg p-2">
                          <p className="text-sm font-bold" style={{ color: BAR_COLOR(s.value) }}>{s.value?.toFixed(1)}</p>
                          <p className="text-[9px] text-text-muted">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {a.analysis_text && (
                      <div className="bg-surface-panel rounded-xl p-3">
                        <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-1">Diagnosis</p>
                        <p className="text-xs text-text-secondary leading-relaxed">{a.analysis_text}</p>
                      </div>
                    )}
                    {a.failure_categories?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {a.failure_categories.map(cat => (
                          <span key={cat} className="text-[10px] bg-error/10 text-error px-2 py-0.5 rounded-full">{cat.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                    {a.success_signals?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {a.success_signals.map((sig, i) => (
                          <span key={i} className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full">{sig}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-text-muted">
                      {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {a.word_count ? ` · ${a.word_count} words` : ''}
                    </p>
                  </div>
                )}
              </div>
            )
          })}

          {/* FIX-14: Load More button — previously data past page 1 was unreachable */}
          {hasMore && (
            <button
              onClick={() => setOffset(prev => prev + PAGE_SIZE)}
              disabled={isFetching}
              className="w-full py-3 text-xs font-semibold text-text-muted hover:text-text-secondary border border-surface-border rounded-xl bg-surface-panel transition-colors disabled:opacity-50"
            >
              {isFetching ? 'Loading…' : `Load more · showing ${allAutopsies.length} of ${total}`}
            </button>
          )}

          {!hasMore && allAutopsies.length > 0 && total > PAGE_SIZE && (
            <p className="text-[11px] text-text-muted text-center py-2">
              All {total} messages shown
            </p>
          )}
        </div>
      )}
    </Section>
  )
}

// ── 10. Objection Tracker ─────────────────────────────────────────────────────
function ObjectionTrackerSection() {
  const { data, isLoading } = useInsightsObjections()
  const [expanded, setExpanded] = useState(null)

  if (isLoading) return <div className="h-48 skeleton rounded-xl mb-8" />

  const objections   = data?.objections   || []
  const market_intel = data?.market_intel

  if (!objections.length) return (
    <Section title="Objection Tracker" subtitle="What's blocking your conversions">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">🛡️</p>
        <p className="text-sm text-text-muted">Log negative outcomes with notes to start tracking your objection patterns.</p>
      </div>
    </Section>
  )

  const total = objections.reduce((s, o) => s + (o.occurrence_count || 0), 0)

  return (
    <Section title="Objection Tracker" subtitle="Why prospects say no — and your practice gap per objection type">
      <div className="space-y-3">
        {market_intel && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-primary-glow uppercase tracking-wide mb-2">
              🧠 Market Intelligence — {market_intel.objection_type} objections
            </p>
            {market_intel.summary && <p className="text-xs text-text-secondary mb-3 leading-relaxed">{market_intel.summary}</p>}
            {market_intel.bullets?.length > 0 && (
              <div className="space-y-1.5">
                {market_intel.bullets.map((b, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-primary-glow text-xs shrink-0">→</span>
                    <p className="text-xs text-text-secondary leading-relaxed">{b}</p>
                  </div>
                ))}
              </div>
            )}
            {market_intel.cached && <p className="text-[10px] text-text-muted mt-2">Cached · updates weekly</p>}
          </div>
        )}

        {objections.map((obj) => {
          const pct        = total > 0 ? Math.round((obj.occurrence_count / total) * 100) : 0
          const isExpanded = expanded === obj.id
          const hasGap     = obj.practice_sessions_count === 0 || (obj.avg_practice_score != null && obj.avg_practice_score < 60)

          return (
            <div key={obj.id || obj.objection_type} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
              <button className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-panel/40 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : obj.id)}>
                <span className="text-xl shrink-0">{OBJECTION_ICONS[obj.objection_type] || '💬'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-text-primary capitalize">{obj.objection_type.replace('_', ' ')}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasGap && <span className="text-[9px] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full font-medium">practice gap</span>}
                      <span className="text-[11px] font-bold text-text-primary">{obj.occurrence_count}×</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                    <div className="h-full bg-error/50 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="text-text-muted text-xs">{isExpanded ? '↑' : '↓'}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-surface-border px-4 pb-4 pt-3 space-y-3">
                  {obj.objection_phrase && (
                    <div className="bg-surface-panel rounded-xl p-3">
                      <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-1">Example</p>
                      <p className="text-xs text-text-secondary italic">"{obj.objection_phrase}"</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between bg-surface-panel rounded-xl p-3">
                    <div>
                      <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Practice score</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {obj.practice_sessions_count === 0
                          ? 'No sessions for this objection type'
                          : `${obj.practice_sessions_count} sessions · avg ${obj.avg_practice_score}/100`}
                      </p>
                    </div>
                    {obj.avg_practice_score != null && (
                      <span className="text-2xl font-bold font-display" style={{ color: SCORE_COLOR(obj.avg_practice_score, 100) }}>
                        {obj.avg_practice_score}
                      </span>
                    )}
                  </div>
                  {obj.practice_sessions_count === 0 && (
                    <p className="text-[11px] text-warning font-medium">
                      → Opening Practice Mode for this scenario would directly address your top failure type.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── 11. Pitch Diagnostic ──────────────────────────────────────────────────────
// FIXED: API returns { analysis: {...} } — correctly unwrapped with data?.analysis || data
function PitchDiagnosticSection() {
  const [message, setMessage] = useState('')
  const [result, setResult]   = useState(null)
  const analyzeMessage        = useInsightsAnalyzeMessage()

  const handleAnalyze = async () => {
    if (!message.trim() || message.trim().length < 20) {
      toast.error('Paste a message to analyze (at least 20 characters)')
      return
    }
    try {
      const data = await analyzeMessage.mutateAsync({ message })
      setResult(data?.analysis || data) // unwrap correctly
    } catch {
      toast.error('Analysis failed — try again')
    }
  }

  const scores = result ? [
    { label: 'Hook',            value: result.hook_score },
    { label: 'Clarity',         value: result.clarity_score },
    { label: 'Value Prop',      value: result.value_prop_score },
    { label: 'Personalization', value: result.personalization_score },
    { label: 'CTA',             value: result.cta_score },
    { label: 'Tone',            value: result.tone_score },
  ] : []

  return (
    <Section title="Pitch Diagnostic" subtitle="Paste any outreach message for an instant AI score breakdown" badge="On-demand">
      <div className="space-y-3">
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Paste your outreach message here…"
            rows={5}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none leading-relaxed"
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border">
            <span className="text-[10px] text-text-muted">{message.split(/\s+/).filter(Boolean).length} words</span>
            <button
              onClick={handleAnalyze}
              disabled={analyzeMessage.isPending || !message.trim()}
              className="text-xs font-semibold bg-primary text-white px-4 py-2 rounded-xl disabled:opacity-50 transition-opacity hover:opacity-90"
            >
              {analyzeMessage.isPending ? 'Analyzing…' : 'Analyze →'}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-4 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">Overall Score</p>
              <span className="text-2xl font-bold font-display" style={{ color: SCORE_COLOR(result.composite_score) }}>
                {result.composite_score?.toFixed(1)}/10
              </span>
            </div>

            <div className="space-y-2">
              {scores.map(s => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-text-secondary">{s.label}</span>
                    <span className="text-[11px] font-bold text-text-primary">{s.value?.toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(s.value / 10) * 100}%`, backgroundColor: SCORE_COLOR(s.value) }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Smart flags */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {result.has_social_proof  && <span className="bg-success/10 text-success  px-2 py-0.5 rounded-full font-medium">✓ Social proof</span>}
              {result.has_specific_ask  && <span className="bg-success/10 text-success  px-2 py-0.5 rounded-full font-medium">✓ Specific ask</span>}
              {result.word_count > 120  && <span className="bg-warning/10 text-warning  px-2 py-0.5 rounded-full font-medium">⚠ Too long ({result.word_count}w)</span>}
              {result.self_referential_ratio > 0.5 && <span className="bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">⚠ Self-focused</span>}
            </div>

            {result.analysis_text && (
              <div className="bg-surface-panel rounded-xl p-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-1.5">Diagnosis</p>
                <p className="text-xs text-text-secondary leading-relaxed">{result.analysis_text}</p>
              </div>
            )}

            {result.line_annotations?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Phrase-level fixes</p>
                {result.line_annotations.slice(0, 3).map((ann, i) => (
                  <div key={i} className="bg-error/5 border border-error/15 rounded-xl p-3 space-y-1">
                    <p className="text-[11px] text-error font-medium italic">"{ann.phrase}"</p>
                    <p className="text-[11px] text-text-secondary">{ann.issue}</p>
                    {ann.fix && <p className="text-[11px] text-success font-medium">→ {ann.fix}</p>}
                  </div>
                ))}
              </div>
            )}

            {result.improvement_suggestions?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium">Top Fixes</p>
                {result.improvement_suggestions.slice(0, 2).map((sug, i) => (
                  <div key={i} className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-primary-glow mb-0.5 capitalize">{sug.dimension?.replace('_', ' ')}</p>
                    <p className="text-xs text-text-secondary leading-relaxed">{sug.suggestion}</p>
                    {sug.example && <p className="text-[11px] text-primary-glow mt-1.5 italic">"{sug.example}"</p>}
                  </div>
                ))}
              </div>
            )}

            {result.rewritten_message && (
              <div className="bg-success/5 border border-success/20 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-success uppercase tracking-wide mb-1.5">Rewritten Version</p>
                <p className="text-xs text-text-secondary leading-relaxed italic">"{result.rewritten_message}"</p>
              </div>
            )}

            <button onClick={() => { setResult(null); setMessage('') }}
              className="text-[11px] text-text-muted hover:text-text-secondary transition-colors">
              Clear and analyze another message →
            </button>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  return (
    <>
      <TopBar title="Insights" />
      <PageContent>
        <SummaryStrip />
        <VelocitySection />
        <PracticePriorityNudge />
        <SignalHeatSection />
        <CommitmentsAlertSection />
        <WeeklyInsightsSection />
        <WhyLosingSection />
        <PatternsSection />
        <SkillProgressionSection />
        <AutopsiesSection />
        <ObjectionTrackerSection />
        <PitchDiagnosticSection />
      </PageContent>
    </>
  )
}
