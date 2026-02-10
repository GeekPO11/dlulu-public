// =============================================================================
// Roadmap Generation & Refinement Service
// Handles mind-map style roadmap creation and Gemini-powered edits
// =============================================================================

import { ai, MODELS, parseJsonSafe } from './client';
import { buildUserContext, COACH_SYSTEM_INSTRUCTION } from './context';
import { logger } from '../../lib/logger';
import { DATA_LIMITS, EXAMPLE_ROADMAP_TASK } from '../../constants/dataLimits';
import { callEdgeFunction } from '../../lib/supabase';
import type {
  Goal,
  Phase,
  Roadmap,
  RoadmapGoal,
  RoadmapPhase,
  RoadmapTask,
  RoadmapSubTask,
  RoadmapRefinementRequest,
  RoadmapRefinementResponse,
  PhaseRefinementRequest,
  PhaseRefinementResponse,
  RefinementChange,
  UserProfile,
} from '../../types';

// =============================================================================
// Roadmap Generation
// =============================================================================

interface GenerateRoadmapParams {
  goals: Goal[];
  profile: Partial<UserProfile>;
  startDate?: Date;
}

/**
 * Generate a detailed roadmap from finalized goals
 * This creates the mind-map data structure with tasks and sub-tasks
 */
export const generateRoadmap = async ({
  goals,
  profile,
  startDate = new Date(),
}: GenerateRoadmapParams): Promise<Roadmap> => {
  logger.info(`[Gemini/Roadmap] Generating roadmap for ${goals.length} goals`);
  logger.info(`[Gemini/Roadmap] Profile received: ${profile ? 'present' : 'undefined'} ${profile?.role || 'no role'}`);

  const userContext = buildUserContext(profile || {});

  const prompt = `You are a strategic planning expert. Create a detailed execution roadmap for the user's goals.

## USER CONTEXT
${userContext}

## GOALS TO PLAN (Maximum ${DATA_LIMITS.MAX_GOALS} goals)
${goals.map((g, i) => `
### Goal ${i + 1}: ${g.title}
- Category: ${g.category}
- Timeline: ${g.timeline} (${g.estimatedWeeks} weeks)
- Strategy: ${g.strategyOverview}
- Current Status: ${g.status}
- Sessions: ${g.frequency}x/week, ${g.duration} mins each
- Preferred Time: ${g.preferredTime}
- Energy Cost: ${g.energyCost}

Phases (${g.phases.length} total):
${g.phases.map(p => `
  Phase ${p.number}: ${p.title} (Weeks ${p.startWeek}-${p.endWeek})
  - ${p.description}
  - Focus: ${p.focus.join(', ')}
  - Milestones: ${p.milestones.map(m => m.title).join(', ')}
`).join('')}
`).join('\n---\n')}

## YOUR TASK
For each goal and phase, create a detailed task breakdown.

LIMITS & GUARDRAILS:
- Up to ${DATA_LIMITS.MAX_TASKS_PER_MILESTONE} tasks per phase (create as many as needed for the complexity)
- Up to ${DATA_LIMITS.MAX_SUBTASKS_PER_TASK} sub-tasks per task (create as many as needed)
- Be thorough - include ALL necessary tasks, don't artificially limit the count

## EXAMPLE TASK STRUCTURE
\`\`\`json
${JSON.stringify(EXAMPLE_ROADMAP_TASK, null, 2)}
\`\`\`

## OUTPUT FORMAT (JSON)
{
  "goals": [
    {
      "goalId": "string - use goal title as ID (slugified)",
      "goalTitle": "string (max ${DATA_LIMITS.MAX_TITLE_LENGTH} chars)",
      "category": "health|career|learning|personal|financial|relationships",
      "startWeek": number,
      "endWeek": number,
      "totalDays": number,
      "sessionsPerWeek": number (${DATA_LIMITS.MIN_SESSIONS_PER_WEEK}-${DATA_LIMITS.MAX_SESSIONS_PER_WEEK}),
      "minutesPerSession": number (${DATA_LIMITS.MIN_SESSION_DURATION}-${DATA_LIMITS.MAX_SESSION_DURATION}),
      "preferredTimeSlot": "morning|afternoon|evening|flexible",
      "phases": [
        {
          "phaseId": "string - unique ID (e.g., phase-1-goal-1)",
          "phaseNumber": number,
          "title": "string",
          "description": "string",
          "startWeek": number,
          "endWeek": number,
          "durationDays": number,
          "coachAdvice": "string - strategic advice for this phase",
          "tasks": [
            {
              "id": "string - unique task ID",
              "title": "string (max ${DATA_LIMITS.MAX_TITLE_LENGTH} chars)",
              "description": "string (max ${DATA_LIMITS.MAX_DESCRIPTION_LENGTH} chars)",
              "startDay": number,
              "endDay": number,
              "durationDays": number,
              "timesPerWeek": number,
              "order": number,
              "subTasks": [
                {
                  "id": "string - unique subtask ID",
                  "title": "string (checkbox label)",
                  "order": number
                }
              ] // up to ${DATA_LIMITS.MAX_SUBTASKS_PER_TASK} items - include all needed subtasks
            }
          ] // up to ${DATA_LIMITS.MAX_TASKS_PER_MILESTONE} items - include all needed tasks
        }
      ]
    }
  ],
  "totalWeeks": number,
  "coachingSummary": "string - overall strategic advice"
}

CRITICAL:
- Tasks must flow logically within each phase
- Sub-tasks should be specific enough to check off when done
- Consider the user's energy level and preferred time
- Each goal gets its own phases array (don't mix across goals)

Respond with ONLY valid JSON, no markdown.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });

    const text = response.text || '';
    logger.info(`[Gemini/Roadmap] Raw response text length: ${text.length}`);

    const parsed = parseJsonSafe<{
      goals: Array<{
        goalId?: string;
        goalTitle?: string;
        category?: string;
        startWeek?: number;
        endWeek?: number;
        totalDays?: number;
        sessionsPerWeek?: number;
        minutesPerSession?: number;
        preferredTimeSlot?: string;
        phases?: Array<{
          phaseId?: string;
          phaseNumber?: number;
          title?: string;
          description?: string;
          startWeek?: number;
          endWeek?: number;
          durationDays?: number;
          coachAdvice?: string;
          tasks?: Array<{
            id?: string;
            title?: string;
            description?: string;
            startDay?: number;
            endDay?: number;
            durationDays?: number;
            timesPerWeek?: number;
            order?: number;
            subTasks?: Array<{
              id?: string;
              title?: string;
              order?: number;
            }>;
          }>;
        }>;
      }>;
      totalWeeks: number;
      coachingSummary: string;
    }>(text, { goals: [], totalWeeks: 12, coachingSummary: '' });

    logger.info(`[Gemini/Roadmap] Parsed goals count: ${parsed.goals?.length || 0}`);

    // Safely build the roadmap structure with validation
    const validatedGoals: RoadmapGoal[] = (parsed.goals || []).map((g, gIndex) => {
      const goalId = g.goalId || `goal-${gIndex + 1}`;
      // Processing goal and phases

      return {
        goalId,
        goalTitle: g.goalTitle || `Goal ${gIndex + 1}`,
        category: (g.category as RoadmapGoal['category']) || 'personal',
        startWeek: g.startWeek || 1,
        endWeek: g.endWeek || 12,
        totalDays: g.totalDays || 84,
        sessionsPerWeek: g.sessionsPerWeek || 3,
        minutesPerSession: g.minutesPerSession || 60,
        preferredTimeSlot: (g.preferredTimeSlot as RoadmapGoal['preferredTimeSlot']) || 'flexible',
        isExpanded: true,
        phases: (g.phases || []).map((p, pIndex) => {
          const phaseId = p.phaseId || `phase-${gIndex + 1}-${pIndex + 1}`;
          // Processing phase tasks

          return {
            phaseId,
            phaseNumber: p.phaseNumber || pIndex + 1,
            title: p.title || `Phase ${pIndex + 1}`,
            description: p.description || '',
            startWeek: p.startWeek || 1,
            endWeek: p.endWeek || 4,
            durationDays: p.durationDays || 28,
            coachAdvice: p.coachAdvice || '',
            isExpanded: true,
            tasks: (p.tasks || []).map((t, tIndex) => {
              const taskId = t.id || `task-${gIndex + 1}-${pIndex + 1}-${tIndex + 1}`;

              return {
                id: taskId,
                phaseId, // Add the phaseId reference
                title: t.title || `Task ${tIndex + 1}`,
                description: t.description || '',
                startDay: t.startDay || 1,
                endDay: t.endDay || 7,
                durationDays: t.durationDays || 7,
                timesPerWeek: t.timesPerWeek || 3,
                order: t.order || tIndex + 1,
                isCompleted: false,
                isStrikethrough: false,
                isExpanded: false,
                subTasks: (t.subTasks || []).map((st, stIndex) => ({
                  id: st.id || `subtask-${taskId}-${stIndex + 1}`,
                  taskId,
                  title: st.title || `Sub-task ${stIndex + 1}`,
                  order: st.order || stIndex + 1,
                  isCompleted: false,
                  isManual: false,
                  isStrikethrough: false,
                })),
              };
            }),
          };
        }),
      };
    });

    const roadmap: Roadmap = {
      id: `roadmap-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      goals: validatedGoals,
      totalWeeks: parsed.totalWeeks || 12,
      startDate,
      refinementHistory: [],
      version: 1,
    };

    logger.info(`[Gemini/Roadmap] Final roadmap has ${roadmap.goals.length} goals`);
    roadmap.goals.forEach((g, i) => {
      // Goal phases processed
    });

    return roadmap;
  } catch (error) {
    logger.error('[Gemini/Roadmap] Error generating roadmap:', error);
    throw error;
  }
};

