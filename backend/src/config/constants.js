// src/config/constants.js  (also used in frontend via src/utils/constants.js)
// ============================================================
// CLUTCH AI - CENTRAL CONSTANTS V4
// V4 changes:
//   - Added PATTERN_DETECTION, SKILL_PROGRESSION intervals
//   - Added GROWTH_PUSH_MORNING, GROWTH_PUSH_EVENING intervals
//   - Added MIN_ANALYSES_FOR_PATTERNS constant
//   - Added INSIGHTS_CACHE_HOURS constant
//   - Added GROWTH_PUSH_MAX_PER_DAY, GROWTH_PUSH_MIN_GAP_HOURS
// ============================================================

// ── Tiers ─────────────────────────────────────────────────────────────────────
export const TIERS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise'
};
export const CHAT_MODES = {
  GENERAL:        'general',
  MEETING_NOTES:  'meeting_notes',
  PREP:           'prep',
  FOLLOWUP_COACH: 'followup_coach',
};

// ── Meeting outcomes ───────────────────────────────────────────────────────────
export const MEETING_OUTCOMES = {
  HOT:      'hot',
  POSITIVE: 'positive',
  NEUTRAL:  'neutral',
  COLD:     'cold',
  DEAD:     'dead',
};

export const MEETING_OUTCOME_LABELS = {
  hot:      '🔥 Hot',
  positive: '✅ Positive',
  neutral:  '😐 Neutral',
  cold:     '❄️ Cold',
  dead:     '💀 Dead end',
};

// ── Signal types ───────────────────────────────────────────────────────────────
export const SIGNAL_TYPES = {
  BUYING:     'buying',
  RISK:       'risk',
  TIMING:     'timing',
  ENGAGEMENT: 'engagement',
};

// ── Commitment statuses ────────────────────────────────────────────────────────
export const COMMITMENT_STATUSES = {
  PENDING: 'pending',
  DONE:    'done',
  OVERDUE: 'overdue',
  IGNORED: 'ignored',
};

// ── Prospect stages ────────────────────────────────────────────────────────────
export const PROSPECT_STAGES = {
  PROSPECT:   'prospect',
  ENGAGED:    'engaged',
  NEGOTIATING: 'negotiating',
  CLOSED_WON:  'closed_won',
  CLOSED_LOST: 'closed_lost',
  DORMANT:     'dormant',
};

// ── Insight types ──────────────────────────────────────────────────────────────
export const INSIGHT_TYPES = {
  PATTERN:          'pattern',
  STALL:            'stall',
  QUESTION_CLUSTER: 'question_cluster',
  TIMING_ALERT:     'timing_alert',
  WIN_PATTERN:      'win_pattern',
};

// ── Updated ROUTES — add prospects ─────────────────────────────────────────────
// Replace the existing ROUTES export with:


export const ROUTES = {
  LOGIN:            '/login',
  REGISTER:         '/register',
  FORGOT_PASSWORD:  '/forgot-password',
  RESET_PASSWORD:   '/reset-password',
  ONBOARDING:       '/onboarding',
  DASHBOARD:        '/dashboard',
  GROWTH:           '/growth',
  OPPORTUNITIES:    '/opportunities',
  INSIGHTS:         '/insights',   // V4 NEW
  PIPELINE:         '/pipeline',
  CHAT:             '/chat',
  PRACTICE:         '/practice',
  CALENDAR:         '/calendar',
  PROSPECTS:        '/prospects', 
  METRICS:          '/metrics',
  SETTINGS:         '/settings',
  GOALS:            '/goals',
};


// ── Perplexity limits ─────────────────────────────────────────────────────────
export const PERPLEXITY_LIMITS = {
  [TIERS.FREE]:       2,
  [TIERS.PRO]:        20,
  [TIERS.ENTERPRISE]: 30,
};

