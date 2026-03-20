// src/routes/coach.js
// AI Coach — powered by Groq
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import groqService from '../services/groq.js';
import { callWithFallback } from '../services/multiProvider.js';
import supabaseAdmin from '../config/supabase.js';

const router = Router();

// POST /coach/ask - Ask Clutch anything
router.post('/ask', asyncHandler(async (req, res) => {
  const { question, conversation_history = [] } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Question cannot be empty'
    });
  }

  const { data: performanceProfile } = await supabaseAdmin
    .from('user_performance_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  const { systemPrompt, messages } = await groqService.getCoachResponse(
    req.user,
    question,
    conversation_history,
    performanceProfile
  );

  const { content, model_used } = await callWithFallback({
    systemPrompt,
    messages,
    temperature: 0.7,
    maxTokens: 1200
  });

  res.json({
    response: { systemPrompt, messages, answer: content },
    model: model_used,
    context_used: {
      has_performance_data: !!performanceProfile?.learned_patterns,
      has_voice_profile:    !!req.user.voice_profile
    }
  });
}));

export default router;
