import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing env vars — Realtime features will be disabled')
}

// Anon-key client — ONLY for Realtime subscriptions
// All data operations go through the Express backend
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null

export default supabase
