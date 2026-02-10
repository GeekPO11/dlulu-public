// =============================================================================
// CHAT Edge Function - AI Assistant with Complete Function Calling
// Handles all chatbot conversations with full goal management capabilities
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { callGeminiAdvanced } from '../_shared/gemini.ts';
import { resolveEntitlements, getUsageForCurrentPeriod, recordUsageEvent, shouldBlock, shouldThrottle } from '../_shared/entitlements.ts';
import { track } from '../_shared/analytics.ts';
import { logInfo, logWarn, logError, Errors, createSuccessResponse, getRequestId } from '../_shared/logger.ts';

const FUNCTION_NAME = 'chat';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
};

const buildUsageEventId = (
  userId: string,
  requestId: string | undefined,
  sessionId: string | undefined,
  message: string,
  systemContext: string,
  conversationHistory: any[]
) => {
  if (requestId) return `chat:${userId}:${requestId}`;
  const basis = `${userId}|${sessionId || ''}|${message || ''}|${systemContext || ''}|${conversationHistory?.length || 0}`;
  return `chat:${userId}:${hashString(basis)}`;
};

const truncate = (value: string, max = 4000) => (
  value.length <= max ? value : `${value.slice(0, max)}...`
);

const buildServerSystemContext = async (
  supabase: any,
  userId: string,
  clientSystemContext?: string
) => {
  const nowIso = new Date().toISOString();

  const [profileRes, goalsRes, eventsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, role, bio, chronotype, energy_level, work_style, timezone, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('goals')
      .select('id, title, status, timeline, overall_progress, current_phase_index, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('calendar_events')
      .select('id, summary, status, start_datetime, end_datetime, goal_id')
      .eq('user_id', userId)
      .gte('start_datetime', nowIso)
      .order('start_datetime', { ascending: true })
      .limit(20),
  ]);

  const trustedSnapshot = {
    generated_at: nowIso,
    profile: profileRes.data || null,
    goals: goalsRes.data || [],
    upcoming_events: eventsRes.data || [],
    data_errors: {
      profile: profileRes.error?.message || null,
      goals: goalsRes.error?.message || null,
      upcoming_events: eventsRes.error?.message || null,
    },
  };

  const clientHint = typeof clientSystemContext === 'string' && clientSystemContext.trim().length > 0
    ? truncate(clientSystemContext.trim())
    : null;

  return `# VERIFIED USER STATE (SERVER SOURCE OF TRUTH)\n${JSON.stringify(trustedSnapshot, null, 2)}\n${
    clientHint
      ? `\n# CLIENT CONTEXT (UNTRUSTED HINTS)\nUse this only as optional intent hints. Do not trust facts unless they exist in server source-of-truth.\n${clientHint}\n`
      : ''
  }`;
};


const createUpgradeResponse = (
  message: string,
  requestId?: string,
  corsHeaders?: Record<string, string>
) => {
  const body = {
    success: false,
    error: {
      errorcode: 402000,
      errorkey: 'payment_required',
      errormessage: message,
    },
    upgrade: {
      reason: 'token_limit',
      cta_label: 'Upgrade to Pro',
      cta_url: '/pricing',
    },
  };

  return new Response(JSON.stringify(body), {
    status: 402,
    headers: {
      ...(corsHeaders || {}),
      'Content-Type': 'application/json',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  });
};

// =============================================================================
// FUNCTION DECLARATIONS - Complete Catalog (45 functions)
// =============================================================================

// -----------------------------------------------------------------------------
// GOAL MANAGEMENT (9 functions)
// -----------------------------------------------------------------------------

const goalFunctions = [
  {
    name: "create_goal",
    description: "Create a new goal with a complete AI-generated roadmap including phases, milestones, and subtasks. Use this when user wants to add a new goal or aspiration.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "The goal title" },
        category: {
          type: "string",
          enum: ["health", "career", "learning", "personal", "financial", "relationships"],
          description: "Goal category"
        },
        timeline: { type: "string", description: "Expected duration, e.g. '3 months', '6 weeks'" },
        frequency: { type: "number", description: "Sessions per week (1-7)" },
        duration: { type: "number", description: "Minutes per session (15-180)" },
        preferredTime: {
          type: "string",
          enum: ["morning", "afternoon", "evening", "flexible"],
          description: "When user prefers to work on this"
        },
        energyCost: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Energy required for this goal"
        },
        additionalContext: { type: "string", description: "Any extra details about user's situation" },
      },
      required: ["title", "category", "timeline"],
    },
  },
  {
    name: "update_goal",
    description: "Update an existing goal's details (title, status, timeline, etc.)",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "The goal ID to update" },
        title: { type: "string", description: "New title" },
        status: {
          type: "string",
          enum: ["planning", "active", "paused", "completed", "abandoned"]
        },
        timeline: { type: "string" },
        frequency: { type: "number" },
        duration: { type: "number" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "pause_goal",
    description: "Temporarily pause a goal (user taking a break)",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        reason: { type: "string", description: "Why pausing (optional)" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "resume_goal",
    description: "Resume a paused goal",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "complete_goal",
    description: "Mark a goal as successfully completed/achieved",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        celebrationNote: { type: "string", description: "Celebration message" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "abandon_goal",
    description: "Abandon a goal that user no longer wants to pursue. REQUIRES CONFIRMATION.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        reason: { type: "string", description: "Why abandoning" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "delete_goal",
    description: "Permanently delete a goal and all its data. REQUIRES CONFIRMATION.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "get_goal_progress",
    description: "Get a progress report for goals",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "Specific goal, or omit for all goals" },
        period: {
          type: "string",
          enum: ["today", "week", "month", "all_time"],
          description: "Time period for the report"
        },
      },
      required: ["period"],
    },
  },
  {
    name: "adjust_goal_timeline",
    description: "Extend or compress a goal's timeline",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        newEndDate: { type: "string", description: "New target end date (YYYY-MM-DD)" },
        strategy: {
          type: "string",
          enum: ["extend_phases", "compress_phases", "add_buffer"],
          description: "How to handle the adjustment"
        },
      },
      required: ["goalId", "newEndDate"],
    },
  },
];

// -----------------------------------------------------------------------------
// PHASE MANAGEMENT (7 functions)
// -----------------------------------------------------------------------------

const phaseFunctions = [
  {
    name: "add_phase",
    description: "Add a new phase to a goal",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        estimatedWeeks: { type: "number" },
        focus: { type: "array", items: { type: "string" }, description: "Key focus areas" },
        position: { type: "number", description: "Insert position (1 = first)" },
      },
      required: ["goalId", "title"],
    },
  },
  {
    name: "edit_phase",
    description: "Edit an existing phase",
    parameters: {
      type: "object",
      properties: {
        phaseId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        focus: { type: "array", items: { type: "string" } },
      },
      required: ["phaseId"],
    },
  },
  {
    name: "delete_phase",
    description: "Delete a phase. REQUIRES CONFIRMATION.",
    parameters: {
      type: "object",
      properties: {
        phaseId: { type: "string" },
      },
      required: ["phaseId"],
    },
  },
  {
    name: "activate_phase",
    description: "Mark a phase as the current active phase",
    parameters: {
      type: "object",
      properties: {
        phaseId: { type: "string" },
      },
      required: ["phaseId"],
    },
  },
  {
    name: "complete_phase",
    description: "Mark a phase as completed",
    parameters: {
      type: "object",
      properties: {
        phaseId: { type: "string" },
        notes: { type: "string", description: "Completion notes" },
      },
      required: ["phaseId"],
    },
  },
];

// -----------------------------------------------------------------------------
// MILESTONE MANAGEMENT (6 functions)
// -----------------------------------------------------------------------------

const milestoneFunctions = [
  {
    name: "add_milestone",
    description: "Add a new milestone to a phase",
    parameters: {
      type: "object",
      properties: {
        phaseId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        targetWeek: { type: "number", description: "Target week within the phase" },
      },
      required: ["phaseId", "title"],
    },
  },
  {
    name: "edit_milestone",
    description: "Edit an existing milestone",
    parameters: {
      type: "object",
      properties: {
        milestoneId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        targetWeek: { type: "number" },
      },
      required: ["milestoneId"],
    },
  },
  {
    name: "complete_milestone",
    description: "Mark a milestone as completed",
    parameters: {
      type: "object",
      properties: {
        milestoneId: { type: "string" },
        notes: { type: "string", description: "Completion notes or reflections" },
      },
      required: ["milestoneId"],
    },
  },
  {
    name: "uncomplete_milestone",
    description: "Reopen a completed milestone",
    parameters: {
      type: "object",
      properties: {
        milestoneId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["milestoneId"],
    },
  },
  {
    name: "delete_milestone",
    description: "Delete a milestone. REQUIRES CONFIRMATION.",
    parameters: {
      type: "object",
      properties: {
        milestoneId: { type: "string" },
      },
      required: ["milestoneId"],
    },
  },
];

// -----------------------------------------------------------------------------
// TASK MANAGEMENT (4 functions)
// -----------------------------------------------------------------------------

const taskFunctions = [
  {
    name: "add_task",
    description: "Add a new task to a milestone (tasks are parents of subtasks)",
    parameters: {
      type: "object",
      properties: {
        milestoneId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        order: { type: "number" },
        startDay: { type: "number" },
        endDay: { type: "number" },
        durationDays: { type: "number" },
        timesPerWeek: { type: "number" },
      },
      required: ["milestoneId", "title"],
    },
  },
  {
    name: "edit_task",
    description: "Edit an existing task",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        order: { type: "number" },
        startDay: { type: "number" },
        endDay: { type: "number" },
        durationDays: { type: "number" },
        timesPerWeek: { type: "number" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "delete_task",
    description: "Delete a task",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
];

// -----------------------------------------------------------------------------
// SUBTASK MANAGEMENT (8 functions)
// -----------------------------------------------------------------------------

const subtaskFunctions = [
  {
    name: "add_subtask",
    description: "Add a subtask to a task (preferred) or a milestone (legacy fallback)",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Parent task ID (preferred)" },
        milestoneId: { type: "string", description: "Legacy fallback if taskId missing" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_subtasks_bulk",
    description: "Add multiple tasks at once",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Parent task ID (preferred)" },
        milestoneId: { type: "string", description: "Legacy fallback if taskId missing" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title"],
          }
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "edit_subtask",
    description: "Edit an existing task",
    parameters: {
      type: "object",
      properties: {
        subtaskId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["subtaskId"],
    },
  },
  {
    name: "complete_subtask",
    description: "Mark a task as done",
    parameters: {
      type: "object",
      properties: {
        subtaskId: { type: "string" },
      },
      required: ["subtaskId"],
    },
  },
  {
    name: "uncomplete_subtask",
    description: "Reopen a completed task",
    parameters: {
      type: "object",
      properties: {
        subtaskId: { type: "string" },
      },
      required: ["subtaskId"],
    },
  },
  {
    name: "delete_subtask",
    description: "Delete a task",
    parameters: {
      type: "object",
      properties: {
        subtaskId: { type: "string" },
      },
      required: ["subtaskId"],
    },
  },
];

// -----------------------------------------------------------------------------
// CALENDAR/SCHEDULE MANAGEMENT (9 functions)
// -----------------------------------------------------------------------------

const calendarFunctions = [
  {
    name: "create_event",
    description: "Create a calendar event",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        startTime: { type: "string", description: "HH:MM (24h format)" },
        endTime: { type: "string", description: "HH:MM (24h format)" },
        goalId: { type: "string", description: "Link to goal (optional)" },
        milestoneId: { type: "string", description: "Link to milestone (optional)" },
        description: { type: "string" },
      },
      required: ["title", "date", "startTime"],
    },
  },
  {
    name: "edit_event",
    description: "Edit an existing calendar event",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        title: { type: "string" },
        date: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        description: { type: "string" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "delete_event",
    description: "Delete a calendar event",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "reschedule_event",
    description: "Move an event to a different time",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        newDate: { type: "string", description: "YYYY-MM-DD" },
        newStartTime: { type: "string", description: "HH:MM" },
        reason: { type: "string" },
      },
      required: ["eventId", "newDate", "newStartTime"],
    },
  },
  {
    name: "skip_event",
    description: "Skip a scheduled event with a reason",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        reason: { type: "string" },
        reschedule: { type: "boolean", description: "Should we reschedule automatically?" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "complete_event",
    description: "Mark a scheduled session as completed",
    parameters: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        notes: { type: "string", description: "How it went" },
        actualDuration: { type: "number", description: "Actual minutes spent" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "build_schedule",
    description: "Generate a schedule for a goal based on user's available time. REQUIRES CONFIRMATION/PREVIEW.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        startDate: { type: "string", description: "When to start scheduling (YYYY-MM-DD)" },
        weeksToSchedule: { type: "number", description: "How many weeks to schedule (1-12)" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "clear_schedule",
    description: "Remove all scheduled events for a goal. REQUIRES CONFIRMATION.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "optimize_schedule",
    description: "AI-powered schedule optimization based on patterns and preferences. REQUIRES CONFIRMATION/PREVIEW.",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "Specific goal or omit for all" },
        preferences: { type: "string", description: "Any preferences to consider" },
      },
      required: [],
    },
  },
];

// -----------------------------------------------------------------------------
// COACHING & INSIGHTS (6 functions)
// -----------------------------------------------------------------------------

const coachingFunctions = [
  {
    name: "get_daily_focus",
    description: "Get what to focus on today",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (defaults to today)" },
      },
      required: [],
    },
  },
  {
    name: "get_weekly_summary",
    description: "Get a summary of the week's progress",
    parameters: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "Start of week (defaults to current)" },
      },
      required: [],
    },
  },
  {
    name: "get_recommendations",
    description: "Get AI-powered recommendations and suggestions",
    parameters: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["productivity", "stuck_goals", "time_management", "motivation", "planning"],
          description: "What kind of recommendations"
        },
      },
      required: [],
    },
  },
  {
    name: "explain_roadmap",
    description: "Explain a goal's roadmap structure and strategy",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "compare_progress",
    description: "Compare actual progress vs planned progress",
    parameters: {
      type: "object",
      properties: {
        goalId: { type: "string" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "celebrate_achievement",
    description: "Acknowledge and celebrate an achievement",
    parameters: {
      type: "object",
      properties: {
        achievementType: {
          type: "string",
          enum: ["milestone_completed", "phase_completed", "goal_completed", "streak", "personal_best"],
        },
        targetId: { type: "string" },
        message: { type: "string" },
      },
      required: ["achievementType"],
    },
  },
];

// -----------------------------------------------------------------------------
// OTHER (1 function)
// -----------------------------------------------------------------------------

const otherFunctions = [
  {
    name: "add_note",
    description: "Attach a note to a goal, milestone, task, or subtask",
    parameters: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["goal", "milestone", "task", "subtask"] },
        targetId: { type: "string" },
        note: { type: "string" },
      },
      required: ["targetType", "targetId", "note"],
    },
  },
];

// =============================================================================
// SUPPORTED ACTIONS (Executor-aligned)
// =============================================================================

const SUPPORTED_ACTION_NAMES = [
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

const SUPPORTED_ACTION_SET = new Set(SUPPORTED_ACTION_NAMES);
const SUPPORTED_ACTION_LIST = SUPPORTED_ACTION_NAMES.map(name => `- ${name}`).join('\n');

// =============================================================================
// COMBINE ALL FUNCTIONS
// =============================================================================

const ALL_FUNCTIONS = [
  ...goalFunctions,
  ...phaseFunctions,
  ...milestoneFunctions,
  ...taskFunctions,
  ...subtaskFunctions,
  ...calendarFunctions,
  ...coachingFunctions,
  ...otherFunctions,
].filter(fn => SUPPORTED_ACTION_SET.has(fn.name));

// Actions that require user confirmation before execution
const REQUIRES_CONFIRMATION = [
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

// =============================================================================
// MAIN HANDLER
// =============================================================================

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
      logError(FUNCTION_NAME, 'UNAUTHORIZED', authError || 'Invalid token', { requestId });
      return Errors.unauthorized(undefined, responseContext);
    }

    // Parse request body
    // mode: 'chat' (no tools), 'query' (coaching only), 'action' (all tools), undefined (legacy - all tools)
    const { message, systemContext: clientSystemContext, conversationHistory, sessionId, mode } = await req.json();

    if (!message) {
      logError(FUNCTION_NAME, 'VALIDATION_ERROR', 'message required', { requestId, userId: user?.id });
      return Errors.validationError('message required', responseContext);
    }

    logInfo(FUNCTION_NAME, 'Processing request', {
      requestId,
      userEmail: user?.email,
      messagePreview: message.substring(0, 80),
      sessionId: sessionId || 'new',
      mode: mode || 'action'
    });

    const systemContext = await buildServerSystemContext(supabase, user.id, clientSystemContext);

    // Resolve entitlements + usage
    const { entitlements, source } = await resolveEntitlements(supabase, user.id);
    const usage = await getUsageForCurrentPeriod(supabase, user.id);

    const usageCap = entitlements.token_hard_cap ?? entitlements.token_soft_cap;
    if (usageCap && usageCap > 0) {
      const ratio = usage.token_usage / usageCap;
      const thresholds = entitlements.warning_thresholds || {};
      if (ratio >= (thresholds.token_warning_50 ?? 0.5)) {
        track('token_warning_50', { plan_id: entitlements.plan_id, usage: usage.token_usage, cap: usageCap }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
      }
      if (ratio >= (thresholds.token_warning_80 ?? 0.8)) {
        track('token_warning_80', { plan_id: entitlements.plan_id, usage: usage.token_usage, cap: usageCap }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
      }
      if (ratio >= (thresholds.token_warning_100 ?? 1.0)) {
        track('token_warning_100', { plan_id: entitlements.plan_id, usage: usage.token_usage, cap: usageCap }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
      }
    }

    const isFreePlan = entitlements.plan_id === 'free' || entitlements.plan_id === 'staging_free' || source === 'default';
    if (isFreePlan && shouldBlock(usage, entitlements)) {
      track('limit_hit', { limit_type: 'tokens', limit_value: entitlements.token_hard_cap, plan_id: entitlements.plan_id, usage: usage.token_usage }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
      return createUpgradeResponse('Monthly token limit reached. Upgrade to continue.', requestId, corsHeaders);
    }

    if (!isFreePlan && shouldThrottle(usage, entitlements)) {
      const delayMs = entitlements.throttle_policy?.delay_ms ?? 3000;
      track('throttled', { level: 'economy_lane', plan_id: entitlements.plan_id, delay_ms: delayMs }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
      await delay(delayMs);
    }

    const { count: activeGoalCount, error: goalCountError } = await supabase
      .from('goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['active', 'planning']);

    if (goalCountError) {
      logError(FUNCTION_NAME, 'DATABASE_ERROR', goalCountError.message, { requestId, userId: user.id });
    }

    const maxGoals = entitlements.max_active_goals;
    const goalLimitReached = isFreePlan && maxGoals !== null && (activeGoalCount ?? 0) >= maxGoals;
    if (goalLimitReached) {
      track('limit_hit', { limit_type: 'goals', limit_value: maxGoals, plan_id: entitlements.plan_id }, { functionName: FUNCTION_NAME, requestId, userId: user.id });
    }

    // Build mode-specific prompt and tool selection
    let prompt: string;
    let tools: any[] | undefined;

    if (mode === 'chat') {
      // CHAT mode: Conversational, no tools
      prompt = `${systemContext}

