import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'generate-goal-overview';

interface GoalPhaseSummary {
  number?: number;
  title?: string;
  description?: string;
  startWeek?: number;
  endWeek?: number;
  focus?: string[];
  milestones?: Array<{ title?: string; isCompleted?: boolean; targetWeek?: number }>;
}

interface GoalOverviewRequest {
  goal: {
    id: string;
    title: string;
    category?: string;
    timeline?: string;
    estimatedWeeks?: number;
    status?: string;
    overallProgress?: number;
    currentPhaseIndex?: number;
    phases?: GoalPhaseSummary[];
    totals?: {
      phases: number;
      milestones: number;
      completedMilestones: number;
    };
    nextMilestones?: string[];
  };
  userProfile?: {
    role?: string;
    bio?: string;
    chronotype?: string;
    energyLevel?: string;
  };
  additionalContext?: string;
}

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(requestOrigin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const requestId = getRequestId(req);
  const responseContext = { requestId, origin: requestOrigin || undefined };

  try {
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) {
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'No user found', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    const { goal, userProfile, additionalContext }: GoalOverviewRequest = await req.json();

    if (!goal || !goal.id || !goal.title) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'Goal with id and title is required', { requestId, userId: user.id });
      return Errors.validationError('Goal with id and title is required', responseContext);
    }

    logInfo(FUNCTION_NAME, 'Generating goal overview', { requestId, userId: user.id, goalId: goal.id });

    const prompt = buildGoalOverviewPrompt(goal, userProfile, additionalContext);
    const overviewResult = await callGemini(prompt, {
      temperature: 0.5,
      maxOutputTokens: 2200,
      responseMimeType: 'application/json'
    });

    return createSuccessResponse(overviewResult, responseContext);
  } catch (error) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId, stack: error.stack });
    return Errors.internalError('Failed to generate goal overview: ' + error.message, responseContext);
  }
});

function buildGoalOverviewPrompt(
  goal: GoalOverviewRequest['goal'],
  userProfile?: GoalOverviewRequest['userProfile'],
  additionalContext?: string
): string {
  const userContext = {
    role: userProfile?.role || 'Not specified',
    bio: userProfile?.bio || 'Not provided',
    chronotype: userProfile?.chronotype || 'flexible',
    energyLevel: userProfile?.energyLevel || 'balanced'
  };

  const goalSnapshot = {
    id: goal.id,
    title: goal.title,
    category: goal.category || 'personal',
    timeline: goal.timeline || 'Not specified',
    estimatedWeeks: goal.estimatedWeeks || null,
    status: goal.status || 'active',
    overallProgress: goal.overallProgress ?? 0,
    currentPhaseIndex: goal.currentPhaseIndex ?? 0,
    totals: goal.totals || { phases: 0, milestones: 0, completedMilestones: 0 },
    nextMilestones: goal.nextMilestones || [],
    phases: (goal.phases || []).map(p => ({
      number: p.number,
      title: p.title,
      description: p.description,
      startWeek: p.startWeek,
      endWeek: p.endWeek,
      focus: p.focus || [],
      milestones: (p.milestones || []).map(m => ({
        title: m.title,
        isCompleted: m.isCompleted,
        targetWeek: m.targetWeek
      }))
    }))
  };

  return `You are the AI strategy analyst for the Dlulu Life app. Your job is to generate a concise, actionable Overview for a goal.

  ## JTBD (Jobs To Be Done)
  1. Explain the most effective strategy for this specific goal given the actual plan and progress.
  2. Highlight the most likely risks or gaps that could derail execution.
  3. Create a behavior plan that makes follow-through likely (habit + friction + if-then).
  4. Keep it short, clear, and directly usable in a goal dashboard.

## SOURCE OF TRUTH (do NOT invent details)
User context (JSON):
${JSON.stringify(userContext)}

Goal snapshot (JSON):
${JSON.stringify(goalSnapshot)}

${additionalContext ? `Additional context: ${additionalContext}` : ''}

  ## RULES (MUST FOLLOW)
  - Use ONLY the source of truth above. No external assumptions.
  - Strategy overview: 1-2 short paragraphs, 70-130 words total.
  - Critical gaps: 2-6 items, each 6-18 words, specific and realistic.
  - Behavior plan must be concrete, but concise:
    - SMART: each field 8-24 words.
    - WOOP: 2-4 obstacles + 2-4 plans; keep each item 5-14 words.
    - Implementation intentions: 2-4 if/then items.
    - Habit stacking: 2-3 anchors.
    - Friction reduction: 2-4 remove + 2-4 add.
  - If status is "completed": focus on consolidation, maintenance, and avoiding regression.
  - If status is "paused": highlight re-entry risks and how to restart safely.
  - If phases/milestones are missing or sparse: include a gap about missing structure.
  - If progress is 0-10%: emphasize momentum and foundational steps.
  - If progress is 90%+: emphasize finishing risks and quality checks.
  - No markdown, no quotes, no extra keys.

  ## OUTPUT JSON ONLY
  {
    "strategyOverview": "string",
    "criticalGaps": ["string", "string"],
    "behaviorPlan": {
      "smart": {
        "specific": "string",
        "measurable": "string",
        "achievable": "string",
        "relevant": "string",
        "timeBound": "string"
      },
      "woop": {
        "wish": "string",
        "outcome": "string",
        "obstacles": ["string"],
        "plan": ["string"]
      },
      "implementationIntentions": [
        { "if": "string", "then": "string" }
      ],
      "habitStacking": [
        { "anchor": "string", "routine": "string", "reward": "string" }
      ],
      "frictionReduction": {
        "remove": ["string"],
        "add": ["string"]
      }
    }
  }
  `;
  }
