// src/routes/onboarding.js
// ============================================================
// ONBOARDING ROUTES — Hybrid-Progressive AI Questions
//
// AUDIT FIXES (v2):
//  FIX-01  websites array (Option B) — stores full array in `websites`
//          column + mirrors first URL to legacy `website` column
//  FIX-02  basic_info re-fetched from DB in /questions/next —
//          never trust client-provided data in AI prompts
//  FIX-03  buildVoiceProfile catch-all fallback — 500 errors during
//          voice profile generation no longer strand users
//  FIX-04  role validated server-side (was frontend-only)
//  FIX-05  auto-goal floating promise fixed — uses .catch() correctly
//  FIX-06  /sample-message select * replaced with explicit columns
//  FIX-07  seedMemoryFromOnboarding gets isRebuild flag to prevent
//          duplicate memory rows on /rebuild-voice-profile calls
//  FIX-08  All Groq calls wrapped in concurrency guard to prevent
//          429 bursts during simultaneous onboarding sessions
//  FIX-09  opportunities refresh triggered as background task after
//          /answers so it fires even if frontend tab is closed
//  NEW     business_stage, experience_level, preferred_platforms,
//          country, state now injected into all Groq prompt calls
//  NEW     Comprehensive structured logging throughout
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import groqService from '../services/groq.js';
import supabaseAdmin from '../config/supabase.js';
import { detectAndSaveArchetype } from '../jobs/growthIntelligenceScheduler.js';
import { discoverOpportunities } from '../services/perplexity.js';
import groqServiceRaw from '../services/groq.js';

const router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// LOGGING UTILITY
// Follows the same pattern as practice.js but with additional log levels
// for AI calls, background jobs, and per-request timing.
// ──────────────────────────────────────────────────────────────────────────────
const log = (event, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return `${k}=${JSON.stringify(v)}`;
      return `${k}=${v}`;
    })
    .filter(Boolean)
    .join(' ');
  console.log(`[Onboarding] ${event}${entries ? ` → ${entries}` : ''}`);
};

const logError = (fn, err, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.error(`[Onboarding] ❌ ${fn} — ${err?.message || err}${entries ? ` | ${entries}` : ''}`);
};

const logDB = (operation, table, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Onboarding] 🗄️  DB ${operation} → table=${table}${entries ? ` ${entries}` : ''}`);
};

const logAI = (fn, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Onboarding] 🤖 AI [${fn}]${entries ? ` → ${entries}` : ''}`);
};

const logJob = (name, data = {}) => {
  const entries = Object.entries(data)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  console.log(`[Onboarding] 🔄 Job [${name}]${entries ? ` → ${entries}` : ''}`);
};

// Returns a function that returns elapsed ms since creation
const timer = () => {
  const start = Date.now();
  return () => `${Date.now() - start}ms`;
};

// ──────────────────────────────────────────────────────────────────────────────
// ONBOARDING GROQ CONCURRENCY GUARD                               (FIX-08)
// ──────────────────────────────────────────────────────────────────────────────
// Prevents Groq 429s during simultaneous onboarding bursts.
// Module-level singleton — shared across all concurrent requests on this
// Node.js instance.
//
// Paul uses a 10-key multi-provider pool (~300 req/min capacity), so the
// cap is intentionally generous (15 concurrent). The main benefit is the
// light stagger delay that prevents a precise burst of simultaneous calls
// hitting the same key in the same 100ms window.
//
// Behaviour:
//   • At most MAX_CONCURRENT active Groq calls at once.
//   • When capacity is full, callers queue and wait in FIFO order.
//   • When running > 1, a stagger delay is inserted before each call
//     proportional to load — spreads bursts naturally.
// ──────────────────────────────────────────────────────────────────────────────
const MAX_CONCURRENT_GROQ = 15;
const STAGGER_MS_PER_SLOT = 150; // ms of extra spacing per active slot above 1

class ConcurrencyGuard {
  #running = 0;
  #pending = [];

