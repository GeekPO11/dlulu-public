// =============================================================================
// Scheduling Service
// Generates FULL TIMELINE schedules covering all goal phases
// =============================================================================

import { ai, MODELS, parseJsonSafe } from "./client";
import { buildUserContext, buildConstraintContext, COACH_SYSTEM_INSTRUCTION } from "./context";
import { logger } from "../../lib/logger";
import { DATA_LIMITS } from "../../constants/dataLimits";
import { callEdgeFunction } from "../../lib/supabase";
import {
  CalendarEvent,
  CATEGORY_COLORS,
  DAYS_SHORT,
} from "../../constants/calendarTypes";
import {
  toISODate,
  getWeekStart,
  getDateFromOffset,
  combineDateAndTime,
  generateId,
  getLocalTimeZone,
} from "../../utils/dateUtils";
import { UserProfile, Goal, TimeConstraints, TimeBlock, Phase } from "../../types";

// =============================================================================
// Types for Full Schedule Generation
// =============================================================================

interface FullScheduleInput {
  profile: Partial<UserProfile>;
  goals: Goal[];
  constraints: TimeConstraints;
  startDate: Date;
}

interface FullScheduleOutput {
  events: CalendarEvent[];
  masterPlan: MasterPlan;
  reasoning: string;
}

interface MasterPlan {
  totalWeeks: number;
  phaseSchedules: PhaseSchedule[];
  weeklyPattern: WeeklyPattern;
}

interface PhaseSchedule {
  goalId: string;
  goalTitle: string;
  phaseId: string;
  phaseTitle: string;
  phaseNumber: number;
  startWeek: number;
  endWeek: number;
  weeklyTasks: WeeklyTaskTemplate[];
  milestoneDeadlines: MilestoneDeadline[];
}

interface WeeklyTaskTemplate {
  dayOfWeek: number;  // 0=Mon, 6=Sun
  startTime: string;  // "07:00"
  endTime: string;    // "08:00"
  title: string;
  description: string;
  focusArea: string;
  energyCost: 'high' | 'medium' | 'low';
}

interface MilestoneDeadline {
  milestoneId: string;
  title: string;
  weekNumber: number;
  isCheckpoint: boolean;
}

interface WeeklyPattern {
  slots: PatternSlot[];
}

interface PatternSlot {
  goalId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
}

// =============================================================================
// Generate Full Timeline Schedule
// Creates calendar events for the ENTIRE goal timeline
// =============================================================================

