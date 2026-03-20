// src/App.jsx
import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import AppLayout from './components/layout/AppLayout'
import DebugPanel from './components/ui/DebugPanel'
import { lazy, Suspense } from 'react'

const LoginPage          = lazy(() => import('./pages/auth/login'))
const RegisterPage       = lazy(() => import('./pages/auth/register'))
const ForgotPage         = lazy(() => import('./pages/auth/forgot-password'))
const AuthCallbackPage   = lazy(() => import('./pages/auth/callback'))
const OnboardingPage     = lazy(() => import('./pages/onboarding'))
const WelcomePage        = lazy(() => import('./pages/welcome'))   // §9.4 first-win flow
const DashboardPage      = lazy(() => import('./pages/dashboard'))
const OpportunitiesPage  = lazy(() => import('./pages/opportunities'))
const PipelinePage       = lazy(() => import('./pages/pipeline'))
const ChatPage           = lazy(() => import('./pages/chat'))
const PracticePage       = lazy(() => import('./pages/practice'))
const CalendarPage       = lazy(() => import('./pages/calendar'))
const MetricsPage        = lazy(() => import('./pages/metrics'))
const SettingsPage       = lazy(() => import('./pages/settings'))
const FeedbackPage       = lazy(() => import('./pages/feedback'))
const GoalsPage          = lazy(() => import('./pages/goals'))
const GrowthHistoryPage  = lazy(() => import('./pages/growth'))
const InsightsPage       = lazy(() => import('./pages/insights'))
const ProspectsPage       = lazy(() => import('./pages/prospects'))
// ── Error Boundary — prevents one broken page from cascading to others ──────
// Fix: growth.jsx calling missing useGrowthHistory was corrupting React's
// rendering context for subsequent navigations (e.g. Goals page blank).
export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-error">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="text-sm text-text-muted mb-3">Something went wrong on this page.</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="text-xs text-primary-glow hover:underline transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function FullscreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-primary-glow">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm text-text-muted">Loading FounderSales…</p>
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { isAuthenticated, isInitialized, user } = useAuthStore()
  if (!isInitialized) return <FullscreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isAuthenticated && user && !user.onboarding_completed) return <Navigate to="/onboarding" replace />
  return children
}

function RequireGuest({ children }) {
  const { isAuthenticated, isInitialized, user } = useAuthStore()
  if (!isInitialized) return <FullscreenLoader />
  if (isAuthenticated) {
    if (user && !user.onboarding_completed) return <Navigate to="/onboarding" replace />
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function RequireOnboarding({ children }) {
  const { isAuthenticated, isInitialized, user } = useAuthStore()
  if (!isInitialized) return <FullscreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.onboarding_completed) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  const initialize = useAuthStore(s => s.initialize)
  useEffect(() => { initialize() }, [initialize])

  return (
    <BrowserRouter>
      <Suspense fallback={<FullscreenLoader />}>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login"            element={<LoginPage/>} />
          <Route path="/register"         element={<RequireGuest><RegisterPage /></RequireGuest>} />
          <Route path="/forgot-password"  element={<RequireGuest><ForgotPage /></RequireGuest>} />

          {/* OAuth / email verification callback — always accessible */}
          <Route path="/auth/callback"    element={<AuthCallbackPage />} />

          {/* Onboarding — auth required, onboarding not complete */}
          <Route path="/onboarding"       element={<RequireOnboarding><OnboardingPage /></RequireOnboarding>} />
          <Route path="/welcome"          element={<RequireAuth><WelcomePage /></RequireAuth>} />   {/* §9.4 first-win */}

          {/* Protected app routes — each wrapped in ErrorBoundary so one
              page's crash never bleeds into adjacent navigation */}
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index                      element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"           element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
            <Route path="goals"               element={<ErrorBoundary><GoalsPage /></ErrorBoundary>} />
            <Route path="growth"              element={<ErrorBoundary><GrowthHistoryPage /></ErrorBoundary>} />
            <Route path="prospects"              element={<ErrorBoundary><ProspectsPage /></ErrorBoundary>} />
            <Route path="opportunities"       element={<ErrorBoundary><OpportunitiesPage /></ErrorBoundary>} />
            <Route path="pipeline"            element={<ErrorBoundary><PipelinePage /></ErrorBoundary>} />
            <Route path="chat/*"              element={<ErrorBoundary><ChatPage /></ErrorBoundary>} />
            <Route path="practice/*"          element={<ErrorBoundary><PracticePage /></ErrorBoundary>} />
            <Route path="calendar"            element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
            <Route path="metrics"             element={<ErrorBoundary><MetricsPage /></ErrorBoundary>} />
            <Route path="settings"            element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
            <Route path="feedback"            element={<ErrorBoundary><FeedbackPage /></ErrorBoundary>} />
            <Route path="insights"            element={<ErrorBoundary><InsightsPage /></ErrorBoundary>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <DebugPanel />
    </BrowserRouter>
  )
}