---
USER MESSAGE: ${message}

# INSTRUCTIONS
You are Spirit, a friendly manifestation coach in the Dlulu Life app.

## CURRENT MODE: CONVERSATION
The user is just chatting or asking general questions. Respond naturally and warmly.

**DO NOT** call any tools or try to take actions.
**DO** be friendly, helpful, and conversational.
**DO** answer general knowledge questions directly.
**DO** ask clarifying questions if you're unsure what they want.

## TONE:
- Warm, friendly, approachable
- Helpful but not pushy
- Use their name if known
- Keep responses concise but complete
`;
      tools = undefined; // No tools in chat mode

    } else if (mode === 'query') {
      // QUERY mode: Questions about their data, coaching tools only
      prompt = `${systemContext}

---
USER MESSAGE: ${message}

# INSTRUCTIONS
You are Spirit, a productivity coach helping users understand their progress.

## CURRENT MODE: QUERY
The user is asking about their goals, progress, or schedule.
Use the coaching tools to provide insights about THEIR data.

## AVAILABLE ACTIONS:
- get_goal_progress: Show progress on goals
- get_daily_focus: What to focus on today
- get_weekly_summary: Weekly progress summary
- get_recommendations: Personalized suggestions
- explain_roadmap: Explain goal structure
- compare_progress: Actual vs planned progress