  async run(label, fn) {
    if (this.#running >= MAX_CONCURRENT_GROQ) {
      logJob('GroqQueue', { status: 'queued', label, running: this.#running, queued: this.#pending.length });
      await new Promise((resolve, reject) => this.#pending.push({ resolve, reject }));
    }

    this.#running++;

    // Stagger when under load — spread the burst across time
    if (this.#running > 1) {
      const delay = STAGGER_MS_PER_SLOT * Math.min(this.#running - 1, 6);
      logJob('GroqQueue', { status: 'stagger', label, delayMs: delay, running: this.#running });
      await new Promise(r => setTimeout(r, delay));
    }

    logJob('GroqQueue', { status: 'running', label, running: this.#running });

    try {
      return await fn();
    } finally {
      this.#running--;
      const next = this.#pending.shift();
      if (next) next.resolve();
      logJob('GroqQueue', { status: 'released', label, running: this.#running, queued: this.#pending.length });
    }
  }
}

const groqQueue = new ConcurrencyGuard();

// ──────────────────────────────────────────────────────────────────────────────
// FALLBACK VOICE PROFILE                                          (FIX-03)
// ──────────────────────────────────────────────────────────────────────────────
// Used if buildVoiceProfile throws entirely (network outage, all keys
// exhausted, etc.). The user still completes onboarding. The fallback is
// partially personalised with whatever basicInfo we already have.
// ──────────────────────────────────────────────────────────────────────────────
const buildFallbackVoiceProfile = (basicInfo = {}) => ({
  unique_value_prop:            basicInfo.product_description
    ? `${basicInfo.product_description.slice(0, 80)} — update your profile to personalise further`
    : 'Update your profile in Settings to complete personalisation',
  icp_trigger:                  'When the core pain is acute and they need a solution now',
  target_customer_description:  basicInfo.target_audience || 'Your ideal customer based on what you described',
  main_objection:               'Price or timing concerns',
  objection_reframe:            'Focus on specific ROI and proof points from your best results',
  best_proof_point:             'Complete your profile settings to add specific proof points',
  voice_style:                  'conversational, direct',
  outreach_persona:             'Genuine founder sharing something useful',
  avoid_phrases:                ['just checking in', 'hope this finds you well', 'revolutionary'],
});

// ──────────────────────────────────────────────────────────────────────────────
// BACKGROUND: Trigger opportunities refresh                       (FIX-09)
// ──────────────────────────────────────────────────────────────────────────────
// Fire-and-forget after /answers so leads are seeded even if the user closes
// the tab before reaching Step 3's "Enter FounderSales" button.
//
// Requires: add `export { runOpportunitiesRefreshForUser }` to opportunities.js
// (see groq-changes document). If that export is not yet available, this call
// safely no-ops because of the try/catch wrapper.
// ──────────────────────────────────────────────────────────────────────────────
const triggerOpportunitiesBackground = (userId, freshUser) => {
  setImmediate(async () => {
    logJob('OpportunitiesRefresh', { status: 'triggered', userId });
    try {
      // Dynamic import avoids circular-dependency risk at module load time
      const { runOpportunitiesRefreshForUser } = await import('./opportunities.js');
      await runOpportunitiesRefreshForUser(userId, freshUser);
      logJob('OpportunitiesRefresh', { status: 'complete', userId });
    } catch (err) {
      // Non-fatal — the frontend will also trigger this on Step 3 complete
      logError('triggerOpportunitiesBackground', err, { userId });
    }
  });
};

// ─────────────────────────────────────────
// POST /onboarding/basic
// Step 1: Save basic info, generate Burst 1 questions (The Foundation)
// ─────────────────────────────────────────
router.post('/basic', asyncHandler(async (req, res) => {
  const elapsed = timer();
  const userId  = req.user.id;

  log('POST /basic START', { userId, ip: req.ip });

  const {
    name, role, experience_level, industry, bio,
    business_name, business_stage, goal_target_value, goal_target_unit,
    goal_target_date, websites,                // FIX-01: plural array
    product_description, target_audience, industry_deep_dive,
    country, state, preferred_platforms, primary_goal,
  } = req.body;

  // ── Server-side validation ────────────────────────────────────────────────
  // FIX-04: role was only validated on the frontend — now enforced here too
  if (!product_description?.trim()) {
    log('POST /basic REJECTED', { userId, reason: 'missing product_description' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Product description is required' });
  }
  if (!target_audience?.trim()) {
    log('POST /basic REJECTED', { userId, reason: 'missing target_audience' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Target audience is required' });
  }
  if (!role) {
    log('POST /basic REJECTED', { userId, reason: 'missing role' });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Role is required' });
  }

  // ── Normalise websites (Option B — store full array)  ────────────────────
  // FIX-01: Frontend sends `websites` as string[]. We store the full array in
  // the `websites` JSONB column and mirror the first URL to the legacy `website`
  // text column for backward compatibility with other parts of the system.
  // ─ DB REQUIREMENT: ADD COLUMN IF NOT EXISTS websites jsonb DEFAULT '[]'::jsonb
  const websitesArray = Array.isArray(websites)
    ? websites.filter(w => typeof w === 'string' && w.trim().length > 5).map(w => w.trim())
    : [];
  const primaryWebsite = websitesArray[0] || null;

  log('POST /basic VALIDATION PASSED', {
    userId, role, industry: industry || 'none', business_stage: business_stage || 'none',
    experience_level: experience_level || 'none', websiteCount: websitesArray.length,
    hasPrimaryGoal: !!primary_goal,
  });

  // ── Persist basic info ────────────────────────────────────────────────────
  logDB('UPDATE', 'users', { userId, fields: 'name,business_name,product_description,target_audience,websites,role,industry,experience_level,business_stage,country,state,primary_goal,preferred_platforms' });

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      name:                name?.trim()                   || null,
      business_name:       business_name?.trim()          || null,
      product_description: product_description.trim(),
      target_audience:     target_audience.trim(),
      bio:                 bio?.trim()                    || null,
      // FIX-01: store full array + mirror first URL to legacy column
      websites:            websitesArray,
      website:             primaryWebsite,
      role:                role                           || null,
      industry:            industry                       || null,
      experience_level:    experience_level               || null,
      industry_deep_dive:  industry_deep_dive?.trim()     || null,
      country:             country                        || null,
      state:               state                         || null,
      primary_goal:        primary_goal?.trim()           || null,
      preferred_platforms: preferred_platforms            || [],
      onboarding_step:     1,
      business_stage:      business_stage                 || null,
      goal_target_value:   goal_target_value              ?? null,
      goal_target_unit:    goal_target_unit?.trim()       || null,
      goal_target_date:    goal_target_date               || null,
    })
    .eq('id', userId);

  if (updateError) {
    logError('POST /basic DB UPDATE', updateError, { userId });
    throw updateError;
  }

  logDB('UPDATE OK', 'users', { userId, elapsed: elapsed() });

  // ── Generate Burst 1: The Foundation (Product & Proof) ────────────────────
  const burstPayload = {
    business_name,
    product_description: product_description.trim(),
    target_audience:     target_audience.trim(),
    bio:                 bio?.trim() || null,
    industry:            industry || null,
    industry_deep_dive:  industry_deep_dive?.trim() || null,
    role:                role || null,
    // NEW: additional context for sharper AI questions
    experience_level:    experience_level || null,
    business_stage:      business_stage  || null,
    primary_goal:        primary_goal?.trim() || null,
  };

  logAI('generateBurst1Questions', {
    userId, industry: burstPayload.industry, role: burstPayload.role,
    experience_level: burstPayload.experience_level, business_stage: burstPayload.business_stage,
  });

  const result = await groqQueue.run('burst1', () =>
    groqService.generateBurst1Questions(burstPayload)
  );

  logAI('generateBurst1Questions DONE', {
    userId, source: result.source, questionCount: result.questions?.length, elapsed: elapsed(),
  });

  if (result.source === 'fallback') {
    log('POST /basic FALLBACK QUESTIONS USED', { userId, reason: 'AI unavailable or returned invalid structure' });
  }

  log('POST /basic COMPLETE', { userId, elapsed: elapsed() });

  res.json({
    success:    true,
    burst1:     result.questions,
    ai_source:  result.source,
    next_step:  2,
    message:    'Basic info saved. Your first questions are ready.',
  });
}));

// ─────────────────────────────────────────
// POST /onboarding/questions/next
// Dynamically generate the next burst of questions
// ─────────────────────────────────────────
router.post('/questions/next', asyncHandler(async (req, res) => {
  const elapsed = timer();
  const userId  = req.user.id;

  log('POST /questions/next START', { userId });

  const { burst_number, previous_answers } = req.body;
  // NOTE: we intentionally do NOT destructure basic_info from the body —
  // we re-fetch it from the DB below (FIX-02).

  if (!burst_number || burst_number < 2 || burst_number > 3) {
    log('POST /questions/next REJECTED', { userId, reason: 'invalid burst_number', burst_number });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'burst_number must be 2 or 3',
    });
  }

  if (!previous_answers || typeof previous_answers !== 'object' || Array.isArray(previous_answers)) {
    log('POST /questions/next REJECTED', { userId, reason: 'invalid previous_answers' });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'previous_answers must be an object',
    });
  }

  // ── FIX-02: Re-fetch basic_info from DB ───────────────────────────────────
  // Never trust the client to supply prompt context. If a malicious or
  // buggy client sends doctored basicInfo, our Groq prompts would use it.
  // Re-fetching here is one extra DB read but fully eliminates the risk.
  logDB('SELECT', 'users', { userId, purpose: 'secure basic_info re-fetch for /questions/next' });

  const { data: storedUser, error: fetchError } = await supabaseAdmin
    .from('users')
    .select(
      'business_name, product_description, target_audience, bio, industry, ' +
      'role, experience_level, business_stage, primary_goal, preferred_platforms, ' +
      'country, state'
    )
    .eq('id', userId)
    .single();

  if (fetchError || !storedUser?.product_description) {
    logError('POST /questions/next DB fetch', fetchError || new Error('no product_description'), { userId });
    return res.status(400).json({
      error:   'PROFILE_REQUIRED',
      message: 'Complete your basic info in Step 1 first',
    });
  }

  logDB('SELECT OK', 'users', { userId, elapsed: elapsed() });

  const secureBasicInfo = {
    business_name:       storedUser.business_name,
    product_description: storedUser.product_description,
    target_audience:     storedUser.target_audience,
    bio:                 storedUser.bio,
    industry:            storedUser.industry,
    role:                storedUser.role,
    experience_level:    storedUser.experience_level,
    business_stage:      storedUser.business_stage,
    primary_goal:        storedUser.primary_goal,
    preferred_platforms: storedUser.preferred_platforms || [],
    country:             storedUser.country,
    state:               storedUser.state,
  };

  log('POST /questions/next GENERATING', {
    userId, burst_number, prevAnswerCount: Object.keys(previous_answers).length,
    experience_level: secureBasicInfo.experience_level, business_stage: secureBasicInfo.business_stage,
  });

  logAI('generateNextBurst', { userId, burst_number });

  const result = await groqQueue.run(`burst${burst_number}`, () =>
    groqService.generateNextBurst({
      burst_number,
      previous_answers,
      basic_info: secureBasicInfo,  // Using DB-sourced data (FIX-02)
    })
  );

  logAI('generateNextBurst DONE', {
    userId, burst_number, source: result.source,
    questionCount: result.questions?.length, elapsed: elapsed(),
  });

  if (result.source === 'fallback') {
    log('POST /questions/next FALLBACK USED', { userId, burst_number, reason: 'AI returned invalid structure or failed' });
  }

  log('POST /questions/next COMPLETE', { userId, burst_number, elapsed: elapsed() });

  res.json({
    success:           true,
    questions:         result.questions,
    interlude_message: result.interlude_message,
    ai_source:         result.source,
  });
}));

// ─────────────────────────────────────────
// POST /onboarding/answers
// Final step: Save answers, build voice profile, seed memory, create first goal
// ─────────────────────────────────────────
router.post('/answers', asyncHandler(async (req, res) => {
  const elapsed = timer();
  const userId  = req.user.id;

  log('POST /answers START', { userId });

  const { answers } = req.body;

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    log('POST /answers REJECTED', { userId, reason: 'invalid answers shape' });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'Answers must be an object with question-answer pairs',
    });
  }

  const answerCount = Object.keys(answers).length;
  if (answerCount === 0) {
    log('POST /answers REJECTED', { userId, reason: 'empty answers' });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'At least one answer is required',
    });
  }

  // Prevent absurdly large payloads that would bloat the AI prompt
  if (answerCount > 30) {
    log('POST /answers REJECTED', { userId, reason: 'too many answers', answerCount });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'Too many answers submitted — maximum 30 per session',
    });
  }

  log('POST /answers RECEIVED', { userId, answerCount });

  // ── Fetch existing user profile ────────────────────────────────────────────
  logDB('SELECT', 'users', { userId, purpose: 'load existing answers + full profile for voice builder' });

  const { data: existingUser, error: selectError } = await supabaseAdmin
    .from('users')
    .select(
      'onboarding_answers, product_description, target_audience, business_name, ' +
      'name, websites, website, bio, industry, role, primary_goal, preferred_platforms, ' +
      'goal_target_value, goal_target_unit, goal_target_date, business_stage, ' +
      'experience_level, country, state'
    )
    .eq('id', userId)
    .single();

  if (selectError) {
    logError('POST /answers DB SELECT', selectError, { userId });
    throw selectError;
  }

  logDB('SELECT OK', 'users', { userId, hasExistingAnswers: !!(existingUser?.onboarding_answers) });

  // Merge with any previously saved answers (handles retry scenarios)
  const mergedAnswers = {
    ...(existingUser?.onboarding_answers || {}),
    ...answers,
  };

  log('POST /answers MERGING', { userId, prevCount: Object.keys(existingUser?.onboarding_answers || {}).length, newCount: answerCount, mergedCount: Object.keys(mergedAnswers).length });

  // ── Save answers (step 2) ─────────────────────────────────────────────────
  logDB('UPDATE', 'users', { userId, fields: 'onboarding_answers,onboarding_step' });

  const { error: saveError } = await supabaseAdmin
    .from('users')
    .update({ onboarding_answers: mergedAnswers, onboarding_step: 2 })
    .eq('id', userId);

  if (saveError) {
    logError('POST /answers DB save answers', saveError, { userId });
    throw saveError;
  }

  logDB('UPDATE OK', 'users', { userId, mergedAnswerCount: Object.keys(mergedAnswers).length });

  // ── Build voice profile ────────────────────────────────────────────────────
  const basicInfo = {
    business_name:       existingUser?.business_name,
    product_description: existingUser?.product_description,
    target_audience:     existingUser?.target_audience,
    websites:            existingUser?.websites || [],
    website:             existingUser?.website  || null,
    bio:                 existingUser?.bio,
    industry:            existingUser?.industry,
    role:                existingUser?.role,
    // NEW: added to AI prompt context
    experience_level:    existingUser?.experience_level,
    business_stage:      existingUser?.business_stage,
    preferred_platforms: existingUser?.preferred_platforms || [],
    country:             existingUser?.country,
    state:               existingUser?.state,
    primary_goal:        existingUser?.primary_goal,
  };

  logAI('buildVoiceProfile', {
    userId, answerCount: Object.keys(mergedAnswers).length,
    hasIndustry: !!basicInfo.industry, hasStage: !!basicInfo.business_stage,
    hasExperienceLevel: !!basicInfo.experience_level,
  });

  // FIX-03: Wrap in try/catch with a meaningful fallback so a Groq outage
  // (all keys exhausted, network issue, etc.) never strands the user with a 500.
  let voiceProfile;
  let voiceProfileSource = 'ai';

  try {
    voiceProfile = await groqQueue.run('buildVoiceProfile', () =>
      groqService.buildVoiceProfile(basicInfo, mergedAnswers)
    );
    logAI('buildVoiceProfile DONE', { userId, elapsed: elapsed(), keys: Object.keys(voiceProfile).join(',') });
  } catch (vpError) {
    logError('buildVoiceProfile', vpError, { userId });
    log('POST /answers VOICE_PROFILE_FALLBACK', { userId, reason: vpError.message });
    voiceProfile      = buildFallbackVoiceProfile(basicInfo);
    voiceProfileSource = 'fallback';
  }

  // ── Mark onboarding complete (step 3) ─────────────────────────────────────
  logDB('UPDATE', 'users', { userId, fields: 'voice_profile,onboarding_completed,onboarding_step' });

  const { error: profileError } = await supabaseAdmin
    .from('users')
    .update({
      voice_profile:        voiceProfile,
      onboarding_completed: true,
      onboarding_step:      3,
    })
    .eq('id', userId);

  if (profileError) {
    logError('POST /answers DB profile save', profileError, { userId });
    throw profileError;
  }

  logDB('UPDATE OK', 'users', { userId, onboarding_completed: true, elapsed: elapsed() });

  // Build a fresh user object for background tasks that need the latest state
  const freshUser = {
    ...req.user,
    ...basicInfo,
    voice_profile:        voiceProfile,
    onboarding_completed: true,
  };

  // ── Background tasks (non-blocking, all individually error-contained) ──────
  log('POST /answers BACKGROUND TASKS START', { userId });

  // 1. Archetype detection
  logJob('detectAndSaveArchetype', { status: 'triggered', userId });
  detectAndSaveArchetype(userId, {
    ...basicInfo,
    onboarding_answers: mergedAnswers,
  }).catch(err => logError('detectAndSaveArchetype', err, { userId }));

  // 2. Seed user_memory from onboarding data — rich day-1 AI context
  logJob('seedMemoryFromOnboarding', { status: 'triggered', userId });
  groqService.seedMemoryFromOnboarding(userId, basicInfo, mergedAnswers, voiceProfile, false)
    .catch(err => logError('seedMemoryFromOnboarding', err, { userId }));

  // 3. Auto-create first Goal from primary_goal (if set)
  if (existingUser?.primary_goal?.trim()) {
    logJob('autoCreateGoal', { status: 'triggered', userId, goal: existingUser.primary_goal.slice(0, 60) });
    // FIX-05: was a floating .then() — now properly chained with .catch()
    supabaseAdmin.from('user_goals').insert({
      user_id:      userId,
      goal_text:    existingUser.primary_goal.trim(),
      goal_type:    'custom',
      status:       'active',
      target_value: existingUser?.goal_target_value ?? null,
      target_unit:  existingUser?.goal_target_unit  || null,
      target_date:  existingUser?.goal_target_date  || null,
      created_at:   new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) {
        logError('autoCreateGoal DB INSERT', error, { userId });
      } else {
        logJob('autoCreateGoal', { status: 'success', userId });
      }
    })
    .catch(err => logError('autoCreateGoal', err, { userId }));
  } else {
    log('POST /answers', { userId, note: 'no primary_goal set — skipping auto-goal creation' });
  }

  // 4. FIX-09: Trigger opportunities refresh as a backend background task.
  //    This guarantees leads are seeded even if the user closes the tab
  //    before clicking "Enter FounderSales" on Step 3.
  logJob('opportunitiesRefresh', { status: 'triggered', userId });
  triggerOpportunitiesBackground(userId, freshUser);

  log('POST /answers COMPLETE', {
    userId, elapsed: elapsed(),
    voiceProfileSource, mergedAnswerCount: Object.keys(mergedAnswers).length,
  });

  res.json({
    success:           true,
    voice_profile:     voiceProfile,
    voice_profile_source: voiceProfileSource,
    answers_saved:     Object.keys(mergedAnswers).length,
    message:           'Clutch has learned your voice. Your opportunity feed is being set up.',
    next_step:         'complete',
    has_primary_goal:  !!existingUser?.primary_goal,
  });
}));

