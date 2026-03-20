// src/routes/commitments.js
// ============================================================
// COMMITMENT TRACKER
// All promises made during meetings — by the founder or prospect.
// The single biggest reason deals die: lack of follow-through tracking.
//
// GET  /                   — list all (filterable by status, owner)
// PUT  /:id                — update status (done/ignored)
// POST /:id/generate-message — generate a follow-up for this commitment
// ============================================================

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { callWithFallback } from '../services/multiProvider.js';
import supabaseAdmin from '../config/supabase.js';

const router = Router();

// ──────────────────────────────────────────
// GET /api/commitments
// ──────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { status, owner, limit = 50 } = req.query;

  // Auto-mark overdue before returning
  const today = new Date().toISOString().split('T')[0];
  await supabaseAdmin
    .from('conversation_commitments')
    .update({ status: 'overdue' })
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', today);

  let query = supabaseAdmin
    .from('conversation_commitments')
    .select('*, prospects(id, name, company)')
    .eq('user_id', req.user.id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(parseInt(limit));

  if (status) {
    query = status === 'active'
      ? query.in('status', ['pending', 'overdue'])
      : query.eq('status', status);
  } else {
    query = query.in('status', ['pending', 'overdue']); // default to active
  }

  if (owner) query = query.eq('owner', owner);

  const { data: commitments, error } = await query;
  if (error) throw error;

  // Group by urgency
  const overdue  = (commitments || []).filter(c => c.status === 'overdue');
  const due_soon = (commitments || []).filter(c => {
    if (c.status !== 'pending' || !c.due_date) return false;
    const daysUntil = (new Date(c.due_date) - new Date()) / 86400000;
    return daysUntil <= 2;
  });
  const pending  = (commitments || []).filter(c =>
    c.status === 'pending' && !due_soon.find(d => d.id === c.id)
  );

  res.json({ commitments: commitments || [], overdue, due_soon, pending });
}));

// ──────────────────────────────────────────
// PUT /api/commitments/:id
// Update status — mark done/ignored
// ──────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const { status, due_date } = req.body;

  const validStatuses = ['pending', 'done', 'overdue', 'ignored'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const updates = {};
  if (status)   updates.status = status;
  if (due_date) updates.due_date = due_date;
  if (status === 'done') updates.completed_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('conversation_commitments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'NOT_FOUND' });

  // If completed, update prospect health score
  if (status === 'done' && data.prospect_id) {
    updateProspectHealthAfterCommitment(req.user.id, data.prospect_id).catch(() => {});
  }

  res.json({ success: true, commitment: data });
}));

// ──────────────────────────────────────────
// POST /api/commitments/:id/generate-message
// Generates a follow-up message for a specific commitment
// ──────────────────────────────────────────
router.post('/:id/generate-message', asyncHandler(async (req, res) => {
  const { data: commitment } = await supabaseAdmin
    .from('conversation_commitments')
    .select('*, prospects(id, name, company)')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!commitment) return res.status(404).json({ error: 'NOT_FOUND' });

  const vp           = req.user.voice_profile || {};
  const prospectName = commitment.prospects?.name || 'there';
  const company      = commitment.prospects?.company ? ` at ${commitment.prospects.company}` : '';

  const systemPrompt = `You are generating a short, human follow-up message for a founder.
Write exactly one message that delivers on the specific commitment below.
Sound like a real person — not a template. Under 60 words. No formal sign-offs.`;

  const userMessage = `
Founder voice: ${vp.voice_style || 'conversational, direct'}
Their product: ${req.user.product_description || 'not specified'}

Sending to: ${prospectName}${company}
The commitment to deliver on: "${commitment.commitment_text}"

Write the message now.`.trim();

  const { content } = await callWithFallback({
    systemPrompt,
    messages:    [{ role: 'user', content: userMessage }],
    temperature: 0.7,
    maxTokens:   150,
  });

  // Save the generated message
  await supabaseAdmin
    .from('conversation_commitments')
    .update({ follow_up_message: content.trim() })
    .eq('id', commitment.id);

  res.json({ success: true, message: content.trim() });
}));

// ──────────────────────────────────────────
// HELPER
// ──────────────────────────────────────────
async function updateProspectHealthAfterCommitment(userId, prospectId) {
  // Simple boost when a commitment is completed
  const { data: prospect } = await supabaseAdmin
    .from('prospects')
    .select('relationship_health_score')
    .eq('id', prospectId)
    .single();

  if (!prospect) return;

  const newScore = Math.min(100, (prospect.relationship_health_score || 50) + 8);
  await supabaseAdmin
    .from('prospects')
    .update({ relationship_health_score: newScore, health_updated_at: new Date().toISOString() })
    .eq('id', prospectId);
}

export default router;
