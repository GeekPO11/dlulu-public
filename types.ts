// =============================================================================
// Dlulu Life Type Definitions
// Hierarchical structure: Goal → Phase → Milestone → Task → SubTask
// =============================================================================

// -----------------------------------------------------------------------------
// View States
// -----------------------------------------------------------------------------
export enum ViewState {
  LANDING = 'LANDING',
  ONBOARDING = 'ONBOARDING',
  DASHBOARD = 'DASHBOARD',        // Main view after onboarding
  HISTORY = 'HISTORY',            // Goal history and library
  RELEASE_NOTES = 'RELEASE_NOTES' // Release notes view
}

// -----------------------------------------------------------------------------
// User Profile
// -----------------------------------------------------------------------------
export interface UserProfile {
  id: string;
  name: string;
  role: string;                   // "Senior Business Analyst", "Student", "Nurse", etc.
  roleContext?: string;           // Additional context like "DBA Student" or "Part-time"
  bio: string;                    // Life context, constraints, personality
  chronotype: Chronotype;
  workStyle: WorkStyle;
  energyLevel: EnergyLevel;
  userPreferences?: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export type Chronotype = 'early_bird' | 'night_owl' | 'midday_peak' | 'flexible';
export type WorkStyle = 'deep_work' | 'pomodoro' | 'flow' | 'reactive' | 'balanced';
export type EnergyLevel = 'high_octane' | 'balanced' | 'recovery';

export interface UserPreferences {
  walkthrough?: {
    onboardingSeen?: boolean;
    productTourSeen?: boolean;
  };
}

// -----------------------------------------------------------------------------
// Time Constraints (User's fixed schedule)
// -----------------------------------------------------------------------------
export interface TimeConstraints {
  // Work/blocked hours (no personal tasks)
  workBlocks: TimeBlock[];

  // Sleep window
  sleepStart: string;             // "22:30"
  sleepEnd: string;               // "06:30"

  // Peak productivity hours (for high-energy tasks)
  peakStart: string;              // "09:00"
  peakEnd: string;                // "12:00"

  // Other blocked times (lunch, commute, etc.)
  blockedSlots: TimeBlock[];

  // Date-specific overrides (one-off availability changes)
  timeExceptions?: TimeException[];
}

export interface TimeBlock {
  id: string;
  title: string;
  days: number[];                 // 0=Mon, 6=Sun
  start: string;                  // "09:00"
  end: string;                    // "17:00"
  type: 'work' | 'personal' | 'commute' | 'meal' | 'other';
  isFlexible: boolean;            // Can this be moved if needed?
  weekPattern?: 'default' | 'A' | 'B'; // Rotating weeks support
  timezone?: string;              // Optional timezone override
}

export interface TimeException {
  id: string;
  date: string;                   // "YYYY-MM-DD"
  start: string;                  // "09:00"
  end: string;                    // "12:00"
  isBlocked: boolean;             // True = block time, False = add availability
  reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// -----------------------------------------------------------------------------
// Goal (Top-level ambition)
// -----------------------------------------------------------------------------
export interface Goal {
  id: string;
  title: string;                  // "Learn Python", "Run a Marathon"
  originalInput: string;          // What user typed/selected
  category: GoalCategory;
  timeline: string;               // "6 months", "1 year"
  estimatedWeeks: number;         // Calculated from timeline

  // AI-generated strategy
  strategyOverview: string;       // High-level approach
  criticalGaps: string[];         // Risks and gaps identified
  overviewGenerated?: boolean;    // True once overview/gaps analysis is complete
  behaviorPlan?: BehaviorPlan;    // Behavior-change grounded plan
  priorityWeight?: number;        // 0-100 (default 50)
  riskLevel?: 'low' | 'medium' | 'high';
  riskAcknowledgedAt?: Date;
  intakeQuestions?: GoalIntakeQuestion[];
  intakeAnswers?: GoalIntakeAnswers;
  intakeSummary?: string;
  intakeSchemaVersion?: string;
  intakeUpdatedAt?: Date;

  // Phases (each goal has its own phases)
  phases: Phase[];

  // Tracking
  currentPhaseIndex: number;
  overallProgress: number;        // 0-100
  status: 'planning' | 'active' | 'paused' | 'completed' | 'abandoned';

  // History
  history: HistoryEntry[];

  // Scheduling preferences
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'flexible';
  frequency: number;              // times per week
  duration: number;               // minutes per session
  energyCost: 'high' | 'medium' | 'low';
  preferredDays?: number[];       // Specific days if pinned
  isScheduled?: boolean;          // Whether calendar events have been created

