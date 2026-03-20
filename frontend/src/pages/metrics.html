// src/pages/metrics.jsx
// ============================================================
// METRICS — Enhanced with:
//  § Message Quality section (communication-snapshot endpoint)
//  § Enhanced Milestones (practice_badges + approaching milestones)
//  § Objection Snapshot widget
//  § All existing sections preserved
//
// AUDIT FIXES (2025):
//  A-11 — Removed dead useBehavioralInsights import (hook was imported
//          but never called; endpoint also removed from backend).
//  A-15 — ObjectionSnapshot moved above MessageQualitySection so objection
//          data sits near the relevant Intelligence + outreach cards.
//  A-16 — Empty-state CTA components added for all silent-null sections:
//          IntelligenceCards, MessageQualitySection, ObjectionSnapshot,
//          PracticeSkillProgress now each show a helpful prompt instead of
//          collapsing silently when there is no data yet.
// ============================================================

import React, { useRef, useEffect, useState } from 'react'
import {
  useDashboard, useTokenUsage, useMomentumScore,
  useMetricsIntelligence, useMetricsMilestones, useMetricsLearning,
  usePracticeProgressSummary, useMetricsCommunicationSnapshot, useInsightsObjections,
} from '../services/queries'
import { SkeletonCard } from '../components/ui/Skeleton'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { formatPercent, formatNumber } from '../utils/formatters'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler)

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
  scales: {
    x: { grid: { color: '#1E293B', drawBorder: false }, ticks: { color: '#64748B', font: { size: 10 } } },
    y: { grid: { color: '#1E293B', drawBorder: false }, ticks: { color: '#64748B', font: { size: 10 }, precision: 0 }, beginAtZero: true },
  },
}

// Human-readable labels for the 7 practice skill axes
const AXIS_LABELS = {
  clarity:             'Clarity',
  value:               'Value Prop',
  discovery:           'Discovery',
  objection_handling:  'Objection Handling',
  brevity:             'Brevity',
  cta_strength:        'CTA Strength',
  monologue_alignment: 'Monologue Read',
}

// Human-readable labels for message dimension scores
const DIMENSION_LABELS = {
  hook:            'Hook Strength',
  clarity:         'Clarity',
  value_prop:      'Value Proposition',
  personalization: 'Personalization',
  cta:             'Call to Action',
  tone:            'Tone Fit',
}

