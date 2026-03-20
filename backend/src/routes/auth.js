// src/routes/auth.js
// ============================================================
// AUTH ROUTES
//
// POST   /api/auth/register         — Email+password signup
// POST   /api/auth/login            — Email+password login
// POST   /api/auth/logout           — Logout (invalidate session)
// POST   /api/auth/refresh          — Refresh access token
// GET    /api/auth/me               — Get current user profile
// POST   /api/auth/profile/ensure   — Create profile after OAuth/email verify
// GET    /api/auth/google/url       — Get Google OAuth redirect URL
//
// EMAIL VERIFICATION FLOW:
//   1. Register → Supabase sends verification email (email_confirm: false)
//   2. User clicks link → redirect to /auth/callback in frontend
//   3. Frontend calls POST /api/auth/profile/ensure with JWT
//   4. Profile created → redirect to /onboarding
//
// GOOGLE OAUTH FLOW:
//   1. GET /api/auth/google/url → returns Supabase OAuth URL
//   2. User authenticates with Google
//   3. Supabase redirects to /auth/callback with tokens in URL hash
//   4. Frontend calls POST /api/auth/profile/ensure
//   5. Profile created/confirmed → redirect to dashboard or onboarding
//
// ROLLBACK FIX:
//   If profile creation fails after auth user is created, we retry
//   up to 3 times with exponential backoff. If all retries fail,
//   we delete the orphaned auth user and log the failure with full
//   context so it can be investigated and the user can retry.
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import authenticate from '../middleware/auth.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING UTILITIES
// Mirrors the pattern from practice.js for consistency across the backend.
// ──────────────────────────────────────────

const log = (event, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return `${k}=${JSON.stringify(v)}`;
      return `${k}=${v}`;
    })
    .filter(Boolean)
    .join(' ');
  console.log(`[Auth] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Auth] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Auth] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

const logJob = (name, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Auth] 🔄 Job [${name}]${entries ? ` → ${entries}` : ''}`);
};

// Returns a readable elapsed-time string from a start timestamp
const elapsedMs = (startMs) => `${Date.now() - startMs}ms`;


// ──────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────
router.post('/register', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { name, email, password } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  log('REGISTER Request', { ip: clientIp });

  // ── Input validation ──────────────────────────────────────────────────────
  if (!email?.trim()) {
    log('REGISTER Validation Failed', { reason: 'missing_email', ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email is required' });
  }

  if (!password) {
    log('REGISTER Validation Failed', { reason: 'missing_password', ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password is required' });
  }

  if (password.length < 8) {
    log('REGISTER Validation Failed', { reason: 'password_too_short', minLength: 8, ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  log('REGISTER Validation Passed', { hasName: !!name?.trim(), ip: clientIp });

  // ── Step 1: Create Supabase auth user ────────────────────────────────────
  log('REGISTER Step 1 — Creating Supabase Auth User', { ip: clientIp });

  const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { name: name?.trim() || '' },
      emailRedirectTo:
        process.env.OAUTH_REDIRECT_URL ||
        `${process.env.FRONTEND_URL}/auth/callback`
    }
  });
  if (authData.user?.identities?.length === 0) {
  log('REGISTER Blocked — Email Already Registered (identities=[])', { ip: clientIp });
  return res.status(409).json({
    error:   'EMAIL_TAKEN',
    message: 'An account with this email already exists. Please sign in.'
  });
}

  if (authError) {
    const isEmailTaken =
      authError.message?.toLowerCase().includes('already registered') ||
      authError.message?.toLowerCase().includes('user already registered');

    if (isEmailTaken) {
      log('REGISTER Blocked — Email Already Registered', { ip: clientIp });
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'An account with this email already exists. Please sign in.'
      });
    }

    logError('POST /register → signUp', authError, { ip: clientIp });
    return res.status(400).json({
      error: 'REGISTRATION_ERROR',
      message: authError.message || 'Registration failed. Please try again.'
    });
  }

  const userId = authData.user?.id;

  if (!userId) {
    logError('POST /register → signUp', new Error('No userId returned from signUp'), { ip: clientIp });
    return res.status(500).json({
      error: 'REGISTRATION_FAILED',
      message: 'Account setup failed. Please try again.'
    });
  }

  log('REGISTER Step 1 Done — Auth User Created', {
    userId,
    elapsed: elapsedMs(startTime)
  });

  // ── Step 2: Create user profile with retry + rollback ────────────────────
  log('REGISTER Step 2 — Creating User Profile', { userId });
  logDB('RPC', 'create_user_profile', {
    userId,
    tier: 'free',
    hasName: !!name?.trim()
  });

  const profileCreated = await createUserProfileWithRetry(userId, {
    name: name?.trim() || null,
    email: normalizedEmail,
    tier: 'free'
  });

  if (!profileCreated) {
    logError(
      'POST /register → createUserProfileWithRetry',
      new Error('All retry attempts exhausted'),
      { userId }
    );

    // Rollback: delete the orphaned Supabase auth user
    logJob('deleteAuthUser', {
      userId,
      reason: 'profile_creation_failed',
      action: 'rollback'
    });

    await deleteAuthUserWithRetry(userId);

    return res.status(500).json({
      error: 'REGISTRATION_FAILED',
      message: 'Account setup failed. Please try again in a moment.'
    });
  }

  logDB('RPC OK', 'create_user_profile', {
    userId,
    elapsed: elapsedMs(startTime)
  });

  log('REGISTER Complete', {
    userId,
    needsVerification: true,
    elapsed: elapsedMs(startTime)
  });

  return res.status(201).json({
    success: true,
    needsVerification: true,
    message: 'Account created! Please check your email to verify your account before signing in.',
    email: normalizedEmail
  });
}));