export const PERPLEXITY_GLOBAL_DAILY_CAP       = 500;
export const PERPLEXITY_COST_PER_CALL_CENTS    = 5;
export const PERPLEXITY_GLOBAL_DAILY_CAP_TOKENS = 2_000_000;

export const PERPLEXITY_TOKEN_LIMITS = {
  [TIERS.FREE]:       50_000,
  [TIERS.PRO]:       500_000,
  [TIERS.ENTERPRISE]: 9_999_999,
};

export const GROQ_LIMITS = {
  [TIERS.FREE]:       Infinity,
  [TIERS.PRO]:        Infinity,
  [TIERS.ENTERPRISE]: Infinity,
};

export const COST_PER_1K_TOKENS = {
  perplexity_sonar_pro: 0.1,
  groq: 0,
};

// ── Model names ───────────────────────────────────────────────────────────────
export const MODELS = {
  GROQ:       process.env.GROQ_MODEL       || 'llama-3.1-8b-instant',
  PERPLEXITY: process.env.PERPLEXITY_MODEL || 'sonar-pro',
};

// ── Pipeline stages ───────────────────────────────────────────────────────────
export const PIPELINE_STAGES = {
  NEW:         'new',
  CONTACTED:   'contacted',
  REPLIED:     'replied',
  CALL_DEMO:   'call_demo',
  CLOSED_WON:  'closed_won',
  CLOSED_LOST: 'closed_lost',
};

export const PIPELINE_STAGE_VALUES = Object.values(PIPELINE_STAGES);

export const STAGE_LABELS = {
  new:         'New',
  contacted:   'Contacted',
  replied:     'Replied',
  call_demo:   'Call / Demo',
  closed_won:  'Closed Won',
  closed_lost: 'Closed Lost',
};

export const STAGE_COLORS = {
  new:         '#64748B',
  contacted:   '#3B82F6',
  replied:     '#8B5CF6',
  call_demo:   '#F59E0B',
  closed_won:  '#10B981',
  closed_lost: '#F43F5E',
};

// ── Opportunity status ────────────────────────────────────────────────────────
export const OPP_STATUS = {
  PENDING: 'pending',
  VIEWED:  'viewed',
  ACTED:   'acted',
  SENT:    'sent',
  DONE:    'done',
};

export const OPPORTUNITY_STATUS = OPP_STATUS;

// ── Feedback outcomes ─────────────────────────────────────────────────────────
export const FEEDBACK_OUTCOMES = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
};

// ── Chat types ────────────────────────────────────────────────────────────────
export const CHAT_TYPES = {
  GENERAL:     'general',
  OPPORTUNITY: 'opportunity',
  PRACTICE:    'practice',
};

// ── Message delivery states ───────────────────────────────────────────────────
export const DELIVERY_STATUS = {
  PENDING:   'pending',
  DELIVERED: 'delivered',
  SEEN:      'seen',
  REPLIED:   'replied',
  GHOSTED:   'ghosted',
};

// ── Practice scenarios ────────────────────────────────────────────────────────
export const PRACTICE_SCENARIOS = [
  { type: 'interested',       weight: 25, label: 'Interested Lead',    reply_delay_range: [30, 120]  },
  { type: 'polite_decline',   weight: 25, label: 'Polite No',          reply_delay_range: [60, 300]  },
  { type: 'ghost',            weight: 20, label: 'No Response',        reply_delay_range: null       },
  { type: 'skeptical',        weight: 15, label: 'Skeptical Response', reply_delay_range: [45, 180]  },
  { type: 'price_objection',  weight: 10, label: 'Price Concern',      reply_delay_range: [120, 400] },
  { type: 'not_right_time',   weight: 5,  label: 'Bad Timing',         reply_delay_range: [90, 240]  },
];

export const GHOST_TIMEOUT_SECONDS = 600;

