import React from 'react'
import { scoreColor } from '../../utils/formatters'

// ── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'default', className = '' }) {
  const colors = {
    default: 'bg-surface-border text-text-muted',
    blue: 'bg-primary/15 text-primary-glow',
    green: 'bg-success/15 text-success',
    amber: 'bg-warning/15 text-warning',
    red: 'bg-error/15 text-error',
    purple: 'bg-purple-500/15 text-purple-400',
    gray: 'bg-surface-mid/30 text-text-muted',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colors[color]} ${className}`}>
      {children}
    </span>
  )
}

// ── Status Pill ──────────────────────────────────────────────────────────────
export function StatusPill({ status }) {
  const config = {
    pending: { label: 'Pending', cls: 'pill-pending', dot: 'bg-warning' },
    active: { label: 'Active', cls: 'pill-pending', dot: 'bg-warning' },
    sent: { label: 'Sent', cls: 'pill-sent', dot: 'bg-primary' },
    contacted: { label: 'Sent', cls: 'pill-sent', dot: 'bg-primary' },
    positive: { label: 'Positive', cls: 'pill-positive', dot: 'bg-success' },
    negative: { label: 'Negative', cls: 'pill-negative', dot: 'bg-error' },
    replied: { label: 'Replied', cls: 'pill-positive', dot: 'bg-success' },
    done: { label: 'Done', cls: 'pill-positive', dot: 'bg-success' },
  }
  const c = config[status] || config.pending
  return (
    <span className={c.cls}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

// ── Platform Badge ───────────────────────────────────────────────────────────
export function PlatformBadge({ platform }) {
  const colors = {
    reddit: 'text-orange-400 bg-orange-400/10',
    twitter: 'text-sky-400 bg-sky-400/10',
    linkedin: 'text-blue-400 bg-blue-400/10',
    instagram: 'text-pink-400 bg-pink-400/10',
    facebook: 'text-blue-500 bg-blue-500/10',
  }
  const c = colors[platform?.toLowerCase()] || 'text-text-muted bg-surface-border'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${c}`}>
      {platform || 'unknown'}
    </span>
  )
}

// ── Score Bar ────────────────────────────────────────────────────────────────
export function ScoreBar({ score, showLabel = true, size = 'md' }) {
  if (!score && score !== 0) return null
  const color = scoreColor(score)
  const pct = (score / 10) * 100
  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2' }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-surface-border rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {score?.toFixed(1)}
        </span>
      )}
    </div>
  )
}

// ── Stage Badge ──────────────────────────────────────────────────────────────
export function StageBadge({ stage }) {
  const config = {
    new: { label: 'New', color: '#64748B' },
    contacted: { label: 'Contacted', color: '#3B82F6' },
    replied: { label: 'Replied', color: '#8B5CF6' },
    call_demo: { label: 'Call / Demo', color: '#F59E0B' },
    closed_won: { label: 'Won', color: '#10B981' },
    closed_lost: { label: 'Lost', color: '#F43F5E' },
  }
  const c = config[stage] || config.new
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
      style={{ color: c.color, background: `${c.color}18` }}
    >
      {c.label}
    </span>
  )
}
