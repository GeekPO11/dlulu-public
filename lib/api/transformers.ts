// =============================================================================
// DATA TRANSFORMERS
// Convert between database (snake_case) and app (camelCase) formats
// =============================================================================

// =============================================================================
// TIMEZONE UTILITIES
// Fix for the "time is broken" issue - events were stored with local time
// strings into TIMESTAMPTZ columns which PostgreSQL interprets as UTC.
// =============================================================================

/**
 * Get the user's local timezone offset in minutes
 */
function getLocalTimezoneOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

/**
 * Convert a local datetime string to a proper ISO string with timezone.
 * If the string already has timezone info (Z or +/-), return as-is.
 * If it's a bare datetime (no timezone), treat it as LOCAL time and convert to UTC ISO.
 */
export function localToUtcIso(dateTimeStr: string | undefined | null): string | null {
  if (!dateTimeStr) return null;

  // Already has timezone info
  if (dateTimeStr.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(dateTimeStr)) {
    return dateTimeStr;
  }

  // Bare datetime - treat as local time
  // Parse as local, then convert to UTC ISO
  const localDate = new Date(dateTimeStr);
  if (isNaN(localDate.getTime())) return null;

  return localDate.toISOString();
}

/**
 * Ensure a datetime string from the database is properly formatted.
 * Supabase returns TIMESTAMPTZ as ISO strings with Z suffix (UTC).
 * This function ensures consistent output.
 */
export function normalizeDbDatetime(dateTimeStr: string | undefined | null): string | null {
  if (!dateTimeStr) return null;

  // Try to parse and normalize
  const date = new Date(dateTimeStr);
  if (isNaN(date.getTime())) return null;

  return date.toISOString();
}

// Generic snake_case to camelCase converter
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Generic camelCase to snake_case converter
export function camelToSnake(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Transform object keys from snake_case to camelCase
export function transformFromDb<T extends Record<string, any>>(obj: T | null): any {
  if (!obj) return null;
  if (Array.isArray(obj)) return obj.map(transformFromDb);
  if (typeof obj !== 'object') return obj;

  const transformed: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);
    transformed[camelKey] = value !== null && typeof value === 'object'
      ? transformFromDb(value)
      : value;
  }
  return transformed;
}

// Transform object keys from camelCase to snake_case (for DB inserts/updates)
export function transformToDb<T extends Record<string, any>>(obj: T | null): any {
  if (!obj) return null;
  if (Array.isArray(obj)) return obj.map(transformToDb);
  if (typeof obj !== 'object') return obj;

  const transformed: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined values
    if (value === undefined) continue;

    const snakeKey = camelToSnake(key);
    transformed[snakeKey] = value !== null && typeof value === 'object' && !(value instanceof Date)
      ? transformToDb(value)
      : value;
  }
  return transformed;
}

// =============================================================================
// SPECIFIC TRANSFORMERS
// =============================================================================

