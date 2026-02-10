// =============================================================================
// GENERATE BLUEPRINT - Edge Function
// Generates comprehensive manifestation roadmap with full task hierarchy
// This is the core AI that creates the coaching plan
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGemini } from '../_shared/gemini.ts';
import { logInfo, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'generate-blueprint';
const BLUEPRINT_MODEL = 'gemini-3-pro-preview';

// Data limits - must match constants/dataLimits.ts
const DATA_LIMITS = {
  // Dynamic: ceil(goalWeeks / 4), min 2, max 12
  MAX_PHASES_PER_GOAL: 12,  // Increased from 5 to allow full goal breakdown
  MIN_PHASES_PER_GOAL: 2,
  MAX_MILESTONES_PER_PHASE: 10,
  MAX_TASKS_PER_MILESTONE: 10,
  MAX_SUBTASKS_PER_TASK: 10,
};

interface GoalContext {
  goalTitle: string;
  completedPrerequisites: string[];
  skippedPrerequisites: string[];
  additionalNotes?: string;
  prerequisiteComments?: Record<string, string>;
  intakeResponses?: Record<string, string | number | boolean | string[] | null>;
  intakeMissingRequired?: string[];
}

interface GenerateBlueprintRequest {
  goalContexts: GoalContext[];
  userProfile: {
    role: string;
    bio?: string;
    chronotype: string;
    energyLevel: string;
  };
  additionalContext?: string;
}

function isValidBlueprintResult(result: any): result is {
  goals: Array<{
    goalTitle: string;
    category: string;
    estimatedWeeks?: number;
    phases: Array<{
      number: number;
      title: string;
      milestones: Array<{ title: string }>;
    }>;
  }>;
} {
  if (!result || typeof result !== 'object' || !Array.isArray(result.goals)) return false;

  return result.goals.every((goal: any) => {
    if (!goal || typeof goal !== 'object') return false;
    if (typeof goal.goalTitle !== 'string' || goal.goalTitle.trim().length === 0) return false;
    if (typeof goal.category !== 'string' || goal.category.trim().length === 0) return false;
    if (!Array.isArray(goal.phases) || goal.phases.length === 0) return false;
    return goal.phases.every((phase: any) => {
      if (!phase || typeof phase !== 'object') return false;
      if (typeof phase.number !== 'number') return false;
      if (typeof phase.title !== 'string' || phase.title.trim().length === 0) return false;
      if (!Array.isArray(phase.milestones)) return false;
      return phase.milestones.every((m: any) => m && typeof m.title === 'string' && m.title.trim().length > 0);
    });
  });
}

function parseBlueprintResponse(raw: unknown): any | null {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutFences = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const candidates = [withoutFences];
  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate
    }
  }

  return null;
}

const buildBlueprintRepairPrompt = (
  goalContexts: GoalContext[],
  userProfile: GenerateBlueprintRequest['userProfile'],
  additionalContext: string | undefined,
  rawResponse: unknown,
  validationError?: string
): string => {
  const rawText = typeof rawResponse === 'string'
    ? rawResponse
    : JSON.stringify(rawResponse || {});
  const clippedRawText = rawText.length > 24000 ? `${rawText.slice(0, 24000)}...` : rawText;

  const goalTitles = goalContexts
    .map((goal) => goal.goalTitle)
    .filter((title): title is string => typeof title === 'string' && title.trim().length > 0);

	  return `You are a strict JSON repair engine.
Your task: repair/transform the candidate output into a valid generate-blueprint response JSON.

GOALS TO PLAN (must all be present exactly once):
${goalTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')}

USER CONTEXT:
- Role: ${userProfile?.role || 'Not specified'}
- Life Context: ${userProfile?.bio || 'Not provided'}
- Chronotype: ${userProfile?.chronotype || 'flexible'}
- Energy Level: ${userProfile?.energyLevel || 'balanced'}
${additionalContext ? `- Additional Context: ${additionalContext.slice(0, 3000)}` : ''}

PREVIOUS VALIDATION ERROR: ${validationError || 'unknown'}

CANDIDATE OUTPUT TO REPAIR:
${clippedRawText}

REQUIRED OUTPUT JSON SHAPE:
{
  "goals": [
    {
      "goalTitle": "string",
      "goalArchetype": "HABIT_BUILDING|DEEP_WORK_PROJECT|SKILL_ACQUISITION|MAINTENANCE",
      "category": "health|career|learning|personal|financial|relationships",
      "timeline": "string",
      "estimatedWeeks": 12,
      "strategyOverview": "string (2 paragraphs minimum)",
      "criticalGaps": ["string"],
      "suggestedSchedule": {
        "frequency": 3,
        "duration": 45,
        "preferredTime": "morning|afternoon|evening",
        "energyCost": "high|medium|low"
      },
      "phases": [
        {
          "number": 1,
          "title": "string",
          "description": "string",
          "startWeek": 1,
          "endWeek": 4,
          "milestones": [
            {
              "title": "string",
              "description": "string",
              "targetWeek": 2,
              "tasks": [
                {
                  "title": "string",
                  "description": "string",
                  "order": 1,
                  "estimatedMinutes": 35,
                  "difficulty": 3,
                  "cognitiveType": "planning|execution|learning|review|coordination",
                  "subTasks": [{ "title": "string", "description": "string", "order": 1 }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

STRICT REQUIREMENTS:
- Output exactly ${goalTitles.length} goals.
- Every requested goalTitle must appear exactly once.
- Every goal must include at least 2 phases.
- Every phase must include at least 1 milestone with non-empty title.
- Keep task durations non-uniform (do not default to all 60).
- Ensure descriptions are not one-liners: phase/milestone/task/subtask descriptions must be specific, at least 1 full sentence.
- Return ONLY valid JSON. No markdown or commentary.`;
};

