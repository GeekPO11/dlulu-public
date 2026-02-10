import React, { useState, useMemo, useEffect } from 'react';
import type { Goal, Phase, Milestone, Task, SubTask, UserProfile, TimeConstraints, BehaviorPlan } from '../types';
import type { CalendarEvent } from '../constants/calendarTypes';
import CalendarView from './CalendarView';
import { ExecutionCalendar } from './ExecutionCalendar';
import EventDetailModal from './EventDetailModal';
import PhaseExplorer from './PhaseExplorer';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { analytics as mixpanelAnalytics, AnalyticsEvents } from '../lib/analytics';
import { localToUtcIso } from '../lib/api/transformers';
import { normalizeCriticalGaps, resolveRiskLevel, riskLevelToDisplay } from '../lib/goalInsights';

interface GoalDetailViewProps {
    goal: Goal;
    events?: CalendarEvent[];
    userProfile?: UserProfile;
    constraints?: TimeConstraints;
    calendarEvents?: CalendarEvent[];
    calendarSchemaCapabilities?: {
        isLocked: boolean;
        difficulty: boolean;
        cognitiveType: boolean;
        effortMinutesAllocated: boolean;
        durationMinutes: boolean;
    };
    isScheduling?: boolean;
    onBack: () => void;
    onEdit: () => void; // Used to toggle edit mode internally now
    onAskCoach?: (goalId: string) => void;
    onEventComplete?: (eventId: string) => void;
    onEventUpdate?: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void> | void;
    onEventDelete?: (eventId: string) => Promise<void> | void;
    onTaskToggleById?: (taskId: string) => Promise<void> | void;
    onSubTaskToggleById?: (subtaskId: string) => Promise<void> | void;
    overviewStatus?: 'idle' | 'loading' | 'error' | 'ready';
    onRetryOverview?: (goalId: string) => void;

    // Update operations
    onGoalUpdate?: (goalId: string, updates: Partial<Goal>) => void;

    // CRUD & Hierarchy
    onMilestoneToggle?: (goalId: string, phaseId: string, milestoneId: string, completed: boolean, notes?: string) => void;
    onSubTaskToggle?: (goalId: string, phaseId: string, milestoneId: string, subTaskId: string, completed: boolean) => void;
    onAddPhase?: (goalId: string, phase: Partial<Phase>) => void;
    onAddMilestone?: (goalId: string, phaseId: string, milestone: Partial<Milestone>) => void;
    onAddTask?: (goalId: string, phaseId: string, milestoneId: string, title: string) => void;
    onAddSubTask?: (taskId: string, title: string) => void;
    onPhaseUpdate?: (phaseId: string, updates: Partial<Phase>) => void;
    onPhaseDelete?: (phaseId: string) => void;
    onMilestoneUpdate?: (milestoneId: string, updates: Partial<Milestone>) => void;
    onMilestoneDelete?: (milestoneId: string) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
    onTaskDelete?: (taskId: string) => void;
    onSubTaskUpdate?: (subtaskId: string, updates: Partial<SubTask>) => void;
    onSubTaskDelete?: (subtaskId: string) => void;
    onTaskToggle?: (taskId: string, completed: boolean) => void;

    // New Actions
    onCreateCalendar?: (goalId: string) => void;
    onRebuildCalendar?: (goalId: string) => void;
    onClearCalendar?: (goalId: string) => void;
    onPauseGoal?: (goalId: string) => void;
    onResumeGoal?: (goalId: string) => void;
    onAbandonGoal?: (goalId: string) => void;
    onDeleteGoal?: (goalId: string) => void;
}

type TabType = 'overview' | 'phases' | 'calendar' | 'resources' | 'analytics';

const DEFAULT_BEHAVIOR_PLAN: BehaviorPlan = {
    smart: {
        specific: '',
        measurable: '',
        achievable: '',
        relevant: '',
        timeBound: '',
    },
    woop: {
        wish: '',
        outcome: '',
        obstacles: [],
        plan: [],
    },
    implementationIntentions: [],
    habitStacking: [],
    frictionReduction: {
        remove: [],
        add: [],
    },
};

const normalizeBehaviorPlan = (plan?: BehaviorPlan): BehaviorPlan => ({
    smart: { ...DEFAULT_BEHAVIOR_PLAN.smart, ...(plan?.smart || {}) },
    woop: {
        ...DEFAULT_BEHAVIOR_PLAN.woop,
        ...(plan?.woop || {}),
        obstacles: plan?.woop?.obstacles ?? [],
        plan: plan?.woop?.plan ?? [],
    },
    implementationIntentions: plan?.implementationIntentions ?? [],
    habitStacking: plan?.habitStacking ?? [],
    frictionReduction: {
        ...DEFAULT_BEHAVIOR_PLAN.frictionReduction,
        ...(plan?.frictionReduction || {}),
        remove: plan?.frictionReduction?.remove ?? [],
        add: plan?.frictionReduction?.add ?? [],
    },
});

const parseLines = (value: string): string[] =>
    value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

const formatIntentions = (intentions: BehaviorPlan['implementationIntentions']): string =>
    (intentions || [])
        .map((item) => {
            const ifText = item.if?.trim();
            const thenText = item.then?.trim();
            if (ifText && thenText) return `If ${ifText} then ${thenText}`;
            return ifText || thenText || '';
        })
        .filter(Boolean)
        .join('\n');

const parseIntentions = (value: string): BehaviorPlan['implementationIntentions'] =>
    parseLines(value).map((line) => {
        const match = line.split(/then/i);
        if (match.length > 1) {
            const ifPart = match[0].replace(/^if\s+/i, '').trim();
            const thenPart = match.slice(1).join('then').trim();
            return { if: ifPart, then: thenPart };
        }
        return { if: line.trim(), then: '' };
    });

const formatHabitStacking = (habits: BehaviorPlan['habitStacking']): string =>
    (habits || [])
        .map((habit) => {
            const parts = [habit.anchor, habit.routine, habit.reward].filter(Boolean);
            return parts.join(' | ');
        })
        .filter(Boolean)
        .join('\n');

const parseHabitStacking = (value: string): BehaviorPlan['habitStacking'] =>
    parseLines(value).map((line) => {
        const [anchor, routine, reward] = line.split('|').map((part) => part.trim());
        return {
            anchor: anchor || '',
            routine: routine || '',
            reward: reward || undefined,
        };
    });

/**
 * Vertical Branching Explorer for Phases
 * Renders Phases vertically. selecting one shifts them left and shows Milestones.
 */
