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
  calendarEvent: (id) => ['calendar', id],
  practiceSessions: ['practice', 'sessions'],
  practiceScenarios: ['practice', 'scenarios'],
  practiceMessages: (sessionId) => ['practice', sessionId, 'messages'],
  suggestions: ['suggestions'],
  pendingConfirmations: ['opportunities', 'pending-confirmations'],
  growthFeed:    ['growth', 'feed'],
  growthCards:   ['growth', 'cards'],
  todayCheckIn:  ['growth', 'checkin', 'today'],
  goals:         ['growth', 'goals'],
  goalNotes:     (goalId) => ['goals', goalId, 'notes'],
  weeklyPlan:    ['growth', 'plan'],
  memory:        ['user', 'memory'],
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
    onError: () => toast.error("Couldn't save outcome. Check your connection."),
  })
}

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
    mutationFn: (note_text) =>
      api.post(`/growth/goals/${goalId}/notes`, { note_text }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.goalNotes(goalId) })
      qc.invalidateQueries({ queryKey: KEYS.goals })
      qc.invalidateQueries({ queryKey: KEYS.growthFeed })
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
