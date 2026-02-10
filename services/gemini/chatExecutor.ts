// =============================================================================
// Shared Chat Action Executor (Hybrid: edge plans, client executes)
// =============================================================================

import type { ChatAction, ActionResult } from './chatbotTypes';
import { isSupportedActionType } from './chatbotTypes';
import type { Goal, Phase, Milestone, Task, SubTask, UserProfile } from '../../types';
import type { CalendarEvent } from '../../constants/calendarTypes';
import { generateGoalRoadmap } from './chatbot';

export interface ChatExecutorHandlers {
  // Goals
  onAddGoal: (goalData: Partial<Goal> | Goal) => void | Promise<void>;
  onEditGoal: (goalId: string, updates: Partial<Goal>) => void | Promise<void>;
  onDeleteGoal: (goalId: string) => void | Promise<void>;

  // Phases
  onAddPhase: (goalId: string, phase: Partial<Phase>) => void | Promise<void>;
  onEditPhase: (phaseId: string, updates: Partial<Phase>) => void | Promise<void>;
  onDeletePhase: (phaseId: string) => void | Promise<void>;

  // Milestones
  onAddMilestone: (goalId: string, phaseId: string, milestone: Partial<Milestone>) => void | Promise<void>;
  onEditMilestone: (milestoneId: string, updates: Partial<Milestone>) => void | Promise<void>;
  onCompleteMilestone: (milestoneId: string, notes?: string) => void | Promise<void>;
  onDeleteMilestone: (milestoneId: string) => void | Promise<void>;

  // Tasks
  onAddTask: (milestoneId: string, task: Partial<Task>) => void | Promise<void>;
  onEditTask: (taskId: string, updates: Partial<Task>) => void | Promise<void>;
  onCompleteTask: (taskId: string) => void | Promise<void>;
  onDeleteTask: (taskId: string) => void | Promise<void>;

  // Subtasks
  onAddSubTask: (taskId: string, subtask: Partial<SubTask>) => void | Promise<void>;
  onEditSubTask: (subtaskId: string, updates: Partial<SubTask>) => void | Promise<void>;
  onCompleteSubTask: (subtaskId: string) => void | Promise<void>;
  onDeleteSubTask: (subtaskId: string, strikethrough?: boolean) => void | Promise<void>;

  // Notes
  onAddNote: (targetType: string, targetId: string, note: string) => void | Promise<void>;

  // Events
  onCreateEvent: (event: Partial<CalendarEvent>) => void | Promise<void>;
  onEditEvent: (eventId: string, updates: Partial<CalendarEvent>) => void | Promise<void>;
  onDeleteEvent: (eventId: string) => void | Promise<void>;

  // Scheduling
  onBuildSchedule: (goalId: string, options?: { startDate?: string }) => void | Promise<void>;
  onClearSchedule: (goalId: string) => void | Promise<void>;
}

export interface ChatExecutorContext {
  userProfile: UserProfile;
  goals: Goal[];
  calendarEvents: CalendarEvent[];
}

export function getConfirmationPrompt(action: ChatAction): string {
  switch (action.type) {
    case 'delete_goal':
      return 'Are you sure you want to delete this ambition? This cannot be undone.';
    case 'delete_phase':
      return 'Are you sure you want to delete this phase?';
    case 'delete_milestone':
      return 'Are you sure you want to delete this milestone?';
    case 'abandon_goal':
      return 'Are you sure you want to abandon this ambition? It will be moved to the archives.';
    case 'build_schedule':
      return 'Ready to build your schedule? This will create calendar events for your tasks.';
    case 'clear_schedule':
      return 'Clear the existing schedule for this ambition? This will delete all scheduled events.';
    case 'optimize_schedule':
      return 'Optimize your schedule based on your patterns and preferences?';
    case 'adjust_goal_timeline':
      return 'Adjusting the timeline will affect all phases. Proceed?';
    case 'create_goal':
      return 'I can generate a full roadmap for this ambition. Should I proceed?';
    default:
      return 'Are you sure you want to perform this action?';
  }
}

function findGoalIdByPhase(goals: Goal[], phaseId: string): string | undefined {
  for (const goal of goals) {
    if (goal.phases?.some(p => p.id === phaseId)) return goal.id;
  }
  return undefined;
}

function findTaskIdForMilestone(goals: Goal[], milestoneId: string): string | undefined {
  for (const goal of goals) {
    for (const phase of goal.phases || []) {
      for (const milestone of phase.milestones || []) {
        if (milestone.id !== milestoneId) continue;
        const tasks = (milestone as any).tasks as Task[] | undefined;
        if (!tasks || tasks.length === 0) return undefined;
        if (tasks.length === 1) return tasks[0].id;
        return undefined;
      }
    }
  }
  return undefined;
}

