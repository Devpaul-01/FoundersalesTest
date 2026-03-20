import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import { useAuthStore } from '../../stores/authStore'

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
        <Avatar name={user?.name || user?.email} size="sm" />
      </div>
    </header>
  )
}