export const generateFullSchedule = async (
  input: FullScheduleInput
): Promise<FullScheduleOutput> => {
  const { profile, goals, constraints, startDate } = input;

  // Generating FULL schedule for goals

  // Calculate total timeline
  const maxWeeks = Math.max(...goals.map(g => g.estimatedWeeks || 24));

  // Build comprehensive goal context with ALL phases
  const goalsWithPhases = goals.map(g => ({
    goalId: g.id,
    goalTitle: g.title,
    category: g.category,
    estimatedWeeks: g.estimatedWeeks || 24,
    timeline: g.timeline,
    sessionsPerWeek: g.frequency || 3,
    minutesPerSession: g.duration || 45,
    preferredTime: g.preferredTime || 'morning',
    preferredDays: g.preferredDays || [0, 2, 4], // Mon, Wed, Fri default
    energyCost: g.energyCost || 'medium',
    phases: g.phases.map((p, idx) => ({
      phaseId: p.id,
      phaseNumber: p.number || idx + 1,
      phaseTitle: p.title,
      description: p.description,
      startWeek: p.startWeek || (idx * Math.ceil((g.estimatedWeeks || 24) / g.phases.length)) + 1,
      endWeek: p.endWeek || ((idx + 1) * Math.ceil((g.estimatedWeeks || 24) / g.phases.length)),
      focusAreas: p.focus || [],
      milestones: p.milestones.map(m => ({
        milestoneId: m.id,
        title: m.title,
        targetWeek: m.targetWeek,
        isCompleted: m.isCompleted,
      })),
    })),
  }));

  const userContext = buildUserContext(profile, true);
  const constraintContext = buildConstraintContext(constraints);

  const prompt = `You are an expert strategic planner creating a COMPLETE schedule for the user's entire goal timeline.

## USER PROFILE
${userContext}

## TIME CONSTRAINTS (BLOCKED TIMES - NEVER SCHEDULE HERE)
${constraintContext}

## GOALS WITH COMPLETE PHASE BREAKDOWN
${JSON.stringify(goalsWithPhases, null, 2)}

## SCHEDULE PARAMETERS
- Start Date: ${toISODate(startDate)}
- Total Timeline: ${maxWeeks} weeks
- Days of week: ${DAYS_SHORT.map((d, i) => `${d}=${i}`).join(', ')}

## YOUR TASK

Create a MASTER SCHEDULE that covers the ENTIRE timeline for ALL goals and phases.

For each goal:
1. Map phases to specific week ranges (e.g., Phase 1: Weeks 1-4, Phase 2: Weeks 5-8)
2. Create a WEEKLY RECURRING PATTERN for each phase
3. Set milestone checkpoints at the right weeks
4. Ensure sessions align with user's preferred time and energy patterns

## SCHEDULING RULES

1. **Phase Progression**: Each phase must have dedicated weeks, don't overlap phases
2. **Session Frequency**: Match the goal's sessionsPerWeek exactly
3. **Time Alignment**: 
   - early_bird → Schedule 5am-10am
   - midday_peak → Schedule 10am-2pm
   - night_owl → Schedule 6pm-11pm
   - flexible → Any available slot
4. **Energy Matching**: High-energy tasks in peak hours, low-energy tasks anytime
5. **Avoid Conflicts**: Never schedule during work, sleep, or blocked times
6. **Balance**: Spread goal sessions across different days
7. **Buffer**: Leave 15+ min between sessions

## OUTPUT FORMAT (JSON)

{
  "masterPlan": {
    "totalWeeks": ${maxWeeks},
    "phaseSchedules": [
      {
        "goalId": "string - exact from input",
        "goalTitle": "string - exact from input",
        "phaseId": "string - exact from input",
        "phaseTitle": "string - phase title",
        "phaseNumber": number,
        "startWeek": number (1-indexed),
        "endWeek": number (1-indexed),
        "weeklyTasks": [
          {
            "dayOfWeek": number (0=Mon, 6=Sun),
            "startTime": "HH:mm",
            "endTime": "HH:mm",
            "title": "Specific task title for this phase",
            "description": "What to do in this session",
            "focusArea": "Which phase focus area this addresses",
            "energyCost": "high|medium|low"
          }
        ],
        "milestoneDeadlines": [
          {
            "milestoneId": "string",
            "title": "Milestone title",
            "weekNumber": number,
            "isCheckpoint": boolean
          }
        ]
      }
    ],
    "weeklyPattern": {
      "slots": [
        {
          "goalId": "string",
          "dayOfWeek": number,
          "startTime": "HH:mm",
          "endTime": "HH:mm",
          "isRecurring": true
        }
      ]
    }
  },
  "reasoning": "Explanation of your scheduling strategy",
  "warnings": ["Any potential issues or conflicts"]
}

## EXAMPLE PHASE SCHEDULE

{
  "goalId": "goal-learn-python",
  "goalTitle": "Learn Python",
  "phaseId": "phase-1",
  "phaseTitle": "Python Fundamentals",
  "phaseNumber": 1,
  "startWeek": 1,
  "endWeek": 4,
  "weeklyTasks": [
    {
      "dayOfWeek": 0,
      "startTime": "07:00",
      "endTime": "08:00",
      "title": "Python Basics: Variables & Types",
      "description": "Work through Python fundamentals, practice exercises",
      "focusArea": "Core syntax and data types",
      "energyCost": "high"
    },
    {
      "dayOfWeek": 2,
      "startTime": "07:00",
      "endTime": "08:00",
      "title": "Python Practice: Control Flow",
      "description": "Loops, conditionals, practice problems",
      "focusArea": "Control structures",
      "energyCost": "high"
    }
  ],
  "milestoneDeadlines": [
    {
      "milestoneId": "milestone-1",
      "title": "Complete Python basics course",
      "weekNumber": 2,
      "isCheckpoint": true
    }
  ]
}

CRITICAL REQUIREMENTS:
1. Cover ALL phases for ALL goals across the FULL timeline
2. Use EXACT IDs from input (goalId, phaseId, milestoneId)
3. Each phase's weeklyTasks should repeat every week within that phase's range
4. Total weekly sessions per goal = goal's sessionsPerWeek
5. Milestone deadlines should fall within their phase's week range
6. Never schedule during blocked times (work, sleep, meals)`;

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

    // Full schedule response received

    const result = parseJsonSafe<{
      masterPlan: MasterPlan;
      reasoning: string;
      warnings?: string[];
    }>(response.text || "", {
      masterPlan: { totalWeeks: maxWeeks, phaseSchedules: [], weeklyPattern: { slots: [] } },
      reasoning: "Schedule generation failed"
    });

    // Generate all calendar events from the master plan
    const events = generateEventsFromMasterPlan(
      result.masterPlan,
      startDate,
      goals
    );

    // Schedule generation complete

    return {
      events,
      masterPlan: result.masterPlan,
      reasoning: result.reasoning,
    };
  } catch (error) {
    logger.error('[Gemini/Scheduling] Full schedule error', error);
    throw error;
  }
};