// ──────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { email, password } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  log('LOGIN Request', { ip: clientIp });

  // ── Input validation ──────────────────────────────────────────────────────
  if (!email?.trim()) {
    log('LOGIN Validation Failed', { reason: 'missing_email', ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email is required' });
  }
  if (!password) {
    log('LOGIN Validation Failed', { reason: 'missing_password', ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  log('LOGIN Validation Passed — Attempting Supabase Auth', { ip: clientIp });

  // ── Supabase signIn ───────────────────────────────────────────────────────
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email:    normalizedEmail,
    password
  });

  if (error) {
    const msg = error.message?.toLowerCase() || '';

    if (msg.includes('email not confirmed')) {
      log('LOGIN Blocked — Email Not Verified', { ip: clientIp });
      return res.status(403).json({
        error:             'EMAIL_NOT_VERIFIED',
        message:           'Please verify your email address before signing in. Check your inbox.',
        needsVerification: true,
        email:             normalizedEmail
      });
    }

    if (
      msg.includes('invalid login') ||
      msg.includes('invalid credentials') ||
      msg.includes('wrong password')
    ) {
      log('LOGIN Failed — Invalid Credentials', { ip: clientIp });
      return res.status(401).json({
        error:   'INVALID_CREDENTIALS',
        message: 'Incorrect email or password. Please try again.'
      });
    }

    logError('POST /login → signInWithPassword', error, { ip: clientIp });
    return res.status(401).json({
      error:   'LOGIN_FAILED',
      message: error.message || 'Login failed. Please try again.'
    });
  }

  log('LOGIN Auth Success — Fetching Profile', { userId: data.user.id });
  logDB('SELECT', 'users', { userId: data.user.id, purpose: 'login_profile_fetch' });

  // ── Fetch full profile ────────────────────────────────────────────────────
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profile?.is_deleted) {
    log('LOGIN Blocked — Account Is Deleted', { userId: data.user.id, ip: clientIp });
    return res.status(403).json({
      error:   'ACCOUNT_DELETED',
      message: 'This account has been deleted.'
    });
  }

  log('LOGIN Complete', {
    userId:             data.user.id,
    hasProfile:         !!profile,
    onboardingComplete: profile?.onboarding_completed || false,
    tier:               profile?.tier || 'free',
    elapsed:            elapsedMs(startTime)
  });

  res.json({
    user:    profile || { id: data.user.id, email: data.user.email },
    session: {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at:    data.session.expires_at
    }
  });
}));


// ──────────────────────────────────────────
// POST /api/auth/logout
// ──────────────────────────────────────────
router.post('/logout', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const userId     = req.user?.id || 'unauthenticated';

  log('LOGOUT Request', { userId });

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    log('LOGOUT Invalidating Session via Supabase admin.signOut', { userId });

    await supabaseAdmin.auth.admin.signOut(token).catch((err) => {
      // Non-fatal — token may already be expired or previously invalidated
      log('LOGOUT signOut Non-Fatal Warning', { userId, reason: err.message });
    });
  } else {
    log('LOGOUT No Bearer Token Provided — Skipping Supabase signOut', { userId });
  }

  log('LOGOUT Complete', { userId });
  res.json({ success: true });
}));