  createdAt: Date;
  updatedAt: Date;
}

export type GoalCategory = 'health' | 'career' | 'learning' | 'personal' | 'financial' | 'relationships';

export type GoalIntakeQuestionType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'single_select'
  | 'multi_select'
  | 'boolean'
  | 'date';

export type GoalIntakeQuestionSensitivity = 'general' | 'health' | 'finance' | 'relationships';

export interface GoalIntakeQuestionOption {
  id: string;
  label: string;
  value: string;
}

export interface GoalIntakeQuestion {
  id: string;
  fieldKey: string;
  question: string;
  helperText?: string;
  placeholder?: string;
  type: GoalIntakeQuestionType;
  required: boolean;
  options?: GoalIntakeQuestionOption[];
  min?: number;
  max?: number;
  unit?: string;
  sensitivity?: GoalIntakeQuestionSensitivity;
}

export type GoalIntakeAnswerValue = string | number | boolean | string[] | null;
export type GoalIntakeAnswers = Record<string, GoalIntakeAnswerValue>;

// ----------------------------------------------------------------------------- 
// Behavior Plan (Behavior-Change Grounded)
// -----------------------------------------------------------------------------

export interface BehaviorPlan {
  smart: {
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    timeBound: string;
  };
  woop: {
    wish: string;
    outcome: string;
    obstacles: string[];
    plan: string[];
  };
  implementationIntentions: Array<{
    if: string;
    then: string;
  }>;
  habitStacking: Array<{
    anchor: string;
    routine: string;
    reward?: string;
  }>;
  frictionReduction: {
    remove: string[];
    add: string[];
  };
}

// -----------------------------------------------------------------------------
// Phase (A stage within a goal)
// -----------------------------------------------------------------------------
export interface Phase {
  id: string;
  goalId: string;
  number: number;                 // 1, 2, 3...
  title: string;                  // "Foundation", "Building Momentum", etc.
  description: string;            // What this phase is about

  // Timeline
  startWeek: number;              // Week 1, 2, etc.
  endWeek: number;
  estimatedDuration: string;      // "4 weeks"

  // Focus areas for this phase
  focus: string[];                // ["Basic syntax", "Variables", "Functions"]

  // Milestones within this phase
  milestones: Milestone[];

  // Status
  status: 'upcoming' | 'active' | 'completed';
  progress: number;               // 0-100 based on milestone completion

  // AI coaching notes
  coachAdvice?: string;
}

// -----------------------------------------------------------------------------
// Milestone (Checkpoint within a phase)
// -----------------------------------------------------------------------------
export interface Milestone {
  id: string;
  phaseId: string;
  goalId: string;

  title: string;                  // "Complete Python basics course"
  description?: string;           // More detail if needed

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  // Tasks within this milestone (NEW: proper 4-level hierarchy)
  tasks: Task[];

  // Optional user-added details (e.g., book title, course name)
  userNotes?: string;
  attachments?: Attachment[];

  // For ordering
  order: number;
  targetWeek?: number;            // When this should be done
}

// -----------------------------------------------------------------------------
// Task (Actionable item within a milestone)
// This is the NEW layer between Milestone and SubTask
// -----------------------------------------------------------------------------
export interface Task {
  id: string;
  milestoneId: string;
  phaseId?: string;
  goalId?: string;

  title: string;                  // "Set up development environment"
  description?: string;           // More detail if needed

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  // For strike-through (when removed by AI but not deleted)
  isStrikethrough: boolean;
  strikethroughReason?: string;

  // Sub-tasks (checkbox items within this task)
  subTasks: SubTask[];

  // Scheduling hints
  startDay?: number;              // Day offset from phase start
  endDay?: number;
  durationDays?: number;
  estimatedMinutes?: number;      // Per-task duration estimate
  timesPerWeek?: number;

  // NEW: Intelligence Fields (Research-Backed Scheduling)
  /** Cognitive load 1-5 for slot scoring (1=easy, 5=hard) */
  difficulty?: 1 | 2 | 3 | 4 | 5;
  /** Task type for batching similar work together */
  cognitiveType?: 'deep_work' | 'shallow_work' | 'learning' | 'creative' | 'admin';

  // For ordering
  order: number;

  // Tracking
  createdAt?: Date;
  updatedAt?: Date;
}

// -----------------------------------------------------------------------------
// SubTask (Granular checkbox item within a task)
// -----------------------------------------------------------------------------
export interface SubTask {
  id: string;
  taskId?: string;                // Reference to parent task (optional for backward compatibility)
  milestoneId?: string;           // Legacy: for backward compatibility

  title: string;
  description?: string;

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  // For manual tasks added by user
  isManual: boolean;

