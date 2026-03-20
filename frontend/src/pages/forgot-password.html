import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-bg grid-bg flex items-center justify-center p-4">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 shadow-glow">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-primary-glow">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 shadow-modal">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-success">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-text-primary mb-2">Check your email</h2>
              <p className="text-sm text-text-muted">If that email exists, a reset link was sent. Check your spam too.</p>
              <Link to="/login" className="block mt-5 text-sm text-primary hover:text-primary-glow transition-colors">
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-text-primary mb-2">Reset password</h2>
              <p className="text-sm text-text-muted mb-5">Enter your email and we'll send a reset link.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <Button type="submit" fullWidth loading={loading}>
                  Send reset link
                </Button>
              </form>
              <Link to="/login" className="block text-center mt-4 text-sm text-text-muted hover:text-text-secondary transition-colors">
                ← Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
