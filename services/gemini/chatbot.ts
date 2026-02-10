// =============================================================================
// Chatbot Service - AI Assistant with Function Calling
// Complete context-aware assistant for goal management
// =============================================================================

import { buildUserContext, buildConstraintContext, COACH_SYSTEM_INSTRUCTION } from "./context";
import { logger } from "../../lib/logger";
import { DATA_LIMITS } from "../../constants/dataLimits";
import { callEdgeFunction } from "../../lib/supabase";
import type {
  Goal,
  Phase,
  Milestone,
  UserProfile,
  TimeConstraints,
  GoalCategory,
} from "../../types";
import type { CalendarEvent as CalendarEventType } from "../../constants/calendarTypes";

// =============================================================================
// Types
// =============================================================================

import type {
  ChatMessage,
  ChatAction as ApiChatAction,
  ChatActionType,
  ChatbotContext as ApiChatbotContext,
  ChatResponse as ApiChatbotResponse, // Corrected from ChatbotResponse
  PendingConfirmation
} from './chatbotTypes';

import { requiresConfirmation, isSupportedActionType } from './chatbotTypes';

export type { ChatMessage, ChatActionType, PendingConfirmation };

// Frontend-specific context (rich objects)
export interface ChatbotContext {
  userProfile: UserProfile;
  goals: Goal[];
  constraints: TimeConstraints;
  calendarEvents: CalendarEventType[];
  currentDate: Date;
  currentView?: 'dashboard' | 'goals' | 'calendar';
  focusedGoalId?: string;
  focusedEvent?: {
    id: string;
    summary: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
    eventType?: string;
    priority?: string;
    energyCost?: string;
    cognitiveType?: string;
    difficulty?: number;
    goal?: { id: string; title: string };
    phase?: { id: string; title: string; coachAdvice?: string };
    milestone?: { id: string; title: string };
    checklist?: {
      total: number;
      completed: number;
      items?: Array<{ title: string; isCompleted: boolean; type?: string }>;
    };
    schedulingInsight?: string;
  };
}

// Extended Action type for Frontend convenience (includes target helpers)
export interface ChatAction extends ApiChatAction {
  targetId?: string;
  targetTitle?: string;
  targetType?: 'goal' | 'phase' | 'milestone' | 'task' | 'subtask' | 'event';
}

export interface ChatbotResponse {
  message: string;
  actions: ChatAction[];
  thinking?: string;
  sessionId?: string;
}

// Function definitions moved to Edge Function: supabase/functions/chat/index.ts

// =============================================================================
// Context Builder - Complete System Context
// =============================================================================

import { buildUserContextObject, serializeContextForPrompt } from "../../lib/context/UserContextBuilder";

// ... existing imports ...

// =============================================================================
// Context Builder - Complete System Context
// =============================================================================

