import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Goal, Phase, Milestone, Task, HistoryEntry, SubTask, UserProfile, TimeConstraints } from '../types';
import type { CalendarEvent } from '../constants/calendarTypes';
import { generateGoalSchedule, generateGoalOverview } from '../services/gemini';
import { logger } from '../lib/logger';
import { analytics, AnalyticsEvents } from '../lib/analytics';
import CheckoutModal from './CheckoutModal';
import { callEdgeFunction, supabase } from '../lib/supabase';
import { generateSystemicSchedule } from '../services/gemini/systemic-scheduling';
import GoalActionConfirmModal, { type ConfirmActionType } from './GoalActionConfirmModal';
import GoalCompletedModal from './GoalCompletedModal';
import GoalDetailView from './GoalDetailView';
import { hasBehaviorPlanContent, isGoalOverviewComplete, mergeGoalOverview, normalizeCriticalGaps } from '../lib/goalInsights';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface GoalLibraryProps {
  goals: Goal[];
  onGoalClick: (goal: Goal) => void;
  onMilestoneToggle: (goalId: string, phaseId: string, milestoneId: string, completed: boolean, notes?: string) => void;
  onSubTaskToggle?: (goalId: string, phaseId: string, milestoneId: string, subTaskId: string, completed: boolean) => void;
  // NEW: Proper 4-level hierarchy handlers
  onAddPhase?: (goalId: string, phase: Partial<Phase>) => void;
  onAddMilestone?: (goalId: string, phaseId: string, milestone: Partial<Milestone>) => void;
  onAddTask?: (goalId: string, phaseId: string, milestoneId: string, title: string) => void;
  onAddSubTask?: (taskId: string, title: string) => void;
  onGoalUpdate?: (goal: Goal) => void;
  onGoalStatusChange?: (goalId: string, status: Goal['status']) => void;
  onDeleteGoal?: (goalId: string) => void;
  onClearEvents?: (goalId: string) => Promise<void> | void;
  onAddGoal?: () => void;
  // Navigation callbacks
  onAskCoach?: (goalId: string) => void;
  // Calendar event actions
  onEventComplete?: (eventId: string) => void;
  onEventUpdate?: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void> | void;
  onEventDelete?: (eventId: string) => Promise<void> | void;
  onTaskToggleById?: (taskId: string) => Promise<void> | void;
  onSubTaskToggleById?: (subtaskId: string) => Promise<void> | void;
  // CRUD callbacks for phases, milestones, tasks, subtasks
  onPhaseUpdate?: (phaseId: string, updates: Partial<Phase>) => void;
  onPhaseDelete?: (phaseId: string) => void;
  onMilestoneUpdate?: (milestoneId: string, updates: Partial<Milestone>) => void;
  onMilestoneDelete?: (milestoneId: string) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskToggle?: (taskId: string, completed: boolean) => void;
  onSubTaskUpdate?: (subtaskId: string, updates: Partial<SubTask>) => void;
  onSubTaskDelete?: (subtaskId: string) => void;
  // Props for goal-level scheduling
  existingEvents?: CalendarEvent[];
  userProfile?: UserProfile;
  constraints?: TimeConstraints;
  onGoalScheduled?: (goalId: string, events: CalendarEvent[]) => void;
  calendarSchemaCapabilities?: {
    isLocked: boolean;
    difficulty: boolean;
    cognitiveType: boolean;
    effortMinutesAllocated: boolean;
    durationMinutes: boolean;
  };
  targetGoalId?: string;
  onGoalDetailOpen?: (goalId: string) => void;
  onGoalDetailClose?: () => void;
}

type PlanSource = 'override' | 'subscription' | 'default';

interface Entitlements {
  plan_id: string;
  max_active_goals: number | null;
  token_hard_cap: number | null;
  token_soft_cap: number | null;
  calendar_sync_enabled: boolean;
  warning_thresholds?: Record<string, number>;
  throttle_policy?: Record<string, any> | null;
}

// =============================================================================
// Sub Components
// =============================================================================

// Progress ring component (Stitch Style)
const ProgressRing: React.FC<{ progress: number; size?: number; stroke?: number }> = ({
  progress,
  size = 48,
  stroke = 4
}) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <defs>
          <linearGradient id="goalProgressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#goalProgressGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
        {Math.round(progress)}%
      </span>
    </div>
  );
};

// =============================================================================
// SubTask Component with proper checkboxes
// =============================================================================

interface SubTaskItemProps {
  subTask: SubTask;
  onToggle: (completed: boolean) => void;
  onUpdate?: (updates: Partial<SubTask>) => void;
  onDelete?: () => void;
}

