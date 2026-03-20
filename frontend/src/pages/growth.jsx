// src/pages/growth.jsx
// ============================================================
// GROWTH HISTORY PAGE
// Lets users browse past daily tips (tip, challenge, reflection)
// and their weekly plans — so nothing valuable gets lost.
// ============================================================

import React, { useState } from 'react'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { useGrowthHistory } from '../services/queries'
import { SkeletonCard } from '../components/ui/Skeleton'

// ── Card type config ──────────────────────────────────────────────────────────
const CARD_CONFIG = {
  tip:        { icon: '💡', label: 'Tip',        color: 'text-primary-glow bg-primary/10 border-primary/20' },
  challenge:  { icon: '⚡', label: 'Challenge',  color: 'text-warning bg-warning/10 border-warning/20' },
  reflection: { icon: '🪞', label: 'Reflection', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  resource:   { icon: '📖', label: 'Resource',   color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  strategy:   { icon: '🗓️', label: 'Weekly Plan', color: 'text-success bg-success/10 border-success/20' },
}

// ── Tab config ────────────────────────────────────────────────────────────────
const TABS = [
  { key: undefined, label: 'All' },
  { key: 'tips',    label: 'Daily Tips' },
  { key: 'plans',   label: 'Weekly Plans' },
]

// ── GrowthCard ────────────────────────────────────────────────────────────────
function GrowthCard({ card }) {
  const [expanded, setExpanded] = useState(false)
  const config = CARD_CONFIG[card.card_type] || CARD_CONFIG.tip

  const date = card.created_at
    ? new Date(card.created_at).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric'
      })
    : ''

  return (
    <div
      className="bg-surface-card border border-surface-border rounded-xl p-4 hover:border-surface-mid transition-all cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${config.color}`}>
            {config.icon} {config.label}
          </span>
          {card.metadata?.difficulty && (
            <span className="text-xs text-text-muted bg-surface-panel px-2 py-0.5 rounded-full border border-surface-border">
              {card.metadata.difficulty}
            </span>
          )}
        </div>
        <span className="text-xs text-text-muted shrink-0">{date}</span>
      </div>

      <h3 className="text-sm font-semibold text-text-primary leading-snug mb-1">
        {card.title}
      </h3>

      <p className={`text-sm text-text-secondary leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
        {card.body}
      </p>

      {/* Weekly plan daily actions */}
      {expanded && card.card_type === 'strategy' && card.metadata?.daily_actions?.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-surface-border pt-3">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Daily Actions</p>
          {card.metadata.daily_actions.map((action, i) => (
            <div key={i} className="flex gap-2 text-xs text-text-secondary">
              <span className="text-primary-glow shrink-0">→</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}

      {card.metadata?.estimated_time && (
        <p className="text-xs text-text-muted mt-2">
          ⏱ {card.metadata.estimated_time}
        </p>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ type }) {
  const messages = {
    tips:  { emoji: '💡', title: 'No daily tips yet', body: 'Your personalized daily tips will appear here once Clutch generates them. Check back after your first full day.' },
    plans: { emoji: '🗓️', title: 'No weekly plans yet', body: 'Your AI-generated weekly plans will archive here every week.' },
    all:   { emoji: '🌱', title: 'Nothing here yet', body: 'Daily tips and weekly plans will appear here as Clutch generates them for you.' },
  }
  const msg = messages[type || 'all']
  return (
    <div className="text-center py-16">
      <span className="text-5xl block mb-4">{msg.emoji}</span>
      <h3 className="text-base font-semibold text-text-primary mb-1">{msg.title}</h3>
      <p className="text-sm text-text-muted max-w-xs mx-auto">{msg.body}</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GrowthHistoryPage() {
  const [activeTab, setActiveTab] = useState(undefined)
  // Issue 23 fix: destructure isError + refetch so the page can show a retry
  // button instead of silently rendering an empty state when the request fails.
  const { data, isLoading, isError, refetch } = useGrowthHistory(activeTab)
  const cards = data?.cards || []

  return (
    <>
      <TopBar title="Growth History" />
      <PageContent>
        <div className="mb-5">
          <h1 className="text-xl font-bold font-display text-text-primary">Your Growth Library</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Every daily tip and weekly plan Clutch has generated for you — saved here to revisit anytime.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-surface-panel border border-surface-border rounded-xl p-1">
          {TABS.map(tab => (
            <button
              key={String(tab.key)}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-lg transition-all ${
                activeTab === tab.key
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        ) : isError ? (
          /* Issue 23 fix: error state with retry — previously fell through to EmptyState
             silently, giving users no way to recover from a network/server error */
          <div className="text-center py-16">
            <span className="text-4xl block mb-4">⚠️</span>
            <h3 className="text-base font-semibold text-text-primary mb-1">Could not load your growth library</h3>
            <p className="text-sm text-text-muted mb-5 max-w-xs mx-auto">
              There was a problem fetching your tips and plans. This is usually temporary.
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-surface-card border border-surface-border text-text-secondary hover:border-surface-mid transition-all"
            >
              Try again
            </button>
          </div>
        ) : cards.length === 0 ? (
          <EmptyState type={activeTab} />
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <GrowthCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </PageContent>
    </>
  )
}