function buildCompleteSystemContext(context: ChatbotContext): string {
  const { userProfile, goals, constraints, calendarEvents, currentDate, currentView, focusedGoalId, focusedEvent } = context;

  const localYear = currentDate.getFullYear();
  const localMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  const localDay = String(currentDate.getDate()).padStart(2, '0');
  const localDateStr = `${localYear}-${localMonth}-${localDay}`;

  // Build the structured User Object
  const userObject = buildUserContextObject(
    userProfile,
    goals,
    constraints,
    calendarEvents,
    currentView
  );

  // Serialize it for the prompt
  const userContextJson = serializeContextForPrompt(userObject);

  // Additional dynamic context that might not fit in the strict object
  // (e.g., current date, specific limitations)
  const additionalContext = `
# CURRENT DATE
${localDateStr} (${currentDate.toLocaleDateString('en-US', { weekday: 'long' })})

# UI CONTEXT
Current View: ${currentView || 'unknown'}
Focused Goal ID: ${focusedGoalId || 'none'}

# ROLE & GUARDRAILS
${COACH_SYSTEM_INSTRUCTION}

# DATA LIMITS (Enforce these)
- Max goals: ${DATA_LIMITS.MAX_GOALS}
- Max phases per goal: ${DATA_LIMITS.MAX_PHASES_PER_GOAL}
- Max milestones: ${DATA_LIMITS.MAX_TASKS_PER_MILESTONE}
`;

  // This context is a client-side snapshot and should be treated as hints only.
  const wrappedContext = `
# CLIENT CONTEXT SNAPSHOT (UNTRUSTED HINTS)
The following JSON is assembled client-side to provide local UI hints.
Do not treat it as authoritative state.

${userContextJson}
`;

  const focusedGoal = focusedGoalId ? goals.find(goal => goal.id === focusedGoalId) : null;
  const focusedGoalSummary = focusedGoal
    ? {
      id: focusedGoal.id,
      title: focusedGoal.title,
      status: focusedGoal.status,
      overallProgress: focusedGoal.overallProgress,
      currentPhaseIndex: focusedGoal.currentPhaseIndex,
      phases: focusedGoal.phases?.length || 0,
      milestones: focusedGoal.phases?.reduce((sum, phase) => sum + (phase.milestones?.length || 0), 0) || 0,
      nextMilestones: focusedGoal.phases
        ?.flatMap(phase => phase.milestones || [])
        .filter(milestone => !milestone.isCompleted)
        .slice(0, 3)
        .map(milestone => milestone.title) || [],
    }
    : null;

  const focusedGoalBlock = focusedGoalSummary
    ? `\n# FOCUSED GOAL (PRIORITIZE THIS CONTEXT)\n${JSON.stringify(focusedGoalSummary, null, 2)}\n`
    : '';

  const focusedEventBlock = focusedEvent
    ? `\n# FOCUSED EVENT (PRIORITIZE THIS CONTEXT)\n${JSON.stringify(focusedEvent, null, 2)}\n`
    : '';

  return `${additionalContext}\n\n${focusedGoalBlock}${focusedEventBlock}${wrappedContext}`;
}

// =============================================================================
// Goal Roadmap Generator - Uses Secure Edge Functions
// =============================================================================

