// src/routes/user.js
// ============================================================
// USER ROUTES
// Extracted from app.js where they were inline.
// All routes are authenticated via the authenticate middleware
// applied in app.js: app.use('/api/user', authenticate, userRoutes)
//
// PUT  /api/user/fcm-token                 — Save FCM push token
// PUT  /api/user/debug                     — Toggle debug mode
// PUT  /api/auth/me                        — Update profile fields
// PUT  /api/user/notification-preferences  — Update notification prefs
// DELETE /api/auth/account                 — Delete account (soft + hard)
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import {
  DEFAULT_NOTIFICATION_PREFS
} from '../config/constants.js';

const router = Router();

// ──────────────────────────────────────────
// STRUCTURED LOGGING UTILITIES
// Mirrors the pattern established in practice.js for consistency.
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
  console.log(`[User] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[User] ❌ Error in ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[User] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

// ──────────────────────────────────────────
// PUT /api/user/fcm-token
// Save Firebase Cloud Messaging push token
// ──────────────────────────────────────────
router.put('/fcm-token', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { token } = req.body;

  log('FCM Token Update — Request', { userId });

  if (!token?.trim()) {
    log('FCM Token Update — Validation Failed', { userId, reason: 'missing_or_empty_token' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'token is required' });
  }

  log('FCM Token Update — Writing', { userId, tokenLength: token.trim().length });
  logDB('UPDATE', 'users', { userId, field: 'fcm_token' });

  const { error } = await supabaseAdmin
    .from('users')
    .update({ fcm_token: token.trim() })
    .eq('id', userId);

  if (error) {
    logError('PUT /fcm-token', error, { userId });
    return res.status(500).json({ error: 'DB_ERROR', message: error.message });
  }

  log('FCM Token Update — Done', { userId });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// PUT /api/user/debug
// Toggle debug mode (for mobile development)
// ──────────────────────────────────────────
router.put('/debug', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { enabled } = req.body;

  log('Debug Mode Toggle — Request', { userId, requestedEnabled: !!enabled });
  logDB('UPDATE', 'users', { userId, field: 'debug_mode', value: !!enabled });

  const { error } = await supabaseAdmin
    .from('users')
    .update({ debug_mode: !!enabled })
    .eq('id', userId);

  if (error) {
    logError('PUT /debug', error, { userId, enabled: !!enabled });
    return res.status(500).json({ error: 'DB_ERROR', message: error.message });
  }

  log('Debug Mode Toggle — Done', { userId, debug_mode: !!enabled });
  res.json({ success: true, debug_mode: !!enabled });
}));

// ──────────────────────────────────────────
// PUT /api/user/notification-preferences
// FIX: Now allows all 7 notification preference keys (was only 4)
// FEATURE 2 + 3: Accepts memory_enabled and email_digest_enabled
// ──────────────────────────────────────────
router.put('/notification-preferences', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('Notification Prefs Update — Request', {
    userId,
    bodyKeys: Object.keys(req.body).join(',') || 'none',
  });

  // All notification preference keys from constants.js DEFAULT_NOTIFICATION_PREFS
  const ALLOWED_PREF_KEYS = Object.keys(DEFAULT_NOTIFICATION_PREFS);

  const prefs = {};
  for (const key of ALLOWED_PREF_KEYS) {
    if (req.body[key] !== undefined) prefs[key] = !!req.body[key];
  }

  const hasMemoryEnabled      = req.body.memory_enabled !== undefined;
  const hasEmailDigestEnabled = req.body.email_digest_enabled !== undefined;

  if (!Object.keys(prefs).length && !hasMemoryEnabled && !hasEmailDigestEnabled) {
    log('Notification Prefs Update — Validation Failed', {
      userId,
      reason:       'no_valid_pref_keys_in_body',
      receivedKeys: Object.keys(req.body).join(',') || 'none',
      allowedKeys:  ALLOWED_PREF_KEYS.join(','),
    });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: `At least one valid preference key required: ${ALLOWED_PREF_KEYS.join(', ')}`
    });
  }

  log('Notification Prefs Update — Parsed', {
    userId,
    prefKeysChanged:     Object.keys(prefs).length,
    updatingMemory:      hasMemoryEnabled,
    updatingEmailDigest: hasEmailDigestEnabled,
  });

  // Merge with existing preferences rather than replacing all
  logDB('SELECT', 'users', { userId, fields: 'notification_preferences', purpose: 'merge_before_write' });
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('notification_preferences')
    .eq('id', userId)
    .single();

  if (fetchError) {
    // Non-fatal — fall back to defaults and continue
    logError('PUT /notification-preferences → fetch_existing (non-fatal)', fetchError, { userId });
    log('Notification Prefs Update — Fetch Failed, Using Defaults', { userId });
  }

  const mergedPrefs = {
    ...(existing?.notification_preferences || DEFAULT_NOTIFICATION_PREFS),
    ...prefs
  };

  // Build the user-level updates object (memory_enabled, email_digest_enabled are top-level columns)
  const userUpdates = { notification_preferences: mergedPrefs };
  if (hasMemoryEnabled)       userUpdates.memory_enabled       = !!req.body.memory_enabled;
  if (hasEmailDigestEnabled)  userUpdates.email_digest_enabled = !!req.body.email_digest_enabled;

  log('Notification Prefs Update — Writing', {
    userId,
    columnsUpdated:  Object.keys(userUpdates).join(','),
    mergedPrefCount: Object.keys(mergedPrefs).length,
  });
  logDB('UPDATE', 'users', { userId, fields: Object.keys(userUpdates).join(',') });

  const { error } = await supabaseAdmin
    .from('users')
    .update(userUpdates)
    .eq('id', userId);

  if (error) {
    logError('PUT /notification-preferences', error, { userId });
    return res.status(500).json({ error: 'DB_ERROR', message: error.message });
  }

  log('Notification Prefs Update — Done', {
    userId,
    memoryEnabled:      userUpdates.memory_enabled      ?? 'unchanged',
    emailDigestEnabled: userUpdates.email_digest_enabled ?? 'unchanged',
    prefKeysUpdated:    Object.keys(prefs).join(',') || 'none',
  });

  res.json({ success: true, notification_preferences: mergedPrefs });
}));

// ──────────────────────────────────────────
// GET /api/user/memory  — Feature 2
// Returns the user's active AI memory facts
// ──────────────────────────────────────────
router.get('/memory', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('Memory Facts — Request', { userId });
  logDB('SELECT', 'user_memory', {
    userId,
    filter:  'is_active=true',
    orderBy: 'reinforcement_count desc',
    limit:   30,
  });

  const { data: facts, error } = await supabaseAdmin
    .from('user_memory')
    .select('id, fact, reinforcement_count, last_reinforced_at, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('reinforcement_count', { ascending: false })
    .limit(30);

  if (error) {
    logError('GET /memory', error, { userId });
    throw error;
  }

  log('Memory Facts — Done', { userId, factCount: facts?.length || 0 });
  res.json({ facts: facts || [] });
}));

// ──────────────────────────────────────────
// DELETE /api/user/memory/:id  — Feature 2
// Soft-deletes (deactivates) a single memory fact
// ──────────────────────────────────────────
router.delete('/memory/:id', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const factId = req.params.id;

  log('Memory Fact Delete — Request', { userId, factId });

  // Verify ownership before deactivating — prevents cross-user data mutation
  logDB('SELECT', 'user_memory', { factId, userId, purpose: 'ownership_check' });
  const { data: fact, error: lookupError } = await supabaseAdmin
    .from('user_memory')
    .select('id')
    .eq('id', factId)
    .eq('user_id', userId)
    .single();

  if (lookupError || !fact) {
    log('Memory Fact Delete — Not Found or Unauthorised', { userId, factId });
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Memory fact not found' });
  }

  log('Memory Fact Delete — Deactivating', { userId, factId });
  logDB('UPDATE', 'user_memory', { factId, userId, is_active: false });

  const { error } = await supabaseAdmin
    .from('user_memory')
    .update({ is_active: false })
    .eq('id', factId);

  if (error) {
    logError('DELETE /memory/:id', error, { userId, factId });
    throw error;
  }

  log('Memory Fact Delete — Done', { userId, factId });
  res.json({ success: true });
}));

// ──────────────────────────────────────────
// PUT /api/auth/me
// Update editable profile fields
// Note: mounted under /api/auth, not /api/user
// ──────────────────────────────────────────
export const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('Profile Update — Request', {
    userId,
    receivedFields: Object.keys(req.body).join(',') || 'none',
  });

  const ALLOWED_FIELDS = [
    'name', 'business_name', 'product_description', 'target_audience',
    'website', 'role', 'industry', 'experience_level', 'bio', 'preferred_platforms'
  ];

  const updates = {};
  for (const key of ALLOWED_FIELDS) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    log('Profile Update — Validation Failed', {
      userId,
      reason:         'no_allowed_fields_in_body',
      receivedFields: Object.keys(req.body).join(',') || 'none',
      allowedFields:  ALLOWED_FIELDS.join(','),
    });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'No valid fields to update' });
  }

  log('Profile Update — Writing', {
    userId,
    fieldsToUpdate: Object.keys(updates).join(','),
    fieldCount:     Object.keys(updates).length,
  });
  logDB('UPDATE', 'users', { userId, fields: Object.keys(updates).join(',') });

  const { error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    logError('PUT /auth/me', error, { userId, fields: Object.keys(updates).join(',') });
    return res.status(500).json({ error: 'DB_ERROR', message: error.message });
  }

  log('Profile Update — Done', {
    userId,
    fieldsUpdated: Object.keys(updates).join(','),
  });
  res.json({ success: true });
});

// ──────────────────────────────────────────
// DELETE /api/auth/account
// Account deletion — best and safest approach:
//
// We keep the soft-delete in users table (preserves FK integrity
// for opportunities, feedback, analytics) AND hard-delete the
// Supabase auth user (revokes all tokens, prevents re-login).
//
// ORDER MATTERS: soft-delete first, then hard-delete auth.
// If auth delete fails, the account is soft-deleted (inaccessible)
// so no real security risk — user can't log back in either way
// since the auth middleware rejects is_deleted accounts.
// ──────────────────────────────────────────
export const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  log('Account Delete — Request', { userId });

  // Step 1: Soft delete — marks account inactive, clears FCM token, scrubs PII
  log('Account Delete — Applying Soft Delete + PII Scrub', {
    userId,
    scrubbing: 'name,email,voice_profile',
    clearing:  'fcm_token',
  });
  logDB('UPDATE', 'users', { userId, purpose: 'soft_delete_pii_scrub', is_deleted: true });

  const { error: softDeleteError } = await supabaseAdmin
    .from('users')
    .update({
      is_deleted:       true,
      fcm_token:        null,
      deleted_at:       new Date().toISOString(),
      // Scrub PII from the profile while preserving analytics integrity
      name:             null,
      email:            `deleted_${userId}@deleted.invalid`,
      voice_profile:    null,
    })
    .eq('id', userId);

  if (softDeleteError) {
    logError('DELETE /auth/account → soft_delete', softDeleteError, { userId });
    return res.status(500).json({ error: 'DELETE_FAILED', message: 'Account deletion failed. Please try again.' });
  }

  log('Account Delete — Soft Delete Applied', { userId, piiScrubbed: true });

  // Step 2: Hard delete from Supabase auth (revokes all tokens)
  log('Account Delete — Revoking Supabase Auth User', { userId });

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authDeleteError) {
    // Non-fatal: account is already soft-deleted and auth middleware blocks access.
    // Log for manual cleanup but return success to user.
    logError('DELETE /auth/account → auth_hard_delete (non-fatal)', authDeleteError, {
      userId,
      softDeleteComplete: true,
      note: 'account_inaccessible_manual_auth_cleanup_required',
    });
  } else {
    log('Account Delete — Auth User Revoked', { userId });
  }

  log('Account Delete — Done', {
    userId,
    softDeleted: true,
    authRevoked: !authDeleteError,
  });

  res.json({ success: true, message: 'Your account has been deleted.' });
});

export default router;
