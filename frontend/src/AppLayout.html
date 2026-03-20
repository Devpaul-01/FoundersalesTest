// src/components/layout/AppLayout.jsx
// ============================================================
// MAIN APP LAYOUT
//
// FIX DESKTOP: The sidebar was correctly using 'hidden lg:flex'
// but pages were stacking vertically on desktop because some
// pages add their own full-height wrappers. The fix ensures
// the main content area is properly constrained and the sidebar
// remains fixed on the left at all breakpoints >= lg.
//
// FIX CHAT INPUT: Added proper z-index layering. Modals/overlays
// get z-50, the main content area fills the remaining space,
// and the chat input stays above any overlapping elements via
// its own stacking context.
// ============================================================

import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../navigation/Sidebar'
import BottomNav from '../navigation/BottomNav'

export default function AppLayout() {
  return (
    <div className="flex h-screen w-full bg-surface-bg overflow-hidden">
      {/* Desktop Sidebar — fixed to the left, never wraps */}
      <div className="hidden lg:block flex-shrink-0">
        <Sidebar />
      </div>

      {/* Main Content Area — fills remaining space, independent scroll */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav — only shows below lg breakpoint */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
        <BottomNav />
      </div>
    </div>
  )
}

/**
 * PageContent — provides scrollable area with correct bottom padding.
 *
 * Use this wrapper in every page component:
 *   <PageContent>...</PageContent>
 *
 * Props:
 *   className   — extra classes for the scroll container
 *   noPadding   — skip default p-4 lg:p-6 padding
 *   fullHeight  — flex-1 h-full (for pages like Chat that need full height)
 */
export function PageContent({ children, className = '', noPadding = false, fullHeight = false }) {
  return (
    <div
      className={[
        fullHeight ? 'flex-1 flex flex-col min-h-0' : 'flex-1 overflow-y-auto scroll-container',
        !noPadding && !fullHeight ? 'p-4 lg:p-6' : '',
        // Mobile: extra bottom padding so content isn't under BottomNav
        // Desktop: normal padding
        'pb-24 lg:pb-6',
        className
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