// =============================================================================
// Generate Events from Master Plan
// Expands the master plan into individual calendar events
// =============================================================================

const generateEventsFromMasterPlan = (
  masterPlan: MasterPlan,
  startDate: Date,
  goals: Goal[]
): CalendarEvent[] => {
  const events: CalendarEvent[] = [];

  const weekStart = getWeekStart(startDate);

  // Process each phase schedule
  for (const phaseSchedule of masterPlan.phaseSchedules) {
    const goal = goals.find(g => g.id === phaseSchedule.goalId);
    if (!goal) continue;

    const colorId = CATEGORY_COLORS[goal.category as keyof typeof CATEGORY_COLORS] || '7';

    // Generate events for each week in this phase
    for (let weekNum = phaseSchedule.startWeek; weekNum <= phaseSchedule.endWeek; weekNum++) {
      const weekOffset = (weekNum - 1) * 7;
      const thisWeekStart = new Date(weekStart);
      thisWeekStart.setDate(thisWeekStart.getDate() + weekOffset);

      // Week start is used to anchor dates for this phase schedule.

      // Create events for each weekly task
      for (const taskTemplate of phaseSchedule.weeklyTasks) {
        const eventDate = new Date(thisWeekStart);
        eventDate.setDate(eventDate.getDate() + taskTemplate.dayOfWeek);

        const [startHour, startMin] = taskTemplate.startTime.split(':').map(Number);
        const [endHour, endMin] = taskTemplate.endTime.split(':').map(Number);

        const startDateTime = new Date(eventDate);
        startDateTime.setHours(startHour, startMin, 0, 0);

        const endDateTime = new Date(eventDate);
        endDateTime.setHours(endHour, endMin, 0, 0);

        const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);

        // Create calendar event
        const event: CalendarEvent = {
          id: generateId('event'),
          summary: taskTemplate.title,
          description: taskTemplate.description,
          start: {
            dateTime: startDateTime.toISOString().slice(0, 19),
            timeZone: getLocalTimeZone(),
          },
          end: {
            dateTime: endDateTime.toISOString().slice(0, 19),
            timeZone: getLocalTimeZone(),
          },
          colorId,
          source: 'ambitionos',
          syncStatus: 'local_only',
          ambitionOsMeta: {
            goalId: phaseSchedule.goalId,
            phaseId: phaseSchedule.phaseId,
            eventType: 'goal_session',
            rationale: `Phase ${phaseSchedule.phaseNumber}: ${phaseSchedule.phaseTitle} - Focus: ${taskTemplate.focusArea}`,
            energyCost: taskTemplate.energyCost,
            status: 'scheduled',
            rescheduleCount: 0,
          },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        events.push(event);
      }

      // Add milestone deadline events
      for (const milestone of phaseSchedule.milestoneDeadlines) {
        if (milestone.weekNumber === weekNum) {
          // Create milestone deadline event (end of week, Friday)
          const milestoneDate = new Date(thisWeekStart);
          milestoneDate.setDate(milestoneDate.getDate() + 4); // Friday

          const milestoneEvent: CalendarEvent = {
            id: generateId('milestone'),
            summary: `📌 ${milestone.title}`,
            description: `Milestone checkpoint for ${phaseSchedule.goalTitle}`,
            start: {
              date: toISODate(milestoneDate),
              timeZone: getLocalTimeZone(),
            },
            end: {
              date: toISODate(milestoneDate),
              timeZone: getLocalTimeZone(),
            },
            colorId,
            source: 'ambitionos',
            syncStatus: 'local_only',
            ambitionOsMeta: {
              goalId: phaseSchedule.goalId,
              phaseId: phaseSchedule.phaseId,
              milestoneId: milestone.milestoneId,
              eventType: 'milestone_deadline',
              rationale: `Week ${weekNum} checkpoint`,
              energyCost: 'medium',
              status: 'scheduled',
              rescheduleCount: 0,
            },
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          };

          events.push(milestoneEvent);
        }
      }
    }
  }

  return events;
};