// ── Practice pressure modifiers ───────────────────────────────────────────────
// Keys MUST match the frontend PRESSURE_MODIFIERS constant in practice.jsx
export const PRESSURE_MODIFIERS = [
  { type: 'decision_maker_watching', label: '👀 Decision Maker Watching', description: 'Someone important is observing this conversation' },
  { type: 'aggressive_buyer',        label: '😤 Aggressive Buyer',        description: 'Short on time and very direct' },
  { type: 'competitor_mentioned',    label: '🏁 Competitor Mentioned',    description: 'They recently looked at an alternative option' },
  { type: 'compliance_concern',      label: '🔒 Compliance Concern',      description: 'Rules, approvals, or policies are a factor' },
];

export const SCENARIO_LABELS = {
  interested:      'Interested',
  polite_decline:  'Polite Decline',
  ghost:           'Ghost',
  skeptical:       'Skeptical',
  price_objection: 'Price Objection',
  not_right_time:  'Not Right Time',
};

export const SCENARIO_COLORS = {
  interested:      '#10B981',
  polite_decline:  '#F59E0B',
  ghost:           '#64748B',
  skeptical:       '#F43F5E',
  price_objection: '#8B5CF6',
  not_right_time:  '#0EA5E9',
};

// ── Opportunity feed ──────────────────────────────────────────────────────────
export const OPPORTUNITIES_PER_RUN = 8;
export const MIN_COMPOSITE_SCORE   = 5;

// ── Follow-up sequence thresholds (days of inactivity per stage) ──────────────
export const FOLLOW_UP_THRESHOLDS = {
  contacted: 4,
  replied:   6,
  call_demo: 3,
};

// ── Email digest ──────────────────────────────────────────────────────────────
export const EMAIL_DIGEST_FROM = process.env.EMAIL_DIGEST_FROM || 'Clutch AI <coach@clutch.ai>';

// ── Intel (Prospect Quick Intel) daily limits ─────────────────────────────────
export const INTEL_DAILY_LIMITS = {
  [TIERS.FREE]:       2,
  [TIERS.PRO]:        Infinity,
  [TIERS.ENTERPRISE]: Infinity,
};

// ── Goal nudge ────────────────────────────────────────────────────────────────
export const GOAL_NUDGE_MIN_DAYS     = 3;
export const GOAL_NUDGE_STALE_DAYS   = 5;
export const GOAL_NUDGE_DEADLINE_DAYS = 7;

// ── V4 NEW: Pattern Intelligence constants ────────────────────────────────────
// Minimum number of conversation analyses needed before pattern detection runs
export const MIN_ANALYSES_FOR_PATTERNS = 5;

// Hours to cache the "Why You're Losing" AI report before regenerating
export const INSIGHTS_CACHE_HOURS = 24;

// Conversation Autopsy: on-demand analyses rate limit per user per hour
export const PITCH_DIAGNOSTIC_HOURLY_LIMIT = 10;

// ── V4 NEW: Growth push notification limits ───────────────────────────────────
// Maximum push notifications per user per 24-hour period
export const GROWTH_PUSH_MAX_PER_DAY = 2;

// Minimum hours between any two push notifications for the same user
export const GROWTH_PUSH_MIN_GAP_HOURS = 6;

// Days of inactivity before a user is excluded from push notifications
export const GROWTH_PUSH_INACTIVITY_DAYS = 14;

