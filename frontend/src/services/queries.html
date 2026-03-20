// src/services/queries.js
// ============================================================
// REACT QUERY HOOKS
//
// FIXES:
//  M-01 — useUpdateStage: optimistic update was checking old.opportunities
//          but the pipeline API returns {pipeline: {contacted:[...], ...}, metrics}.
//          Fixed: update moves item between stage arrays in the pipeline object.
//
// NEW:
//  - usePracticeMessages: fetch message history for a practice session
//  - useSendPracticeMessage: send a message to a practice session (with attachments)
//  - usePracticeSessionDetails: get full session info
// ============================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
// QUERY KEYS
// ─────────────────────────────────────────────────────────────────────────────
export const KEYS = {
  me: ['auth', 'me'],
  opportunities: (status) => ['opportunities', status],
  opportunityIntel: (id) => ['opportunities', id, 'intel'],
  followups: ['followups'],
  pipeline: ['pipeline'],
  chats: (type) => ['chats', type],
  chatMessages: (chatId) => ['chat', chatId, 'messages'],
  dashboard: ['metrics', 'dashboard'],
  tokenUsage: ['metrics', 'usage'],
  calendar: ['calendar'],
  // Issue 26: duplicate calendarEvent key removed — only one definition here
  calendarEvent: (id) => ['calendar', id],
  practiceSessions: ['practice', 'sessions'],
  practiceScenarios: ['practice', 'scenarios'],
  practiceMessages: (sessionId) => ['practice', sessionId, 'messages'],
  practiceProgressSummary: ['practice', 'progress-summary'],
  pipelineInsight: ['growth', 'pipeline-insight'],
  suggestions: ['suggestions'],
  pendingConfirmations: ['opportunities', 'pending-confirmations'],
  growthFeed:    ['growth', 'feed'],
  growthCards:   ['growth', 'cards'],
  todayCheckIn:  ['growth', 'checkin', 'today'],
  goals:         ['growth', 'goals'],
  goalNotes:     (goalId) => ['goals', goalId, 'notes'],
  weeklyPlan:    ['growth', 'plan'],
  memory:        ['user', 'memory'],
  calendarAlerts: ['calendar', 'alerts'],
  prospects:      ['prospects'],
  prospect:   (id) => ['prospects', id],
  commitments:        ['commitments'],
  commitmentsSummary: ['commitments', 'summary'],
  insightsWeekly:     ['insights', 'weekly'],
  insightsSignals:    ['insights', 'signals'],
  communicationSnapshot: ['metrics', 'communication-snapshot'],
  insightsSummary:        ['insights', 'summary'],
  insightsPatterns:       ['insights', 'patterns'],
  insightsSkillProgress:  ['insights', 'skill-progression'],
  insightsAutopsies:      (filters) => ['insights', 'autopsies', filters],
  insightsObjections:     ['insights', 'objections'],
  insightsWhyLosing:      ['insights', 'why-losing'],
  insightsVelocity:       ['insights', 'velocity'],
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
export const useMe = (options = {}) =>
  useQuery({
    queryKey: KEYS.me,
    queryFn: () => api.get('/auth/me').then(r => r.data.user),
    staleTime: 5 * 60 * 1000,
    ...options
  })
  
export const useMetricsCommunicationSnapshot = () =>
  useQuery({
    queryKey: ['metrics', 'communication-snapshot'],
    queryFn: () => api.get('/metrics/communication-snapshot').then(r => r.data),
    staleTime: 15 * 60 * 1000,
  })

// ── INSIGHTS — All endpoints ──────────────────────────────────────────────────

/**
 * Lightweight summary widget data for the Insights page header.
 * Returns patterns_count, composite_score, composite_delta, messages_analyzed.
 */
export const useInsightsSummary = () =>
  useQuery({
    queryKey: ['insights', 'summary'],
    queryFn: () => api.get('/insights/summary').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

/**
 * "Why You're Losing" AI-generated report. Cached 24h server-side.
 * Pass `forced=true` via params to force a refresh.
 */
export const useInsightsWhyLosing = (forced = false) =>
  useQuery({
    queryKey: ['insights', 'why-losing', forced],
    queryFn: () => api.get('/insights/why-losing', { params: forced ? { forced: true } : {} }).then(r => r.data),
    staleTime: 30 * 60 * 1000,
  })

/**
 * All active communication patterns detected by the weekly pattern detection job.
 */
export const useInsightsPatterns = () =>
  useQuery({
    queryKey: ['insights', 'patterns'],
    queryFn: () => api.get('/insights/patterns').then(r => r.data),
    staleTime: 30 * 60 * 1000,
  })

/**
 * Weekly skill score progression for chart rendering (last 12 weeks).
 * Includes both conversation_analyses dimension scores and practice skill history.
 */
export const useInsightsSkillProgression = () =>
  useQuery({
    queryKey: ['insights', 'skill-progression'],
    queryFn: () => api.get('/insights/skill-progression').then(r => r.data),
    staleTime: 30 * 60 * 1000,
  })

/**
 * Paginated conversation autopsies list.
 * Filter: 'all' | 'positive' | 'negative'
 */
export const useInsightsAutopsies = ({ filter = 'all', limit = 20, offset = 0 } = {}) =>
  useQuery({
    queryKey: ['insights', 'autopsies', filter, offset],
    queryFn: () => api.get('/insights/autopsies', {
      params: {
        limit,
        offset,
        ...(filter !== 'all' ? { outcome: filter } : {}),
      },
    }).then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

/**
 * Objection frequency tracker with practice gap correlation.
 * Pro users also get Perplexity-powered market intel for the top objection.
 */
export const useInsightsObjections = () =>
  useQuery({
    queryKey: ['insights', 'objections'],
    queryFn: () => api.get('/insights/objections').then(r => r.data),
    staleTime: 15 * 60 * 1000,
  })

/**
 * Per-dimension week-over-week velocity.
 * Returns delta for all 6 dimensions + composite, biggest_gain, biggest_drop,
 * trend_status ('improving' | 'declining' | 'mixed_positive' | 'mixed_negative' | 'stable'),
 * and a human-readable summary sentence. No AI — pure arithmetic, fast.
 */
export const useInsightsVelocity = () =>
  useQuery({
    queryKey: ['insights', 'velocity'],
    queryFn: () => api.get('/insights/velocity').then(r => r.data),
    staleTime: 30 * 60 * 1000,
  })

/**
 * On-demand pitch diagnostic mutation.
 * POST /insights/analyze-message with { message: string }
 * Returns full dimension scores + rewritten version + improvement suggestions.
 */
export const useInsightsAnalyzeMessage = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ message }) =>
      api.post('/insights/analyze-message', { message }).then(r => r.data),
    onSuccess: () => {
      // Invalidate summary (messages_analyzed count changes) and autopsies list
      qc.invalidateQueries({ queryKey: ['insights', 'summary'] })
      qc.invalidateQueries({ queryKey: ['insights', 'autopsies'] })
    },
    onError: () => toast.error('Analysis failed. Try again.'),
  })
}
// Issue 18: queryKey now includes params so different param sets don't share the same cache
export const useCalendar = (params = {}) =>
  useQuery({
    queryKey: ['calendar', params],
    queryFn:  () => api.get('/calendar', { params }).then(r => r.data.events),
    staleTime: 2 * 60 * 1000,
  })

