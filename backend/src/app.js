// src/app.js — UPDATED
// New routes registered:
//   /api/prospects   — relationship hub
//   /api/commitments — commitment tracker
//   /api/insights    — pattern insights
// New job:
//   patternInsightsJob — weekly (Sunday 8pm)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { initFirebase } from './config/firebase.js';
import authenticate, { clearProfileCache } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import authRoutes from './routes/auth.js';
import userRoutes, { updateProfile, deleteAccount } from './routes/user.js';
import onboardingRoutes from './routes/onboarding.js';
import opportunitiesRoutes from './routes/opportunities.js';
import feedbackRoutes from './routes/feedback.js';
import practiceRoutes from './routes/practice.js';
import metricsRoutes from './routes/metrics.js';
import coachRoutes from './routes/coach.js';
import pipelineRoutes from './routes/pipeline.js';
import chatRoutes from './routes/chat.js';
import calendarRoutes from './routes/calendar.js';
import uploadRoutes from './routes/upload.js';
import suggestionsRoutes from './routes/suggestions.js';
import growthRoutes from './routes/growth.js';
import goalsRoutes from './routes/goals.js';
import followupRoutes from './routes/followup.js';
import prospectsRoutes from './routes/prospects.js';    // NEW
import commitmentsRoutes from './routes/commitments.js'; // NEW
import insightsRoutes from './routes/insights.js';       // NEW

import { startAllJobs } from './jobs/index.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Rate limiters (unchanged) ────────────────────────────────────────────────
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Please try again in 15 minutes.' },
  skip: (req) => req.path === '/refresh',
});

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please slow down.' },
});

const refreshRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'You can refresh your feed up to 5 times per hour.' },
});

const pipelineRateLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many pipeline requests. Please slow down.' },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL   || 'http://localhost:5173',
      process.env.FRONTEND_URL_2 || null,
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.set('trust proxy', 1);

// ── Public routes ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.0.0', timestamp: new Date().toISOString() }));
app.use('/api/auth', authRateLimiter, authRoutes);
app.put('/api/auth/me', authenticate, (req, res, next) => {
  res.on('finish', () => { if (res.statusCode < 400) clearProfileCache(req.user?.id); });
  next();
}, updateProfile);
app.delete('/api/auth/account', authenticate, (req, res, next) => {
  res.on('finish', () => { if (res.statusCode < 400) clearProfileCache(req.user?.id); });
  next();
}, deleteAccount);

// ── Protected routes ─────────────────────────────────────────────────────────
app.use('/api/user',          authenticate, userRoutes);
app.use('/api/onboarding',    authenticate, onboardingRoutes);
app.use('/api/suggestions',   authenticate, suggestionsRoutes);
app.use('/api/opportunities', authenticate, opportunitiesRoutes);
app.use('/api/feedback',      authenticate, feedbackRoutes);
app.use('/api/practice',      authenticate, practiceRoutes);
app.use('/api/metrics',       authenticate, metricsRoutes);
app.use('/api/coach',         authenticate, coachRoutes);
app.use('/api/pipeline',      authenticate, pipelineRateLimiter, pipelineRoutes);
app.use('/api/chat',          authenticate, aiRateLimiter, chatRoutes);
app.use('/api/calendar',      authenticate, calendarRoutes);
app.use('/api/upload',        authenticate, uploadRoutes);
app.use('/api/growth',        authenticate, growthRoutes);
app.use('/api/growth/goals',  authenticate, goalsRoutes);
app.use('/api/followup',      authenticate, followupRoutes);

// ── NEW: Intelligence layer routes ────────────────────────────────────────────
app.use('/api/prospects',   authenticate, prospectsRoutes);
app.use('/api/commitments', authenticate, commitmentsRoutes);
app.use('/api/insights',    authenticate, insightsRoutes);

// ── Feature usage tracking (unchanged) ──────────────────────────────────────
import supabaseAdmin from './config/supabase.js';

app.post('/api/user/feature-event', authenticate, async (req, res) => {
  try {
    const { feature, action, metadata = {} } = req.body;
    if (!feature || !action) return res.status(400).json({ error: 'feature and action required' });
    await supabaseAdmin.from('feature_usage_events').insert({
      user_id:  req.user.id,
      feature:  String(feature).slice(0, 50),
      action:   String(action).slice(0, 50),
      metadata: typeof metadata === 'object' ? metadata : {},
    });
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// ── Error handling ───────────────────────────────────────────────────────────
app.use('*', (req, res) => res.status(404).json({ error: 'NOT_FOUND', message: `${req.method} ${req.originalUrl} not found` }));
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
const startServer = async () => {
  initFirebase();
  app.listen(PORT, () => {
    console.log('');
    console.log('🚀 Clutch AI Backend v3 started — Calendar Intelligence Upgrade');
    console.log(`   Port: ${PORT} | Mode: ${process.env.NODE_ENV}`);
    console.log('');
    console.log('   NEW routes:');
    console.log('   GET/POST /api/prospects');
    console.log('   GET/PUT  /api/commitments');
    console.log('   GET      /api/insights/weekly');
    console.log('   POST     /api/calendar/:id/debrief');
    console.log('   POST     /api/calendar/:id/research');
    console.log('   POST     /api/calendar/:id/start-meeting-notes');
    console.log('   POST     /api/chat/:id/end-meeting');
    console.log('');
  });
  startAllJobs();
};

startServer().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

export default app;