// ── Background job intervals ──────────────────────────────────────────────────
export const JOB_INTERVALS = {
  MESSAGE_QUEUE_WORKER:  '*/30 * * * * *',  // Every 30 seconds
  OPPORTUNITY_FETCH:     '0 */6 * * *',      // Every 6 hours
  FEEDBACK_PROMPTS:      '0 * * * *',        // Every hour
  PERFORMANCE_SUMMARY:   '0 2 * * *',        // 2am daily
  METRICS_AGGREGATION:   '0 3 * * *',        // 3am daily
  CALENDAR_PREP:         '0 8 * * *',        // 8am daily
  DAILY_TIP_GENERATION:  '0 7 * * *',        // 7am daily
  GROWTH_PUSH_MORNING:   '0 9 * * *',        // 9am daily   [V4 NEW]
  CHECK_IN_SCHEDULER:    '0 14 * * *',       // 2pm daily
  GROWTH_PUSH_EVENING:   '0 18 * * *',       // 6pm daily   [V4 NEW]
  WEEKLY_PLAN:           '0 18 * * 0',       // 6pm Sunday
  FOLLOW_UP_CHECK:       '0 10 * * *',       // 10am daily
  MEMORY_EXTRACTION:     '*/30 * * * *',     // Every 30 minutes
  EMAIL_DIGEST:          '0 18 * * 0',       // Sunday 6pm
  GOAL_NUDGE_CHECK:      '0 9 * * *',        // 9am daily
  PATTERN_DETECTION:     '0 20 * * 0',       // Sunday 8pm  [V4 NEW]
  SKILL_PROGRESSION:     '0 21 * * 0',       // Sunday 9pm  [V4 NEW]
  PATTERN_INSIGHTS: '0 20 * * 0'
};

// ── Background job types ──────────────────────────────────────────────────────
export const QUEUE_JOB_TYPES = {
  PRACTICE_DELIVERED:             'practice_delivered',
  PRACTICE_SEEN:                  'practice_seen',
  PRACTICE_REPLY:                 'practice_reply',
  PRACTICE_GHOST:                 'practice_ghost',
  PRACTICE_SKILL_SCORES:          'practice_skill_scores',
  PRACTICE_COACHING_ANNOTATIONS:  'practice_coaching_annotations',
  PRACTICE_PLAYBOOK:              'practice_playbook',
  DAILY_TIP_GENERATION:           'daily_tip_generation',
  WEEKLY_STRATEGY_BRIEF:          'weekly_strategy_brief',
  CHECK_IN_PROMPT:                'check_in_prompt',
  GROWTH_CARD_GENERATION:         'growth_card_generation',
  ARCHETYPE_DETECTION:            'archetype_detection',
  // V4 NEW
  CONVERSATION_ANALYSIS:          'conversation_analysis',
  PATTERN_DETECTION:              'pattern_detection',
};

// ── Feedback / pipeline timing ────────────────────────────────────────────────
export const SENT_PROMPT_DELAY_MS       = 30000;
export const FEEDBACK_PROMPT_DELAY_HOURS = 48;

// ── Performance summarization ─────────────────────────────────────────────────
export const MIN_MESSAGES_FOR_SUMMARY   = 10;
export const SUMMARIZE_EVERY_N_MESSAGES = 5;

// ── Batch processing ──────────────────────────────────────────────────────────
export const BATCH_SIZE     = 5;
export const BATCH_DELAY_MS = 2000;

// ── File uploads ──────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// ── Calendar prep ─────────────────────────────────────────────────────────────
export const CALENDAR_PREP_HOURS_BEFORE = 24;

// ── Onboarding ────────────────────────────────────────────────────────────────
export const USER_ROLES       = ['founder', 'sales', 'freelancer', 'marketer', 'developer', 'other'];
export const INDUSTRIES       = ['saas', 'ecommerce', 'services', 'fintech', 'health', 'education', 'other'];
export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
export const OUTREACH_GOALS   = ['get_customers', 'find_investors', 'partnerships', 'feedback', 'hiring'];
export const PLATFORMS        = ['reddit', 'linkedin', 'twitter', 'facebook', 'instagram', 'email', 'other'];

// ── Routes ────────────────────────────────────────────────────────────────────


// ── Archetypes ────────────────────────────────────────────────────────────────
export const ARCHETYPES = {
  SELLER:       'seller',
  BUILDER:      'builder',
  FREELANCER:   'freelancer',
  CREATOR:      'creator',
  PROFESSIONAL: 'professional',
  LEARNER:      'learner',
};

export const ARCHETYPE_LABELS = {
  seller:       'Seller',
  builder:      'Builder',
  freelancer:   'Freelancer',
  creator:      'Creator',
  professional: 'Professional',
  learner:      'Learner',
};