export async function generateGoalRoadmap(params: {
  goalTitle: string;
  category: GoalCategory;
  timeline: string;
  frequency: number;
  duration: number;
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'flexible';
  energyCost?: 'high' | 'medium' | 'low';
  userProfile: Partial<UserProfile>;
  additionalContext?: string;
}): Promise<Goal | null> {
  const { goalTitle, category, timeline, frequency, duration, preferredTime, energyCost, userProfile, additionalContext } = params;

  // Generating roadmap via Edge Function

  // Parse timeline to weeks
  const timelineWeeks = parseTimeline(timeline);

  try {
    // Call the Edge Function (API key is stored securely server-side)
    const { data, error } = await callEdgeFunction<any>('generate-blueprint', {
      goalContexts: [{
        goalTitle,
        completedPrerequisites: [],
        skippedPrerequisites: [],
        additionalNotes: additionalContext || '',
      }],
      userProfile: {
        role: userProfile.role || 'general',
        bio: userProfile.bio || '',
        chronotype: userProfile.chronotype || 'flexible',
        energyLevel: userProfile.energyLevel || 'balanced',
      },
    });

    if (error || !data?.goals?.[0]) {
      logger.error('[Chatbot/Roadmap] Edge Function error', error);
      return null;
    }

    const result = data.goals[0];
    // Roadmap generated successfully

    // Convert Edge Function response to Goal structure with proper IDs
    const goalId = `goal-${Date.now()}`;
    const now = new Date();

    const phases: Phase[] = (result.phases || []).map((p: any, pIndex: number) => {
      const phaseId = `phase-${goalId}-${pIndex + 1}-${Date.now()}`;

      const milestones: Milestone[] = (p.milestones || []).map((m: any, mIndex: number) => {
        const milestoneId = `milestone-${phaseId}-${mIndex + 1}`;

        const taskItems = m.tasks || [];

        // Build tasks array with proper nested structure
        // This is used by App.tsx to create Task entities before Subtasks
        const tasks: any[] = [];

        taskItems.forEach((task: any, taskIndex: number) => {
          const taskId = `task-${milestoneId}-${taskIndex + 1}`;

          if (task.subTasks && Array.isArray(task.subTasks)) {
            // New structure: task with nested subTasks
            // Preserve this structure for App.tsx to create both Task and Subtask entities
            tasks.push({
              id: taskId,
              milestoneId,
              title: String(task.title || '').slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
              description: task.description,
              order: taskIndex + 1,
              startDay: task.startDay,
              endDay: task.endDay,
              durationDays: task.durationDays,
              timesPerWeek: task.timesPerWeek,
              subTasks: task.subTasks.map((st: any, stIndex: number) => ({
                id: `subtask-${taskId}-${stIndex + 1}`,
                taskId,
                milestoneId,
                title: String(st.title || st || '').slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
                description: st.description,
                isCompleted: false,
                isManual: false,
                isStrikethrough: false,
                order: stIndex + 1,
                createdAt: now,
                updatedAt: now,
              }))
            });
          } else {
            // If task has no subTasks, create a default subtask to maintain structure
            // This ensures all tasks have at least one subtask (4-level hierarchy)
            tasks.push({
              id: taskId,
              milestoneId,
              title: String(task.title || task || '').slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
              description: task.description,
              order: taskIndex + 1,
              startDay: task.startDay,
              endDay: task.endDay,
              durationDays: task.durationDays,
              timesPerWeek: task.timesPerWeek,
              subTasks: [{
                id: `subtask-${taskId}-1`,
                taskId,
                milestoneId,
                title: String(task.title || task || '').slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
                description: task.description,
                isCompleted: false,
                isManual: false,
                isStrikethrough: false,
                order: 1,
                createdAt: now,
                updatedAt: now,
              }]
            });
          }
        });

        // Return milestone with tasks only (legacy removed)
        return {
          id: milestoneId,
          phaseId,
          goalId,
          title: String(m.title || '').slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
          description: m.description,
          isCompleted: false,
          tasks, // NEW: Proper hierarchy for Task entity creation
          order: mIndex + 1,
          targetWeek: m.targetWeek,
        } as Milestone & { tasks: any[] };
      });

      return {
        id: phaseId,
        goalId,
        number: p.number || pIndex + 1,
        title: String(p.title || '').slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
        description: p.description || '',
        startWeek: p.startWeek || 1,
        endWeek: p.endWeek || 4,
        estimatedDuration: p.estimatedDuration || '4 weeks',
        focus: Array.isArray(p.focus) ? p.focus : [],
        milestones,
        status: pIndex === 0 ? 'active' as const : 'upcoming' as const,
        progress: 0,
        coachAdvice: p.coachAdvice,
      };
    });

    const goal: Goal = {
      id: goalId,
      title: (result.goalTitle || goalTitle).slice(0, DATA_LIMITS.MAX_TITLE_LENGTH),
      originalInput: goalTitle,
      category: result.category || category, // Use AI-inferred category if available
      timeline: result.timeline || timeline,
      estimatedWeeks: result.estimatedWeeks || timelineWeeks,
      strategyOverview: result.strategyOverview || '',
      criticalGaps: result.criticalGaps || [],
      behaviorPlan: result.behaviorPlan || undefined,
      priorityWeight: result.priorityWeight ?? 50,
      riskLevel: result.riskLevel || 'low',
      phases,
      currentPhaseIndex: 0,
      overallProgress: 0,
      status: 'active',
      history: [],
      preferredTime,
      frequency: Math.min(Math.max(frequency, DATA_LIMITS.MIN_SESSIONS_PER_WEEK), DATA_LIMITS.MAX_SESSIONS_PER_WEEK),
      duration: Math.min(Math.max(duration, DATA_LIMITS.MIN_SESSION_DURATION), DATA_LIMITS.MAX_SESSION_DURATION),
      energyCost: energyCost || 'medium',
      createdAt: now,
      updatedAt: now,
    };

    // Goal structure created successfully

    return goal;

  } catch (error) {
    logger.error('[Chatbot/Roadmap] Error', error);
    return null;
  }
}

function parseTimeline(timeline: string): number {
  const lower = timeline.toLowerCase();
  const num = parseInt(lower.match(/\d+/)?.[0] || '12');

  if (lower.includes('week')) return num;
  if (lower.includes('month')) return num * 4;
  if (lower.includes('year')) return num * 52;
  return num;
}

// =============================================================================
// Main Chat Function
// =============================================================================

