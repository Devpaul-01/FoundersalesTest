// src/routes/suggestions.js
// Contextual chat chips — powered by Groq
import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import supabaseAdmin from '../config/supabase.js';
import { callGroq } from '../services/groq.js';

const router = Router();

const DEFAULT_SUGGESTIONS = [
  'Help me write a better cold message',
  'Why am I getting ghosted?',
  'Review my outreach approach',
  'What should I say after no response?',
  'Help me handle a price objection',
];

// GET /api/suggestions — returns contextual chat chips
router.get('/', asyncHandler(async (req, res) => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('product_description, target_audience, voice_profile')
    .eq('id', req.user.id)
    .single();

  if (!user?.product_description) {
    return res.json({ suggestions: DEFAULT_SUGGESTIONS });
  }

  try {
    const prompt = `You are an AI sales coach assistant.
Based on this founder's profile, suggest 5 quick-start conversation starters that would be most useful for them right now.
Product: ${user.product_description}
Target audience: ${user.target_audience}
Format: Return ONLY a JSON array of 5 short action phrases (under 8 words each). No preamble.
Example: ["Help me write a cold DM", "What's my best platform?"]`;

    const { content } = await callGroq({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 200
    });

    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return res.json({ suggestions: parsed.slice(0, 5) });
    }
  } catch {}

  res.json({ suggestions: DEFAULT_SUGGESTIONS });
}));

export default router;