export const ARCHETYPE_DESCRIPTIONS = {
  seller:       'You sell a product or service to businesses or consumers',
  builder:      'You\'re building something new and looking for your first customers',
  freelancer:   'You offer skills or services to clients on a project basis',
  creator:      'You create content, art, or media and want to grow your audience or monetize',
  professional: 'You\'re growing your career, network, or professional reputation',
  learner:      'You\'re developing new skills or transitioning to a new field',
};

export const ARCHETYPE_ICONS = {
  seller:       '💼',
  builder:      '🔨',
  freelancer:   '🎯',
  creator:      '✨',
  professional: '🏆',
  learner:      '📚',
};

// ── Supported platforms ───────────────────────────────────────────────────────
export const SUPPORTED_PLATFORMS = {
  REDDIT:       'reddit',
  LINKEDIN:     'linkedin',
  TWITTER:      'twitter',
  FACEBOOK:     'facebook',
  INSTAGRAM:    'instagram',
  PRODUCTHUNT:  'producthunt',
  INDIEHACKERS: 'indiehackers',
  HACKERNEWS:   'hackernews',
  QUORA:        'quora',
  YOUTUBE:      'youtube',
};

export const PLATFORM_LABELS = {
  reddit:       'Reddit',
  linkedin:     'LinkedIn',
  twitter:      'X / Twitter',
  facebook:     'Facebook',
  instagram:    'Instagram',
  producthunt:  'Product Hunt',
  indiehackers: 'Indie Hackers',
  hackernews:   'Hacker News',
  quora:        'Quora',
  youtube:      'YouTube',
};

export const PLATFORM_ICONS = {
  reddit:       '🟠',
  linkedin:     '💼',
  twitter:      '🐦',
  facebook:     '📘',
  instagram:    '📸',
  producthunt:  '🚀',
  indiehackers: '👨‍💻',
  hackernews:   '🔶',
  quora:        '❓',
  youtube:      '▶️',
};

export const PLATFORM_COLORS = {
  reddit:       '#FF4500',
  linkedin:     '#0A66C2',
  twitter:      '#1DA1F2',
  facebook:     '#1877F2',
  instagram:    '#E1306C',
  producthunt:  '#DA552F',
  indiehackers: '#0E2233',
  hackernews:   '#FF6600',
  quora:        '#B92B27',
  youtube:      '#FF0000',
  other:        '#64748B',
};

export const ARCHETYPE_PLATFORM_DEFAULTS = {
  seller:       ['reddit', 'linkedin', 'twitter'],
  builder:      ['reddit', 'indiehackers', 'hackernews'],
  freelancer:   ['linkedin', 'reddit', 'twitter'],
  creator:      ['instagram', 'twitter', 'youtube'],
  professional: ['linkedin', 'twitter', 'reddit'],
  learner:      ['reddit', 'twitter', 'linkedin'],
};

// ── Growth card types ─────────────────────────────────────────────────────────
export const GROWTH_CARD_TYPES = {
  TIP:        'tip',
  STRATEGY:   'strategy',
  RESOURCE:   'resource',
  REFLECTION: 'reflection',
  CHALLENGE:  'challenge',
  COMMUNITY:  'community',
  INSIGHT:    'insight',
};

export const GROWTH_CARD_LABELS = {
  tip:        'Daily Tip',
  strategy:   'Strategy',
  resource:   'Resource',
  reflection: 'Reflection',
  challenge:  'Challenge',
  community:  'Community',
  insight:    'Insight',
};

export const GROWTH_CARD_ICONS = {
  tip:        '💡',
  strategy:   '🗺️',
  resource:   '📖',
  reflection: '🪞',
  challenge:  '⚡',
  community:  '👥',
  insight:    '✨',
};

// ── V4 NEW: Insight dimension labels ─────────────────────────────────────────
export const SKILL_DIMENSION_LABELS = {
  hook:            'Hook Strength',
  clarity:         'Message Clarity',
  value_prop:      'Value Proposition',
  personalization: 'Personalization',
  cta:             'Call to Action',
  tone:            'Tone Fit',
};