export const useCalendarAlerts = () =>
  useQuery({
    queryKey: ['calendar', 'alerts'],
    queryFn:  () => api.get('/calendar/alerts').then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

export const useCalendarEvent = (id) =>
  useQuery({
    queryKey: ['calendar', id],
    queryFn:  () => api.get(`/calendar/${id}`).then(r => r.data),
    enabled:  !!id,
    staleTime: 60 * 1000,
  })

export const useCreateEvent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/calendar', data).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError:    () => toast.error('Failed to create event'),
  })
}

export const useUpdateEvent = (id) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put(`/calendar/${id}`, data).then(r => r.data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['calendar', id] })
    },
    onError: () => toast.error('Failed to update event'),
  })
}

export const useDeleteEvent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/calendar/${id}`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError:    () => toast.error('Failed to delete event'),
  })
}

export const useSubmitDebrief = (eventId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post(`/calendar/${eventId}/debrief`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['calendar', 'alerts'] })
      qc.invalidateQueries({ queryKey: ['calendar', eventId] })
      qc.invalidateQueries({ queryKey: ['commitments'] })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
    onError: () => toast.error('Failed to save debrief'),
  })
}

export const useStartMeetingNotes = (eventId) =>
  useMutation({
    mutationFn: () => api.post(`/calendar/${eventId}/start-meeting-notes`).then(r => r.data),
    onError:    () => toast.error('Could not start meeting notes'),
  })

export const useRegeneratePrepEnriched = (eventId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/calendar/${eventId}/regenerate-prep`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['calendar', eventId] }),
    onError:    () => toast.error('Failed to regenerate prep'),
  })
}

