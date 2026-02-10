// =============================================================================
// DAILY QUOTE - Edge Function
// Generates personalized daily motivational quote
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'daily-quote';

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };

  try {
    // Verify authentication
    const { user, error: authError, supabase } = await verifyAuth(req);
    if (authError || !user || !supabase) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    logInfo(FUNCTION_NAME, 'Generating quote', { requestId, userId: user.id });

    // Get user's profile and goals for context
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, role')
      .eq('id', user.id)
      .single();

    const { data: goals } = await supabase
      .from('goals')
      .select('title, overall_progress, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(5);

    const goalsContext = goals?.map(g => g.title).join(', ') || 'personal growth';
    const avgProgress = goals?.length
      ? Math.round(goals.reduce((sum, g) => sum + (g.overall_progress || 0), 0) / goals.length)
      : 0;

    const prompt = `You are a motivational coach. Generate ONE short, personalized, inspiring quote for today.

USER CONTEXT:
- Name: ${profile?.name || 'User'}
- Role: ${profile?.role || 'Professional'}
- Current Goals: ${goalsContext}
- Average Progress: ${avgProgress}%
- Day: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}

REQUIREMENTS:
1. Keep it under 150 characters
2. Make it personal to their goals and role
3. Be encouraging but realistic
4. Don't use clichés like "believe in yourself"
5. Reference their specific journey or progress
6. Don't include quotation marks

Return ONLY the quote text, nothing else.`;

    const result = await callGemini(prompt, {
      responseMimeType: 'text/plain',
      temperature: 0.9
    });

    logInfo(FUNCTION_NAME, 'Quote generated successfully', { requestId, userId: user.id });
    return createSuccessResponse({ quote: typeof result === 'string' ? result : result.quote || 'Every step forward is progress.' }, responseContext);

  } catch (error) {
    logError(FUNCTION_NAME, 'GEMINI_ERROR', error.message, { requestId, stack: error.stack });
    // Return fallback quote instead of error
    return createSuccessResponse({ quote: 'Your ambitions are worth pursuing. Make today count.' }, responseContext);
  }
});