// =============================================================================
// Roadmap Refinement (Full roadmap level)
// =============================================================================

/**
 * Refine the roadmap based on user's request
 * Uses secure Edge Function (API key stored server-side)
 * CRITICAL: Output schema MUST match the Roadmap type exactly
 */
export const refineRoadmap = async (
  request: RoadmapRefinementRequest
): Promise<RoadmapRefinementResponse> => {
  logger.info(`[Gemini/Roadmap] Refining roadmap via Edge Function: ${request.userRequest}`);

  try {
    const { data, error } = await callEdgeFunction<RoadmapRefinementResponse>(
      'refine-roadmap',
      {
        currentRoadmap: request.currentRoadmap,
        userProfile: {
          role: request.userProfile.role || '',
          bio: request.userProfile.bio || '',
          chronotype: request.userProfile.chronotype || 'flexible',
          energyLevel: request.userProfile.energyLevel || 'balanced',
        },
        userRequest: request.userRequest,
        focusedGoalId: request.focusedGoalId,
        focusedPhaseId: request.focusedPhaseId,
        focusedTaskId: request.focusedTaskId,
      }
    );

    if (error) {
      logger.error('[Gemini/Roadmap] Edge Function error:', error);
      // Return unchanged roadmap on error
      return {
        updatedRoadmap: request.currentRoadmap,
        changeSummary: 'Error: ' + error,
        changes: [],
      };
    }

    if (!data) {
      throw new Error('No data returned from refine-roadmap');
    }

    // Ensure version is incremented
    if (data.updatedRoadmap) {
      data.updatedRoadmap.version = (request.currentRoadmap.version || 0) + 1;
      data.updatedRoadmap.updatedAt = new Date();
    }

    logger.info(`[Gemini/Roadmap] Refinement complete: ${data.changeSummary}`);
    return data;
  } catch (error) {
    logger.error('[Gemini/Roadmap] Error refining roadmap:', error);
    // Return unchanged roadmap on error
    return {
      updatedRoadmap: request.currentRoadmap,
      changeSummary: 'Failed to refine roadmap',
      changes: [],
    };
  }
};

