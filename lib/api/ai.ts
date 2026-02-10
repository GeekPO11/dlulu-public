// =============================================================================
// AI API - Secure Edge Function Calls
// All AI operations go through Supabase Edge Functions (API key stored securely)
// =============================================================================

import { callEdgeFunction } from '../supabase';
import { logger } from '../logger';
import type {
  UserProfile,
  Prerequisite,
  Goal,
  GoalStatusContext,
  AmbitionAnalysisResponse,
  GapAnalysisResponse,
  BehaviorPlan,
  GoalIntakeAnswers,
} from '../../types';

// =============================================================================
// ANALYZE AMBITIONS
// Input: User's raw ambition text + profile
// Output: Structured goals with prerequisites for status check
// =============================================================================

interface AnalyzeAmbitionsInput {
  ambitionText: string;
  profile: Partial<UserProfile>;
  isAddGoalMode?: boolean;
  existingGoals?: Array<{
    id: string;
    title: string;
    category: string;
    timeline?: string;
    estimatedWeeks?: number;
    status?: string;
    frequency?: number;
    duration?: number;
  }>;
}

const ALLOWED_GOAL_CATEGORIES = new Set([
  'health',
  'career',
  'learning',
  'personal',
  'financial',
  'relationships',
]);

const ALLOWED_INTAKE_TYPES = new Set([
  'short_text',
  'long_text',
  'number',
  'single_select',
  'multi_select',
  'boolean',
  'date',
]);

const normalizeGoalCategory = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (ALLOWED_GOAL_CATEGORIES.has(normalized)) return normalized;
  return 'personal';
};

const normalizeFieldKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const normalizeQuestionType = (value: unknown) => {
  if (typeof value === 'string' && ALLOWED_INTAKE_TYPES.has(value)) return value;
  return 'short_text';
};

const normalizeIntakeOptions = (options: unknown, questionId: string) => {
  if (!Array.isArray(options)) return undefined;
  const normalized = options
    .map((option: any, idx: number) => {
      const label = typeof option?.label === 'string' ? option.label.trim() : '';
      const value = typeof option?.value === 'string' ? option.value.trim() : label;
      if (!label || !value) return null;
      return {
        id: typeof option?.id === 'string' && option.id.trim().length > 0 ? option.id : `${questionId}_opt_${idx + 1}`,
        label,
        value,
      };
    })
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
};

const includesTimeframeQuestion = (questions: any[]): boolean => {
  return questions.some((question) => {
    const key = normalizeFieldKey(question?.fieldKey);
    const text = String(question?.question || '').toLowerCase();
    return key === 'target_timeframe_weeks'
      || key === 'target_timeframe'
      || key === 'target_date'
      || /(time ?frame|timeline|deadline|by when|how long|target date|due date|how many weeks|weeks?\s+(to|until|from now|left|remaining|target|timeline)|when do you want to achieve)/.test(text);
  });
};

