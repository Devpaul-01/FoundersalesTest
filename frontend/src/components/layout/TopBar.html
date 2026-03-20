import React, { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import { useAuthStore } from '../../stores/authStore'
import api from '../../services/api'
import toast from 'react-hot-toast'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/opportunities': 'Opportunities',
  '/pipeline': 'Pipeline',
  '/chat': 'Chat',
  '/practice': 'Practice',
  '/calendar': 'Calendar',
  '/metrics': 'Metrics',
  '/settings': 'Settings',
}

function AvatarMenu({ user }) {
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const { logout } = useAuthStore()

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
    } catch {
      // Even if server call fails, clear local session
    } finally {
      logout()
      toast.success('Logged out')
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
        aria-label="Account menu"
      >
        <Avatar name={user?.name || user?.email} size="sm" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-surface-card border border-surface-border rounded-xl shadow-modal py-1 z-50 animate-fade-in-up">
          {/* User info */}
          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-sm font-medium text-text-primary truncate">{user?.name || 'Your account'}</p>
            <p className="text-xs text-text-muted truncate">{user?.email}</p>
          </div>

          {/* Settings */}
          <button
            onClick={() => { navigate('/settings'); setOpen(false) }}
            className="w-full text-left px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors flex items-center gap-2"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-text-muted">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.251l-1.18 2.044a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.113a7.047 7.047 0 010-2.228L1.821 7.773a1 1 0 01-.205-1.251l1.18-2.044a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            Settings
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
            </svg>
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TopBar({ title, actions, backTo }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const pageTitle = title || PAGE_TITLES[location.pathname] || 'FounderSales'

  return (
    <header className="h-14 px-6 flex items-center justify-between border-b border-surface-border bg-surface-panel/80 backdrop-blur-sm sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-3">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" />
            </svg>
          </button>
        )}
        <h1 className="text-base font-semibold text-text-primary font-display">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        {actions}
        <AvatarMenu user={user} />
      </div>
    </header>
  )
}