const FAILURE_CATEGORY_LABELS = {
  weak_hook:         'Weak opening',
  no_value_proof:    'No proof',
  too_generic:       'Too generic',
  too_long:          'Too long',
  unclear_ask:       'Unclear ask',
  feature_not_outcome: 'Features vs outcomes',
  wrong_tone:        'Wrong tone',
  over_explained:    'Over-explained',
  self_focused:      'Self-focused',
  no_personalization:'Not personalized',
  no_social_proof:   'No social proof',
  weak_cta:          'Weak CTA',
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, subtitle, children, action }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Momentum Score — circular hero ───────────────────────────────────────────
function MomentumScoreCard({ score, trend, insight, breakdown, isLoading }) {
  const scoreColor = score >= 61 ? '#10B981' : score >= 31 ? '#F59E0B' : '#EF4444'
  const circumference = 2 * Math.PI * 44
  const dashOffset    = circumference - (circumference * Math.min(score || 0, 100)) / 100

  // A-01: Max values must exactly match computeMomentumScore() in metrics.js:
  //   activity   → 30 (streak×3 max 15 + volume/2 max 15)
  //   conversion → 30
  //   pipeline   → 20
  //   goals      → 15 (avgGoalPct/7, capped at 15)
  //   practice   →  5
  const breakdownItems = [
    { label: 'Activity',    value: breakdown?.activity,   max: 30 },
    { label: 'Conversion',  value: breakdown?.conversion, max: 30 },
    { label: 'Pipeline',    value: breakdown?.pipeline,   max: 20 },
    { label: 'Goals',       value: breakdown?.goals,      max: 15 },
    { label: 'Practice',    value: breakdown?.practice,   max: 5  },
  ]

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Business Momentum</h2>
          <p className="text-xs text-text-muted mt-0.5">Calculated from outreach, pipeline, practice & goals</p>
        </div>
        {trend != null && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${trend >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)} this week
          </span>
        )}
      </div>

      <div className="flex items-center gap-8">
        {/* Circle */}
        <div className="relative shrink-0">
          {isLoading ? <div className="w-28 h-28 rounded-full skeleton" /> : (
            <svg width="112" height="112" className="-rotate-90">
              <circle cx="56" cy="56" r="44" fill="none" stroke="#1E293B" strokeWidth="8" />
              <circle cx="56" cy="56" r="44" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1.2s ease-in-out' }} />
            </svg>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-display" style={{ color: scoreColor }}>{isLoading ? '…' : score}</span>
            <span className="text-[10px] text-text-muted">/100</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-2.5">
          {breakdownItems.map(item => (
            <div key={item.label}>
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-text-muted">{item.label}</span>
                <span className="text-[10px] text-text-secondary font-medium">{isLoading ? '…' : item.value ?? 0}/{item.max}</span>
              </div>
              <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: isLoading ? '0%' : `${Math.min(100, ((item.value || 0) / item.max) * 100)}%`, backgroundColor: scoreColor }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {insight && (
        <div className="mt-4 bg-surface-panel border border-surface-border rounded-xl px-4 py-3">
          <p className="text-xs text-text-secondary leading-relaxed">{insight}</p>
        </div>
      )}
    </div>
  )
}

// ── Intelligence cards — AI pattern insights ─────────────────────────────────
function IntelligenceCards({ insights, isLoading }) {
  if (isLoading) return (
    <div className="space-y-3 mb-6">
      {[...Array(3)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
    </div>
  )
  if (!insights?.length) return (
    <Section title="Business Intelligence" subtitle="Patterns Clutch detects from your activity">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">🔍</p>
        <p className="text-sm text-text-muted">Send a few messages and Clutch will start surfacing patterns in your outreach.</p>
      </div>
    </Section>
  )

  const typeStyles = {
    pattern:     { border: 'border-primary/20',  bg: 'bg-primary/5',  accent: 'text-primary-glow' },
    opportunity: { border: 'border-success/20',  bg: 'bg-success/5',  accent: 'text-success' },
    warning:     { border: 'border-warning/20',  bg: 'bg-warning/5',  accent: 'text-warning' },
    milestone:   { border: 'border-primary/30',  bg: 'bg-primary/8',  accent: 'text-primary-glow' },
  }

  return (
    <Section title="Business Intelligence" subtitle="Patterns Clutch detected from your activity">
      <div className="space-y-3">
        {insights.map((ins, i) => {
          const s = typeStyles[ins.type] || typeStyles.pattern
          return (
            <div key={i} className={`border ${s.border} ${s.bg} rounded-xl p-4`}>
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">{ins.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold mb-1 ${s.accent}`}>{ins.title}</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{ins.body}</p>
                  {ins.action && (
                    <p className="text-[11px] text-text-muted mt-2 italic">→ {ins.action}</p>
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

// ── Message Quality — NEW ─────────────────────────────────────────────────────
function MessageQualitySection({ isLoading: parentLoading }) {
  const { data: snapshot, isLoading } = useMetricsCommunicationSnapshot()
  const loading = parentLoading || isLoading

  if (loading) return <div className="h-48 skeleton rounded-xl mb-6" />
  if (!snapshot?.has_data) {
    // Show CTA when there is genuinely no data yet (not while loading)
    if (loading) return null
    return (
      <Section title="Message Quality" subtitle="Tracks how your outreach messages score over time">
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm text-text-muted">Log outcomes on your sent messages and Clutch will start scoring your message quality.</p>
        </div>
      </Section>
    )
  }

  const { dimensions = {}, composite_score, composite_delta, top_weakness,
          top_strength, weekly_trend = [], top_patterns = [], top_failure_categories = [],
          messages_analyzed } = snapshot

  const dimEntries = Object.entries(dimensions).filter(([, d]) => d.score != null)
  const maxScore = 10

  const deltaColor = composite_delta > 0.3 ? 'text-success' : composite_delta < -0.3 ? 'text-error' : 'text-text-muted'
  const deltaSign  = composite_delta > 0 ? '+' : ''

  const scoreColor = (score) => {
    if (score >= 7.5) return '#10B981'
    if (score >= 5)   return '#F59E0B'
    return '#EF4444'
  }

  const lineData = weekly_trend.length > 1 ? {
    labels: weekly_trend.map(w => {
      const [, m, d] = w.week.split('-')
      return `${m}/${d}`
    }),
    datasets: [{
      label: 'Composite',
      data: weekly_trend.map(w => w.composite),
      borderColor: '#6366F1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#6366F1',
    }],
  } : null

  return (
    <Section
      title="Message Quality"
      subtitle={`Based on ${messages_analyzed} analyzed messages${composite_score != null ? ` · Avg score: ${composite_score}/10` : ''}`}
      action={composite_delta != null && (
        <span className={`text-xs font-semibold ${deltaColor}`}>
          {deltaSign}{composite_delta?.toFixed(1)} this week
        </span>
      )}
    >
      <div className="space-y-3">
        {/* 6-dimension breakdown */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">Dimension Scores (0–10)</p>
          <div className="space-y-2.5">
            {dimEntries.map(([key, dim]) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-text-secondary">{dim.label || DIMENSION_LABELS[key] || key}</span>
                    {key === top_weakness && (
                      <span className="text-[9px] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full font-medium">needs work</span>
                    )}
                    {key === top_strength && (
                      <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded-full font-medium">strongest</span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-text-primary">{dim.score?.toFixed(1)}</span>
                </div>
                <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(dim.score / maxScore) * 100}%`,
                      backgroundColor: scoreColor(dim.score),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Trend chart + failure categories side by side */}
        <div className="grid grid-cols-2 gap-3">
          {lineData ? (
            <div className="bg-surface-card border border-surface-border rounded-xl p-4">
              <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-2">Score Trend</p>
              <div className="h-24">
                <Line data={lineData} options={{
                  ...CHART_OPTIONS,
                  scales: { ...CHART_OPTIONS.scales, y: { ...CHART_OPTIONS.scales.y, min: 0, max: 10 } }
                }} />
              </div>
            </div>
          ) : <div />}

          {top_failure_categories.length > 0 && (
            <div className="bg-surface-card border border-surface-border rounded-xl p-4">
              <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">Top Issues</p>
              <div className="space-y-1.5">
                {top_failure_categories.slice(0, 4).map(({ category, count }) => (
                  <div key={category} className="flex items-center justify-between">
                    <span className="text-[10px] text-text-secondary truncate">{FAILURE_CATEGORY_LABELS[category] || category}</span>
                    <span className="text-[10px] font-semibold text-error ml-2">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active patterns from this data */}
        {top_patterns.length > 0 && (
          <div className="space-y-2">
            {top_patterns.slice(0, 2).map((p, i) => (
              <div key={i} className="bg-surface-panel border border-surface-border rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0">
                    {p.type === 'success_signal' ? '✅' : p.type === 'weakness' ? '⚠️' : '🔍'}
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold text-text-primary">{p.label}</p>
                    {p.recommendation && (
                      <p className="text-[10px] text-text-muted mt-0.5">→ {p.recommendation}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Milestones — achievements + approaching ───────────────────────────────────
function MilestonesSection({ milestonesData, isLoading }) {
  const milestones = milestonesData?.milestones || []
  const approaching = milestonesData?.approaching || []

  if (isLoading) return (
    <div className="space-y-3 mb-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[...Array(4)].map((_, i) => <div key={i} className="w-32 h-20 skeleton rounded-xl shrink-0" />)}
      </div>
    </div>
  )

  const hasAny = milestones.length > 0 || approaching.length > 0

  if (!hasAny) return (
    <Section title="Milestones" subtitle="Achievements you'll unlock as you grow">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">🗺️</p>
        <p className="text-sm text-text-muted">Send your first message to unlock your first milestone.</p>
      </div>
    </Section>
  )

  return (
    <Section title={`Milestones${milestones.length > 0 ? ` (${milestones.length} unlocked)` : ''}`} subtitle="Business achievements hit with Clutch">
      <div className="space-y-3">
        {/* Achieved */}
        {milestones.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {milestones.map((m, i) => (
              <div key={i} className="shrink-0 w-28 bg-surface-card border border-surface-border rounded-xl p-3 text-center">
                <p className="text-2xl mb-1.5">{m.icon}</p>
                <p className="text-[11px] font-semibold text-text-primary leading-tight">{m.title}</p>
                <p className="text-[10px] text-text-muted mt-1 leading-tight">{m.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Approaching milestones */}
        {approaching.length > 0 && (
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-primary-glow uppercase tracking-wide mb-3">🎯 You're Close</p>
            <div className="space-y-3">
              {approaching.map((m, i) => {
                const pct = Math.round((m.current / m.threshold) * 100)
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{m.icon}</span>
                        <span className="text-[11px] font-medium text-text-primary">{m.title}</span>
                      </div>
                      <span className="text-[10px] text-primary-glow font-semibold">{m.gap} to go</span>
                    </div>
                    <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-text-muted mt-1">{m.current} / {m.threshold} {m.desc}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ── Activity chart ───────────────────────────────────────────────────────────
function ActivityChart({ chartData, isLoading }) {
  if (isLoading) return <div className="h-44 skeleton rounded-xl mb-6" />
  if (!chartData?.length) return null

  const labels = chartData.map(d => {
    const [, m, day] = d.date.split('-')
    return `${m}/${day}`
  })

  const sentData = {
    labels,
    datasets: [{
      label: 'Sent',
      data: chartData.map(d => d.sent),
      backgroundColor: 'rgba(99,102,241,0.7)',
      borderRadius: 3,
    }, {
      label: 'Replies',
      data: chartData.map(d => d.positive),
      backgroundColor: 'rgba(16,185,129,0.55)',
      borderRadius: 3,
    }],
  }

  return (
    <Section title="30-Day Outreach" subtitle="Messages sent vs positive replies">
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <div className="h-44">
          <Bar data={sentData} options={CHART_OPTIONS} />
        </div>
        <div className="flex gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-500/70" /><span className="text-[10px] text-text-muted">Sent</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/55" /><span className="text-[10px] text-text-muted">Replies</span></div>
        </div>
      </div>
    </Section>
  )
}

// ── Learning progress ────────────────────────────────────────────────────────
function LearningSection({ learning, isLoading }) {
  if (isLoading) return <div className="h-32 skeleton rounded-xl mb-6" />
  if (!learning?.total_sessions) return (
    <Section title="Learning Progress" subtitle="Your sales skill development over time">
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">🎓</p>
        <p className="text-sm text-text-muted">Complete practice sessions to track your learning curve.</p>
      </div>
    </Section>
  )

  const { weekly_trend = [], best_score, total_sessions, scenario_breakdown = {}, skill_rates = {} } = learning

  const lineData = weekly_trend.length > 1 ? {
    labels: weekly_trend.map(w => {
      const [, m, d] = w.week.split('-')
      return `${m}/${d}`
    }),
    datasets: [{
      label: 'Avg Score',
      data: weekly_trend.map(w => w.avg),
      borderColor: '#6366F1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: '#6366F1',
    }],
  } : null

  const topScenarios = Object.entries(scenario_breakdown)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <Section
      title="Learning Progress"
      subtitle={`${total_sessions} sessions completed${best_score != null ? ` · Best score: ${best_score}/100` : ''}`}
    >
      <div className="space-y-3">
        {lineData && (
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <p className="text-[10px] text-text-muted mb-3 uppercase tracking-wide font-medium">Message Score Over Time</p>
            <div className="h-32">
              <Line data={lineData} options={{ ...CHART_OPTIONS, scales: { ...CHART_OPTIONS.scales, y: { ...CHART_OPTIONS.scales.y, min: 0, max: 100 } } }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">Skill Rates</p>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-text-secondary">Asks questions</span>
                  <span className="text-[11px] font-semibold text-text-primary">{skill_rates.asks_questions ?? 0}%</span>
                </div>
                <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${skill_rates.asks_questions ?? 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-text-secondary">Handles objections</span>
                  <span className="text-[11px] font-semibold text-text-primary">{skill_rates.handles_objections ?? 0}%</span>
                </div>
                <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full" style={{ width: `${skill_rates.handles_objections ?? 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-card border border-surface-border rounded-xl p-4">
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">Top Scenarios</p>
            <div className="space-y-1.5">
              {topScenarios.length ? topScenarios.map(([type, count]) => (
                <div key={type} className="flex justify-between">
                  <span className="text-[11px] text-text-secondary capitalize">{type.replace('_', ' ')}</span>
                  <span className="text-[11px] font-medium text-text-primary">{count}×</span>
                </div>
              )) : <p className="text-[11px] text-text-muted">No data yet</p>}
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Practice Skill Progress ───────────────────────────────────────────────────
function PracticeSkillProgress({ isLoading: parentLoading }) {
  const { data: summary, isLoading: summaryLoading } = usePracticeProgressSummary()

  if (parentLoading || summaryLoading) return <div className="h-48 skeleton rounded-xl mb-6" />

  const wow = summary?.week_over_week
  const hasData = wow && Object.values(wow).some(v => v.to > 0)
  if (!hasData) {
    if (parentLoading || summaryLoading) return <div className="h-48 skeleton rounded-xl mb-6" />
    return (
      <Section title="Practice Skill Axes" subtitle="Week-over-week skill development">
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
          <p className="text-2xl mb-2">🎯</p>
          <p className="text-sm text-text-muted">Complete a few practice sessions this week to see your skill axes and week-over-week progress.</p>
        </div>
      </Section>
    )
  }

  const { breakthrough, weakest_axis, approaching_milestone = [], streak = 0,
          this_week_count = 0, last_week_count = 0, outcome_distribution = {} } = summary

  const axes = Object.entries(wow)
    .filter(([, v]) => v.to > 0)
    .sort((a, b) => b[1].to - a[1].to)

  const deltaColor = (delta) => {
    if (delta > 5)  return 'text-success'
    if (delta > 0)  return 'text-success/70'
    if (delta < -5) return 'text-error'
    if (delta < 0)  return 'text-error/70'
    return 'text-text-muted'
  }

  const outcomeLabels = {
    booked_meeting:   '📅 Meeting booked',
    strong_interest:  '🔥 Strong interest',
    deal_closed:      '🏆 Deal closed',
    polite_decline:   '🤝 Polite decline',
    ghosted:          '👻 Ghosted',
    manual_end:       '⏹ Manual end',
  }

  return (
    <Section
      title="Practice Skill Axes"
      subtitle={`Week-over-week · ${this_week_count} sessions this week${last_week_count > 0 ? ` vs ${last_week_count} last week` : ''}`}
    >
      <div className="space-y-3">
        {(breakthrough || weakest_axis) && (
          <div className="grid grid-cols-2 gap-3">
            {breakthrough && (
              <div className="bg-success/5 border border-success/20 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-success uppercase tracking-wide mb-1">🚀 Biggest Gain</p>
                <p className="text-xs font-semibold text-text-primary">{AXIS_LABELS[breakthrough.axis] || breakthrough.axis}</p>
                <p className="text-[11px] text-success mt-0.5">+{breakthrough.delta} pts this week</p>
                <p className="text-[10px] text-text-muted">{breakthrough.from} → {breakthrough.to}</p>
              </div>
            )}
            {weakest_axis && (
              <div className="bg-warning/5 border border-warning/20 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-warning uppercase tracking-wide mb-1">⚠ Needs Work</p>
                <p className="text-xs font-semibold text-text-primary">{AXIS_LABELS[weakest_axis.axis] || weakest_axis.axis}</p>
                <p className="text-[11px] text-warning mt-0.5">Score: {weakest_axis.to}/100</p>
                <p className="text-[10px] text-text-muted">Practice this scenario more</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-surface-card border border-surface-border rounded-xl p-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-3">All Skill Axes (this week)</p>
          <div className="space-y-3">
            {axes.map(([axis, data]) => (
              <div key={axis}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-text-secondary">{AXIS_LABELS[axis] || axis}</span>
                  <div className="flex items-center gap-2">
                    {data.delta !== 0 && (
                      <span className={`text-[10px] font-semibold ${deltaColor(data.delta)}`}>
                        {data.delta > 0 ? '+' : ''}{data.delta}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-text-primary">{data.to}</span>
                  </div>
                </div>
                <div className="relative h-2 bg-surface-border rounded-full overflow-hidden">
                  {data.from > 0 && (
                    <div className="absolute inset-y-0 left-0 rounded-full bg-surface-mid" style={{ width: `${data.from}%` }} />
                  )}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                    style={{
                      width: `${data.to}%`,
                      backgroundColor: data.delta > 0 ? '#10B981' : data.delta < 0 ? '#EF4444' : '#6366F1',
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {approaching_milestone.length > 0 && (
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-primary-glow uppercase tracking-wide mb-2">🎯 Approaching Practice Milestones</p>
            <div className="space-y-1.5">
              {approaching_milestone.slice(0, 3).map((m, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[11px] text-text-secondary">{AXIS_LABELS[m.axis] || m.axis}</span>
                  <span className="text-[10px] text-primary-glow font-semibold">{m.current} → {m.milestone} ({m.gap} to go)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-card border border-surface-border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold font-display text-text-primary">{streak}</p>
            <p className="text-[10px] text-text-muted mt-0.5">day practice streak 🔥</p>
          </div>

          <div className="bg-surface-card border border-surface-border rounded-xl p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wide font-medium mb-2">Session Outcomes</p>
            <div className="space-y-1">
              {Object.entries(outcome_distribution)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="text-[10px] text-text-secondary truncate">{outcomeLabels[type] || type}</span>
                    <span className="text-[10px] font-semibold text-text-primary ml-2">{count}×</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}

// ── Objection Snapshot — NEW ──────────────────────────────────────────────────
function ObjectionSnapshot({ isLoading: parentLoading }) {
  const { data: objData, isLoading } = useInsightsObjections()
  const loading = parentLoading || isLoading

  if (loading) return <div className="h-28 skeleton rounded-xl mb-6" />

  const objections = objData?.objections || []
  if (!objections.length) {
    if (loading) return <div className="h-28 skeleton rounded-xl mb-6" />
    return (
      <Section title="Why They're Not Biting" subtitle="Most common reasons your outreach doesn't convert">
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
          <p className="text-2xl mb-2">💬</p>
          <p className="text-sm text-text-muted">Log a few conversation outcomes and Clutch will identify the patterns holding back your replies.</p>
        </div>
      </Section>
    )
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

  const top = objections[0]
  const total = objections.reduce((s, o) => s + (o.occurrence_count || 0), 0)

  return (
    <Section title="Why They're Not Biting" subtitle="Most common reasons your outreach doesn't convert">
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        {/* Top objection highlight */}
        <div className="flex items-center gap-3 pb-3 mb-3 border-b border-surface-border">
          <div className="w-10 h-10 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center shrink-0">
            <span className="text-xl">{OBJECTION_ICONS[top.objection_type] || '💬'}</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-text-primary capitalize">
              #{1} — {top.objection_type.replace('_', ' ')} ({top.occurrence_count}×)
            </p>
            {top.objection_phrase && (
              <p className="text-[10px] text-text-muted mt-0.5 italic truncate">"{top.objection_phrase?.slice(0, 80)}"</p>
            )}
          </div>
          {top.avg_practice_score != null && (
            <div className="text-right shrink-0">
              <p className="text-[10px] text-text-muted">Practice score</p>
              <p className={`text-sm font-bold ${top.avg_practice_score >= 70 ? 'text-success' : top.avg_practice_score >= 50 ? 'text-warning' : 'text-error'}`}>
                {top.avg_practice_score}/100
              </p>
            </div>
          )}
        </div>

        {/* Frequency bars */}
        <div className="space-y-2">
          {objections.slice(0, 5).map((obj, i) => {
            const pct = total > 0 ? Math.round((obj.occurrence_count / total) * 100) : 0
            return (
              <div key={obj.objection_type} className="flex items-center gap-2">
                <span className="text-sm w-5 shrink-0">{OBJECTION_ICONS[obj.objection_type] || '💬'}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-text-secondary capitalize">{obj.objection_type.replace('_', ' ')}</span>
                    <span className="text-[10px] text-text-muted">{obj.occurrence_count}×</span>
                  </div>
                  <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-error/50 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-text-muted mt-3 text-center">
          Go to <span className="text-primary-glow">Insights</span> for detailed analysis and market tactics
        </p>
      </div>
    </Section>
  )
}

// ── Goal progress bars ───────────────────────────────────────────────────────
function GoalProgressSection({ goals, isLoading }) {
  if (isLoading || !goals?.length) return null
  const goalsWithTargets = goals.filter(g => g.pct != null)
  if (!goalsWithTargets.length) return null

  return (
    <Section title="Goal Progress" subtitle="Active goals progress at a glance">
      <div className="bg-surface-card border border-surface-border rounded-xl p-4 space-y-3">
        {goalsWithTargets.map((g, i) => (
          <div key={i}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-text-secondary truncate max-w-[75%]">{g.text}</span>
              <span className={`text-xs font-semibold ${g.pct >= 100 ? 'text-success' : g.pct >= 50 ? 'text-warning' : 'text-text-muted'}`}>
                {g.pct}%
              </span>
            </div>
            <div className="h-2 bg-surface-border rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${g.pct}%`, backgroundColor: g.pct >= 100 ? '#10B981' : g.pct >= 50 ? '#F59E0B' : '#6366F1' }} />
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Pipeline funnel ───────────────────────────────────────────────────────────
function PipelineFunnel({ pipeline, todayStats, weekStats, isLoading }) {
  if (isLoading) return <div className="h-40 skeleton rounded-xl mb-6" />

  const stages = [
    { label: 'Discovered',   value: weekStats?.discovered || 0,       color: '#6366F1', icon: '🔍' },
    { label: 'Sent',         value: weekStats?.sent || 0,             color: '#8B5CF6', icon: '📤' },
    { label: 'Replied',      value: pipeline?.replied_count || 0,     color: '#F59E0B', icon: '💬' },
    { label: 'Demo/Call',    value: pipeline?.call_demo_count || 0,   color: '#10B981', icon: '📞' },
    { label: 'Won',          value: pipeline?.closed_won_count || 0,  color: '#34D399', icon: '🏆' },
  ]

  const maxVal = Math.max(...stages.map(s => s.value), 1)

  return (
    <Section title="Pipeline Funnel" subtitle="This week → all time">
      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        {pipeline?.total_revenue > 0 && (
          <div className="mb-4 bg-success/8 border border-success/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">💰</span>
            <div>
              <p className="text-xs font-semibold text-success">${pipeline.total_revenue.toLocaleString()} revenue closed</p>
              <p className="text-[10px] text-text-muted">${(pipeline.pipeline_value || 0).toLocaleString()} still in pipeline</p>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {stages.map(stage => (
            <div key={stage.label} className="flex items-center gap-3">
              <span className="text-sm w-5 shrink-0">{stage.icon}</span>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-text-secondary">{stage.label}</span>
                  <span className="text-[11px] font-semibold text-text-primary">{stage.value}</span>
                </div>
                <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(stage.value / maxVal) * 100}%`, backgroundColor: stage.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ── Today's stats strip ──────────────────────────────────────────────────────
function StatsStrip({ dashboard, isLoading }) {
  if (isLoading) return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
    </div>
  )

  const stats = [
    { label: 'Today sent',   value: dashboard?.today?.sent ?? 0,                  icon: '📤' },
    { label: 'This week',    value: dashboard?.week?.sent ?? 0,                   icon: '📅' },
    { label: 'Reply rate',   value: `${dashboard?.overall?.positive_rate ?? 0}%`, icon: '💬' },
    { label: 'Practice',     value: dashboard?.practice?.sessions_30d ?? 0,       icon: '🎓' },
  ]

  return (
    <div className="grid grid-cols-4 gap-2.5 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-surface-card border border-surface-border rounded-xl p-3 text-center">
          <p className="text-base mb-0.5">{s.icon}</p>
          <p className="text-lg font-bold font-display text-text-primary">{s.value}</p>
          <p className="text-[10px] text-text-muted">{s.label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Token usage ──────────────────────────────────────────────────────────────
function TokenUsageSection({ usage, isLoading }) {
  if (isLoading || !usage) return null
  const pct = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0

  return (
    <Section title="AI Usage">
      <div className="bg-surface-card border border-surface-border rounded-xl p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-text-muted">Tokens used this period</span>
          <span className="text-xs font-semibold text-text-primary">{pct}%</span>
        </div>
        <div className="h-2 bg-surface-border rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#6366F1' }} />
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] text-text-muted">{(usage.used || 0).toLocaleString()} used</span>
          <span className="text-[10px] text-text-muted">{(usage.limit || 0).toLocaleString()} limit</span>
        </div>
      </div>
    </Section>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function MetricsPage() {
  const { data: dashboard,        isLoading: dashLoading }   = useDashboard()
  const { data: momentum,         isLoading: momLoading }    = useMomentumScore()
  const { data: intelligenceData, isLoading: intelLoading }  = useMetricsIntelligence()
  const { data: milestonesData,   isLoading: milLoading }    = useMetricsMilestones()
  const { data: learningData,     isLoading: learnLoading }  = useMetricsLearning()
  const { data: tokenUsage,       isLoading: tokenLoading }  = useTokenUsage()

  const isLoading = dashLoading || momLoading

  return (
    <>
      <TopBar title="Metrics" />
      <PageContent>

        {/* 1. Momentum Score */}
        <MomentumScoreCard
          score={momentum?.score ?? dashboard?.momentum_score ?? 0}
          trend={momentum?.trend}
          insight={momentum?.insight}
          breakdown={momentum?.breakdown}
          isLoading={isLoading || momLoading}
        />

        {/* 2. Stats strip */}
        <StatsStrip dashboard={dashboard} isLoading={dashLoading} />

        {/* 3. Business Intelligence cards */}
        <IntelligenceCards
          insights={intelligenceData?.insights}
          isLoading={intelLoading}
        />

        {/* 3.5 Objection Snapshot — moved here: thematically adjacent to intelligence/outreach */}
        <ObjectionSnapshot isLoading={dashLoading} />

        {/* 4. Message Quality */}
        <MessageQualitySection isLoading={intelLoading} />

        {/* 5. Milestones — enhanced with badges + approaching */}
        <MilestonesSection
          milestonesData={milestonesData}
          isLoading={milLoading}
        />

        {/* 6. Activity chart */}
        <ActivityChart chartData={dashboard?.chart_data} isLoading={dashLoading} />

        {/* 7. Learning progress */}
        <LearningSection learning={learningData} isLoading={learnLoading} />

        {/* 8. Practice skill axis progress */}
        <PracticeSkillProgress isLoading={learnLoading} />

        {/* 9. Goal progress */}
        <GoalProgressSection goals={dashboard?.goals} isLoading={dashLoading} />

        {/* 10. Pipeline funnel */}
        <PipelineFunnel
          pipeline={dashboard?.pipeline}
          todayStats={dashboard?.today}
          weekStats={dashboard?.week}
          isLoading={dashLoading}
        />

        {/* 11. Token usage */}
        <TokenUsageSection usage={tokenUsage} isLoading={tokenLoading} />

      </PageContent>
    </>
  )
}
