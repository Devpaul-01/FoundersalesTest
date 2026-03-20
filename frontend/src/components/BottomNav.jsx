import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ROUTES } from '../../utils/constants'

export default function BottomNav() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const navItems = [
    { to: ROUTES.DASHBOARD, icon: '⚡', label: 'Home' },
    { to: ROUTES.OPPORTUNITIES, icon: '🎯', label: 'Feed' },
    { to: ROUTES.CHAT, icon: '💬', label: 'Chat' },
    { to: ROUTES.PRACTICE, icon: '💪', label: 'Practice' },
  ]

  const moreItems = [
    { to: ROUTES.PIPELINE, icon: '📊', label: 'Pipeline' },
    { to: ROUTES.CALENDAR, icon: '📅', label: 'Calendar' },
    { to: ROUTES.METRICS, icon: '📈', label: 'Metrics' },
    { to: ROUTES.SETTINGS, icon: '⚙️', label: 'Settings' },
  ]

  return (
    <>
      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface-panel/95 backdrop-blur-md border-t border-surface-border safe-area-bottom">
        <div className="flex items-center">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors duration-150 ${
                  isActive ? 'text-primary' : 'text-text-muted'
                }`
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors duration-150 ${
              moreOpen ? 'text-primary' : 'text-text-muted'
            }`}
          >
            <span className="text-base leading-none">⋯</span>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* More Drawer */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50 animate-fade-in" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface-card rounded-t-2xl border-t border-surface-border animate-slide-up">
            <div className="px-4 pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-surface-mid mx-auto mb-4" />
              <div className="grid grid-cols-2 gap-2">
                {moreItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 p-3 rounded-xl transition-colors ${
                        isActive ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-hover'
                      }`
                    }
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </NavLink>
                ))}
              </div>
              <div className="h-5" />
            </div>
          </div>
        </>
      )}
    </>
  )
}