// =============================================================================
// Generate Weekly Schedule (Legacy - for single week)
// =============================================================================

interface GenerateScheduleInput {
  profile: Partial<UserProfile>;
  goals: Goal[];
  constraints: TimeConstraints;
  weekStartDate: Date;
  existingEvents?: CalendarEvent[];
}

export const generateWeeklySchedule = async (
  input: GenerateScheduleInput
): Promise<{ events: CalendarEvent[]; reasoning: string }> => {
  // Use the full schedule generator and extract just the first week
  const result = await generateFullSchedule({
    profile: input.profile,
    goals: input.goals,
    constraints: input.constraints,
    startDate: input.weekStartDate,
  });

  const weekKey = toISODate(getWeekStart(input.weekStartDate));

  // Filter events for just this week
  const weekEvents = result.events.filter(e => {
    const eventDate = e.start.dateTime?.slice(0, 10) || e.start.date;
    return eventDate?.startsWith(weekKey.slice(0, 7));
  });

  return {
    events: weekEvents,
    reasoning: result.reasoning,
  };
};

// =============================================================================
// Auto-Fix Schedule (When conflicts arise)
// =============================================================================

interface AutoFixInput {
  event: CalendarEvent;
  conflict: string;
  constraints: TimeConstraints;
  existingEvents: CalendarEvent[];
}

export const autoFixSchedule = async (
  input: AutoFixInput
): Promise<{ suggestions: { startTime: string; endTime: string; dayOffset: number; reason: string }[] }> => {
  const { event, conflict, constraints, existingEvents } = input;

  const constraintContext = buildConstraintContext(constraints);

  const existingSlots = existingEvents.map(e => ({
    day: new Date(e.start.dateTime || e.start.date || '').getDay(),
    start: e.start.dateTime?.slice(11, 16) || '00:00',
    end: e.end.dateTime?.slice(11, 16) || '23:59',
  }));

  const prompt = `A scheduling conflict has occurred. Suggest 3 alternative time slots.

## CONFLICT
${conflict}

## EVENT TO RESCHEDULE
Title: ${event.summary}
Current time: ${event.start.dateTime?.slice(11, 16)} - ${event.end.dateTime?.slice(11, 16)}
Duration: ${event.description}

## USER CONSTRAINTS
${constraintContext}

## ALREADY SCHEDULED (avoid these)
${JSON.stringify(existingSlots, null, 2)}

## OUTPUT FORMAT (JSON)
{
  "suggestions": [
    {
      "dayOffset": number (0=Mon, 6=Sun),
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "reason": "Why this slot works"
    }
  ]
}

Provide exactly 3 alternatives that:
- Don't conflict with constraints or existing events
- Maintain the same duration
- Fit the event's energy requirements`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.FAST,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.7
      }
    });

    return parseJsonSafe(
      response.text || "",
      { suggestions: [] }
    );
  } catch (error) {
    logger.error('[Gemini/Scheduling] Auto-fix error', error);
    throw error;
  }
};