const normalizeAnalyzeAmbitionsResponse = (data: AmbitionAnalysisResponse): AmbitionAnalysisResponse => {
  const goals = Array.isArray(data?.goals) ? data.goals : [];

  const normalizedGoals = goals
    .map((goal, goalIndex) => {
      const title = typeof goal?.title === 'string' ? goal.title.trim() : '';
      if (!title) return null;

      const category = normalizeGoalCategory(goal?.category);
      const estimatedWeeks = Number.isFinite(Number(goal?.estimatedWeeks))
        ? Math.max(1, Number(goal?.estimatedWeeks))
        : undefined;
      const timeline = typeof goal?.timeline === 'string' && goal.timeline.trim().length > 0
        ? goal.timeline.trim()
        : `${estimatedWeeks || 12} weeks`;

      const normalizedPrerequisites = Array.isArray(goal?.prerequisites)
        ? goal.prerequisites
          .map((prerequisite: any, idx: number) => {
            const label = typeof prerequisite?.label === 'string' ? prerequisite.label.trim() : '';
            if (!label) return null;
            return {
              label,
              order: Number.isFinite(Number(prerequisite?.order)) ? Number(prerequisite.order) : idx + 1,
            };
          })
          .filter(Boolean)
        : [];

      if (normalizedPrerequisites.length === 0) return null;

      const normalizedQuestions = Array.isArray(goal?.intakeQuestions)
        ? goal.intakeQuestions
          .map((question: any, idx: number) => {
            const questionText = typeof question?.question === 'string' ? question.question.trim() : '';
            if (!questionText) return null;

            const fieldKey = normalizeFieldKey(question?.fieldKey) || `question_${idx + 1}`;
            const type = normalizeQuestionType(question?.type);
            const id = typeof question?.id === 'string' && question.id.trim().length > 0
              ? question.id
              : `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${fieldKey}`;

            const options = normalizeIntakeOptions(question?.options, id);
            if ((type === 'single_select' || type === 'multi_select') && !options) return null;

            return {
              id,
              fieldKey,
              question: questionText,
              helperText: typeof question?.helperText === 'string' ? question.helperText.trim() : undefined,
              placeholder: typeof question?.placeholder === 'string' ? question.placeholder.trim() : undefined,
              type,
              required: typeof question?.required === 'boolean' ? question.required : true,
              options,
              min: Number.isFinite(Number(question?.min)) ? Number(question.min) : undefined,
              max: Number.isFinite(Number(question?.max)) ? Number(question.max) : undefined,
              unit: typeof question?.unit === 'string' ? question.unit.trim() : undefined,
              sensitivity: question?.sensitivity,
            };
          })
          .filter(Boolean)
        : [];

      return {
        ...goal,
        title,
        originalInput: typeof goal?.originalInput === 'string' && goal.originalInput.trim().length > 0
          ? goal.originalInput.trim()
          : title,
        category,
        timeline,
        estimatedWeeks: estimatedWeeks || 12,
        prerequisites: normalizedPrerequisites,
        intakeQuestions: normalizedQuestions,
      };
    })
    .filter(Boolean) as AmbitionAnalysisResponse['goals'];

  if (normalizedGoals.length === 0) {
    throw new Error('AI returned no valid goals for analysis. Please retry.');
  }

  const goalsMissingTimeframe = normalizedGoals
    .filter((goal) => !includesTimeframeQuestion(goal.intakeQuestions || []))
    .map((goal) => goal.title);

  if (goalsMissingTimeframe.length > 0) {
    throw new Error(`AI response is missing a timeframe question for: ${goalsMissingTimeframe.join(', ')}. Please retry.`);
  }

  return {
    ...data,
    goals: normalizedGoals,
  };
};

export const analyzeAmbitions = async (
  input: AnalyzeAmbitionsInput
): Promise<AmbitionAnalysisResponse> => {
  const { ambitionText, profile, isAddGoalMode, existingGoals } = input;

  // Calling analyze-ambitions Edge Function

  const { data, error } = await callEdgeFunction<AmbitionAnalysisResponse>(
    'analyze-ambitions',
    {
      ambitionText,
      isAddGoalMode: !!isAddGoalMode,
      existingGoals: Array.isArray(existingGoals)
        ? existingGoals.slice(0, 12).map((goal) => ({
          id: goal.id,
          title: goal.title,
          category: goal.category,
          timeline: goal.timeline,
          estimatedWeeks: goal.estimatedWeeks,
          status: goal.status,
          frequency: goal.frequency,
          duration: goal.duration,
        }))
        : [],
      userProfile: {
        name: profile.name || '',
        role: profile.role || '',
        bio: profile.bio || '',
        chronotype: profile.chronotype || 'flexible',
        energyLevel: profile.energyLevel || 'balanced',
      }
    }
  );

  if (error) {
    logger.error('[AI/API] analyze-ambitions error', error);
    throw new Error(error);
  }

  if (!data) {
    throw new Error('No data returned from analyze-ambitions');
  }

  return normalizeAnalyzeAmbitionsResponse(data);
};

// =============================================================================
// GENERATE PREREQUISITES (POST-INTAKE PERSONALIZATION)
// Input: goal + intake answers + profile
// Output: Personalized prerequisites for status check
// =============================================================================

export interface GeneratePrerequisitesInput {
  goal: {
    title: string;
    category?: string;
    timeline?: string;
    estimatedWeeks?: number;
    originalInput?: string;
  };
  intakeAnswers: GoalIntakeAnswers;
  profile: Partial<UserProfile>;
}

