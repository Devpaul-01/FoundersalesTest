// src/middleware/errorHandler.js
// ============================================================
// GLOBAL ERROR HANDLER
// Catches any unhandled errors and returns consistent responses.
// Never leaks stack traces to the client in production.
//
// FIX: The error map previously checked err.code, but AI service
// errors are thrown as plain Error objects with the code embedded
// in the message string (e.g. "GROQ_RATE_LIMIT: Too many requests").
// Also fixed the typo GROK vs GROQ — the service throws GROQ_*
// but the map was checking GROK_*. Now we match on err.message
// for service errors and err.code for structured errors.
// ============================================================

export const errorHandler = (err, req, res, next) => {
  // Log the full error server-side always
  console.error('[Error]', {
    message: err.message,
    code:    err.code,
    path:    req.path,
    method:  req.method,
    userId:  req.user?.id,
    stack:   process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // ── Structured errors (err.code set explicitly) ───────────────────────
  const structuredMap = {
    'VALIDATION_ERROR':           { status: 400, message: err.message || 'Invalid input' },
    'NOT_FOUND':                  { status: 404, message: err.message || 'Resource not found' },
    'FORBIDDEN':                  { status: 403, message: 'Access denied' },
    'UNAUTHORIZED':               { status: 401, message: err.message || 'Authentication required' },
    'ACCOUNT_DELETED':            { status: 403, message: 'This account has been deleted.' },
    'ALL_PROVIDERS_FAILED':       { status: 503, message: 'AI service temporarily unavailable. Please try again.' },
  };

  if (err.code && structuredMap[err.code]) {
    const mapped = structuredMap[err.code];
    return res.status(mapped.status).json({
      error:   err.code,
      message: mapped.message
    });
  }

  // ── AI / service errors (code embedded in message string) ─────────────
  // FIX: groq.js throws e.g. "GROQ_RATE_LIMIT: ..." — match on message
  const messageMap = [
    { match: 'GROQ_AUTH_ERROR',             status: 503, message: 'AI service configuration error' },
    { match: 'GROQ_UNAVAILABLE',            status: 503, message: 'AI service temporarily unavailable. Please try again.' },
    { match: 'GROQ_RATE_LIMIT',             status: 429, message: 'AI service rate limit hit. Please wait a moment and try again.' },
    { match: 'GROQ_BAD_REQUEST',            status: 400, message: 'Invalid request to AI service' },
    { match: 'ALL_PROVIDERS_FAILED',        status: 503, message: 'AI service temporarily unavailable. Please try again.' },
    { match: 'PERPLEXITY_UNAVAILABLE',      status: 503, message: 'Search service temporarily unavailable' },
    { match: 'RATE_LIMIT_EXCEEDED:perplexity',
                                            status: 429, message: "You've reached your daily search limit. Resets at midnight.", is_limit: true },
  ];

  const msgMatch = messageMap.find(m => err.message?.includes(m.match));
  if (msgMatch) {
    return res.status(msgMatch.status).json({
      error:   msgMatch.match,
      message: msgMatch.message,
      ...(msgMatch.is_limit && { upgrade_prompt: true })
    });
  }

  // ── Supabase unique constraint violations ─────────────────────────────
  if (err.message?.includes('duplicate key') || err.message?.includes('unique constraint')) {
    return res.status(409).json({
      error:   'CONFLICT',
      message: 'This item already exists'
    });
  }

  // ── Default: don't expose internal errors to client ───────────────────
  res.status(500).json({
    error:   'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Something went wrong. Please try again.'
  });
};

/**
 * Async route wrapper — catches errors from async route handlers.
 * Use this to wrap every route:
 *   router.get('/', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default errorHandler;
