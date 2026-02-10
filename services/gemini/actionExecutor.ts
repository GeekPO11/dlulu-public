// =============================================================================
// CHATBOT ACTION EXECUTOR
// Executes actions from the chatbot by calling the actual Supabase CRUD functions
// =============================================================================

import type {
    ChatAction,
    ChatActionType,
    ActionHandlers,
    ActionResult,
    CreateGoalData,
    UpdateGoalData,
    AddPhaseData,
    EditPhaseData,
    AddMilestoneData,
    EditMilestoneData,
    CompleteMilestoneData,
    AddTaskData,
    EditTaskData,
    CompleteTaskData,
    DeleteTaskData,
    AddSubtaskData,
    CompleteSubtaskData,
    CreateEventData,
    EditEventData,
    DeleteEventData,
    RescheduleEventData,
} from './chatbotTypes';
import { requiresConfirmation } from './chatbotTypes';
import type { Goal, Phase, Milestone, Task, SubTask } from '../../types';
import type { CalendarEvent } from '../../constants/calendarTypes';
import { generateGoalRoadmap } from './chatbot';
import { logger } from '../../lib/logger';

// =============================================================================
// ACTION EXECUTOR CLASS
// =============================================================================

export class ChatbotActionExecutor {
    private handlers: ActionHandlers;
    private userId: string;
    private userProfile: { name?: string; chronotype?: string; role?: string };
    private goals: Goal[];

    constructor(
        handlers: ActionHandlers,
        userId: string,
        userProfile: { name?: string; chronotype?: string; role?: string },
        goals: Goal[]
    ) {
        this.handlers = handlers;
        this.userId = userId;
        this.userProfile = userProfile;
        this.goals = goals;
    }

    // Update goals reference (for resolving IDs)
    updateGoals(goals: Goal[]) {
        this.goals = goals;
    }

    // =============================================================================
    // MAIN EXECUTE FUNCTION
    // =============================================================================

    async execute(action: ChatAction): Promise<ActionResult> {
        // Executing action

        // Check if confirmation is required but not yet given
        if (requiresConfirmation(action.type) && action.status !== 'pending_confirmation') {
            return {
                success: false,
                message: 'This action requires confirmation before execution.',
            };
        }

        try {
            switch (action.type) {
                // ----- Goal Actions -----
                case 'create_goal':
                    return await this.executeCreateGoal(action.data as CreateGoalData);
                case 'update_goal':
                    return await this.executeUpdateGoal(action.data as UpdateGoalData);
                case 'pause_goal':
                    return await this.executePauseGoal(action.data as { goalId: string });
                case 'resume_goal':
                    return await this.executeResumeGoal(action.data as { goalId: string });
                case 'complete_goal':
                    return await this.executeCompleteGoal(action.data as { goalId: string });
                case 'delete_goal':
                    return await this.executeDeleteGoal(action.data as { goalId: string });
                case 'abandon_goal':
                    return await this.executeAbandonGoal(action.data as { goalId: string; reason?: string });

                // ----- Phase Actions -----
                case 'add_phase':
                    return await this.executeAddPhase(action.data as AddPhaseData);
                case 'edit_phase':
                    return await this.executeEditPhase(action.data as EditPhaseData);
                case 'delete_phase':
                    return await this.executeDeletePhase(action.data as { phaseId: string });
                case 'activate_phase':
                    return await this.executeActivatePhase(action.data as { phaseId: string });
                case 'complete_phase':
                    return await this.executeCompletePhase(action.data as { phaseId: string });

                // ----- Milestone Actions -----
                case 'add_milestone':
                    return await this.executeAddMilestone(action.data as AddMilestoneData);
                case 'edit_milestone':
                    return await this.executeEditMilestone(action.data as EditMilestoneData);
                case 'complete_milestone':
                    return await this.executeCompleteMilestone(action.data as CompleteMilestoneData);
                case 'uncomplete_milestone':
                    return await this.executeUncompleteMilestone(action.data as { milestoneId: string });
                case 'delete_milestone':
                    return await this.executeDeleteMilestone(action.data as { milestoneId: string });

                // ----- Task Actions -----
                case 'add_task':
                    return await this.executeAddTask(action.data as AddTaskData);
                case 'edit_task':
                    return await this.executeEditTask(action.data as EditTaskData);
                case 'complete_task':
                    return await this.executeCompleteTask(action.data as CompleteTaskData);
                case 'delete_task':
                    return await this.executeDeleteTask(action.data as DeleteTaskData);

                // ----- Subtask Actions -----
                case 'add_subtask':
                    return await this.executeAddSubtask(action.data as AddSubtaskData);
                case 'add_subtasks_bulk':
                    return await this.executeAddSubtasksBulk(action.data as any);
                case 'complete_subtask':
                    return await this.executeCompleteSubtask(action.data as CompleteSubtaskData);
                case 'uncomplete_subtask':
                    return await this.executeUncompleteSubtask(action.data as { subtaskId: string });
                case 'delete_subtask':
                    return await this.executeDeleteSubtask(action.data as { subtaskId: string });

                // ----- Calendar Actions -----
                case 'create_event':
                    return await this.executeCreateEvent(action.data as CreateEventData);
                case 'edit_event':
                    return await this.executeEditEvent(action.data as EditEventData);
                case 'delete_event':
                    return await this.executeDeleteEvent(action.data as DeleteEventData);
                case 'reschedule_event':
                    return await this.executeRescheduleEvent(action.data as RescheduleEventData);

                // ----- Coaching Actions (Read-only, handled by Edge Function) -----
                case 'get_goal_progress':
                case 'get_daily_focus':
                case 'get_weekly_summary':
                case 'get_recommendations':
                case 'explain_roadmap':
                case 'compare_progress':
                case 'celebrate_achievement':
                    return { success: true, message: 'Coaching response provided in chat message.' };

                default:
                    logger.warn('[ActionExecutor] Unknown action type', { actionType: action.type });
                    return { success: false, message: `Unknown action type: ${action.type}` };
            }
        } catch (error: any) {
            logger.error('[ActionExecutor] Error executing action', error);
            return { success: false, message: error.message || 'Action execution failed' };
        }
    }

