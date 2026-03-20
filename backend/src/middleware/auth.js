// src/middleware/auth.js
// ============================================================
// JWT AUTHENTICATION MIDDLEWARE
// Validates Supabase JWT, attaches full user object to req.user.
// Rejects deleted accounts.
//
// FIX: Added 'archetype' and 'preferred_platforms' to SELECT —
// these were missing, causing req.user.archetype to always be
// undefined, which broke the entire growth personalization system.
// ============================================================

import supabaseAdmin from '../config/supabase.js';

// ── Issue 14: 30-second in-memory profile cache ──────────────────────────────
const PROFILE_CACHE_TTL_MS = 30 * 1000;
const profileCache = new Map(); // userId → { profile, expiresAt }

export const clearProfileCache = (userId) => { if (userId) profileCache.delete(userId); };

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of profileCache.entries()) {
    if (entry.expiresAt <= now) profileCache.delete(key);
  }
}, 5 * 60 * 1000);

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in.'
    });
  }

  const token = authHeader.slice(7);

  try {
    // Verify JWT with Supabase — handles expiry, signature, everything
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Session expired. Please log in again.'
      });
    }

    // Fetch profile — check cache first, then Supabase
    let profile = null;
    const cached = profileCache.get(user.id);
    if (cached && cached.expiresAt > Date.now()) {
      profile = cached.profile;
    } else {
      const { data: freshProfile } = await supabaseAdmin
        .from('users')
        .select(
          'id, name, email, tier, onboarding_completed, onboarding_step, ' +
          'voice_profile, debug_mode, is_deleted, fcm_token, ' +
          'business_name, product_description, target_audience, role, industry, ' +
          'archetype, preferred_platforms, notification_preferences'
        )
        .eq('id', user.id)
        .single();
      profile = freshProfile;
      if (profile && !profile.is_deleted) {
        profileCache.set(user.id, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
      }
    }

    // Deleted accounts are rejected even with a valid JWT
    if (profile?.is_deleted) {
      clearProfileCache(user.id); // ensure deleted accounts are never served from cache
      return res.status(403).json({
        error: 'ACCOUNT_DELETED',
        message: 'This account has been deleted.'
      });
    }

    // Attach everything downstream routes need
    req.user = {
      id: user.id,
      email: user.email,
      jwt: token,
      ...(profile || {})
    };

    next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    return res.status(401).json({
      error: 'AUTH_ERROR',
      message: 'Authentication failed. Please log in again.'
    });
  }
};

export default authenticate;