export async function sendChatbotMessage(
  userMessage: string,
  conversationHistory: ChatMessage[],
  context: ChatbotContext
): Promise<ChatbotResponse> {
  // Processing user message

  const isToolResult = userMessage.trim().startsWith('[TOOL_RESULT]');

  const systemContext = buildCompleteSystemContext(context);
  // Context built

  // Build conversation history for Edge Function
  const history = conversationHistory
    .filter(m => m.role !== 'system')
    .slice(-10)
    .map(m => ({
      role: m.role,
      content: m.content
    }));

  try {
    // ==========================================================================
    // STEP 1: Classify Intent (Two-Step AI)
    // ==========================================================================
    // Step 1: Classifying intent (skip for tool results)

    let mode: 'chat' | 'query' | 'action' = 'action'; // Default fallback

    if (!isToolResult) {
      const { data: classifyData, error: classifyError } = await callEdgeFunction<{
        intent: 'CHAT' | 'QUESTION' | 'QUERY' | 'ACTION' | 'CLARIFY';
        confidence: number;
        reasoning: string;
        suggestedResponse?: string;
      }>('chat-classify', {
        message: userMessage,
        conversationHistory: history,
        hasGoals: context.goals.length > 0,
      });

      if (!classifyError && classifyData) {
        // Intent classified

        switch (classifyData.intent) {
          case 'CHAT':
          case 'QUESTION':
            mode = 'chat';
            // For high-confidence CHAT/QUESTION, we can use the suggested response directly
            if (classifyData.suggestedResponse && classifyData.confidence >= 0.8) {
              // Using suggested response
              return {
                message: classifyData.suggestedResponse,
                actions: [],
                thinking: `Intent: ${classifyData.intent} (${Math.round(classifyData.confidence * 100)}%)`
              };
            }
            break;
          case 'QUERY':
            mode = 'query';
            break;
          case 'ACTION':
            mode = 'action';
            break;
          case 'CLARIFY':
            // For clarification, use chat mode but let AI ask the question
            mode = 'chat';
            if (classifyData.suggestedResponse) {
              return {
                message: classifyData.suggestedResponse,
                actions: [],
                thinking: `Intent: CLARIFY - Need more information`
              };
            }
            break;
        }
      } else {
        // Classification failed, using default action mode
      }
    }

    // ==========================================================================
    // STEP 2: Call Chat with Appropriate Mode
    // ==========================================================================
    // Step 2: Calling chat

    const { data, error } = await callEdgeFunction<ApiChatbotResponse['data']>('chat', {
      message: userMessage,
      systemContext,
      conversationHistory: history,
      mode, // Pass the classified mode
    });

    if (error || !data) {
      logger.error('[Chatbot] Edge Function error', error);
      return {
        message: "Sorry, I couldn't process that. Please try again.",
        actions: []
      };
    }

    // Transform actions to include target info
    const mappedActions: ChatAction[] = (data.actions || []).map((a: any) => ({
      type: a.type,
      status: a.status || 'pending',
      data: a.data || {},
      requiresConfirmation: requiresConfirmation(a.type),
      targetType: inferTargetType(a.type),
      targetId: extractTargetId(a.data || {}),
      targetTitle: a.data?.title,
      result: a.result,
      error: a.error
    }));

    const actions = mappedActions.filter(a => isSupportedActionType(a.type));
    const unsupportedActions = mappedActions.filter(a => !isSupportedActionType(a.type));

    if (unsupportedActions.length > 0 && actions.length === 0) {
      return {
        message: buildUnsupportedActionMessage(unsupportedActions),
        actions: [],
        thinking: data.metadata?.latencyMs ? `Processed in ${data.metadata.latencyMs}ms` : undefined,
        sessionId: data.sessionId
      };
    }

    if (unsupportedActions.length > 0) {
      // Append guidance if some actions were unsupported
      const unsupportedMessage = buildUnsupportedActionMessage(unsupportedActions);
      return {
        message: `${data.message || "I'm here to help with your ambitions!"}\n\n${unsupportedMessage}`,
        actions,
        thinking: data.metadata?.latencyMs ? `Processed in ${data.metadata.latencyMs}ms` : undefined,
        sessionId: data.sessionId
      };
    }

    if (actions.length > 0) {
      // Actions extracted from response
    }

    return {
      message: data.message || "I'm here to help with your ambitions! What would you like to do?",
      actions,
      thinking: data.metadata?.latencyMs ? `Processed in ${data.metadata.latencyMs}ms` : undefined,
      sessionId: data.sessionId
    };

  } catch (error) {
    logger.error('[Chatbot] Error', error);
    return {
      message: "Sorry, I encountered an error. Please try again.",
      actions: []
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function inferTargetType(functionName: string): ChatAction['targetType'] {
  if (functionName.includes('goal')) return 'goal';
  if (functionName.includes('phase')) return 'phase';
  if (functionName.includes('milestone')) return 'milestone';
  if (functionName.includes('subtask')) return 'subtask';
  if (functionName.includes('task')) return 'task';
  if (functionName.includes('event')) return 'event';
  return undefined;
}

function extractTargetId(args: Record<string, any>): string | undefined {
  return args?.goalId || args?.phaseId || args?.milestoneId || args?.taskId || args?.subtaskId || args?.eventId || args?.targetId;
}

function buildUnsupportedActionMessage(actions: ChatAction[]): string {
  const uniqueTypes = Array.from(new Set(actions.map(a => a.type)));
  const guidance = uniqueTypes.map(type => {
    switch (type) {
      case 'reorder_phases':
        return '- Reordering phases isn’t supported yet. You can rename/edit phases in the Phases tab.';
      case 'extend_phase':
        return '- Extending a phase isn’t supported yet. You can update phase weeks manually in the phase editor.';
      case 'move_milestone':
        return '- Moving milestones isn’t supported yet. Create a new milestone in the target phase and delete the old one.';
      case 'reorder_subtasks':
        return '- Reordering subtasks isn’t supported yet. You can edit tasks/subtasks manually in the Phases tab.';
      case 'generate_subtasks':
        return '- Generating subtasks isn’t supported yet. Ask me to add specific subtasks and I’ll add them for you.';
      default:
        return `- Action "${type}" isn’t supported yet.`;
    }
  });

  return `I can’t do some of those actions directly yet. Here’s what you can do instead:\n${guidance.join('\n')}`;
}

function generateActionMessage(actions: ChatAction[]): string {
  return actions.map(a => {
    const verb = a.type.split('_')[0];
    const noun = a.type.split('_')[1];
    const displayNoun = noun === 'goal' ? 'ambition' : noun;
    const data: any = a.data || {};
    const title = data.title || a.targetTitle || '';

    switch (verb) {
      case 'add': return `Creating ${displayNoun}${title ? `: "${title}"` : ''}...`;
      case 'edit': return `Updating ${displayNoun}...`;
      case 'delete': return `Removing ${displayNoun}...`;
      case 'complete': return `Marking ${displayNoun} as complete...`;
      case 'build': return `Building schedule...`;
      case 'create': return `Creating ${displayNoun}${title ? `: "${title}"` : ''}...`;
      case 'reschedule': return `Rescheduling event...`;
      case 'get': return `Generating report...`;
      default: return `Processing ${a.type}...`;
    }
  }).join('\n');
}

// =============================================================================
// Quick Suggestions
// =============================================================================

export async function getQuickSuggestions(context: ChatbotContext): Promise<string[]> {
  const suggestions: string[] = [];
  const { goals, calendarEvents, currentDate } = context;

  if (goals.length === 0) {
    return ["What ambition would you like to achieve?", "Help me set up my first ambition"];
  }

  // Unscheduled goals
  const unscheduled = goals.filter(g => !(g as any).isScheduled);

  if (unscheduled.length > 0) {
    suggestions.push(`Build schedule for ${unscheduled[0].title}`);
  }

  // Progress check
  if (goals.length > 0) {
    suggestions.push(`How's my progress on ${goals[0].title}?`);
  }

  // Today's events
  const today = currentDate.toISOString().split('T')[0];
  const todayEvents = calendarEvents.filter(e => {
    const start = (e.start || {}) as any;
    const dateTime = start.dateTime;
    const date = start.date;

    // Handle Date objects
    if (dateTime instanceof Date) {
      return dateTime.toISOString().startsWith(today);
    }
    if (date instanceof Date) {
      return date.toISOString().startsWith(today);
    }

    // Handle strings
    const dateStr = String(dateTime || date || '');
    return dateStr.startsWith(today);
  });

  if (todayEvents.length > 0) {
    suggestions.push("What's on my schedule today?");
  } else {
    suggestions.push("What should I focus on today?");
  }

  suggestions.push("Add a new goal");
  suggestions.push("Show my weekly progress");

  return suggestions.slice(0, 5);
}
