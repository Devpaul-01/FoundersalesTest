// src/pages/prospects.jsx
// ============================================================
// PROSPECT RELATIONSHIP HUB
// The missing CRM. Every unique contact with a health score,
// full timeline, signals, commitments, and AI summary.
// ============================================================

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useProspectsList, useProspect, useCreateProspect,
  useUpdateProspect, useDeleteProspect, useRefreshProspectSummary,
  useCommitments, useUpdateCommitment, useGenerateCommitmentMessage,
} from '../services/queries'
import Button from '../components/ui/Button'
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { SkeletonCard } from '../components/ui/Skeleton'
import { timeAgo, formatEventDate } from '../utils/formatters'
import toast from 'react-hot-toast'

// ── Health badge ──────────────────────────────────────────────────────────────
function HealthScore({ score, size = 'md' }) {
  if (score === null || score === undefined) return (
    <span className="text-xs text-text-muted">No data</span>
  )
  const color = score >= 70 ? 'bg-green-400' : score >= 40 ? 'bg-yellow-400' : 'bg-red-400'
  const label = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold'
  const textColor = score >= 70 ? 'text-green-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'

  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-border" />
            <circle
              cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6"
              strokeDasharray={`${(score / 100) * 163} 163`}
              className={textColor}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-bold ${textColor}`}>{score}</span>
          </div>
        </div>
        <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className={`text-xs font-semibold ${textColor}`}>{score}</span>
    </div>
  )
}

// ── Signal chip ───────────────────────────────────────────────────────────────
function SignalChip({ signal }) {
  const configs = {
    buying:     { icon: '🔥', color: 'bg-green-400/10 text-green-400 border-green-400/20' },
    risk:       { icon: '⚠️', color: 'bg-red-400/10 text-red-400 border-red-400/20' },
    timing:     { icon: '⏰', color: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
    engagement: { icon: '📡', color: 'bg-purple-400/10 text-purple-400 border-purple-400/20' },
  }
  const cfg = configs[signal.signal_type] || configs.engagement
  return (
    <div className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${cfg.color}`}>
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>
      <span>{signal.signal_text}</span>
    </div>
  )
}

