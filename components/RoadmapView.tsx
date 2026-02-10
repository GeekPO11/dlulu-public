import React, { useState, useCallback } from 'react';
import type {
  Roadmap,
  RoadmapGoal,
  RoadmapPhase,
  RoadmapTask,
  RoadmapSubTask,
  UserProfile
} from '../types';
import { refineRoadmap } from '../services/gemini';
import { logger } from '../lib/logger';

// =============================================================================
// Types
// =============================================================================

interface RoadmapViewProps {
  roadmap: Roadmap;
  userProfile: Partial<UserProfile>;
  onRoadmapUpdate: (roadmap: Roadmap) => void;
  onProceedToSchedule: () => void;
  onBack: () => void;
}

// =============================================================================
// Sub Components (Stitch Styled)
// =============================================================================

// Progress ring for phases (Stitch Style)
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
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          strokeWidth={stroke}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="text-border"
        />
        <circle
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="url(#progressGradient)"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
        {progress}%
      </span>
    </div>
  );
};

// =============================================================================
// SubTask Item Component (Stitch Styled)
// =============================================================================

interface SubTaskItemProps {
  subTask: RoadmapSubTask;
  onToggle: (id: string, completed: boolean) => void;
}

const SubTaskItem: React.FC<SubTaskItemProps> = ({ subTask, onToggle }) => (
  <label
    className={`flex items-center gap-3 p-3 rounded-xl bg-card/60 hover:bg-card cursor-pointer transition-colors ${subTask.isStrikethrough ? 'opacity-50' : ''
      }`}
  >
    <input
      type="checkbox"
      checked={subTask.isCompleted}
      onChange={(e) => onToggle(subTask.id, e.target.checked)}
      disabled={subTask.isStrikethrough}
      className="w-5 h-5 rounded border-border bg-transparent text-primary focus:ring-primary"
    />
    <span className={`text-sm ${subTask.isCompleted
      ? 'text-muted-foreground line-through'
      : subTask.isStrikethrough
        ? 'text-muted-foreground line-through'
        : 'text-foreground'
      }`}>
      {subTask.title}
      {subTask.isManual && (
        <span className="ml-2 text-xs text-primary">(custom)</span>
      )}
    </span>
    {subTask.isCompleted && (
      <span className="material-symbols-outlined text-emerald-400 text-lg ml-auto">check_circle</span>
    )}
  </label>
);

// =============================================================================
// Task Item Component (Stitch Styled)
// =============================================================================