  // For strike-through (when removed by AI but not deleted)
  isStrikethrough: boolean;
  strikethroughReason?: string;

  // For ordering
  order: number;

  // Tracking
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Attachment {
  id: string;
  type: 'note' | 'link' | 'image' | 'file';
  content: string;                // Text content or URL
  addedAt: Date;
}

// -----------------------------------------------------------------------------
// Commitment (Scheduled time block)
// -----------------------------------------------------------------------------
export interface Commitment {
  id: string;

  // Links to goal/phase/milestone
  goalId?: string;
  phaseId?: string;
  milestoneId?: string;

  // Basic info
  title: string;
  description?: string;

  // Timing
  start: Date;
  end: Date;
  duration: number;               // minutes

  // Type and source
  type: 'habit' | 'task' | 'event' | 'fixed';
  source: 'ambitionos' | 'imported' | 'manual'; // Note: 'ambitionos' is legacy DB value, now branded as Dlulu Life

  // Status tracking
  status: CommitmentStatus;
  completedAt?: Date;
  skippedReason?: string;
  snoozedTo?: Date;

  // Recurrence
  isRecurring: boolean;
  recurrenceRule?: RecurrenceRule;

  // For calendar sync (future)
  externalCalendarId?: string;
  isExported: boolean;

  // AI-generated context
  aiRationale?: string;           // Why this was scheduled here

  createdAt: Date;
  updatedAt: Date;
}

export type CommitmentStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'snoozed'
  | 'rescheduled'
  | 'missed';

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;               // Every N days/weeks/months
  daysOfWeek?: number[];          // For weekly: which days
  until?: Date;                   // End date
}

// -----------------------------------------------------------------------------
// History Entry (For tracking goal progress over time)
// -----------------------------------------------------------------------------
export interface HistoryEntry {
  id: string;
  goalId: string;
  timestamp: Date;

  type: HistoryEventType;

  // Flexible details based on type
  details: {
    title?: string;
    description?: string;
    milestoneId?: string;
    phaseId?: string;
    commitmentId?: string;
    notes?: string;
    previousValue?: any;
    newValue?: any;
  };
}

export type HistoryEventType =
  | 'goal_created'
  | 'phase_started'
  | 'phase_completed'
  | 'milestone_completed'
  | 'commitment_completed'
  | 'commitment_skipped'
  | 'note_added'
  | 'goal_paused'
  | 'goal_resumed'
  | 'schedule_adjusted';

// -----------------------------------------------------------------------------
// Prerequisite (For status check during onboarding)
// -----------------------------------------------------------------------------
export interface Prerequisite {
  id: string;
  goalTitle: string;              // Which goal this belongs to
  label: string;                  // The milestone description
  isCompleted: boolean;           // User checked this off
  userNotes?: string;             // Optional details user can add (e.g., "Book: Clean Code")
  order: number;                  // Display order (beginner → advanced)
}

// Additional context user can provide per goal during status check
export interface GoalStatusContext {
  goalTitle: string;
  additionalNotes: string;        // Free-form text about what else user has done
  completedPrerequisites: string[]; // Labels of checked prerequisites
  skippedPrerequisites: string[]; // Labels of unchecked prerequisites
  prerequisiteComments?: Record<string, string>; // ID/Label -> comment
  intakeResponses?: GoalIntakeAnswers;
  intakeMissingRequired?: string[];
}

// -----------------------------------------------------------------------------
// AI Response Types (Structured outputs from Gemini)
// -----------------------------------------------------------------------------

// Response from initial ambition analysis
export interface AmbitionAnalysisResponse {
  goals: GoalAnalysis[];
}

export interface GoalAnalysis {
  title: string;
  originalInput: string;
  category: GoalCategory;
  timeline: string;
  estimatedWeeks: number;
  intakeQuestions?: GoalIntakeQuestion[];

  // Prerequisites for status check
  prerequisites: {
    label: string;
    order: number;                // 1 = most basic, higher = more advanced
  }[];
}

// Response from gap analysis (after status check)
export interface GapAnalysisResponse {
  goals: GoalBlueprint[];
}

export interface GoalBlueprint {
  goalTitle: string;
  timeline: string;
  strategyOverview: string;
  criticalGaps: string[];
  behaviorPlan?: BehaviorPlan;
  riskLevel?: 'low' | 'medium' | 'high';

  phases: PhaseBlueprint[];

  suggestedSchedule: {
    frequency: number;
    duration: number;
    preferredTime: 'morning' | 'afternoon' | 'evening';
    energyCost: 'high' | 'medium' | 'low';
  };
}

export interface PhaseBlueprint {
  number: number;
  title: string;
  description: string;
  estimatedDuration: string;
  startWeek: number;
  endWeek: number;
  focus: string[];