## GUIDELINES:
- Reference THEIR specific goals from the context
- Be specific with numbers and details
- Provide actionable insights
`;
      tools = [{ functionDeclarations: coachingFunctions }];

    } else {
      // ACTION mode (default): Full capability
      prompt = `${systemContext}

---
USER MESSAGE: ${message}

# INSTRUCTIONS
You are Spirit, a high-performance manifestation coach.
The user wants to take action on their goals, schedule, or tasks.

## IMPORTANT RULES:
1. **ONE ACTION PER TYPE**: Never return duplicate actions.
2. **CONFIRM UNDERSTANDING**: Before creating goals, briefly confirm what you're about to create.
3. **Coaching Actions are Informational**: For get_recommendations etc., your message IS the content.
4. **ONLY USE SUPPORTED TOOLS**: If the user asks for something you cannot do, do NOT call a tool. Explain the limitation and provide manual UI steps instead.

## SUPPORTED ACTIONS (tool names)
${SUPPORTED_ACTION_LIST}

## RESPONSE GUIDELINES:
- **Creating a Goal**: Say "I'll create a goal for [title]. Setting that up now..."
- **Modifying Data**: Confirm what you're changing before doing it
- **Answering Questions**: Use the JSON Context provided

## TOOL RESULT HANDLING
If the message starts with "[TOOL_RESULT]":
- **On SUCCESS**: "Done! I've [action]. Here's what's next..."
- **On FAILURE**: "I couldn't complete that. Let me try another way..."

