// =============================================================================
// Planning Prompts - Ambition Analysis, Status Check, Blueprint Generation
// Properly structured with guardrails and consistent data formats
// =============================================================================

import { ai, MODELS, parseJsonSafe } from "./client";
import { buildUserContext, COACH_SYSTEM_INSTRUCTION } from "./context";
import { logger } from "../../lib/logger";
import { DATA_LIMITS, EXAMPLE_GOAL_ANALYSIS, EXAMPLE_BLUEPRINT_PHASE, EXAMPLE_ROADMAP_TASK } from "../../constants/dataLimits";
import {
  UserProfile,
  Prerequisite,
  GoalStatusContext,
  AmbitionAnalysisResponse,
  GapAnalysisResponse,
  GoalCategory
} from "../../types";

// =============================================================================
// STEP 1: Analyze Ambitions → Generate Prerequisites for Status Check
// Input: User's raw ambition text + profile
// Output: Structured goals with prerequisites (checkboxes for status check)
// =============================================================================

interface AnalyzeAmbitionsInput {
  ambitionText: string;
  profile: Partial<UserProfile>;
}

export const analyzeAmbitions = async (
  input: AnalyzeAmbitionsInput
): Promise<AmbitionAnalysisResponse> => {
  const { ambitionText, profile } = input;

  const userContext = buildUserContext(profile);

  const prompt = `You are analyzing a user's ambitions to create a personalized coaching plan to achieve the user's ambitions.

## USER CONTEXT
${userContext}

## USER'S STATED MANIFESTATIONS
"${ambitionText}"

## YOUR TASK

1. **Parse Distinct Goals**: Extract separate, independent goals from the input.
   - Maximum ${DATA_LIMITS.MAX_GOALS} goals
   - Each goal should be clearly actionable

2. **Categorize Each Goal**: Use ONLY these categories:
   - health (fitness, nutrition, medical, mental health)
   - career (job, promotion, professional skills, business)
   - learning (education, courses, skills, languages)
   - personal (hobbies, lifestyle, habits)
   - financial (savings, investments, income)
   - relationships (family, friends, networking)

3. **Estimate Realistic Timeline**: Based on complexity and user's context.
   - Minimum ${DATA_LIMITS.MIN_TIMELINE_WEEKS} weeks
   - Maximum ${DATA_LIMITS.MAX_TIMELINE_WEEKS} weeks

4. **Generate Prerequisites Checklist**: For EACH goal, create ${DATA_LIMITS.MIN_PREREQUISITES_PER_GOAL}-${DATA_LIMITS.MAX_PREREQUISITES_PER_GOAL} milestones:
   - Ordered from BEGINNER (order: 1) to ADVANCED (order: 5+)
   - These will be shown as checkboxes for user to mark what they've already done
   - Be specific and relevant to the user's profession/context

## EXAMPLE OUTPUT
\`\`\`json
${JSON.stringify({ goals: [EXAMPLE_GOAL_ANALYSIS] }, null, 2)}
\`\`\`

## OUTPUT FORMAT (JSON)
{
  "goals": [
    {
      "title": "string (max ${DATA_LIMITS.MAX_TITLE_LENGTH} chars)",
      "originalInput": "string - the part of user input this goal came from",
      "category": "health|career|learning|personal|financial|relationships",
      "timeline": "string - e.g.,1 day, 1 week, 1 month, 6 months, 1 year, 10 years",
      "estimatedWeeks": number (${DATA_LIMITS.MIN_TIMELINE_WEEKS}-${DATA_LIMITS.MAX_TIMELINE_WEEKS}),
      "prerequisites": [
        { "label": "string (${DATA_LIMITS.MAX_TITLE_LENGTH} chars max)", "order": number (1 is beginner, higher is advanced) }
      ] // array of ${DATA_LIMITS.MIN_PREREQUISITES_PER_GOAL}-${DATA_LIMITS.MAX_PREREQUISITES_PER_GOAL} items
    }
  ] // array of 1-${DATA_LIMITS.MAX_GOALS} goals
}

CRITICAL:
- Each goal MUST have its own prerequisites array
- Order prerequisites from absolute beginner (1) to near completion (highest)
- Be specific to the user's profession and constraints
- For complex ambitions, ensure all major requirements are covered`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.5,
        thinkingConfig: { thinkingBudget: 8192 }
      }
    });

    logger.info("[Gemini/Planning] Ambition analysis response received");

    const result = parseJsonSafe<AmbitionAnalysisResponse>(
      response.text || "",
      { goals: [] }
    );

    // Validate and enforce limits
    result.goals = result.goals.slice(0, DATA_LIMITS.MAX_GOALS).map(goal => ({
      ...goal,
      estimatedWeeks: Math.min(Math.max(goal.estimatedWeeks, DATA_LIMITS.MIN_TIMELINE_WEEKS), DATA_LIMITS.MAX_TIMELINE_WEEKS),
      prerequisites: goal.prerequisites.slice(0, DATA_LIMITS.MAX_PREREQUISITES_PER_GOAL)
    }));

    return result;
  } catch (error) {
    logger.error("[Gemini/Planning] Ambition analysis error:", error);
    throw error;
  }
};