export interface GeneratePrerequisitesOutput {
  prerequisites: Array<{
    label: string;
    order: number;
  }>;
}

const normalizeGeneratePrerequisitesResponse = (data: any): GeneratePrerequisitesOutput => {
  const rawPrerequisites = Array.isArray(data?.prerequisites) ? data.prerequisites : [];

  const dedupedByLabel = new Map<string, { label: string; order?: number }>();
  rawPrerequisites.forEach((prerequisite: any, index: number) => {
    const label = typeof prerequisite?.label === 'string' ? prerequisite.label.trim() : '';
    if (!label) return;
    const key = label.toLowerCase();
    if (!dedupedByLabel.has(key)) {
      dedupedByLabel.set(key, {
        label,
        order: Number.isFinite(Number(prerequisite?.order)) ? Number(prerequisite.order) : index + 1,
      });
    }
  });

  const normalized = Array.from(dedupedByLabel.values())
    .sort((a, b) => (a.order || Number.POSITIVE_INFINITY) - (b.order || Number.POSITIVE_INFINITY))
    .slice(0, 10)
    .map((prerequisite, index) => ({
      label: prerequisite.label,
      order: index + 1,
    }));

  if (normalized.length < 5) {
    throw new Error('AI returned too few personalized prerequisites. Please retry.');
  }

  return { prerequisites: normalized };
};

export const generatePrerequisites = async (
  input: GeneratePrerequisitesInput
): Promise<GeneratePrerequisitesOutput> => {
  const { goal, intakeAnswers, profile } = input;

  const { data, error } = await callEdgeFunction<GeneratePrerequisitesOutput>(
    'generate-prerequisites',
    {
      goal: {
        title: goal.title,
        category: goal.category || 'personal',
        timeline: goal.timeline,
        estimatedWeeks: goal.estimatedWeeks,
        originalInput: goal.originalInput,
      },
      intakeAnswers: intakeAnswers || {},
      userProfile: {
        role: profile.role || '',
        bio: profile.bio || '',
        chronotype: profile.chronotype || 'flexible',
        energyLevel: profile.energyLevel || 'balanced',
      },
    }
  );

  if (error) {
    logger.error('[AI/API] generate-prerequisites error', error);
    throw new Error(error);
  }

  if (!data) {
    throw new Error('No data returned from generate-prerequisites');
  }

  return normalizeGeneratePrerequisitesResponse(data);
};

// =============================================================================
// GENERATE BLUEPRINT
// Input: User profile + goals + checked prerequisites + context
// Output: Detailed phases for each goal with milestones
// =============================================================================

interface GenerateBlueprintInput {
  ambitionText: string;
  profile: Partial<UserProfile>;
  prerequisites: Prerequisite[];
  goalContexts: GoalStatusContext[];
  additionalContext?: string;
}

export const generateBlueprint = async (
  input: GenerateBlueprintInput
): Promise<GapAnalysisResponse> => {
  const { profile, prerequisites, goalContexts } = input;

  // Calling generate-blueprint Edge Function

  // Transform prerequisites into the format expected by Edge Function
  const goalContextsForEdge = goalContexts.map(gc => {
    const goalPrereqs = prerequisites.filter(p => p.goalTitle === gc.goalTitle);
    return {
      goalTitle: gc.goalTitle,
      completedPrerequisites: goalPrereqs.filter(p => p.isCompleted).map(p => p.label),
      skippedPrerequisites: goalPrereqs.filter(p => !p.isCompleted).map(p => p.label),
      additionalNotes: gc.additionalNotes,
      prerequisiteComments: gc.prerequisiteComments,
      intakeResponses: gc.intakeResponses,
      intakeMissingRequired: gc.intakeMissingRequired,
    };
  });

  const { data, error } = await callEdgeFunction<GapAnalysisResponse>(
    'generate-blueprint',
    {
      goalContexts: goalContextsForEdge,
      userProfile: {
        role: profile.role || '',
        bio: profile.bio || '',
        chronotype: profile.chronotype || 'flexible',
        energyLevel: profile.energyLevel || 'balanced',
      },
      additionalContext: input.additionalContext || ''
    }
  );

  if (error) {
    logger.error('[AI/API] generate-blueprint error', error);
    throw new Error(error);
  }

  if (!data) {
    throw new Error('No data returned from generate-blueprint');
  }

  // Blueprint generated successfully
  return data;
};