export const useTriggerResearch = (eventId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/calendar/${eventId}/research`).then(r => r.data),
    onSuccess:  () => {
      toast.success('Research triggered — refresh in a moment')
      setTimeout(() => qc.invalidateQueries({ queryKey: ['calendar', eventId] }), 4000)
    },
    onError: () => toast.error('Failed to trigger research'),
  })
}

// ── PROSPECTS ─────────────────────────────────────────────────────────────────

export const useProspectsList = (sort = 'health') =>
  useQuery({
    queryKey: ['prospects', sort],
    queryFn:  () => api.get('/prospects', { params: { sort } }).then(r => r.data),
    staleTime: 3 * 60 * 1000,
  })

export const useProspect = (id) =>
  useQuery({
    queryKey: ['prospects', id],
    queryFn:  () => api.get(`/prospects/${id}`).then(r => r.data),
    enabled:  !!id,
    staleTime: 60 * 1000,
  })

export const useCreateProspect = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/prospects', data).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['prospects'] }),
    onError:    () => toast.error('Failed to create prospect'),
  })
}

export const useUpdateProspect = (id) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put(`/prospects/${id}`, data).then(r => r.data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['prospects'] })
      qc.invalidateQueries({ queryKey: ['prospects', id] })
    },
    onError: () => toast.error('Failed to update prospect'),
  })
}

export const useRefreshProspectSummary = (id) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/prospects/${id}/refresh-summary`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['prospects', id] }),
    onError:    () => toast.error('Failed to refresh summary'),
  })
}

export const useDeleteProspect = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/prospects/${id}`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['prospects'] }),
    onError:    () => toast.error('Failed to delete prospect'),
  })
}

// ── COMMITMENTS ───────────────────────────────────────────────────────────────

export const useCommitments = (filters = {}) =>
  useQuery({
    queryKey: ['commitments', filters],
    queryFn:  () => api.get('/commitments', { params: filters }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

export const useCommitmentsSummary = () =>
  useQuery({
    queryKey: ['commitments', 'summary'],
    queryFn:  () => api.get('/insights/commitments/summary').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

export const useUpdateCommitment = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/commitments/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commitments'] })
      qc.invalidateQueries({ queryKey: ['prospects'] })
      qc.invalidateQueries({ queryKey: ['calendar', 'alerts'] })
    },
    onError: () => toast.error('Failed to update commitment'),
  })
}

export const useGenerateCommitmentMessage = () =>
  useMutation({
    mutationFn: (id) => api.post(`/commitments/${id}/generate-message`).then(r => r.data),
    onError:    () => toast.error('Failed to generate message'),
  })

// ── INSIGHTS ──────────────────────────────────────────────────────────────────

export const useWeeklyInsights = () =>
  useQuery({
    queryKey: ['insights', 'weekly'],
    queryFn:  () => api.get('/insights/weekly').then(r => r.data),
    staleTime: 30 * 60 * 1000,
  })

export const useDismissInsight = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/insights/weekly/dismiss/${id}`).then(r => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['insights', 'weekly'] }),
  })
}

export const useSignalsSummary = () =>
  useQuery({
    queryKey: ['insights', 'signals'],
    queryFn:  () => api.get('/insights/signals/summary').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })



// Issue 1 fix: onSuccess now receives the response data.
// The synthesis and event_id are returned to the caller so the chat page
// can show a "Log Debrief" prompt and navigate to the correct event.
// Cache invalidations preserved from original.
export const useEndMeeting = (chatId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/chat/${chatId}/end-meeting`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chat', chatId, 'messages'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['calendar', 'alerts'] })
      // data.event_id and data.synthesis are now available to onSuccess callers
      // via the useMutation return value (.mutateAsync result or onSuccess callback arg)
    },
    onError: () => toast.error('Failed to end meeting'),
  })
}
export const useSkillDashboard = () =>
  useQuery({
    queryKey: [...KEYS.practiceSessions, 'dashboard'],
    queryFn: () => api.get('/practice/skill-dashboard').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

export const usePracticeCurriculum = () =>
  useQuery({
    queryKey: [...KEYS.practiceSessions, 'curriculum'],
    queryFn: () => api.get('/practice/curriculum').then(r => r.data),
    staleTime: 60 * 60 * 1000, // 1 hour
  });

export const useSessionReplay = (sessionId) =>
  useQuery({
    queryKey: [...KEYS.practiceSessions, 'replay', sessionId],
    queryFn: () => api.get(`/practice/${sessionId}/replay`).then(r => r.data),
    enabled: !!sessionId,
    staleTime: 30 * 1000,
  });

export const useGeneratePlaybook = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId) => api.post(`/practice/${sessionId}/generate-playbook`).then(r => r.data),
    onSuccess: (_, sessionId) => qc.invalidateQueries({ queryKey: [...KEYS.practiceSessions, 'replay', sessionId] }),
  });
}

export const useOpenCoachingChat = () =>
  useMutation({
    mutationFn: (sessionId) => api.post(`/practice/${sessionId}/open-coaching-chat`).then(r => r.data),
  });
  
export const useUpdateProfile = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/auth/me', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me })
      toast.success('Profile updated')
    },
    onError: () => toast.error('Failed to update profile'),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITIES
// ─────────────────────────────────────────────────────────────────────────────
export const useOpportunities = (status = 'active') =>
  useQuery({
    queryKey: KEYS.opportunities(status),
    queryFn: () => api.get('/opportunities', { params: { status, limit: 30 } }).then(r => r.data),
    staleTime: 3 * 60 * 1000,
  })

export const usePendingConfirmations = () =>
  useQuery({
    queryKey: KEYS.pendingConfirmations,
    queryFn: () => api.get('/opportunities/pending-sent-confirmation').then(r => r.data.pending),
    staleTime: 0,
  })

export const useMarkView = () =>
  useMutation({ mutationFn: (id) => api.put(`/opportunities/${id}/view`) })

export const useMarkClick = () =>
  useMutation({ mutationFn: (id) => api.put(`/opportunities/${id}/click`).then(r => r.data) })

export const useMarkCopy = () =>
  useMutation({ mutationFn: (id) => api.put(`/opportunities/${id}/copy`).then(r => r.data) })

export const useMarkSent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.put(`/opportunities/${id}/sent`).then(r => r.data),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEYS.opportunities('active') })
      const previous = qc.getQueryData(KEYS.opportunities('active'))
      qc.setQueryData(KEYS.opportunities('active'), (old) =>
        old ? { ...old, opportunities: old.opportunities.filter(o => o.id !== id) } : old
      )
      return { previous }
    },
    onError: (_, __, context) => {
      qc.setQueryData(KEYS.opportunities('active'), context.previous)
      toast.error('Failed to mark as sent')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.opportunities('active') })
      qc.invalidateQueries({ queryKey: KEYS.opportunities('sent') })
      qc.invalidateQueries({ queryKey: KEYS.pipeline })
      qc.invalidateQueries({ queryKey: KEYS.pendingConfirmations })
    },
  })
}

export const useRefreshFeed = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/opportunities/refresh').then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      if (data.new_count > 0) toast.success(`Found ${data.new_count} new leads 🎯`)
      else toast('No new leads right now. Check back later.')
    },
    onError: () => toast.error('Failed to refresh feed'),
  })
}

export const useRegenerateMessage = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, style }) => api.post(`/opportunities/${id}/regenerate`, { style }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
    onError: () => toast.error('Failed to regenerate message'),
  })
}

export const useCreateOpportunityChat = () =>
  useMutation({ mutationFn: (id) => api.post(`/opportunities/${id}/chat`).then(r => r.data) })

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
export const usePipeline = () =>
  useQuery({
    queryKey: KEYS.pipeline,
    queryFn: () => api.get('/pipeline').then(r => r.data),
    staleTime: 60 * 1000
  })

/**
 * FIX M-01: Pipeline API returns:
 *   { pipeline: { contacted: [...], replied: [...], call_demo: [...], ... }, metrics: {...} }
 *
 * Old optimistic update checked `old.opportunities` which doesn't exist
 * → nothing happened, Kanban card appeared frozen until the refetch landed.
 *
 * Fix: find the item in whichever stage array it currently lives in,
 * remove it there, and insert it into the destination stage array.
 */
export const useUpdateStage = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, stage }) => api.put(`/pipeline/${id}/stage`, { stage }).then(r => r.data),

    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: KEYS.pipeline })
      const previous = qc.getQueryData(KEYS.pipeline)

      qc.setQueryData(KEYS.pipeline, (old) => {
        if (!old?.pipeline) return old   // safety guard

        // Find the item across all stage arrays
        let movedItem = null
        const updatedPipeline = {}

        for (const [stageKey, items] of Object.entries(old.pipeline)) {
          const filtered = items.filter(o => {
            if (o.id === id) { movedItem = { ...o, stage }; return false }
            return true
          })
          updatedPipeline[stageKey] = filtered
        }

        if (!movedItem) return old   // item not found — bail

        // Place item in the destination stage array
        const destArray = updatedPipeline[stage] || []
        updatedPipeline[stage] = [movedItem, ...destArray]

        return { ...old, pipeline: updatedPipeline }
      })

      return { previous }
    },

    onError: (_, __, context) => {
      qc.setQueryData(KEYS.pipeline, context.previous)
      toast.error('Failed to move card')
    },

    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.pipeline }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────────────────────────────────────
export const useChats = (type) =>
  useQuery({
    queryKey: KEYS.chats(type),
    queryFn: () => api.get('/chat', { params: type ? { type } : {} }).then(r => r.data.chats),
    staleTime: 30 * 1000
  })

export const useChatMessages = (chatId) =>
  useQuery({
    queryKey: KEYS.chatMessages(chatId),
    queryFn: () => api.get(`/chat/${chatId}`).then(r => r.data),
    staleTime: 0,
    enabled: !!chatId
  })

export const useCreateChat = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/chat', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.chats(undefined) }),
  })
}

export const useRenameChat = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ chatId, title }) => api.put(`/chat/${chatId}/rename`, { title }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chats'] })
      toast.success('Chat renamed')
    },
  })
}

export const useDeleteChat = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (chatId) => api.delete(`/chat/${chatId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chats'] }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────
export const useSubmitFeedback = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/feedback', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: KEYS.pipeline })
      qc.invalidateQueries({ queryKey: KEYS.dashboard })
    },
    onError: (err) => {
      if (err?.response?.status === 409) {
        toast.error('Outcome already recorded for this opportunity.')
      } else {
        toast.error("Couldn't save outcome. Check your connection.")
      }
    },
  })
}