const GoalDetailView: React.FC<GoalDetailViewProps> = (props) => {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [editTitle, setEditTitle] = useState(props.goal.title);
    const [editDescription, setEditDescription] = useState(props.goal.strategyOverview || '');
    const [editPreferredTime, setEditPreferredTime] = useState<Goal['preferredTime']>(props.goal.preferredTime || 'flexible');
    const [editFrequency, setEditFrequency] = useState<number>(props.goal.frequency || 3);
    const [editDuration, setEditDuration] = useState<number>(props.goal.duration || 60);
    const [editEnergyCost, setEditEnergyCost] = useState<Goal['energyCost']>(props.goal.energyCost || 'medium');
    const [editPriorityWeight, setEditPriorityWeight] = useState<number>(props.goal.priorityWeight ?? 50);
    const [editBehaviorPlan, setEditBehaviorPlan] = useState<BehaviorPlan>(normalizeBehaviorPlan(props.goal.behaviorPlan));

    useEffect(() => {
        setEditTitle(props.goal.title);
        setEditDescription(props.goal.strategyOverview || '');
        setEditPreferredTime(props.goal.preferredTime || 'flexible');
        setEditFrequency(props.goal.frequency || 3);
        setEditDuration(props.goal.duration || 60);
        setEditEnergyCost(props.goal.energyCost || 'medium');
        setEditPriorityWeight(props.goal.priorityWeight ?? 50);
        setEditBehaviorPlan(normalizeBehaviorPlan(props.goal.behaviorPlan));
    }, [props.goal.id]);

    // Track goal view on mount
    useEffect(() => {
        mixpanelAnalytics.track(AnalyticsEvents.GOAL_VIEWED, {
            goal_id: props.goal.id,
            goal_category: props.goal.category,
            goal_progress: props.goal.overallProgress || 0,
        });
    }, [props.goal.id]);

    useEffect(() => {
        if (isEditingMetadata) return;
        setEditTitle(props.goal.title);
        setEditDescription(props.goal.strategyOverview || '');
        setEditPreferredTime(props.goal.preferredTime || 'flexible');
        setEditFrequency(props.goal.frequency || 3);
        setEditDuration(props.goal.duration || 60);
        setEditEnergyCost(props.goal.energyCost || 'medium');
        setEditPriorityWeight(props.goal.priorityWeight ?? 50);
        setEditBehaviorPlan(normalizeBehaviorPlan(props.goal.behaviorPlan));
    }, [
        isEditingMetadata,
        props.goal.title,
        props.goal.strategyOverview,
        props.goal.preferredTime,
        props.goal.frequency,
        props.goal.duration,
        props.goal.energyCost,
        props.goal.priorityWeight,
        props.goal.behaviorPlan,
    ]);

    const handleSaveMetadata = () => {
        const nextTitle = editTitle.trim();
        if (!nextTitle) {
            alert('Please enter an ambition title.');
            return;
        }

        const nextFrequency = Math.min(7, Math.max(1, Number.isFinite(editFrequency) ? editFrequency : 3));
        const nextDuration = Math.min(180, Math.max(15, Number.isFinite(editDuration) ? editDuration : 60));

        if (props.onGoalUpdate) {
            props.onGoalUpdate(props.goal.id, {
                title: nextTitle,
                strategyOverview: editDescription,
                preferredTime: editPreferredTime || 'flexible',
                frequency: nextFrequency,
                duration: nextDuration,
                energyCost: editEnergyCost || 'medium',
                priorityWeight: Math.min(100, Math.max(0, Number.isFinite(editPriorityWeight) ? editPriorityWeight : 50)),
                behaviorPlan: editBehaviorPlan,
            });
            mixpanelAnalytics.track(AnalyticsEvents.GOAL_EDITED, {
                goal_id: props.goal.id,
                goal_category: props.goal.category,
            });
        }
        setIsEditingMetadata(false);
    };
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

    // Calendar view state
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [analyticsTimeRange, setAnalyticsTimeRange] = useState<30 | 90>(30);

    // Filter events for this goal
    const goalEvents = useMemo(() => {
        if (!props.events) return [];
        return props.events.filter(e => e.goalId === props.goal.id || e.ambitionOsMeta?.goalId === props.goal.id);
    }, [props.events, props.goal.id]);

    const selectedEventId = selectedEvent?.id;

    useEffect(() => {
        if (!selectedEventId) return;
        const latest = goalEvents.find((event) => event.id === selectedEventId);
        if (!latest) {
            setSelectedEvent(null);
            return;
        }
        setSelectedEvent((prev) => (prev && prev.id === latest.id ? latest : prev));
    }, [goalEvents, selectedEventId]);

    const { taskCompletionById, subtaskCompletionById } = useMemo(() => {
        const taskMap = new Map<string, boolean>();
        const subtaskMap = new Map<string, boolean>();

        for (const phase of props.goal.phases || []) {
            for (const milestone of phase.milestones || []) {
                for (const task of milestone.tasks || []) {
                    taskMap.set(task.id, !!task.isCompleted);
                    for (const subtask of task.subTasks || []) {
                        subtaskMap.set(subtask.id, !!subtask.isCompleted);
                    }
                }
            }
        }

        return { taskCompletionById: taskMap, subtaskCompletionById: subtaskMap };
    }, [props.goal.phases]);

    const hasCalendar = Boolean(props.goal.isScheduled) || goalEvents.length > 0;
    const overviewStatus = props.overviewStatus ?? 'idle';
    const behaviorPlanDisplay = useMemo(() => normalizeBehaviorPlan(props.goal.behaviorPlan), [props.goal.behaviorPlan]);
    const resolvedRiskLevel = useMemo(
        () => resolveRiskLevel(props.goal.riskLevel, props.goal.criticalGaps),
        [props.goal.riskLevel, props.goal.criticalGaps]
    );
    const normalizedCriticalGaps = useMemo(
        () => normalizeCriticalGaps(props.goal.criticalGaps),
        [props.goal.criticalGaps]
    );
    const riskProfile = useMemo(
        () => riskLevelToDisplay(resolvedRiskLevel),
        [resolvedRiskLevel]
    );
    const hasAnyRiskSignal = Boolean(props.goal.riskLevel) || normalizedCriticalGaps.length > 0;

    // Compute heatmap data (event count per day for current month)
    const heatmapData = useMemo(() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay();

        // Count events per day
        const eventCounts: Record<number, number> = {};
        goalEvents.forEach(event => {
            const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
            if (eventDate.getFullYear() === year && eventDate.getMonth() === month) {
                const day = eventDate.getDate();
                eventCounts[day] = (eventCounts[day] || 0) + 1;
            }
        });

        return { daysInMonth, firstDayOfWeek, eventCounts };
    }, [goalEvents, calendarMonth]);

    // Get upcoming sessions (future events for this goal)
    const upcomingSessions = useMemo(() => {
        const now = new Date();
        return goalEvents
            .filter(event => {
                const eventDate = new Date(event.start?.dateTime || event.start?.date || '');
                return eventDate >= now;
            })
            .sort((a, b) => {
                const dateA = new Date(a.start?.dateTime || a.start?.date || '');
                const dateB = new Date(b.start?.dateTime || b.start?.date || '');
                return dateA.getTime() - dateB.getTime();
            })
            .slice(0, 5); // Show top 5
    }, [goalEvents]);

    const nextSessionLabel = useMemo(() => {
        const nextSession = upcomingSessions[0];
        if (!nextSession) return null;

        const rawStart = nextSession.start?.dateTime || nextSession.start?.date;
        if (!rawStart) return null;

        const date = new Date(rawStart);
        if (Number.isNaN(date.getTime())) return null;

        const isAllDay = Boolean(nextSession.start?.date) && !nextSession.start?.dateTime;
        if (isAllDay) {
            return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }

        return date.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }, [upcomingSessions]);

    const handleBeginSession = (taskId?: string) => {
        setActiveTab('calendar');

        if (!taskId) {
            setCalendarMonth(new Date());
            setSelectedEvent(null);
            return;
        }

        const now = new Date();
        const nextTaskEvent = goalEvents
            .filter(event => {
                const startRaw = event.start?.dateTime || event.start?.date;
                if (!startRaw) return false;
                const startDate = new Date(startRaw);
                if (Number.isNaN(startDate.getTime()) || startDate < now) return false;
                const matchesTask = event.taskId === taskId
                    || event.ambitionOsMeta?.taskId === taskId
                    || (Array.isArray(event.task_ids) && event.task_ids.includes(taskId));
                return matchesTask;
            })
            .sort((a, b) => {
                const aDate = new Date(a.start?.dateTime || a.start?.date || 0);
                const bDate = new Date(b.start?.dateTime || b.start?.date || 0);
                return aDate.getTime() - bDate.getTime();
            })[0];

        if (nextTaskEvent) {
            const eventStart = nextTaskEvent.start?.dateTime || nextTaskEvent.start?.date;
            const eventDate = eventStart ? new Date(eventStart) : new Date();
            if (!Number.isNaN(eventDate.getTime())) {
                setCalendarMonth(eventDate);
            } else {
                setCalendarMonth(new Date());
            }
            setSelectedEvent(nextTaskEvent);
        } else {
            setCalendarMonth(new Date());
            setSelectedEvent(null);
        }
    };

    const handleChecklistTaskToggle = async (taskId: string) => {
        if (props.onTaskToggleById) {
            await props.onTaskToggleById(taskId);
            return;
        }

        if (props.onTaskToggle) {
            const current = taskCompletionById.get(taskId) ?? false;
            await Promise.resolve(props.onTaskToggle(taskId, !current));
            return;
        }

        const { data, error } = await (supabase as any)
            .from('tasks')
            .select('is_completed')
            .eq('id', taskId)
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Task not found.');

        const nextCompleted = !data.is_completed;
        const { error: updateError } = await (supabase as any)
            .from('tasks')
            .update({
                is_completed: nextCompleted,
                completed_at: nextCompleted ? new Date().toISOString() : null,
            })
            .eq('id', taskId);

        if (updateError) throw updateError;
    };

    const handleChecklistSubTaskToggle = async (subtaskId: string) => {
        if (props.onSubTaskToggleById) {
            await props.onSubTaskToggleById(subtaskId);
            return;
        }

        if (props.onSubTaskUpdate) {
            const current = subtaskCompletionById.get(subtaskId) ?? false;
            await Promise.resolve(props.onSubTaskUpdate(subtaskId, {
                isCompleted: !current,
                completedAt: !current ? new Date() : undefined,
            }));
            return;
        }

        const { data, error } = await (supabase as any)
            .from('subtasks')
            .select('is_completed')
            .eq('id', subtaskId)
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Subtask not found.');

        const nextCompleted = !data.is_completed;
        const { error: updateError } = await (supabase as any)
            .from('subtasks')
            .update({
                is_completed: nextCompleted,
                completed_at: nextCompleted ? new Date().toISOString() : null,
            })
            .eq('id', subtaskId);

        if (updateError) throw updateError;
    };

    type NextUp =
        | { kind: 'subtask'; title: string; taskTitle: string; milestoneTitle: string; phaseNumber: number }
        | { kind: 'task'; title: string; milestoneTitle: string; phaseNumber: number }
        | { kind: 'milestone'; title: string; phaseNumber: number };

    const nextUp = useMemo<NextUp | null>(() => {
        const sortedPhases = [...props.goal.phases].sort((a, b) => a.number - b.number);
        if (sortedPhases.length === 0) return null;

        const startIndex = Math.min(Math.max(props.goal.currentPhaseIndex || 0, 0), Math.max(0, sortedPhases.length - 1));
        const phasesToScan = sortedPhases.slice(startIndex);

        for (const phase of phasesToScan) {
            const sortedMilestones = [...phase.milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

            for (const milestone of sortedMilestones) {
                const tasks = (milestone.tasks || [])
                    .filter(task => !task.isStrikethrough)
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                for (const task of tasks) {
                    if (task.isCompleted) continue;

                    const subTasks = (task.subTasks || []).filter(st => !st.isStrikethrough);
                    const nextSubTask = subTasks.find(st => !st.isCompleted);

                    if (nextSubTask) {
                        return {
                            kind: 'subtask',
                            title: nextSubTask.title,
                            taskTitle: task.title,
                            milestoneTitle: milestone.title,
                            phaseNumber: phase.number,
                        };
                    }

                    return {
                        kind: 'task',
                        title: task.title,
                        milestoneTitle: milestone.title,
                        phaseNumber: phase.number,
                    };
                }

                if (!milestone.isCompleted && tasks.length === 0) {
                    return { kind: 'milestone', title: milestone.title, phaseNumber: phase.number };
                }
            }
        }

        return null;
    }, [props.goal.currentPhaseIndex, props.goal.phases]);

    // Calculate analytics metrics
    const analytics = useMemo(() => {
        // Count all tasks and subtasks
        let totalTasks = 0;
        let completedTasks = 0;
        let totalSubtasks = 0;
        let completedSubtasks = 0;

        props.goal.phases.forEach(phase => {
            phase.milestones.forEach(milestone => {
                milestone.tasks?.forEach(task => {
                    totalTasks++;
                    if (task.isCompleted) completedTasks++;

                    task.subTasks?.forEach(subtask => {
                        totalSubtasks++;
                        if (subtask.isCompleted) completedSubtasks++;
                    });
                });
            });
        });

        // Velocity: completed items per day (approximation based on progress)
        // For real velocity, we'd need completion timestamps in the history
        const totalItems = totalTasks + totalSubtasks;
        const completedItems = completedTasks + completedSubtasks;
        const velocity = totalItems > 0 ? ((completedItems / Math.max(totalItems, 1)) * 10).toFixed(1) : '0.0';

        // Focus Score: based on completion rate and consistency
        // For real focus score, we'd need to track scheduled vs completed sessions
        const completionRate = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
        const focusScore = Math.round(completionRate);

        // Streak: calculate from history entries (consecutive days with activity)
        let streak = 0;
        if (props.goal.history && props.goal.history.length > 0) {
            const sortedHistory = [...props.goal.history].sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            // Get unique days with activity
            const activityDays = new Set<string>();
            sortedHistory.forEach(entry => {
                const date = new Date(entry.timestamp);
                activityDays.add(date.toISOString().split('T')[0]);
            });

            // Count consecutive days from today
            const today = new Date();
            let currentDate = new Date(today);
            while (activityDays.has(currentDate.toISOString().split('T')[0])) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            }
        }

        // Calculate velocity change based on recent vs older completion rate
        let velocityChange = 0;
        if (props.goal.history && props.goal.history.length >= 2) {
            const recentHistory = props.goal.history.filter(h => {
                const daysDiff = (Date.now() - new Date(h.timestamp).getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff <= 7;
            }).length;
            const olderHistory = props.goal.history.filter(h => {
                const daysDiff = (Date.now() - new Date(h.timestamp).getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff > 7 && daysDiff <= 14;
            }).length;
            if (olderHistory > 0) {
                velocityChange = Math.round(((recentHistory - olderHistory) / olderHistory) * 100);
            } else if (recentHistory > 0) {
                velocityChange = 100; // New activity
            }
        }

        // Generate chart data points based on history (timeRange is applied dynamically via separate useMemo)
        const generateChartForTimeRange = (timeRange: number): number[] => {
            const points: number[] = [];
            const today = new Date();
            const daysPerPoint = Math.floor(timeRange / 10);

            // Group history by day and count cumulative completions
            const dailyCompletions: Record<string, number> = {};
            if (props.goal.history) {
                props.goal.history.forEach(entry => {
                    const date = new Date(entry.timestamp).toISOString().split('T')[0];
                    dailyCompletions[date] = (dailyCompletions[date] || 0) + 1;

                });
            }

            // Generate 10 data points for the selected time range
            let cumulative = 0;
            for (let i = 9; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - (i * daysPerPoint));

                // Add completions from around this date
                for (let j = 0; j < daysPerPoint; j++) {
                    const checkDate = new Date(date);
                    checkDate.setDate(checkDate.getDate() - j);
                    const checkStr = checkDate.toISOString().split('T')[0];
                    cumulative += dailyCompletions[checkStr] || 0;
                }

                // Scale to percentage of overall progress
                const progressAtPoint = totalItems > 0
                    ? Math.min(100, (cumulative / totalItems) * 100 + props.goal.overallProgress * (1 - i / 10))
                    : props.goal.overallProgress * (1 - i / 10);
                points.push(progressAtPoint);
            }

            // If no history data, generate based on overall progress
            const areAllZeros = points.every(p => p === 0);
            if (areAllZeros) {
                const progress = props.goal.overallProgress;
                for (let i = 0; i < 10; i++) {
                    points[i] = Math.max(0, progress * ((i + 1) / 10) + Math.random() * 5 - 2.5);
                }
            }

            return points;
        };

        return {
            velocity,
            velocityChange,
            focusScore,
            streak,
            totalTasks,
            completedTasks,
            totalSubtasks,
            completedSubtasks,
            generateChartForTimeRange,
        };
    }, [props.goal.phases, props.goal.history, props.goal.overallProgress]);

    // Generate chart paths based on selected time range
    const chartData = useMemo(() => {
        const chartPoints = analytics.generateChartForTimeRange(analyticsTimeRange);

        // Generate SVG path from chart points
        const generateChartPath = (points: number[]): { fillPath: string; strokePath: string } => {
            if (points.length === 0) return { fillPath: '', strokePath: '' };

            const width = 400;
            const height = 100;
            const pointSpacing = width / (points.length - 1);

            // Convert progress % to Y coordinate (inverted, since SVG Y increases downward)
            const getY = (progress: number) => height - (progress / 100 * height);

            let strokePath = `M0,${getY(points[0])}`;
            let fillPath = `M0,${height} L0,${getY(points[0])}`;

            for (let i = 1; i < points.length; i++) {
                const x = i * pointSpacing;
                const y = getY(points[i]);
                const prevX = (i - 1) * pointSpacing;
                const prevY = getY(points[i - 1]);

                // Smooth curve using control points
                const cpX1 = prevX + pointSpacing / 2;
                const cpY1 = prevY;
                const cpX2 = x - pointSpacing / 2;
                const cpY2 = y;

                strokePath += ` C${cpX1},${cpY1} ${cpX2},${cpY2} ${x},${y}`;
                fillPath += ` C${cpX1},${cpY1} ${cpX2},${cpY2} ${x},${y}`;
            }

            fillPath += ` L${width},${height} Z`;

            return { fillPath, strokePath };
        };

        const { fillPath: chartFillPath, strokePath: chartStrokePath } = generateChartPath(chartPoints);

        return {
            chartPoints,
            chartFillPath,
            chartStrokePath,
        };
    }, [analytics, analyticsTimeRange]);



    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const behaviorPlan = isEditingMetadata ? editBehaviorPlan : behaviorPlanDisplay;
    const renderList = (items: string[]) => {
        if (!items || items.length === 0) {
            return <p className="text-sm text-foreground/75">Not set yet.</p>;
        }
        return (
            <ul className="list-disc list-inside text-sm text-foreground/90 space-y-1.5">
                {items.map((item, idx) => (
                    <li key={`${item}-${idx}`}>{item}</li>
                ))}
            </ul>
        );
    };

    return (
        <div className="w-full min-h-screen bg-background text-foreground flex flex-col font-sans relative">
            {/* Background Ambience (from code.html) */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]"></div>
                <div className="absolute top-[40%] -right-[5%] w-[30%] h-[30%] bg-rose-500/5 rounded-full blur-[100px]"></div>
            </div>

            <div className="relative z-10 flex flex-col flex-1 max-w-7xl mx-auto w-full px-6 lg:px-12 py-8 h-full">
                {/* Breadcrumbs */}
                <nav className="flex items-center gap-2 mb-6 text-sm">
                    <button onClick={props.onBack} data-wt="goal-back" className="opacity-50 hover:opacity-100 transition-opacity">Ambitions</button>
                    <span className="material-symbols-outlined text-xs opacity-30">chevron_right</span>
                    <span className="text-primary font-medium">{props.goal.title}</span>
                </nav>

                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-10 shrink-0" data-wt="goal-header">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider border border-primary/20">
                                {props.goal.category}
                            </span>
                            <span className="flex items-center gap-1 text-xs opacity-50">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                {props.goal.updatedAt
                                    ? `Updated ${new Date(props.goal.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                    : props.goal.createdAt
                                        ? `Created ${new Date(props.goal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                        : 'Updated recently'
                                }
                            </span>
                        </div>
                        {isEditingMetadata ? (
                            <div className="flex flex-col gap-4 w-full">
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-foreground bg-transparent border-b border-border focus:border-primary outline-none py-1"
                                    placeholder="Ambition Title"
                                />
                                <textarea
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="text-lg opacity-80 max-w-2xl bg-card/60 rounded-lg p-3 border border-border focus:border-primary outline-none min-h-[100px]"
                                    placeholder="Strategic Overview"
                                />
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-2xl">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Preferred Time</p>
                                        <select
                                            value={editPreferredTime}
                                            onChange={(e) => setEditPreferredTime(e.target.value as Goal['preferredTime'])}
                                            className="w-full bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/60"
                                        >
                                            <option value="morning">Morning</option>
                                            <option value="afternoon">Afternoon</option>
                                            <option value="evening">Evening</option>
                                            <option value="flexible">Flexible</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Sessions / Week</p>
                                        <input
                                            type="number"
                                            min={1}
                                            max={7}
                                            value={editFrequency}
                                            onChange={(e) => setEditFrequency(Number(e.target.value))}
                                            className="w-full bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/60"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Minutes / Session</p>
                                        <input
                                            type="number"
                                            min={15}
                                            max={180}
                                            step={5}
                                            value={editDuration}
                                            onChange={(e) => setEditDuration(Number(e.target.value))}
                                            className="w-full bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/60"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Energy</p>
                                        <select
                                            value={editEnergyCost}
                                            onChange={(e) => setEditEnergyCost(e.target.value as Goal['energyCost'])}
                                            className="w-full bg-card/60 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-primary/60"
                                        >
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                            <option value="low">Low</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-2 max-w-2xl">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Priority Weight</p>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={editPriorityWeight}
                                        onChange={(e) => setEditPriorityWeight(Number(e.target.value))}
                                        className="w-full accent-primary"
                                    />
                                    <p className="text-xs text-muted-foreground">Current weight: {editPriorityWeight}</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-foreground">{props.goal.title}</h1>
                                <div className="flex flex-wrap items-center gap-2 max-w-2xl">
                                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
                                        {props.goal.timeline || `${props.goal.estimatedWeeks} weeks`}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
                                        {Math.max(1, props.goal.frequency || 1)}× / week
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
                                        {Math.max(15, props.goal.duration || 60)} min
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
                                        Energy: {(props.goal.energyCost || 'medium').slice(0, 1).toUpperCase() + (props.goal.energyCost || 'medium').slice(1)}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
                                        Priority: {props.goal.priorityWeight ?? 50}
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-muted-foreground">
                                        {(props.goal.preferredTime || 'flexible').slice(0, 1).toUpperCase() + (props.goal.preferredTime || 'flexible').slice(1)}
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${(props.goal.status === 'active')
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                        : (props.goal.status === 'paused')
                                            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                                            : (props.goal.status === 'completed')
                                                ? 'bg-green-500/10 border-green-500/20 text-green-300'
                                                : (props.goal.status === 'abandoned')
                                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                                                    : 'bg-muted border-border text-muted-foreground'
                                        }`}>
                                        {(props.goal.status || 'planning').slice(0, 1).toUpperCase() + (props.goal.status || 'planning').slice(1)}
                                    </span>
                                    {nextSessionLabel && (
                                        <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                                            Next session: {nextSessionLabel}
                                        </span>
                                    )}
                                </div>

                                <p className="text-base lg:text-lg text-muted-foreground max-w-2xl leading-relaxed">
                                    {nextUp ? (
                                        nextUp.kind === 'subtask' ? (
                                            <>
                                                Next up: <span className="text-foreground font-semibold">{nextUp.title}</span>{' '}
                                                <span className="text-muted-foreground/70">in</span> {nextUp.taskTitle}{' '}
                                                <span className="text-muted-foreground/70">•</span> {nextUp.milestoneTitle}{' '}
                                                <span className="text-muted-foreground/70">•</span> Phase {nextUp.phaseNumber}
                                            </>
                                        ) : nextUp.kind === 'task' ? (
                                            <>
                                                Next up: <span className="text-foreground font-semibold">{nextUp.title}</span>{' '}
                                                <span className="text-muted-foreground/70">•</span> {nextUp.milestoneTitle}{' '}
                                                <span className="text-muted-foreground/70">•</span> Phase {nextUp.phaseNumber}
                                            </>
                                        ) : (
                                            <>
                                                Next up: <span className="text-foreground font-semibold">{nextUp.title}</span>{' '}
                                                <span className="text-muted-foreground/70">•</span> Phase {nextUp.phaseNumber}
                                            </>
                                        )
                                    ) : (
                                        <>No next action yet — add milestones and tasks to start executing.</>
                                    )}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Stats Panel */}
                    <div className="flex items-center gap-6 glass-panel p-5 rounded-2xl border border-border bg-card/90 backdrop-blur-xl">
                        <div className="relative size-20 flex items-center justify-center">
                            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                                <circle className="text-border" cx="50" cy="50" fill="transparent" r="42" stroke="currentColor" strokeWidth="8"></circle>
                                <circle className="text-primary" cx="50" cy="50" fill="transparent" r="42" stroke="currentColor"
                                    strokeDasharray="264"
                                    strokeDashoffset={264 - (264 * (props.goal.overallProgress / 100))}
                                    strokeLinecap="round"
                                    strokeWidth="8">
                                </circle>
                            </svg>
                            <span className="absolute text-xl font-bold">{Math.round(props.goal.overallProgress)}%</span>
                        </div>
                        <div className="flex flex-col">
                            <p className="text-sm opacity-50 font-medium">Overall Progress</p>
                            <p className="text-xl font-bold">Phase {(props.goal.currentPhaseIndex || 0) + 1} of {props.goal.phases.length}</p>
                        </div>

                        {isEditingMetadata ? (
                            <div className="flex flex-col gap-2 ml-4">
                                <button
                                    onClick={handleSaveMetadata}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">check</span>
                                    Save
                                </button>
                                <button
                                    onClick={() => {
                                        setIsEditingMetadata(false);
                                        setEditTitle(props.goal.title);
                                        setEditDescription(props.goal.strategyOverview || '');
                                        setEditPreferredTime(props.goal.preferredTime || 'flexible');
                                        setEditFrequency(props.goal.frequency || 3);
                                        setEditDuration(props.goal.duration || 60);
                                        setEditEnergyCost(props.goal.energyCost || 'medium');
                                        setEditPriorityWeight(props.goal.priorityWeight ?? 50);
                                        setEditBehaviorPlan(normalizeBehaviorPlan(props.goal.behaviorPlan));
                                    }}
                                    className="bg-muted hover:bg-muted/80 text-foreground font-bold py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">close</span>
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 ml-8 min-w-[300px]">
                                {/* Top Row: Actions change based on goal status */}
                                {props.goal.status !== 'abandoned' ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => {
                                                    if (props.isScheduling) return;
                                                    if (hasCalendar) {
                                                        if (props.onRebuildCalendar) {
                                                            props.onRebuildCalendar(props.goal.id);
                                                        } else if (props.onCreateCalendar) {
                                                            props.onCreateCalendar(props.goal.id);
                                                        }
                                                        return;
                                                    }
                                                    props.onCreateCalendar?.(props.goal.id);
                                                }}
                                                data-wt="goal-schedule"
                                                disabled={!!props.isScheduling}
                                                className={`bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-12 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed ${props.isScheduling ? 'hover:bg-primary' : ''}`}
                                                title={props.isScheduling ? "Building calendar..." : hasCalendar ? "Rebuild calendar schedule" : "Generate Intelligent Schedule"}
                                            >
                                                <span className="material-symbols-outlined">{props.isScheduling ? 'sync' : hasCalendar ? 'autorenew' : 'calendar_add_on'}</span>
                                                {props.isScheduling ? 'Building...' : hasCalendar ? 'Rebuild' : 'Schedule'}
                                            </button>
                                            {props.goal.status === 'paused' ? (
                                                <button
                                                    onClick={() => props.onResumeGoal && props.onResumeGoal(props.goal.id)}
                                                    className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-medium h-12 rounded-xl transition-all flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined text-sm">play_arrow</span>
                                                    Resume
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => props.onPauseGoal && props.onPauseGoal(props.goal.id)}
                                                    className="bg-muted hover:bg-muted/80 text-foreground font-medium h-12 rounded-xl transition-all flex items-center justify-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined text-sm">pause</span>
                                                    Pause
                                                </button>
                                            )}
                                        </div>
                                        {hasCalendar && (
                                            <button
                                                onClick={() => props.onClearCalendar?.(props.goal.id)}
                                                className="bg-muted/60 hover:bg-rose-500/20 text-muted-foreground hover:text-foreground font-medium h-10 rounded-xl transition-all flex items-center justify-center gap-2"
                                                title="Delete all calendar events for this ambition"
                                            >
                                                <span className="material-symbols-outlined text-sm text-rose-400">delete_sweep</span>
                                                Clear Calendar
                                            </button>
                                        )}
                                        {/* Bottom Row: Abandon + Edit */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => props.onAbandonGoal && props.onAbandonGoal(props.goal.id)}
                                                className="bg-muted/60 hover:bg-rose-500/20 text-muted-foreground hover:text-foreground font-medium h-10 rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm text-rose-500">cancel</span>
                                                Abandon
                                            </button>
                                            <button
                                                onClick={() => setIsEditingMetadata(true)}
                                                className="bg-muted/60 hover:bg-muted text-foreground font-medium h-10 rounded-xl transition-all flex items-center justify-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                                Edit
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    /* Abandoned goals: Show Delete + Edit only */
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => props.onDeleteGoal && props.onDeleteGoal(props.goal.id)}
                                            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-medium h-12 rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-sm">delete_forever</span>
                                            Delete Permanently
                                        </button>
                                        <button
                                            onClick={() => setIsEditingMetadata(true)}
                                            className="bg-muted/60 hover:bg-muted text-foreground font-medium h-12 rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-sm">edit</span>
                                            Edit
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border mb-8 overflow-x-auto shrink-0 scrollbar-hide" data-wt="goal-tabs">
                    {['Overview', 'Phases', 'Execution Calendar', 'Resources', 'Analytics'].map((label) => {
                        const id = label.toLowerCase().replace(' ', '') === 'executioncalendar' ? 'calendar' : label.toLowerCase();
                        const isActive = activeTab === id;

                        return (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id as TabType)}
                                className={`px-8 py-4 text-sm whitespace-nowrap transition-all
                            ${isActive
                                        ? 'font-bold border-b-2 border-primary text-primary'
                                        : 'font-medium text-muted-foreground hover:text-foreground'}
                        `}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Content Area - Filling remaining space */}
                <div className="flex-1 relative">
                    {activeTab === 'phases' ? (
                        <div className="h-full">
                            <PhaseExplorer
                                goal={props.goal}
                                onMilestoneToggle={props.onMilestoneToggle}
                                onSubTaskToggle={props.onSubTaskToggle}
                                onTaskToggle={props.onTaskToggle}
                                onTaskUpdate={props.onTaskUpdate}
                                onPhaseUpdate={props.onPhaseUpdate}
                                onMilestoneUpdate={props.onMilestoneUpdate}
                                onSubTaskUpdate={props.onSubTaskUpdate}
                                onAddPhase={props.onAddPhase}
                                onAddMilestone={props.onAddMilestone}
                                onAddTask={props.onAddTask}
                                onAddSubTask={props.onAddSubTask}
                                onBeginSession={handleBeginSession}
                            />
                        </div>
                    ) : activeTab === 'overview' ? (
                        <div className="p-8 pb-32">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left Column: Strategy & Gaps */}
                                <div className="lg:col-span-8 space-y-8">
                                    {/* Strategy Summary */}
                                    <section className="glass-panel p-8 rounded-2xl border border-border bg-card/60">
                                        <div className="flex items-center gap-3 mb-6">
                                            <span className="material-symbols-outlined text-primary">psychology</span>
                                            <h3 className="text-xl font-bold text-foreground">Strategy Summary</h3>
                                        </div>
                                        <div className="prose max-w-none opacity-80 leading-relaxed text-muted-foreground">
                                            <p>{props.goal.strategyOverview || `Focus on completing ${props.goal.phases.length} phases with ${props.goal.phases.reduce((sum, p) => sum + p.milestones.length, 0)} milestones to achieve "${props.goal.title}". Current progress is at ${props.goal.overallProgress}%.`}</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                                <div className="bg-muted/60 p-4 rounded-xl border border-border">
                                                    <p className="text-xs opacity-50 mb-1 text-muted-foreground">Primary Lever</p>
                                                    <p className="font-semibold text-foreground">
                                                        {props.goal.phases.length > 4 ? 'Sustained Execution' :
                                                            props.goal.phases.length > 2 ? 'Consistent Progress' :
                                                                'Focused Intensity'}
                                                    </p>
                                                </div>
                                                <div className="bg-muted/60 p-4 rounded-xl border border-border">
                                                    <p className="text-xs opacity-50 mb-1 text-muted-foreground">Risk Profile</p>
                                                    <p className={`font-semibold ${(overviewStatus === 'loading' && !hasAnyRiskSignal)
                                                        ? 'text-muted-foreground'
                                                        : riskProfile.toneClass
                                                        }`}>
                                                        {(overviewStatus === 'loading' && !hasAnyRiskSignal)
                                                            ? 'Analyzing…'
                                                            : riskProfile.label}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Behavior Plan */}
                                    <section className="glass-panel p-8 rounded-2xl border border-border bg-card/60">
                                        <div className="flex items-center gap-3 mb-6">
                                            <span className="material-symbols-outlined text-primary">fact_check</span>
                                            <h3 className="text-xl font-bold text-foreground">Behavior Plan</h3>
                                        </div>
                                        <p className="text-sm text-foreground/80 mb-6 leading-relaxed">
                                            Structured execution framework with clear sections so strategy signals, supporting habits, and friction controls are easy to scan.
                                        </p>
                                        {isEditingMetadata ? (
                                            <div className="space-y-5">
                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">SMART Foundation</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Clarify outcome definition, scope, and delivery horizon.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Specific</p>
                                                            <textarea
                                                                value={editBehaviorPlan.smart.specific}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    smart: { ...prev.smart, specific: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[92px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Measurable</p>
                                                            <textarea
                                                                value={editBehaviorPlan.smart.measurable}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    smart: { ...prev.smart, measurable: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[92px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Achievable</p>
                                                            <textarea
                                                                value={editBehaviorPlan.smart.achievable}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    smart: { ...prev.smart, achievable: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[92px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Relevant</p>
                                                            <textarea
                                                                value={editBehaviorPlan.smart.relevant}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    smart: { ...prev.smart, relevant: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[92px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2 md:col-span-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Time Bound</p>
                                                            <textarea
                                                                value={editBehaviorPlan.smart.timeBound}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    smart: { ...prev.smart, timeBound: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[88px]"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">WOOP Planning</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Capture intent, expected payoff, blockers, and response plans.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Wish</p>
                                                            <textarea
                                                                value={editBehaviorPlan.woop.wish}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    woop: { ...prev.woop, wish: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[88px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Outcome</p>
                                                            <textarea
                                                                value={editBehaviorPlan.woop.outcome}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    woop: { ...prev.woop, outcome: e.target.value }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[88px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Obstacles (one per line)</p>
                                                            <textarea
                                                                value={(editBehaviorPlan.woop.obstacles || []).join('\n')}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    woop: { ...prev.woop, obstacles: parseLines(e.target.value) }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[110px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Plan (one per line)</p>
                                                            <textarea
                                                                value={(editBehaviorPlan.woop.plan || []).join('\n')}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    woop: { ...prev.woop, plan: parseLines(e.target.value) }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[110px]"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">Habit Execution</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Specify trigger-action plans and repeated routines.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Implementation Intentions (If...then...)</p>
                                                            <textarea
                                                                value={formatIntentions(editBehaviorPlan.implementationIntentions)}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    implementationIntentions: parseIntentions(e.target.value)
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[126px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Habit Stacking (Anchor | Routine | Reward)</p>
                                                            <textarea
                                                                value={formatHabitStacking(editBehaviorPlan.habitStacking)}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    habitStacking: parseHabitStacking(e.target.value)
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[126px]"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">Friction Controls</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">List blockers to remove and supports to add.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Remove</p>
                                                            <textarea
                                                                value={(editBehaviorPlan.frictionReduction.remove || []).join('\n')}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    frictionReduction: {
                                                                        ...prev.frictionReduction,
                                                                        remove: parseLines(e.target.value)
                                                                    }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[112px]"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/75 font-semibold">Add</p>
                                                            <textarea
                                                                value={(editBehaviorPlan.frictionReduction.add || []).join('\n')}
                                                                onChange={(e) => setEditBehaviorPlan(prev => ({
                                                                    ...prev,
                                                                    frictionReduction: {
                                                                        ...prev.frictionReduction,
                                                                        add: parseLines(e.target.value)
                                                                    }
                                                                }))}
                                                                className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm text-foreground leading-relaxed min-h-[112px]"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-5">
                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">SMART Foundation</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Core commitment framing and objective guardrails.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Specific</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.smart.specific || 'Not set yet.'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Measurable</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.smart.measurable || 'Not set yet.'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Achievable</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.smart.achievable || 'Not set yet.'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Relevant</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.smart.relevant || 'Not set yet.'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4 md:col-span-2">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Time Bound</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.smart.timeBound || 'Not set yet.'}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">WOOP Planning</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Desired outcome, likely obstacles, and action responses.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Wish</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.woop.wish || 'Not set yet.'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Outcome</p>
                                                            <p className="text-sm text-foreground/90 leading-relaxed">{behaviorPlan.woop.outcome || 'Not set yet.'}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Obstacles</p>
                                                            {renderList(behaviorPlan.woop.obstacles)}
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Plan</p>
                                                            {renderList(behaviorPlan.woop.plan)}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">Habit Execution</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Automation routines and trigger-based commitments.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Implementation Intentions</p>
                                                            {renderList((behaviorPlan.implementationIntentions || []).map(item => `If ${item.if} then ${item.then}`))}
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Habit Stacking</p>
                                                            {renderList((behaviorPlan.habitStacking || []).map(item => [item.anchor, item.routine, item.reward].filter(Boolean).join(' • ')))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border bg-background/70 p-5">
                                                    <h4 className="text-sm font-semibold text-foreground mb-1">Friction Controls</h4>
                                                    <p className="text-xs text-foreground/70 mb-4">Environment changes that remove resistance and reinforce consistency.</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Remove</p>
                                                            {renderList(behaviorPlan.frictionReduction.remove)}
                                                        </div>
                                                        <div className="rounded-xl border border-border bg-card/60 p-4">
                                                            <p className="text-xs uppercase tracking-wide text-foreground/70 mb-2 font-semibold">Add</p>
                                                            {renderList(behaviorPlan.frictionReduction.add)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    {/* Critical Gaps */}
                                    <section className="space-y-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-rose-500 fill-1">warning</span>
                                                <h3 className="text-xl font-bold text-foreground">Critical Gaps</h3>
                                            </div>
                                            <span className="text-xs opacity-50 text-muted-foreground">
                                                {overviewStatus === 'loading'
                                                    ? 'Analyzing…'
                                                    : overviewStatus === 'error'
                                                        ? 'Analysis failed'
                                                        : `${normalizedCriticalGaps.length} Alerts Detected`}
                                            </span>
                                        </div>
                                        {overviewStatus === 'loading' ? (
                                            <div className="glass-panel p-6 rounded-2xl border border-border bg-card/60 text-center">
                                                <span className="material-symbols-outlined text-3xl text-muted-foreground/70 mb-2">autorenew</span>
                                                <p className="text-muted-foreground">Generating critical gaps analysis…</p>
                                            </div>
                                        ) : overviewStatus === 'error' ? (
                                            <div className="glass-panel p-6 rounded-2xl border border-border bg-card/60 text-center">
                                                <span className="material-symbols-outlined text-3xl text-rose-400 mb-2">error</span>
                                                <p className="text-muted-foreground">We couldn’t generate critical gaps. Please retry.</p>
                                                {props.onRetryOverview && (
                                                    <button
                                                        onClick={() => props.onRetryOverview?.(props.goal.id)}
                                                        className="mt-4 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-bold uppercase tracking-widest transition-all"
                                                    >
                                                        Retry Analysis
                                                    </button>
                                                )}
                                            </div>
                                        ) : overviewStatus === 'idle' ? (
                                            <div className="glass-panel p-6 rounded-2xl border border-border bg-card/60 text-center">
                                                <span className="material-symbols-outlined text-3xl text-muted-foreground/70 mb-2">hourglass_empty</span>
                                                <p className="text-muted-foreground">Analysis pending. It will appear shortly.</p>
                                            </div>
                                        ) : normalizedCriticalGaps.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {normalizedCriticalGaps.map((gap, index) => {
                                                    const isWarning = index % 2 === 0;
                                                    const borderColor = isWarning ? 'border-l-rose-500' : 'border-l-primary';
                                                    const bgColor = isWarning ? 'bg-rose-500/5' : 'bg-primary/5';
                                                    const iconBg = isWarning ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary';
                                                    const icons = ['warning', 'schedule', 'trending_down', 'psychology', 'speed'];
                                                    const icon = icons[index % icons.length];

                                                    return (
                                                        <div key={index} className={`glass-panel p-5 rounded-2xl border-l-4 ${borderColor} relative overflow-hidden group bg-card/60 border-t border-r border-b border-border`}>
                                                            <div className={`absolute inset-0 ${bgColor} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                                                            <div className="flex items-start gap-4">
                                                                <div className={`p-2 rounded-lg ${iconBg}`}>
                                                                    <span className="material-symbols-outlined">{icon}</span>
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm text-muted-foreground">{gap}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="glass-panel p-6 rounded-2xl border border-border bg-card/60 text-center">
                                                <span className="material-symbols-outlined text-3xl text-green-500 mb-2">verified</span>
                                                <p className="text-muted-foreground">No critical gaps identified. You're on track!</p>
                                            </div>
                                        )}
                                    </section>
                                </div>

                                {/* Right Column: Coach Advice & Insights */}
                                <div className="lg:col-span-4 space-y-8">
                                    {/* AI Coach Advice */}
                                    <section className="glass-panel p-8 rounded-2xl relative overflow-hidden border border-primary/20 bg-card/60 transition-all hover:shadow-[0_0_20px_hsl(var(--primary)/0.2)]">
                                        <div className="absolute -right-8 -top-8 size-32 bg-primary/10 rounded-full blur-2xl"></div>
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="size-10 rounded-full bg-gradient-to-br from-primary to-rose-500 flex items-center justify-center text-primary-foreground">
                                                    <span className="material-symbols-outlined text-xl">smart_toy</span>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold leading-none text-foreground">Coach Advice</h3>
                                                    <span className="text-[10px] uppercase font-bold text-primary tracking-widest">AI Agent Active</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-5">
                                            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 italic text-sm leading-relaxed opacity-90 text-foreground">
                                                {(() => {
                                                    // Get the active phase's coach advice, or generate contextual advice
                                                    const activePhase = props.goal.phases.find(p => p.status === 'active');
                                                    if (activePhase?.coachAdvice) return `"${activePhase.coachAdvice}"`;

                                                    // Generate contextual advice based on progress
                                                    if (props.goal.overallProgress < 25) {
                                                        return `"You're in the foundation phase. Focus on establishing strong habits and completing your first milestones. Momentum builds on early wins!"`;
                                                    } else if (props.goal.overallProgress < 50) {
                                                        return `"Good progress! You're building momentum. Consider reviewing your pace to ensure sustainable progress toward your ${props.goal.estimatedWeeks}-week timeline."`;
                                                    } else if (props.goal.overallProgress < 75) {
                                                        return `"You're past the halfway mark! This is where consistency matters most. Stay focused on your active phase and don't lose sight of your end ambition."`;
                                                    } else {
                                                        return `"Excellent progress at ${props.goal.overallProgress}%! You're in the home stretch. Maintain your momentum and push through to completion!"`;
                                                    }
                                                })()}
                                            </div>
                                            <div className="space-y-4">
                                                <p className="text-xs font-bold opacity-40 uppercase tracking-widest text-muted-foreground">Next Actions</p>
                                                {(() => {
                                                    // Get next incomplete tasks/milestones
                                                    const nextActions: string[] = [];
                                                    for (const phase of props.goal.phases) {
                                                        if (phase.status === 'completed') continue;
                                                        for (const milestone of phase.milestones) {
                                                            if (!milestone.isCompleted && nextActions.length < 2) {
                                                                nextActions.push(`Complete: ${milestone.title}`);
                                                            }
                                                        }
                                                        if (nextActions.length >= 2) break;
                                                    }

                                                    if (nextActions.length === 0) {
                                                        nextActions.push('Review your progress', 'Plan next milestone');
                                                    }

                                                    return nextActions.map((action, idx) => (
                                                        <div key={idx} className="flex items-center gap-3 group cursor-pointer">
                                                            <div className="size-6 rounded border border-border flex items-center justify-center group-hover:border-primary transition-colors">
                                                                <span className="material-symbols-outlined text-xs text-transparent group-hover:text-primary">check</span>
                                                            </div>
                                                            <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity text-foreground">{action}</span>
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                            <button
                                                onClick={() => props.onAskCoach ? props.onAskCoach(props.goal.id) : alert('Chat with Solulu: Navigate to Chat view to ask questions about this ambition.')}
                                                data-wt="goal-ask-coach"
                                                className="w-full py-3 text-xs font-bold uppercase tracking-widest text-primary border border-primary/30 rounded-xl hover:bg-primary/10 transition-colors"
                                            >
                                                Ask Solulu
                                            </button>
                                        </div>
                                    </section>

                                    {/* Milestone Sidebar */}
                                    <section className="glass-panel p-6 rounded-2xl border border-border bg-card/60">
                                        <h3 className="font-bold mb-6 text-foreground">Upcoming Milestones</h3>
                                        <div className="space-y-6 relative">
                                            <div className="absolute left-3 top-2 bottom-2 w-px bg-border"></div>
                                            {(() => {
                                                // Get upcoming (uncompleted) milestones from all phases
                                                const upcomingMilestones = props.goal.phases
                                                    .flatMap((phase, phaseIdx) =>
                                                        phase.milestones
                                                            .filter(m => !m.isCompleted)
                                                            .map(m => ({ ...m, phaseNumber: phaseIdx + 1, phaseTitle: phase.title }))
                                                    )
                                                    .slice(0, 3);

                                                if (upcomingMilestones.length === 0) {
                                                    return (
                                                        <div className="text-center py-4">
                                                            <span className="material-symbols-outlined text-2xl text-green-500 mb-2">celebration</span>
                                                            <p className="text-muted-foreground text-sm">All milestones completed!</p>
                                                        </div>
                                                    );
                                                }

                                                return upcomingMilestones.map((milestone, idx) => {
                                                    const isFirst = idx === 0;
                                                    return (
                                                        <div key={milestone.id} className={`flex items-start gap-4 relative ${idx > 1 ? 'opacity-40' : ''}`}>
                                                            <div className={`size-6 rounded-full ${isFirst ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'} flex items-center justify-center text-[10px] font-bold z-10`}>
                                                                {idx + 1}
                                                            </div>
                                                            <div>
                                                                <p className={`text-sm font-semibold ${!isFirst ? 'opacity-60' : ''} text-foreground`}>{milestone.title}</p>
                                                                <p className="text-xs opacity-40 text-muted-foreground">Phase {milestone.phaseNumber}: {milestone.phaseTitle}</p>
                                                                {milestone.targetWeek && (
                                                                    <p className="text-xs opacity-30 text-muted-foreground">Target: Week {milestone.targetWeek}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'calendar' ? (
                        <div className="h-full">
                            <ExecutionCalendar
                                events={goalEvents}
                                currentDate={calendarMonth}
                                onDateChange={setCalendarMonth}
                                onEventClick={(event) => setSelectedEvent(event)}
                            />
                        </div>
                    ) : activeTab === 'analytics' ? (
                        <div className="h-full overflow-y-auto p-8 pb-32 space-y-8">
                            {/* Header with Export */}
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold text-foreground">Progress Analytics</h2>
                                <button
                                    onClick={() => {
                                        // Create a text summary of analytics
                                        const summary = `
${props.goal.title} - Analytics Report
Generated: ${new Date().toLocaleDateString()}

=== Performance Metrics ===
Velocity: ${analytics.velocity}
Focus Score: ${analytics.focusScore}%
Current Streak: ${analytics.streak} days

=== Task Completion ===
Tasks: ${analytics.completedTasks}/${analytics.totalTasks} completed
Subtasks: ${analytics.completedSubtasks}/${analytics.totalSubtasks} completed
Overall Progress: ${props.goal.overallProgress || 0}%

=== Phase Status ===
${props.goal.phases.map((p, i) => `Phase ${i + 1}: ${p.title} - ${p.milestones.filter(m => m.isCompleted).length}/${p.milestones.length} milestones`).join('\n')}
                                        `.trim();

                                        // Copy to clipboard
                                        navigator.clipboard.writeText(summary).then(() => {
                                            alert('Analytics summary copied to clipboard!');
                                        }).catch((err) => {
                                            logger.error('[GoalDetailView] Failed to copy analytics summary', err);
                                            alert('Could not copy to clipboard. Here is your summary:\n\n' + summary);
                                        });
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all text-sm font-bold"
                                    title="Export analytics"
                                >
                                    <span className="material-symbols-outlined text-lg">content_copy</span>
                                    Copy Report
                                </button>
                            </div>

                            {/* Metric Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="glass-panel p-8 rounded-3xl flex flex-col justify-between border border-border bg-card/60">
                                    <div className="flex justify-between items-start">
                                        <span className="p-3 rounded-2xl bg-primary/10 text-primary">
                                            <span className="material-symbols-outlined text-2xl">speed</span>
                                        </span>
                                        {analytics.velocityChange !== 0 && (
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${analytics.velocityChange > 0
                                                ? 'text-emerald-500 bg-emerald-500/10'
                                                : 'text-rose-500 bg-rose-500/10'
                                                }`}>
                                                {analytics.velocityChange > 0 ? '+' : ''}{analytics.velocityChange}%
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-5xl font-extrabold tracking-tighter mb-2">{analytics.velocity}</p>
                                        <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Velocity</p>
                                        <p className="text-xs opacity-30 mt-1">{analytics.completedTasks + analytics.completedSubtasks} items done</p>
                                    </div>
                                </div>
                                <div className="glass-panel p-8 rounded-3xl flex flex-col justify-between border border-border bg-card/60">
                                    <div className="flex justify-between items-start">
                                        <span className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
                                            <span className="material-symbols-outlined text-2xl">target</span>
                                        </span>
                                        <span className="text-xs font-bold opacity-40">Target: 100%</span>
                                    </div>
                                    <div>
                                        <p className="text-5xl font-extrabold tracking-tighter mb-2">{analytics.focusScore}</p>
                                        <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Focus Score</p>
                                        <p className="text-xs opacity-30 mt-1">Completion rate</p>
                                    </div>
                                </div>
                                <div className="glass-panel p-8 rounded-3xl flex flex-col justify-between border border-border bg-card/60">
                                    <div className="flex justify-between items-start">
                                        <span className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
                                            <span className="material-symbols-outlined text-2xl">local_fire_department</span>
                                        </span>
                                        {analytics.streak >= 7 && (
                                            <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
                                                {analytics.streak >= 14 ? 'On Fire!' : 'Great Streak!'}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-5xl font-extrabold tracking-tighter mb-2">{analytics.streak}</p>
                                        <p className="text-sm font-bold opacity-40 uppercase tracking-widest">Streak Days</p>
                                        <p className="text-xs opacity-30 mt-1">Consecutive active days</p>
                                    </div>
                                </div>
                            </div>

                            {/* Charts Area */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                {/* Velocity Chart */}
                                <div className="lg:col-span-8 glass-panel p-8 rounded-3xl min-h-[400px] border border-border bg-card/60">
                                    <div className="flex items-center justify-between mb-8">
                                        <div>
                                            <h3 className="text-xl font-bold text-foreground">Progress Velocity</h3>
                                            <p className="text-xs opacity-40">Cumulative ambition growth over last {analyticsTimeRange} days</p>
                                        </div>
                                        <select
                                            value={analyticsTimeRange}
                                            onChange={(e) => setAnalyticsTimeRange(Number(e.target.value) as 30 | 90)}
                                            className="bg-card/60 border border-border rounded-lg text-xs font-bold py-1 px-3 outline-none text-foreground cursor-pointer hover:bg-card transition-colors"
                                        >
                                            <option value={30}>Last 30 Days</option>
                                            <option value={90}>Last 90 Days</option>
                                        </select>
                                    </div>
                                    <div className="relative w-full h-64 mt-4">
                                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 100">
                                            <defs>
                                                <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                                                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4"></stop>
                                                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0"></stop>
                                                </linearGradient>
                                            </defs>
                                            <path d={chartData.chartFillPath || "M0,100 L400,100 Z"} fill="url(#chartGradient)"></path>
                                            <path d={chartData.chartStrokePath || "M0,100 L400,100"} fill="none" stroke="hsl(var(--primary))" strokeLinecap="round" strokeWidth="2.5"></path>
                                            {/* Data points */}
                                            {chartData.chartPoints.map((point, i) => {
                                                const x = i * (400 / (chartData.chartPoints.length - 1));
                                                const y = 100 - (point / 100 * 100);
                                                return (
                                                    <circle
                                                        key={i}
                                                        cx={x}
                                                        cy={y}
                                                        r="3"
                                                        fill="hsl(var(--primary))"
                                                        className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                                                    >
                                                        <title>{Math.round(point)}% progress</title>
                                                    </circle>
                                                );
                                            })}
                                        </svg>
                                        {/* Grid lines */}
                                        <div className="absolute inset-0 flex flex-col justify-between opacity-5 pointer-events-none">
                                            <div className="w-full border-t border-border"></div>
                                            <div className="w-full border-t border-border"></div>
                                            <div className="w-full border-t border-border"></div>
                                            <div className="w-full border-t border-border"></div>
                                        </div>
                                        {/* Y-axis labels */}
                                        <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[10px] text-muted-foreground/60 -ml-6">
                                            <span>100%</span>
                                            <span>75%</span>
                                            <span>50%</span>
                                            <span>25%</span>
                                            <span>0%</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Phase Status Radial - Using real goal progress */}
                                <div className="lg:col-span-4 glass-panel p-8 rounded-3xl flex flex-col items-center justify-center border border-border bg-card/60">
                                    <h3 className="text-lg font-bold mb-6 w-full text-foreground">Ambition Progress</h3>
                                    <div className="relative size-48">
                                        <svg className="size-full rotate-[-90deg]" viewBox="0 0 100 100">
                                            <circle cx="50" cy="50" fill="transparent" r="40" stroke="hsl(var(--border) / 0.2)" strokeWidth="12"></circle>
                                            <circle
                                                cx="50" cy="50" fill="transparent" r="40"
                                                stroke="hsl(var(--primary))"
                                                strokeDasharray="251.2"
                                                strokeDashoffset={251.2 - (251.2 * (props.goal.overallProgress / 100))}
                                                strokeLinecap="round"
                                                strokeWidth="12"
                                            ></circle>
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-3xl font-black text-foreground">{Math.round(props.goal.overallProgress)}%</span>
                                            <span className="text-[10px] uppercase font-bold opacity-40 text-muted-foreground">Phase {(props.goal.currentPhaseIndex || 0) + 1} of {props.goal.phases.length}</span>
                                        </div>
                                    </div>
                                    <div className="mt-8 grid grid-cols-3 gap-4 w-full text-center">
                                        <div>
                                            <p className="text-2xl font-bold text-primary">{props.goal.phases.filter(p => p.status === 'completed').length}</p>
                                            <span className="text-xs opacity-60 text-muted-foreground">Completed</span>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-amber-400">{props.goal.phases.filter(p => p.status === 'active').length}</p>
                                            <span className="text-xs opacity-60 text-muted-foreground">Active</span>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-muted-foreground/60">{props.goal.phases.filter(p => p.status === 'upcoming').length}</p>
                                            <span className="text-xs opacity-60 text-muted-foreground">Upcoming</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* History Log - Using real goal history */}
                            <div className="glass-panel p-8 rounded-3xl border border-border bg-card/60">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary">history</span>
                                        <h3 className="text-xl font-bold text-foreground">History Log</h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-muted-foreground/60">{(props.goal.history || []).length} entries</span>
                                        {(props.goal.history || []).length > 5 && (
                                            <button
                                                onClick={() => alert(`Full activity history:\n\n${(props.goal.history || []).map(h =>
                                                    `${new Date(h.timestamp).toLocaleDateString()} - ${h.type.replace(/_/g, ' ')}: ${h.details?.notes || h.details?.milestoneId || 'Activity recorded'}`
                                                ).join('\n')}`)}
                                                className="text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                                            >
                                                View All
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    {(props.goal.history || []).length === 0 ? (
                                        <div className="text-center py-8">
                                            <span className="material-symbols-outlined text-4xl text-muted-foreground/40 mb-2">history</span>
                                            <p className="text-sm text-muted-foreground">No history entries yet</p>
                                            <p className="text-xs text-muted-foreground/60 mt-1">Complete milestones to see your progress here</p>
                                        </div>
                                    ) : (
                                        (props.goal.history || []).slice(-5).reverse().map((entry, idx) => {
                                            const entryDate = new Date(entry.timestamp);
                                            const iconConfig = {
                                                'milestone_completed': { icon: 'check_circle', color: 'text-primary', hoverBg: 'group-hover:bg-primary/20' },
                                                'note_added': { icon: 'edit_note', color: 'text-amber-500', hoverBg: 'group-hover:bg-amber-500/20' },
                                                'phase_completed': { icon: 'flag', color: 'text-emerald-500', hoverBg: 'group-hover:bg-emerald-500/20' },
                                                'goal_created': { icon: 'add_circle', color: 'text-blue-500', hoverBg: 'group-hover:bg-blue-500/20' },
                                            }[entry.type] || { icon: 'radio_button_checked', color: 'text-muted-foreground/60', hoverBg: 'group-hover:bg-muted' };

                                            return (
                                                <div key={entry.id || idx} className="flex items-center gap-6 group">
                                                    <div className="text-sm font-bold opacity-30 w-24 shrink-0 uppercase">
                                                        {entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </div>
                                                    <div className={`size-10 rounded-xl bg-muted/60 flex items-center justify-center ${iconConfig.color} ${iconConfig.hoverBg} transition-colors`}>
                                                        <span className="material-symbols-outlined text-lg">{iconConfig.icon}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-foreground capitalize">{entry.type.replace(/_/g, ' ')}</h4>
                                                        <p className="text-sm opacity-50 text-muted-foreground">
                                                            {entry.details?.notes || entry.details?.milestoneId || 'Activity recorded'}
                                                        </p>
                                                    </div>
                                                    <div className="text-xs opacity-30 font-medium">
                                                        {entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'resources' ? (
                        <div className="h-full overflow-y-auto p-8 pb-32 space-y-12">
                            {/* Coming Soon Banner */}
                            <section className="glass-panel p-8 rounded-2xl border border-primary/20 relative overflow-hidden bg-card/60">
                                <div className="absolute -right-12 -top-12 size-64 bg-primary/10 rounded-full blur-3xl"></div>
                                <div className="relative z-10 flex flex-col items-center text-center py-8">
                                    <div className="p-4 rounded-2xl bg-primary/10 mb-6">
                                        <span className="material-symbols-outlined text-5xl text-primary">folder_open</span>
                                    </div>
                                    <h3 className="text-2xl font-bold text-foreground mb-2">Resources Coming Soon</h3>
                                    <p className="text-muted-foreground max-w-md mb-6">
                                        Save links, notes, and files related to your ambition.
                                        Track reference materials, templates, and important documents all in one place.
                                    </p>
                                    <div className="flex items-center gap-3 text-sm text-muted-foreground/70">
                                        <span className="material-symbols-outlined text-lg">construction</span>
                                        <span>This feature is under development</span>
                                    </div>
                                </div>
                            </section>

                            {/* Preview of Resource Types */}
                            <section>
                                <h3 className="text-lg font-bold text-muted-foreground mb-4">What you'll be able to store:</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="glass-panel p-5 rounded-xl border border-border bg-card/60 opacity-60">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                                                <span className="material-symbols-outlined">link</span>
                                            </div>
                                            <h4 className="font-bold text-foreground">Links</h4>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Web resources, articles, tutorials</p>
                                    </div>
                                    <div className="glass-panel p-5 rounded-xl border border-border bg-card/60 opacity-60">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                                                <span className="material-symbols-outlined">description</span>
                                            </div>
                                            <h4 className="font-bold text-foreground">Notes</h4>
                                        </div>
                                        <p className="text-sm text-muted-foreground">Quick notes, ideas, reminders</p>
                                    </div>
                                    <div className="glass-panel p-5 rounded-xl border border-border bg-card/60 opacity-60">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                                                <span className="material-symbols-outlined">attach_file</span>
                                            </div>
                                            <h4 className="font-bold text-foreground">Files</h4>
                                        </div>
                                        <p className="text-sm text-muted-foreground">PDFs, images, documents</p>
                                    </div>
                                </div>
                            </section>

                            {/* Smart Library Preview */}
                            <section className="glass-panel p-8 rounded-2xl border border-border relative overflow-hidden bg-card/60 opacity-60">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="material-symbols-outlined text-primary text-xl">auto_fix_high</span>
                                            <h3 className="text-xl font-bold text-foreground">Smart Library</h3>
                                        </div>
                                        <p className="text-sm opacity-50 text-muted-foreground">AI-powered resource suggestions for "{props.goal.category}" ambitions</p>
                                    </div>
                                </div>
                                <div className="text-center py-6">
                                    <p className="text-muted-foreground text-sm">Personalized book, course, and tool recommendations coming soon</p>
                                </div>
                            </section>

                            {/* Tip Section */}
                            <section className="glass-panel p-6 rounded-xl border border-blue-500/20 bg-blue-500/5">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                                        <span className="material-symbols-outlined">lightbulb</span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-foreground mb-1">Tip: Use the Chat Assistant</h4>
                                        <p className="text-sm text-muted-foreground">
                                            While the Resources tab is in development, you can ask Solulu to help you find
                                            relevant resources, track important links, or take notes about your progress.
                                        </p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full opacity-20">
                            <span className="material-symbols-outlined text-6xl mb-4">construction</span>
                            <p className="uppercase tracking-widest font-bold">Module Under Construction</p>
                        </div>
                    )}
                </div>
            </div>
            {
                selectedEvent && (
                    <EventDetailModal
                        isOpen={!!selectedEvent}
                        event={selectedEvent}
                        goals={[props.goal]}
                        userProfile={props.userProfile}
                        constraints={props.constraints}
                        calendarSchemaCapabilities={props.calendarSchemaCapabilities}
                        calendarEvents={props.calendarEvents || props.events || []}
                        onClose={() => setSelectedEvent(null)}
                        onSave={async (updates) => {
                            logger.debug('Saving event updates', { updates });
                            try {
                                if (props.onEventUpdate) {
                                    await props.onEventUpdate(selectedEvent.id, updates);
                                } else {
                                    const dbUpdates: any = {};
                                    if (updates.summary !== undefined) dbUpdates.summary = updates.summary;
                                    if (updates.description !== undefined) dbUpdates.description = updates.description;
                                    if (updates.location !== undefined) dbUpdates.location = updates.location;
                                    if (updates.eventType !== undefined) dbUpdates.event_type = updates.eventType;
                                    if (updates.status !== undefined) dbUpdates.status = updates.status;
                                    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
                                    if (updates.energyCost !== undefined) dbUpdates.energy_cost = updates.energyCost;
                                    if (updates.start?.dateTime !== undefined) {
                                        dbUpdates.start_datetime = localToUtcIso(updates.start.dateTime);
                                        dbUpdates.timezone = updates.start.timeZone;
                                    }
                                    if (updates.end?.dateTime !== undefined) {
                                        dbUpdates.end_datetime = localToUtcIso(updates.end.dateTime);
                                    }
                                    if (updates.difficulty !== undefined) dbUpdates.difficulty = updates.difficulty;
                                    if (updates.cognitiveType !== undefined) dbUpdates.cognitive_type = updates.cognitiveType;
                                    if (updates.isLocked !== undefined) dbUpdates.is_locked = updates.isLocked;
                                    if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;
                                    if (updates.effortMinutesAllocated !== undefined) dbUpdates.effort_minutes_allocated = updates.effortMinutesAllocated;
                                    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;

                                    const { error } = await supabase
                                        .from('calendar_events')
                                        .update(dbUpdates)
                                        .eq('id', selectedEvent.id);

                                    if (error) throw error;
                                }

                                if (updates.status === 'completed' && props.onEventComplete) {
                                    props.onEventComplete(selectedEvent.id);
                                }

                                setSelectedEvent(prev => {
                                    if (!prev || prev.id !== selectedEvent.id) return prev;
                                    return {
                                        ...prev,
                                        ...updates,
                                        start: updates.start ? { ...prev.start, ...updates.start } : prev.start,
                                        end: updates.end ? { ...prev.end, ...updates.end } : prev.end,
                                    } as CalendarEvent;
                                });
                            } catch (err) {
                                logger.error('Error updating event', err);
                                alert('Failed to update event');
                            }
                        }}
                        onDelete={async () => {
                            try {
                                if (props.onEventDelete) {
                                    await props.onEventDelete(selectedEvent.id);
                                } else {
                                    const { error } = await supabase
                                        .from('calendar_events')
                                        .delete()
                                        .eq('id', selectedEvent.id);
                                    if (error) throw error;
                                }
                                setSelectedEvent(null);
                            } catch (err) {
                                logger.error('Error deleting event', err);
                                alert('Failed to delete event');
                            }
                        }}
                        onToggleTask={async (taskId) => {
                            await handleChecklistTaskToggle(taskId);
                        }}
                        onToggleSubTask={async (subtaskId) => {
                            await handleChecklistSubTaskToggle(subtaskId);
                        }}
                    />
                )
            }
        </div >
    );
};

export default GoalDetailView;
