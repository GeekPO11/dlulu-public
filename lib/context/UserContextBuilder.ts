// =============================================================================
// User Context Builder
// Assembles the "Source of Truth" JSON object for the AI
// =============================================================================

import type { UserProfile, Goal, TimeConstraints, Phase, Milestone, Task, SubTask } from '../../types';
import type { CalendarEvent } from '../../constants/calendarTypes';
import { DATA_LIMITS } from '../../constants/dataLimits';

/**
 * The strict schema expected by Gemini
 * Updated to include detailed task/subtask completion data so AI can plan better
 */
export interface UserContextObject {
    metadata: {
        generatedAt: string; // ISO string
        viewContext: string; // 'dashboard', 'calendar', etc.
    };
    profile: {
        name: string;
        role: string;
        bio: string;
        productivityProfile: {
            chronotype: string;
            energyLevel: string;
        };
    };
    constraints: {
        totalWeeklyBlockedHours: number;
        sleepWindow: string;
        workBlocks: string[]; // Human readable summaries
        blockedSlots?: string[];
        timeExceptions?: string[];
    };
    goals: Array<{
        id: string;
        title: string;
        category: string;
        progress: number;
        status: string;
        priorityWeight?: number;
        riskLevel?: string;
        timeline: {
            weeksRemaining: number;
            deadline: string; // Estimated
        };
        currentFocus: {
            phase: string;
            activeMilestones: string[];
        };
        // NEW: Detailed completion data so AI knows what's done
        completedWork: {
            completedMilestones: string[];
            completedTasks: string[];
            completedSubtasks: string[];
            pendingTasks: string[];
            userNotes: string[]; // User's notes on milestones
        };
        // NEW: Full roadmap structure for context
        phases: Array<{
            id: string;
            title: string;
            status: string;
            milestones: Array<{
                id: string;
                title: string;
                isCompleted: boolean;
                userNotes?: string;
                tasks: Array<{
                    id: string;
                    title: string;
                    isCompleted: boolean;
                    subtasks: Array<{
                        id: string;
                        title: string;
                        isCompleted: boolean;
                    }>;
                }>;
            }>;
        }>;
    }>;
    upcomingEvents: Array<{
        id: string;
        title: string;
        date: string; // YYYY-MM-DD
        time: string; // HH:mm
        isWork: boolean;
        goalId?: string;
        phaseId?: string;
        milestoneId?: string;
        taskId?: string;
    }>;
}

/**
 * Helper to extract all tasks and subtasks from a goal hierarchy
 */
function extractCompletedWork(goal: Goal): {
    completedMilestones: string[];
    completedTasks: string[];
    completedSubtasks: string[];
    pendingTasks: string[];
    userNotes: string[];
} {
    const completedMilestones: string[] = [];
    const completedTasks: string[] = [];
    const completedSubtasks: string[] = [];
    const pendingTasks: string[] = [];
    const userNotes: string[] = [];

    for (const phase of goal.phases || []) {
        for (const milestone of phase.milestones || []) {
            // Track completed milestones
            if (milestone.isCompleted) {
                completedMilestones.push(milestone.title);
            }
            
            // Collect user notes
            if (milestone.userNotes) {
                userNotes.push(`${milestone.title}: ${milestone.userNotes}`);
            }

            // Process tasks (new 4-level hierarchy)
            for (const task of (milestone as any).tasks || []) {
                if (task.isCompleted) {
                    completedTasks.push(task.title);
                } else if (!task.isStrikethrough) {
                    pendingTasks.push(task.title);
                }

                // Process subtasks within tasks
                for (const subtask of task.subTasks || []) {
                    if (subtask.isCompleted) {
                        completedSubtasks.push(subtask.title);
                    }
                }
            }

        }
    }

    return { completedMilestones, completedTasks, completedSubtasks, pendingTasks, userNotes };
}

/**
 * Helper to build detailed phase structure for context
 */
function buildPhaseDetails(phases: Phase[]): Array<{
    id: string;
    title: string;
    status: string;
    milestones: Array<{
        id: string;
        title: string;
        isCompleted: boolean;
        userNotes?: string;
        tasks: Array<{
            id: string;
            title: string;
            isCompleted: boolean;
            subtasks: Array<{ id: string; title: string; isCompleted: boolean }>;
        }>;
    }>;
}> {
    return phases.map(phase => ({
        id: phase.id,
        title: phase.title,
        status: phase.status,
        milestones: (phase.milestones || []).map(m => ({
            id: m.id,
            title: m.title,
            isCompleted: m.isCompleted,
            userNotes: m.userNotes,
            tasks: ((m as any).tasks || []).map((t: Task) => ({
                id: t.id,
                title: t.title,
                isCompleted: t.isCompleted,
                subtasks: (t.subTasks || []).map(st => ({
                    id: st.id,
                    title: st.title,
                    isCompleted: st.isCompleted,
                })),
            })),
        })),
    }));
}

/**
 * Assembles the full user context from application state
 */