export const useMarkPracticeAccepted = () =>
  useMutation({
    mutationFn: (opportunityId) =>
      api.post('/feedback/practice-accepted', { opportunity_id: opportunityId }).then(r => r.data),
    // Fire-and-forget — failure is not user-facing
    onError: () => {},
  })

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE
// ─────────────────────────────────────────────────────────────────────────────
export const usePracticeSessions = () =>
  useQuery({
    queryKey: KEYS.practiceSessions,
    queryFn: () => api.get('/practice/sessions').then(r => r.data),
    staleTime: 60 * 1000
  })

export const usePracticeScenarios = () =>
  useQuery({
    queryKey: KEYS.practiceScenarios,
    queryFn: () => api.get('/practice/scenarios').then(r => r.data.scenarios),
    staleTime: 5 * 60 * 1000
  })

/** NEW: Load message history for a practice session */
export const usePracticeMessages = (sessionId) =>
  useQuery({
    queryKey: KEYS.practiceMessages(sessionId),
    queryFn: () => api.get(`/practice/${sessionId}/messages`).then(r => r.data),
    staleTime: 0,
    enabled: !!sessionId
  })

export const useStartPractice = () =>
  useMutation({
    mutationFn: (data) => api.post('/practice/start', data).then(r => r.data)
  })