// ─────────────────────────────────────────
// POST /onboarding/sample-message
// Onboarding wow moment — generates a sample outreach message using
// the user's voice profile + their first opportunity (or a generated context).
// ─────────────────────────────────────────
router.post('/sample-message', asyncHandler(async (req, res) => {
  const elapsed = timer();
  const userId  = req.user.id;

  log('POST /sample-message START', { userId });

  // FIX-06: was select('*, voice_profile') — star fetches all columns
  // including large JSONB fields. Now explicitly request only what we need.
  logDB('SELECT', 'users', { userId, purpose: 'load voice profile for sample message' });

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, product_description, target_audience, voice_profile, preferred_platforms, business_name')
    .eq('id', userId)
    .single();

  if (userError) {
    logError('POST /sample-message DB SELECT', userError, { userId });
    throw userError;
  }

  if (!user?.voice_profile) {
    log('POST /sample-message REJECTED', { userId, reason: 'no voice_profile — onboarding not complete' });
    return res.status(400).json({
      error:   'PROFILE_REQUIRED',
      message: 'Complete onboarding first to generate a sample message',
    });
  }

  logDB('SELECT OK', 'users', { userId, hasVoiceProfile: true });

  // Try to find a real opportunity to ground the sample message in reality
  let sampleProspectContext = null;

  logDB('SELECT', 'opportunities', { userId, purpose: 'find first opportunity for wow-moment context' });
  const { data: firstOpportunity } = await supabaseAdmin
    .from('opportunities')
    .select('target_context, platform, target_name')
    .eq('user_id', userId)
    .in('status', ['pending', 'viewed'])
    .order('composite_score', { ascending: false })
    .limit(1)
    .single();

  if (firstOpportunity?.target_context) {
    const platformName = firstOpportunity.platform
      ? firstOpportunity.platform.charAt(0).toUpperCase() + firstOpportunity.platform.slice(1)
      : 'Web';
    sampleProspectContext = `[${platformName}] ${firstOpportunity.target_context.slice(0, 400)}`;
    log('POST /sample-message', { userId, prospectContextSource: 'real_opportunity', platform: firstOpportunity.platform });
  } else {
    log('POST /sample-message', { userId, prospectContextSource: 'generated_fallback', note: 'no opportunities yet — will use synthetic context' });
  }

  logAI('generateSampleOutreachMessage', { userId, hasRealProspect: !!sampleProspectContext });

  const sampleMessage = await groqQueue.run('sampleMessage', () =>
    groqService.generateSampleOutreachMessage(user, sampleProspectContext)
  );

  logAI('generateSampleOutreachMessage DONE', { userId, messageLength: sampleMessage?.length, elapsed: elapsed() });

  log('POST /sample-message COMPLETE', { userId, elapsed: elapsed() });

  res.json({
    success:               true,
    sample_message:        sampleMessage,         // NOTE: frontend must read data.sample_message
    based_on_opportunity:  !!sampleProspectContext,
    opportunity_context:   sampleProspectContext?.slice(0, 200) || null,
    message:               'This is what your outreach sounds like when Clutch knows your business.',
  });
}));