    // =============================================================================
    // GOAL ACTIONS
    // =============================================================================

    private async executeCreateGoal(data: CreateGoalData): Promise<ActionResult> {
        // Creating goal

        // Use the roadmap generator to create a complete goal
        const goal = await generateGoalRoadmap({
            goalTitle: data.title,
            category: data.category,
            timeline: data.timeline,
            frequency: data.frequency || 3,
            duration: data.duration || 60,
            preferredTime: data.preferredTime || 'flexible',
            energyCost: data.energyCost || 'medium',
            userProfile: this.userProfile,
            additionalContext: data.additionalContext,
        });

        if (!goal) {
            return { success: false, message: 'Failed to generate ambition roadmap' };
        }

        if (data.priorityWeight !== undefined) {
            goal.priorityWeight = data.priorityWeight;
        }

        // Save to database
        const savedGoal = await this.handlers.createGoal(goal);
        if (!savedGoal) {
            return { success: false, message: 'Failed to save ambition to database' };
        }

        // Create phases, milestones, subtasks
        for (const phase of goal.phases) {
            const savedPhase = await this.handlers.createPhase(savedGoal.id, phase);
            if (savedPhase) {
                for (const milestone of phase.milestones) {
                    const savedMilestone = await this.handlers.createMilestone(
                        savedPhase.id,
                        savedGoal.id,
                        milestone
                    );
                    if (savedMilestone) {
                        const taskList = (milestone as any).tasks as Task[] | undefined;
                        if (taskList && taskList.length > 0) {
                            for (const task of taskList) {
                                const savedTask = await this.handlers.createTask(savedMilestone.id, {
                                    title: task.title,
                                    description: task.description,
                                    order: task.order,
                                    startDay: task.startDay,
                                    endDay: task.endDay,
                                    durationDays: task.durationDays,
                                    timesPerWeek: task.timesPerWeek,
                                });
                                if (savedTask) {
                                    for (const subtask of task.subTasks || []) {
                                        await this.handlers.createSubTask(savedTask.id, subtask.title);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Refresh to get complete data
        await this.handlers.refreshGoals();

        return {
            success: true,
            targetType: 'goal',
            targetId: savedGoal.id,
            targetTitle: savedGoal.title,
            createdEntity: savedGoal,
            message: `Created ambition "${savedGoal.title}" with ${goal.phases.length} phases`,
        };
    }

    private async executeUpdateGoal(data: UpdateGoalData): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Ambition not found: ${data.goalId}` };
        }

        await this.handlers.updateGoal(data.goalId, {
            title: data.title,
            status: data.status,
            frequency: data.frequency,
            duration: data.duration,
            preferredTime: data.preferredTime,
            energyCost: data.energyCost,
            priorityWeight: data.priorityWeight,
            behaviorPlan: data.behaviorPlan,
            riskLevel: data.riskLevel,
            riskAcknowledgedAt: data.riskAcknowledgedAt ? new Date(data.riskAcknowledgedAt) : undefined,
        });

        return {
            success: true,
            targetType: 'goal',
            targetId: data.goalId,
            targetTitle: goal.title,
            message: `Updated ambition "${goal.title}"`,
        };
    }

    private async executePauseGoal(data: { goalId: string }): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Ambition not found: ${data.goalId}` };
        }

        await this.handlers.updateGoal(data.goalId, { status: 'paused' });
        return {
            success: true,
            targetType: 'goal',
            targetId: data.goalId,
            targetTitle: goal.title,
            message: `Paused ambition "${goal.title}"`,
        };
    }

    private async executeResumeGoal(data: { goalId: string }): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Ambition not found: ${data.goalId}` };
        }

        await this.handlers.updateGoal(data.goalId, { status: 'active' });
        return {
            success: true,
            targetType: 'goal',
            targetId: data.goalId,
            targetTitle: goal.title,
            message: `Resumed ambition "${goal.title}"`,
        };
    }

    private async executeCompleteGoal(data: { goalId: string }): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Ambition not found: ${data.goalId}` };
        }

        await this.handlers.updateGoal(data.goalId, { status: 'completed', overallProgress: 100 });
        return {
            success: true,
            targetType: 'goal',
            targetId: data.goalId,
            targetTitle: goal.title,
            message: `🎉 Congratulations! Completed ambition "${goal.title}"`,
        };
    }

    private async executeDeleteGoal(data: { goalId: string }): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Ambition not found: ${data.goalId}` };
        }

        await this.handlers.deleteGoal(data.goalId);
        await this.handlers.refreshGoals();

        return {
            success: true,
            targetType: 'goal',
            targetId: data.goalId,
            targetTitle: goal.title,
            message: `Deleted ambition "${goal.title}"`,
        };
    }

    private async executeAbandonGoal(data: { goalId: string; reason?: string }): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Ambition not found: ${data.goalId}` };
        }