/** NEW: Send message to a practice session (supports attachment_ids like normal chat) */
export const useSendPracticeMessage = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, content, attachment_ids = [] }) =>
      api.post(`/practice/${sessionId}/message`, { content, attachment_ids }).then(r => r.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.practiceMessages(variables.sessionId) })
    },
    onError: () => toast.error('Failed to send message. Try again.'),
  })
}

export const useRatePractice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, rating, rating_note }) =>
      api.post(`/practice/${sessionId}/rate`, { rating, rating_note }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.practiceSessions }),
  })
}

export const useCompletePractice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId) => api.post(`/practice/${sessionId}/complete`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.practiceSessions }),
  })
}

/**
 * NEW: Week-over-week practice skill axis progress.
 * Powers the PracticeProgressSummary section on the Metrics page.
 * Returns: week_over_week, breakthrough, weakest_axis, approaching_milestone,
 *          outcome_distribution, streak, this_week_count, last_week_count
 */
export const usePracticeProgressSummary = () =>
  useQuery({
    queryKey: KEYS.practiceProgressSummary,
    queryFn: () => api.get('/practice/progress-summary').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

// ─────────────────────────────────────────────────────────────────────────────
// METRICS
// ─────────────────────────────────────────────────────────────────────────────
export const useDashboard = () =>
  useQuery({
    queryKey: KEYS.dashboard,
    queryFn: () => api.get('/metrics/dashboard').then(r => r.data),
    staleTime: 5 * 60 * 1000
  })

export const useTokenUsage = () =>
  useQuery({
    queryKey: KEYS.tokenUsage,
    queryFn: () => api.get('/metrics/usage').then(r => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000
  })

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────────────────────────────────────
export const useCalendar = () =>
  useQuery({
    queryKey: KEYS.calendar,
    queryFn: () => api.get('/calendar').then(r => r.data.events),
    staleTime: 10 * 60 * 1000
  })

export const useCalendarEvent = (id) =>
  useQuery({
    queryKey: KEYS.calendarEvent(id),
    queryFn: () => api.get(`/calendar/${id}`).then(r => r.data.event),
    enabled: !!id
  })

export const useCreateEvent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/calendar', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.calendar })
      toast.success('Event added')
    },
    onError: () => toast.error('Failed to create event'),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────
export const useSuggestions = () =>
  useQuery({
    queryKey: KEYS.suggestions,
    queryFn: () => api.get('/suggestions').then(r => r.data.suggestions),
    staleTime: 30 * 60 * 1000
  })

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────
export const useUpdateNotificationPrefs = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prefs) => api.put('/user/notification-preferences', prefs).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me })
      toast.success('Preferences saved')
    },
    onError: () => toast.error('Failed to save preferences'),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
export const useUploadFile = () =>
  useMutation({
    mutationFn: async ({ file, chatId, sessionId }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (chatId) formData.append('chat_id', chatId)
      if (sessionId) formData.append('session_id', sessionId)   // practice session support
      return api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      }).then(r => r.data)
    },
  })

export const useDeleteFile = () =>
  useMutation({ mutationFn: (id) => api.delete(`/upload/${id}`) })

export const useGrowthFeed = () =>
  useQuery({
    queryKey: KEYS.growthFeed,
    queryFn:  () => api.get('/growth/feed').then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

export const useMarkCardRead = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/growth/cards/${id}/read`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.growthFeed }),
  })
}

export const useDismissCard = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/growth/cards/${id}/dismiss`).then(r => r.data),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: KEYS.growthFeed })
      const previous = qc.getQueryData(KEYS.growthFeed)
      qc.setQueryData(KEYS.growthFeed, (old) => old ? {
        ...old,
        feed: old.feed.filter(item => item.id !== id)
      } : old)
      return { previous }
    },
    onError: (_, __, ctx) => qc.setQueryData(KEYS.growthFeed, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.growthFeed }),
  })
}

// ── CHECK-INS ────────────────────────────────────────────────

export const useTodayCheckIn = () =>
  useQuery({
    queryKey: KEYS.todayCheckIn,
    queryFn:  () => api.get('/growth/checkin/today').then(r => r.data),
    staleTime: 60 * 60 * 1000,  // 1 hour
  })