// ──────────────────────────────────────────
// POST /api/auth/refresh
// ──────────────────────────────────────────
router.post('/refresh', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const { refresh_token } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  log('REFRESH Request', { hasToken: !!refresh_token, ip: clientIp });

  if (!refresh_token) {
    log('REFRESH Validation Failed', { reason: 'missing_refresh_token', ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'refresh_token is required' });
  }

  log('REFRESH Calling Supabase refreshSession', { ip: clientIp });

  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });

  if (error || !data?.session) {
    log('REFRESH Failed — Session Expired or Invalid', {
      ip:     clientIp,
      reason: error?.message || 'no session returned'
    });
    return res.status(401).json({
      error:   'REFRESH_FAILED',
      message: 'Session expired. Please sign in again.'
    });
  }

  log('REFRESH Complete', { userId: data.user?.id, elapsed: elapsedMs(startTime) });

  res.json({
    session: {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at:    data.session.expires_at
    }
  });
}));


// ──────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('ME Request', { userId });
  logDB('SELECT', 'users', { userId, purpose: 'get_current_user_profile' });

  const { data: profile, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    logError('GET /me → users SELECT', error || new Error('No profile returned'), { userId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'User profile not found' });
  }

  log('ME Complete', {
    userId,
    tier:               profile.tier,
    onboardingComplete: profile.onboarding_completed,
    archetype:          profile.archetype || 'not set'
  });

  res.json({ user: profile });
}));


// ──────────────────────────────────────────
// POST /api/auth/profile/ensure
// Creates user profile after OAuth or email verification.
// Verifies the JWT independently — no existing profile required.
// ──────────────────────────────────────────
router.post('/profile/ensure', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const authHeader = req.headers.authorization;
  const clientIp   = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  log('PROFILE/ENSURE Request', { ip: clientIp });

  if (!authHeader?.startsWith('Bearer ')) {
    log('PROFILE/ENSURE Validation Failed', { reason: 'missing_bearer_token', ip: clientIp });
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  log('PROFILE/ENSURE Verifying JWT', { ip: clientIp });

  const { data: { user: authUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);

  if (verifyError || !authUser) {
    log('PROFILE/ENSURE JWT Invalid or Expired', { ip: clientIp, reason: verifyError?.message });
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
  }

  const provider = authUser.app_metadata?.provider || 'email';
  log('PROFILE/ENSURE JWT Verified', { userId: authUser.id, provider });

  // ── Check for existing profile ────────────────────────────────────────────
  logDB('SELECT', 'users', { userId: authUser.id, purpose: 'profile_existence_check' });

  const { data: existingProfile } = await supabaseAdmin
    .from('users')
    .select('id, onboarding_completed, archetype, tier')
    .eq('id', authUser.id)
    .single();

  if (existingProfile) {
    log('PROFILE/ENSURE Profile Already Exists — Returning Existing', {
      userId:             authUser.id,
      onboardingComplete: existingProfile.onboarding_completed,
      tier:               existingProfile.tier,
      elapsed:            elapsedMs(startTime)
    });
    return res.json({ user: existingProfile, isNewUser: false });
  }

  // ── Create new profile (Google OAuth users or re-registration) ────────────
  const name  = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
  const email = authUser.email;

  log('PROFILE/ENSURE No Existing Profile — Creating New', {
    userId:  authUser.id,
    hasName: !!name,
    provider
  });
  logDB('INSERT', 'users', { userId: authUser.id, email, tier: 'free' });

  const { data: newProfile, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id:    authUser.id,
      email,
      name:  name?.trim() || null,
      tier:  'free',
    })
    .select()
    .single();

  if (profileError) {
    logError('POST /profile/ensure → users INSERT', profileError, { userId: authUser.id });
    return res.status(500).json({
      error:   'PROFILE_CREATION_FAILED',
      message: 'Could not create your profile. Please try again.'
    });
  }

  log('PROFILE/ENSURE Complete — New Profile Created', {
    userId:  authUser.id,
    provider,
    elapsed: elapsedMs(startTime)
  });

  res.status(201).json({ user: newProfile, isNewUser: true });
}));


// ──────────────────────────────────────────
// GET /api/auth/google/url
// Returns the Supabase Google OAuth redirect URL
// ──────────────────────────────────────────
router.get('/google/url', asyncHandler(async (req, res) => {
  const clientIp   = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const redirectTo = process.env.OAUTH_REDIRECT_URL ||
    `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`;

  log('GOOGLE/URL Request', { redirectTo, ip: clientIp });

  const { data, error } = await supabaseAdmin.auth.signInWithOAuth({
    provider: 'google',
    options:  {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt:      'consent'
      }
    }
  });

  if (error || !data?.url) {
    logError('GET /google/url → signInWithOAuth', error || new Error('No URL returned'), { ip: clientIp });
    return res.status(500).json({
      error:   'OAUTH_ERROR',
      message: 'Could not generate Google sign-in URL. Please try again.'
    });
  }

  log('GOOGLE/URL Generated Successfully', { ip: clientIp });
  res.json({ url: data.url });
}));


