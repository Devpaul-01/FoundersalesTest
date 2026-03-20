import React, { useState, useEffect } from 'react'
import { useMe, useUpdateProfile, useUpdateNotificationPrefs, useMemoryFacts, useDeleteMemoryFact } from '../services/queries'
import { useAuthStore } from '../stores/authStore'
import Button from '../components/ui/Button'
import Input, { Textarea, Toggle } from '../components/ui/Input'
import TopBar from '../components/layout/TopBar'
import { PageContent } from '../components/layout/AppLayout'
import { SkeletonCard } from '../components/ui/Skeleton'
import { DEFAULT_NOTIFICATION_PREFS } from '../utils/constants'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useDebugStore } from '../stores/debugStore'

const TABS = ['Profile', 'Voice Profile', 'Notifications', 'Memory', 'Account']

function ProfileSection({ user }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    business_name: user?.business_name || '',
    product_description: user?.product_description || '',
    target_audience: user?.target_audience || '',
    website: user?.website || '',
  })
  const updateProfile = useUpdateProfile()
  const { updateUser } = useAuthStore()

  useEffect(() => {
    if (user) setForm({
      name: user.name || '',
      business_name: user.business_name || '',
      product_description: user.product_description || '',
      target_audience: user.target_audience || '',
      website: user.website || '',
    })
  }, [user])

  const handleSave = async () => {
    await updateProfile.mutateAsync(form)
    updateUser(form)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input label="Business name" value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />
      </div>
      <Textarea label="What you offer" value={form.product_description} onChange={e => setForm({ ...form, product_description: e.target.value })} rows={3} />
      <Textarea label="Target audience" value={form.target_audience} onChange={e => setForm({ ...form, target_audience: e.target.value })} rows={2} />
      <Input label="Website" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
      <Button onClick={handleSave} loading={updateProfile.isPending}>Save changes</Button>
    </div>
  )
}

function VoiceProfileSection({ user }) {
  const [profile, setProfile] = useState(user?.voice_profile || {})
  const [saving, setSaving] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)

  useEffect(() => { if (user?.voice_profile) setProfile(user.voice_profile) }, [user])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/onboarding/profile', { voice_profile: profile })
      toast.success('Voice profile updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleRebuild = async () => {
    setRebuilding(true)
    try {
      await api.post('/onboarding/rebuild-voice-profile')
      toast.success('Voice profile rebuilt!')
    } catch {
      toast.error('Failed to rebuild — complete onboarding first')
    } finally {
      setRebuilding(false)
    }
  }

  const fields = [
    { key: 'unique_value_prop', label: 'What makes you different', rows: 2 },
    { key: 'target_customer_description', label: 'Ideal customer description', rows: 2 },
    { key: 'outreach_persona', label: 'Outreach persona (how Clutch sounds writing for you)', rows: 3 },
    { key: 'best_proof_point', label: 'Best proof point', rows: 2 },
    { key: 'main_objection', label: 'Main objection you face', rows: 1 },
    { key: 'objection_reframe', label: 'How to handle it', rows: 2 },
  ]

  if (!user?.voice_profile) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-text-muted mb-4">No voice profile yet. Complete onboarding to build one.</p>
        <Button onClick={handleRebuild} loading={rebuilding}>Build Voice Profile</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {fields.map(({ key, label, rows }) => (
        <Textarea
          key={key}
          label={label}
          value={typeof profile[key] === 'string' ? profile[key] : (Array.isArray(profile[key]) ? profile[key].join(', ') : '')}
          onChange={e => setProfile({ ...profile, [key]: e.target.value })}
          rows={rows}
        />
      ))}

      <div className="flex gap-3">
        <Button onClick={handleSave} loading={saving}>Save profile</Button>
        <Button variant="secondary" onClick={handleRebuild} loading={rebuilding}>
          ↺ Rebuild with AI
        </Button>
      </div>
    </div>
  )
}

function NotificationsSection({ user }) {
  const [prefs, setPrefs] = useState({
    ...DEFAULT_NOTIFICATION_PREFS,
    ...user?.notification_preferences,
  })
  const [emailDigest,  setEmailDigest]  = useState(user?.email_digest_enabled  !== false)
  const [memoryOn,     setMemoryOn]     = useState(user?.memory_enabled         !== false)
  const updatePrefs = useUpdateNotificationPrefs()

  useEffect(() => {
    if (user?.notification_preferences) {
      setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...user.notification_preferences })
    }
    if (user != null) {
      setEmailDigest(user.email_digest_enabled !== false)
      setMemoryOn(user.memory_enabled !== false)
    }
  }, [user])

  const handleToggle = async (key, value) => {
    const newPrefs = { ...prefs, [key]: value }
    setPrefs(newPrefs)
    await updatePrefs.mutateAsync(newPrefs)
  }

  const handleEmailDigestToggle = async (value) => {
    setEmailDigest(value)
    await updatePrefs.mutateAsync({ email_digest_enabled: value })
  }

  const handleMemoryToggle = async (value) => {
    setMemoryOn(value)
    await updatePrefs.mutateAsync({ memory_enabled: value })
  }

  const items = [
    { key: 'new_opportunities', label: 'New opportunities', desc: 'When Clutch finds fresh leads for you' },
    { key: 'feedback_reminders', label: 'Outcome reminders', desc: 'Follow-ups asking how your outreach went' },
    { key: 'practice_replies', label: 'Practice replies', desc: 'When your practice prospect responds' },
    { key: 'calendar_prep_ready', label: 'Event prep ready', desc: 'When AI prep is generated for an upcoming event' },
  ]

  return (
    <div className="space-y-4">
      {items.map(({ key, label, desc }) => (
        <div key={key} className="flex items-center justify-between py-3 border-b border-surface-border last:border-0">
          <div>
            <p className="text-sm font-medium text-text-secondary">{label}</p>
            <p className="text-xs text-text-muted mt-0.5">{desc}</p>
          </div>
          <Toggle
            checked={prefs[key]}
            onChange={v => handleToggle(key, v)}
          />
        </div>
      ))}

      {/* Email digest toggle — Feature 3 */}
      <div className="flex items-center justify-between py-3 border-b border-surface-border">
        <div>
          <p className="text-sm font-medium text-text-secondary">Weekly email digest</p>
          <p className="text-xs text-text-muted mt-0.5">Sent every Sunday with your performance summary</p>
        </div>
        <Toggle checked={emailDigest} onChange={handleEmailDigestToggle} />
      </div>

      {/* Memory toggle — Feature 2 */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-text-secondary">Enable Memory</p>
          <p className="text-xs text-text-muted mt-0.5">Clutch learns from your conversations to give better coaching</p>
        </div>
        <Toggle checked={memoryOn} onChange={handleMemoryToggle} />
      </div>

      {updatePrefs.isPending && (
        <p className="text-xs text-text-muted">Saving…</p>
      )}
    </div>
  )
}