function buildEventFromActionData(data: any): Partial<CalendarEvent> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = data?.date && data?.startTime
    ? new Date(`${data.date}T${data.startTime}:00`)
    : new Date();
  const end = data?.endTime
    ? new Date(`${data.date}T${data.endTime}:00`)
    : new Date(start.getTime() + 60 * 60 * 1000);

  return {
    summary: data?.title || 'New Event',
    description: data?.description,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    goalId: data?.goalId,
    milestoneId: data?.milestoneId,
  };
}

export async function executeChatAction(
  action: ChatAction,
  context: ChatExecutorContext,
  handlers: ChatExecutorHandlers
): Promise<ActionResult> {
  try {
    if (!isSupportedActionType(action.type)) {
      return { success: false, message: `Action "${action.type}" is not supported.` };
    }
    switch (action.type) {
      case 'create_goal': {
        const data: any = action.data || {};
        const goal = await generateGoalRoadmap({
          goalTitle: data.title || 'New Ambition',
          category: data.category || 'personal',
          timeline: data.timeline || '3 months',
          frequency: data.frequency || 3,
          duration: data.duration || 60,
          preferredTime: data.preferredTime || 'flexible',
          energyCost: data.energyCost || 'medium',
          userProfile: context.userProfile,
          additionalContext: data.additionalContext,
        });

        if (!goal) {
          return { success: false, message: 'Failed to generate ambition roadmap.' };
        }
        await handlers.onAddGoal(goal);
        return {
          success: true,
          targetType: 'goal',
          targetId: goal.id,
          targetTitle: goal.title,
          createdEntity: goal,
          message: `Created ambition "${goal.title}"`,
        };
      }

      case 'update_goal': {
        const goalId = action.targetId || (action.data as any)?.goalId;
        if (!goalId) return { success: false, message: 'Missing goalId.' };
        await handlers.onEditGoal(goalId, action.data as any);
        return { success: true, targetType: 'goal', targetId: goalId };
      }

      case 'pause_goal':
      case 'resume_goal':
      case 'complete_goal':
      case 'abandon_goal': {
        const goalId = action.targetId || (action.data as any)?.goalId;
        if (!goalId) return { success: false, message: 'Missing goalId.' };
        const statusMap: Record<string, Goal['status']> = {
          pause_goal: 'paused',
          resume_goal: 'active',
          complete_goal: 'completed',
          abandon_goal: 'abandoned',
        };
        const updates: Partial<Goal> = { status: statusMap[action.type] };
        if (action.type === 'complete_goal') updates.overallProgress = 100;
        await handlers.onEditGoal(goalId, updates);
        return { success: true, targetType: 'goal', targetId: goalId };
      }

      case 'delete_goal': {
        const goalId = action.targetId || (action.data as any)?.goalId;
        if (!goalId) return { success: false, message: 'Missing goalId.' };
        await handlers.onDeleteGoal(goalId);
        return { success: true, targetType: 'goal', targetId: goalId };
      }

      case 'add_phase': {
        const goalId = (action.data as any)?.goalId;
        if (!goalId) return { success: false, message: 'Missing goalId.' };
        await handlers.onAddPhase(goalId, action.data as any);
        return { success: true, targetType: 'phase' };
      }

      case 'edit_phase':
      case 'delete_phase':
      case 'activate_phase':
      case 'complete_phase': {
        const phaseId = action.targetId || (action.data as any)?.phaseId;
        if (!phaseId) return { success: false, message: 'Missing phaseId.' };
        if (action.type === 'delete_phase') {
          await handlers.onDeletePhase(phaseId);
        } else if (action.type === 'activate_phase') {
          await handlers.onEditPhase(phaseId, { status: 'active' });
        } else if (action.type === 'complete_phase') {
          await handlers.onEditPhase(phaseId, { status: 'completed', progress: 100 });
        } else {
          await handlers.onEditPhase(phaseId, action.data as any);
        }
        return { success: true, targetType: 'phase', targetId: phaseId };
      }

      case 'add_milestone': {
        const phaseId = (action.data as any)?.phaseId;
        if (!phaseId) return { success: false, message: 'Missing phaseId.' };
        const goalId = (action.data as any)?.goalId || findGoalIdByPhase(context.goals, phaseId);
        if (!goalId) return { success: false, message: 'Unable to resolve goalId for phase.' };
        await handlers.onAddMilestone(goalId, phaseId, action.data as any);
        return { success: true, targetType: 'milestone' };
      }

      case 'edit_milestone':
      case 'delete_milestone': {
        const milestoneId = action.targetId || (action.data as any)?.milestoneId;
        if (!milestoneId) return { success: false, message: 'Missing milestoneId.' };
        if (action.type === 'delete_milestone') {
          await handlers.onDeleteMilestone(milestoneId);
        } else {
          await handlers.onEditMilestone(milestoneId, action.data as any);
        }
        return { success: true, targetType: 'milestone', targetId: milestoneId };
      }

      case 'complete_milestone': {
        const milestoneId = action.targetId || (action.data as any)?.milestoneId;
        if (!milestoneId) return { success: false, message: 'Missing milestoneId.' };
        await handlers.onCompleteMilestone(milestoneId, (action.data as any)?.notes);
        return { success: true, targetType: 'milestone', targetId: milestoneId };
      }
      case 'uncomplete_milestone': {
        const milestoneId = action.targetId || (action.data as any)?.milestoneId;
        if (!milestoneId) return { success: false, message: 'Missing milestoneId.' };
        await handlers.onCompleteMilestone(milestoneId);
        return { success: true, targetType: 'milestone', targetId: milestoneId };
      }

      case 'add_task': {
        const milestoneId = (action.data as any)?.milestoneId;
        if (!milestoneId) return { success: false, message: 'Missing milestoneId.' };
        await handlers.onAddTask(milestoneId, action.data as any);
        return { success: true, targetType: 'task' };
      }

      case 'edit_task':
      case 'delete_task':
      case 'complete_task': {
        const taskId = action.targetId || (action.data as any)?.taskId;
        if (!taskId) return { success: false, message: 'Missing taskId.' };
        if (action.type === 'delete_task') {
          await handlers.onDeleteTask(taskId);
        } else if (action.type === 'complete_task') {
          await handlers.onCompleteTask(taskId);
        } else {
          await handlers.onEditTask(taskId, action.data as any);
        }
        return { success: true, targetType: 'task', targetId: taskId };
      }

      case 'add_subtask': {
        const data: any = action.data || {};
        const taskId = data.taskId || findTaskIdForMilestone(context.goals, data.milestoneId);
        if (!taskId) {
          return { success: false, message: 'Missing taskId. Please specify which task this subtask belongs to.' };
        }
        await handlers.onAddSubTask(taskId, data as any);
        return { success: true, targetType: 'subtask' };
      }

      case 'add_subtasks_bulk': {
        const data: any = action.data || {};
        const taskId = data.taskId || findTaskIdForMilestone(context.goals, data.milestoneId);
        if (!taskId) {
          return { success: false, message: 'Missing taskId. Please specify which task these subtasks belong to.' };
        }
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        for (const task of tasks) {
          await handlers.onAddSubTask(taskId, task);
        }
        return { success: true, targetType: 'subtask' };
      }

      case 'edit_subtask':
      case 'delete_subtask': {
        const subtaskId = action.targetId || (action.data as any)?.subtaskId;
        if (!subtaskId) return { success: false, message: 'Missing subtaskId.' };
        if (action.type === 'delete_subtask') {
          await handlers.onDeleteSubTask(subtaskId);
        } else {
          await handlers.onEditSubTask(subtaskId, action.data as any);
        }
        return { success: true, targetType: 'subtask', targetId: subtaskId };
      }

      case 'complete_subtask': {
        const subtaskId = action.targetId || (action.data as any)?.subtaskId;
        if (!subtaskId) return { success: false, message: 'Missing subtaskId.' };
        await handlers.onCompleteSubTask(subtaskId);
        return { success: true, targetType: 'subtask', targetId: subtaskId };
      }
      case 'uncomplete_subtask': {
        const subtaskId = action.targetId || (action.data as any)?.subtaskId;
        if (!subtaskId) return { success: false, message: 'Missing subtaskId.' };
        await handlers.onCompleteSubTask(subtaskId);
        return { success: true, targetType: 'subtask', targetId: subtaskId };
      }

      case 'add_note': {
        const data: any = action.data || {};
        const targetId = action.targetId || data?.targetId;
        if (!targetId || !data?.note) {
          return { success: false, message: 'Missing note target or content.' };
        }
        await handlers.onAddNote(data.targetType || 'goal', targetId, data.note);
        return { success: true };
      }

      case 'create_event': {
        await handlers.onCreateEvent(buildEventFromActionData(action.data));
        return { success: true, targetType: 'event' };
      }

      case 'edit_event': {
        const eventId = action.targetId || (action.data as any)?.eventId;
        if (!eventId) return { success: false, message: 'Missing eventId.' };
        const updates: Partial<CalendarEvent> = {};
        if ((action.data as any)?.title) updates.summary = (action.data as any).title;
        if ((action.data as any)?.description) updates.description = (action.data as any).description;
        if ((action.data as any)?.date && (action.data as any)?.startTime) {
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const start = new Date(`${(action.data as any).date}T${(action.data as any).startTime}:00`);
          updates.start = { dateTime: start.toISOString(), timeZone };
        }
        if ((action.data as any)?.date && (action.data as any)?.endTime) {
          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const end = new Date(`${(action.data as any).date}T${(action.data as any).endTime}:00`);
          updates.end = { dateTime: end.toISOString(), timeZone };
        }
        await handlers.onEditEvent(eventId, updates);
        return { success: true, targetType: 'event', targetId: eventId };
      }

      case 'delete_event': {
        const eventId = action.targetId || (action.data as any)?.eventId;
        if (!eventId) return { success: false, message: 'Missing eventId.' };
        await handlers.onDeleteEvent(eventId);
        return { success: true, targetType: 'event', targetId: eventId };
      }

      case 'reschedule_event': {
        const eventId = action.targetId || (action.data as any)?.eventId;
        const newDate = (action.data as any)?.newDate;
        const newStartTime = (action.data as any)?.newStartTime;
        if (!eventId || !newDate || !newStartTime) {
          return { success: false, message: 'Missing eventId or new schedule.' };
        }
        const targetEvent = context.calendarEvents.find(e => e.id === eventId);
        if (!targetEvent) return { success: false, message: 'Event not found.' };

        const start = new Date((targetEvent.start as any)?.dateTime || (targetEvent.start as any)?.date || '');
        const end = new Date((targetEvent.end as any)?.dateTime || (targetEvent.end as any)?.date || '');
        const durationMs = Math.max(15 * 60 * 1000, end.getTime() - start.getTime());

        const newStart = new Date(`${newDate}T${newStartTime}:00`);
        if (Number.isNaN(newStart.getTime())) return { success: false, message: 'Invalid new start time.' };
        const newEnd = new Date(newStart.getTime() + durationMs);
        const timeZone = (targetEvent.start as any)?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        await handlers.onEditEvent(eventId, {
          start: { dateTime: newStart.toISOString(), timeZone },
          end: { dateTime: newEnd.toISOString(), timeZone },
          status: 'rescheduled',
          rescheduleCount: (targetEvent.rescheduleCount || 0) + 1,
          originalStartDatetime: targetEvent.originalStartDatetime || (targetEvent.start as any)?.dateTime,
        });

        return { success: true, targetType: 'event', targetId: eventId };
      }

      case 'skip_event': {
        const eventId = action.targetId || (action.data as any)?.eventId;
        if (!eventId) return { success: false, message: 'Missing eventId.' };
        await handlers.onEditEvent(eventId, {
          status: 'skipped',
          skippedReason: (action.data as any)?.reason,
        });
        return { success: true, targetType: 'event', targetId: eventId };
      }

      case 'complete_event': {
        const eventId = action.targetId || (action.data as any)?.eventId;
        if (!eventId) return { success: false, message: 'Missing eventId.' };
        await handlers.onEditEvent(eventId, {
          status: 'completed',
          completedAt: new Date().toISOString(),
        });
        return { success: true, targetType: 'event', targetId: eventId };
      }

      case 'build_schedule': {
        const goalId = action.targetId || (action.data as any)?.goalId;
        if (!goalId) return { success: false, message: 'Missing goalId.' };
        await handlers.onBuildSchedule(goalId, { startDate: (action.data as any)?.startDate });
        return { success: true, targetType: 'goal', targetId: goalId };
      }

      case 'clear_schedule': {
        const goalId = action.targetId || (action.data as any)?.goalId;
        if (!goalId) return { success: false, message: 'Missing goalId.' };
        await handlers.onClearSchedule(goalId);
        return { success: true, targetType: 'goal', targetId: goalId };
      }

      // Coaching actions are informational; AI handles content
      case 'get_recommendations':
      case 'get_daily_focus':
      case 'get_weekly_summary':
      case 'explain_roadmap':
      case 'compare_progress':
      case 'celebrate_achievement':
      case 'get_goal_progress':
      case 'optimize_schedule':
      case 'adjust_goal_timeline':
        return { success: true, message: 'Coaching response handled in AI message.' };

      default:
        return { success: false, message: `Unhandled action type: ${action.type}` };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || 'Action execution failed.' };
  }
}
