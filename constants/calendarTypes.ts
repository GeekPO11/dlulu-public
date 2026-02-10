// =============================================================================
// Calendar Data Types
// Google Calendar Compatible
// =============================================================================

import { DATA_LIMITS } from './dataLimits';

// =============================================================================
// GOOGLE CALENDAR COMPATIBLE EVENT STRUCTURE
// Reference: https://developers.google.com/calendar/api/v3/reference/events
// =============================================================================

/**
 * CalendarEvent - Google Calendar compatible event structure
 * Extended for Ambition Engine (v2.1.0)
 * This format allows direct sync with Google Calendar API
 */
export interface CalendarEvent {
  // ===================
  // Core Fields (Required)
  // ===================
  id: string;                           // Unique identifier (uuid)
  userId?: string;                      // User who owns this event
  summary: string;                      // Event title (Google: summary)

  // ===================
  // Timing (Required)
  // ===================
  start: EventDateTime;                 // Start time
  end: EventDateTime;                   // End time
  isAllDay?: boolean;                   // True for all-day events

  // ===================
  // Description & Details
  // ===================
  description?: string;                 // Full description
  location?: string;                    // Location (optional)

  // ===================
  // Roadmap Links (Direct Access)
  // ===================
  goalId?: string;                      // Link to goal
  phaseId?: string;                     // Link to phase
  milestoneId?: string;                 // Link to milestone
  taskId?: string;                      // Link to task (tasks table)
  subtaskId?: string;                   // Link to subtask (subtasks table)
  roadmapTaskId?: string;               // Legacy: Link to specific task
  task_ids?: string[];                  // Link to multiple tasks
  subtask_ids?: string[];               // Link to multiple subtasks

  // ===================
  // Allocation Type (NEW)
  // ===================
  allocationType?: 'task_session' | 'habit_instance' | 'milestone_deadline' | 'blocked' | 'manual';

  // ===================
  // Session Tracking (NEW - for multi-session tasks)
  // ===================
  sessionIndex?: number;                // Which session (1, 2, 3...)
  totalSessions?: number;               // Out of N total
  durationMinutes?: number;             // Duration in minutes
  effortMinutesAllocated?: number;      // Effort contribution to parent task

  // ===================
  // Status (Extended)
  // ===================
  status?: EventStatus;                 // Current status
  completedAt?: string;                 // When completed
  skippedReason?: string;               // Reason if skipped

  // ===================
  // Reschedule Tracking
  // ===================
  rescheduleCount?: number;
  originalStartDatetime?: string;       // Original time if rescheduled

  // ===================
  // Recurrence (Google RRULE format)
  // ===================
  isRecurring?: boolean;
  recurrence?: string[];                // ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]
  recurrenceRule?: string;              // Single rule string
  recurringEventId?: string;            // Parent event ID for recurring instances

  // ===================
  // Visual & Classification
  // ===================
  colorId?: string;                     // Google Calendar color ID (1-11)
  priority?: 'high' | 'medium' | 'low';
  energyCost?: 'high' | 'medium' | 'low';
  eventType?: EventType;
  rationale?: string;                   // AI scheduling reasoning

  // ===================
  // Intelligence Fields (NEW - Research-Backed Scheduling)
  // ===================
  /** Cognitive load 1-5 for slot scoring (1=easy, 5=hard) */
  difficulty?: 1 | 2 | 3 | 4 | 5;
  /** Commitment device: prevents auto-reschedule when true */
  isLocked?: boolean;
  /** Task type for batching similar work together */
  cognitiveType?: CognitiveType;
  /** AI scheduling confidence 0-100 */
  aiConfidenceScore?: number;
  /** AI explanation for why this slot was chosen */
  schedulingReasoning?: string;

  // ===================
  // AI Metadata (NEW)
  // ===================
  aiMetadata?: AIMetadata;              // Rich AI context

  // ===================
  // Reminders
  // ===================
  reminders?: EventReminders;

  // ===================
  // Source & Sync
  // ===================
  source: EventSource;                  // Where this event came from
  externalId?: string;                  // Google Calendar event ID (for synced events)
  syncStatus: SyncStatus;               // Sync state with external calendar

