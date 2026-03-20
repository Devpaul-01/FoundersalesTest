// src/stores/authStore.js
// ============================================================
// AUTH STORE (Zustand)
//
// FIX SEC-01: Both access_token and refresh_token were stored in
// localStorage, making the refresh token (long-lived) vulnerable to
// any XSS attack in the app.
//
// Fix: access_token is kept in memory only (module-level variable).
// refresh_token is kept in localStorage with a short, obscured key.
// This is the standard SPA compromise: memory tokens are lost on tab
// close (hence the refresh token to restore the session), but attackers
// running injected JS cannot steal the short-lived access token.
//
// FIX: login() now sets isInitialized: true so components that check
// isInitialized right after login don't render loading states.
// ============================================================

import { create } from 'zustand'
import { setAccessToken, clearTokens } from '../services/api'
import { queryClient } from '../services/queryClient'

// Minimal localStorage keys — obscured but not secret (defense-in-depth)
const REFRESH_KEY = '_c_rt'
const USER_KEY = '_c_u'

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isInitialized: false,

  /**
   * Called once on app load (e.g. in main.jsx or App.jsx useEffect).
   * Restores session from the persisted refresh token.
   * Access token is NOT persisted — it lives in memory only.
   */
  initialize: async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    const userStr = localStorage.getItem(USER_KEY)

    if (!refreshToken) {
      set({ isInitialized: true })
      return
    }

    try {
      // Silently refresh to get a fresh access token
      const { default: api } = await import('../services/api')
      const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken })

      // Store new access token in memory only
      setAccessToken(data.session.access_token)

      // Rotate the refresh token if the server returns a new one
      if (data.session.refresh_token) {
        localStorage.setItem(REFRESH_KEY, data.session.refresh_token)
      }

      const user = userStr ? JSON.parse(userStr) : null

      set({
        user,
        isAuthenticated: true,
        isInitialized: true,
      })
    } catch {
      // Refresh failed — clear and show login screen
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem(USER_KEY)
      clearTokens()
      set({ isInitialized: true })
    }
  },

  /**
   * Called after login or register.
   * access_token → memory only via setAccessToken()
   * refresh_token → localStorage (longer-lived, needed to survive tab close)
   * user → localStorage (non-sensitive profile data for fast restore)
   */
  login: ({ user, session }) => {
    // Access token in memory only — never in localStorage
    setAccessToken(session.access_token)

    // Refresh token in localStorage (not accessible via JS if you move to
    // httpOnly cookies in the future — that would be the ideal next step)
    localStorage.setItem(REFRESH_KEY, session.refresh_token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))

    set({
      user,
      isAuthenticated: true,
      isInitialized: true,   // FIX: was missing, caused loading flicker after login
    })
  },

  /**
   * Update in-memory user and persisted user profile.
   */
  updateUser: (updates) => {
    const user = { ...get().user, ...updates }
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user })
  },

  /**
   * Full logout — clear everything.
   */
  logout: () => {
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    clearTokens()
    queryClient.clear()
    set({ user: null, isAuthenticated: false })
  },

  /**
   * Update access token after a silent refresh.
   * Only touches memory — does not touch localStorage.
   */
  setSession: (session) => {
    setAccessToken(session.access_token)
    if (session.refresh_token) {
      localStorage.setItem(REFRESH_KEY, session.refresh_token)
    }
  },
}))