// ─────────────────────────────────────────
// GET /onboarding/status
// Returns current onboarding progress for UI gates and resumption logic.
// NOTE: Kept unchanged per audit review — this endpoint is actively used.
// ─────────────────────────────────────────
router.get('/status', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  log('GET /status', { userId });

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('onboarding_completed, onboarding_step, name, voice_profile, business_name, primary_goal')
    .eq('id', userId)
    .single();

  if (error) {
    logError('GET /status DB SELECT', error, { userId });
    throw error;
  }

  res.json({
    completed:         user?.onboarding_completed || false,
    step:              user?.onboarding_step      || 0,
    has_voice_profile: !!user?.voice_profile,
    has_primary_goal:  !!user?.primary_goal,
    name:              user?.name,
    business_name:     user?.business_name,
  });
}));

// ─────────────────────────────────────────
// PUT /onboarding/profile
// ─────────────────────────────────────────
router.put('/profile', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { voice_profile } = req.body;

  log('PUT /profile', { userId });

  if (!voice_profile || typeof voice_profile !== 'object') {
    log('PUT /profile REJECTED', { userId, reason: 'invalid voice_profile type' });
    return res.status(400).json({
      error:   'VALIDATION_ERROR',
      message: 'Invalid voice profile format',
    });
  }

  logDB('UPDATE', 'users', { userId, fields: 'voice_profile' });

  const { error } = await supabaseAdmin
    .from('users')
    .update({ voice_profile })
    .eq('id', userId);

  if (error) {
    logError('PUT /profile DB UPDATE', error, { userId });
    throw error;
  }

  logDB('UPDATE OK', 'users', { userId });
  log('PUT /profile COMPLETE', { userId });

  res.json({
    success: true,
    message: 'Profile updated. Clutch will use your new profile for future messages.',
  });
}));