// =============================================================================
// Parse Uploaded Roster Image/PDF
// =============================================================================

interface ParseRosterInput {
  base64Data: string;
  mimeType: string;
}

export const parseRosterImage = async (
  input: ParseRosterInput
): Promise<TimeBlock[]> => {
  const { base64Data, mimeType } = input;

  const prompt = `Analyze this schedule/roster image and extract all recurring time blocks.

For each block, identify:
- Title (what the event is)
- Days of the week (0=Monday, 6=Sunday)
- Start time (24hr format, e.g., "09:00")
- End time (24hr format, e.g., "17:00")
- Type: "work", "personal", "commute", "meal", or "other"

## OUTPUT FORMAT (JSON Array)
[
  {
    "id": "block-1",
    "title": "Work Hours",
    "days": [0, 1, 2, 3, 4],
    "start": "09:00",
    "end": "17:00",
    "type": "work",
    "isFlexible": false
  },
  {
    "id": "block-2",
    "title": "Lunch Break",
    "days": [0, 1, 2, 3, 4],
    "start": "12:00",
    "end": "13:00",
    "type": "meal",
    "isFlexible": true
  }
]

Be thorough - extract ALL visible time blocks from the image.
Use 24-hour time format.
Day 0 = Monday, Day 6 = Sunday.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.VISION,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        temperature: 0.3
      }
    });

    // Roster parsed

    return parseJsonSafe<TimeBlock[]>(response.text || "", []);
  } catch (error) {
    logger.error('[Gemini/Scheduling] Roster parse error', error);
    throw error;
  }
};

// =============================================================================
// Generate Schedule for a Single Phase (Per-Phase Calendar Building)
// Checks for conflicts with existing events
// =============================================================================

export interface GeneratePhaseScheduleInput {
  profile: Partial<UserProfile>;
  goal: Goal;
  phase: Phase;
  constraints: TimeConstraints;
  existingEvents: CalendarEvent[];  // All existing calendar events for conflict detection
  startDate?: Date;  // When to start scheduling (defaults to today)
}

export interface GeneratePhaseScheduleOutput {
  events: CalendarEvent[];
  conflictsDetected: ConflictInfo[];
  reasoning: string;
}

interface ConflictInfo {
  proposedTime: string;
  conflictingEventId: string;
  conflictingEventTitle: string;
  resolution: 'moved' | 'skipped' | 'override';
  newTime?: string;
}

export const generatePhaseSchedule = async (
  input: GeneratePhaseScheduleInput
): Promise<GeneratePhaseScheduleOutput> => {
  const { profile, goal, phase, constraints, existingEvents, startDate = new Date() } = input;

  // Generating schedule for phase

  // Build context
  const userContext = buildUserContext(profile);
  const constraintContext = buildConstraintContext(constraints);

  // Get blocked time slots from existing events
  const blockedSlots = existingEvents.map(e => ({
    date: e.start.date || e.start.dateTime?.slice(0, 10),
    start: e.start.dateTime?.slice(11, 16) || '00:00',
    end: e.end.dateTime?.slice(11, 16) || '23:59',
    title: e.summary,
    id: e.id,
  }));

  // Calculate phase duration in weeks
  const phaseDuration = (phase.endWeek - phase.startWeek) || 4;
  const phaseStartDate = getDateFromOffset(startDate, (phase.startWeek - 1) * 7);

  // Build prompt for phase-specific scheduling
  const prompt = `You are scheduling calendar events for ONE PHASE of a user's ambition.

## USER CONTEXT
${userContext}

## TIME CONSTRAINTS
${constraintContext}

## AMBITION CONTEXT
- Ambition: ${goal.title}
- Category: ${goal.category}
- Overall Timeline: ${goal.timeline}
- Preferred Time: ${goal.preferredTime}
- Frequency: ${goal.frequency}x per week
- Session Duration: ${goal.duration} minutes
- Energy Cost: ${goal.energyCost}

## PHASE TO SCHEDULE
- Phase: ${phase.number} - ${phase.title}
- Description: ${phase.description}
- Duration: Week ${phase.startWeek} to Week ${phase.endWeek} (${phaseDuration} weeks)
- Phase Start Date: ${phaseStartDate.toISOString().slice(0, 10)}
- Focus Areas: ${phase.focus.join(', ') || 'General'}

## MILESTONES IN THIS PHASE
${phase.milestones.map((m, i) => `${i + 1}. ${m.title} (Week ${m.targetWeek})`).join('\n')}

## ALREADY BLOCKED TIME SLOTS (DO NOT OVERLAP)
${blockedSlots.slice(0, 50).map(s => `- ${s.date} ${s.start}-${s.end}: ${s.title}`).join('\n') || 'None'}

## YOUR TASK
Create calendar events for this phase that:
1. Respect the user's constraints and chronotype
2. Avoid ALL blocked time slots listed above
3. Schedule ${goal.frequency} sessions per week
4. Each session is ${goal.duration} minutes
5. Cover all ${phaseDuration} weeks of the phase
6. Include milestone checkpoints at appropriate weeks

## OUTPUT FORMAT (JSON)
{
  "events": [
    {
      "week": number (1-${phaseDuration}, relative to phase start),
      "dayOfWeek": number (0=Mon, 6=Sun),
      "startTime": "HH:mm",
      "endTime": "HH:mm",
      "title": "Session title related to focus area",
      "description": "What to focus on this session",
      "isMilestoneCheckpoint": boolean (true if this is a milestone review)
    }
  ],
  "conflicts": [
    {
      "proposedTime": "YYYY-MM-DD HH:mm",
      "reason": "Why this slot was unavailable",
      "resolution": "moved to alternative time"
    }
  ],
  "reasoning": "Brief explanation of scheduling decisions"
}

CRITICAL: Generate events for ALL ${phaseDuration} weeks of the phase.
Each week should have ${goal.frequency} sessions.
Total events expected: approximately ${phaseDuration * goal.frequency} events.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.5,
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const parsed = parseJsonSafe<{
      events: Array<{
        week: number;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        title: string;
        description?: string;
        isMilestoneCheckpoint?: boolean;
      }>;
      conflicts: Array<{
        proposedTime: string;
        reason: string;
        resolution: string;
      }>;
      reasoning: string;
    }>(response.text || "", { events: [], conflicts: [], reasoning: "" });

    // Phase schedule generated

    const timezone = getLocalTimeZone();
    const calendarEvents: CalendarEvent[] = [];

    // Convert Gemini events to CalendarEvent format
    for (const event of parsed.events) {
      const eventDate = getDateFromOffset(phaseStartDate, (event.week - 1) * 7 + event.dayOfWeek);
      const eventId = generateId();

      // Create CalendarEvent
      const startDateTime = combineDateAndTime(eventDate, event.startTime);
      const endDateTime = combineDateAndTime(eventDate, event.endTime);

      const calendarEvent: CalendarEvent = {
        id: eventId,
        summary: `${goal.title}: ${event.title}`,
        description: event.description || '',
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: timezone,
        },
        colorId: CATEGORY_COLORS[goal.category] || '1',
        source: 'ambitionos',
        syncStatus: 'local_only',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ambitionOsMeta: {
          goalId: goal.id,
          phaseId: phase.id,
          eventType: 'goal_session',
          energyCost: goal.energyCost,
          status: 'scheduled',
          rationale: `${phase.title} - ${event.title}`,
          rescheduleCount: 0,
        },
      };

      calendarEvents.push(calendarEvent);

    }

    // Convert conflicts
    const conflictsDetected: ConflictInfo[] = (parsed.conflicts || []).map(c => ({
      proposedTime: c.proposedTime,
      conflictingEventId: '',
      conflictingEventTitle: c.reason,
      resolution: 'moved' as const,
      newTime: c.resolution,
    }));

    return {
      events: calendarEvents,
      conflictsDetected,
      reasoning: parsed.reasoning,
    };

  } catch (error) {
    logger.error('[Gemini/Scheduling] Phase schedule error', error);
    throw error;
  }
};

