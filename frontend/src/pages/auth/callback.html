// src/pages/auth/callback.jsx
// ============================================================
// AUTH CALLBACK PAGE
//
// Handles two flows:
//   1. Email verification: user clicks link in their email
//   2. Google OAuth: user authenticated with Google
//
// In both cases, Supabase redirects to this page with tokens
// in the URL fragment (#access_token=...&refresh_token=...).
//
// This page:
//   1. Reads the session from the URL hash via Supabase client
//   2. Calls POST /api/auth/profile/ensure to create profile if new
//   3. Redirects to /onboarding (new users) or /dashboard (existing)
// ============================================================

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import { useAuthStore } from '../../stores/authStore'
import api from '../../services/api'
import { setAccessToken } from '../../services/api'

// Create a lightweight Supabase client just for reading the session from the URL hash
const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
)

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [status, setStatus] = useState('loading') // loading | error
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    try {
      // Supabase puts tokens in the URL hash after OAuth/email verify
      // getSession() parses the hash and returns the session automatically
      const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession()

      if (sessionError || !session) {
        // Try parsing URL hash manually as fallback
        const hash   = window.location.hash.slice(1)
        const params = new URLSearchParams(hash)
        const errorDesc = params.get('error_description') || params.get('error')

        if (errorDesc) {
          setErrorMsg(errorDesc)
          setStatus('error')
          return
        }

        setErrorMsg('Verification link may have expired. Please try signing in or request a new verification email.')
        setStatus('error')
        return
      }

      // We have a valid session — set access token in memory
      setAccessToken(session.access_token)

      // Call backend to ensure the user profile exists
      // (creates it for new users, no-op for existing)
      const { data } = await api.post('/auth/profile/ensure', {}, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })

      const user = data.user
      const isNewUser = data.isNewUser

      // Persist session to auth store
      login({
        user,
        session: {
          access_token:  session.access_token,
          refresh_token: session.refresh_token
        }
      })

      // Route based on user state
      if (!user.onboarding_completed) {
        navigate('/onboarding', { replace: true })
      } else {
        navigate('/dashboard', { replace: true })
      }

    } catch (err) {
      console.error('[AuthCallback] Error:', err)
      setErrorMsg('Something went wrong. Please try signing in manually.')
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5 animate-pulse">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-primary-glow">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-text-primary font-semibold text-lg font-display">Setting up your account…</p>
          <p className="text-text-muted text-sm mt-2">Just a moment</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mx-auto mb-5">
          <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-error">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1 className="text-xl font-bold text-text-primary font-display mb-2">Verification failed</h1>
        <p className="text-sm text-text-muted mb-6">{errorMsg}</p>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Back to sign in
          </button>
          <button
            onClick={() => navigate('/register')}
            className="w-full py-2.5 px-4 bg-surface-card border border-surface-border hover:border-surface-mid text-text-secondary rounded-xl text-sm font-medium transition-colors"
          >
            Create a new account
          </button>
        </div>
      </div>
    </div>
  )
}
