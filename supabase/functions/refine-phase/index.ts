// =============================================================================
// REFINE PHASE - Edge Function
// AI-powered phase refinement for roadmap tasks
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'refine-phase';

interface RefinePhaseRequest {
  phaseId: string;
  goalContext: {
    title: string;
    category: string;
    timeline: string;
  };
  userRequest: string;
  userProfile: {
    role: string;
    bio?: string;
  };
  phaseContext?: any; // Optional: Passing full phase object directly (for stateless refinement)
}

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

    // Parse request body
    const { phaseId, goalContext, userRequest, userProfile, phaseContext }: RefinePhaseRequest = await req.json();

    if (!phaseId || !userRequest) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'phaseId and userRequest are required', { requestId, userId: user.id });
      return Errors.validationError('phaseId and userRequest are required', responseContext);
    }

    logInfo(FUNCTION_NAME, 'Processing refinement request', { requestId, userId: user.id, phaseId, requestPreview: userRequest.substring(0, 50) });

    let phase = phaseContext;

    // specific Phase ID lookup if no context provided
    if (!phase && phaseId) {
      // Fetch phase with milestones
      const { data: fetchedPhase, error: phaseError } = await supabase
        .from('phases')
        .select(`
          *,
          milestones (
            *,
            subtasks (*)
          )
        `)
        .eq('id', phaseId)
        .single();

      if (phaseError || !fetchedPhase) {
        logError(FUNCTION_NAME, 'NOT_FOUND', 'Phase not found', { requestId, phaseId });
        return Errors.notFound('Phase', responseContext);
      }
      phase = fetchedPhase;
    } else if (!phase) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'Either phaseId or phaseContext is required', { requestId, userId: user.id });
      return Errors.validationError('Either phaseId or phaseContext is required', responseContext);
    }

    // Build prompt
    const prompt = buildRefinePrompt(phase, goalContext, userRequest, userProfile);

    // Call Gemini
    const result = await callGemini(prompt);

    logInfo(FUNCTION_NAME, 'Phase refinement complete', { requestId, userId: user.id, phaseId });
    return createSuccessResponse(result, responseContext);

  } catch (error) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId, stack: error.stack });
    return Errors.internalError('Failed to refine phase: ' + error.message, responseContext);
  }
});

function buildRefinePrompt(phase: any, goalContext: any, userRequest: string, userProfile: any): string {
  const milestonesContext = phase.milestones?.map((m: any) => ({
    id: m.id,
    title: m.title,
    isCompleted: m.is_completed,
    subtasks: m.subtasks?.map((st: any) => ({
      id: st.id,
      title: st.title,
      isCompleted: st.is_completed,
      isStrikethrough: st.is_strikethrough
    }))
  }));

  return `You are a strategic life coach AI. Help refine this phase based on the user's request.

GOAL CONTEXT:
- Title: ${goalContext.title}
- Category: ${goalContext.category}
- Timeline: ${goalContext.timeline}

CURRENT PHASE: ${phase.title}
- Description: ${phase.description}
- Focus Areas: ${phase.focus?.join(', ') || 'Not specified'}

CURRENT MILESTONES:
${JSON.stringify(milestonesContext, null, 2)}

USER PROFILE:
- Role: ${userProfile.role}
- Bio: ${userProfile.bio || 'Not provided'}

USER REQUEST: "${userRequest}"

Based on the user's request, update the milestones and subtasks. You can:
1. Modify existing milestones/subtasks
2. Add new milestones/subtasks (mark isNew: true)
3. Mark items for strikethrough if they should be removed (set isStrikethrough: true with reason)
4. Preserve completion status unless user asks to change it

IMPORTANT: Return ONLY valid JSON:
{
  "updatedTasks": [
    {
      "id": "existing-id or new-uuid",
      "title": "Milestone title",
      "isCompleted": false,
      "isStrikethrough": false,
      "strikethroughReason": null,
      "isNew": false,
      "subtasks": [
        {
          "id": "existing-id or new-uuid",
          "title": "Subtask title",
          "isCompleted": false,
          "isStrikethrough": false,
          "isNew": false
        }
      ]
    }
  ],
  "changeSummary": "Brief summary of what was changed",
  "coachNotes": "Any advice for the user"
}`;
}

