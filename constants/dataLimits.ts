// =============================================================================
// Data Limits & Guardrails
// These constants define the maximum sizes for all data structures
// Used in both Gemini prompts and validation
// =============================================================================

export const DATA_LIMITS = {
  // Goals
  MAX_GOALS: 10,

  // Prerequisites per goal (status check)
  MAX_PREREQUISITES_PER_GOAL: 10,
  MIN_PREREQUISITES_PER_GOAL: 5,

  // Phases per goal - dynamic based on timeline (recommended: ceil(goalWeeks / 4))
  MAX_PHASES_PER_GOAL: 12,  // Increased from 10 to allow full goal breakdown
  MIN_PHASES_PER_GOAL: 2,

  // Milestones per phase
  MAX_MILESTONES_PER_PHASE: 10,
  MIN_MILESTONES_PER_PHASE: 1, // No minimum - let AI decide based on complexity

  // Tasks per milestone (roadmap)
  MAX_TASKS_PER_MILESTONE: 10,
  MIN_TASKS_PER_MILESTONE: 1, // No minimum - let AI decide based on complexity

  // SubTasks per task
  MAX_SUBTASKS_PER_TASK: 10,
  MIN_SUBTASKS_PER_TASK: 1, // No minimum - let AI decide based on complexity

  // Timeline limits
  MAX_TIMELINE_WEEKS: 520,
  MIN_TIMELINE_WEEKS: 0,

  // Schedule limits
  MAX_SESSIONS_PER_WEEK: 14,
  MIN_SESSIONS_PER_WEEK: 0,
  MAX_SESSION_DURATION: 180, // minutes
  MIN_SESSION_DURATION: 1, // minutes

  // Text field limits
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_NOTES_LENGTH: 1000,
  MAX_ADDITIONAL_CONTEXT_LENGTH: 2000,
} as const;

// =============================================================================
// Data Structure Examples (for prompt context)
// =============================================================================

export const EXAMPLE_GOAL_ANALYSIS = {
  title: "Learn Python Programming",
  originalInput: "I want to learn Python",
  category: "learning",
  timeline: "6 months",
  estimatedWeeks: 24,
  prerequisites: [
    { label: "Understand what programming is", order: 1 },
    { label: "Set up Python development environment", order: 2 },
    { label: "Learn basic syntax and data types", order: 3 },
    { label: "Write simple programs and scripts", order: 4 },
    { label: "Understand functions and modules", order: 5 },
    { label: "Work with files and external data", order: 6 },
    { label: "Build a complete project", order: 7 },
  ]
};

export const EXAMPLE_BLUEPRINT_PHASE = {
  number: 1,
  title: "Foundation",
  description: "Learn core Python syntax and basic programming concepts",
  estimatedDuration: "4 weeks",
  startWeek: 1,
  endWeek: 4,
  focus: ["Basic syntax", "Data types", "Control flow"],
  milestones: [
    {
      title: "Complete Python installation and setup",
      description: "Install Python, VS Code, and create first 'Hello World' program",
      targetWeek: 1
    },
    {
      title: "Master variables and data types",
      description: "Practice with strings, numbers, lists, and dictionaries",
      targetWeek: 2
    },
    {
      title: "Learn control flow",
      description: "Implement if/else statements and loops",
      targetWeek: 3
    },
    {
      title: "Write first automation script",
      description: "Create a script that automates a simple task",
      targetWeek: 4
    }
  ],
  coachAdvice: "Focus on hands-on practice. Don't just watch tutorials - code along and experiment."
};

export const EXAMPLE_ROADMAP_TASK = {
  id: "task-1",
  title: "Set up development environment",
  description: "Install and configure all necessary tools",
  startDay: 1,
  endDay: 3,
  durationDays: 3,
  timesPerWeek: 1,
  order: 1,
  isCompleted: false,
  isStrikethrough: false,
  subTasks: [
    { id: "st-1", title: "Download and install Python", order: 1, isCompleted: false, isStrikethrough: false },
    { id: "st-2", title: "Install VS Code", order: 2, isCompleted: false, isStrikethrough: false },
    { id: "st-3", title: "Install Python extension for VS Code", order: 3, isCompleted: false, isStrikethrough: false },
    { id: "st-4", title: "Create and run Hello World", order: 4, isCompleted: false, isStrikethrough: false },
  ]
};