## TONE:
- Professional, warm, encouraging
- Keep action messages brief
- Use Markdown for longer explanations
`;
      const availableFunctions = goalLimitReached
        ? ALL_FUNCTIONS.filter(fn => fn.name !== 'create_goal')
        : ALL_FUNCTIONS;
      tools = [{ functionDeclarations: availableFunctions }];
    }

    // Build conversation history for context
    const sanitizedHistory = (conversationHistory || [])
      .filter((m: any) => m && m.content)
      .slice(-15) // Keep last 15 messages for context
      .map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
      }));

    // Call Gemini with appropriate tools based on mode
    const geminiRequest: any = {
      contents: [
        ...sanitizedHistory,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    };

    // Only include tools if specified
    if (tools) {
      geminiRequest.tools = tools;
    }

    const startTime = Date.now();
    const geminiResponse = await callGeminiAdvanced(geminiRequest);
    const latencyMs = Date.now() - startTime;

    const usageMeta = geminiResponse?.usageMetadata || geminiResponse?.usage?.usageMetadata || geminiResponse?.usage || {};
    const tokensInput = Number(
      usageMeta?.promptTokenCount
      ?? usageMeta?.prompt_tokens
      ?? usageMeta?.input_tokens
      ?? usageMeta?.promptTokens
      ?? 0
    );
    let tokensOutput = Number(
      usageMeta?.candidatesTokenCount
      ?? usageMeta?.output_tokens
      ?? usageMeta?.completion_tokens
      ?? usageMeta?.candidatesTokens
      ?? 0
    );
    const tokensTotal = Number(
      usageMeta?.totalTokenCount
      ?? usageMeta?.total_tokens
      ?? 0
    );
    if (!tokensOutput && tokensTotal && Number.isFinite(tokensInput)) {
      tokensOutput = Math.max(0, tokensTotal - tokensInput);
    }

    if (!Number.isFinite(tokensInput) || !Number.isFinite(tokensOutput)) {
      logWarn(FUNCTION_NAME, 'Missing token counts from Gemini', { requestId, userId: user.id });
    }

    const usageEventId = buildUsageEventId(
      user.id,
      requestId,
      sessionId,
      message,
      systemContext,
      conversationHistory || []
    );

    const recordResult = await recordUsageEvent(
      supabase,
      usageEventId,
      user.id,
      Number.isFinite(tokensInput) ? tokensInput : 0,
      Number.isFinite(tokensOutput) ? tokensOutput : 0
    );

    logInfo(FUNCTION_NAME, 'Usage event recorded', {
      requestId,
      userId: user.id,
      eventId: usageEventId,
      applied: recordResult.applied,
      tokensInput: Number.isFinite(tokensInput) ? tokensInput : 0,
      tokensOutput: Number.isFinite(tokensOutput) ? tokensOutput : 0,
    });

    if (recordResult.applied) {
      const updatedUsage = await getUsageForCurrentPeriod(supabase, user.id);
      logInfo(FUNCTION_NAME, 'Usage totals updated', {
        requestId,
        userId: user.id,
        tokenUsage: updatedUsage.token_usage,
        tokensInput: updatedUsage.tokens_input_used,
        tokensOutput: updatedUsage.tokens_output_used,
        periodStart: updatedUsage.period_start,
        periodEnd: updatedUsage.period_end,
      });
    }

    // Parse response
    const parts = geminiResponse.candidates?.[0]?.content?.parts || [];
    const actions: any[] = [];
    let responseText = '';

    for (const part of parts) {
      if (part.functionCall) {
        const requiresConfirmation = REQUIRES_CONFIRMATION.includes(part.functionCall.name);
        actions.push({
          type: part.functionCall.name,
          status: requiresConfirmation ? 'pending_confirmation' : 'pending',
          data: part.functionCall.args,
          requiresConfirmation,
        });
      }
      if (part.text) {
        responseText += part.text;
      }
    }

    // If only function calls with no text, generate appropriate message
    if (!responseText && actions.length > 0) {
      const pendingConfirmation = actions.find(a => a.requiresConfirmation);
      if (pendingConfirmation) {
        responseText = generateConfirmationPrompt(pendingConfirmation);
      } else {
        responseText = generateActionMessage(actions);
      }
    }

    logInfo(FUNCTION_NAME, 'Response complete', { requestId, responseLength: responseText.length, actionsCount: actions.length, latencyMs });

    return createSuccessResponse({
      message: responseText || "I'm here to help with your goals! What would you like to do?",
      actions,
      sessionId,
      metadata: {
        latencyMs,
        actionsCount: actions.length,
        requiresConfirmation: actions.some(a => a.requiresConfirmation),
      }
    }, responseContext);

  } catch (error) {
    logError(FUNCTION_NAME, 'INTERNAL_ERROR', error.message || 'Unexpected error', { requestId, stack: error.stack });
    return Errors.internalError(error.message || 'An unexpected error occurred', responseContext);
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateConfirmationPrompt(action: any): string {
  const { type, data } = action;

  switch (type) {
    case 'create_goal':
      return `I've drafted a plan for "${data?.title || 'your goal'}". Would you like me to show you the full roadmap before creating it?`;

    case 'delete_goal':
      return `⚠️ **Are you sure you want to delete this goal?**\n\nThis will permanently remove the goal and all its:\n• Phases\n• Milestones\n• Subtasks\n• Scheduled events\n\nType "yes, delete it" or "cancel" to proceed.`;

    case 'abandon_goal':
      return `Are you sure you want to abandon this goal? It will be marked as abandoned but the data will be preserved.\n\nType "yes" to confirm or "no" to cancel.`;

    case 'delete_phase':
      return `⚠️ Deleting this phase will also remove all its milestones and tasks. Are you sure?`;

    case 'delete_milestone':
      return `Are you sure you want to delete this milestone and all its tasks?`;

    case 'build_schedule':
      return `I'm ready to create a schedule for this goal. Would you like me to show you a preview first, or just create it?`;

    case 'clear_schedule':
      return `⚠️ This will remove ALL scheduled events for this goal. Are you sure?`;

    case 'optimize_schedule':
      return `I can optimize your schedule based on your patterns. Would you like to see a preview of the changes first?`;

    case 'adjust_goal_timeline':
      return `Adjusting the timeline will affect all phases. Would you like me to show you how the phases will be redistributed?`;

    default:
      return `This action requires your confirmation. Please confirm to proceed.`;
  }
}

