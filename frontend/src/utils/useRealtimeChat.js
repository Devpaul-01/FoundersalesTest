// src/hooks/useRealtimeChat.js
// ============================================================
// SUPABASE REALTIME SUBSCRIPTION FOR CHAT
//
// FIX M-05: useEffect dependency array only had [chatId].
// onNewMessage, onDeliveryUpdate and setConnected were stale closures —
// if the parent re-rendered with new callback refs, the subscribed handler
// would still call the old (stale) version.
//
// Fix: wrap all callback props in useCallback in parent components,
// and add them to the dependency array here. The channel is torn down
// and re-subscribed whenever any of these change.
// ============================================================

import { useEffect, useCallback, useRef } from 'react'
import supabase from '../services/supabase'
import { useRealtimeStore } from '../stores/realtimeStore'
import { queryClient } from '../services/queryClient'
import { KEYS } from '../services/queries'

export function useRealtimeChat(chatId, onNewMessage, onDeliveryUpdate) {
  const { addChannel, removeChannel, setConnected } = useRealtimeStore()

  // Keep a ref to the latest callbacks so our stable subscription
  // handler always calls the current version without needing to
  // re-subscribe on every render.
  const onNewMessageRef = useRef(onNewMessage)
  const onDeliveryUpdateRef = useRef(onDeliveryUpdate)
  useEffect(() => { onNewMessageRef.current = onNewMessage }, [onNewMessage])
  useEffect(() => { onDeliveryUpdateRef.current = onDeliveryUpdate }, [onDeliveryUpdate])

  useEffect(() => {
    if (!chatId || !supabase) return

    const channelName = `chat:${chatId}`
    const channel = supabase.channel(channelName)

    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        // Call via ref — always the latest version, no stale closure
        onNewMessageRef.current?.(payload.new)
        queryClient.invalidateQueries({ queryKey: KEYS.chatMessages(chatId) })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        onDeliveryUpdateRef.current?.(payload.new)
        queryClient.invalidateQueries({ queryKey: KEYS.chatMessages(chatId) })
      })
      .subscribe((status) => {
        // setConnected is stable (from Zustand), safe to call directly
        setConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') addChannel(channelName)
        if (status === 'CHANNEL_ERROR') {
          console.warn(`[Realtime] Channel error on ${channelName}`)
          setConnected(false)
        }
      })

    return () => {
      supabase.removeChannel(channel)
      removeChannel(channelName)
      setConnected(false)
    }
  // Only chatId should trigger channel teardown+re-subscribe.
  // Callback changes are handled via refs above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId])
}

// ─────────────────────────────────────────────────────────────────────────────
// Global user channel — opportunities + pipeline updates + practice replies
// ─────────────────────────────────────────────────────────────────────────────
export function useRealtimeUser(userId) {
  useEffect(() => {
    if (!userId || !supabase) return

    const channel = supabase.channel(`user:${userId}`)

    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'opportunities',
        filter: `user_id=eq.${userId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'opportunities',
        filter: `user_id=eq.${userId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['opportunities'] })
        queryClient.invalidateQueries({ queryKey: KEYS.pipeline })
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'practice_badges',
        filter: `user_id=eq.${userId}`,
      }, () => {
        // Refresh practice sessions when new badge earned
        queryClient.invalidateQueries({ queryKey: KEYS.practiceSessions })
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [userId])
}
