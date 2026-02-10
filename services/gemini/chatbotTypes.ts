// =============================================================================
// CHATBOT TYPES
// Complete type definitions for chat API requests, responses, and actions
// =============================================================================

import type { Goal, Phase, Milestone, Task, SubTask, GoalCategory, BehaviorPlan } from '../../types';
import type { CalendarEvent } from '../../constants/calendarTypes';

// =============================================================================
// MESSAGE TYPES
// =============================================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;

    // Actions attached to this message
    actions?: ChatAction[];

    // For confirmation flows
    pendingConfirmation?: PendingConfirmation;

    // Error state
    isError?: boolean;
    errorMessage?: string;
}

export interface PendingConfirmation {
    action: ChatAction;
    confirmationPrompt: string;
    confirmed?: boolean;
    confirmedAt?: Date;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

export interface ChatSession {
    id: string;
    userId: string;
    title?: string;
    startedAt: Date;
    lastMessageAt: Date;
    messageCount: number;
    conversationState?: ConversationState;
    isActive: boolean;
}

export interface ConversationState {
    // Current conversation flow
    flow: 'goal_creation' | 'milestone_add' | 'schedule_build' | 'freeform' | null;
    step: number;

    // Data collected during multi-turn flows
    collectedData: Record<string, unknown>;