// =============================================================================
// STEP 2: Gap Analysis → Generate Strategic Blueprint with Phases
// Input: User profile + goals + CHECKED prerequisites + additional context
// Output: Detailed phases for each goal with milestones
// =============================================================================

interface GapAnalysisInput {
  // User's original ambition text
  ambitionText: string;

  // User profile for context
  profile: Partial<UserProfile>;

  // All prerequisites with their checked status
  prerequisites: Prerequisite[];

  // Additional context provided per goal (what else user has done)
  goalContexts: GoalStatusContext[];

  // Global additional context (optional)
  additionalContext?: string;
}

export const generateBlueprint = async (
  input: GapAnalysisInput
): Promise<GapAnalysisResponse> => {
  const { ambitionText, profile, prerequisites, goalContexts, additionalContext } = input;

  const userContext = buildUserContext(profile);

  // Build detailed context from prerequisites - showing what's CHECKED vs NOT CHECKED
  const prerequisitesByGoal: Record<string, { completed: string[], remaining: string[], userNotes: Record<string, string> }> = {};

  prerequisites.forEach(p => {
    if (!prerequisitesByGoal[p.goalTitle]) {
      prerequisitesByGoal[p.goalTitle] = { completed: [], remaining: [], userNotes: {} };
    }
    if (p.isCompleted) {
      prerequisitesByGoal[p.goalTitle].completed.push(p.label);
      if (p.userNotes) {
        prerequisitesByGoal[p.goalTitle].userNotes[p.label] = p.userNotes;
      }
    } else {
      prerequisitesByGoal[p.goalTitle].remaining.push(p.label);
    }
  });

  // Build goal-specific context including additional notes
  const goalContextsFormatted = Object.entries(prerequisitesByGoal).map(([goalTitle, data]) => {
    const additionalGoalContext = goalContexts.find(gc => gc.goalTitle === goalTitle);

    return `
### GOAL: ${goalTitle}

**Already Completed (User checked these):**
${data.completed.length > 0
        ? data.completed.map(c => {
          const notes = data.userNotes[c];
          return `  ✓ ${c}${notes ? ` (User notes: "${notes}")` : ''}`;
        }).join('\n')
        : '  (None - User is starting from scratch)'}

**Still Needed (User did NOT check these):**
${data.remaining.length > 0
        ? data.remaining.map(r => `  ○ ${r}`).join('\n')
        : '  (All prerequisites completed!)'}

${additionalGoalContext?.additionalNotes
        ? `**Additional Context from User:**
"${additionalGoalContext.additionalNotes}"`
        : ''}
`;
  }).join('\n---\n');

  const prompt = `You are creating a strategic coaching blueprint for goal achievement.

## USER CONTEXT
${userContext}

## USER'S ORIGINAL AMBITIONS
"${ambitionText}"

## CURRENT STATUS (What User Has & Hasn't Done)
This is CRITICAL context - base your phases on where the user is starting from:
${goalContextsFormatted}

${additionalContext ? `## USER'S TIME AVAILABILITY & CONSTRAINTS
${additionalContext}
` : ''}

## YOUR TASK

Create a DETAILED STRATEGIC BLUEPRINT for EACH goal listed above.

IMPORTANT RULES:
1. **Respect User's Current Status**: 
   - If user has completed prerequisites, Phase 1 should NOT repeat those
   - If user is a beginner (nothing checked), Phase 1 should start with basics
   - Build phases based on what's REMAINING, not what's already done

2. **Include Any Additional Context**: 
   - User may have provided notes about what else they've done
   - Factor this into your phase planning

3. **Phase Structure** (per goal):
   - Between ${DATA_LIMITS.MIN_PHASES_PER_GOAL} and ${DATA_LIMITS.MAX_PHASES_PER_GOAL} phases per goal
   - Up to ${DATA_LIMITS.MAX_MILESTONES_PER_PHASE} milestones per phase (be thorough)
   - Each phase should have clear start/end weeks
   - Phases must be sequential (Phase 2 starts after Phase 1 ends)

4. **Scheduling Recommendations (CRITICAL - Use Time Availability Above)**:
   - MUST respect user's work hours and sleep schedule
   - Base preferredTime on user's chronotype and productivity window
   - ${DATA_LIMITS.MIN_SESSIONS_PER_WEEK}-${DATA_LIMITS.MAX_SESSIONS_PER_WEEK} sessions per week
   - ${DATA_LIMITS.MIN_SESSION_DURATION}-${DATA_LIMITS.MAX_SESSION_DURATION} minutes per session
   - Consider user's energy level when setting session duration and frequency

## EXAMPLE PHASE STRUCTURE
\`\`\`json
${JSON.stringify(EXAMPLE_BLUEPRINT_PHASE, null, 2)}
\`\`\`

## OUTPUT FORMAT (JSON)
{
  "goals": [
    {
      "goalTitle": "string (must match exactly from the GOAL section above)",
      "timeline": "string - e.g., 6 months",
      "strategyOverview": "string - one paragraph explaining overall approach",
      "criticalGaps": ["string"] // 2-8 risks or gaps identified
      "phases": [
        {
          "number": 1,
          "title": "string",
          "description": "string",
          "estimatedDuration": "string - e.g., 4 weeks",
          "startWeek": number,
          "endWeek": number,
          "focus": ["string"] // 2-5 focus areas
          "milestones": [
            {
              "title": "string",
              "description": "string",
              "targetWeek": number
            }
          ], // up to ${DATA_LIMITS.MAX_MILESTONES_PER_PHASE} milestones
          "coachAdvice": "string - tips for this phase"
        }
      ], // up to ${DATA_LIMITS.MAX_PHASES_PER_GOAL} phases
      "suggestedSchedule": {
        "frequency": number (${DATA_LIMITS.MIN_SESSIONS_PER_WEEK}-${DATA_LIMITS.MAX_SESSIONS_PER_WEEK}),
        "duration": number (${DATA_LIMITS.MIN_SESSION_DURATION}-${DATA_LIMITS.MAX_SESSION_DURATION}),
        "preferredTime": "morning|afternoon|evening",
        "energyCost": "high|medium|low"
      }
    }
  ]
}

CRITICAL REQUIREMENTS:
- EACH goal gets its OWN phases array (phases are PER GOAL, not shared)
- Phase numbering restarts at 1 for each goal
- Don't include milestones for prerequisites already completed
- Align milestones with the user's remaining prerequisites + any gaps you identify
- Be realistic about timelines given user's role and constraints`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 16384 } // Higher budget for complex planning
      }
    });

    logger.info("[Gemini/Planning] Blueprint generation response received", { textLength: response.text?.length || 0 });

    const result = parseJsonSafe<GapAnalysisResponse>(
      response.text || "",
      { goals: [] }
    );

    logger.info("[Gemini/Planning] Parsed result", { goalsCount: result.goals?.length || 0 });

    if (!result.goals || result.goals.length === 0) {
      logger.warn("[Gemini/Planning] No goals parsed from response", { responseLength: response.text?.length });
    }

    // Validate and enforce limits
    result.goals = (result.goals || []).map(goal => ({
      ...goal,
      phases: goal.phases.slice(0, DATA_LIMITS.MAX_PHASES_PER_GOAL).map(phase => ({
        ...phase,
        milestones: phase.milestones.slice(0, DATA_LIMITS.MAX_MILESTONES_PER_PHASE)
      })),
      suggestedSchedule: {
        ...goal.suggestedSchedule,
        frequency: Math.min(Math.max(goal.suggestedSchedule.frequency, DATA_LIMITS.MIN_SESSIONS_PER_WEEK), DATA_LIMITS.MAX_SESSIONS_PER_WEEK),
        duration: Math.min(Math.max(goal.suggestedSchedule.duration, DATA_LIMITS.MIN_SESSION_DURATION), DATA_LIMITS.MAX_SESSION_DURATION)
      }
    }));

    return result;
  } catch (error) {
    logger.error("[Gemini/Planning] Blueprint generation error:", error);
    throw error;
  }
};