  // ===================
  // AmbitionOS Specific (Legacy - kept for DB compatibility, now Dlulu Life)
  // @deprecated Use top-level fields instead. This will be removed in a future version.
  // ===================
  ambitionOsMeta?: AmbitionOsEventMeta; // Links to goals, phases, tasks

  // ===================
  // Timestamps
  // ===================
  created?: string;                     // ISO timestamp
  updated?: string;                     // ISO timestamp
  createdAt?: string;                   // Alternative naming
  updatedAt?: string;                   // Alternative naming
}

/**
 * AI Metadata container (NEW for Ambition Engine)
 */
export interface AIMetadata {
  progress?: {
    total_effort_minutes: number;
    cumulative_completed: number;
    this_session_contribution: number;
    remaining_after_this: number;
  };
  scheduling?: {
    generated_by: string;
    reasoning: string;
    alternatives?: string[];
    confidence_score?: number;
  };
  roadmap_snapshot?: {
    task_title: string;
    phase_title: string;
    goal_title: string;
  };
  habit?: {
    streak_count: number;
    last_completed: string;
    pattern_description: string;
  };
  /**
   * System metadata (non-AI) used for migrations and operational flags.
   * Stored in `calendar_events.ai_metadata` as JSONB.
   */
  system?: {
    timezoneFixed?: boolean;
    timezoneFixedAt?: string;
    origin?: string;
  };
}

/**
 * DateTime object (Google Calendar format)
 */
export interface EventDateTime {
  dateTime?: string;                    // ISO 8601 format: "2025-01-15T09:00:00" (omit for all-day)
  timeZone: string;                     // IANA timezone: "America/New_York"
  date?: string;                        // For all-day events: "2025-01-15"
}

/**
 * Event Reminders
 */
export interface EventReminders {
  useDefault: boolean;
  overrides?: {
    method: 'email' | 'popup';
    minutes: number;                    // Minutes before event
  }[];
}

/**
 * Event source tracking
 */
export type EventSource =
  | 'ambitionos'                        // Created by AmbitionOS
  | 'google_calendar'                   // Imported from Google Calendar
  | 'manual'                            // Manually created by user
  | 'recurring_instance';               // Generated from recurring event

/**
 * Sync status with external calendars
 */
export type SyncStatus =
  | 'local_only'                        // Not synced to external
  | 'synced'                            // In sync with external
  | 'pending_sync'                      // Needs to be pushed to external
  | 'sync_error';                       // Sync failed (needs attention)

/**
 * AmbitionOS-specific metadata for events
 */
export interface AmbitionOsEventMeta {
  // Links to goal hierarchy
  goalId?: string;
  phaseId?: string;
  milestoneId?: string;
  taskId?: string;

  // Event type
  eventType?: EventType;

  // Scheduling context
  rationale?: string;                   // AI-generated reason for this time slot
  priority?: 'high' | 'medium' | 'low';
  energyCost?: 'high' | 'medium' | 'low';

  // Status
  status?: EventStatus;
  completedAt?: string;
  skippedReason?: string;

  // Reschedule tracking
  originalStart?: string;               // Original time if rescheduled
  rescheduleCount?: number;
}

export type EventType =
  | 'goal_session'                      // Working on a goal
  | 'milestone_deadline'                // Milestone due date
  | 'habit'                             // Recurring habit
  | 'task'                              // One-time task
  | 'blocked'                           // Blocked time (work, sleep)
  | 'imported';                         // Imported from external calendar

/**
 * CognitiveType - Task type for intelligent scheduling
 * Research: Low context switching cost when batching similar types
 * Used for slot scoring and task batching optimization
 */
export type CognitiveType =
  | 'deep_work'                         // High focus: coding, writing, research
  | 'shallow_work'                      // Low focus: emails, admin, meetings
  | 'learning'                          // Skill acquisition: courses, reading
  | 'creative'                          // Creative work: design, brainstorming
  | 'admin';                            // Administrative: scheduling, organizing


export type EventStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'snoozed'
  | 'rescheduled'
  | 'missed';

// =============================================================================
// SCHEDULE GENERATION REQUEST/RESPONSE
// Used for Gemini API calls
// =============================================================================

/**
 * Request to Gemini for schedule generation
 */