    // Pending action awaiting confirmation
    pendingConfirmation?: PendingConfirmation;
}

// =============================================================================
// ACTION TYPES - All 45 chatbot functions
// =============================================================================

export type ChatActionType =
    // Goal management (9)
    | 'create_goal'
    | 'update_goal'
    | 'pause_goal'
    | 'resume_goal'
    | 'complete_goal'
    | 'abandon_goal'
    | 'delete_goal'
    | 'get_goal_progress'
    | 'adjust_goal_timeline'
    // Phase management (7)
    | 'add_phase'
    | 'edit_phase'
    | 'reorder_phases'
    | 'delete_phase'
    | 'activate_phase'
    | 'complete_phase'
    | 'extend_phase'
    // Milestone management (6)
    | 'add_milestone'
    | 'edit_milestone'
    | 'complete_milestone'
    | 'uncomplete_milestone'
    | 'delete_milestone'
    | 'move_milestone'
    // Task management (4)
    | 'add_task'
    | 'edit_task'
    | 'complete_task'
    | 'delete_task'
    // Subtask management (8)
    | 'add_subtask'
    | 'add_subtasks_bulk'
    | 'edit_subtask'
    | 'complete_subtask'
    | 'uncomplete_subtask'
    | 'delete_subtask'
    | 'reorder_subtasks'
    | 'generate_subtasks'
    // Calendar management (9)
    | 'create_event'
    | 'edit_event'
    | 'delete_event'
    | 'reschedule_event'
    | 'skip_event'
    | 'complete_event'
    | 'build_schedule'
    | 'clear_schedule'
    | 'optimize_schedule'
    // Coaching (6)
    | 'get_daily_focus'
    | 'get_weekly_summary'
    | 'get_recommendations'
    | 'explain_roadmap'
    | 'compare_progress'
    | 'celebrate_achievement'
    // Other (1)
    | 'add_note';

// Supported action types (executor-aligned)
export const SUPPORTED_ACTION_TYPES: ChatActionType[] = [
    // Goals
    'create_goal',
    'update_goal',
    'pause_goal',
    'resume_goal',
    'complete_goal',
    'abandon_goal',
    'delete_goal',
    'get_goal_progress',
    'adjust_goal_timeline',
    // Phases
    'add_phase',
    'edit_phase',
    'delete_phase',
    'activate_phase',
    'complete_phase',
    // Milestones
    'add_milestone',
    'edit_milestone',
    'complete_milestone',
    'uncomplete_milestone',
    'delete_milestone',
    // Tasks
    'add_task',
    'edit_task',
    'complete_task',
    'delete_task',
    // Subtasks
    'add_subtask',
    'add_subtasks_bulk',
    'edit_subtask',
    'complete_subtask',
    'uncomplete_subtask',
    'delete_subtask',
    // Calendar
    'create_event',
    'edit_event',
    'delete_event',
    'reschedule_event',
    'skip_event',
    'complete_event',
    'build_schedule',
    'clear_schedule',
    'optimize_schedule',
    // Coaching
    'get_daily_focus',
    'get_weekly_summary',
    'get_recommendations',
    'explain_roadmap',
    'compare_progress',
    'celebrate_achievement',
    // Other
    'add_note',
];

export const isSupportedActionType = (actionType: ChatActionType): boolean =>
    SUPPORTED_ACTION_TYPES.includes(actionType);

export interface ChatAction {
    type: ChatActionType;
    status: 'pending' | 'pending_confirmation' | 'executing' | 'success' | 'failed' | 'cancelled';
    data: ActionData;
    requiresConfirmation: boolean;
    result?: ActionResult;
    error?: string;
}

// =============================================================================
// ACTION DATA - Input parameters for each action type
// =============================================================================

export type ActionData =
    | CreateGoalData
    | UpdateGoalData
    | PauseGoalData
    | ResumeGoalData
    | CompleteGoalData
    | AbandonGoalData
    | DeleteGoalData
    | GetGoalProgressData
    | AdjustGoalTimelineData
    | AddPhaseData
    | EditPhaseData
    | ReorderPhasesData
    | DeletePhaseData
    | ActivatePhaseData
    | CompletePhaseData
    | ExtendPhaseData
    | AddMilestoneData
    | EditMilestoneData
    | CompleteMilestoneData
    | UncompleteMilestoneData
    | DeleteMilestoneData
    | MoveMilestoneData
    | AddTaskData
    | EditTaskData
    | CompleteTaskData
    | DeleteTaskData
    | AddSubtaskData
    | AddSubtasksBulkData
    | EditSubtaskData
    | CompleteSubtaskData
    | UncompleteSubtaskData
    | DeleteSubtaskData
    | ReorderSubtasksData
    | GenerateSubtasksData
    | CreateEventData
    | EditEventData
    | DeleteEventData
    | RescheduleEventData
    | SkipEventData
    | CompleteEventData
    | BuildScheduleData
    | ClearScheduleData
    | OptimizeScheduleData
    | GetDailyFocusData
    | GetWeeklySummaryData
    | GetRecommendationsData
    | ExplainRoadmapData
    | CompareProgressData
    | CelebrateAchievementData
    | AddNoteData;

// ----- Goal Actions -----
export interface CreateGoalData {
    title: string;
    category: GoalCategory;
    timeline: string;
    frequency?: number;
    duration?: number;
    priorityWeight?: number;
    preferredTime?: 'morning' | 'afternoon' | 'evening' | 'flexible';
    energyCost?: 'high' | 'medium' | 'low';
    additionalContext?: string;
}

export interface UpdateGoalData {
    goalId: string;
    title?: string;
    status?: 'planning' | 'active' | 'paused' | 'completed' | 'abandoned';
    timeline?: string;
    frequency?: number;
    duration?: number;
    preferredTime?: 'morning' | 'afternoon' | 'evening' | 'flexible';
    energyCost?: 'high' | 'medium' | 'low';
    priorityWeight?: number;
    behaviorPlan?: BehaviorPlan;
    riskLevel?: 'low' | 'medium' | 'high';
    riskAcknowledgedAt?: string;
}

export interface PauseGoalData {
    goalId: string;
    reason?: string;
}

export interface ResumeGoalData {
    goalId: string;
}

export interface CompleteGoalData {
    goalId: string;
    celebrationNote?: string;
}

export interface AbandonGoalData {
    goalId: string;
    reason?: string;
}

export interface DeleteGoalData {
    goalId: string;
}

export interface GetGoalProgressData {
    goalId?: string;
    period: 'today' | 'week' | 'month' | 'all_time';
}

export interface AdjustGoalTimelineData {
    goalId: string;
    newEndDate: string;
    strategy?: 'extend_phases' | 'compress_phases' | 'add_buffer';
}

// ----- Phase Actions -----
export interface AddPhaseData {
    goalId: string;
    title: string;
    description?: string;
    estimatedWeeks?: number;
    focus?: string[];
    position?: number;
}

export interface EditPhaseData {
    phaseId: string;
    title?: string;
    description?: string;
    focus?: string[];
}

export interface ReorderPhasesData {
    goalId: string;
    phaseIds: string[];
}

export interface DeletePhaseData {
    phaseId: string;
}

export interface ActivatePhaseData {
    phaseId: string;
}

export interface CompletePhaseData {
    phaseId: string;
    notes?: string;
}

export interface ExtendPhaseData {
    phaseId: string;
    additionalWeeks: number;
    reason?: string;
}

// ----- Milestone Actions -----
export interface AddMilestoneData {
    phaseId: string;
    title: string;
    description?: string;
    targetWeek?: number;
}

export interface EditMilestoneData {
    milestoneId: string;
    title?: string;
    description?: string;
    targetWeek?: number;
}

export interface CompleteMilestoneData {
    milestoneId: string;
    notes?: string;
}

export interface UncompleteMilestoneData {
    milestoneId: string;
    reason?: string;
}

export interface DeleteMilestoneData {
    milestoneId: string;
}

export interface MoveMilestoneData {
    milestoneId: string;
    targetPhaseId: string;
}

// ----- Task Actions -----
export interface AddTaskData {
    milestoneId: string;
    title: string;
    description?: string;
    order?: number;
    startDay?: number;
    endDay?: number;
    durationDays?: number;
    timesPerWeek?: number;
}

export interface EditTaskData {
    taskId: string;
    title?: string;
    description?: string;
    order?: number;
    startDay?: number;
    endDay?: number;
    durationDays?: number;
    timesPerWeek?: number;
}

export interface CompleteTaskData {
    taskId: string;
}

export interface DeleteTaskData {
    taskId: string;
}

// ----- Subtask Actions -----
export interface AddSubtaskData {
    // taskId is required for the new 4-level hierarchy.
    // milestoneId is legacy fallback for older clients or ambiguity resolution.
    taskId?: string;
    milestoneId?: string;
    title: string;
    description?: string;
}

export interface AddSubtasksBulkData {
    // taskId is required for the new 4-level hierarchy.
    // milestoneId is legacy fallback for older clients or ambiguity resolution.
    taskId?: string;
    milestoneId?: string;
    tasks: { title: string; description?: string }[];
}

export interface EditSubtaskData {
    subtaskId: string;
    title?: string;
    description?: string;
}

export interface CompleteSubtaskData {
    subtaskId: string;
}

export interface UncompleteSubtaskData {
    subtaskId: string;
}

export interface DeleteSubtaskData {
    subtaskId: string;
}

export interface ReorderSubtasksData {
    taskId?: string;
    milestoneId?: string;
    subtaskIds: string[];
}

export interface GenerateSubtasksData {
    taskId?: string;
    milestoneId?: string;
    count?: number;
    context?: string;
}

// ----- Calendar Actions -----
export interface CreateEventData {
    title: string;
    date: string;  // YYYY-MM-DD
    startTime: string;  // HH:MM
    endTime?: string;
    goalId?: string;
    milestoneId?: string;
    description?: string;
}

export interface EditEventData {
    eventId: string;
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
}

export interface DeleteEventData {
    eventId: string;
}

export interface RescheduleEventData {
    eventId: string;
    newDate: string;
    newStartTime: string;
    reason?: string;
}

export interface SkipEventData {
    eventId: string;
    reason?: string;
    reschedule?: boolean;
}

export interface CompleteEventData {
    eventId: string;
    notes?: string;
    actualDuration?: number;
}

export interface BuildScheduleData {
    goalId: string;
    startDate?: string;
    weeksToSchedule?: number;
}

export interface ClearScheduleData {
    goalId: string;
}

export interface OptimizeScheduleData {
    goalId?: string;
    preferences?: string;
}

// ----- Coaching Actions -----
export interface GetDailyFocusData {
    date?: string;
}

export interface GetWeeklySummaryData {
    weekStart?: string;
}

export interface GetRecommendationsData {
    focus?: 'productivity' | 'stuck_goals' | 'time_management' | 'motivation' | 'planning';
}

export interface ExplainRoadmapData {
    goalId: string;
}

export interface CompareProgressData {
    goalId: string;
}

export interface CelebrateAchievementData {
    achievementType: 'milestone_completed' | 'phase_completed' | 'goal_completed' | 'streak' | 'personal_best';
    targetId?: string;
    message?: string;
}

// ----- Other Actions -----
export interface AddNoteData {
    targetType: 'goal' | 'milestone' | 'task' | 'subtask';
    targetId: string;
    note: string;
}

// =============================================================================
// ACTION RESULTS - Output from each action type
// =============================================================================

export interface ActionResult {
    success: boolean;
    targetType?: 'goal' | 'phase' | 'milestone' | 'task' | 'subtask' | 'event';
    targetId?: string;
    targetTitle?: string;