export const useSubmitCheckIn = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ answers, mood_score }) =>
      api.post('/growth/checkin', { answers, mood_score }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.todayCheckIn })
      qc.invalidateQueries({ queryKey: KEYS.growthFeed })
    },
    onError: () => toast.error('Could not save check-in'),
  })
}

// ── GOALS ────────────────────────────────────────────────────

export const useGoals = () =>
  useQuery({
    queryKey: KEYS.goals,
    queryFn:  () => api.get('/growth/goals').then(r => r.data.goals),
    staleTime: 5 * 60 * 1000,
  })

export const useCreateGoal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/growth/goals', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.goals })
      qc.invalidateQueries({ queryKey: KEYS.growthFeed })
      toast.success('Goal created!')
    },
    onError: () => toast.error('Could not create goal'),
  })
}

export const useUpdateGoal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/growth/goals/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.goals })
      qc.invalidateQueries({ queryKey: KEYS.growthFeed })
    },
    onError: () => toast.error('Could not update goal'),
  })
}

export const useDeleteGoal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/growth/goals/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.goals }),
    onError: () => toast.error('Could not delete goal'),
  })
}

// ── WEEKLY PLAN ──────────────────────────────────────────────

export const useWeeklyPlan = () =>
  useQuery({
    queryKey: KEYS.weeklyPlan,
    queryFn:  () => api.get('/growth/plan').then(r => r.data),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  })

// ── GOAL NOTES ───────────────────────────────────────────────

export const useGoalNotes = (goalId) =>
  useQuery({
    queryKey: KEYS.goalNotes(goalId),
    queryFn:  () => api.get(`/growth/goals/${goalId}/notes`).then(r => r.data.notes),
    enabled:  !!goalId,
    staleTime: 30 * 1000,
  })

export const useLogGoalNote = (goalId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ note_text, explicit_delta }) =>
      api.post(`/growth/goals/${goalId}/notes`, { note_text, explicit_delta }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.goalNotes(goalId) })
      qc.invalidateQueries({ queryKey: KEYS.goals })
      qc.invalidateQueries({ queryKey: KEYS.growthFeed })
      qc.invalidateQueries({ queryKey: KEYS.pipelineInsight })
    },
    onError: () => toast.error('Failed to save note'),
  })
}

export const useDeleteGoalNote = (goalId) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) =>
      api.delete(`/growth/goals/${goalId}/notes/${noteId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.goalNotes(goalId) })
    },
    onError: () => toast.error('Failed to delete note'),
  })
}

// ── PIPELINE INSIGHT ──────────────────────────────────────────

/**
 * NEW: AI-generated 2-3 sentence pipeline health observation.
 * Connects pipeline metrics to active goals. Cached 24h server-side.
 */
export const usePipelineInsight = () =>
  useQuery({
    queryKey: KEYS.pipelineInsight,
    queryFn:  () => api.get('/growth/goals/pipeline-insight').then(r => r.data),
    staleTime: 20 * 60 * 1000, // 20 min client-side stale — server caches 24h
  })

// ── FOLLOW-UP SEQUENCES (Feature 1) ──────────────────────────

export const useFollowups = () =>
  useQuery({
    queryKey: KEYS.followups,
    queryFn:  () => api.get('/followup').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

export const useDismissFollowup = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/followup/${id}/dismiss`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.followups })
      qc.invalidateQueries({ queryKey: KEYS.opportunities('active') })
    },
  })
}

export const useMarkFollowupSent = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/followup/${id}/sent`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.followups })
      qc.invalidateQueries({ queryKey: KEYS.pipeline })
      qc.invalidateQueries({ queryKey: KEYS.opportunities('active') })
    },
  })
}

// ── PROSPECT QUICK INTEL (Feature 5) ─────────────────────────

export const useOpportunityIntel = (id) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/opportunities/${id}/intel`).then(r => r.data),
    onSuccess: (data) => {
      // Patch the opportunity in the list cache so intel persists without refetch
      for (const status of ['active', 'sent', 'all']) {
        qc.setQueryData(KEYS.opportunities(status), (old) => {
          if (!old?.opportunities) return old
          return {
            ...old,
            opportunities: old.opportunities.map(o =>
              o.id === id
                ? { ...o, intel_snapshot: data.intel, intel_generated_at: new Date().toISOString(), intel_fetch_failed: false }
                : o
            )
          }
        })
      }
    },
    onError: (err) => {
      if (err?.response?.data?.error === 'QUOTA_EXCEEDED') {
        toast.error('Intel lookups used up for today. Resets at midnight.')
      } else {
        toast.error('Could not fetch intel right now')
      }
    },
  })
}