// =============================================================================
// Generate Schedule for Entire Goal (All Phases, Tasks, Subtasks)
// Creates a complete calendar covering the entire goal timeline
// =============================================================================

export interface GenerateGoalScheduleInput {
  profile: Partial<UserProfile>;
  goal: Goal;
  constraints: TimeConstraints;
  existingEvents: CalendarEvent[];  // All existing calendar events for conflict detection
  startDate?: Date;  // When to start scheduling (defaults to today)
}

export interface GenerateGoalScheduleOutput {
  events: CalendarEvent[];
  reasoning: string;
}

export const generateGoalSchedule = async (
  input: GenerateGoalScheduleInput
): Promise<GenerateGoalScheduleOutput> => {
  const { profile, goal, constraints, existingEvents, startDate = new Date() } = input;

  // Generating FULL schedule for goal
  // Processing goal for scheduling

  // Build context
  const userContext = buildUserContext(profile);
  const constraintContext = buildConstraintContext(constraints);

  // Get blocked time slots from existing events (limit to relevant period)
  const goalEndDate = getDateFromOffset(startDate, goal.estimatedWeeks * 7);
  const relevantEvents = existingEvents.filter(e => {
    const eventDate = new Date(e.start.dateTime || e.start.date || '');
    return eventDate >= startDate && eventDate <= goalEndDate;
  });

  const blockedSlots = relevantEvents.map(e => ({
    date: e.start.date || e.start.dateTime?.slice(0, 10),
    start: e.start.dateTime?.slice(11, 16) || '00:00',
    end: e.end.dateTime?.slice(11, 16) || '23:59',
    title: e.summary,
  }));

  // Build phase and milestone details
  const phaseDetails = goal.phases.map(phase => {
    const milestoneDetails = phase.milestones.map(m => {
      const taskDetails = (m.tasks || [])
        .map((t) => {
          const subtaskLines = (t.subTasks || []).map(st => `        - ${st.title}`).join('\n');
          return `      - ${t.title}${subtaskLines ? `\n${subtaskLines}` : ''}`;
        })
        .join('\n');
      const tasksBlock = taskDetails ? `\n${taskDetails}` : '';
      return `    - ${m.title} (Target: Week ${m.targetWeek})${tasksBlock}`;
    }).join('\n');

    return `
### PHASE ${phase.number}: ${phase.title}
- Weeks: ${phase.startWeek} to ${phase.endWeek} (${phase.endWeek - phase.startWeek + 1} weeks)
- Description: ${phase.description}
- Focus Areas: ${phase.focus.join(', ') || 'General'}
- Coach Advice: ${phase.coachAdvice || 'N/A'}

Milestones:
${milestoneDetails || '    - No specific milestones'}`;
  }).join('\n');

  // Build the comprehensive prompt
  const prompt = `You are a scheduling assistant creating a COMPLETE calendar for a user's ambition.
This schedule must cover ALL phases from start to finish.

## USER CONTEXT
${userContext}

## TIME CONSTRAINTS
${constraintContext}

## AMBITION TO SCHEDULE
- Title: "${goal.title}"
- Category: ${goal.category}
- Total Duration: ${goal.estimatedWeeks} weeks (${goal.timeline})
- Strategy Overview: ${goal.strategyOverview || 'Focus on consistent progress'}
- Start Date: ${startDate.toISOString().slice(0, 10)}

## SCHEDULING PREFERENCES
- Sessions per week: ${goal.frequency}
- Duration per session: ${goal.duration} minutes
- Preferred time of day: ${goal.preferredTime}
- Energy level required: ${goal.energyCost}
${goal.preferredDays?.length ? `- Preferred days: ${goal.preferredDays.map(d => DAYS_SHORT[d]).join(', ')}` : ''}

## PHASES AND MILESTONES
${phaseDetails}

## ALREADY BLOCKED TIME SLOTS (DO NOT OVERLAP)
${blockedSlots.slice(0, 100).map(s => `- ${s.date} ${s.start}-${s.end}: ${s.title}`).join('\n') || 'None'}

## YOUR TASK
Create a complete weekly schedule covering ALL ${goal.estimatedWeeks} weeks of this ambition.

CRITICAL RULES:
1. Generate exactly ${goal.frequency} sessions per week
2. Each session is ${goal.duration} minutes
3. Prefer ${goal.preferredTime} time slots based on user's chronotype
4. NEVER overlap with blocked time slots or user's work/sleep hours
5. Progress through phases in sequence (Phase 1 → Phase 2 → etc.)
6. Each event should be a concrete activity related to the current phase's focus
7. Include milestone checkpoint sessions at the end of each phase
8. Match energy cost of sessions to user's preferences

## OUTPUT FORMAT (JSON)
{
  "events": [
    {
      "week": 1,
      "phaseNumber": 1,
      "dayOfWeek": 0,
      "startTime": "07:00",
      "endTime": "08:00",
      "title": "Session title (e.g., 'Python: Variables and Types')",
      "description": "What to focus on this session",
      "focusArea": "The specific focus area from the phase",
      "isMilestoneCheckpoint": false
    }
  ],
  "reasoning": "Brief explanation of the scheduling logic and any tradeoffs made"
}

EXPECTED OUTPUT SIZE:
- Total weeks: ${goal.estimatedWeeks}
- Sessions per week: ${goal.frequency}
- Expected events: approximately ${goal.estimatedWeeks * goal.frequency} events

Generate ALL events for the complete goal timeline.`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.PLANNING,
      contents: prompt,
      config: {
        systemInstruction: COACH_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        temperature: 0.5,
        thinkingConfig: { thinkingBudget: 8192 }  // Higher budget for larger output
      }
    });

    const parsed = parseJsonSafe<{
      events: Array<{
        week: number;
        phaseNumber: number;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        title: string;
        description?: string;
        focusArea?: string;
        isMilestoneCheckpoint?: boolean;
      }>;
      reasoning: string;
    }>(response.text || "", { events: [], reasoning: "" });

    // Goal schedule generated

    const timezone = getLocalTimeZone();
    const calendarEvents: CalendarEvent[] = [];

    // Map phase numbers to phase objects
    const phaseMap = new Map(goal.phases.map(p => [p.number, p]));

    // Convert Gemini events to CalendarEvent format
    for (const event of parsed.events) {
      const eventDate = getDateFromOffset(startDate, (event.week - 1) * 7 + event.dayOfWeek);
      const eventId = generateId();

      // Find the corresponding phase
      const phase = phaseMap.get(event.phaseNumber) || goal.phases[0];

      // Create CalendarEvent
      const startDateTime = combineDateAndTime(eventDate, event.startTime);
      const endDateTime = combineDateAndTime(eventDate, event.endTime);

      const calendarEvent: CalendarEvent = {
        id: eventId,
        summary: `${goal.title}: ${event.title}`,
        description: event.description || '',
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: timezone,
        },
        colorId: CATEGORY_COLORS[goal.category] || '1',
        source: 'ambitionos',
        syncStatus: 'local_only',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ambitionOsMeta: {
          goalId: goal.id,
          phaseId: phase.id,
          eventType: event.isMilestoneCheckpoint ? 'milestone_deadline' : 'goal_session',
          energyCost: goal.energyCost,
          status: 'scheduled',
          rationale: `Phase ${phase.number}: ${phase.title} - ${event.title}`,
          rescheduleCount: 0,
        },
      };

      calendarEvents.push(calendarEvent);

    }

    // Calendar events created

    return {
      events: calendarEvents,
      reasoning: parsed.reasoning,
    };

  } catch (error) {
    logger.error('[Gemini/Scheduling] Goal schedule error', error);
    throw error;
  }
};
