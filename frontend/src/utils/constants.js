// src/utils/constants.js
// ============================================================
// FRONTEND CONSTANTS
// All UI-safe constants — no process.env, no server-only values.
// Backend-only constants (job intervals, token limits, model
// names, email config, etc.) stay in src/config/constants.js.
// ============================================================

// ── Routes ────────────────────────────────────────────────────────────────────
// (Consolidated — see full ROUTES export below with PROSPECTS included)
export const CHAT_MODES = {
  GENERAL:        'general',
  MEETING_NOTES:  'meeting_notes',
  PREP:           'prep',
  FOLLOWUP_COACH: 'followup_coach',
};
export const FEEDBACK_OUTCOMES = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  PENDING:  'pending',
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
  PIPELINE:         '/pipeline',
  CHAT:             '/chat',
  PRACTICE:         '/practice',
  CALENDAR:         '/calendar',
  PROSPECTS:        '/prospects',
  METRICS:          '/metrics',
  SETTINGS:         '/settings',
  GOALS:            '/goals',
  INSIGHTS:         '/insights',
};

// ── Archetypes ────────────────────────────────────────────────────────────────
export const ARCHETYPES = {
  SELLER:       'seller',
  BUILDER:      'builder',
  FREELANCER:   'freelancer',
  CREATOR:      'creator',
  PROFESSIONAL: 'professional',
  LEARNER:      'learner',
}

export const ARCHETYPE_LABELS = {
  seller:       'Seller',
  builder:      'Builder',
  freelancer:   'Freelancer',
  creator:      'Creator',
  professional: 'Professional',
  learner:      'Learner',
}

export const ARCHETYPE_DESCRIPTIONS = {
  seller:       'You sell a product or service to businesses or consumers',
  builder:      "You're building something new and looking for your first customers",
  freelancer:   'You offer skills or services to clients on a project basis',
  creator:      'You create content, art, or media and want to grow your audience or monetize',
  professional: "You're growing your career, network, or professional reputation",
  learner:      "You're developing new skills or transitioning to a new field",
}

export const ARCHETYPE_ICONS = {
  seller:       '💼',
  builder:      '🔨',
  freelancer:   '🎯',
  creator:      '✨',
  professional: '🏆',
  learner:      '📚',
}

export const ARCHETYPE_PLATFORM_DEFAULTS = {
  seller:       ['reddit', 'linkedin', 'twitter'],
  builder:      ['reddit', 'indiehackers', 'hackernews'],
  freelancer:   ['linkedin', 'reddit', 'twitter'],
  creator:      ['instagram', 'twitter', 'youtube'],
  professional: ['linkedin', 'twitter', 'reddit'],
  learner:      ['reddit', 'twitter', 'linkedin'],
}

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
}

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
}

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
}

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
}

// ── Pipeline stages ───────────────────────────────────────────────────────────
export const PIPELINE_STAGES = {
  NEW:         'new',
  CONTACTED:   'contacted',
  REPLIED:     'replied',
  CALL_DEMO:   'call_demo',
  CLOSED_WON:  'closed_won',
  CLOSED_LOST: 'closed_lost',
}

export const PIPELINE_STAGE_VALUES = Object.values(PIPELINE_STAGES)

export const STAGE_LABELS = {
  new:         'New',
  contacted:   'Contacted',
  replied:     'Replied',
  call_demo:   'Call / Demo',
  closed_won:  'Closed Won',
  closed_lost: 'Closed Lost',
}

export const STAGE_COLORS = {
  new:         '#64748B',
  contacted:   '#3B82F6',
  replied:     '#8B5CF6',
  call_demo:   '#F59E0B',
  closed_won:  '#10B981',
  closed_lost: '#F43F5E',
}

// ── Opportunity status ────────────────────────────────────────────────────────
export const OPP_STATUS = {
  PENDING: 'pending',
  VIEWED:  'viewed',
  ACTED:   'acted',
  SENT:    'sent',
  DONE:    'done',
}

export const OPPORTUNITY_STATUS = OPP_STATUS