// =============================================================================
// GENERATE GOAL OVERVIEW (Strategy + Critical Gaps)
// Lightweight, on-demand LLM call for Goal Overview tab
// =============================================================================

export interface GenerateGoalOverviewInput {
  goal: Goal;
  userProfile?: Partial<UserProfile>;
  additionalContext?: string;
}

export interface GenerateGoalOverviewOutput {
  strategyOverview: string;
  criticalGaps: string[];
  behaviorPlan?: BehaviorPlan;
}

export const generateGoalOverview = async (
  input: GenerateGoalOverviewInput
): Promise<GenerateGoalOverviewOutput> => {
  const { goal, userProfile, additionalContext } = input;

  const phases = goal.phases || [];
  const milestones = phases.flatMap(p => p.milestones || []);
  const completedMilestones = milestones.filter(m => m.isCompleted).length;
  const nextMilestones = milestones.filter(m => !m.isCompleted).slice(0, 3).map(m => m.title);

  const payload = {
    goal: {
      id: goal.id,
      title: goal.title,
      category: goal.category,
      timeline: goal.timeline,
      estimatedWeeks: goal.estimatedWeeks,
      status: goal.status,
      overallProgress: goal.overallProgress,
      currentPhaseIndex: goal.currentPhaseIndex,
      totals: {
        phases: phases.length,
        milestones: milestones.length,
        completedMilestones
      },
      nextMilestones,
      phases: phases.map(p => ({
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
    },
    userProfile: {
      role: userProfile?.role || '',
      bio: userProfile?.bio || '',
      chronotype: userProfile?.chronotype || 'flexible',
      energyLevel: userProfile?.energyLevel || 'balanced',
    },
    additionalContext: additionalContext || ''
  };

  const { data, error } = await callEdgeFunction<GenerateGoalOverviewOutput>(
    'generate-goal-overview',
    payload
  );

  if (error) {
    logger.error('[AI/API] generate-goal-overview error', error);
    throw new Error(error);
  }

  if (!data) {
    throw new Error('No data returned from generate-goal-overview');
  }

  return {
    strategyOverview: data.strategyOverview || '',
    criticalGaps: Array.isArray(data.criticalGaps) ? data.criticalGaps : [],
    behaviorPlan: data.behaviorPlan && typeof data.behaviorPlan === 'object'
      ? (data.behaviorPlan as BehaviorPlan)
      : undefined,
  };
};

// =============================================================================
// GENERATE FULL PLAN (Combined Blueprint + Roadmap)
// Single call for complete plan generation
// =============================================================================

export interface FullPlanGoal {
  goalTitle: string;
  goalArchetype?: 'HABIT_BUILDING' | 'DEEP_WORK_PROJECT' | 'SKILL_ACQUISITION' | 'MAINTENANCE';
  category: string;
  timeline: string;
  estimatedWeeks: number;
  strategyOverview: string;
  criticalGaps: string[];
  behaviorPlan?: BehaviorPlan;
  priorityWeight?: number;
  riskLevel?: 'low' | 'medium' | 'high';
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
        description?: string;
        order: number;
        estimatedMinutes?: number;
        difficulty?: 1 | 2 | 3 | 4 | 5;
        cognitiveType?: 'deep_work' | 'shallow_work' | 'learning' | 'creative' | 'admin';
        subTasks: Array<{
          id: string;
          title: string;
          description?: string;
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

// Batch size for processing goals - keeps response quality high
const GOALS_PER_BATCH = 3;

// Progress callback type for UI updates
export type ProgressCallback = (message: string, percent: number) => void;

const roundToFive = (value: number): number => Math.round(value / 5) * 5;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 9973;
  }
  return hash;
};

const ARCHETYPE_DURATION_RANGES: Record<string, { min: number; max: number; fallback: number }> = {
  HABIT_BUILDING: { min: 20, max: 70, fallback: 35 },
  DEEP_WORK_PROJECT: { min: 45, max: 140, fallback: 85 },
  SKILL_ACQUISITION: { min: 30, max: 100, fallback: 55 },
  MAINTENANCE: { min: 20, max: 75, fallback: 40 },
};

const ARCHETYPE_FREQUENCY_RANGES: Record<string, { min: number; max: number; fallback: number }> = {
  HABIT_BUILDING: { min: 4, max: 7, fallback: 5 },
  DEEP_WORK_PROJECT: { min: 2, max: 4, fallback: 3 },
  SKILL_ACQUISITION: { min: 3, max: 6, fallback: 4 },
  MAINTENANCE: { min: 1, max: 4, fallback: 2 },
};

const summarizeGoalTaskStats = (goal: any): {
  estimatedCount: number;
  averageEstimatedMinutes: number;
  averageDifficulty: number;
  taskCount: number;
} => {
  const tasks = (goal?.phases || []).flatMap((phase: any) =>
    (phase?.milestones || []).flatMap((milestone: any) => milestone?.tasks || [])
  );

  const taskCount = tasks.length;
  const estimatedValues = tasks
    .map((task: any) => Number(task?.estimatedMinutes))
    .filter((value: number) => Number.isFinite(value) && value > 0);
  const difficultyValues = tasks
    .map((task: any) => Number(task?.difficulty))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  const averageEstimatedMinutes = estimatedValues.length > 0
    ? estimatedValues.reduce((sum: number, value: number) => sum + value, 0) / estimatedValues.length
    : 0;

  const averageDifficulty = difficultyValues.length > 0
    ? difficultyValues.reduce((sum: number, value: number) => sum + value, 0) / difficultyValues.length
    : 0;

  return {
    estimatedCount: estimatedValues.length,
    averageEstimatedMinutes,
    averageDifficulty,
    taskCount,
  };
};

const normalizeSuggestedSchedule = (goal: any): FullPlanGoal['suggestedSchedule'] => {
  const archetype = goal?.goalArchetype || 'SKILL_ACQUISITION';
  const durationRange = ARCHETYPE_DURATION_RANGES[archetype] || ARCHETYPE_DURATION_RANGES.SKILL_ACQUISITION;
  const frequencyRange = ARCHETYPE_FREQUENCY_RANGES[archetype] || ARCHETYPE_FREQUENCY_RANGES.SKILL_ACQUISITION;
  const taskStats = summarizeGoalTaskStats(goal);

  const aiDuration = Number(goal?.suggestedSchedule?.duration);
  const aiFrequency = Number(goal?.suggestedSchedule?.frequency);

  // Blend AI suggestion with deterministic task-derived prior to avoid blanket 60m outputs.
  const deterministicDuration = taskStats.averageEstimatedMinutes > 0
    ? taskStats.averageEstimatedMinutes
    : durationRange.fallback;
  const durationSeed = hashString(`${goal?.goalTitle || 'goal'}:${taskStats.taskCount}`) % 11 - 5;
  const blendedDuration = Number.isFinite(aiDuration)
    ? (aiDuration * 0.55) + (deterministicDuration * 0.45)
    : deterministicDuration;
  const adjustedDuration = roundToFive(
    clamp(
      blendedDuration + durationSeed,
      durationRange.min,
      durationRange.max
    )
  );

  const frequencySeed = hashString(`${goal?.goalTitle || 'goal'}:freq`) % 3 - 1;
  const difficultyAdjustment = taskStats.averageDifficulty >= 4 ? -1 : taskStats.averageDifficulty <= 2 && taskStats.taskCount >= 8 ? 1 : 0;
  const blendedFrequency = Number.isFinite(aiFrequency)
    ? Math.round((aiFrequency * 0.6) + (frequencyRange.fallback * 0.4))
    : frequencyRange.fallback;
  const adjustedFrequency = clamp(
    blendedFrequency + frequencySeed + difficultyAdjustment,
    frequencyRange.min,
    frequencyRange.max
  );

  const preferredTime = goal?.suggestedSchedule?.preferredTime && ['morning', 'afternoon', 'evening'].includes(goal.suggestedSchedule.preferredTime)
    ? goal.suggestedSchedule.preferredTime
    : (archetype === 'DEEP_WORK_PROJECT' || archetype === 'SKILL_ACQUISITION' ? 'morning' : 'afternoon');

  const energyCost = goal?.suggestedSchedule?.energyCost && ['high', 'medium', 'low'].includes(goal.suggestedSchedule.energyCost)
    ? goal.suggestedSchedule.energyCost
    : (archetype === 'DEEP_WORK_PROJECT' ? 'high' : archetype === 'MAINTENANCE' ? 'low' : 'medium');

  return {
    frequency: adjustedFrequency,
    duration: adjustedDuration,
    preferredTime,
    energyCost,
  };
};

// Helper to transform a single goal from blueprint response
const transformGoalFromBlueprint = (goal: any): FullPlanGoal => {
  // DEBUG: Log raw AI response structure
  // Transforming raw goal

  const transformedGoal: FullPlanGoal = {
    goalTitle: goal.goalTitle,
    goalArchetype: goal.goalArchetype,
    category: goal.category || 'personal',
    timeline: goal.timeline,
    estimatedWeeks: typeof goal.estimatedWeeks === 'number' && Number.isFinite(goal.estimatedWeeks)
      ? goal.estimatedWeeks
      : parseInt(goal.timeline) || 24,
    strategyOverview: goal.strategyOverview || '',
    criticalGaps: Array.isArray(goal.criticalGaps) ? goal.criticalGaps : [],
    behaviorPlan: goal.behaviorPlan || undefined,
    priorityWeight: typeof goal.priorityWeight === 'number' ? goal.priorityWeight : undefined,
    riskLevel: goal.riskLevel || undefined,
    suggestedSchedule: normalizeSuggestedSchedule(goal),
    phases: (goal.phases || []).map((phase: any) => {
      // Processing phase milestones

      return {
        number: phase.number,
        title: phase.title,
        description: phase.description,
        startWeek: phase.startWeek,
        endWeek: phase.endWeek,
        focus: phase.focus || [],
        coachAdvice: phase.coachAdvice || '',
        milestones: (phase.milestones || []).map((m: any, mIdx: number) => {
          // DEBUG: Log what's available on the milestone
          // Processing milestone tasks

          const taskItems = m.tasks || [];
          // Using task items for milestone

          const transformedMilestone = {
            id: `milestone-${phase.number}-${mIdx + 1}`,
            title: m.title,
            description: m.description,
            targetWeek: m.targetWeek,
            tasks: taskItems.map((t: any, tIdx: number) => {
              // DEBUG: Log each task's subtasks
              // Processing task subtasks

              return {
                id: `task-${phase.number}-${mIdx + 1}-${tIdx + 1}`,
                title: t.title,
                description: t.description,
                order: t.order || tIdx + 1,
                estimatedMinutes: typeof t.estimatedMinutes === 'number' ? t.estimatedMinutes : undefined,
                difficulty: typeof t.difficulty === 'number'
                  ? (Math.min(5, Math.max(1, Math.round(t.difficulty))) as 1 | 2 | 3 | 4 | 5)
                  : undefined,
                cognitiveType: typeof t.cognitiveType === 'string'
                  ? t.cognitiveType
                  : undefined,
                subTasks: (t.subTasks || []).map((st: any, stIdx: number) => ({
                  id: `subtask-${phase.number}-${mIdx + 1}-${tIdx + 1}-${stIdx + 1}`,
                  title: st.title,
                  description: st.description,
                  order: st.order || stIdx + 1,
                }))
              };
            })
          };

          // DEBUG: Summary for this milestone
          const totalSubtasks = transformedMilestone.tasks.reduce((sum, t) => sum + t.subTasks.length, 0);
          // Milestone transformation complete

          return transformedMilestone;
        })
      };
    })
  };

  return transformedGoal;
};


export const generateFullPlan = async (
  input: GenerateBlueprintInput,
  onProgress?: ProgressCallback
): Promise<FullPlanResponse> => {
  const { goalContexts } = input;
  const totalGoals = goalContexts.length;

  // If 3 or fewer goals, process in a single call
  // Don't set fixed progress - let the Loader's auto-progress handle it
  // We only update subtitle for UX feedback
  if (totalGoals <= GOALS_PER_BATCH) {
    // Don't set a fixed percent - let auto-progress work
    // Only update the subtitle to show current step
    onProgress?.('Analyzing your goals and creating phases...', -1); // -1 means don't override progress

    const blueprintResult = await generateBlueprint(input);

    if (!blueprintResult.goals || blueprintResult.goals.length === 0) {
      logger.warn('[AI/API] No goals returned from blueprint', { response: blueprintResult });
      throw new Error('No goals returned from blueprint generation. Please try again.');
    }

    onProgress?.('Building milestones and tasks...', -1);

    const goals = blueprintResult.goals.map(transformGoalFromBlueprint);
    if (goals.length !== totalGoals) {
      throw new Error(
        `Blueprint response count mismatch. Expected ${totalGoals} goal(s), received ${goals.length}.`
      );
    }

    // Full plan transformation complete
    logger.info('Full plan transformation complete', {
      goalsCount: goals.length,
      firstGoalPhases: goals[0]?.phases?.length || 0,
      firstGoalMilestones: goals[0]?.phases?.[0]?.milestones?.length || 0,
    });

    return {
      goals,
      coachingSummary: `Your personalized plan includes ${goals.length} goals with detailed phases and milestones.`
    };
  }

  // BATCH PROCESSING: Split goals into batches of 3 for quality
  const batches: typeof goalContexts[] = [];
  for (let i = 0; i < totalGoals; i += GOALS_PER_BATCH) {
    batches.push(goalContexts.slice(i, i + GOALS_PER_BATCH));
  }

  // Processing goals in batches

  const allGoals: FullPlanGoal[] = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const startIdx = batchIndex * GOALS_PER_BATCH + 1;
    const endIdx = Math.min((batchIndex + 1) * GOALS_PER_BATCH, totalGoals);
    const progressPercent = Math.round(((batchIndex + 0.5) / batches.length) * 80) + 10;

    onProgress?.(`Creating blueprint for goals ${startIdx}-${endIdx} of ${totalGoals}...`, progressPercent);

    // Processing batch

    // Call generate-blueprint for this batch
    const batchResult = await generateBlueprint({
      ...input,
      goalContexts: batch
    });

    if (batchResult.goals && batchResult.goals.length > 0) {
      const batchGoals = batchResult.goals.map(transformGoalFromBlueprint);
      if (batchGoals.length !== batch.length) {
        throw new Error(
          `Blueprint batch mismatch for goals ${startIdx}-${endIdx}. Expected ${batch.length}, received ${batchGoals.length}.`
        );
      }
      allGoals.push(...batchGoals);
      // Batch processing complete
    } else {
      logger.warn('[AI/API] Batch returned no goals, retrying', { batchIndex: batchIndex + 1 });
      // Retry once if batch fails
      const retryResult = await generateBlueprint({
        ...input,
        goalContexts: batch
      });
      if (retryResult.goals && retryResult.goals.length > 0) {
        const retryGoals = retryResult.goals.map(transformGoalFromBlueprint);
        if (retryGoals.length !== batch.length) {
          throw new Error(
            `Blueprint retry mismatch for goals ${startIdx}-${endIdx}. Expected ${batch.length}, received ${retryGoals.length}.`
          );
        }
        allGoals.push(...retryGoals);
      } else {
        throw new Error(
          `Failed to generate blueprint for goals ${startIdx}-${endIdx} after retry.`
        );
      }
    }
  }

  onProgress?.('Finalizing your complete roadmap...', 95);

  // generateFullPlan batch processing complete

  if (allGoals.length === 0) {
    throw new Error('Failed to generate blueprints. Please try again with fewer goals.');
  }

  return {
    goals: allGoals,
    coachingSummary: `Your personalized plan includes ${allGoals.length} goals with detailed phases and milestones.`
  };
};

// =============================================================================
// DAILY QUOTE
// =============================================================================

export const getDailyQuote = async (): Promise<{ quote: string; author: string }> => {
  const { data, error } = await callEdgeFunction<{ quote: string; author: string }>(
    'daily-quote',
    {}
  );

  if (error) {
    logger.error('[AI/API] daily-quote error', error);
    // Return a fallback quote
    return {
      quote: "The only way to do great work is to love what you do.",
      author: "Steve Jobs"
    };
  }

  return data || { quote: "Stay focused and keep pushing.", author: "Unknown" };
};

// =============================================================================
// REFINE PHASE
// =============================================================================

interface RefinePhaseInput {
  phaseId: string;
  goalTitle: string;
  phaseTitle: string;
  currentMilestones: string[];
  userFeedback: string;
}

export const refinePhase = async (
  input: RefinePhaseInput
): Promise<{ milestones: Array<{ title: string; description: string }> }> => {
  const { data, error } = await callEdgeFunction<{ milestones: Array<{ title: string; description: string }> }>(
    'refine-phase',
    input
  );

  if (error) {
    logger.error('[AI/API] refine-phase error', error);
    throw new Error(error);
  }

  if (!data) {
    throw new Error('No data returned from refine-phase');
  }

  return data;
};

// =============================================================================
// GENERATE GOAL SCHEDULE
// Input: Goal with phases/milestones + user constraints
// Output: Calendar events for the entire goal
// =============================================================================

import type { Goal, TimeConstraints } from '../../types';
import type { CalendarEvent } from '../../constants/calendarTypes';

export interface GenerateGoalScheduleInput {
  profile: Partial<UserProfile>;
  goal: Goal;
  constraints?: TimeConstraints;
  existingEvents?: CalendarEvent[];
  startDate?: Date;
}

export interface GenerateGoalScheduleOutput {
  events: CalendarEvent[];
  reasoning: string;
}

export const generateGoalSchedule = async (
  input: GenerateGoalScheduleInput
): Promise<GenerateGoalScheduleOutput> => {
  const { goal, constraints, existingEvents = [], startDate = new Date() } = input;

  // Calling generate-schedule Edge Function

  // Get user's timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Transform constraints to the format expected by Edge Function
  // Include all fields the user set during onboarding
  const userConstraints = constraints ? {
    workBlocks: (constraints.workBlocks || []).map(b => ({
      title: b.title || 'Work Hours',
      // TimeBlock days in dlulu are 0=Mon ... 6=Sun (universal indexing)
      days: b.days || [0, 1, 2, 3, 4], // Default weekdays (Mon-Fri)
      start: b.start || '09:00',
      end: b.end || '17:00',
      weekPattern: b.weekPattern || 'default',
      timezone: b.timezone || undefined,
    })),
    sleepStart: constraints.sleepStart || '22:30',
    sleepEnd: constraints.sleepEnd || '06:30',
    peakStart: constraints.peakStart || '09:00',
    peakEnd: constraints.peakEnd || '12:00',
    blockedSlots: (constraints.blockedSlots || []).map(b => ({
      title: b.title || 'Blocked',
      days: b.days || [],
      start: b.start || '00:00',
      end: b.end || '00:00',
      weekPattern: b.weekPattern || 'default',
      timezone: b.timezone || undefined,
    })),
    timeExceptions: (constraints.timeExceptions || []).map(ex => ({
      date: ex.date,
      start: ex.start,
      end: ex.end,
      isBlocked: ex.isBlocked !== false,
      reason: ex.reason,
    })),
  } : null; // Pass null to let Edge Function fetch from DB

  // IMPORTANT: send startDate as a LOCAL calendar date (YYYY-MM-DD), not UTC date,
  // otherwise users in timezones ahead of UTC can get schedules starting a day early.
  const startDateLocal = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;

  const { data, error } = await callEdgeFunction<{
    events: any[];
    reasoning: string;
    totalSessions: number;
    totalMinutes: number;
    goalWeeks: number;
  }>(
    'generate-schedule',
    {
      goalId: goal.id,
      startDate: startDateLocal,
      timezone: userTimezone,
      userConstraints,
    }
  );

  if (error) {
    logger.error('[AI/API] generate-schedule error', error);
    throw new Error(error);
  }

  if (!data) {
    throw new Error('No data returned from generate-schedule');
  }

  // Schedule generated successfully

  // Transform Edge Function response to expected output format
  const events: CalendarEvent[] = (data.events || []).map((e: any) => ({
    id: e.id,
    summary: e.summary,
    title: e.summary,
    description: e.description,
    start: { dateTime: e.start_datetime, timeZone: userTimezone },
    end: { dateTime: e.end_datetime, timeZone: userTimezone },
    eventType: e.event_type,
    energyCost: e.energy_cost,
    goalId: e.goal_id,
    phaseId: e.phase_id,
    source: 'ambitionos',
    syncStatus: 'local_only',
  }));

  return {
    events,
    reasoning: data.reasoning || 'Schedule generated successfully',
  };
};