// =============================================================================
// COMBINED: Generate Full Plan (Blueprint + Roadmap) in ONE call
// Replaces the 2-step Blueprint → Roadmap flow with a single AI call
// =============================================================================

export interface FullPlanGoal {
  goalTitle: string;
  category: string;
  timeline: string;
  estimatedWeeks: number;
  strategyOverview: string;
  suggestedSchedule: {
    frequency: number;
    duration: number;
    preferredTime: 'morning' | 'afternoon' | 'evening';
    energyCost: 'high' | 'medium' | 'low';
  };
  phases: Array<{
    number: number;
    title: string;
    description: string;
    startWeek: number;
    endWeek: number;
    focus: string[];
    coachAdvice: string;
    milestones: Array<{
      id: string;
      title: string;
      description: string;
      targetWeek: number;
      tasks: Array<{
        id: string;
        title: string;
        order: number;
        subTasks: Array<{
          id: string;
          title: string;
          order: number;
        }>;
      }>;
    }>;
  }>;
}

export interface FullPlanResponse {
  goals: FullPlanGoal[];
  coachingSummary: string;
}

export const generateFullPlan = async (
  input: GapAnalysisInput
): Promise<FullPlanResponse> => {
  const { ambitionText, profile, prerequisites, goalContexts, additionalContext } = input;

  const userContext = buildUserContext(profile);

  // Build detailed context from GoalContext objects directly
  // (We rely on goalContexts passed from Onboarding, as the raw prerequisites array might be empty in some flows)
  const goalContextsFormatted = goalContexts.map(ctx => {
    const { goalTitle, additionalNotes, completedPrerequisites, skippedPrerequisites, prerequisiteComments } = ctx;

    // Helper to format a list of items
    const formatList = (items: string[], isCompleted: boolean) => {
      if (!items || items.length === 0) return isCompleted ? '  (Starting from scratch)' : '  (All standard prerequisites done!)';

      return items.map(item => {
        // Try to find a specific note for this item
        // Note: StatusCheck uses IDs for keys, but we pass labels here. 
        // Ideally we'd map via IDs, but for now we check if any note key roughly matches or if we just show general notes.
        // Actually, let's just show all comments in a dedicated section if we can't map 1:1 easily without IDs here.
        // BUT, StatusCheck passes simple labels string[] for 'completedPrerequisites'.
        // So for now, we just list the item.
        return `  ${isCompleted ? '✓' : '○'} ${item}`;
      }).join('\n');
    };

    // Format specific user notes (mapped by ID/Label from StatusCheck)
    const notesList = prerequisiteComments && Object.values(prerequisiteComments).length > 0
      ? Object.entries(prerequisiteComments).map(([key, note]) => `  - Note on item: "${note}"`).join('\n')
      : '';

    return `
### GOAL: ${goalTitle}

**Already Completed:**
${formatList(completedPrerequisites, true)}

${notesList ? `**User Notes on Progress:**\n${notesList}\n` : ''}

**Still Needed / Gaps:**
${formatList(skippedPrerequisites, false)}

${additionalNotes ? `**Additional Context:**\n"${additionalNotes}"` : ''}
`;
  }).join('\n---\n');

  const prompt = `You are a strategic planning coach. Create a COMPLETE execution plan with phases, milestones, tasks, and subtasks in ONE response.

## USER CONTEXT
${userContext}

## USER'S AMBITIONS
"${ambitionText}"

## CURRENT STATUS
${goalContextsFormatted}

${additionalContext ? `## TIME AVAILABILITY
${additionalContext}` : ''}

## YOUR TASK
Create a COMPLETE ACTIONABLE PLAN for each goal. This includes:
1. Strategic phases with timeline
2. Milestones within each phase
3. Specific tasks for each milestone
4. Actionable subtasks (checkboxes) for each task
5. A behavior-change grounded plan (SMART + WOOP + implementation intentions + habit stacking + friction reduction)
6. A risk classification for health/finance/safety sensitive goals

## STRUCTURE LIMITS (be thorough - include ALL necessary items)
- Up to ${DATA_LIMITS.MAX_PHASES_PER_GOAL} phases per goal
- Up to ${DATA_LIMITS.MAX_MILESTONES_PER_PHASE} milestones per phase
- Up to ${DATA_LIMITS.MAX_TASKS_PER_MILESTONE} tasks per milestone
- Up to ${DATA_LIMITS.MAX_SUBTASKS_PER_TASK} subtasks per task
- Include ALL tasks needed to complete each milestone - don't artificially limit

## EXAMPLE TASK
\`\`\`json
${JSON.stringify(EXAMPLE_ROADMAP_TASK, null, 2)}
\`\`\`

## OUTPUT FORMAT (JSON)
{
  "goals": [
    {
      "goalTitle": "string (must match from STATUS section)",
      "category": "health|career|learning|personal|financial|relationships",
      "timeline": "string - e.g., 6 months",
      "estimatedWeeks": number,
      "strategyOverview": "one paragraph strategic approach",
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
      "suggestedSchedule": {
        "frequency": number (sessions per week, 1-7),
        "duration": number (minutes per session, 15-180),
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
          "focus": ["string", "string"],
          "coachAdvice": "string",
          "milestones": [
            {
              "id": "milestone-1-1",
              "title": "string",
              "description": "string",
              "targetWeek": 2,
              "tasks": [
                {
                  "id": "task-1-1-1",
                  "title": "string (max 100 chars)",
                  "order": 1,
                  "subTasks": [
                    { "id": "st-1-1-1-1", "title": "string (checkbox label)", "order": 1 },
                    { "id": "st-1-1-1-2", "title": "string", "order": 2 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "coachingSummary": "Overall strategic advice paragraph"
}

CRITICAL:
- Skip prerequisites user already completed
- Tasks must be specific and actionable
- Subtasks should be single checkable items
- Respect user's time constraints and energy level
- Each goal gets separate phases (not shared)`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 16384 }
      }
    });

    logger.info("[Gemini/Planning] Full plan response received");

    const result = parseJsonSafe<FullPlanResponse>(
      response.text || "",
      { goals: [], coachingSummary: '' }
    );

    logger.info("[Gemini/Planning] Parsed full plan", { goalsCount: result.goals?.length || 0 });

    return result;
  } catch (error) {
    logger.error("[Gemini/Planning] Full plan generation error", error);
    throw error;
  }
};