export interface ScheduleGenerationRequest {
  // User context
  userProfile: {
    name?: string;
    role: string;
    chronotype: string;
    energyLevel: string;
    workStyle?: string;
  };

  // Time constraints
  constraints: {
    workBlocks: TimeBlockInput[];
    sleepStart: string;
    sleepEnd: string;
    peakProductivityStart: string;
    peakProductivityEnd: string;
    blockedSlots: TimeBlockInput[];
  };

  // Goals to schedule
  goals: GoalScheduleInput[];

  // Week to generate
  weekStartDate: string;                // ISO date
  weekEndDate: string;

  // Existing events (to avoid conflicts)
  existingEvents: ExistingEventInput[];
}

export interface TimeBlockInput {
  title: string;
  days: number[];                       // 0=Mon, 6=Sun
  start: string;                        // "09:00"
  end: string;                          // "17:00"
  type: 'work' | 'personal' | 'commute' | 'meal' | 'other';
  isFlexible: boolean;
}

export interface GoalScheduleInput {
  goalId: string;
  goalTitle: string;
  category: string;

  // Current phase info
  currentPhaseTitle: string;
  currentMilestones: string[];

  // Scheduling requirements
  sessionsPerWeek: number;
  minutesPerSession: number;
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'flexible';
  preferredDays?: number[];
  energyCost: 'high' | 'medium' | 'low';
}

export interface ExistingEventInput {
  title: string;
  dayOffset: number;                    // 0=Mon, 6=Sun
  startTime: string;
  endTime: string;
}

/**
 * Response from Gemini for schedule generation
 */
export interface ScheduleGenerationResponse {
  // Generated events
  events: GeneratedEvent[];

  // AI reasoning
  reasoning: string;

  // Warnings/conflicts
  warnings?: string[];

  // Stats
  totalSessions: number;
  totalMinutes: number;
}

export interface GeneratedEvent {
  // Identifiers
  goalId: string;
  goalTitle: string;

  // Event details
  title: string;                        // Activity title
  description: string;                  // What to do

  // Timing
  dayOffset: number;                    // 0=Mon, 6=Sun
  startTime: string;                    // "07:00"
  endTime: string;                      // "08:00"

  // Type
  eventType: 'goal_session' | 'habit' | 'task';

  // Context
  rationale: string;                    // Why this time slot
  energyCost: 'high' | 'medium' | 'low';

  // Recurrence (for habits)
  isRecurring: boolean;
  recurrenceRule?: string;
}

// =============================================================================
// DATE UTILITIES
// =============================================================================

export const DATE_FORMATS = {
  ISO_DATE: 'YYYY-MM-DD',               // "2025-01-15"
  ISO_DATETIME: 'YYYY-MM-DDTHH:mm:ss',  // "2025-01-15T09:00:00"
  TIME_24H: 'HH:mm',                    // "09:00"
  TIME_12H: 'h:mm A',                   // "9:00 AM"
  DISPLAY_DATE: 'MMM D, YYYY',          // "Jan 15, 2025"
  DISPLAY_SHORT: 'MMM D',               // "Jan 15"
  DAY_NAME: 'dddd',                     // "Monday"
  DAY_SHORT: 'ddd',                     // "Mon"
} as const;

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
] as const;

export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Google Calendar color IDs
export const GOOGLE_CALENDAR_COLORS = {
  '1': '#7986cb',  // Lavender
  '2': '#33b679',  // Sage
  '3': '#8e24aa',  // Grape
  '4': '#e67c73',  // Flamingo
  '5': '#f6c026',  // Banana
  '6': '#f5511d',  // Tangerine
  '7': '#039be5',  // Peacock
  '8': '#616161',  // Graphite
  '9': '#3f51b5',  // Blueberry
  '10': '#0b8043', // Basil
  '11': '#d60000', // Tomato
} as const;

// Category to color mapping for AmbitionOS
export const CATEGORY_COLORS = {
  health: '2',      // Sage (green)
  career: '7',      // Peacock (blue)
  learning: '3',    // Grape (purple)
  personal: '4',    // Flamingo (coral)
  financial: '5',   // Banana (yellow)
  relationships: '11', // Tomato (red)
} as const;