function normalizeCriticalGapsFromDb(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeBehaviorPlanFromDb(value: unknown): Record<string, any> | undefined {
  if (value && typeof value === 'object') {
    return value as Record<string, any>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, any>;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeRiskLevelFromDb(value: unknown): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return 'low';
}

function normalizePreferredDaysFromDb(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const days = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return days.length > 0 ? days : [];
}

function normalizeJsonObject(value: unknown): Record<string, any> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function normalizeJsonArray(value: unknown): Record<string, any>[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is Record<string, any> => !!item && typeof item === 'object' && !Array.isArray(item));
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

// Transform Goal from DB to App format
export function transformGoalFromDb(dbGoal: any): any {
  if (!dbGoal) return null;

  const criticalGaps = normalizeCriticalGapsFromDb(dbGoal.critical_gaps);
  const behaviorPlan = normalizeBehaviorPlanFromDb(dbGoal.behavior_plan);
  const preferredDays = normalizePreferredDaysFromDb(dbGoal.preferred_days);
  const intakeQuestions = normalizeJsonArray(dbGoal.intake_questions);
  const intakeAnswers = normalizeJsonObject(dbGoal.intake_answers);

  return {
    id: dbGoal.id,
    title: dbGoal.title,
    originalInput: dbGoal.original_input,
    category: dbGoal.category,
    timeline: dbGoal.timeline,
    estimatedWeeks: dbGoal.estimated_weeks,
    strategyOverview: dbGoal.strategy_overview,
    criticalGaps,
    overviewGenerated: dbGoal.overview_generated ?? false,
    behaviorPlan,
    priorityWeight: dbGoal.priority_weight ?? 50,
    riskLevel: normalizeRiskLevelFromDb(dbGoal.risk_level),
    riskAcknowledgedAt: dbGoal.risk_acknowledged_at ? new Date(dbGoal.risk_acknowledged_at) : undefined,
    intakeQuestions,
    intakeAnswers,
    intakeSummary: typeof dbGoal.intake_summary === 'string' ? dbGoal.intake_summary : undefined,
    intakeSchemaVersion: typeof dbGoal.intake_schema_version === 'string' ? dbGoal.intake_schema_version : undefined,
    intakeUpdatedAt: dbGoal.intake_updated_at ? new Date(dbGoal.intake_updated_at) : undefined,
    currentPhaseIndex: dbGoal.current_phase_index,
    overallProgress: dbGoal.overall_progress,
    status: dbGoal.status,
    isScheduled: dbGoal.is_scheduled,
    preferredTime: dbGoal.preferred_time,
    frequency: dbGoal.frequency,
    duration: dbGoal.duration,
    energyCost: dbGoal.energy_cost,
    preferredDays,
    phases: dbGoal.phases?.map(transformPhaseFromDb) || [],
    history: [],
    createdAt: new Date(dbGoal.created_at),
    updatedAt: new Date(dbGoal.updated_at),
  };
}

// Transform Phase from DB to App format
export function transformPhaseFromDb(dbPhase: any): any {
  if (!dbPhase) return null;

  return {
    id: dbPhase.id,
    goalId: dbPhase.goal_id,
    number: dbPhase.phase_number,
    title: dbPhase.title,
    description: dbPhase.description,
    startWeek: dbPhase.start_week,
    endWeek: dbPhase.end_week,
    estimatedDuration: dbPhase.estimated_duration,
    focus: dbPhase.focus || [],
    status: dbPhase.status,
    progress: dbPhase.progress,
    coachAdvice: dbPhase.coach_advice,
    milestones: dbPhase.milestones?.map(transformMilestoneFromDb) || [],
  };
}

// Transform Milestone from DB to App format
// Updated for 4-level hierarchy only (v2.3.0 - legacy removed)
export function transformMilestoneFromDb(dbMilestone: any): any {
  if (!dbMilestone) return null;

  // Only load tasks hierarchy (legacy subtasks removed after migration)
  const tasks = dbMilestone.tasks?.map(transformTaskFromDb) || [];

  return {
    id: dbMilestone.id,
    phaseId: dbMilestone.phase_id,
    goalId: dbMilestone.goal_id,
    title: dbMilestone.title,
    description: dbMilestone.description,
    isCompleted: dbMilestone.is_completed,
    completedAt: dbMilestone.completed_at ? new Date(dbMilestone.completed_at) : undefined,
    userNotes: dbMilestone.user_notes,
    order: dbMilestone.display_order,
    targetWeek: dbMilestone.target_week,
    // Tasks array (4-level hierarchy: Goal → Phase → Milestone → Task → SubTask)
    tasks: tasks,
    // Legacy subTasks removed - all subtasks now belong to tasks
    attachments: [],
  };
}

// Transform Task from DB to App format (NEW)
// This is the layer between Milestone and SubTask
export function transformTaskFromDb(dbTask: any): any {
  if (!dbTask) return null;

  return {
    id: dbTask.id,
    milestoneId: dbTask.milestone_id,
    phaseId: dbTask.phase_id,
    goalId: dbTask.goal_id,
    title: dbTask.title,
    description: dbTask.description,
    isCompleted: dbTask.is_completed,
    completedAt: dbTask.completed_at ? new Date(dbTask.completed_at) : undefined,
    isStrikethrough: dbTask.is_strikethrough,
    strikethroughReason: dbTask.strikethrough_reason,
    // Scheduling hints
    startDay: dbTask.start_day,
    endDay: dbTask.end_day,
    durationDays: dbTask.duration_days,
    timesPerWeek: dbTask.times_per_week,
    // Ordering
    order: dbTask.display_order,
    // NEW: Intelligence Fields (Research-Backed Scheduling)
    difficulty: dbTask.difficulty,
    cognitiveType: dbTask.cognitive_type,
    estimatedMinutes: dbTask.estimated_minutes,
    // Nested subtasks
    subTasks: dbTask.subtasks?.map(transformSubtaskFromDb) || [],
    // Timestamps
    createdAt: dbTask.created_at ? new Date(dbTask.created_at) : undefined,
    updatedAt: dbTask.updated_at ? new Date(dbTask.updated_at) : undefined,
  };
}

// Transform Task to DB format (NEW)
export function transformTaskToDb(task: any): any {
  if (!task) return null;

  return {
    id: task.id,
    milestone_id: task.milestoneId,
    phase_id: task.phaseId,
    goal_id: task.goalId,
    title: task.title,
    description: task.description,
    is_completed: task.isCompleted,
    completed_at: task.completedAt,
    is_strikethrough: task.isStrikethrough,
    strikethrough_reason: task.strikethroughReason,
    start_day: task.startDay,
    end_day: task.endDay,
    duration_days: task.durationDays,
    times_per_week: task.timesPerWeek,
    display_order: task.order,
    // NEW: Intelligence Fields
    difficulty: task.difficulty,
    cognitive_type: task.cognitiveType,
    estimated_minutes: task.estimatedMinutes,
  };
}

// Transform Subtask from DB to App format
export function transformSubtaskFromDb(dbSubtask: any): any {
  if (!dbSubtask) return null;

  return {
    id: dbSubtask.id,
    taskId: dbSubtask.task_id,                    // NEW: reference to parent task
    milestoneId: dbSubtask.milestone_id,          // Legacy: for backward compatibility
    title: dbSubtask.title,
    description: dbSubtask.description,
    isCompleted: dbSubtask.is_completed,
    completedAt: dbSubtask.completed_at ? new Date(dbSubtask.completed_at) : undefined,
    isManual: dbSubtask.is_manual,
    isStrikethrough: dbSubtask.is_strikethrough,
    strikethroughReason: dbSubtask.strikethrough_reason,
    order: dbSubtask.display_order,
    createdAt: dbSubtask.created_at ? new Date(dbSubtask.created_at) : undefined,
    updatedAt: dbSubtask.updated_at ? new Date(dbSubtask.updated_at) : undefined,
  };
}

// Transform Subtask to DB format
export function transformSubtaskToDb(subtask: any): any {
  if (!subtask) return null;

  return {
    id: subtask.id,
    task_id: subtask.taskId,
    milestone_id: subtask.milestoneId,
    title: subtask.title,
    description: subtask.description,
    is_completed: subtask.isCompleted,
    completed_at: subtask.completedAt,
    is_manual: subtask.isManual,
    is_strikethrough: subtask.isStrikethrough,
    strikethrough_reason: subtask.strikethroughReason,
    display_order: subtask.order,
  };
}

// Transform CalendarEvent from DB to App format
// Updated for Ambition Engine schema (v2.1.0)
export function transformEventFromDb(dbEvent: any): any {
  if (!dbEvent) return null;

  // Normalize recurrence_rule JSONB to app-friendly fields.
  // We intentionally support multiple historical shapes:
  // - string: "FREQ=WEEKLY;BYDAY=MO,WE,FR" OR "RRULE:FREQ=..."
  // - object: { rule: "FREQ=...", recurrence: ["RRULE:FREQ=..."] }
  const rawRecurrenceRule = dbEvent.recurrence_rule;
  const recurrenceRuleFromDb =
    typeof rawRecurrenceRule === 'string'
      ? rawRecurrenceRule.replace(/^RRULE:/, '')
      : rawRecurrenceRule?.rule
        ? String(rawRecurrenceRule.rule).replace(/^RRULE:/, '')
        : undefined;

  const recurrenceFromDb: string[] | undefined =
    Array.isArray(rawRecurrenceRule?.recurrence)
      ? rawRecurrenceRule.recurrence
      : typeof rawRecurrenceRule === 'string'
        ? [`RRULE:${rawRecurrenceRule.replace(/^RRULE:/, '')}`]
        : recurrenceRuleFromDb
          ? [`RRULE:${recurrenceRuleFromDb}`]
          : undefined;

  // Normalize datetime values from the database
  // Supabase returns TIMESTAMPTZ as ISO strings (UTC with Z suffix)
  const startDateTime = normalizeDbDatetime(dbEvent.start_datetime);
  const endDateTime = normalizeDbDatetime(dbEvent.end_datetime);

  return {
    id: dbEvent.id,
    userId: dbEvent.user_id,
    summary: dbEvent.summary,
    description: dbEvent.description,
    location: dbEvent.location,

    // Timing - normalized to proper ISO format
    start: {
      dateTime: startDateTime,
      date: dbEvent.start_date,
      timeZone: dbEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDateTime,
      date: dbEvent.end_date,
      timeZone: dbEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    isAllDay: dbEvent.is_all_day,

    // Roadmap Links
    goalId: dbEvent.goal_id,
    phaseId: dbEvent.phase_id,
    milestoneId: dbEvent.milestone_id,
    taskId: dbEvent.task_id,           // Link to tasks table
    subtaskId: dbEvent.subtask_id,     // Link to subtasks table
    roadmapTaskId: dbEvent.roadmap_task_id,

    // Allocation (NEW)
    allocationType: dbEvent.allocation_type,
    sessionIndex: dbEvent.session_index,
    totalSessions: dbEvent.total_sessions,
    durationMinutes: dbEvent.duration_minutes,
    effortMinutesAllocated: dbEvent.effort_minutes_allocated,

    // Status
    status: dbEvent.status,
    completedAt: dbEvent.completed_at,
    skippedReason: dbEvent.skipped_reason,

    // Reschedule Tracking
    rescheduleCount: dbEvent.reschedule_count,
    originalStartDatetime: dbEvent.original_start_datetime || dbEvent.original_start,

    // Recurrence
    isRecurring: dbEvent.is_recurring,
    recurrenceRule: recurrenceRuleFromDb,
    recurrence: recurrenceFromDb,
    recurringEventId: dbEvent.recurring_event_id,

    // Visual & Classification
    colorId: dbEvent.color_id,
    priority: dbEvent.priority,
    energyCost: dbEvent.energy_cost,
    eventType: dbEvent.event_type,
    rationale: dbEvent.rationale,

    // NEW: Intelligence Fields (Research-Backed Scheduling)
    difficulty: dbEvent.difficulty,
    isLocked: dbEvent.is_locked,
    cognitiveType: dbEvent.cognitive_type,
    aiConfidenceScore: dbEvent.ai_confidence_score,
    schedulingReasoning: dbEvent.scheduling_reasoning,

    // AI Metadata (NEW)
    aiMetadata: dbEvent.ai_metadata || {},

    // Source & Sync
    source: dbEvent.source,
    syncStatus: dbEvent.sync_status,
    externalId: dbEvent.external_event_id,

    // Timestamps
    createdAt: dbEvent.created_at,
    updatedAt: dbEvent.updated_at,

    // Legacy compatibility (ambitionOsMeta)
    ambitionOsMeta: {
      goalId: dbEvent.goal_id,
      phaseId: dbEvent.phase_id,
      milestoneId: dbEvent.milestone_id,
      eventType: dbEvent.event_type,
      priority: dbEvent.priority,
      energyCost: dbEvent.energy_cost,
      status: dbEvent.status,
      rationale: dbEvent.rationale,
      rescheduleCount: dbEvent.reschedule_count,
      originalStart: dbEvent.original_start_datetime || dbEvent.original_start,
    },

    // Legacy field names
    created: dbEvent.created_at,
    updated: dbEvent.updated_at,
  };
}

// Transform UserProfile from DB to App format
export function transformProfileFromDb(dbProfile: any): any {
  if (!dbProfile) return null;

  return {
    id: dbProfile.id,
    name: dbProfile.name,
    role: dbProfile.role,
    roleContext: dbProfile.role_context,
    bio: dbProfile.bio,
    chronotype: dbProfile.chronotype,
    workStyle: dbProfile.work_style,
    energyLevel: dbProfile.energy_level,
    // NEW: User Preferences (Research-Backed Scheduling)
    userPreferences: dbProfile.user_preferences,
    createdAt: new Date(dbProfile.created_at),
    updatedAt: new Date(dbProfile.updated_at),
  };
}
