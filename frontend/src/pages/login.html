import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const validate = () => {
    const e = {}
    if (!form.email) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email'
    if (!form.password) e.password = 'Password is required'
    setErrors(e)
    return !Object.keys(e).length
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', form)
      login({ user: data.user, session: data.session })
      if (!data.user.onboarding_completed) navigate('/onboarding')
      else navigate('/dashboard')
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed'
      toast.error(msg)
      if (msg.toLowerCase().includes('password')) setErrors({ password: msg })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const { data } = await api.get('/auth/google/url')
      window.location.href = data.url
    } catch {
      toast.error('Google login unavailable right now')
    }
  }

  return (
    <div className="min-h-screen bg-surface-bg grid-bg flex items-center justify-center p-4">
      {/* Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-primary-glow">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold font-display text-text-primary">FounderSales</h1>
          <p className="text-sm text-text-muted mt-1">Your AI sales agent</p>
        </div>

        {/* Card */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-modal">
          <h2 className="text-base font-semibold text-text-primary mb-5">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              error={errors.password}
              autoComplete="current-password"
              iconRight={
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-text-muted hover:text-text-secondary transition-colors">
                  {showPassword
                    ? <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd" /><path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" /></svg>
                    : <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" /></svg>
                  }
                </button>
              }
            />

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs text-primary hover:text-primary-glow transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" fullWidth loading={loading}>
              Sign in →
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs text-text-muted bg-surface-card">or</span>
            </div>
          </div>

          {/* Google */}
          <Button variant="secondary" fullWidth onClick={handleGoogleLogin} icon={
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          }>
            Continue with Google
          </Button>
        </div>

        <p className="text-center text-sm text-text-muted mt-5">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:text-primary-glow transition-colors font-medium">
            Create account →
          </Link>
        </p>
      </div>
    </div>
  )
}
