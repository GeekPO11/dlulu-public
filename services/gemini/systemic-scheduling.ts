
import { Goal, Task } from '../../types';
import { CalendarEvent } from '../../constants/calendarTypes';
import { ai, MODELS, parseJsonSafe } from './client';
import { addDays, setHours, setMinutes } from 'date-fns';
import { callEdgeFunction } from '../../lib/supabase';
import { logger } from '../../lib/logger';

// ===========================================
// CONSTANTS & TYPES
// ===========================================

export interface ScheduleContext {
    goal: Goal;
    userProfile: {
        sleepStart: number; // 22 = 10pm
        sleepEnd: number;   // 6 = 6am
        workStart: number;  // 9 = 9am
        workEnd: number;    // 17 = 5pm
        preferredFocusTime: 'morning' | 'afternoon' | 'evening';
    };
    existingEvents: CalendarEvent[];
}

interface SchedulingStrategy {
    archetype: 'HABIT_BUILDING' | 'DEEP_WORK_PROJECT' | 'SKILL_ACQUISITION' | 'MAINTENANCE';
    frequencyPerWeek: number;
    sessionDurationMin: number;
    preferredDays: string[]; // ['Mon', 'Wed', 'Fri']
    groupingLogic: 'BATCH_TASKS' | 'ATOMIC_BITE_SIZED' | 'LONG_SESSION';
}

// ===========================================
// CORE SERVICE
// ===========================================

export const generateSystemicSchedule = async (
    goal: Goal,
    userProfile: ScheduleContext['userProfile']
): Promise<CalendarEvent[]> => {
    logger.info('[SystemicScheduling] Starting for goal', { goalTitle: goal.title });

    // 1. Flatten Hierarchy into execution units
    const flatTasks = flattenHierarchy(goal);
    if (flatTasks.length === 0) {
        logger.warn('[SystemicScheduling] No tasks found to schedule');
        return [];
    }

    // 2. AI "Deep Thinking" - Strategy Generation
    const strategy = await deriveStrategyFromGemini(goal, userProfile);
    logger.debug('[SystemicScheduling] Derived strategy', { strategy });

    // 3. Logical Grouping & Session Creation
    const proposedSessions = createLogicalSessions(flatTasks, strategy);

    // 4. "Zero" Method Constraint Enforcement (Hard Logic)
    const validEvents = applyTimeConstraints(proposedSessions, userProfile);

    return validEvents;
};

// ===========================================
// HELPER LOGIC
// ===========================================

const flattenHierarchy = (goal: Goal): Array<{ task: Task, milestoneId: string, phaseId: string }> => {
    const flat: Array<{ task: Task, milestoneId: string, phaseId: string }> = [];
    logger.debug('[SystemicScheduling] Flattening hierarchy for goal', {
        goalTitle: goal.title,
        phasesCount: goal.phases?.length || 0,
    });

    goal.phases?.forEach(phase => {
        if (phase.status === 'completed') return;

        phase.milestones?.forEach(milestone => {
            if (milestone.isCompleted) return;

            // Check for modern 'tasks' array
            if (milestone.tasks && milestone.tasks.length > 0) {
                milestone.tasks.forEach(task => {
                    if (!task.isCompleted) {
                        flat.push({ task, milestoneId: milestone.id, phaseId: phase.id });
                    }
                });
            }
            // No tasks: nothing to schedule for this milestone
        });
    });

    logger.debug('[SystemicScheduling] Total executable tasks found', { count: flat.length });
    return flat;
};

