// src/config/supabase.js
// Backend uses SERVICE KEY to bypass RLS when running background jobs
// Routes use USER JWT to enforce RLS automatically

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Service client - for background jobs, admin operations
// NEVER expose this key to the frontend
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

// Creates a user-scoped client from their JWT
// Used in route handlers to automatically enforce RLS
export const supabaseForUser = (userJwt) => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

export default supabaseAdmin;
