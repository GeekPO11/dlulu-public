// =============================================================================
// REFINE ROADMAP - Edge Function
// Refines the entire roadmap based on user's request
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'refine-roadmap';

interface RefineRoadmapRequest {
  currentRoadmap: any;
  userProfile: {
    role?: string;
    bio?: string;
    chronotype?: string;
    energyLevel?: string;
  };
  userRequest: string;
  focusedGoalId?: string;
  focusedPhaseId?: string;
  focusedTaskId?: string;
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
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    // Parse request body
    const { currentRoadmap, userProfile, userRequest, focusedGoalId, focusedPhaseId, focusedTaskId }: RefineRoadmapRequest = await req.json();

    if (!currentRoadmap || !userRequest) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'currentRoadmap and userRequest are required', { requestId, userId: user.id });
      return Errors.validationError('currentRoadmap and userRequest are required', responseContext);
    }

    logInfo(FUNCTION_NAME, 'Processing request', { requestId, userId: user.id, requestPreview: userRequest.substring(0, 100) });

    // Build prompt for Gemini
    const prompt = buildRefinePrompt(currentRoadmap, userProfile, userRequest, focusedGoalId, focusedPhaseId, focusedTaskId);

    // Call Gemini API
    const result = await callGemini(prompt);

    logInfo(FUNCTION_NAME, 'Roadmap refinement complete', { requestId, userId: user.id });

    // Return success response
    return createSuccessResponse(result, responseContext);

  } catch (error) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId, stack: error.stack });
    return Errors.internalError('Failed to refine roadmap: ' + error.message, responseContext);
  }
});

function buildRefinePrompt(
  currentRoadmap: any,
  userProfile: any,
  userRequest: string,
  focusedGoalId?: string,
  focusedPhaseId?: string,
  focusedTaskId?: string
): string {
  // Build user context
  const userContext = `
- Role: ${userProfile?.role || 'Not specified'}
- Bio: ${userProfile?.bio || 'Not provided'}
- Chronotype: ${userProfile?.chronotype || 'flexible'}
- Energy Level: ${userProfile?.energyLevel || 'balanced'}
`.trim();

  // Serialize current roadmap
  const currentState = JSON.stringify(currentRoadmap, null, 2);

  return `You are a manifestation coach helping refine a user's roadmap in the Dlulu Life app.

## USER CONTEXT
${userContext}

## CURRENT ROADMAP STATE
\`\`\`json
${currentState}
\`\`\`

## USER'S REQUEST
"${userRequest}"

${focusedGoalId ? `User is focused on goal: ${focusedGoalId}` : ''}
${focusedPhaseId ? `User is focused on phase: ${focusedPhaseId}` : ''}
${focusedTaskId ? `User is focused on task: ${focusedTaskId}` : ''}

## CRITICAL RULES
1. PRESERVE all completion states (isCompleted: true stays true unless user explicitly asks to change)
2. PRESERVE all IDs - never change existing IDs
3. For removed items: Set isStrikethrough: true, do NOT delete them
4. For new items: Generate unique IDs, set isCompleted: false, isStrikethrough: false
5. For modified items: Update content but preserve completion state and ID
6. The output structure MUST match the input structure EXACTLY

## EXACT OUTPUT SCHEMA
The updatedRoadmap must have this EXACT structure:

{
  "updatedRoadmap": {
    "id": "string (keep original)",
    "createdAt": "string (keep original)",
    "updatedAt": "string (new timestamp)",
    "totalWeeks": number,
    "startDate": "string (keep original)",
    "refinementHistory": [],
    "version": number (increment by 1),
    "goals": [
      {
        "goalId": "string (keep original)",
        "goalTitle": "string",
        "category": "health|career|learning|personal|financial|relationships",
        "startWeek": number,
        "endWeek": number,
        "totalDays": number,
        "sessionsPerWeek": number,
        "minutesPerSession": number,
        "preferredTimeSlot": "morning|afternoon|evening|flexible",
        "isExpanded": boolean (keep original),
        "phases": [
          {
            "phaseId": "string (keep original)",
            "phaseNumber": number,
            "title": "string",
            "description": "string",
            "startWeek": number,
            "endWeek": number,
            "durationDays": number,
            "coachAdvice": "string",
            "isExpanded": boolean (keep original),
            "tasks": [
              {
                "id": "string (keep original or generate new)",
                "phaseId": "string",
                "title": "string",
                "description": "string",
                "startDay": number,
                "endDay": number,
                "durationDays": number,
                "timesPerWeek": number,
                "order": number,
                "isCompleted": boolean,
                "completedAt": "string or undefined",
                "isStrikethrough": boolean,
                "strikethroughReason": "string or undefined",
                "isExpanded": boolean,
                "subTasks": [
                  {
                    "id": "string",
                    "taskId": "string",
                    "title": "string",
                    "isCompleted": boolean,
                    "completedAt": "string or undefined",
                    "isManual": boolean,
                    "isStrikethrough": boolean,
                    "order": number
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "changeSummary": "Brief description of what changed",
  "changes": [
    {
      "type": "added|modified|removed|checked|unchecked",
      "targetType": "goal|phase|task|subtask",
      "targetId": "ID of affected item",
      "targetTitle": "Title of affected item"
    }
  ],
  "coachNotes": "Encouraging advice about the changes"
}

## IMPORTANT
- Return the COMPLETE roadmap, not just the changed parts
- All fields must be present, even if unchanged
- IDs must remain consistent
- Be encouraging in coachNotes

Return ONLY valid JSON, no markdown.`;
}