export const SKILL_DIMENSION_DESCRIPTIONS = {
  hook:            'How compelling your opening line is — does it make the reader want to continue?',
  clarity:         'How easy your offer is to understand in one read without re-reading',
  value_prop:      'Whether you communicate specific value for this prospect vs generic claims',
  personalization: 'How specific the message is to this person vs a generic template',
  cta:             'Whether there is a single, clear, low-friction ask',
  tone:            'How well the tone matches the platform norms and prospect style',
};

// ── Default notification preferences ─────────────────────────────────────────
export const DEFAULT_NOTIFICATION_PREFS = {
  new_opportunities:      true,
  feedback_reminders:     true,
  practice_replies:       true,
  calendar_prep_ready:    true,
  daily_tip:              true,
  check_in_prompt:        true,
  debrief_reminder: true,
  commitment_reminder: true,
  weekly_insights: true,
  weekly_plan:            true,
  pattern_insights:       true,   // V4 NEW
  skill_progression:      true,   // V4 NEW
  morning_growth_push:    true,   // V4 NEW
  evening_growth_push:    true,   // V4 NEW
};

// ── Chat suggestion chips (archetype-aware defaults) ─────────────────────────
export const DEFAULT_CHAT_SUGGESTIONS = [
  'Help me write a better cold message',
  'Why am I getting ghosted?',
  'Review my outreach approach',
  'What should I say after no response?',
  'Help me handle a price objection',
];

export const ARCHETYPE_CHAT_SUGGESTIONS = {
  seller:       ['Help me write a cold message', 'Why am I getting ghosted?', 'Review my pitch', 'Handle a price objection'],
  builder:      ['How do I validate my idea?', 'Find my first 10 customers', 'What\'s my ICP?', 'How do I get feedback?'],
  freelancer:   ['Write a proposal for a new client', 'How do I price my services?', 'Deal with a difficult client', 'Land my next project'],
  creator:      ['How do I grow my audience?', 'Pitch a brand deal', 'Improve my content strategy', 'Monetize my following'],
  professional: ['Improve my LinkedIn profile', 'Network with someone new', 'Ask for a promotion', 'Build my personal brand'],
  learner:      ['Where do I start with sales?', 'Explain cold outreach simply', 'Practice a pitch with me', 'Best resources to learn from'],
};

export const UPLOAD_LIMITS = {
  MAX_SIZE_BYTES:  MAX_FILE_SIZE,
  ALLOWED_TYPES:   ALLOWED_FILE_TYPES,
  SUPABASE_BUCKET: 'clutch-uploads',
};

// ── Objection types ───────────────────────────────────────────────────────────
export const OBJECTION_TYPES = {
  GHOST:       'ghost',
  PRICE:       'price',
  TIMING:      'timing',
  TRUST:       'trust',
  COMPETITION: 'competition',
  FIT:         'fit',
  OTHER:       'other',
};

export const OBJECTION_TYPE_LABELS = {
  ghost:       'No Response (Ghosted)',
  price:       'Price / Budget',
  timing:      'Bad Timing',
  trust:       'Trust / Credibility',
  competition: 'Already Has a Solution',
  fit:         'Not the Right Fit',
  other:       'Other',
};

// ── Pattern types ─────────────────────────────────────────────────────────────
export const PATTERN_TYPES = {
  GHOST_TRIGGER:  'ghost_trigger',
  SUCCESS_SIGNAL: 'success_signal',
  WEAKNESS:       'weakness',
  OBJECTION_TYPE: 'objection_type',
};

export const PATTERN_TYPE_LABELS = {
  ghost_trigger:  '👻 Ghost Trigger',
  success_signal: '✅ Success Signal',
  weakness:       '⚠️ Communication Weakness',
  objection_type: '🛡️ Objection Pattern',
};