const SubTaskItem: React.FC<SubTaskItemProps> = ({ subTask, onToggle, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(subTask.title);

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== subTask.title) {
      onUpdate?.({ title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditTitle(subTask.title); setIsEditing(false); }
  };

  return (
    <div className={`group flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 ${subTask.isStrikethrough ? 'opacity-50' : ''}`}>
      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={subTask.isCompleted}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={subTask.isStrikethrough}
          className="w-4 h-4 rounded border-border text-primary focus:ring-primary flex-shrink-0"
        />
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 px-2 py-0.5 text-sm bg-card/60 border border-primary rounded focus:outline-none text-foreground"
          />
        ) : (
          <span className={`text-sm truncate ${subTask.isCompleted
            ? 'text-muted-foreground line-through'
            : subTask.isStrikethrough
              ? 'text-muted-foreground line-through'
              : 'text-foreground'
            }`}>
            {subTask.title}
            {subTask.isManual && (
              <span className="ml-1 text-xs text-primary">(custom)</span>
            )}
          </span>
        )}
      </label>
      {subTask.completedAt && (
        <span className="text-xs text-green-500 flex-shrink-0">
          ✓ {new Date(subTask.completedAt).toLocaleDateString()}
        </span>
      )}
      {/* Edit/Delete buttons - show on hover */}
      {!isEditing && (onUpdate || onDelete) && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onUpdate && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              className="p-1 text-muted-foreground hover:text-primary rounded"
              title="Edit"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-muted-foreground hover:text-red-500 rounded"
              title="Delete"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Task Item Component (within a milestone)
// =============================================================================

interface TaskItemProps {
  task: Task;
  onToggle: (completed: boolean) => void;
  onSubTaskToggle: (subTaskId: string, completed: boolean) => void;
  onAddSubTask?: (taskId: string, title: string) => void;
  onSubTaskUpdate?: (subTaskId: string, updates: Partial<SubTask>) => void;
  onSubTaskDelete?: (subTaskId: string) => void;
  onUpdate?: (updates: Partial<Task>) => void;
  onDelete?: () => void;
}

const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggle,
  onSubTaskToggle,
  onAddSubTask,
  onSubTaskUpdate,
  onSubTaskDelete,
  onUpdate,
  onDelete
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [newSubTaskInput, setNewSubTaskInput] = useState('');

  const completedSubTasks = (task.subTasks || []).filter(st => st.isCompleted && !st.isStrikethrough).length;
  const totalSubTasks = (task.subTasks || []).filter(st => !st.isStrikethrough).length;
  const hasSubTasks = totalSubTasks > 0;

  const handleSave = () => {
    if (editTitle.trim() && editTitle !== task.title) {
      onUpdate?.({ title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditTitle(task.title); setIsEditing(false); }
  };

  return (
    <div className={`group/task border border-border rounded-lg overflow-hidden ${task.isStrikethrough ? 'opacity-50' : ''}`}>
      <div
        className={`flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 ${task.isCompleted ? 'bg-emerald-500/10' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <label className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={task.isCompleted}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={task.isStrikethrough}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
        </label>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="w-full px-2 py-0.5 text-sm font-medium bg-card/60 border border-primary rounded focus:outline-none text-foreground"
            />
          ) : (
            <>
              <span className={`text-sm font-medium ${task.isCompleted ? 'text-muted-foreground line-through' :
                task.isStrikethrough ? 'text-muted-foreground line-through' :
                  'text-foreground'
                }`}>
                {task.title}
              </span>
              {hasSubTasks && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({completedSubTasks}/{totalSubTasks})
                </span>
              )}
            </>
          )}
        </div>

        {/* Edit/Delete buttons */}
        {!isEditing && (onUpdate || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            {onUpdate && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-muted-foreground hover:text-primary rounded"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete()}
                className="p-1 text-muted-foreground hover:text-red-500 rounded"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}

        {hasSubTasks && (
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-border pl-6 py-2 bg-muted/40">
          {(task.subTasks || []).map(st => (
            <SubTaskItem
              key={st.id}
              subTask={st}
              onToggle={(completed) => onSubTaskToggle(st.id, completed)}
              onUpdate={onSubTaskUpdate ? (updates) => onSubTaskUpdate(st.id, updates) : undefined}
              onDelete={onSubTaskDelete ? () => onSubTaskDelete(st.id) : undefined}
            />
          ))}
          {/* Add subtask input */}
          {onAddSubTask && (
            <div className="flex gap-2 mt-2 pt-2 border-t border-border">
              <input
                type="text"
                value={newSubTaskInput}
                onChange={(e) => setNewSubTaskInput(e.target.value)}
                placeholder="Add subtask..."
                className="flex-1 px-2 py-1 text-xs bg-card/60 border border-border rounded focus:ring-1 focus:ring-primary text-foreground"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSubTaskInput.trim()) {
                    onAddSubTask(task.id, newSubTaskInput.trim());
                    setNewSubTaskInput('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newSubTaskInput.trim()) {
                    onAddSubTask(task.id, newSubTaskInput.trim());
                    setNewSubTaskInput('');
                  }
                }}
                disabled={!newSubTaskInput.trim()}
                className="px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Milestone Component with tasks and sub-tasks
// =============================================================================

interface MilestoneItemProps {
  milestone: Milestone;
  goalId: string;
  phaseId: string;
  onToggle: (completed: boolean, notes?: string) => void;
  onTaskToggle?: (taskId: string, completed: boolean) => void;
  onSubTaskToggle: (subTaskId: string, completed: boolean) => void;
  // NEW: Proper 4-level hierarchy handlers
  onAddTask: (title: string) => void;
  onAddSubTask?: (taskId: string, title: string) => void;
  // CRUD callbacks
  onUpdate?: (updates: Partial<Milestone>) => void;
  onDelete?: () => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTaskDelete?: (taskId: string) => void;
  onSubTaskUpdate?: (subTaskId: string, updates: Partial<SubTask>) => void;
  onSubTaskDelete?: (subTaskId: string) => void;
}

const MilestoneItem: React.FC<MilestoneItemProps> = ({
  milestone,
  goalId,
  phaseId,
  onToggle,
  onTaskToggle,
  onSubTaskToggle,
  onAddTask,
  onAddSubTask,
  onUpdate,
  onDelete,
  onTaskUpdate,
  onTaskDelete,
  onSubTaskUpdate,
  onSubTaskDelete,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [noteInput, setNoteInput] = useState(milestone.userNotes || '');
  const [isSaving, setIsSaving] = useState(false);

  // Count from tasks hierarchy (new structure only - legacy removed)
  const tasksArray = milestone.tasks || [];
  const allSubTasksFromTasks = tasksArray.flatMap(t => t.subTasks || []);
  const completedFromTasks = allSubTasksFromTasks.filter(st => st.isCompleted && !st.isStrikethrough).length;
  const totalFromTasks = allSubTasksFromTasks.filter(st => !st.isStrikethrough).length;

  // Total counts (new structure only)
  const completedTasks = tasksArray.filter(t => t.isCompleted && !t.isStrikethrough).length;
  const totalTasks = tasksArray.filter(t => !t.isStrikethrough).length;
  const hasItems = totalTasks > 0;

  const handleSaveTask = () => {
    if (newTaskInput.trim()) {
      onAddTask(newTaskInput.trim());
      setNewTaskInput('');
    }
  };

  const handleToggleWithNote = (checked: boolean) => {
    setIsSaving(true);
    onToggle(checked, noteInput || undefined);
    setTimeout(() => setIsSaving(false), 300);
  };

  return (
    <div className="group/milestone border border-border rounded-lg overflow-hidden">
      {/* Milestone Header */}
      <div
        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${milestone.isCompleted ? 'bg-emerald-500/10' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Checkbox */}
        <label className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={milestone.isCompleted}
            onChange={(e) => handleToggleWithNote(e.target.checked)}
            className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
          />
        </label>

        {/* Title & Status */}
        <div className="flex-1 min-w-0">
          <div className={`font-medium ${milestone.isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {milestone.title}
          </div>

          {hasItems && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {`${completedTasks}/${totalTasks} tasks completed`}
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {hasItems && (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Expand icon */}
        <svg
          className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>

        {/* Edit/Delete buttons - show on hover */}
        {(onUpdate || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 group-hover/milestone:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            {onUpdate && (
              <button
                onClick={() => {
                  setEditDialog({
                    isOpen: true,
                    title: 'Edit milestone title',
                    description: 'Update the milestone title to better reflect your goal.',
                    value: milestone.title,
                    onConfirm: (value) => onUpdate({ title: value }),
                  });
                }}
                className="p-1 text-muted-foreground hover:text-primary rounded"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  setDeleteDialog({
                    isOpen: true,
                    title: 'Delete milestone?',
                    description: 'All tasks and subtasks in this milestone will also be deleted.',
                    onConfirm: onDelete,
                  });
                }}
                className="p-1 text-muted-foreground hover:text-red-500 rounded"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border p-3 bg-muted/40">
          {/* Description */}
          {milestone.description && (
            <p className="text-sm text-muted-foreground mb-3">
              {milestone.description}
            </p>
          )}

          {/* User Notes */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Notes / Details
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add notes (e.g., book title, course name)..."
                className="flex-1 px-3 py-2 text-sm bg-card/60 border border-border rounded-lg focus:ring-2 focus:ring-primary text-foreground"
              />
              <button
                onClick={() => onToggle(milestone.isCompleted, noteInput)}
                disabled={noteInput === milestone.userNotes}
                className="px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {milestone.userNotes && milestone.userNotes !== noteInput && (
              <p className="text-xs text-muted-foreground mt-1">Current: {milestone.userNotes}</p>
            )}
          </div>

          {/* Tasks (4-level hierarchy) */}
          {tasksArray.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Tasks
              </label>
              <div className="space-y-2">
                {tasksArray.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggle={(completed) => onTaskToggle?.(task.id, completed)}
                    onSubTaskToggle={onSubTaskToggle}
                    onAddSubTask={onAddSubTask}
                    onSubTaskUpdate={onSubTaskUpdate}
                    onSubTaskDelete={onSubTaskDelete}
                    onUpdate={onTaskUpdate ? (updates) => onTaskUpdate(task.id, updates) : undefined}
                    onDelete={onTaskDelete ? () => onTaskDelete(task.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add new task */}
          <div className="pt-3 border-t border-border">
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Add Task
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="New checklist item..."
                className="flex-1 px-3 py-2 text-sm bg-card/60 border border-border rounded-lg focus:ring-2 focus:ring-primary text-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTask()}
              />
              <button
                onClick={handleSaveTask}
                disabled={!newTaskInput.trim()}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Completed info */}
          {milestone.completedAt && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-green-600 dark:text-green-400">
                Completed on {new Date(milestone.completedAt).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Phase Component with "Refine with Gemini"
// =============================================================================

interface PhaseCardProps {
  phase: Phase;
  goal: Goal;
  isCurrent: boolean;
  isPast: boolean;
  onMilestoneToggle: (milestoneId: string, completed: boolean, notes?: string) => void;
  onSubTaskToggle: (milestoneId: string, subTaskId: string, completed: boolean) => void;
  onAddSubTask: (milestoneId: string, title: string) => void;
  onPhaseUpdate: (updatedPhase: Phase) => void;
  // CRUD callbacks  
  onPhaseEdit?: (updates: Partial<Phase>) => void;
  onPhaseDelete?: () => void;
  onMilestoneUpdate?: (milestoneId: string, updates: Partial<Milestone>) => void;
  onMilestoneDelete?: (milestoneId: string) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTaskDelete?: (taskId: string) => void;
  onSubTaskUpdate?: (subtaskId: string, updates: Partial<SubTask>) => void;
  onSubTaskDelete?: (subtaskId: string) => void;
  // Added missing props
  onTaskToggle?: (taskId: string, completed: boolean) => void;
  onAddTask?: (goalId: string, phaseId: string, milestoneId: string, title: string) => void;
}

const PhaseCard: React.FC<PhaseCardProps> = ({
  phase,
  goal,
  isCurrent,
  isPast,
  onMilestoneToggle,
  onSubTaskToggle,
  onAddSubTask,
  onPhaseUpdate,
  onPhaseEdit,
  onPhaseDelete,
  onMilestoneUpdate,
  onMilestoneDelete,
  onTaskUpdate,
  onTaskDelete,
  onSubTaskUpdate,
  onSubTaskDelete,
  onTaskToggle,
  onAddTask,
}) => {
  const [isExpanded, setIsExpanded] = useState(isCurrent);

  const completedMilestones = phase.milestones.filter(m => m.isCompleted).length;
  const progress = phase.milestones.length > 0
    ? Math.round((completedMilestones / phase.milestones.length) * 100)
    : 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${isCurrent
      ? 'border-primary/30 bg-primary/5'
      : isPast
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : 'border-border'
      }`}>
      {/* Phase Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isPast
            ? 'bg-emerald-500 text-primary-foreground'
            : isCurrent
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
            }`}>
            {isPast ? '✓' : phase.number}
          </span>

          <div>
            <h5 className="font-semibold text-foreground">
              {phase.title}
            </h5>
            <p className="text-xs text-muted-foreground">
              Weeks {phase.startWeek}-{phase.endWeek} • {completedMilestones}/{phase.milestones.length} milestones
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ProgressRing progress={progress} size={36} stroke={3} />

          <svg
            className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Description */}
          {phase.description && (
            <p className="text-sm text-muted-foreground">
              {phase.description}
            </p>
          )}

          {/* Coach Advice */}
          {phase.coachAdvice && (
            <div className="p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center gap-2 text-xs font-medium text-primary mb-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Coach Tip
              </div>
              <p className="text-sm text-muted-foreground">
                {phase.coachAdvice}
              </p>
            </div>
          )}

          {/* Milestones */}
          <div className="space-y-3">
            {phase.milestones.map((milestone) => (
              <MilestoneItem
                key={milestone.id}
                milestone={milestone}
                goalId={goal.id}
                phaseId={phase.id}
                onToggle={(completed, notes) => onMilestoneToggle(milestone.id, completed, notes)}
                onTaskToggle={onTaskToggle}
                onSubTaskToggle={(stId, completed) => onSubTaskToggle(milestone.id, stId, completed)}
                onAddTask={onAddTask ? (title) => onAddTask(goal.id, phase.id, milestone.id, title) : undefined}
                onAddSubTask={onAddSubTask}
                onUpdate={onMilestoneUpdate ? (updates) => onMilestoneUpdate(milestone.id, updates) : undefined}
                onDelete={onMilestoneDelete ? () => onMilestoneDelete(milestone.id) : undefined}
                onTaskUpdate={onTaskUpdate}
                onTaskDelete={onTaskDelete}
                onSubTaskUpdate={onSubTaskUpdate}
                onSubTaskDelete={onSubTaskDelete}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center justify-end gap-3">
              {/* Edit Phase Button */}
              {onPhaseEdit && (
                <button
                  onClick={() => {
                    setEditDialog({
                      isOpen: true,
                      title: 'Edit phase title',
                      description: 'Update the phase title to better match your plan.',
                      value: phase.title,
                      onConfirm: (value) => onPhaseEdit({ title: value }),
                    });
                  }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                  title="Edit Phase"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Edit
                </button>
              )}

              {/* Delete Phase Button */}
              {onPhaseDelete && (
                <button
                  onClick={() => {
                    setDeleteDialog({
                      isOpen: true,
                      title: `Delete "${phase.title}"?`,
                      description: 'All milestones, tasks, and subtasks in this phase will also be deleted.',
                      onConfirm: onPhaseDelete,
                    });
                  }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-red-500 transition-colors"
                  title="Delete Phase"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Phase
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

const GoalLibrary: React.FC<GoalLibraryProps> = ({
  goals,
  onGoalClick,
  onMilestoneToggle,
  onSubTaskToggle,
  onAddPhase,
  onAddMilestone,
  onAddTask,
  onAddSubTask,
  onGoalUpdate,
  onGoalStatusChange,
  onDeleteGoal,
  onClearEvents,
  onAddGoal,
  onAskCoach,
  onEventComplete,
  onEventUpdate,
  onEventDelete,
  onTaskToggleById,
  onSubTaskToggleById,
  // CRUD callbacks
  onPhaseUpdate,
  onPhaseDelete,
  onMilestoneUpdate,
  onMilestoneDelete,
  onTaskUpdate,
  onTaskDelete,
  onTaskToggle,
  onSubTaskUpdate,
  onSubTaskDelete,
  // Scheduling props
  existingEvents = [],
  userProfile,
  constraints,
  onGoalScheduled,
  calendarSchemaCapabilities,
  targetGoalId,
  onGoalDetailOpen,
  onGoalDetailClose,
}) => {
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [overviewStatus, setOverviewStatus] = useState<Record<string, 'idle' | 'loading' | 'error' | 'ready'>>({});
  const overviewRequestRef = useRef<Record<string, number>>({});
  const selectedGoalIdRef = useRef<string | null>(null);
  const goalsRef = useRef<Goal[]>(goals);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [entitlementSource, setEntitlementSource] = useState<PlanSource>('default');
  const goalLimitEventFired = useRef(false);
  const [entitlementsRefreshKey, setEntitlementsRefreshKey] = useState(0);

  useEffect(() => {
    if (selectedGoal) {
      onGoalDetailOpen?.(selectedGoal.id);
    } else {
      onGoalDetailClose?.();
    }
  }, [selectedGoal, onGoalDetailOpen, onGoalDetailClose]);

  useEffect(() => {
    selectedGoalIdRef.current = selectedGoal?.id ?? null;
  }, [selectedGoal?.id]);

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  useEffect(() => {
    let isMounted = true;

    const loadEntitlements = async () => {
      try {
        const authResult = await supabase.auth.getUser();
        const userId = userProfile?.id || authResult.data?.user?.id;
        if (!userId) {
          return;
        }

        const now = new Date();
        const { data: override } = await supabase
          .from('user_entitlement_overrides')
          .select('override_plan_id, starts_at, ends_at')
          .eq('user_id', userId)
          .maybeSingle();

        const isOverrideActive = override && (!override.starts_at || new Date(override.starts_at) <= now)
          && (!override.ends_at || new Date(override.ends_at) > now);

        let resolvedPlanId = 'free';
        let resolvedSource: PlanSource = 'default';

        if (isOverrideActive && override?.override_plan_id) {
          resolvedPlanId = override.override_plan_id;
          resolvedSource = 'override';
        } else {
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('plan_id, status, current_period_end')
            .eq('user_id', userId)
            .order('current_period_end', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const status = (subscription?.status || '').toLowerCase();
          const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
          const isSubscriptionActive =
            ['active', 'trialing', 'past_due'].includes(status) ||
            (status === 'canceled' && periodEnd && periodEnd > now);

          if (isSubscriptionActive && subscription?.plan_id) {
            resolvedPlanId = subscription.plan_id;
            resolvedSource = 'subscription';
          }
        }

        const { data: plan } = await supabase
          .from('plan_entitlements')
          .select('*')
          .eq('plan_id', resolvedPlanId)
          .maybeSingle();

        if (isMounted) {
          if (plan) {
            setEntitlements({
              plan_id: plan.plan_id,
              max_active_goals: plan.max_active_goals ?? null,
              token_hard_cap: plan.token_hard_cap ?? null,
              token_soft_cap: plan.token_soft_cap ?? null,
              calendar_sync_enabled: plan.calendar_sync_enabled ?? false,
              warning_thresholds: plan.warning_thresholds ?? {},
              throttle_policy: plan.throttle_policy ?? null,
            });
          }
          setEntitlementSource(resolvedSource);
        }
      } catch (error) {
        logger.error('[GoalLibrary] Failed to load entitlements', error);
      } finally {
        // no-op
      }
    };

    void loadEntitlements();
    return () => {
      isMounted = false;
    };
  }, [userProfile?.id, entitlementsRefreshKey]);

  const goalsWithCalendar = useMemo(() => {
    const set = new Set<string>();
    for (const event of existingEvents) {
      const goalId = event.goalId || event.ambitionOsMeta?.goalId;
      if (goalId) set.add(goalId);
    }
    return set;
  }, [existingEvents]);

  // Effect to handle deep linking to a specific goal
  useEffect(() => {
    if (targetGoalId) {
      const found = goals.find(g => g.id === targetGoalId);
      if (found) {
        setSelectedGoal(found);
      }
    }
  }, [targetGoalId, goals]);

  // Keep selected goal in sync with latest data
  useEffect(() => {
    if (!selectedGoal) return;
    const latest = goals.find(g => g.id === selectedGoal.id);
    if (latest && latest !== selectedGoal) {
      setSelectedGoal(latest);
    }
  }, [goals, selectedGoal]);

  // On-demand LLM Overview generation (Strategy + Critical Gaps + Behavior Plan)
  useEffect(() => {
    if (!selectedGoal || !onGoalUpdate) return;

    const goalId = selectedGoal.id;
    const status = overviewStatus[goalId] || 'idle';
    const hasStrategy = Boolean(selectedGoal.strategyOverview && selectedGoal.strategyOverview.trim().length > 0);
    const hasGaps = normalizeCriticalGaps(selectedGoal.criticalGaps).length > 0;
    const hasBehaviorPlan = hasBehaviorPlanContent(selectedGoal.behaviorPlan);
    const overviewComplete = hasStrategy && hasGaps && hasBehaviorPlan;

    if (overviewComplete) {
      if (status !== 'ready') {
        setOverviewStatus(prev => ({ ...prev, [goalId]: 'ready' }));
      }
      return;
    }

    if (status !== 'idle') return;

    setOverviewStatus(prev => ({ ...prev, [goalId]: 'loading' }));

    const requestId = (overviewRequestRef.current[goalId] || 0) + 1;
    overviewRequestRef.current[goalId] = requestId;

    (async () => {
      try {
        const result = await generateGoalOverview({
          goal: selectedGoal,
          userProfile,
        });

        if (overviewRequestRef.current[goalId] !== requestId) return;

        const latestGoal = goalsRef.current.find(g => g.id === goalId) || selectedGoal;
        const mergedOverview = mergeGoalOverview(latestGoal, result);
        const updatedGoal: Goal = {
          ...latestGoal,
          ...mergedOverview,
        };

        onGoalUpdate(updatedGoal);

        const mergedComplete = isGoalOverviewComplete({
          strategyOverview: mergedOverview.strategyOverview,
          criticalGaps: mergedOverview.criticalGaps,
          behaviorPlan: mergedOverview.behaviorPlan,
        });
        setOverviewStatus(prev => ({ ...prev, [goalId]: mergedComplete ? 'ready' : 'error' }));

        if (selectedGoalIdRef.current === goalId) {
          setSelectedGoal(updatedGoal);
        }
      } catch (error) {
        logger.error('[GoalLibrary] Failed to generate goal overview', error);
        if (overviewRequestRef.current[goalId] === requestId) {
          const latestGoal = goalsRef.current.find(g => g.id === goalId) || selectedGoal;
          const latestComplete = isGoalOverviewComplete({
            strategyOverview: latestGoal.strategyOverview,
            criticalGaps: latestGoal.criticalGaps,
            behaviorPlan: latestGoal.behaviorPlan,
          });
          setOverviewStatus(prev => ({ ...prev, [goalId]: latestComplete ? 'ready' : 'error' }));
        }
      }
    })();
  }, [selectedGoal, onGoalUpdate, userProfile, overviewStatus]);

  const handleRetryOverview = useCallback((goalId: string) => {
    setOverviewStatus(prev => ({ ...prev, [goalId]: 'idle' }));
  }, []);

  const handleGoalClick = (goal: Goal) => setSelectedGoal(goal);
  const [selectedTab, setSelectedTab] = useState<'active' | 'completed' | 'paused' | 'abandoned'>('active');
  const [schedulingGoalId, setSchedulingGoalId] = useState<string | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlanId] = useState<'pro_monthly' | 'pro_annual'>('pro_monthly');

  const handleUpgradeToPro = useCallback(async () => {
    logger.info('checkout_started', { plan_id: checkoutPlanId, source: 'goal_limit' });
    setCheckoutOpen(true);
  }, [checkoutPlanId]);

  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    action: ConfirmActionType;
    goalId: string;
    goalTitle: string;
  } | null>(null);

  const [editDialog, setEditDialog] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    value: string;
    onConfirm: (value: string) => void;
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (editDialog?.isOpen) {
      setEditValue(editDialog.value);
    }
  }, [editDialog]);

  // Goal completed modal state
  const [completedGoal, setCompletedGoal] = useState<Goal | null>(null);
  const prevGoalsRef = useRef<Map<string, string>>(new Map());

  // Detect when a goal transitions to 'completed' status
  useEffect(() => {
    const prevStatuses = prevGoalsRef.current;

    for (const goal of goals) {
      const prevStatus = prevStatuses.get(goal.id);
      // If goal was NOT completed before but IS completed now, show modal
      if (prevStatus && prevStatus !== 'completed' && goal.status === 'completed') {
        setCompletedGoal(goal);
        break; // Only show one at a time
      }
    }

    // Update ref with current statuses
    const newStatuses = new Map<string, string>();
    for (const goal of goals) {
      newStatuses.set(goal.id, goal.status);
    }
    prevGoalsRef.current = newStatuses;
  }, [goals]);

  const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'planning');
  const completedGoals = goals.filter(g => g.status === 'completed');
  const pausedGoals = goals.filter(g => g.status === 'paused');
  const abandonedGoals = goals.filter(g => g.status === 'abandoned');
  const isFreePlan = entitlements?.plan_id === 'free' || entitlements?.plan_id === 'staging_free' || entitlementSource === 'default';
  const maxActiveGoals = entitlements?.max_active_goals ?? null;
  const goalLimitReached = isFreePlan && maxActiveGoals !== null && activeGoals.length >= maxActiveGoals;

  useEffect(() => {
    if (goalLimitReached && !goalLimitEventFired.current) {
      goalLimitEventFired.current = true;
      logger.info('limit_hit', { limit_type: 'goals', limit_value: maxActiveGoals, plan_id: entitlements?.plan_id });
    }
    if (!goalLimitReached) {
      goalLimitEventFired.current = false;
    }
  }, [goalLimitReached, maxActiveGoals, entitlements?.plan_id]);

  const handleRequestAddGoal = useCallback(() => {
    if (goalLimitReached) {
      void handleUpgradeToPro();
      return;
    }
    onAddGoal?.();
  }, [goalLimitReached, handleUpgradeToPro, onAddGoal]);

  const displayGoals = selectedTab === 'active'
    ? activeGoals
    : selectedTab === 'completed'
      ? completedGoals
      : selectedTab === 'paused'
        ? pausedGoals
        : abandonedGoals;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      health: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      career: 'bg-blue-100 dark:bg-blue-900/30 text-primary dark:text-blue-300',
      learning: 'bg-primary dark:bg-primary/30 text-primary dark:text-primary',
      personal: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
      financial: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
      relationships: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    };
    return colors[category] || 'bg-muted text-muted-foreground';
  };

  const handlePhaseUpdate = useCallback((goalId: string, updatedPhase: Phase) => {
    if (!onGoalUpdate) return;

    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const updatedGoal = {
      ...goal,
      phases: goal.phases.map(p => p.id === updatedPhase.id ? updatedPhase : p),
      updatedAt: new Date(),
    };

    onGoalUpdate(updatedGoal);
  }, [goals, onGoalUpdate]);

  // Build calendar for entire goal (all phases)
  const handleBuildGoalCalendar = useCallback(async (goal: Goal) => {
    if (!onGoalScheduled || !constraints) {
      logger.error('[GoalLibrary] Missing required props for scheduling');
      alert('Please complete your profile setup before building calendars.');
      return;
    }

    setSchedulingGoalId(goal.id);
    try {
      logger.info('[GoalLibrary] Calling Edge Function to generate schedule for goal', { goalId: goal.id });

      const result = await generateGoalSchedule({
        profile: userProfile || {},
        goal,
        constraints,
        existingEvents,
        startDate: new Date(),
      });

      logger.info('[GoalLibrary] Edge Function created events', { count: result.events.length });

      // Mark goal as scheduled
      if (onGoalUpdate) {
        const updatedGoal = {
          ...goal,
          isScheduled: true,
          phases: goal.phases.map(p => ({ ...p, isScheduled: true })),
          updatedAt: new Date(),
        };
        onGoalUpdate(updatedGoal);
      }

      // Events are already saved by the Edge Function directly to the database.
      // We pass empty events array to prevent duplicate saves in handleGoalScheduled.
      await onGoalScheduled(goal.id, []);

      // Show success with event count
      alert(`Calendar created! ${result.events.length} sessions scheduled across your timeline.`);

    } catch (error) {
      logger.error('[GoalLibrary] Goal scheduling failed', error, { goalId: goal.id });
      alert('Failed to build calendar. Please try again.');
    } finally {
      setSchedulingGoalId(null);
    }
  }, [constraints, existingEvents, onGoalScheduled, onGoalUpdate, userProfile]);

  const handleSystemicSchedule = async (goalId: string) => {
    // Use the Edge Function-based scheduling which correctly queries the full
    // goal hierarchy from the database and creates proper multi-week schedules
    const goal = goals.find(g => g.id === goalId);
    if (!goal) {
      logger.error('[GoalLibrary] Goal not found for scheduling', new Error('Goal not found for scheduling'), { goalId });
      return;
    }

    // Delegate to the Edge Function-based scheduling
    await handleBuildGoalCalendar(goal);
  };

  if (selectedGoal) {
    return (
      <>
        <GoalDetailView
          goal={selectedGoal}
          events={existingEvents}
          userProfile={userProfile}
          constraints={constraints}
          calendarSchemaCapabilities={calendarSchemaCapabilities}
          calendarEvents={existingEvents}
          isScheduling={schedulingGoalId === selectedGoal.id}
          onBack={() => setSelectedGoal(null)}
          onEdit={() => {
            // Edit is now handled internally by GoalDetailView
          }}
          onGoalUpdate={(goalId, updates) => {
            if (onGoalUpdate && selectedGoal) {
              const updatedGoal = { ...selectedGoal, ...updates };
              onGoalUpdate(updatedGoal);
            }
          }}
          onAskCoach={onAskCoach}
          onEventComplete={onEventComplete}
          onEventUpdate={onEventUpdate}
          onEventDelete={onEventDelete}
          onTaskToggleById={onTaskToggleById}
          onSubTaskToggleById={onSubTaskToggleById}
          onMilestoneToggle={onMilestoneToggle}
          onSubTaskToggle={onSubTaskToggle}
          onAddPhase={onAddPhase}
          onAddMilestone={onAddMilestone}
          onAddTask={onAddTask}
          onAddSubTask={onAddSubTask}
          onPhaseUpdate={(phaseId, updates) => onPhaseUpdate && onPhaseUpdate(phaseId, updates)}
          onPhaseDelete={(phaseId) => onPhaseDelete && onPhaseDelete(phaseId)}
          onMilestoneUpdate={onMilestoneUpdate}
          onMilestoneDelete={onMilestoneDelete}
          onTaskUpdate={onTaskUpdate}
          onTaskDelete={onTaskDelete}
          onTaskToggle={onTaskToggle}
          onSubTaskUpdate={onSubTaskUpdate}
          onSubTaskDelete={onSubTaskDelete}
          overviewStatus={overviewStatus[selectedGoal.id] || 'idle'}
          onRetryOverview={handleRetryOverview}
          // New Props
          onCreateCalendar={handleSystemicSchedule}
          onRebuildCalendar={(id) => setConfirmAction({
            isOpen: true,
            action: 'rebuild_calendar',
            goalId: id,
            goalTitle: selectedGoal.title
          })}
          onClearCalendar={(id) => setConfirmAction({
            isOpen: true,
            action: 'delete_events',
            goalId: id,
            goalTitle: selectedGoal.title
          })}
          onPauseGoal={(id) => setConfirmAction({
            isOpen: true,
            action: 'pause',
            goalId: id,
            goalTitle: selectedGoal.title
          })}
          onResumeGoal={(id) => {
            // Resume without confirmation (just switch status)
            analytics.track(AnalyticsEvents.GOAL_RESUMED, { goal_id: id });
            if (onGoalStatusChange) {
              onGoalStatusChange(id, 'active');
            }
          }}
          onAbandonGoal={(id) => setConfirmAction({
            isOpen: true,
            action: 'abandon',
            goalId: id,
            goalTitle: selectedGoal.title
          })}
          onDeleteGoal={(id) => setConfirmAction({
            isOpen: true,
            action: 'delete',
            goalId: id,
            goalTitle: selectedGoal.title
          })}
        />
        {
          confirmAction && (
            <GoalActionConfirmModal
              isOpen={confirmAction.isOpen}
              onClose={() => setConfirmAction(null)}
              onConfirm={() => {
                const { action, goalId } = confirmAction;

                switch (action) {
                  case 'pause':
                    analytics.track(AnalyticsEvents.GOAL_PAUSED, { goal_id: goalId });
                    if (onGoalStatusChange) {
                      onGoalStatusChange(goalId, 'paused');
                    }
                    break;
                  case 'abandon':
                    analytics.track(AnalyticsEvents.GOAL_ABANDONED, { goal_id: goalId });
                    if (onGoalStatusChange) {
                      onGoalStatusChange(goalId, 'abandoned');
                    }
                    break;
                  case 'delete':
                    if (onDeleteGoal) {
                      onDeleteGoal(goalId);
                    }
                    break;
                  case 'delete_events':
                    if (onClearEvents) {
                      onClearEvents(goalId);
                    }
                    break;
                  case 'rebuild_calendar': {
                    const goalToRebuild = goals.find(g => g.id === goalId);
                    if (!goalToRebuild) break;

                    if (onClearEvents) {
                      Promise.resolve(onClearEvents(goalId))
                        .then(() => handleBuildGoalCalendar(goalToRebuild))
                        .catch((err) => logger.error('[GoalLibrary] Failed to rebuild calendar', err));
                    } else {
                      void handleBuildGoalCalendar(goalToRebuild);
                    }
                    break;
                  }
                }
                setConfirmAction(null);
              }}
              action={confirmAction.action}
              goalTitle={confirmAction.goalTitle}
            />
          )
        }
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-6 px-6 pb-2">
      <div className="w-full px-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2">
              Ambitions
            </h1>
            <p className="text-muted-foreground">
              Track and manage your progress across all ambitions
            </p>
          </div>


        </div>

        {/* Tabs - Glass Style */}
        <div className="flex items-center gap-2 p-1 w-full lg:w-auto mb-8 overflow-x-auto" data-wt="goals-tabs">
          {[
            { id: 'active', label: 'Active' },
            { id: 'completed', label: 'Completed' },
            { id: 'paused', label: 'Paused' },
            { id: 'abandoned', label: 'Abandoned' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`
                px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap
                ${selectedTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'glass-surface text-muted-foreground hover:text-foreground hover:border-primary/30'
                }
              `}
            >
              {tab.label} ({
                tab.id === 'active' ? activeGoals.length :
                  tab.id === 'completed' ? completedGoals.length :
                    tab.id === 'paused' ? pausedGoals.length : abandonedGoals.length
              })
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="pb-4">
          {displayGoals.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl border border-border">
              <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {selectedTab === 'active' ? 'No active ambitions' :
                  selectedTab === 'completed' ? 'No completed ambitions yet' :
                    selectedTab === 'paused' ? 'No paused ambitions' : 'No abandoned ambitions'}
              </h3>
              <p className="text-muted-foreground">
                {selectedTab === 'active' ? 'Start by creating your first ambition!' :
                  selectedTab === 'completed' ? 'Keep working on your ambitions!' :
                    selectedTab === 'paused' ? 'Paused ambitions can be resumed anytime.' : 'Abandoned ambitions and their calendar events are removed.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6" data-wt="goals-grid">
              {displayGoals.map((goal, idx) => {
                const currentPhase = goal.phases[goal.currentPhaseIndex || 0];
                const nextMilestone = currentPhase?.milestones?.find(m => !m.completedAt);
                const nextAction = nextMilestone?.title || currentPhase?.title || 'Review your roadmap';
                const hasCalendar = Boolean(goal.isScheduled) || goalsWithCalendar.has(goal.id);

                // Standardized Category Icons (From Dashboard.tsx)
                const categoryIcons: Record<string, string> = {
                  fitness: 'directions_run',
                  business: 'trending_up',
                  learning: 'school',
                  financial: 'attach_money',
                  health: 'favorite',
                  career: 'work',
                  creative: 'palette',
                  relationships: 'people',
                  default: 'flag'
                };
                const icon = categoryIcons[goal.category] || categoryIcons.default;

                // Standardized Category Colors (From Dashboard.tsx)
                const categoryColors: Record<string, string> = {
                  fitness: 'text-purple-400 bg-purple-400/10',
                  business: 'text-primary bg-primary/10',
                  learning: 'text-blue-400 bg-blue-400/10',
                  financial: 'text-green-400 bg-green-400/10',
                  health: 'text-rose-400 bg-rose-400/10',
                  career: 'text-cyan-400 bg-cyan-400/10',
                  creative: 'text-pink-400 bg-pink-400/10',
                  relationships: 'text-amber-400 bg-amber-400/10',
                  default: 'text-slate-400 bg-slate-400/10'
                };
                const colorClass = categoryColors[goal.category] || categoryColors.default;

                return (
                  <div
                    key={goal.id}
                    onClick={() => handleGoalClick(goal)}
                    data-wt={idx === 0 ? "goals-card-first" : undefined}
                    className="bg-card/70 backdrop-blur-md border border-border p-6 rounded-xl cursor-pointer hover:border-primary/50 transition-all duration-300 group relative overflow-hidden min-h-[220px] flex flex-col"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/20 transition-all"></div>

                    {/* Top Row: Icon + Progress Ring */}
                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className={`p-3 rounded-lg ${colorClass}`}>
                        <span className="material-symbols-outlined text-2xl">{icon}</span>
                      </div>
                      <ProgressRing progress={goal.overallProgress} size={64} stroke={4} />
                    </div>

                    <div className="relative z-10 flex-1 flex flex-col">
                      {/* Title */}
                      <h3 className="text-foreground text-xl font-bold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                        {goal.title}
                      </h3>

                      {/* Next Action */}
                      <div className="flex-1 mb-4">
                        <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-1">NEXT ACTION</p>
                        <p className="text-primary text-base font-bold line-clamp-1">{nextAction}</p>
                      </div>

                      {/* Bottom: Phase + Category + Build Calendar */}
                      <div className="flex items-center gap-2 mt-auto flex-wrap">
                        <span className="px-2 py-1 bg-muted rounded-lg text-xs font-semibold text-muted-foreground">
                          Phase {(goal.currentPhaseIndex || 0) + 1} of {goal.phases.length}
                        </span>
                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize ${colorClass}`}>
                          {goal.category}
                        </span>
                        {onGoalScheduled && constraints && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (schedulingGoalId === goal.id) return;
                              if (hasCalendar) {
                                setConfirmAction({
                                  isOpen: true,
                                  action: 'rebuild_calendar',
                                  goalId: goal.id,
                                  goalTitle: goal.title,
                                });
                                return;
                              }
                              setSchedulingGoalId(goal.id);
                              handleBuildGoalCalendar(goal).finally(() => setSchedulingGoalId(null));
                            }}
                            disabled={schedulingGoalId === goal.id}
                            className="ml-auto px-2 py-1 bg-primary/20 hover:bg-primary/30 rounded-lg text-xs font-semibold text-primary flex items-center gap-1 transition-colors disabled:opacity-50"
                            title={hasCalendar ? "Rebuild calendar events for this ambition" : "Build calendar events for this ambition"}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {schedulingGoalId === goal.id ? 'sync' : hasCalendar ? 'autorenew' : 'calendar_add_on'}
                            </span>
                            {schedulingGoalId === goal.id ? 'Building...' : hasCalendar ? 'Rebuild' : 'Schedule'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add New Manifestation Card */}
              {selectedTab === 'active' && onAddGoal && (
                goalLimitReached ? (
                  <div
                    data-wt="goals-upgrade-cta"
                    className="glass-surface p-5 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center min-h-[200px] text-center"
                  >
                    <div className="w-14 h-14 rounded-full bg-card flex items-center justify-center mb-4">
                      <span className="material-symbols-outlined text-2xl text-primary">lock</span>
                    </div>
                    <h3 className="text-foreground font-semibold text-lg mb-2">Upgrade to Pro</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Free plan allows {maxActiveGoals} active goal{maxActiveGoals === 1 ? '' : 's'}.
                    </p>
                    <button
                      onClick={handleUpgradeToPro}
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-all"
                    >
                      Upgrade to Pro
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={handleRequestAddGoal}
                    data-wt="goals-add-goal"
                    className="glass-surface p-5 rounded-2xl cursor-pointer hover:scale-[1.02] transition-all duration-300 border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center min-h-[200px] text-center group"
                  >
                    <div className="w-14 h-14 rounded-full bg-card flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <span className="material-symbols-outlined text-2xl text-slate-400 group-hover:text-primary transition-colors">add</span>
                    </div>
                    <h3 className="text-foreground font-semibold text-lg mb-2">Start a New Ambition</h3>
                    <p className="text-muted-foreground text-sm">Let AI help you architect your next major life milestone.</p>
                  </div>
                )
              )}
            </div>
          )}
        </main>

        <CheckoutModal
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          planId={checkoutPlanId}
          planLabel="Pro Monthly"
          userId={userProfile?.id}
          onUpgradeActivated={() => setEntitlementsRefreshKey((prev) => prev + 1)}
        />

        {/* Confirmation Modal */}
        {
          confirmAction && (
            <GoalActionConfirmModal
              isOpen={confirmAction.isOpen}
              onClose={() => setConfirmAction(null)}
              onConfirm={() => {
                const { action, goalId } = confirmAction;

                switch (action) {
                  case 'pause':
                    if (onGoalStatusChange) {
                      onGoalStatusChange(goalId, 'paused');
                    }
                    break;
                  case 'abandon':
                    if (onGoalStatusChange) {
                      onGoalStatusChange(goalId, 'abandoned');
                    }
                    break;
                  case 'delete':
                    if (onDeleteGoal) {
                      onDeleteGoal(goalId);
                    }
                    break;
                  case 'delete_events':
                    if (onClearEvents) {
                      onClearEvents(goalId);
                    }
                    break;
                  case 'rebuild_calendar': {
                    const goalToRebuild = goals.find(g => g.id === goalId);
                    if (!goalToRebuild) break;

                    if (onClearEvents) {
                      Promise.resolve(onClearEvents(goalId))
                        .then(() => handleBuildGoalCalendar(goalToRebuild))
                        .catch((err) => logger.error('[GoalLibrary] Failed to rebuild calendar', err));
                    } else {
                      void handleBuildGoalCalendar(goalToRebuild);
                    }
                    break;
                  }
                }
              }}
              action={confirmAction.action}
              goalTitle={confirmAction.goalTitle}
            />
          )
        }

        {/* Goal Completed Celebration Modal */}
        {
          completedGoal && (
            <GoalCompletedModal
              isOpen={!!completedGoal}
              onClose={() => setCompletedGoal(null)}
              goal={completedGoal}
              onViewCompleted={() => {
                setSelectedTab('completed');
                setCompletedGoal(null);
              }}
              onStartNew={handleRequestAddGoal}
            />
          )
        }

        {editDialog && (
          <Dialog
            open={editDialog.isOpen}
            onOpenChange={(open) => {
              if (!open) setEditDialog(null);
            }}
          >
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{editDialog.title}</DialogTitle>
                <DialogDescription className={editDialog.description ? '' : 'sr-only'}>
                  {editDialog.description || 'Edit this field and save your changes.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const trimmed = editValue.trim();
                    if (!trimmed) return;
                    if (trimmed !== editDialog.value) {
                      editDialog.onConfirm(trimmed);
                    }
                    setEditDialog(null);
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {deleteDialog && (
          <Dialog
            open={deleteDialog.isOpen}
            onOpenChange={(open) => {
              if (!open) setDeleteDialog(null);
            }}
          >
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{deleteDialog.title}</DialogTitle>
                <DialogDescription>{deleteDialog.description}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteDialog.onConfirm();
                    setDeleteDialog(null);
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div >
    </div >
  );
};

export default GoalLibrary;