// ── Timeline item ─────────────────────────────────────────────────────────────
function TimelineItem({ item }) {
  const navigate = useNavigate()
  const icons = { event: '📅', chat: '💬', signal: '📡' }

  return (
    <div className="flex gap-3 pb-4 relative">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-surface-panel border border-surface-border flex items-center justify-center text-sm shrink-0">
          {icons[item.type]}
        </div>
        <div className="w-px flex-1 bg-surface-border mt-1" />
      </div>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-sm font-medium text-text-primary truncate">{item.title}</p>
          <span className="text-[10px] text-text-muted shrink-0">{timeAgo(item.date)}</span>
        </div>
        {item.type === 'event' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted capitalize">{item.subtype?.replace('_', ' ')}</span>
            {item.outcome && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                item.outcome === 'hot'      ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' :
                item.outcome === 'positive' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                item.outcome === 'dead'     ? 'text-text-muted bg-surface-border border-surface-border' :
                'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
              }`}>
                {item.outcome}
              </span>
            )}
            {!item.has_debrief && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">No debrief</span>
            )}
          </div>
        )}
        {item.type === 'event' && item.summary && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2 italic">"{item.summary}"</p>
        )}
        {item.type === 'chat' && (
          <button
            onClick={() => navigate(`/chat/${item.id}`)}
            className="text-xs text-text-muted hover:text-primary-glow"
          >
            {item.message_count || 0} messages → view
          </button>
        )}
        {item.type === 'signal' && (
          <p className={`text-xs ${
            item.signal_type === 'buying' ? 'text-green-400' :
            item.signal_type === 'risk'   ? 'text-red-400'   : 'text-text-muted'
          }`}>{item.signal_text}</p>
        )}
      </div>
    </div>
  )
}

// ── Commitment row ─────────────────────────────────────────────────────────────
function CommitmentRow({ commitment }) {
  const update       = useUpdateCommitment()
  const genMessage   = useGenerateCommitmentMessage()
  const [msg, setMsg] = useState(commitment.follow_up_message || null)
  const [copied, setCopied] = useState(false)

  const isOverdue = commitment.status === 'overdue' ||
    (commitment.due_date && commitment.due_date < new Date().toISOString().split('T')[0])

  const markDone = () => update.mutate({ id: commitment.id, status: 'done' })
  const ignore   = () => update.mutate({ id: commitment.id, status: 'ignored' })

  const generateMsg = async () => {
    const res = await genMessage.mutateAsync(commitment.id)
    setMsg(res.message)
  }

  const copy = () => {
    navigator.clipboard.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied!')
  }

  return (
    <div className={`bg-surface-panel border rounded-xl p-3 ${
      isOverdue ? 'border-red-400/30' :
      commitment.status === 'done' ? 'border-surface-border opacity-50' :
      'border-surface-border'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isOverdue && (
              <span className="text-[10px] font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-1.5 py-0.5 rounded-full">Overdue</span>
            )}
            {commitment.owner === 'prospect' && (
              <span className="text-[10px] font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded-full">They committed</span>
            )}
            {commitment.due_date && !isOverdue && (
              <span className="text-[10px] text-text-muted">Due {commitment.due_date}</span>
            )}
          </div>
          <p className="text-sm text-text-primary">{commitment.commitment_text}</p>
          {commitment.prospects?.name && (
            <p className="text-xs text-text-muted mt-0.5">Re: {commitment.prospects.name}</p>
          )}
        </div>

        {commitment.status !== 'done' && commitment.owner === 'founder' && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={markDone}
              disabled={update.isPending}
              className="text-xs text-green-400 hover:text-green-300 bg-green-400/10 border border-green-400/20 px-2.5 py-1 rounded-lg transition-colors"
            >
              ✓ Done
            </button>
            <button
              onClick={ignore}
              disabled={update.isPending}
              className="text-xs text-text-muted hover:text-text-secondary bg-surface-border px-2 py-1 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Message generator */}
      {commitment.status !== 'done' && commitment.owner === 'founder' && (
        <div className="mt-2">
          {msg ? (
            <div className="bg-surface-bg border border-surface-border rounded-lg p-2.5 mt-1">
              <p className="text-xs text-text-secondary whitespace-pre-wrap mb-2">{msg}</p>
              <button onClick={copy} className={`text-xs font-medium transition-colors ${copied ? 'text-green-400' : 'text-text-muted hover:text-primary-glow'}`}>
                {copied ? '✓ Copied!' : 'Copy →'}
              </button>
            </div>
          ) : (
            <button
              onClick={generateMsg}
              disabled={genMessage.isPending}
              className="text-xs text-text-muted hover:text-primary-glow transition-colors mt-1"
            >
              {genMessage.isPending ? 'Generating…' : '✨ Generate follow-up message'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Prospect Detail Modal ─────────────────────────────────────────────────────
function ProspectDetailModal({ prospectId, onClose }) {
  const { data, isLoading } = useProspect(prospectId)
  const refreshSummary      = useRefreshProspectSummary(prospectId)
  const [activeTab, setActiveTab] = useState('timeline') // timeline | signals | commitments
  const navigate = useNavigate()

  const prospect    = data?.prospect
  const timeline    = data?.timeline    || []
  const signals     = data?.signals     || []
  const commitments = data?.commitments || []
  const meetings    = data?.meetings    || []

  const founderCommitments  = commitments.filter(c => c.owner === 'founder'  && c.status !== 'done')
  const prospectCommitments = commitments.filter(c => c.owner === 'prospect' && c.status !== 'done')

  return (
    <Modal isOpen onClose={onClose} title={prospect?.name || 'Prospect'} size="lg">
      <ModalBody className="max-h-[80vh] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>
        ) : (
          <>
            {/* Header stats */}
            <div className="flex items-center gap-4 pb-4 border-b border-surface-border mb-4">
              <HealthScore score={prospect?.relationship_health_score} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-text-primary">{prospect?.name}</p>
                {prospect?.company && <p className="text-sm text-text-secondary">{prospect.title ? `${prospect.title} at ` : ''}{prospect.company}</p>}
                {prospect?.last_contact_at && (
                  <p className="text-xs text-text-muted mt-1">Last contact: {timeAgo(prospect.last_contact_at)}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                  <span>{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</span>
                  <span>{founderCommitments.length} open commitment{founderCommitments.length !== 1 ? 's' : ''}</span>
                  <span>{signals.filter(s => s.signal_type === 'buying').length} buying signal{signals.filter(s => s.signal_type === 'buying').length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            {/* AI summary */}
            {prospect?.ai_summary && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-primary-glow mb-1">🤖 AI Assessment</p>
                    <p className="text-sm text-text-secondary">{prospect.ai_summary}</p>
                    {prospect.ai_summary_updated_at && (
                      <p className="text-[10px] text-text-muted mt-1">Updated {timeAgo(prospect.ai_summary_updated_at)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => refreshSummary.mutate()}
                    disabled={refreshSummary.isPending}
                    className="text-xs text-text-muted hover:text-primary-glow shrink-0"
                  >
                    {refreshSummary.isPending ? '…' : '↻'}
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-surface-panel rounded-xl p-1">
              {[
                { key: 'timeline',    label: `Timeline (${timeline.length})` },
                { key: 'signals',     label: `Signals (${signals.length})` },
                { key: 'commitments', label: `Commitments (${founderCommitments.length + prospectCommitments.length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    activeTab === tab.key ? 'bg-primary/20 text-primary-glow' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'timeline' && (
              timeline.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No interactions yet</p>
              ) : (
                <div className="space-y-0">
                  {timeline.map((item, i) => <TimelineItem key={i} item={item} />)}
                </div>
              )
            )}

            {activeTab === 'signals' && (
              signals.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-8">No signals detected yet — signals are extracted from meeting debriefs and chats</p>
              ) : (
                <div className="space-y-2">
                  {['buying', 'risk', 'timing', 'engagement'].map(type => {
                    const typeSignals = signals.filter(s => s.signal_type === type)
                    if (!typeSignals.length) return null
                    return (
                      <div key={type}>
                        <p className="text-xs font-semibold text-text-muted mb-1.5 capitalize">{type} signals</p>
                        <div className="space-y-1.5">
                          {typeSignals.map(s => <SignalChip key={s.id} signal={s} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {activeTab === 'commitments' && (
              <>
                {founderCommitments.length === 0 && prospectCommitments.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">No open commitments — they're extracted automatically from debriefs</p>
                ) : (
                  <div className="space-y-4">
                    {founderCommitments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-text-muted mb-2">You committed</p>
                        <div className="space-y-2">
                          {founderCommitments.map(c => <CommitmentRow key={c.id} commitment={c} />)}
                        </div>
                      </div>
                    )}
                    {prospectCommitments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-text-muted mb-2">They committed</p>
                        <div className="space-y-2">
                          {prospectCommitments.map(c => <CommitmentRow key={c.id} commitment={c} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={() => navigate('/chat', { state: { newChat: { prospect_id: prospectId } } })}>
          💬 Start chat
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  )
}

// ── Add Prospect Modal ────────────────────────────────────────────────────────
function AddProspectModal({ onClose }) {
  const create = useCreateProspect()
  const [form, setForm] = useState({ name: '', company: '', title: '', email: '', notes: '' })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    try {
      await create.mutateAsync(form)
      toast.success('Prospect added')
      onClose()
    } catch {
      toast.error('Failed to add prospect')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Add prospect" size="sm">
      <ModalBody>
        <div className="space-y-3">
          <Input label="Name *"    value={form.name}    onChange={set('name')}    placeholder="Jane Smith" />
          <Input label="Company"   value={form.company} onChange={set('company')} placeholder="Acme Corp" />
          <Input label="Title"     value={form.title}   onChange={set('title')}   placeholder="Head of Marketing" />
          <Input label="Email"     value={form.email}   onChange={set('email')}   type="email" />
          <Textarea label="Notes" value={form.notes}    onChange={set('notes')}   rows={2} placeholder="How you met, their context…" />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} loading={create.isPending}>Add Prospect</Button>
      </ModalFooter>
    </Modal>
  )
}

// ── Prospect card ─────────────────────────────────────────────────────────────
function ProspectCard({ prospect, onOpen }) {
  const score = prospect.relationship_health_score
  const borderColor = score >= 70 ? 'border-green-400/20' : score >= 40 ? 'border-yellow-400/20' : score !== null ? 'border-red-400/20' : 'border-surface-border'

  return (
    <button
      onClick={() => onOpen(prospect.id)}
      className={`w-full bg-surface-card border ${borderColor} rounded-xl p-4 text-left hover:border-primary/30 hover:shadow-glow-sm transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-base font-bold text-primary-glow shrink-0">
          {(prospect.name || '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-sm font-semibold text-text-primary truncate">{prospect.name}</p>
            <HealthScore score={score} />
          </div>
          {prospect.company && (
            <p className="text-xs text-text-secondary truncate">{prospect.title ? `${prospect.title}, ` : ''}{prospect.company}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
            {prospect.last_contact_at && <span>Last: {timeAgo(prospect.last_contact_at)}</span>}
            {prospect.total_interactions > 0 && <span>{prospect.total_interactions} interactions</span>}
            {prospect.pending_commitments > 0 && (
              <span className="text-amber-400 font-medium">{prospect.pending_commitments} commitment{prospect.pending_commitments > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Commitments page section ───────────────────────────────────────────────────
function CommitmentsSection() {
  const { data } = useCommitments({ status: 'active', owner: 'founder' })
  const overdue   = data?.overdue   || []
  const due_soon  = data?.due_soon  || []
  const pending   = data?.pending   || []

  if (!data) return <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 skeleton rounded-xl" />)}</div>

  if (overdue.length === 0 && due_soon.length === 0 && pending.length === 0) {
    return (
      <div className="text-center py-10">
        <span className="text-3xl mb-2 block">✅</span>
        <p className="text-sm text-text-muted">All caught up — no open commitments</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-400 mb-2">🚨 Overdue ({overdue.length})</p>
          <div className="space-y-2">{overdue.map(c => <CommitmentRow key={c.id} commitment={c} />)}</div>
        </div>
      )}
      {due_soon.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-400 mb-2">⏰ Due soon ({due_soon.length})</p>
          <div className="space-y-2">{due_soon.map(c => <CommitmentRow key={c.id} commitment={c} />)}</div>
        </div>
      )}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted mb-2">📌 Pending ({pending.length})</p>
          <div className="space-y-2">{pending.map(c => <CommitmentRow key={c.id} commitment={c} />)}</div>
        </div>
      )}
    </div>
  )
}

// ── Weekly insights section ────────────────────────────────────────────────────
function InsightsSection() {
  const { data }   = useWeeklyInsights()
  const dismiss    = useDismissInsight()
  const insights   = data?.insights || []

  if (!data) return null
  if (!insights.length) {
    return (
      <div className="bg-surface-panel border border-surface-border rounded-xl p-4 text-center">
        <p className="text-sm text-text-muted">No insights yet — log 3+ meeting debriefs and insights will appear here weekly</p>
      </div>
    )
  }

  const typeConfig = {
    pattern:          { icon: '📊', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
    stall:            { icon: '🚧', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    question_cluster: { icon: '❓', color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
    timing_alert:     { icon: '⏰', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
    win_pattern:      { icon: '🏆', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  }

  return (
    <div className="space-y-3">
      {insights.map(insight => {
        const cfg = typeConfig[insight.insight_type] || typeConfig.pattern
        return (
          <div key={insight.id} className={`border rounded-xl p-4 ${cfg.color}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{cfg.icon}</span>
                <p className="text-sm font-semibold">{insight.title}</p>
              </div>
              <button
                onClick={() => dismiss.mutate(insight.id)}
                className="text-xs opacity-50 hover:opacity-100 shrink-0"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-text-secondary mb-2">{insight.body}</p>
            {insight.suggested_action && (
              <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
                <p className="text-xs font-medium">💡 This week: {insight.suggested_action}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Lazy import — avoid circular deps
function useWeeklyInsights() {
  const { useQuery } = require('@tanstack/react-query')
  const api = require('../services/api').default
  return useQuery({
    queryKey: ['insights', 'weekly'],
    queryFn:  () => api.get('/insights/weekly').then(r => r.data),
    staleTime: 30 * 60 * 1000,
  })
}
function useDismissInsight() {
  const { useMutation, useQueryClient } = require('@tanstack/react-query')
  const api = require('../services/api').default
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/insights/weekly/dismiss/${id}`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['insights', 'weekly'] }),
  })
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProspectsPage() {
  const [activeTab, setActiveTab]       = useState('prospects') // prospects | commitments | insights
  const [sort, setSort]                 = useState('health')
  const [addOpen, setAddOpen]           = useState(false)
  const [selectedId, setSelectedId]    = useState(null)

  const { data, isLoading } = useProspectsList(sort)
  const prospects = data?.prospects || []

  const hot  = prospects.filter(p => (p.relationship_health_score ?? 50) >= 70)
  const warm = prospects.filter(p => { const s = p.relationship_health_score ?? 50; return s >= 40 && s < 70 })
  const cold = prospects.filter(p => (p.relationship_health_score ?? 50) < 40)

  return (
    <>
      <TopBar
        title="Prospects"
        subtitle={`${prospects.length} contacts`}
        actions={<Button size="sm" onClick={() => setAddOpen(true)}>+ Add Prospect</Button>}
      />
      <PageContent>
        {/* Tab bar */}
        <div className="flex gap-1 mb-5 bg-surface-panel rounded-xl p-1 border border-surface-border">
          {[
            { key: 'prospects',   label: `Contacts (${prospects.length})` },
            { key: 'commitments', label: 'Commitments' },
            { key: 'insights',    label: '✨ Insights' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab.key ? 'bg-primary/20 text-primary-glow' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'prospects' && (
          <>
            {/* Sort control */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-text-muted">Sort by</p>
              <div className="flex gap-1">
                {[['health', '🔥 Health'], ['recent', '🕐 Recent']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSort(val)}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      sort === val ? 'bg-primary/15 text-primary-glow' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={2} />)}</div>
            ) : prospects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <span className="text-4xl mb-3">👥</span>
                <h3 className="text-base font-semibold text-text-primary mb-1">No prospects yet</h3>
                <p className="text-sm text-text-muted mb-5 max-w-xs">
                  Prospects are created automatically when you add a calendar event with an attendee. You can also add them manually.
                </p>
                <Button onClick={() => setAddOpen(true)}>+ Add First Prospect</Button>
              </div>
            ) : (
              <div className="space-y-5">
                {hot.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-400 mb-2">🔥 Hot ({hot.length})</p>
                    <div className="space-y-2">{hot.map(p => <ProspectCard key={p.id} prospect={p} onOpen={setSelectedId} />)}</div>
                  </div>
                )}
                {warm.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-yellow-400 mb-2">☀️ Warm ({warm.length})</p>
                    <div className="space-y-2">{warm.map(p => <ProspectCard key={p.id} prospect={p} onOpen={setSelectedId} />)}</div>
                  </div>
                )}
                {cold.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-text-muted mb-2">❄️ Cold ({cold.length})</p>
                    <div className="space-y-2">{cold.map(p => <ProspectCard key={p.id} prospect={p} onOpen={setSelectedId} />)}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'commitments' && <CommitmentsSection />}
        {activeTab === 'insights'    && <InsightsSection />}
      </PageContent>

      {addOpen    && <AddProspectModal onClose={() => setAddOpen(false)} />}
      {selectedId && <ProspectDetailModal prospectId={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  )
}