// ─────────────────────────────────────────
// POST /onboarding/rebuild-voice-profile
// Rebuilds the voice profile from existing onboarding answers.
// Also re-seeds memory with isRebuild=true to clear stale onboarding memories.
// ─────────────────────────────────────────
router.post('/rebuild-voice-profile', asyncHandler(async (req, res) => {
  const elapsed = timer();
  const userId  = req.user.id;

  log('POST /rebuild-voice-profile START', { userId });

  logDB('SELECT', 'users', { userId });

  const { data: user, error: selectError } = await supabaseAdmin
    .from('users')
    .select(
      'business_name, product_description, target_audience, websites, website, bio, ' +
      'industry, role, experience_level, business_stage, preferred_platforms, ' +
      'country, state, primary_goal, onboarding_answers'
    )
    .eq('id', userId)
    .single();

  if (selectError) {
    logError('POST /rebuild-voice-profile DB SELECT', selectError, { userId });
    throw selectError;
  }

  if (!user?.onboarding_answers || !user?.product_description) {
    log('POST /rebuild-voice-profile REJECTED', { userId, reason: 'incomplete onboarding data' });
    return res.status(400).json({
      error:   'ONBOARDING_REQUIRED',
      message: 'Complete onboarding first',
    });
  }

  logDB('SELECT OK', 'users', { userId });
  logAI('buildVoiceProfile (rebuild)', { userId });

  let voiceProfile;
  try {
    voiceProfile = await groqQueue.run('rebuildVoiceProfile', () =>
      groqService.buildVoiceProfile(user, user.onboarding_answers)
    );
    logAI('buildVoiceProfile (rebuild) DONE', { userId, elapsed: elapsed() });
  } catch (vpError) {
    logError('rebuild buildVoiceProfile', vpError, { userId });
    voiceProfile = buildFallbackVoiceProfile(user);
  }

  logDB('UPDATE', 'users', { userId, fields: 'voice_profile' });
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({ voice_profile: voiceProfile })
    .eq('id', userId);

  if (updateError) {
    logError('POST /rebuild-voice-profile DB UPDATE', updateError, { userId });
    throw updateError;
  }

  logDB('UPDATE OK', 'users', { userId });

  // FIX-07: Pass isRebuild=true so seedMemoryFromOnboarding deletes stale
  // onboarding-seeded memories before inserting fresh ones, preventing
  // duplicate memory rows accumulating across multiple rebuilds.
  logJob('seedMemoryFromOnboarding (rebuild)', { status: 'triggered', userId, isRebuild: true });
  groqService.seedMemoryFromOnboarding(userId, user, user.onboarding_answers, voiceProfile, true)
    .catch(err => logError('seedMemoryFromOnboarding (rebuild)', err, { userId }));

  log('POST /rebuild-voice-profile COMPLETE', { userId, elapsed: elapsed() });

  res.json({ success: true, voice_profile: voiceProfile });
}));

export default router;