const deriveStrategyFromGemini = async (goal: Goal, profile: ScheduleContext['userProfile']): Promise<SchedulingStrategy> => {
    const prompt = `
    Analyze this ambition for scheduling: "${goal.title}"
    Type: ${goal.category}
    Overview: ${goal.strategyOverview}
    
    User Profile:
    - Focus Time: ${profile.preferredFocusTime}
    - Sleep: ${profile.sleepStart}:00 to ${profile.sleepEnd}:00
    - Work: ${profile.workStart}:00 to ${profile.workEnd}:00

    Determine the "Scheduling Archetype":
    1. HABIT_BUILDING (e.g., Gym, Meditation) -> High frequency, fixed duration.
    2. DEEP_WORK_PROJECT (e.g., Coding, Writing) -> Long blocks, low frequency.
    3. SKILL_ACQUISITION (e.g., Learning Language) -> Spaced repetition.
    4. MAINTENANCE (e.g., Chores) -> Periodic, low energy.

    Return JSON:
    {
        "archetype": "HABIT_BUILDING" | "DEEP_WORK_PROJECT" | "SKILL_ACQUISITION" | "MAINTENANCE",
        "frequencyPerWeek": number,
        "sessionDurationMin": number,
        "preferredDays": ["Mon", "Tue"...],
        "groupingLogic": "BATCH_TASKS" | "ATOMIC_BITE_SIZED" | "LONG_SESSION"
    }
    `;

    // Use Edge Function to avoid CORS and keep API key secure
    try {
        const { data, error } = await callEdgeFunction<{ success: boolean, data: SchedulingStrategy }>(
            'analyze-goal-strategy',
            { goal, userProfile: profile }
        );

        if (error || !data) {
            logger.warn('[SystemicScheduling] Edge function failed, using fallback', { error });
            throw new Error('Edge function failed');
        }

        return data.data || data as unknown as SchedulingStrategy;

    } catch (e) {
        logger.error('[SystemicScheduling] Strategy derivation failed, using fallback', e);
        return {
            archetype: 'DEEP_WORK_PROJECT',
            frequencyPerWeek: 3,
            sessionDurationMin: 60,
            preferredDays: ['Mon', 'Wed', 'Fri'],
            groupingLogic: 'BATCH_TASKS'
        };
    }
};

const createLogicalSessions = (
    tasks: Array<{ task: Task, milestoneId: string, phaseId: string }>,
    strategy: SchedulingStrategy
): Partial<CalendarEvent>[] => {
    const sessions: Partial<CalendarEvent>[] = [];
    let currentSessionTasks: string[] = [];
    let currentTaskIds: string[] = [];
    let currentDuration = 0;

    for (const item of tasks) {
        // Simple logic: Fill a session up to duration
        const taskDuration = item.task.estimatedMinutes || 30; // Default 30 min per task

        // If adding this task exceeds duration AND we already have content, push previous session
        if (currentDuration + taskDuration > strategy.sessionDurationMin && currentSessionTasks.length > 0) {
            sessions.push({
                summary: `Session: ${currentSessionTasks[0]} + ${currentSessionTasks.length - 1} more`,
                description: `Tasks:\n- ${currentSessionTasks.join('\n- ')}`,
                durationMinutes: strategy.sessionDurationMin,
                task_ids: currentTaskIds
            });

            currentSessionTasks = [];
            currentTaskIds = [];
            currentDuration = 0;
        }

        currentSessionTasks.push(item.task.title);
        currentTaskIds.push(item.task.id);
        currentDuration += taskDuration;
    }

    // Flush remaining
    if (currentSessionTasks.length > 0) {
        sessions.push({
            summary: `Session: ${currentSessionTasks[0]} + ${currentSessionTasks.length - 1} more`,
            description: `Tasks:\n- ${currentSessionTasks.join('\n- ')}`,
            durationMinutes: currentDuration,
            task_ids: currentTaskIds
        });
    }

    return sessions;
};

export const applyTimeConstraints = (
    sessions: Partial<CalendarEvent>[],
    profile: ScheduleContext['userProfile']
): CalendarEvent[] => {
    const scheduledEvents: CalendarEvent[] = [];
    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 1); // Start tomorrow

    sessions.forEach(session => {
        let slotFound = false;
        let attempts = 0;

        while (!slotFound && attempts < 14) {
            // Set start time based on preference
            if (profile.preferredFocusTime === 'morning') {
                currentDate = setHours(setMinutes(currentDate, 0), 9);
            } else {
                currentDate = setHours(setMinutes(currentDate, 0), 14);
            }

            const startHour = currentDate.getHours();
            const duration = session.durationMinutes || 60;
            const endHour = startHour + Math.ceil(duration / 60);

            // Constraint: Sleep (e.g. 22 to 6)
            // If sleepStart = 22, sleepEnd = 6. 
            // Simple check: don't start after sleepStart, don't end after sleepStart?
            // Or strictly between sleepEnd and sleepStart.
            // Valid range: [sleepEnd, sleepStart] e.g. [6, 22]

            const isWithinDay = startHour >= profile.sleepEnd && endHour <= profile.sleepStart;

            if (isWithinDay) {
                const endTime = new Date(currentDate.getTime() + duration * 60000);

                scheduledEvents.push({
                    id: crypto.randomUUID(),
                    summary: session.summary || 'Work Session',
                    description: session.description,
                    start: { dateTime: currentDate.toISOString() },
                    end: { dateTime: endTime.toISOString() },
                    eventType: 'task',
                    status: 'scheduled',
                    ...session
                } as CalendarEvent);

                slotFound = true;
            }

            currentDate = addDays(currentDate, 1);
            attempts++;
        }
    });

    return scheduledEvents;
};