// ── Practice scenarios ────────────────────────────────────────────────────────
export const SCENARIO_LABELS = {
  interested:      'Interested',
  polite_decline:  'Polite Decline',
  ghost:           'Ghost',
  skeptical:       'Skeptical',
  price_objection: 'Price Objection',
  not_right_time:  'Not Right Time',
}

export const SCENARIO_COLORS = {
  interested:      '#10B981',
  polite_decline:  '#F59E0B',
  ghost:           '#64748B',
  skeptical:       '#F43F5E',
  price_objection: '#8B5CF6',
  not_right_time:  '#0EA5E9',
}

// ── Growth card types ─────────────────────────────────────────────────────────
export const GROWTH_CARD_TYPES = {
  TIP:               'tip',
  STRATEGY:          'strategy',
  RESOURCE:          'resource',
  REFLECTION:        'reflection',
  CHALLENGE:         'challenge',
  COMMUNITY:         'community',
  INSIGHT:           'insight',
  PRACTICE_WEAKNESS: 'practice_weakness',  // Feature 7: persistent practice gap
}

export const GROWTH_CARD_LABELS = {
  tip:               'Daily Tip',
  strategy:          'Strategy',
  resource:          'Resource',
  reflection:        'Reflection',
  challenge:         'Challenge',
  community:         'Community',
  insight:           'Insight',
  practice_weakness: 'Practice Gap',  // Feature 7
}

export const GROWTH_CARD_ICONS = {
  tip:               '💡',
  strategy:          '🗺️',
  resource:          '📖',
  reflection:        '🪞',
  challenge:         '⚡',
  community:         '👥',
  insight:           '✨',
  practice_weakness: '📊',  // Feature 7
}

// ── Default notification preferences ─────────────────────────────────────────
export const DEFAULT_NOTIFICATION_PREFS = {
  new_opportunities:   true,
  feedback_reminders:  true,
  practice_replies:    true,
  calendar_prep_ready: true,
  daily_tip:           true,
  check_in_prompt:     true,
  weekly_plan:         true,
}

// ── File upload limits (frontend validation — mirrors backend) ────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB

export const ALLOWED_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

// ── Chat suggestion chips ─────────────────────────────────────────────────────
export const DEFAULT_CHAT_SUGGESTIONS = [
  'Help me write a better cold message',
  'Why am I getting ghosted?',
  'Review my outreach approach',
  'What should I say after no response?',
  'Help me handle a price objection',
]

export const ARCHETYPE_CHAT_SUGGESTIONS = {
  seller:       ['Help me write a cold message', 'Why am I getting ghosted?', 'Review my pitch', 'Handle a price objection'],
  builder:      ["How do I validate my idea?", 'Find my first 10 customers', "What's my ICP?", 'How do I get feedback?'],
  freelancer:   ['Write a proposal for a new client', 'How do I price my services?', 'Deal with a difficult client', 'Land my next project'],
  creator:      ['How do I grow my audience?', 'Pitch a brand deal', 'Improve my content strategy', 'Monetize my following'],
  professional: ['Improve my LinkedIn profile', 'Network with someone new', 'Ask for a promotion', 'Build my personal brand'],
  learner:      ["Where do I start with sales?", 'Explain cold outreach simply', 'Practice a pitch with me', 'Best resources to learn from'],
}

// ── Delivery status ───────────────────────────────────────────────────────────
export const DELIVERY_STATUS = {
  PENDING:   'pending',
  DELIVERED: 'delivered',
  SEEN:      'seen',
  REPLIED:   'replied',
  GHOSTED:   'ghosted',
}

// ── Onboarding options ────────────────────────────────────────────────────────
export const USER_ROLES        = ['founder', 'sales', 'freelancer', 'marketer', 'developer', 'other']
export const INDUSTRIES        = ['saas', 'ecommerce', 'services', 'fintech', 'health', 'education', 'other']
export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced']
export const OUTREACH_GOALS    = ['get_customers', 'find_investors', 'partnerships', 'feedback', 'hiring']
export const PLATFORMS         = ['reddit', 'linkedin', 'twitter', 'facebook', 'instagram', 'email', 'other']