        await this.handlers.updateGoal(data.goalId, { status: 'abandoned' });
        return {
            success: true,
            targetType: 'goal',
            targetId: data.goalId,
            targetTitle: goal.title,
            message: `Abandoned ambition "${goal.title}"`,
        };
    }

    // =============================================================================
    // PHASE ACTIONS
    // =============================================================================

    private async executeAddPhase(data: AddPhaseData): Promise<ActionResult> {
        const goal = this.findGoal(data.goalId);
        if (!goal) {
            return { success: false, message: `Goal not found: ${data.goalId}` };
        }

        const phase = await this.handlers.createPhase(data.goalId, {
            title: data.title,
            description: data.description,
            focus: data.focus,
            number: goal.phases.length + 1,
            startWeek: 1,
            endWeek: data.estimatedWeeks || 4,
            estimatedDuration: `${data.estimatedWeeks || 4} weeks`,
        });

        if (!phase) {
            return { success: false, message: 'Failed to create phase' };
        }

        await this.handlers.refreshGoals();
        return {
            success: true,
            targetType: 'phase',
            targetId: phase.id,
            targetTitle: data.title,
            message: `Added phase "${data.title}" to "${goal.title}"`,
        };
    }

    private async executeEditPhase(data: EditPhaseData): Promise<ActionResult> {
        const { phase, goal } = this.findPhase(data.phaseId);
        if (!phase) {
            return { success: false, message: `Phase not found: ${data.phaseId}` };
        }

        await this.handlers.updatePhase(data.phaseId, {
            title: data.title,
            description: data.description,
            focus: data.focus,
        });

        return {
            success: true,
            targetType: 'phase',
            targetId: data.phaseId,
            targetTitle: phase.title,
            message: `Updated phase "${phase.title}"`,
        };
    }

    private async executeDeletePhase(data: { phaseId: string }): Promise<ActionResult> {
        const { phase, goal } = this.findPhase(data.phaseId);
        if (!phase) {
            return { success: false, message: `Phase not found: ${data.phaseId}` };
        }

        await this.handlers.deletePhase(data.phaseId);
        await this.handlers.refreshGoals();

        return {
            success: true,
            targetType: 'phase',
            targetId: data.phaseId,
            targetTitle: phase.title,
            message: `Deleted phase "${phase.title}"`,
        };
    }

    private async executeActivatePhase(data: { phaseId: string }): Promise<ActionResult> {
        const { phase, goal } = this.findPhase(data.phaseId);
        if (!phase || !goal) {
            return { success: false, message: `Phase not found: ${data.phaseId}` };
        }

        await this.handlers.updatePhase(data.phaseId, { status: 'active' });
        return {
            success: true,
            targetType: 'phase',
            targetId: data.phaseId,
            targetTitle: phase.title,
            message: `Activated phase "${phase.title}"`,
        };
    }

    private async executeCompletePhase(data: { phaseId: string }): Promise<ActionResult> {
        const { phase, goal } = this.findPhase(data.phaseId);
        if (!phase || !goal) {
            return { success: false, message: `Phase not found: ${data.phaseId}` };
        }

        await this.handlers.updatePhase(data.phaseId, { status: 'completed', progress: 100 });
        return {
            success: true,
            targetType: 'phase',
            targetId: data.phaseId,
            targetTitle: phase.title,
            message: `🎉 Completed phase "${phase.title}"`,
        };
    }

    // =============================================================================
    // MILESTONE ACTIONS
    // =============================================================================

    private async executeAddMilestone(data: AddMilestoneData): Promise<ActionResult> {
        const { phase, goal } = this.findPhase(data.phaseId);
        if (!phase || !goal) {
            return { success: false, message: `Phase not found: ${data.phaseId}` };
        }

        const milestone = await this.handlers.createMilestone(data.phaseId, goal.id, {
            title: data.title,
            description: data.description,
            targetWeek: data.targetWeek,
            order: phase.milestones.length + 1,
        });

        if (!milestone) {
            return { success: false, message: 'Failed to create milestone' };
        }

        await this.handlers.refreshGoals();
        return {
            success: true,
            targetType: 'milestone',
            targetId: milestone.id,
            targetTitle: data.title,
            message: `Added milestone "${data.title}" to phase "${phase.title}"`,
        };
    }

    private async executeEditMilestone(data: EditMilestoneData): Promise<ActionResult> {
        const { milestone } = this.findMilestone(data.milestoneId);
        if (!milestone) {
            return { success: false, message: `Milestone not found: ${data.milestoneId}` };
        }

        await this.handlers.updateMilestone(data.milestoneId, {
            title: data.title,
            description: data.description,
            targetWeek: data.targetWeek,
        });

        return {
            success: true,
            targetType: 'milestone',
            targetId: data.milestoneId,
            targetTitle: milestone.title,
            message: `Updated milestone "${milestone.title}"`,
        };
    }

    private async executeCompleteMilestone(data: CompleteMilestoneData): Promise<ActionResult> {
        const { milestone, phase, goal } = this.findMilestone(data.milestoneId);
        if (!milestone) {
            return { success: false, message: `Milestone not found: ${data.milestoneId}` };
        }

        await this.handlers.toggleMilestone(data.milestoneId);
        await this.handlers.refreshGoals();

        return {
            success: true,
            targetType: 'milestone',
            targetId: data.milestoneId,
            targetTitle: milestone.title,
            message: `✅ Completed milestone "${milestone.title}"`,
        };
    }

    private async executeUncompleteMilestone(data: { milestoneId: string }): Promise<ActionResult> {
        const { milestone } = this.findMilestone(data.milestoneId);
        if (!milestone) {
            return { success: false, message: `Milestone not found: ${data.milestoneId}` };
        }

        await this.handlers.toggleMilestone(data.milestoneId);
        return {
            success: true,
            targetType: 'milestone',
            targetId: data.milestoneId,
            targetTitle: milestone.title,
            message: `Reopened milestone "${milestone.title}"`,
        };
    }

    private async executeDeleteMilestone(data: { milestoneId: string }): Promise<ActionResult> {
        const { milestone } = this.findMilestone(data.milestoneId);
        if (!milestone) {
            return { success: false, message: `Milestone not found: ${data.milestoneId}` };
        }

        await this.handlers.deleteMilestone(data.milestoneId);
        await this.handlers.refreshGoals();

        return {
            success: true,
            targetType: 'milestone',
            targetId: data.milestoneId,
            targetTitle: milestone.title,
            message: `Deleted milestone "${milestone.title}"`,
        };
    }

    // =============================================================================
    // TASK ACTIONS
    // =============================================================================

    private async executeAddTask(data: AddTaskData): Promise<ActionResult> {
        const { milestone } = this.findMilestone(data.milestoneId);
        if (!milestone) {
            return { success: false, message: `Milestone not found: ${data.milestoneId}` };
        }

        const task = await this.handlers.createTask(data.milestoneId, {
            title: data.title,
            description: data.description,
            order: data.order,
            startDay: data.startDay,
            endDay: data.endDay,
            durationDays: data.durationDays,
            timesPerWeek: data.timesPerWeek,
        });

        if (!task) {
            return { success: false, message: 'Failed to create task' };
        }

        await this.handlers.refreshGoals();
        return {
            success: true,
            targetType: 'task',
            targetId: task.id,
            targetTitle: data.title,
            message: `Added task "${data.title}"`,
        };
    }

    private async executeEditTask(data: EditTaskData): Promise<ActionResult> {
        const task = this.findTask(data.taskId);
        if (!task) {
            return { success: false, message: `Task not found: ${data.taskId}` };
        }

        await this.handlers.updateTask(data.taskId, {
            title: data.title,
            description: data.description,
            order: data.order,
            startDay: data.startDay,
            endDay: data.endDay,
            durationDays: data.durationDays,
            timesPerWeek: data.timesPerWeek,
        });

        return {
            success: true,
            targetType: 'task',
            targetId: data.taskId,
            targetTitle: task.title,
            message: `Updated task "${task.title}"`,
        };
    }

    private async executeCompleteTask(data: CompleteTaskData): Promise<ActionResult> {
        const task = this.findTask(data.taskId);
        if (!task) {
            return { success: false, message: `Task not found: ${data.taskId}` };
        }

        await this.handlers.toggleTask(data.taskId);
        return {
            success: true,
            targetType: 'task',
            targetId: data.taskId,
            targetTitle: task.title,
            message: `Completed task "${task.title}"`,
        };
    }

    private async executeDeleteTask(data: DeleteTaskData): Promise<ActionResult> {
        const task = this.findTask(data.taskId);
        if (!task) {
            return { success: false, message: `Task not found: ${data.taskId}` };
        }

        await this.handlers.deleteTask(data.taskId);
        await this.handlers.refreshGoals();
        return {
            success: true,
            targetType: 'task',
            targetId: data.taskId,
            targetTitle: task.title,
            message: `Deleted task "${task.title}"`,
        };
    }

    // =============================================================================
    // SUBTASK ACTIONS
    // =============================================================================

    private async executeAddSubtask(data: AddSubtaskData): Promise<ActionResult> {
        const taskId = data.taskId || (data.milestoneId ? this.findSingleTaskIdForMilestone(data.milestoneId) : undefined);
        if (!taskId) {
            return { success: false, message: 'Missing taskId for subtask creation.' };
        }

        const subtask = await this.handlers.createSubTask(taskId, data.title);
        if (!subtask) {
            return { success: false, message: 'Failed to create subtask' };
        }

        await this.handlers.refreshGoals();
        return {
            success: true,
            targetType: 'subtask',
            targetId: subtask.id,
            targetTitle: data.title,
            message: `Added subtask "${data.title}"`,
        };
    }

    private async executeAddSubtasksBulk(data: { taskId?: string; milestoneId?: string; tasks: { title: string; description?: string }[] }): Promise<ActionResult> {
        const taskId = data.taskId || (data.milestoneId ? this.findSingleTaskIdForMilestone(data.milestoneId) : undefined);
        if (!taskId) {
            return { success: false, message: 'Missing taskId for bulk subtask creation.' };
        }

        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        for (const task of tasks) {
            await this.handlers.createSubTask(taskId, task.title);
        }

        await this.handlers.refreshGoals();
        return {
            success: true,
            targetType: 'subtask',
            targetId: taskId,
            message: `Added ${tasks.length} subtasks`,
        };
    }

    private async executeCompleteSubtask(data: CompleteSubtaskData): Promise<ActionResult> {
        const { subtask, milestone } = this.findSubtask(data.subtaskId);
        if (!subtask) {
            return { success: false, message: `Subtask not found: ${data.subtaskId}` };
        }

        await this.handlers.toggleSubTask(data.subtaskId);
        return {
            success: true,
            targetType: 'subtask',
            targetId: data.subtaskId,
            targetTitle: subtask.title,
            message: `✅ Completed task "${subtask.title}"`,
        };
    }

    private async executeUncompleteSubtask(data: { subtaskId: string }): Promise<ActionResult> {
        const { subtask } = this.findSubtask(data.subtaskId);
        if (!subtask) {
            return { success: false, message: `Subtask not found: ${data.subtaskId}` };
        }

        await this.handlers.toggleSubTask(data.subtaskId);
        return {
            success: true,
            targetType: 'subtask',
            targetId: data.subtaskId,
            targetTitle: subtask.title,
            message: `Reopened task "${subtask.title}"`,
        };
    }

    private async executeDeleteSubtask(data: { subtaskId: string }): Promise<ActionResult> {
        const { subtask } = this.findSubtask(data.subtaskId);
        if (!subtask) {
            return { success: false, message: `Subtask not found: ${data.subtaskId}` };
        }

        await this.handlers.deleteSubTask(data.subtaskId);
        await this.handlers.refreshGoals();

        return {
            success: true,
            targetType: 'subtask',
            targetId: data.subtaskId,
            targetTitle: subtask.title,
            message: `Deleted task "${subtask.title}"`,
        };
    }

    // =============================================================================
    // CALENDAR ACTIONS
    // =============================================================================

    private async executeCreateEvent(data: CreateEventData): Promise<ActionResult> {
        const startDateTime = new Date(`${data.date}T${data.startTime}`);
        const endDateTime = data.endTime
            ? new Date(`${data.date}T${data.endTime}`)
            : new Date(startDateTime.getTime() + 60 * 60 * 1000); // Default 1 hour

        const event = await this.handlers.createEvent({
            summary: data.title,
            description: data.description,
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
            goalId: data.goalId,
            milestoneId: data.milestoneId,
        });

        if (!event) {
            return { success: false, message: 'Failed to create event' };
        }

        await this.handlers.refreshEvents();
        return {
            success: true,
            targetType: 'event',
            targetId: event.id,
            targetTitle: data.title,
            message: `Created event "${data.title}" on ${data.date} at ${data.startTime}`,
        };
    }

    private async executeEditEvent(data: EditEventData): Promise<ActionResult> {
        const updates: Partial<CalendarEvent> = {};
        if (data.title) updates.summary = data.title;
        if (data.description) updates.description = data.description;
        if (data.date && data.startTime) {
            updates.start = { dateTime: new Date(`${data.date}T${data.startTime}`) };
        }
        if (data.date && data.endTime) {
            updates.end = { dateTime: new Date(`${data.date}T${data.endTime}`) };
        }

        await this.handlers.updateEvent(data.eventId, updates);
        return {
            success: true,
            targetType: 'event',
            targetId: data.eventId,
            message: `Updated event`,
        };
    }

    private async executeDeleteEvent(data: DeleteEventData): Promise<ActionResult> {
        await this.handlers.deleteEvent(data.eventId);
        await this.handlers.refreshEvents();

        return {
            success: true,
            targetType: 'event',
            targetId: data.eventId,
            message: 'Deleted event',
        };
    }

    private async executeRescheduleEvent(data: RescheduleEventData): Promise<ActionResult> {
        const newStartDateTime = new Date(`${data.newDate}T${data.newStartTime}`);
        // Assume 1 hour duration if not specified
        const newEndDateTime = new Date(newStartDateTime.getTime() + 60 * 60 * 1000);

        await this.handlers.updateEvent(data.eventId, {
            start: { dateTime: newStartDateTime },
            end: { dateTime: newEndDateTime },
        });

        await this.handlers.refreshEvents();
        return {
            success: true,
            targetType: 'event',
            targetId: data.eventId,
            message: `Rescheduled event to ${data.newDate} at ${data.newStartTime}`,
        };
    }

    // =============================================================================
    // LOOKUP HELPERS
    // =============================================================================

    private findGoal(goalId: string): Goal | undefined {
        return this.goals.find(g => g.id === goalId);
    }

    private findPhase(phaseId: string): { phase?: Phase; goal?: Goal } {
        for (const goal of this.goals) {
            const phase = goal.phases.find(p => p.id === phaseId);
            if (phase) return { phase, goal };
        }
        return {};
    }

    private findMilestone(milestoneId: string): { milestone?: Milestone; phase?: Phase; goal?: Goal } {
        for (const goal of this.goals) {
            for (const phase of goal.phases) {
                const milestone = phase.milestones.find(m => m.id === milestoneId);
                if (milestone) return { milestone, phase, goal };
            }
        }
        return {};
    }

    private findTask(taskId: string): Task | undefined {
        for (const goal of this.goals) {
            for (const phase of goal.phases) {
                for (const milestone of phase.milestones) {
                    const task = (milestone as any).tasks?.find((t: Task) => t.id === taskId);
                    if (task) return task;
                }
            }
        }
        return undefined;
    }

    private findSingleTaskIdForMilestone(milestoneId: string): string | undefined {
        const { milestone } = this.findMilestone(milestoneId);
        const tasks = (milestone as any)?.tasks as Task[] | undefined;
        if (!tasks || tasks.length !== 1) return undefined;
        return tasks[0].id;
    }

    private findSubtask(subtaskId: string): { subtask?: SubTask; milestone?: Milestone; phase?: Phase; goal?: Goal } {
        for (const goal of this.goals) {
            for (const phase of goal.phases) {
                for (const milestone of phase.milestones) {
                    // Search tasks first (new hierarchy)
                    const tasks = (milestone as any).tasks as Task[] | undefined;
                    if (tasks) {
                        for (const task of tasks) {
                            const subtask = task.subTasks?.find(s => s.id === subtaskId);
                            if (subtask) return { subtask, milestone, phase, goal };
                        }
                    }
                }
            }
        }
        return {};
    }
}

// =============================================================================
// EXECUTE MULTIPLE ACTIONS
// =============================================================================

export async function executeActions(
    actions: ChatAction[],
    handlers: ActionHandlers,
    userId: string,
    userProfile: { name?: string; chronotype?: string; role?: string },
    goals: Goal[]
): Promise<ActionResult[]> {
    const executor = new ChatbotActionExecutor(handlers, userId, userProfile, goals);
    const results: ActionResult[] = [];

    for (const action of actions) {
        // Skip actions that require confirmation but haven't been confirmed
        if (requiresConfirmation(action.type) && action.status === 'pending_confirmation') {
            // Skipping unconfirmed action
            results.push({
                success: false,
                message: 'Awaiting user confirmation',
            });
            continue;
        }

        const result = await executor.execute(action);
        results.push(result);

        // Update goals after each successful create/delete for subsequent lookups
        if (result.success && (action.type.includes('create') || action.type.includes('delete'))) {
            await handlers.refreshGoals();
            // We'd need to get updated goals here - for now the caller handles this
        }
    }

    return results;
}