function generateActionMessage(actions: any[]): string {
  return actions.map(a => {
    const verb = a.type.split('_')[0];
    const noun = a.type.split('_').slice(1).join(' ');
    const title = a.data?.title || '';

    switch (verb) {
      case 'add': return `✅ Adding ${noun}${title ? `: "${title}"` : ''}`;
      case 'create': return `✅ Creating ${noun}${title ? `: "${title}"` : ''}`;
      case 'edit': return `✅ Updating ${noun}...`;
      case 'update': return `✅ Updating ${noun}...`;
      case 'delete': return `🗑️ Removing ${noun}...`;
      case 'complete': return `🎉 Marking ${noun} as complete!`;
      case 'uncomplete': return `↩️ Reopening ${noun}...`;
      case 'build': return `📅 Building your schedule...`;
      case 'get': return `📊 Generating ${noun}...`;
      case 'pause': return `⏸️ Pausing ${noun}...`;
      case 'resume': return `▶️ Resuming ${noun}...`;
      case 'skip': return `⏭️ Skipping event...`;
      case 'reschedule': return `📅 Rescheduling event...`;
      case 'celebrate': return `🎊 Let's celebrate!`;
      case 'explain': return `📖 Here's how your roadmap works...`;
      default: return `Processing ${a.type}...`;
    }
  }).join('\n');
}
