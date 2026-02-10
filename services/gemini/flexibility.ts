
import { CalendarEvent } from '../../constants/calendarTypes';
import { ScheduleContext, applyTimeConstraints } from './systemic-scheduling';
import { ai, MODELS, parseJsonSafe } from './client';
import { logger } from '../../lib/logger';

// ===========================================
// FLEXIBILITY ENGINE
// ===========================================

export const checkForMissedEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    const now = new Date();
    return events.filter(event => {
        const endTime = new Date(event.end.dateTime || event.end.date || '');
        // If event ended in the past AND is not completed/skipped/missed
        const isPast = endTime < now;
        const isPending = event.status === 'scheduled';

        // Also check if we should mark it as missed?
        // For now, just return it as a "Missed candidate"
        return isPast && isPending;
    });
};

export const autoAdjustSchedule = async (
    userId: string,
    missedEvents: CalendarEvent[],
    profile: ScheduleContext['userProfile']
): Promise<{ rescheduledEvents: CalendarEvent[], message: string }> => {

    if (missedEvents.length === 0) return { rescheduledEvents: [], message: 'No adjustment needed.' };

    logger.info('[FlexibilityEngine] Found missed events', { count: missedEvents.length });

    // 1. Analyze "Forgiveness" vs "Discipline" via AI
    // We want to know if we should just SKIP these (if Habit) or MOVE them (if Project).
    const strategy = await decideRescheduleStrategy(missedEvents);

    if (strategy.action === 'SKIP') {
        return {
            rescheduledEvents: [],
            message: `Coach: "It's okay to miss a beat. We skipped ${missedEvents.length} sessions to keep you fresh. Let's hit the next one!"`
        };
    }

    // 2. If MOVE, we use Systemic Scheduling's "Constraint Engine"
    // Convert missed events back to "Sessions"
    const sessionsToReschedule = missedEvents.map(e => ({
        summary: `Rescheduled: ${e.summary}`,
        description: e.description,
        durationMinutes: (new Date(e.end.dateTime!).getTime() - new Date(e.start.dateTime!).getTime()) / 60000,
        task_ids: e.task_ids
    }));

    // 3. Find new slots
    const newEvents = applyTimeConstraints(sessionsToReschedule, profile);

    return {
        rescheduledEvents: newEvents,
        message: `Coach: "I found new slots for your missed sessions starting tomorrow. Stay on track!"`
    };
};

const decideRescheduleStrategy = async (events: CalendarEvent[]): Promise<{ action: 'SKIP' | 'MOVE', reason: string }> => {
    const prompt = `
    User missed these events:
    ${events.map(e => `- ${e.summary} (${e.durationMinutes} min)`).join('\n')}

    Decide strategy:
    - SKIP: If acts like a "Habit" (e.g. Gym, Meditation) where doing it twice tomorrow is bad.
    - MOVE: If acts like "Project Work" (e.g. Writing, Coding) where the work still needs to be done.

    Return JSON: { "action": "SKIP" | "MOVE", "reason": "..." }
    `;

    try {
        const response = await ai.models.generateContent({
            model: MODELS.PLANNING,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        return parseJsonSafe(response.text || "{}", { action: 'MOVE', reason: 'Default to moving' });
    } catch (e) {
        return { action: 'MOVE', reason: 'Fallback' };
    }
};