    // For create operations
    createdEntity?: Goal | Phase | Milestone | SubTask | CalendarEvent;

    // For preview operations
    preview?: GoalPreview | SchedulePreview | ProgressReport;

    // For coaching responses
    coachingResponse?: CoachingResponse;

    // Human-readable message
    message?: string;
}

export interface GoalPreview {
    goal: Partial<Goal>;
    phases: Partial<Phase>[];
    totalMilestones: number;
    totalSubtasks: number;
    estimatedCompletion: Date;
}

export interface SchedulePreview {
    events: Partial<CalendarEvent>[];
    totalSessions: number;
    weeklyHours: number;
    conflictsFound: number;
}

export interface ProgressReport {
    overallProgress: number;
    phaseProgress: { phaseId: string; title: string; progress: number }[];
    completedMilestones: number;
    totalMilestones: number;
    completedSubtasks: number;
    totalSubtasks: number;
    streakDays: number;
    behindSchedule: boolean;
    recommendations: string[];
}

export interface CoachingResponse {
    message: string;
    suggestions: string[];
    encouragement?: string;
    nextSteps?: string[];
}

// =============================================================================
// API REQUEST / RESPONSE
// =============================================================================

export interface ChatRequest {
    message: string;
    sessionId?: string;
    systemContext: string;
    conversationHistory: { role: 'user' | 'assistant'; content: string }[];
}

export interface ChatResponse {
    success: boolean;
    data?: {
        message: string;
        actions: ChatAction[];
        sessionId?: string;
        metadata?: {
            latencyMs: number;
            actionsCount: number;
            requiresConfirmation: boolean;
        };
    };
    error?: {
        code: string;
        message: string;
    };
}

// =============================================================================
// CONTEXT BUILDING
// =============================================================================

export interface ChatbotContext {
    user: {
        id: string;
        name: string;
        chronotype?: string;
        workStyle?: string;
        energyLevel?: string;
    };