// =============================================================================
// Phase-Level Refinement (For "Refine with Gemini" on each phase)
// =============================================================================

/**
 * Refine a specific phase based on user's request
 * Uses secure Edge Function (API key stored server-side)
 */
export const refinePhase = async (
  request: PhaseRefinementRequest
): Promise<PhaseRefinementResponse> => {
  logger.info(`[Gemini/Roadmap] Refining phase via Edge Function: ${request.currentPhase.title}`);

  try {
    const { data, error } = await callEdgeFunction<any>('refine-phase', {
      phaseId: request.currentPhase.phaseId,
      goalContext: {
        title: request.goal.title,
        category: request.goal.category,
        timeline: request.goal.timeline,
      },
      userRequest: request.userRequest,
      userProfile: {
        role: request.userProfile.role || 'general',
        bio: request.userProfile.bio || '',
      },
      // Pass full phase context for stateless refinement (if not saved to DB yet)
      phaseContext: {
        id: request.currentPhase.phaseId,
        title: request.currentPhase.title,
        description: request.currentPhase.description,
        focus: [], // RoadmapPhase doesn't track focus areas directly, but AI can infer
        milestones: request.tasks.map(t => ({
          id: t.id,
          title: t.title,
          is_completed: t.isCompleted,
          subtasks: t.subTasks.map(st => ({
            id: st.id,
            title: st.title,
            is_completed: st.isCompleted,
            is_strikethrough: st.isStrikethrough
          }))
        }))
      }
    });

    if (error) {
      logger.error('[Gemini/Roadmap] Edge Function error:', error);
      // Return unchanged tasks on error
      return {
        updatedTasks: request.tasks.map(t => ({
          ...t,
          isStrikethrough: false,
        })),
        changeSummary: 'Error: ' + error,
      };
    }

    // Transform Edge Function response to match expected format
    const result: PhaseRefinementResponse = {
      updatedTasks: data?.updatedTasks || request.tasks,
      changeSummary: data?.changeSummary || 'Phase refined',
      coachNotes: data?.coachNotes,
    };

    logger.info(`[Gemini/Roadmap] Phase refinement complete: ${result.changeSummary}`);
    return result;
  } catch (error) {
    logger.error('[Gemini/Roadmap] Error refining phase:', error);
    // Return unchanged tasks on error
    return {
      updatedTasks: request.tasks.map(t => ({
        ...t,
        isStrikethrough: false,
      })),
      changeSummary: 'Failed to refine phase',
    };
  }
};