// ── MEMORY (Feature 2) ────────────────────────────────────────

export const useMemoryFacts = () =>
  useQuery({
    queryKey: KEYS.memory,
    queryFn:  () => api.get('/user/memory').then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

export const useDeleteMemoryFact = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/user/memory/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.memory })
      toast.success('Memory removed')
    },
    onError: () => toast.error('Failed to remove memory'),
  })
}
// ─────────────────────────────────────────────────────────────────────────────
// GROWTH HISTORY  — Bug Fix: hook was missing, caused blank Goals page
// ─────────────────────────────────────────────────────────────────────────────
export const useGrowthHistory = (type) =>
  useQuery({
    queryKey: ['growth', 'history', type],
    queryFn: () => api.get('/growth/history', {
      params: type ? { type } : {}
    }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE — Retry with improvement
// ─────────────────────────────────────────────────────────────────────────────
export const useRetryPractice = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId) =>
      api.post(`/practice/${sessionId}/retry`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.practiceSessions }),
    onError: () => toast.error('Could not start retry session'),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// METRICS — Momentum score + behavioral insights (new dashboard endpoints)
// ─────────────────────────────────────────────────────────────────────────────
export const useMomentumScore = () =>
  useQuery({
    queryKey: ['metrics', 'momentum'],
    queryFn: () => api.get('/metrics/momentum').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

export const useBehavioralInsights = () =>
  useQuery({
    queryKey: ['metrics', 'behavioral-insights'],
    queryFn: () => api.get('/metrics/behavioral-insights').then(r => r.data),
    staleTime: 15 * 60 * 1000,
  })

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE USAGE EVENTS — §8.2 Data Capture
// Fire-and-forget: records which features users engage with and how often.
// Used for product analytics and Pro plan design decisions.
// ─────────────────────────────────────────────────────────────────────────────
export const useFeatureEvent = () =>
  useMutation({
    mutationFn: ({ feature, action, metadata = {} }) =>
      api.post('/user/feature-event', { feature, action, metadata }).then(r => r.data),
    // Silent — never show errors or toasts for analytics pings
    onError: () => {},
  })

// ─────────────────────────────────────────────────────────────────────────────
// METRICS — Intelligence, milestones, learning (new wow-moment endpoints)
// ─────────────────────────────────────────────────────────────────────────────
export const useMetricsIntelligence = () =>
  useQuery({
    queryKey: ['metrics', 'intelligence'],
    queryFn: () => api.get('/metrics/intelligence').then(r => r.data),
    staleTime: 15 * 60 * 1000,
  })

export const useMetricsMilestones = () =>
  useQuery({
    queryKey: ['metrics', 'milestones'],
    queryFn: () => api.get('/metrics/milestones').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

export const useMetricsLearning = () =>
  useQuery({
    queryKey: ['metrics', 'learning'],
    queryFn: () => api.get('/metrics/learning').then(r => r.data),
    staleTime: 10 * 60 * 1000,
  })

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE — Branch conversation from a message
// ─────────────────────────────────────────────────────────────────────────────
export const useBranchPractice = () =>
  useMutation({
    mutationFn: ({ sessionId, messageId }) =>
      api.post(`/practice/${sessionId}/branch`, { message_id: messageId }).then(r => r.data),
    onError: () => toast.error('Could not create branch'),
  })

export const useSubmitReflection = () =>
  useMutation({
    mutationFn: ({ sessionId, reflectionAnswer, userMessage, prospectResponse }) =>
      api.post(`/practice/${sessionId}/reflection`, {
        reflection_answer:  reflectionAnswer,
        user_message:       userMessage,
        prospect_response:  prospectResponse,
      }).then(r => r.data),
    onError: () => {},
  })