// ──────────────────────────────────────────
// POST /api/auth/resend-verification
// ──────────────────────────────────────────
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email } = req.body;
  const clientIp  = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  log('RESEND-VERIFICATION Request', { ip: clientIp });

  if (!email?.trim()) {
    log('RESEND-VERIFICATION Validation Failed', { reason: 'missing_email', ip: clientIp });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  log('RESEND-VERIFICATION Calling Supabase resend', { ip: clientIp });

  // Supabase handles rate limiting internally on this endpoint
  const { error } = await supabaseAdmin.auth.resend({
    type:  'signup',
    email: normalizedEmail
  });

  if (error) {
    // Log but never surface — prevents email enumeration attacks
    log('RESEND-VERIFICATION Supabase Non-Fatal Warning', { reason: error.message, ip: clientIp });
  }

  // Always return 200 — never reveal whether the email exists in the system
  log('RESEND-VERIFICATION Complete', {
    ip:   clientIp,
    note: '200 always returned to prevent email enumeration'
  });

  res.json({
    success: true,
    message: 'If an account with this email exists, a verification email has been sent.'
  });
}));


// ──────────────────────────────────────────
// INTERNAL HELPERS
// ──────────────────────────────────────────

/**
 * Creates user profile via RPC with exponential backoff retry.
 * Uses SECURITY DEFINER RPC to bypass RLS — avoids JWT contamination
 * on the shared supabaseAdmin singleton client.
 * Returns true on success, false if all retries exhausted.
 */
const createUserProfileWithRetry = async (userId, data, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logJob('createUserProfile', { status: 'attempt', attempt, maxRetries, userId, tier: data.tier });

      const { error } = await supabaseAdmin.rpc('create_user_profile', {
        p_id:    userId,
        p_email: data.email,
        p_name:  data.name  || null,
        p_tier:  data.tier  || 'free',
      });

      if (!error) {
        logJob('createUserProfile', { status: 'success', attempt, userId });
        return true;
      }

      // ON CONFLICT DO NOTHING: profile already exists from a concurrent request — treat as success
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        logJob('createUserProfile', { status: 'already_exists_ok', attempt, userId });
        return true;
      }

      logError(
        `createUserProfileWithRetry attempt ${attempt}/${maxRetries}`,
        error,
        { userId, attempt }
      );

      if (attempt < maxRetries) {
        const backoffMs = attempt * 500; // 500ms → 1000ms → 1500ms
        log('createUserProfile Backing Off', { userId, attempt, backoffMs });
        await sleep(backoffMs);
      }
    } catch (err) {
      logError(
        `createUserProfileWithRetry exception attempt ${attempt}/${maxRetries}`,
        err,
        { userId, attempt }
      );
      if (attempt < maxRetries) await sleep(attempt * 500);
    }
  }

  logError(
    'createUserProfileWithRetry',
    new Error(`All ${maxRetries} attempts failed — profile not created`),
    { userId }
  );
  return false;
};

/**
 * Deletes orphaned Supabase auth user with retry and exponential backoff.
 * Called as rollback when profile creation fails after auth user was created.
 * Logs failures but never throws — caller still returns 500 to the client.
 */
const deleteAuthUserWithRetry = async (userId, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logJob('deleteAuthUser', { status: 'attempt', attempt, maxRetries, userId, reason: 'rollback_orphan' });

      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

      if (!error) {
        logJob('deleteAuthUser', { status: 'success', attempt, userId });
        return;
      }

      logError(
        `deleteAuthUserWithRetry attempt ${attempt}/${maxRetries}`,
        error,
        { userId, attempt }
      );

      if (attempt < maxRetries) {
        const backoffMs = attempt * 1000; // 1000ms → 2000ms → 3000ms
        log('deleteAuthUser Backing Off', { userId, attempt, backoffMs });
        await sleep(backoffMs);
      }
    } catch (err) {
      logError(
        `deleteAuthUserWithRetry exception attempt ${attempt}/${maxRetries}`,
        err,
        { userId, attempt }
      );
      if (attempt < maxRetries) await sleep(attempt * 1000);
    }
  }

  // All rollback attempts failed — auth user is now orphaned.
  // User cannot log in (no profile) but auth record blocks re-registration.
  // Requires manual cleanup in the Supabase dashboard.
  console.error(
    `[Auth] ❌ CRITICAL: Orphaned auth user userId=${userId} could not be deleted after ${maxRetries} attempts. Manual cleanup required in Supabase dashboard.`
  );
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default router;