  milestones: {
    title: string;
    description?: string;
    targetWeek: number;
  }[];

  coachAdvice: string;
}

// Response from schedule generation
export interface ScheduleGenerationResponse {
  weeklySchedule: ScheduledBlock[];
  reasoning: string;
}

export interface ScheduledBlock {
  goalId: string;
  goalTitle: string;
  title: string;                  // Activity title
  dayOffset: number;              // 0=Mon, 6=Sun
  startTime: string;              // "07:00"
  endTime: string;                // "08:00"
  type: 'habit' | 'task';
  rationale: string;              // Why scheduled here
}

// -----------------------------------------------------------------------------
// Roadmap Types (Mind-map style visualization)
// -----------------------------------------------------------------------------
export interface Roadmap {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  // All goals included in this roadmap
  goals: RoadmapGoal[];

  // Total timeline
  totalWeeks: number;
  startDate: Date;

  // Refinement history (user's chat with Gemini)
  refinementHistory: RefinementEntry[];

  // Metadata
  version: number;                // Increments on each Gemini refinement
}

export interface RoadmapGoal {
  goalId: string;
  goalTitle: string;
  category: GoalCategory;
  strategyOverview?: string; // Added for context display

  // Timeline visualization
  startWeek: number;
  endWeek: number;
  totalDays: number;

  // Tasks grouped by phase
  phases: RoadmapPhase[];

  // Overall scheduling
  sessionsPerWeek: number;
  minutesPerSession: number;
  preferredTimeSlot: 'morning' | 'afternoon' | 'evening' | 'flexible';

  // Is this goal expanded in the mind-map?
  isExpanded: boolean;
}

export interface RoadmapPhase {
  phaseId: string;
  phaseNumber: number;
  title: string;
  description: string;

  // Timeline
  startWeek: number;
  endWeek: number;
  durationDays: number;

  // Tasks within this phase
  tasks: RoadmapTask[];

  // Coach advice
  coachAdvice: string;

  // Is this phase expanded in the mind-map?
  isExpanded: boolean;
}

export interface RoadmapTask {
  id: string;
  phaseId: string;

  title: string;
  description?: string;

  // Timeline
  startDay: number;               // Day offset from roadmap start
  endDay: number;
  durationDays: number;

  // Frequency
  timesPerWeek: number;

  // Sub-tasks (checkbox items)
  subTasks: RoadmapSubTask[];

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  // For strike-through (if removed but not deleted)
  isStrikethrough: boolean;
  strikethroughReason?: string;

  // Ordering and expansion
  order: number;
  isExpanded: boolean;
}

export interface RoadmapSubTask {
  id: string;
  taskId: string;

  title: string;

  // Status
  isCompleted: boolean;
  completedAt?: Date;

  // For manual additions
  isManual: boolean;

  description?: string; // Added for Task Column display

  // For strike-through
  isStrikethrough: boolean;

  order: number;
}

// -----------------------------------------------------------------------------
// Refinement Types (For Gemini-powered edits)
// -----------------------------------------------------------------------------
export interface RefinementEntry {
  id: string;
  timestamp: Date;

  // What the user asked
  userRequest: string;

  // AI's response summary
  aiSummary: string;

  // What changed
  changes: RefinementChange[];
}

export interface RefinementChange {
  type: 'added' | 'modified' | 'removed' | 'checked' | 'unchecked';

  // What was affected
  targetType: 'goal' | 'phase' | 'task' | 'subtask';
  targetId: string;
  targetTitle: string;

  // Before/after (for modifications)
  previousValue?: string;
  newValue?: string;
}

// Request to Gemini for roadmap refinement
export interface RoadmapRefinementRequest {
  // Current roadmap state
  currentRoadmap: Roadmap;

  // User's profile context (use Partial<UserProfile> for consistency)
  userProfile: Partial<UserProfile>;

  // What the user is asking
  userRequest: string;

  // Which part of the roadmap user is focused on (optional)
  focusedGoalId?: string;
  focusedPhaseId?: string;
  focusedTaskId?: string;
}

// Response from Gemini for roadmap refinement
export interface RoadmapRefinementResponse {
  // Updated roadmap (same structure, Gemini fills in changes)
  updatedRoadmap: Roadmap;

  // Summary of what changed
  changeSummary: string;

  // Detailed changes for history
  changes: RefinementChange[];