// ── Memory Viewer — Feature 2 ─────────────────────────────────────────────────
function MemorySection({ user }) {
  const { data: factsData, isLoading } = useMemoryFacts()
  const deleteMemoryFact = useDeleteMemoryFact()
  const facts = factsData?.facts || []

  if (user?.memory_enabled === false) {
    return (
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
        <p className="text-sm text-text-muted">Memory is disabled. Enable it in the Notifications tab to let Clutch learn from your conversations.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text-secondary mb-1">What Clutch remembers</p>
        <p className="text-xs text-text-muted">These facts are automatically extracted from your conversations and used to give you better coaching.</p>
      </div>

      {isLoading ? (
        <SkeletonCard lines={4} />
      ) : facts.length === 0 ? (
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 text-center">
          <span className="text-3xl mb-3 block">🧠</span>
          <p className="text-sm text-text-muted">No memories yet. Keep chatting with Clutch — it will start learning after your first few conversations.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {facts.map(fact => (
            <div key={fact.id} className="flex items-start gap-3 bg-surface-panel border border-surface-border rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-secondary leading-snug">{fact.fact}</p>
                <p className="text-xs text-text-muted mt-1">
                  Reinforced {fact.reinforcement_count}× · {new Date(fact.last_reinforced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => deleteMemoryFact.mutate(fact.id)}
                className="shrink-0 p-1 text-text-muted hover:text-error transition-colors"
                title="Forget this"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M9 3L3 9M3 3l6 6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-text-muted">
        {facts.length} / 30 memory slots used. Oldest facts are removed automatically when the limit is reached.
      </p>
    </div>
  )
}

function AccountSection() {
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const { logout } = useAuthStore()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete('/auth/account')
      logout()
    } catch {
      toast.error('Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  const handlePasswordChange = async () => {
    try {
      const { data: me } = await api.get('/auth/me')
      await api.post('/auth/forgot-password', { email: me.user.email })
      toast.success('Password reset email sent')
    } catch {
      toast.error('Failed to send reset email')
    }
  }

  const { enabled: debugEnabled, toggle: toggleDebug, openPanel: openDebugPanel } = useDebugStore()

  return (
    <div className="space-y-5">
            <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-secondary">Debug mode</p>
            <p className="text-xs text-text-muted mt-0.5">Show live API call logs in a floating panel</p>
          </div>
          <Toggle checked={debugEnabled} onChange={toggleDebug} />
        </div>
        {debugEnabled && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={openDebugPanel}
              className="text-xs text-primary-glow underline underline-offset-2"
            >
              Open debug panel →
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
        <p className="text-sm font-medium text-text-secondary mb-1">Change password</p>
        <p className="text-xs text-text-muted mb-3">We'll send a reset link to your email</p>
        <Button variant="secondary" size="sm" onClick={handlePasswordChange}>
          Send reset link
        </Button>
      </div>

      <div className="bg-error/5 border border-error/20 rounded-xl p-4">
        <p className="text-sm font-medium text-error mb-1">Delete account</p>
        <p className="text-xs text-text-muted mb-3">
          This permanently deletes your account, profile, and all data. This cannot be undone.
        </p>
        {!confirm ? (
          <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>
            Delete account
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
              Yes, delete everything
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('Profile')
  const { data: user, isLoading } = useMe()

  return (
    <>
      <TopBar title="Settings" />
      <PageContent>
        <div className="max-w-2xl">
          {/* Tab pills */}
          <div className="flex gap-1 mb-6 bg-surface-panel p-1 rounded-xl w-fit">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  tab === t
                    ? 'bg-surface-card text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {isLoading ? (
            <SkeletonCard lines={5} />
          ) : (
            <>
              {tab === 'Profile' && <ProfileSection user={user} />}
              {tab === 'Voice Profile' && <VoiceProfileSection user={user} />}
              {tab === 'Notifications' && <NotificationsSection user={user} />}
              {tab === 'Memory' && <MemorySection user={user} />}
              {tab === 'Account' && <AccountSection />}
            </>
          )}
        </div>
      </PageContent>
    </>
  )
}