serve(async (req) => {
  const requestOrigin = req.headers.get('origin');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(requestOrigin) });
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
    const { goalContexts, userProfile, additionalContext }: GenerateBlueprintRequest = await req.json();

    if (!goalContexts || goalContexts.length === 0) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'goalContexts is required', { requestId, userId: user.id });
      return Errors.validationError('goalContexts is required', responseContext);
    }

    const missingIntake = goalContexts
      .filter((goal) => Array.isArray(goal.intakeMissingRequired) && goal.intakeMissingRequired.length > 0)
      .map((goal) => ({
        goalTitle: goal.goalTitle,
        missing: goal.intakeMissingRequired || [],
      }));

    if (missingIntake.length > 0) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'Required intake answers missing', {
        requestId,
        userId: user.id,
        missingIntake,
      });
      return Errors.validationError(
        `Missing required intake answers for: ${missingIntake.map((item) => item.goalTitle).join(', ')}`,
        responseContext
      );
    }

    logInfo(FUNCTION_NAME, 'Generating blueprint', { requestId, userId: user.id, goalsCount: goalContexts.length });

    // Build prompt for Gemini
    const prompt = buildBlueprintPrompt(goalContexts, userProfile, additionalContext);

    // Call Gemini API
    let rawBlueprintResult: any;
    try {
      // Blueprint generation should be low-variance and detailed.
      rawBlueprintResult = await callGemini(prompt, { model: BLUEPRINT_MODEL, temperature: 0.1 });
    } catch (geminiError: any) {
      logError(FUNCTION_NAME, 'GEMINI_ERROR', geminiError?.message || String(geminiError), {
        requestId,
        userId: user.id,
      });
      return Errors.geminiError(
        'Blueprint generation is temporarily unavailable. Please retry in a moment.',
        responseContext
      );
    }

    const attemptNormalize = (candidate: unknown) => {
      const parsed = parseBlueprintResponse(candidate);
      if (!parsed || !isValidBlueprintResult(parsed)) {
        throw new Error('Invalid AI blueprint response shape');
      }
      return parsed;
    };

    let blueprintResult: any;
    let primaryValidationError: string | undefined;

    try {
      blueprintResult = attemptNormalize(rawBlueprintResult);
    } catch (validationError: any) {
      primaryValidationError = validationError?.message || 'Failed to normalize AI blueprint response';
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', primaryValidationError, {
        requestId,
        userId: user.id,
        stage: 'primary',
        responseType: typeof rawBlueprintResult,
      });

      let repairedRawResult: unknown;
      const repairPrompt = buildBlueprintRepairPrompt(
        goalContexts,
        userProfile,
        additionalContext,
        rawBlueprintResult,
        primaryValidationError
      );

      try {
        repairedRawResult = await callGemini(repairPrompt, { model: BLUEPRINT_MODEL, temperature: 0.1 });
      } catch (repairGeminiError: any) {
        logError(FUNCTION_NAME, 'GEMINI_ERROR', repairGeminiError?.message || String(repairGeminiError), {
          requestId,
          userId: user.id,
          stage: 'repair',
          primaryValidationError,
        });
        return Errors.geminiError(
          'Blueprint generation is temporarily unavailable. Please retry in a moment.',
          responseContext
        );
      }

      try {
        blueprintResult = attemptNormalize(repairedRawResult);
      } catch (repairValidationError: any) {
        const repairErrorMessage = repairValidationError?.message || 'Failed to normalize repaired AI blueprint response';
        logError(FUNCTION_NAME, 'VALIDATION_ERROR', repairErrorMessage, {
          requestId,
          userId: user.id,
          stage: 'repair',
          primaryValidationError,
        });
        return Errors.validationError('AI returned an invalid blueprint structure. Please retry.', responseContext);
      }
    }

    logInfo(FUNCTION_NAME, 'Blueprint generated successfully', { requestId, userId: user.id });
    return createSuccessResponse(blueprintResult, responseContext);

  } catch (error) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message, { requestId, stack: error.stack });
    return Errors.internalError('Failed to generate blueprint: ' + error.message, responseContext);
  }
});