    goals: {
        id: string;
        title: string;
        status: string;
        progress: number;
        currentPhase: string;
        nextMilestone: string;
        upcomingTaskCount: number;
    }[];

    todayEvents: {
        id: string;
        title: string;
        time: string;
        goalTitle?: string;
        status: string;
    }[];

    recentActivity: {
        type: string;
        description: string;
        timestamp: Date;
    }[];

    currentDate: string;
    currentTime: string;
    dayOfWeek: string;
}

// =============================================================================
// ACTION EXECUTION HANDLERS
// =============================================================================

export interface ActionHandlers {
    // Goals
    createGoal: (data: CreateGoalData) => Promise<Goal | null>;
    updateGoal: (goalId: string, updates: Partial<Goal>) => Promise<void>;
    deleteGoal: (goalId: string) => Promise<void>;

    // Phases
    createPhase: (goalId: string, phase: Partial<Phase>) => Promise<Phase | null>;
    updatePhase: (phaseId: string, updates: Partial<Phase>) => Promise<void>;
    deletePhase: (phaseId: string) => Promise<void>;

    // Milestones
    createMilestone: (phaseId: string, goalId: string, milestone: Partial<Milestone>) => Promise<Milestone | null>;
    updateMilestone: (milestoneId: string, updates: Partial<Milestone>) => Promise<void>;
    toggleMilestone: (milestoneId: string) => Promise<void>;
    deleteMilestone: (milestoneId: string) => Promise<void>;

    // Tasks
    createTask: (milestoneId: string, task: Partial<Task>) => Promise<Task | null>;
    updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
    toggleTask: (taskId: string) => Promise<void>;
    deleteTask: (taskId: string) => Promise<void>;

    // Subtasks
    createSubTask: (taskId: string, title: string) => Promise<SubTask | null>;
    updateSubTask: (subtaskId: string, updates: Partial<SubTask>) => Promise<void>;
    toggleSubTask: (subtaskId: string) => Promise<void>;
    deleteSubTask: (subtaskId: string) => Promise<void>;

    // Events
    createEvent: (event: Partial<CalendarEvent>) => Promise<CalendarEvent | null>;
    updateEvent: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void>;
    deleteEvent: (eventId: string) => Promise<void>;

    // Refresh
    refreshGoals: () => Promise<void>;
    refreshEvents: () => Promise<void>;
}

// =============================================================================
// CONFIRMATION FLOW
// =============================================================================

export const ACTIONS_REQUIRING_CONFIRMATION: ChatActionType[] = [
    'create_goal',       // Preview roadmap first
    'delete_goal',       // Destructive
    'abandon_goal',      // Destructive
    'delete_phase',      // Destructive
    'delete_milestone',  // Destructive
    'build_schedule',    // Preview schedule
    'clear_schedule',    // Destructive
    'optimize_schedule', // Preview changes
    'adjust_goal_timeline', // Show impact
];

export function requiresConfirmation(actionType: ChatActionType): boolean {
    return ACTIONS_REQUIRING_CONFIRMATION.includes(actionType);
}