  // Any coaching notes
  coachNotes?: string;
}

// Request to Gemini for phase-level help
export interface PhaseRefinementRequest {
  // Current phase state
  currentPhase: RoadmapPhase;

  // Goal context
  goal: {
    title: string;
    category: string;
    timeline: string;
  };

  // All tasks in this phase with their completion status
  tasks: {
    id: string;
    title: string;
    isCompleted: boolean;
    subTasks: {
      id: string;
      title: string;
      isCompleted: boolean;
      isStrikethrough: boolean;
    }[];
  }[];

  // User context
  userProfile: {
    role: string;
    bio?: string;
  };

  // What the user is asking
  userRequest: string;
}

// Response from Gemini for phase-level refinement
export interface PhaseRefinementResponse {
  // Updated tasks (preserves completion state where unchanged)
  updatedTasks: {
    id: string;
    title: string;
    isCompleted: boolean;             // Preserved unless user asked to change
    isStrikethrough: boolean;         // True if task should be struck through
    strikethroughReason?: string;
    subTasks: {
      id: string;
      title: string;
      isCompleted: boolean;
      isStrikethrough: boolean;
      isNew?: boolean;                // Flag for newly added tasks
    }[];
  }[];

  // Summary of changes
  changeSummary: string;

  // Coach notes
  coachNotes?: string;
}

// -----------------------------------------------------------------------------
// Chat Types
// -----------------------------------------------------------------------------
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;

  // For grounded responses
  sources?: {
    type: 'web' | 'maps';
    url: string;
    title?: string;
  }[];
}

// -----------------------------------------------------------------------------
// App State (for Zustand store)
// -----------------------------------------------------------------------------
export interface AppState {
  // User
  user: UserProfile | null;
  isAuthenticated: boolean;

  // Planning
  constraints: TimeConstraints | null;
  goals: Goal[];
  commitments: Commitment[];

  // Current view
  currentView: ViewState;
  selectedDate: Date;

  // Onboarding state
  onboardingStep: number;
  onboardingData: OnboardingData | null;

  // UI state
  isLoading: boolean;
  loadingMessage: string;
}

export interface OnboardingData {
  // Step 1: Profile
  profile: Partial<UserProfile>;

  // Step 2: Ambitions
  ambitionInput: string;
  selectedAmbitions: string[];

  // Step 3: Status (prerequisites)
  analysisResult: AmbitionAnalysisResponse | null;
  prerequisites: Prerequisite[];
  userContext: string;            // Additional context user provides

  // Step 4: Blueprint
  blueprintResult: GapAnalysisResponse | null;
  selectedGoals: Goal[];

  // Step 5: Boundaries
  constraints: Partial<TimeConstraints>;
  uploadedRoster: RosterUpload | null;

  // Step 6: Refinement
  refinedGoals: Goal[];
}

export interface RosterUpload {
  type: 'image' | 'pdf';
  base64: string;
  extractedBlocks: TimeBlock[];
  isConfirmed: boolean;
}

// -----------------------------------------------------------------------------
// Utility Types
// -----------------------------------------------------------------------------
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// For date/time formatting
export interface DateRange {
  start: Date;
  end: Date;
}

// =============================================================================
// BACKWARD COMPATIBILITY TYPES
// These maintain compatibility with the old geminiService.ts
// =============================================================================

// Legacy UserConstraints (maps to TimeConstraints)
export interface UserConstraints {
  workStart: string;
  workEnd: string;
  sleepStart: string;
  sleepEnd: string;
  peakStart?: string;
  peakEnd?: string;
}

// Legacy FixedEvent
export interface FixedEvent {
  id?: string;
  title: string;
  days: number[];
  start: string;
  end: string;
  type: 'fixed' | 'recurring';
}

// Legacy Milestone (old format)
export interface LegacyMilestone {
  id: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  targetWeek?: number;
}

// Legacy AmbitionAnalysis (old format from gap analysis)
export interface AmbitionAnalysis {
  ambition: string;
  timeline: string;
  currentPhase: string;
  strategyOverview: string;
  criticalQuestions: string[];
  suggestedGoals: LegacyGoal[];
}

// Legacy Goal (old format)
export interface LegacyGoal {
  id: string;
  title: string;
  category: string;
  frequency: number;
  duration: number;
  preferredTime: string;
  level?: string;
  energyCost: string;
  rationale?: string;
  parentAmbition?: string;
  roadmap?: LegacyMilestone[];
  progress?: number;
  preferredDays?: number[];
}

// Legacy Prerequisite (old format with 'checked' and 'ambition')
export interface LegacyPrerequisite {
  id: string;
  label: string;
  checked: boolean;
  ambition?: string;
  timeline?: string;
}