function buildBlueprintPrompt(goalContexts: GoalContext[], userProfile: any, additionalContext?: string): string {
  const goalsText = goalContexts.map(gc => {
    // Format completed items with their comments if available
    const completedItems = gc.completedPrerequisites.map(item => {
      // Find comment (key might be ID not label, but we passed label-mapped comments potentially?)
      // Wait, type definition says Record<string, string> (id -> comment). 
      // But the labels are in completedPrerequisites. 
      // We need to map comments to labels or just list comments separately.

      // Since we don't have the ID here easily without iterating, let's just dump all comments.
      return item;
    }).join(', ');

    // Better strategy: List comments explicitly
    const commentsSection = gc.prerequisiteComments && Object.values(gc.prerequisiteComments).length > 0
      ? `\n- Specific Achievements Details:\n${Object.entries(gc.prerequisiteComments)
        .map(([_, comment]) => `  * ${comment}`)
        .join('\n')}`
      : '';

    const intakeResponses = gc.intakeResponses && Object.keys(gc.intakeResponses).length > 0
      ? Object.entries(gc.intakeResponses)
        .map(([key, value]) => {
          const formatted = Array.isArray(value) ? value.join(', ') : value;
          return `  * ${key}: ${formatted === null || formatted === '' ? 'Not provided' : String(formatted)}`;
        })
        .join('\n')
      : '';

    const intakeSection = intakeResponses
      ? `\n- Intake Responses (authoritative context):\n${intakeResponses}`
      : '';

    const intakeMissingSection = gc.intakeMissingRequired && gc.intakeMissingRequired.length > 0
      ? `\n- Missing required intake fields: ${gc.intakeMissingRequired.join(', ')}`
      : '';

    return `
MANIFESTATION: ${gc.goalTitle}
- STATUS: ${gc.completedPrerequisites.length > 0 ? 'IN PROGRESS' : 'NOT STARTED'}
- ALREADY COMPLETED (DO NOT INCLUDE IN PLAN): ${gc.completedPrerequisites.join(', ') || 'None'}
- REMAINING STEPS (FOCUS HERE): ${gc.skippedPrerequisites.join(', ') || 'All prerequisites met!'}${commentsSection}${intakeSection}${intakeMissingSection}
- User's notes: ${gc.additionalNotes || 'None'}
`;
  }).join('\n');

	  return `You are an ambition-achieving coach in the Dlulu Life app.
Your job: turn the user's ambition into an accurate, practical, non-generic execution plan that reflects their real situation.

	## USER PROFILE
	- Role: ${userProfile.role || 'Not specified'}
	- Life Context: ${userProfile.bio || 'Not provided'}
	- Best Time for Focus: ${userProfile.chronotype === 'early_bird'
      ? 'Morning person'
      : userProfile.chronotype === 'night_owl'
        ? 'Night owl'
        : userProfile.chronotype === 'midday_peak'
          ? 'Midday peak'
          : 'Flexible schedule'}
	- Energy Capacity: ${userProfile.energyLevel === 'high_octane' ? 'High energy, can handle intensive plans' : userProfile.energyLevel === 'recovery' ? 'Currently recovering, needs gentle pacing' : 'Balanced, sustainable approach'}
	${additionalContext ? `- Additional Context: ${additionalContext}` : ''}

## MANIFESTATIONS TO PLAN
${goalsText}

## YOUR COACHING TASK
Create a COMPREHENSIVE, DETAILED roadmap for each manifestation. This should be the complete guide the user needs to achieve their dreams.

**CRITICAL - BE THOROUGH:**
You are creating a full coaching plan. Include EVERY step the user needs. Don't artificially limit - include all necessary tasks.

**STRUCTURE REQUIREMENTS:**
- Up to ${DATA_LIMITS.MAX_PHASES_PER_GOAL} phases per manifestation (create as many as the goal complexity requires)
- Up to ${DATA_LIMITS.MAX_MILESTONES_PER_PHASE} milestones per phase (include all key checkpoints)
- Up to ${DATA_LIMITS.MAX_TASKS_PER_MILESTONE} tasks per milestone (break down into 1-3 day efforts)
- Up to ${DATA_LIMITS.MAX_SUBTASKS_PER_TASK} subtasks per task (these are the checkboxes user will tick off)

	**COACHING PRINCIPLES:**
	1. **CRITICAL: SKIP COMPLETED ITEMS.** If a prerequisite is listed as "ALREADY COMPLETED", do NOT include it in the plan. Start strictly AFTER these achievements.
	2. **START FROM REALITY.** Begin the plan at the user's current level.
	3. **DON'T OVER-INDEX ON THEIR JOB.** Use role/bio to infer constraints (time, budget, energy, environment). If the goal is unrelated to their profession (e.g., a doctor learning salsa), do NOT assume domain knowledge from their job; create a beginner-to-competent pathway grounded in the goal domain.
	4. **USER NOTES ARE HIGH PRIORITY.** If the user notes say something is done/blocked/unsafe/out-of-scope, plan accordingly. Do not ignore notes.
	5. **DELIVERABLES, NOT VIBES.** Every milestone must produce concrete outputs (artifact, checklist, draft, dashboard, list, script, calendar blocks, outreach list, etc).
	6. **ENTRY/EXIT CRITERIA.** Every phase must implicitly include:
	   - Entry criteria: what must be true before starting the phase
	   - Exit criteria: what must be true to move on
	   Implement this inside phase.description and the first/last milestone tasks/subtasks (do NOT add new fields).
	7. Make tasks specific and actionable: "Draft 3 acquisition experiments and ship 1 this week" not "Do marketing".
	8. **DEPTH REQUIREMENT:** Titles must be specific. Descriptions must not be one-liners:
	   - strategyOverview: 2 paragraphs minimum. Practical, with tradeoffs and sequencing rationale.
	   - phase.description + milestone.description: at least 2 sentences each.
	   - task.description: at least 2 sentences including definition of done + constraint.
	   - subTasks: include a description for each subTask (1 sentence, checkboxable).
		9. Include feedback loops and measurement when relevant (reviews, tests, metrics, user feedback, mock runs).
		10. Consider their energy level and chronotype for scheduling.
		11. **CLASSIFY THE GOAL ARCHETYPE:**
		   - **HABIT_BUILDING**: High frequency (daily), short duration (Gym, Meditation).
		   - **DEEP_WORK_PROJECT**: Lower frequency (2-3x/week), long blocks (Writing, Coding).
		   - **SKILL_ACQUISITION**: Spaced repetition (Languages, Instruments).
		   - **MAINTENANCE**: Periodic check-ins (Chores, Reviews).
		   *Base the suggestedSchedule strictly on this archetype.*
		12. **BEHAVIOR-CHANGE FRAMEWORK (MANDATORY):** Provide a Behavior Plan using:
		   - SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
		   - WOOP (Wish, Outcome, Obstacles, Plan)
		   - Implementation Intentions (If-Then)
		   - Habit Stacking Anchors
		   - Friction Reduction (remove/add)
		13. **RISK CLASSIFICATION:** Assign a risk level for health/finance/safety sensitive goals:
		   - low: general lifestyle/learning goals
		   - medium: diet changes, intense training, investing, debt payoff
		   - high: medical treatments, eating disorder risk, high-leverage trading, extreme physical goals
		   If risk is medium/high, include a safety caveat in strategyOverview and a criticalGap about safe execution.
		14. **OUTPUT SHOULD BE USEFUL BUT NOT OVERLOADED:** Prefer 3-7 phases total. Prefer 2-5 tasks per milestone. Prefer 3-6 subtasks per task. Only exceed if absolutely necessary.
		15. **USE INTAKE RESPONSES AS FACTS:** Intake Responses section has the latest user context. Reflect it directly in plan scope and sequence.
		16. **ANTI-UNIFORM DURATION RULE:** Do not default all tasks/schedules to 60 minutes. Durations must vary by task complexity, effort type, and prerequisites completed.
		17. **TIMELINE HONESTY RULE:** If intake targets are unrealistic (e.g., unsafe health pace or impossible wealth deadline), explicitly say so in strategyOverview, explain why, and provide a safer/realistic timeline.
		18. **SAFETY/COMPLIANCE RULE:** Refuse illegal or harmful instructions. Do not provide medical/legal/financial directives beyond educational coaching; include a clear caveat for medium/high risk goals.

	## OUTPUT FORMAT (JSON)
	{
	  "goals": [
	    {
	      "goalTitle": "Exact title from above",
	      "goalArchetype": "HABIT_BUILDING|DEEP_WORK_PROJECT|SKILL_ACQUISITION|MAINTENANCE",
	      "category": "health|career|learning|personal|financial|relationships",
	      "timeline": "e.g., 12 weeks",
	      "estimatedWeeks": 12,
      "strategyOverview": "2 paragraphs minimum. Practical, specific, with sequencing rationale and tradeoffs (no fluff).",
	      "criticalGaps": ["string (3-7 items, specific and realistic)"],
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
          "obstacles": ["string", "string"],
          "plan": ["string", "string"]
        },
        "implementationIntentions": [
          { "if": "string", "then": "string" }
        ],
        "habitStacking": [
          { "anchor": "string", "routine": "string", "reward": "string" }
        ],
        "frictionReduction": {
          "remove": ["string", "string"],
          "add": ["string", "string"]
        }
      },
      "riskLevel": "low|medium|high",
      "phases": [
        {
          "number": 1,
          "title": "Phase title - make it motivating",
          "description": "What this phase accomplishes and why it matters",
          "estimatedDuration": "e.g., 3 weeks",
          "startWeek": 1,
          "endWeek": 3,
          "focus": ["Primary focus", "Secondary focus"],
          "milestones": [
            {
              "title": "Clear milestone title",
              "description": "What success looks like - be specific",
              "targetWeek": 2,
	              "tasks": [
	                {
	                  "title": "Specific actionable task (1-3 days)",
	                  "description": "At least 2 sentences: definition of done + key constraint + expected deliverable",
	                  "order": 1,
	                  "estimatedMinutes": 35,
	                  "difficulty": 3,
	                  "cognitiveType": "learning|deep_work|shallow_work|creative|admin",
	                  "subTasks": [
		                    { "title": "Single checkable action (specific)", "description": "1 sentence with definition of done", "order": 1 },
		                    { "title": "Another checkable action (specific)", "description": "1 sentence with definition of done", "order": 2 },
		                    { "title": "One more checkable action (specific)", "description": "1 sentence with definition of done", "order": 3 }
	                  ]
	                },
	                {
	                  "title": "Another task",
	                  "description": "At least 2 sentences: definition of done + constraint + expected deliverable",
	                  "order": 2,
	                  "estimatedMinutes": 95,
	                  "difficulty": 2,
	                  "cognitiveType": "learning|deep_work|shallow_work|creative|admin",
	                  "subTasks": [
	                    { "title": "Action step 1", "description": "optional extra detail", "order": 1 },
	                    { "title": "Action step 2", "description": "optional extra detail", "order": 2 },
	                    { "title": "Action step 3", "description": "optional extra detail", "order": 3 }
	                  ]
	                }
	              ]
	            }
          ],
          "coachAdvice": "Personalized, encouraging advice for this phase"
        }
      ],
      "suggestedSchedule": {
        "frequency": 3,
        "duration": 45,
        "preferredTime": "morning|afternoon|evening",
        "energyCost": "high|medium|low"
      }
    }
  ]
}

## FINAL CHECKLIST BEFORE RESPONDING:
- [ ] Each manifestation has multiple phases (at least 2-3)
- [ ] Each phase has multiple milestones (at least 2-3)  
- [ ] Each milestone has multiple tasks (at least 2-3)
- [ ] Each task has multiple subtasks (at least 3-5)
- [ ] Tasks are granular (completable in 1-3 days)
- [ ] Subtasks are single actions (checkable in minutes to hours)
	- [ ] Coach advice is encouraging and specific
	- [ ] Timeline is realistic for user's context
	- [ ] Category matches the manifestation type
	- [ ] Goal Archetype is correctly identified
	- [ ] BehaviorPlan fields are filled (not empty)
	- [ ] CriticalGaps are concrete and useful
	- [ ] Task durations are varied and not uniformly 60 minutes

	Return ONLY valid JSON, no markdown or explanation.`;
	}
