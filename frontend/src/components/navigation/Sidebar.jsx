import React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { ROUTES } from '../../utils/constants'
import Avatar from '../ui/Avatar'
import api from '../../services/api'
import toast from 'react-hot-toast'

const NavItem = ({ to, icon, label, badge }) => {
  const location = useLocation()
  const active = location.pathname.startsWith(to)

  return (
    <NavLink to={to} className={`nav-item ${active ? 'active' : ''}`}>
      <span className="text-base leading-none">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-xs flex items-center justify-center font-medium">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    logout()
    navigate(ROUTES.LOGIN)
  }

  return (
    <aside className="w-[240px] shrink-0 h-screen sticky top-0 flex flex-col bg-surface-panel border-r border-surface-border">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        {/* FounderSales logo — replace src with /logo.svg once added */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold font-display text-text-primary leading-tight">FounderSales</div>
            <div className="text-xs text-text-muted leading-tight">powered by Clutch</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        <NavItem to={ROUTES.DASHBOARD}   icon="⚡" label="Dashboard" />
        <NavItem to={ROUTES.OPPORTUNITIES} icon="🎯" label="Opportunities" />
        <NavItem to={ROUTES.PIPELINE}    icon="📊" label="Pipeline" />
        <NavItem to={ROUTES.CHAT}        icon="💬" label="Chat" />
        <NavItem to={ROUTES.PRACTICE}    icon="💪" label="Practice" />
        <NavItem to={ROUTES.CALENDAR}    icon="📅" label="Calendar" />
        <NavItem to={ROUTES.METRICS}     icon="📈" label="Metrics" />
        <NavItem to='/growth'     icon="📈" label="Growth History" />
        <NavItem to={ROUTES.GOALS}    icon="🌱" label="Goals" />

      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-surface-border pt-3 mt-2">
        <NavItem to={ROUTES.SETTINGS} icon="⚙️" label="Settings" />

        {/* User row */}
        <div className="flex items-center gap-3 px-3 py-3 mt-1">
          <Avatar name={user?.name || user?.email} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-secondary truncate">{user?.name || 'User'}</p>
            <p className="text-xs text-text-muted truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
            title="Sign out"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-1.04a.75.75 0 10-1.04-1.06l-2.5 2.5a.75.75 0 000 1.06l2.5 2.5a.75.75 0 101.04-1.06l-1.048-1.04h9.546A.75.75 0 0019 10z" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