export function buildUserContextObject(
    profile: Partial<UserProfile>,
    goals: Goal[],
    constraints: Partial<TimeConstraints>,
    events: CalendarEvent[],
    viewContext: string = 'dashboard'
): UserContextObject {

    // 1. Profile Building
    const userProfile = {
        name: profile.name || 'User',
        role: profile.role || 'General',
        bio: profile.bio || '',
        productivityProfile: {
            chronotype: profile.chronotype || 'flexible',
            energyLevel: profile.energyLevel || 'balanced',
        },
    };

    // 2. Constraint Summarization
    const workBlocks = (constraints.workBlocks || []).map(
        b => `${b.title}: ${b.start}-${b.end} (${b.days.length} days/week)${b.weekPattern && b.weekPattern !== 'default' ? ` [Week ${b.weekPattern}]` : ''}`
    );

    const blockedSlots = (constraints.blockedSlots || []).map(
        b => `${b.title}: ${b.start}-${b.end} (${b.days.length} days/week)${b.weekPattern && b.weekPattern !== 'default' ? ` [Week ${b.weekPattern}]` : ''}`
    );

    const timeExceptions = (constraints.timeExceptions || []).map(
        ex => `${ex.date}: ${ex.start}-${ex.end} ${ex.isBlocked ? '(blocked)' : '(available)'}${ex.reason ? ` - ${ex.reason}` : ''}`
    );

    // 3. Goal Snapshot with detailed completion data
    const goalSnapshots = goals.map(g => {
        // Get current phase
        const currentPhase = g.phases[g.currentPhaseIndex];
        // Get active milestones
        const activeMilestones = currentPhase?.milestones
            .filter(m => !m.isCompleted)
            .slice(0, 3)
            .map(m => m.title) || [];

        // Estimate deadline
        const createdAt = new Date(g.createdAt);
        const deadline = new Date(createdAt);
        deadline.setDate(createdAt.getDate() + (g.estimatedWeeks * 7));

        // Weeks remaining
        const now = new Date();
        const diffTime = Math.max(0, deadline.getTime() - now.getTime());
        const weeksRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));

        // NEW: Extract detailed completion data
        const completedWork = extractCompletedWork(g);

        // NEW: Build phase details (full hierarchy with IDs)
        const phaseDetails = buildPhaseDetails(g.phases || []);

        // Format deadline using local date components (not UTC) to prevent timezone shifting
        const deadlineYear = deadline.getFullYear();
        const deadlineMonth = String(deadline.getMonth() + 1).padStart(2, '0');
        const deadlineDay = String(deadline.getDate()).padStart(2, '0');
        const deadlineDateStr = `${deadlineYear}-${deadlineMonth}-${deadlineDay}`;

        return {
            id: g.id,
            title: g.title,
            category: g.category,
            progress: g.overallProgress,
            status: g.status,
            priorityWeight: g.priorityWeight,
            riskLevel: g.riskLevel,
            timeline: {
                weeksRemaining,
                deadline: deadlineDateStr, // Local date, not UTC
            },
            currentFocus: {
                phase: currentPhase?.title || 'Planning',
                activeMilestones,
            },
            completedWork,
            phases: phaseDetails,
        };
    });

    // 4. Upcoming Events (Next 7 Days)
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const upcomingEvents = events
        .filter(e => {
            const start = e.start as any;
            const dt = new Date(start?.dateTime || start?.date || '');
            return dt >= now && dt <= nextWeek;
        })
        .sort((a, b) => {
            const da = new Date((a.start as any).dateTime || (a.start as any).date);
            const db = new Date((b.start as any).dateTime || (b.start as any).date);
            return da.getTime() - db.getTime();
        })
        .slice(0, 10)
        .map(e => {
            const start = e.start as any;
            const dt = new Date(start?.dateTime || start?.date);
            
            // Use local date components to prevent timezone shifting
            // If event has timezone info, use it; otherwise use local timezone
            const eventTimezone = start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            
            // Format date using LOCAL date components (not UTC)
            // This ensures "2026-01-20 23:30 EST" shows as "2026-01-20", not "2026-01-21"
            const year = dt.getFullYear();
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const day = String(dt.getDate()).padStart(2, '0');
            const localDateStr = `${year}-${month}-${day}`;
            
            // Format time in the event's timezone (or local if not specified)
            const timeStr = dt.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit',
                timeZone: eventTimezone
            });
            
            return {
                id: e.id,
                title: e.summary,
                date: localDateStr, // Local date, not UTC
                time: timeStr,
                isWork: false, // infer logic if needed
                goalId: e.goalId || e.ambitionOsMeta?.goalId,
                phaseId: e.phaseId || e.ambitionOsMeta?.phaseId,
                milestoneId: e.milestoneId || e.ambitionOsMeta?.milestoneId,
                taskId: e.ambitionOsMeta?.taskId,
            };
        });

    return {
        metadata: {
            generatedAt: new Date().toISOString(),
            viewContext,
        },
        profile: userProfile,
        constraints: {
            totalWeeklyBlockedHours: 0, // Placeholder calculation
            sleepWindow: `${constraints.sleepStart || '23:00'} - ${constraints.sleepEnd || '07:00'}`,
            workBlocks,
            blockedSlots,
            timeExceptions,
        },
        goals: goalSnapshots,
        upcomingEvents,
    };
}

/**
 * Serializes context for the AI System Prompt
 */
export function serializeContextForPrompt(context: UserContextObject): string {
    return `
# USER CONTEXT (JSON)
The following JSON object represents the current verified state of the user. 
Use this as your source of truth. If specific details (like IDs) are needed for function calling, look here.

IMPORTANT: The "completedWork" section shows what the user has already accomplished.
DO NOT suggest tasks that are already marked as completed.
The "userNotes" contain important context the user has added - use this to personalize your suggestions.

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`
  `;
}