interface TaskItemProps {
  task: RoadmapTask;
  onToggleExpand: () => void;
  onSubTaskToggle: (subTaskId: string, completed: boolean) => void;
  onAddSubTask: (title: string) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggleExpand,
  onSubTaskToggle,
  onAddSubTask
}) => {
  const [newSubTask, setNewSubTask] = useState('');

  const completedCount = task.subTasks.filter(st => st.isCompleted && !st.isStrikethrough).length;
  const totalCount = task.subTasks.filter(st => !st.isStrikethrough).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleAddSubTask = () => {
    if (newSubTask.trim()) {
      onAddSubTask(newSubTask.trim());
      setNewSubTask('');
    }
  };

  return (
    <div className={`relative pl-8 ${task.isStrikethrough ? 'opacity-50' : ''}`}>
      {/* Timeline connector */}
      <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-border" />
      <div className={`absolute left-0 top-4 w-6 h-6 rounded-full flex items-center justify-center ${task.isCompleted
        ? 'bg-emerald-500'
        : 'bg-card border-2 border-border'
        }`}>
        {task.isCompleted ? (
          <span className="material-symbols-outlined text-primary-foreground text-sm">check</span>
        ) : (
          <span className="w-2 h-2 rounded-full bg-muted-foreground" />
        )}
      </div>

      {/* Task Card */}
      <div
        className={`glass-surface rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors ${task.isCompleted ? 'border-emerald-500/30' : ''
          }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className={`font-medium ${task.isStrikethrough
              ? 'text-muted-foreground line-through'
              : 'text-foreground'
              }`}>
              {task.title}
            </div>

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">schedule</span>
                {task.durationDays} days
              </span>
              <span>•</span>
              <span>{task.timesPerWeek}x/week</span>
              {totalCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-primary">{completedCount}/{totalCount} tasks</span>
                </>
              )}
            </div>
          </div>

          {/* Progress & Expand */}
          <div className="flex items-center gap-3">
            {totalCount > 0 && <ProgressRing progress={progress} size={32} stroke={3} />}
            <span className={`material-symbols-outlined text-muted-foreground transition-transform ${task.isExpanded ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </div>
        </div>

        {/* Strikethrough reason */}
        {task.isStrikethrough && task.strikethroughReason && (
          <div className="mt-3 text-xs text-muted-foreground italic bg-card/60 px-3 py-2 rounded-lg">
            Removed: {task.strikethroughReason}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {task.isExpanded && !task.isStrikethrough && (
        <div className="mt-3 space-y-2">
          {task.description && (
            <p className="text-sm text-muted-foreground mb-3 pl-8">
              {task.description}
            </p>
          )}

          {/* Sub-tasks */}
          <div className="space-y-2 pl-8">
            {task.subTasks.map(st => (
              <SubTaskItem
                key={st.id}
                subTask={st}
                onToggle={onSubTaskToggle}
              />
            ))}
          </div>

          {/* Add new sub-task */}
          <div className="flex gap-2 mt-4 pl-8 pt-4 border-t border-border">
            <input
              type="text"
              value={newSubTask}
              onChange={(e) => setNewSubTask(e.target.value)}
              placeholder="Add task or let AI suggest..."
              className="stitch-input flex-1 px-4 py-3 rounded-xl text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleAddSubTask()}
            />
            <button
              onClick={handleAddSubTask}
              disabled={!newSubTask.trim()}
              className="px-4 py-3 bg-brand-gradient glow-button text-primary-foreground text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Phase Item Component (Stitch Styled)
// =============================================================================

interface PhaseItemProps {
  phase: RoadmapPhase;
  phaseIndex: number;
  onToggleExpand: () => void;
  onTaskToggleExpand: (taskId: string) => void;
  onSubTaskToggle: (taskId: string, subTaskId: string, completed: boolean) => void;
  onAddSubTask: (taskId: string, title: string) => void;
}

const PhaseItem: React.FC<PhaseItemProps> = ({
  phase,
  phaseIndex,
  onToggleExpand,
  onTaskToggleExpand,
  onSubTaskToggle,
  onAddSubTask,
}) => {
  const completedTasks = phase.tasks.filter(t => t.isCompleted && !t.isStrikethrough).length;
  const totalTasks = phase.tasks.filter(t => !t.isStrikethrough).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Determine phase status
  const isComplete = progress === 100;
  const isInProgress = progress > 0 && progress < 100;
  const isPending = progress === 0;

  return (
    <div className="relative">
      {/* Timeline connector */}
      <div className="absolute left-[23px] top-14 bottom-0 w-0.5 bg-border" />

      {/* Phase Header */}
      <div
        className={`flex items-center gap-4 p-4 glass-surface rounded-xl cursor-pointer hover:border-primary/50 transition-colors ${isComplete ? 'border-emerald-500/30' : isInProgress ? 'border-primary/50' : ''
          }`}
        onClick={onToggleExpand}
      >
        {/* Phase number indicator */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isComplete
          ? 'bg-emerald-500'
          : isInProgress
            ? 'bg-brand-gradient'
            : 'bg-card border border-border'
          }`}>
          {isComplete ? (
            <span className="material-symbols-outlined text-primary-foreground text-xl">check</span>
          ) : (
            <span className="text-foreground font-bold">{phaseIndex + 1}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground text-lg">
              Phase {phase.phaseNumber}: {phase.title}
            </span>
            <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase ${isComplete
              ? 'bg-emerald-500/20 text-emerald-400'
              : isInProgress
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
              }`}>
              {isComplete ? 'Complete' : isInProgress ? 'In Progress' : 'Pending'}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">calendar_month</span>
              Weeks {phase.startWeek}-{phase.endWeek}
            </span>
            <span>•</span>
            <span>{completedTasks}/{totalTasks} tasks done</span>
          </div>
        </div>

        {/* Progress & Expand */}
        <div className="flex items-center gap-3">
          <ProgressRing progress={progress} size={44} stroke={3} />
          <span className={`material-symbols-outlined text-muted-foreground transition-transform ${phase.isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {phase.isExpanded && (
        <div className="mt-4 ml-6 space-y-4">
          {/* Description & Coach Advice */}
          {(phase.description || phase.coachAdvice) && (
            <div className="glass-surface rounded-xl p-4 ml-8">
              {phase.description && (
                <p className="text-sm text-muted-foreground">
                  {phase.description}
                </p>
              )}
              {phase.coachAdvice && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary mb-2">
                    <span className="material-symbols-outlined text-sm">lightbulb</span>
                    Coach Tip
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {phase.coachAdvice}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tasks */}
          {phase.tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggleExpand={() => onTaskToggleExpand(task.id)}
              onSubTaskToggle={(stId, completed) => onSubTaskToggle(task.id, stId, completed)}
              onAddSubTask={(title) => onAddSubTask(task.id, title)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Goal Item Component (Stitch Styled)
// =============================================================================

interface GoalItemProps {
  goal: RoadmapGoal;
  onToggleExpand: () => void;
  onPhaseToggleExpand: (phaseId: string) => void;
  onTaskToggleExpand: (phaseId: string, taskId: string) => void;
  onSubTaskToggle: (phaseId: string, taskId: string, subTaskId: string, completed: boolean) => void;
  onAddSubTask: (phaseId: string, taskId: string, title: string) => void;
}

const GoalItem: React.FC<GoalItemProps> = ({
  goal,
  onToggleExpand,
  onPhaseToggleExpand,
  onTaskToggleExpand,
  onSubTaskToggle,
  onAddSubTask,
}) => {
  const categoryColors: Record<string, { bg: string; text: string; icon: string }> = {
    health: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: 'favorite' },
    fitness: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: 'directions_run' },
    career: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: 'work' },
    learning: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: 'school' },
    personal: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: 'person' },
    financial: { bg: 'bg-green-500/20', text: 'text-green-400', icon: 'attach_money' },
    business: { bg: 'bg-primary/20', text: 'text-primary', icon: 'trending_up' },
    relationships: { bg: 'bg-pink-500/20', text: 'text-pink-400', icon: 'people' },
  };

  const category = categoryColors[goal.category] || { bg: 'bg-muted', text: 'text-muted-foreground', icon: 'flag' };

  const totalTasks = goal.phases.reduce((acc, p) => acc + p.tasks.filter(t => !t.isStrikethrough).length, 0);
  const completedTasks = goal.phases.reduce((acc, p) => acc + p.tasks.filter(t => t.isCompleted && !t.isStrikethrough).length, 0);
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="glass-surface rounded-2xl overflow-hidden">
      {/* Goal Header */}
      <div
        className="flex items-center gap-4 p-5 cursor-pointer hover:bg-muted transition-colors"
        onClick={onToggleExpand}
      >
        {/* Category Icon */}
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${category.bg}`}>
          <span className={`material-symbols-outlined text-xl ${category.text}`}>{category.icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded capitalize ${category.bg} ${category.text}`}>
              {goal.category}
            </span>
          </div>
          <h3 className="font-semibold text-xl text-foreground">
            {goal.goalTitle}
          </h3>

          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">schedule</span>
              {goal.totalDays} days
            </span>
            <span>•</span>
            <span>{goal.sessionsPerWeek}x/week, {goal.minutesPerSession} min</span>
            <span>•</span>
            <span>{goal.phases.length} phases</span>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4">
          <ProgressRing progress={progress} size={56} stroke={4} />
          <span className={`material-symbols-outlined text-muted-foreground text-2xl transition-transform ${goal.isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {goal.isExpanded && (
        <div className="border-t border-border p-5 space-y-6">
          {goal.phases.map((phase, idx) => (
            <PhaseItem
              key={phase.phaseId}
              phase={phase}
              phaseIndex={idx}
              onToggleExpand={() => onPhaseToggleExpand(phase.phaseId)}
              onTaskToggleExpand={(taskId) => onTaskToggleExpand(phase.phaseId, taskId)}
              onSubTaskToggle={(taskId, stId, completed) => onSubTaskToggle(phase.phaseId, taskId, stId, completed)}
              onAddSubTask={(taskId, title) => onAddSubTask(phase.phaseId, taskId, title)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Main Component (Stitch Styled)
// =============================================================================

const RoadmapView: React.FC<RoadmapViewProps> = ({
  roadmap,
  userProfile,
  onRoadmapUpdate,
  onProceedToSchedule,
  onBack,
}) => {
  const [isRefiningAll, setIsRefiningAll] = useState(false);
  const [globalRefineInput, setGlobalRefineInput] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'refine'>('overview');

  // Toggle expansion handlers
  const handleGoalToggle = (goalId: string) => {
    const updated = {
      ...roadmap,
      goals: roadmap.goals.map(g =>
        g.goalId === goalId ? { ...g, isExpanded: !g.isExpanded } : g
      ),
    };
    onRoadmapUpdate(updated);
  };

  const handlePhaseToggle = (goalId: string, phaseId: string) => {
    const updated = {
      ...roadmap,
      goals: roadmap.goals.map(g =>
        g.goalId === goalId
          ? {
            ...g,
            phases: g.phases.map(p =>
              p.phaseId === phaseId ? { ...p, isExpanded: !p.isExpanded } : p
            ),
          }
          : g
      ),
    };
    onRoadmapUpdate(updated);
  };

  const handleTaskToggle = (goalId: string, phaseId: string, taskId: string) => {
    const updated = {
      ...roadmap,
      goals: roadmap.goals.map(g =>
        g.goalId === goalId
          ? {
            ...g,
            phases: g.phases.map(p =>
              p.phaseId === phaseId
                ? {
                  ...p,
                  tasks: p.tasks.map(t =>
                    t.id === taskId ? { ...t, isExpanded: !t.isExpanded } : t
                  ),
                }
                : p
            ),
          }
          : g
      ),
    };
    onRoadmapUpdate(updated);
  };

  // SubTask toggle
  const handleSubTaskToggle = (
    goalId: string,
    phaseId: string,
    taskId: string,
    subTaskId: string,
    completed: boolean
  ) => {
    const updated = {
      ...roadmap,
      updatedAt: new Date(),
      goals: roadmap.goals.map(g =>
        g.goalId === goalId
          ? {
            ...g,
            phases: g.phases.map(p =>
              p.phaseId === phaseId
                ? {
                  ...p,
                  tasks: p.tasks.map(t =>
                    t.id === taskId
                      ? {
                        ...t,
                        subTasks: t.subTasks.map(st =>
                          st.id === subTaskId
                            ? {
                              ...st,
                              isCompleted: completed,
                              completedAt: completed ? new Date() : undefined,
                            }
                            : st
                        ),
                      }
                      : t
                  ),
                }
                : p
            ),
          }
          : g
      ),
    };
    onRoadmapUpdate(updated);
  };

  // Add manual sub-task
  const handleAddSubTask = (goalId: string, phaseId: string, taskId: string, title: string) => {
    const newSubTask: RoadmapSubTask = {
      id: `manual-${Date.now()}`,
      taskId,
      title,
      isCompleted: false,
      isManual: true,
      isStrikethrough: false,
      order: 999,
    };

    const updated = {
      ...roadmap,
      updatedAt: new Date(),
      goals: roadmap.goals.map(g =>
        g.goalId === goalId
          ? {
            ...g,
            phases: g.phases.map(p =>
              p.phaseId === phaseId
                ? {
                  ...p,
                  tasks: p.tasks.map(t =>
                    t.id === taskId
                      ? { ...t, subTasks: [...t.subTasks, newSubTask] }
                      : t
                  ),
                }
                : p
            ),
          }
          : g
      ),
    };
    onRoadmapUpdate(updated);
  };

  // Global refinement
  const handleGlobalRefine = async () => {
    if (!globalRefineInput.trim()) return;

    setIsRefiningAll(true);
    try {
      const response = await refineRoadmap({
        currentRoadmap: roadmap,
        userProfile: {
          role: userProfile.role || '',
          roleContext: userProfile.roleContext,
          bio: userProfile.bio,
          chronotype: userProfile.chronotype || 'flexible',
          energyLevel: userProfile.energyLevel || 'balanced',
        },
        userRequest: globalRefineInput,
      });

      onRoadmapUpdate(response.updatedRoadmap);
      setGlobalRefineInput('');
    } catch (error) {
      logger.error('Global refinement failed', error);
    } finally {
      setIsRefiningAll(false);
    }
  };

  // Calculate overall stats
  const safeGoals = roadmap?.goals || [];
  const totalTasks = safeGoals.reduce((acc, g) => {
    const safePhases = g?.phases || [];
    return acc + safePhases.reduce((a, p) => {
      const safeTasks = p?.tasks || [];
      return a + safeTasks.filter(t => t && !t.isStrikethrough).length;
    }, 0);
  }, 0);
  const completedTasks = safeGoals.reduce((acc, g) => {
    const safePhases = g?.phases || [];
    return acc + safePhases.reduce((a, p) => {
      const safeTasks = p?.tasks || [];
      return a + safeTasks.filter(t => t && t.isCompleted && !t.isStrikethrough).length;
    }, 0);
  }, 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="glass-nav sticky top-0 z-40 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          {/* Top bar */}
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="material-symbols-outlined">arrow_back</span>
              Back
            </button>

            <div className="flex-1">
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-1">Active Project</p>
              <h1 className="text-2xl font-bold text-foreground">
                Your Roadmap
              </h1>
            </div>

            <button 
              onClick={() => {
                alert('Roadmap Settings\n\nCustomize your roadmap view (coming soon)!\n\n• Adjust timeline scale\n• Set work intensity levels\n• Configure display preferences\n• Export roadmap as PDF\n\nFor now, use the chat to modify your roadmap.');
              }}
              className="px-4 py-2 bg-card border border-border rounded-xl text-foreground text-sm font-medium hover:bg-card/80 transition-colors flex items-center gap-2"
              title="Roadmap settings (coming soon)"
            >
              <span className="material-symbols-outlined text-lg">settings</span>
              Global Settings
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${activeTab === 'overview'
                ? 'bg-card text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('refine')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 ${activeTab === 'refine'
                ? 'bg-card text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Refine with AI
            </button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="glass-surface rounded-2xl p-5 flex items-center gap-8">
          <div className="flex items-center gap-4">
            <ProgressRing progress={overallProgress} size={64} stroke={5} />
            <div>
              <div className="text-sm text-primary font-medium">{overallProgress}% Complete</div>
              <div className="text-xs text-muted-foreground">Overall Progress</div>
            </div>
          </div>

          <div className="h-10 w-px bg-border" />

          <div>
            <div className="text-lg font-semibold text-foreground">{safeGoals.length} Ambitions</div>
            <div className="text-xs text-muted-foreground">{safeGoals.reduce((a, g) => a + (g?.phases?.length || 0), 0)} phases total</div>
          </div>

          <div className="h-10 w-px bg-border" />

          <div>
            <div className="text-lg font-semibold text-foreground">{completedTasks}/{totalTasks} Tasks</div>
            <div className="text-xs text-muted-foreground">{roadmap.totalWeeks} weeks timeline</div>
          </div>
        </div>

        {/* Refine Input (when tab active) */}
        {activeTab === 'refine' && (
          <div className="glass-surface rounded-2xl p-5 mt-6">
            <p className="text-sm text-muted-foreground mb-4">
              Ask AI to adjust your roadmap (e.g., "Make the first phase more detailed", "Add more tasks for learning")
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={globalRefineInput}
                onChange={(e) => setGlobalRefineInput(e.target.value)}
                placeholder="What would you like to change?"
                className="stitch-input flex-1 px-4 py-3 rounded-xl"
                onKeyDown={(e) => e.key === 'Enter' && handleGlobalRefine()}
                disabled={isRefiningAll}
              />
              <button
                onClick={handleGlobalRefine}
                disabled={!globalRefineInput.trim() || isRefiningAll}
                className="px-6 py-3 bg-brand-gradient glow-button text-primary-foreground rounded-xl font-semibold disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isRefiningAll ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                    Refining...
                  </>
                ) : (
                  'Apply Changes'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Goals Content */}
      <div className="max-w-5xl mx-auto px-6 pb-32 space-y-6">
        {safeGoals.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No ambitions found. Please go back and try again.</p>
          </div>
        )}
        {safeGoals.map(goal => goal && (
          <GoalItem
            key={goal.goalId}
            goal={goal}
            onToggleExpand={() => handleGoalToggle(goal.goalId)}
            onPhaseToggleExpand={(phaseId) => handlePhaseToggle(goal.goalId, phaseId)}
            onTaskToggleExpand={(phaseId, taskId) => handleTaskToggle(goal.goalId, phaseId, taskId)}
            onSubTaskToggle={(phaseId, taskId, stId, completed) =>
              handleSubTaskToggle(goal.goalId, phaseId, taskId, stId, completed)
            }
            onAddSubTask={(phaseId, taskId, title) =>
              handleAddSubTask(goal.goalId, phaseId, taskId, title)
            }
          />
        ))}
      </div>

      {/* Fixed CTA Button */}
      <div className="fixed bottom-0 left-0 right-0 glass-nav px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onProceedToSchedule}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-brand-gradient glow-button text-primary-foreground rounded-xl font-semibold text-lg hover:scale-[1.02] transition-transform"
          >
            Save and Continue
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoadmapView;