// =============================================================================
// Helper: Convert Goals to Roadmap Structure
// =============================================================================

/**
 * Convert existing goals/phases/milestones into the roadmap structure
 * Used when building roadmap from already-created goals
 * 
 * NEW STRUCTURE: Goal → Phase → Milestone → Task → SubTask
 * In RoadmapView: Phase → Tasks (which are milestones with their tasks flattened)
 */
export const goalsToRoadmap = (goals: Goal[], startDate: Date = new Date()): Roadmap => {
  logger.info(`[goalsToRoadmap] Converting ${goals.length} goals`);

  const roadmapGoals: RoadmapGoal[] = goals.map(goal => {
    logger.info(`[goalsToRoadmap] Processing goal: ${goal.title} with ${goal.phases?.length || 0} phases`);

    return {
      goalId: goal.id,
      goalTitle: goal.title,
      category: goal.category,
      startWeek: 1,
      endWeek: goal.estimatedWeeks || 12,
      totalDays: (goal.estimatedWeeks || 12) * 7,
      sessionsPerWeek: goal.frequency || 3,
      minutesPerSession: goal.duration || 60,
      preferredTimeSlot: goal.preferredTime || 'morning',
      isExpanded: true,
      phases: (goal.phases || []).map(phase => {
        logger.info(`[goalsToRoadmap]   Phase: ${phase.title} with ${phase.milestones?.length || 0} milestones`);

        // Flatten: Each milestone's tasks become roadmap tasks
        // If milestone has no tasks, treat the milestone itself as a task
        const allTasks: RoadmapTask[] = [];

        (phase.milestones || []).forEach((m, mi) => {
          // Check for tasks array (new structure) or fallback
          const milestoneTasks = (m as any).tasks || [];
          logger.info(`[goalsToRoadmap]     Milestone: ${m.title} has ${milestoneTasks.length} tasks`);

          if (milestoneTasks.length > 0) {
            // New structure: milestone has tasks with subtasks
            milestoneTasks.forEach((t: any, ti: number) => {
              const taskSubTasks = t.subTasks || [];
              logger.info(`[goalsToRoadmap]       Task: ${t.title} has ${taskSubTasks.length} subtasks`);

              allTasks.push({
                id: t.id || `task-${phase.id}-${mi}-${ti}`,
                phaseId: phase.id,
                title: t.title,
                description: `Part of: ${m.title}`, // Reference parent milestone
                startDay: (phase.startWeek || 1) * 7,
                endDay: (m.targetWeek || phase.endWeek || 4) * 7,
                durationDays: 7,
                timesPerWeek: goal.frequency || 3,
                order: allTasks.length + 1,
                isCompleted: t.isCompleted || false,
                completedAt: t.completedAt,
                isStrikethrough: false,
                isExpanded: true, // Expand to show subtasks
                subTasks: taskSubTasks.map((st: any, sti: number) => ({
                  id: st.id || `subtask-${t.id}-${sti}`,
                  taskId: t.id,
                  title: st.title,
                  isCompleted: st.isCompleted || false,
                  completedAt: st.completedAt,
                  isManual: false,
                  isStrikethrough: false,
                  order: st.order || sti + 1,
                })),
              });
            });
          } else {
            // No tasks provided: treat the milestone as a single task with no subtasks
            allTasks.push({
              id: m.id,
              phaseId: phase.id,
              title: m.title,
              description: m.description || '',
              startDay: (phase.startWeek || 1) * 7,
              endDay: (m.targetWeek || phase.endWeek || 4) * 7,
              durationDays: 7,
              timesPerWeek: goal.frequency || 3,
              order: allTasks.length + 1,
              isCompleted: m.isCompleted || false,
              completedAt: m.completedAt,
              isStrikethrough: false,
              isExpanded: false,
              subTasks: [],
            });
          }
        });

        logger.info(`[goalsToRoadmap]   Total tasks for phase: ${allTasks.length}`);

        return {
          phaseId: phase.id,
          phaseNumber: phase.number,
          title: phase.title,
          description: phase.description || '',
          startWeek: phase.startWeek || 1,
          endWeek: phase.endWeek || 4,
          durationDays: ((phase.endWeek || 4) - (phase.startWeek || 1) + 1) * 7,
          coachAdvice: phase.coachAdvice || '',
          isExpanded: true,
          tasks: allTasks,
        };
      }),
    };
  });

  return {
    id: `roadmap-${Date.now()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    goals: roadmapGoals,
    totalWeeks: Math.max(...goals.map(g => g.estimatedWeeks), 12),
    startDate,
    refinementHistory: [],
    version: 1,
  };
};
