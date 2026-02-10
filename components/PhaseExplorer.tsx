import React, { useState, useMemo, useEffect } from 'react';
import type { Goal, Phase, Milestone, Task, SubTask } from '../types';

const PhaseExplorer: React.FC<{
    goal: Goal;
    onMilestoneToggle?: (goalId: string, phaseId: string, milestoneId: string, completed: boolean, notes?: string) => void;
    onSubTaskToggle?: (goalId: string, phaseId: string, milestoneId: string, subTaskId: string, completed: boolean) => void;
    onTaskToggle?: (taskId: string, completed: boolean) => void;
    onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
    onPhaseUpdate?: (phaseId: string, updates: Partial<Phase>) => void;
    onMilestoneUpdate?: (milestoneId: string, updates: Partial<Milestone>) => void;
    onSubTaskUpdate?: (subtaskId: string, updates: Partial<SubTask>) => void;
    onAddPhase?: (goalId: string, phase: Partial<Phase>) => void;
    onAddMilestone?: (goalId: string, phaseId: string, milestone: Partial<Milestone>) => void;
    onAddTask?: (goalId: string, phaseId: string, milestoneId: string, title: string) => void;
    onAddSubTask?: (taskId: string, title: string) => void;
    onBeginSession?: (taskId: string) => void;
    readOnly?: boolean;
}> = ({ goal, onMilestoneToggle, onSubTaskToggle, onTaskToggle, onTaskUpdate, onPhaseUpdate, onMilestoneUpdate, onSubTaskUpdate, onAddPhase, onAddMilestone, onAddTask, onAddSubTask, onBeginSession, readOnly = false }) => {
	    const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
	    const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
	    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	    const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'done'>('all');
	    const [taskSort, setTaskSort] = useState<'order' | 'title'>('order');
	    const [taskNotesDraft, setTaskNotesDraft] = useState('');
	    const [isEditingTaskNotes, setIsEditingTaskNotes] = useState(false);
	    const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
	    const [isAddingSubTask, setIsAddingSubTask] = useState(false);
	    const [newItemTitle, setNewItemTitle] = useState('');
	    const [addingItemType, setAddingItemType] = useState<'phase' | 'milestone' | 'task' | null>(null);
	    const [newTaskSubTasksText, setNewTaskSubTasksText] = useState('');
	    const [pendingTaskCreate, setPendingTaskCreate] = useState<{
	        phaseId: string;
	        milestoneId: string;
	        previousTaskIds: string[];
	        subTaskTitles: string[];
	    } | null>(null);
	    const [editingItem, setEditingItem] = useState<{
	        type: 'phase' | 'milestone' | 'task' | 'subtask';
	        id: string;
	    } | null>(null);
	    const [editingTitle, setEditingTitle] = useState('');
	    const [editingDescription, setEditingDescription] = useState('');
	    const isReadOnly = readOnly;
	    const togglePhaseSelection = (phaseId: string) => {
	        setSelectedPhaseId(prev => (prev === phaseId ? null : phaseId));
	        setSelectedMilestoneId(null);
	        setSelectedTaskId(null);
	    };

	    const toggleMilestoneSelection = (milestoneId: string) => {
	        setSelectedMilestoneId(prev => (prev === milestoneId ? null : milestoneId));
	        setSelectedTaskId(null);
	    };

	    const toggleTaskSelection = (taskId: string) => {
	        setSelectedTaskId(prev => (prev === taskId ? null : taskId));
	    };

	    const cancelEdit = () => {
	        setEditingItem(null);
	        setEditingTitle('');
	        setEditingDescription('');
	    };

	    const saveEdit = () => {
	        if (isReadOnly) return;
	        if (!editingItem) return;
	        const title = editingTitle.trim();
	        if (!title) return;
	        const description = editingDescription.trim();

	        if (editingItem.type === 'phase') {
	            onPhaseUpdate?.(editingItem.id, { title, description });
	        } else if (editingItem.type === 'milestone') {
	            onMilestoneUpdate?.(editingItem.id, { title, description });
	        } else if (editingItem.type === 'task') {
	            onTaskUpdate?.(editingItem.id, { title, description });
	            setTaskNotesDraft(description);
	            setIsEditingTaskNotes(false);
	        } else if (editingItem.type === 'subtask') {
	            onSubTaskUpdate?.(editingItem.id, { title, description });
	        }

	        cancelEdit();
	    };

	    const parseSubTaskTitles = (raw: string) => {
	        const lines = raw
	            .split('\n')
	            .map((line) => line.trim())
	            .filter(Boolean);
	        return Array.from(new Set(lines));
	    };

    // Handle adding a new subtask (requires a task to be selected)
    const handleAddSubTask = () => {
        if (isReadOnly) return;
        if (!newSubTaskTitle.trim() || !selectedTaskId) return;
        if (onAddSubTask) {
            onAddSubTask(selectedTaskId, newSubTaskTitle.trim());
            setNewSubTaskTitle('');
            setIsAddingSubTask(false);
        }
    };

    // Handle adding new phase
    const handleAddPhase = () => {
        if (isReadOnly) return;
        if (!newItemTitle.trim()) return;
        if (onAddPhase) {
            const phaseNumber = goal.phases.length + 1;
            onAddPhase(goal.id, {
                title: newItemTitle.trim(),
                description: '',
                number: phaseNumber,
                milestones: [],
            });
            setNewItemTitle('');
            setAddingItemType(null);
        }
    };

    // Handle adding new milestone
    const handleAddMilestone = () => {
        if (isReadOnly) return;
        if (!newItemTitle.trim() || !selectedPhaseId) return;
        if (onAddMilestone) {
            onAddMilestone(goal.id, selectedPhaseId, {
                title: newItemTitle.trim(),
                description: '',
                isCompleted: false,
                tasks: [],
            });
            setNewItemTitle('');
            setAddingItemType(null);
        }
    };

    // Handle adding new task
    const handleAddTask = () => {
        if (isReadOnly) return;
        if (!newItemTitle.trim() || !selectedPhaseId || !selectedMilestoneId) return;
        if (onAddTask) {
            const title = newItemTitle.trim();
            const subTaskTitles = parseSubTaskTitles(newTaskSubTasksText);
            const previousTaskIds = (selectedMilestone?.tasks || []).map(t => t.id);

            setPendingTaskCreate({
                phaseId: selectedPhaseId,
                milestoneId: selectedMilestoneId,
                previousTaskIds,
                subTaskTitles,
            });

            onAddTask(goal.id, selectedPhaseId, selectedMilestoneId, title);
            setNewItemTitle('');
            setNewTaskSubTasksText('');
            setAddingItemType(null);
        }
    };

    // Sort phases by number for vertical path
	    const phases = useMemo(() => {
	        return [...goal.phases].sort((a, b) => a.number - b.number);
	    }, [goal.phases]);

	    const selectedPhase = phases.find(p => p.id === selectedPhaseId);
	    const milestones = useMemo(() => {
	        if (!selectedPhase) return [];
	        return [...selectedPhase.milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	    }, [selectedPhase]);

	    const selectedMilestone = milestones.find(m => m.id === selectedMilestoneId);

	    const sortedTasks = useMemo(() => {
	        if (!selectedMilestone) return [];
	        const base = (selectedMilestone.tasks || []).filter(task => !task.isStrikethrough);
	        const tasksByOrder = [...base].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	        if (taskSort === 'title') {
	            return tasksByOrder.sort((a, b) => a.title.localeCompare(b.title));
	        }
	        return tasksByOrder;
	    }, [selectedMilestone, taskSort]);

	    const visibleTasks = useMemo(() => {
	        if (taskFilter === 'done') return sortedTasks.filter(t => t.isCompleted);
	        if (taskFilter === 'open') return sortedTasks.filter(t => !t.isCompleted);
	        return sortedTasks;
	    }, [sortedTasks, taskFilter]);

	    const selectedTask = sortedTasks.find(t => t.id === selectedTaskId);

	    const selectedMilestoneTaskStats = useMemo(() => {
	        const total = sortedTasks.length;
	        const completed = sortedTasks.filter(t => t.isCompleted).length;
	        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	        return { total, completed, pct };
	    }, [sortedTasks]);

	    const selectedTaskSubTaskStats = useMemo(() => {
	        if (!selectedTask) return { total: 0, completed: 0, pct: 0 };
	        const subTasks = (selectedTask.subTasks || []).filter(st => !st.isStrikethrough);
	        const total = subTasks.length;
	        const completed = subTasks.filter(st => st.isCompleted).length;
	        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	        return { total, completed, pct };
	    }, [selectedTask]);

	    useEffect(() => {
	        if (!selectedTask) {
	            setTaskNotesDraft('');
	            setIsEditingTaskNotes(false);
	            return;
	        }
	        setTaskNotesDraft(selectedTask.description || '');
	        setIsEditingTaskNotes(false);
	    }, [selectedTask?.id]);

    // Helper to check if a phase is completed (all milestones done)
    const isPhaseCompleted = (phase: Phase) => {
        const total = phase.milestones.length;
        const completed = phase.milestones.filter(m => m.isCompleted).length;
        return total > 0 && completed === total;
    };

    // Helper to determine if a phase is the current active one
    // A phase is active if: it's not completed AND all previous phases are completed
    const isPhaseActive = (phase: Phase, phaseIndex: number) => {
        // Check if this phase is completed
        if (isPhaseCompleted(phase)) return false;

        // Phase 1 (index 0) is active if not completed
        if (phaseIndex === 0) return true;

        // For later phases: active only if ALL previous phases are completed
        const previousPhases = phases.slice(0, phaseIndex);
        return previousPhases.every(p => isPhaseCompleted(p));
    };

	    // Ensure selections stay valid without auto-expanding by default
	    useEffect(() => {
	        if (phases.length === 0) {
	            setSelectedPhaseId(null);
	            return;
	        }
	        setSelectedPhaseId(prev => (prev && phases.some(p => p.id === prev)) ? prev : null);
	    }, [phases]);

	    useEffect(() => {
	        if (!selectedPhase) {
	            setSelectedMilestoneId(null);
	            setSelectedTaskId(null);
	            return;
	        }
	        setSelectedMilestoneId(prev => (prev && milestones.some(m => m.id === prev)) ? prev : null);
	    }, [milestones, selectedPhase]);

		    useEffect(() => {
		        if (!selectedMilestone) {
		            setSelectedTaskId(null);
		            return;
		        }
		        setSelectedTaskId(prev => (prev && visibleTasks.some(t => t.id === prev)) ? prev : null);
		    }, [selectedMilestone, visibleTasks]);

		    // After creating a task, optionally create its subtasks and open it.
		    useEffect(() => {
		        if (!pendingTaskCreate) return;

		        const phase = goal.phases.find(p => p.id === pendingTaskCreate.phaseId);
		        const milestone = phase?.milestones?.find(m => m.id === pendingTaskCreate.milestoneId);
		        if (!milestone) return;

		        const tasksNow = (milestone.tasks || []).filter(t => !t.isStrikethrough);
		        const createdTask = tasksNow.find(t => !pendingTaskCreate.previousTaskIds.includes(t.id));
		        if (!createdTask) return;

		        setSelectedPhaseId(pendingTaskCreate.phaseId);
		        setSelectedMilestoneId(pendingTaskCreate.milestoneId);
		        setSelectedTaskId(createdTask.id);
		        setNewSubTaskTitle('');

		        if (onAddSubTask && pendingTaskCreate.subTaskTitles.length > 0) {
		            pendingTaskCreate.subTaskTitles.forEach((title) => onAddSubTask(createdTask.id, title));
		            setIsAddingSubTask(false);
		        } else if (onAddSubTask) {
		            setIsAddingSubTask(true);
		        }

		        setPendingTaskCreate(null);
		    }, [goal.phases, onAddSubTask, pendingTaskCreate]);

	    // Phase selection effect (debug logging removed for production)

    // Helper to determine status color
    const getStatusConfig = (phase: Phase, phaseIndex: number) => {
        const completed = isPhaseCompleted(phase);
        const active = isPhaseActive(phase, phaseIndex);

        if (completed) {
            return {
                bg: 'bg-green-500/10',
                border: 'border-green-500',
                text: 'text-green-500',
                indicator: 'bg-green-500 text-white',
                label: 'Completed',
                showNumber: true
            };
        }
        if (active) {
            return {
                bg: 'bg-primary/10',
                border: 'border-primary',
                text: 'text-primary',
                indicator: 'bg-primary text-primary-foreground',
                label: 'Active',
                showNumber: true
            };
        }
        return {
            bg: 'bg-foreground/5',
            border: 'border-foreground/10',
            text: 'text-foreground/30',
            indicator: 'bg-foreground/10 text-foreground/30',
            label: 'Upcoming',
            showNumber: true
        };
    };

	    const handleToggleMilestone = (milestone: Milestone) => {
	        if (isReadOnly || !onMilestoneToggle || !selectedPhase) return;

	        const willComplete = !milestone.isCompleted;
	        onMilestoneToggle(goal.id, selectedPhase.id, milestone.id, willComplete);
	    };

	    const handleToggleTask = (task: Task) => {
	        if (isReadOnly || !onTaskToggle) return;

	        const willComplete = !task.isCompleted;
	        onTaskToggle(task.id, willComplete);
	    };

    const taskFilterLabel = taskFilter === 'open' ? 'Open' : taskFilter === 'done' ? 'Done' : 'All';
    const taskSortLabel = taskSort === 'order' ? 'Order' : 'Title';

    // Fluid nested timeline (phase → milestone → task → subtasks)
    return (
        <div className="pb-32">
            <div className="mb-8">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/35">Execution</p>
                <h2 className="text-2xl font-black text-foreground">Timeline</h2>
                <p className="text-sm text-foreground/45 mt-1">Expand down the chain and execute inside the flow.</p>
            </div>

            <div className="relative">
                {/* Main spine */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-foreground/10" />

                <div className="space-y-7">
                    {phases.map((phase, phaseIdx) => {
                        const status = getStatusConfig(phase, phaseIdx);
                        const isExpanded = selectedPhaseId === phase.id;
                        const phaseMilestones = [...phase.milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                        const totalMilestones = phaseMilestones.length;
                        const completedMilestones = phaseMilestones.filter(m => m.isCompleted).length;
                        const phasePct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

                        const nodeClasses = isExpanded
                            ? 'bg-primary border-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.35)]'
                            : status.label === 'Completed'
                                ? 'bg-green-500/20 border-green-500 text-green-200'
                                : 'bg-background border-foreground/15 text-foreground/60 hover:border-foreground/25';

                        return (
                            <div key={phase.id} className="relative">
                                {/* Phase node */}
                                <button
                                    onClick={() => togglePhaseSelection(phase.id)}
                                    className={`absolute left-0 top-6 size-12 rounded-full border-2 flex items-center justify-center font-black transition-all ${nodeClasses}`}
                                    aria-label={`Select Phase ${phase.number}`}
                                >
                                    {phase.number}
                                </button>

                                {/* Phase card */}
                                <div className="ml-16">
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => togglePhaseSelection(phase.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                togglePhaseSelection(phase.id);
                                            }
                                        }}
                                        className={`w-full text-left rounded-2xl border overflow-hidden transition-all glass-panel bg-muted/50
                                            ${isExpanded ? 'border-primary/35 shadow-[0_0_30px_hsl(var(--primary)/0.12)]' : 'border-foreground/5 hover:border-foreground/10 hover:bg-muted/60 dark:hover:bg-black/20'}
                                        `}
                                    >
	                                            <div className="px-5 py-3 flex items-center justify-between border-b border-foreground/5 bg-muted/60 dark:bg-black/20">
	                                            <span className={`text-[10px] font-black uppercase tracking-[0.35em] ${isExpanded ? 'text-primary' : 'text-foreground/40'}`}>
	                                                Phase {phase.number}
	                                            </span>
	                                            <div className="flex items-center gap-2">
	                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${status.indicator}`}>
	                                                    {status.label}
	                                                </span>
	                                                {!isReadOnly && onPhaseUpdate && (
	                                                    <button
	                                                        type="button"
	                                                        onClick={(e) => {
	                                                            e.stopPropagation();
	                                                            setSelectedPhaseId(phase.id);
	                                                            setEditingItem({ type: 'phase', id: phase.id });
	                                                            setEditingTitle(phase.title);
	                                                            setEditingDescription(phase.description || '');
	                                                        }}
	                                                        className="size-8 rounded-xl bg-muted/60 dark:bg-black/20 hover:bg-muted/70 dark:hover:bg-black/30 border border-foreground/10 text-foreground/70 flex items-center justify-center transition-all"
	                                                        aria-label="Edit phase"
	                                                    >
	                                                        <span className="material-symbols-outlined text-[18px]">edit</span>
	                                                    </button>
	                                                )}
	                                                <span className="material-symbols-outlined text-foreground/40">
	                                                    {isExpanded ? 'expand_less' : 'expand_more'}
	                                                </span>
	                                            </div>
	                                        </div>

	                                        <div className="p-6">
	                                            <h3 className="text-xl font-black text-foreground leading-tight">{phase.title}</h3>
	                                            <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
	                                                {phase.description || '—'}
	                                            </p>

                                            <div className="mt-4 flex items-center justify-between text-xs text-foreground/40">
                                                <span>{completedMilestones}/{totalMilestones} milestones</span>
                                                <span>{phasePct}%</span>
                                            </div>
                                            <div className="mt-2 h-2 rounded-full bg-foreground/5 overflow-hidden">
                                                <div className="h-full bg-primary transition-all" style={{ width: `${phasePct}%` }} />
                                            </div>
	                                        </div>
	                                    </div>

	                                    {!isReadOnly && onPhaseUpdate && editingItem?.type === 'phase' && editingItem.id === phase.id && (
	                                        <div className="mt-3 rounded-2xl border border-foreground/5 bg-foreground/[0.02] p-5">
	                                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/40">Edit Phase</p>
	                                            <div className="mt-3 space-y-2">
	                                                <input
	                                                    type="text"
	                                                    value={editingTitle}
	                                                    onChange={(e) => setEditingTitle(e.target.value)}
	                                                    placeholder="Phase title…"
	                                                    className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
	                                                />
	                                                <textarea
	                                                    value={editingDescription}
	                                                    onChange={(e) => setEditingDescription(e.target.value)}
	                                                    placeholder="Phase description…"
	                                                    rows={3}
	                                                    className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none"
	                                                />
	                                            </div>
	                                            <div className="mt-3 flex justify-end gap-2">
	                                                <button
	                                                    type="button"
	                                                    onClick={saveEdit}
	                                                    disabled={!editingTitle.trim()}
	                                                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold transition-all"
	                                                >
	                                                    Save
	                                                </button>
	                                                <button
	                                                    type="button"
	                                                    onClick={cancelEdit}
	                                                    className="px-3 py-2 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm transition-all"
	                                                >
	                                                    Cancel
	                                                </button>
	                                            </div>
	                                        </div>
	                                    )}

	                                    {/* Expanded: Milestones */}
	                                    <div className={`mt-4 overflow-hidden transition-all duration-500 ${isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
	                                        <div className="relative pl-10">
	                                            {/* Milestone spine */}
	                                            <div className="absolute left-3 top-0 bottom-0 w-px bg-foreground/10" />

                                            <div className="space-y-4">
                                                {phaseMilestones.length === 0 ? (
                                                    <div className="ml-6 glass-panel rounded-2xl border border-foreground/5 bg-muted/40 p-6 text-center text-foreground/40">
                                                        <p className="text-sm">No milestones yet.</p>
                                                    </div>
                                                ) : (
                                                    phaseMilestones.map((milestone, mIdx) => {
                                                        const isMilestoneSelected = isExpanded && selectedMilestoneId === milestone.id;
                                                        const milestoneTasks = (milestone.tasks || []).filter(t => !t.isStrikethrough);
                                                        const totalTasks = milestoneTasks.length;
                                                        const completedTasks = milestoneTasks.filter(t => t.isCompleted).length;
                                                        const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                                                        return (
                                                            <div key={milestone.id} className="relative">
                                                                <div className={`absolute left-0 top-6 size-3 rounded-full border
                                                                    ${isMilestoneSelected ? 'bg-primary border-primary' : milestone.isCompleted ? 'bg-green-500/40 border-green-500/60' : 'bg-foreground/10 border-foreground/20'}
                                                                `} />

                                                                <div className="ml-6">
                                                                    <div
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        onClick={() => toggleMilestoneSelection(milestone.id)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                                e.preventDefault();
                                                                                toggleMilestoneSelection(milestone.id);
                                                                            }
                                                                        }}
                                                                        className={`w-full text-left rounded-2xl border overflow-hidden transition-all
                                                                            ${isMilestoneSelected ? 'border-primary/40 bg-primary/10 shadow-[0_0_24px_hsl(var(--primary)/0.12)]' : 'border-foreground/5 bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/10'}
                                                                        `}
                                                                    >
                                                                        <div className={`px-5 py-3 flex items-center justify-between
                                                                            ${isMilestoneSelected ? 'bg-gradient-to-r from-primary/70 via-primary/35 to-chart-3/10 border-b border-primary/25' : 'bg-muted/60 dark:bg-black/20 border-b border-foreground/5'}
                                                                        `}>
                                                                            <span className="text-[10px] font-black uppercase tracking-[0.35em] text-primary">
                                                                                Milestone {mIdx + 1}
                                                                            </span>
	                                                                            <div className="flex items-center gap-2">
	                                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider
	                                                                                    ${milestone.isCompleted ? 'bg-green-500 text-white' : isMilestoneSelected ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground/40'}
	                                                                                `}>
	                                                                                    {milestone.isCompleted ? 'Done' : isMilestoneSelected ? 'Active' : 'Open'}
	                                                                                </span>
	                                                                                {!isReadOnly && onMilestoneUpdate && (
	                                                                                    <button
	                                                                                        type="button"
	                                                                                        onClick={(e) => {
	                                                                                            e.stopPropagation();
	                                                                                            setSelectedPhaseId(phase.id);
	                                                                                            setSelectedMilestoneId(milestone.id);
	                                                                                            setEditingItem({ type: 'milestone', id: milestone.id });
	                                                                                            setEditingTitle(milestone.title);
	                                                                                            setEditingDescription(milestone.description || '');
	                                                                                        }}
	                                                                                        className="size-8 rounded-xl bg-muted/60 dark:bg-black/20 hover:bg-muted/70 dark:hover:bg-black/30 border border-foreground/10 text-foreground/70 flex items-center justify-center transition-all"
	                                                                                        aria-label="Edit milestone"
	                                                                                    >
	                                                                                        <span className="material-symbols-outlined text-[18px]">edit</span>
	                                                                                    </button>
	                                                                                )}
	                                                                                <span className="material-symbols-outlined text-foreground/40">
	                                                                                    {isMilestoneSelected ? 'expand_less' : 'expand_more'}
	                                                                                </span>
	                                                                            </div>
	                                                                        </div>

                                                                        <div className="p-6">
                                                                            <div className="flex items-start gap-3">
                                                                                {!isReadOnly ? (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleToggleMilestone(milestone);
                                                                                        }}
                                                                                        className={`mt-0.5 size-6 rounded-lg border transition-all flex items-center justify-center shrink-0
                                                                                            ${milestone.isCompleted ? 'bg-green-500 border-green-500 text-foreground' : 'border-foreground/20 text-transparent hover:border-primary'}
                                                                                        `}
                                                                                        aria-label={milestone.isCompleted ? 'Reopen milestone' : 'Complete milestone'}
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-sm font-bold">check</span>
                                                                                    </button>
                                                                                ) : (
                                                                                    <div className="mt-0.5 size-6 shrink-0" aria-hidden="true" />
                                                                                )}

                                                                                <div className="min-w-0 flex-1">
                                                                                    <h4 className={`text-lg font-black leading-tight ${milestone.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground'}`}>
                                                                                        {milestone.title}
                                                                                    </h4>
                                                                                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">
                                                                                        {milestone.description || 'Complete this milestone to progress.'}
                                                                                    </p>

                                                                                    <div className="mt-4 flex items-center justify-between text-xs text-foreground/40">
                                                                                        <span>{completedTasks}/{totalTasks} tasks</span>
                                                                                        <span>{totalTasks > 0 ? `${pct}%` : '—'}</span>
                                                                                    </div>
                                                                                    <div className="mt-2 h-2 rounded-full bg-foreground/5 overflow-hidden">
                                                                                        <div className="h-full bg-primary/90 transition-all" style={{ width: `${pct}%` }} />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
	                                                                    </div>

	                                                                    {!isReadOnly && onMilestoneUpdate && editingItem?.type === 'milestone' && editingItem.id === milestone.id && (
	                                                                        <div className="mt-3 rounded-2xl border border-foreground/5 bg-foreground/[0.02] p-5">
	                                                                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/40">Edit Milestone</p>
	                                                                            <div className="mt-3 space-y-2">
	                                                                                <input
	                                                                                    type="text"
	                                                                                    value={editingTitle}
	                                                                                    onChange={(e) => setEditingTitle(e.target.value)}
	                                                                                    placeholder="Milestone title…"
	                                                                                    className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
	                                                                                />
	                                                                                <textarea
	                                                                                    value={editingDescription}
	                                                                                    onChange={(e) => setEditingDescription(e.target.value)}
	                                                                                    placeholder="Milestone description…"
	                                                                                    rows={3}
	                                                                                    className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60 resize-none"
	                                                                                />
	                                                                            </div>
	                                                                            <div className="mt-3 flex justify-end gap-2">
	                                                                                <button
	                                                                                    type="button"
	                                                                                    onClick={saveEdit}
	                                                                                    disabled={!editingTitle.trim()}
	                                                                                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold transition-all"
	                                                                                >
	                                                                                    Save
	                                                                                </button>
	                                                                                <button
	                                                                                    type="button"
	                                                                                    onClick={cancelEdit}
	                                                                                    className="px-3 py-2 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm transition-all"
	                                                                                >
	                                                                                    Cancel
	                                                                                </button>
	                                                                            </div>
	                                                                        </div>
	                                                                    )}

	                                                                    {/* Expanded: Tasks */}
	                                                                    <div className={`mt-4 overflow-hidden transition-all duration-500 ${isMilestoneSelected ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
	                                                                        <div className="ml-6 pl-6 border-l border-foreground/10 space-y-3">
	                                                                            <div className="flex items-center justify-between">
	                                                                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/40">Tasks</p>
                                                                                <span className="text-xs text-foreground/40">{selectedMilestoneTaskStats.completed}/{selectedMilestoneTaskStats.total} done</span>
                                                                            </div>

                                                                            {sortedTasks.length === 0 ? (
                                                                                <div className="glass-panel rounded-2xl border border-foreground/5 bg-muted/30 p-5 text-center text-foreground/40">
                                                                                    <p className="text-sm">No tasks yet.</p>
                                                                                </div>
                                                                            ) : (
                                                                                sortedTasks.map((task, tIdx) => {
                                                                                    const isTaskSelected = selectedTaskId === task.id;
                                                                                    const isEditingTask = editingItem?.type === 'task' && editingItem.id === task.id;
                                                                                    const subTasks = (task.subTasks || [])
                                                                                        .filter(st => !st.isStrikethrough)
                                                                                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                                                                                    const totalSteps = subTasks.length;
                                                                                    const doneSteps = subTasks.filter(st => st.isCompleted).length;
                                                                                    const stepsPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

                                                                                    const statusLabel = task.isCompleted ? 'Done' : isTaskSelected ? 'Active' : 'To do';
                                                                                    const statusClass = task.isCompleted
                                                                                        ? 'bg-green-500 text-white'
                                                                                        : isTaskSelected
                                                                                            ? 'bg-primary text-primary-foreground'
                                                                                            : 'bg-foreground/10 text-foreground/40';

                                                                                    return (
                                                                                        <div key={task.id} className={`rounded-2xl border overflow-hidden transition-all
                                                                                            ${isTaskSelected ? 'border-primary/40 bg-primary/5' : 'border-foreground/5 bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/10'}
                                                                                        `}>
                                                                                            <button
                                                                                                onClick={() => toggleTaskSelection(task.id)}
                                                                                                className="w-full text-left"
                                                                                            >
                                                                                                <div className="px-5 py-3 flex items-center justify-between bg-muted/60 dark:bg-black/20 border-b border-foreground/5">
                                                                                                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/40">
                                                                                                        Task {tIdx + 1}
                                                                                                    </span>
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusClass}`}>
                                                                                                            {statusLabel}
                                                                                                        </span>
                                                                                                        <span className="material-symbols-outlined text-foreground/40">
                                                                                                            {isTaskSelected ? 'expand_less' : 'expand_more'}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </button>

	                                                                                            <div className="p-6">
	                                                                                                <div className="flex items-start gap-3">
	                                                                                                    {!isReadOnly ? (
	                                                                                                        <button
	                                                                                                            onClick={(e) => {
	                                                                                                                e.stopPropagation();
	                                                                                                                handleToggleTask(task);
	                                                                                                            }}
                                                                                                            className={`mt-0.5 size-5 rounded border flex items-center justify-center transition-colors shrink-0
                                                                                                                ${task.isCompleted ? 'bg-green-500 border-green-500' : 'border-foreground/30 hover:border-primary'}
                                                                                                            `}
                                                                                                            aria-label={task.isCompleted ? 'Reopen task' : 'Complete task'}
                                                                                                        >
                                                                                                            {task.isCompleted && (
                                                                                                                <span className="material-symbols-outlined text-[12px] text-foreground font-bold">check</span>
                                                                                                            )}
	                                                                                                        </button>
                                                                                                    ) : (
                                                                                                        <div className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                                                                                                    )}
	                                                                                                    <div className="min-w-0 flex-1">
	                                                                                                        <p className={`text-lg font-black leading-tight ${task.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground'}`}>
	                                                                                                            {task.title}
	                                                                                                        </p>
	                                                                                                        {task.description && !isTaskSelected && (
	                                                                                                            <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                                                                                                                {task.description}
                                                                                                            </p>
                                                                                                        )}
                                                                                                        <div className="mt-4 flex items-center justify-between text-xs text-foreground/40">
                                                                                                            <span>{doneSteps}/{totalSteps} steps</span>
                                                                                                            <span>{task.estimatedMinutes ? `${task.estimatedMinutes}m` : `${stepsPct}%`}</span>
                                                                                                        </div>
	                                                                                                        <div className="mt-2 h-2 rounded-full bg-foreground/5 overflow-hidden">
	                                                                                                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${stepsPct}%` }} />
	                                                                                                        </div>
	                                                                                                    </div>
	                                                                                                    {!isReadOnly && onTaskUpdate && (
	                                                                                                        <button
	                                                                                                            type="button"
	                                                                                                            onClick={() => {
	                                                                                                                setSelectedTaskId(task.id);
	                                                                                                                setEditingItem({ type: 'task', id: task.id });
	                                                                                                                setEditingTitle(task.title);
	                                                                                                                setEditingDescription(task.description || '');
	                                                                                                            }}
	                                                                                                            className="ml-auto size-9 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground/70 flex items-center justify-center transition-all"
	                                                                                                            aria-label="Edit task"
	                                                                                                        >
	                                                                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
	                                                                                                        </button>
	                                                                                                    )}
	                                                                                                </div>

	                                                                                                {/* Expanded: Subtasks + Actions */}
	                                                                                                <div className={`mt-4 overflow-hidden transition-all duration-500 ${isTaskSelected ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
	                                                                                                    <div className="space-y-2">
	                                                                                                        {!isReadOnly && onTaskUpdate && isEditingTask && (
	                                                                                                            <div className="rounded-2xl border border-foreground/5 bg-muted/60 dark:bg-black/20 p-4">
	                                                                                                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/40">Edit Task</p>
	                                                                                                                <div className="mt-3 space-y-2">
	                                                                                                                    <input
	                                                                                                                        type="text"
	                                                                                                                        value={editingTitle}
	                                                                                                                        onChange={(e) => setEditingTitle(e.target.value)}
	                                                                                                                        placeholder="Task title…"
	                                                                                                                        className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500/60"
	                                                                                                                    />
	                                                                                                                    <textarea
	                                                                                                                        value={editingDescription}
	                                                                                                                        onChange={(e) => setEditingDescription(e.target.value)}
	                                                                                                                        placeholder="Task notes / description…"
	                                                                                                                        rows={3}
	                                                                                                                        className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500/60 resize-none"
	                                                                                                                    />
	                                                                                                                </div>
	                                                                                                                <div className="mt-3 flex justify-end gap-2">
	                                                                                                                    <button
	                                                                                                                        type="button"
	                                                                                                                        onClick={saveEdit}
	                                                                                                                        disabled={!editingTitle.trim()}
	                                                                                                                        className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-foreground text-sm font-bold transition-all"
	                                                                                                                    >
	                                                                                                                        Save
	                                                                                                                    </button>
	                                                                                                                    <button
	                                                                                                                        type="button"
	                                                                                                                        onClick={cancelEdit}
	                                                                                                                        className="px-3 py-2 rounded-lg bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm transition-all"
	                                                                                                                    >
	                                                                                                                        Cancel
	                                                                                                                    </button>
	                                                                                                                </div>
	                                                                                                            </div>
	                                                                                                        )}
	                                                                                                        {subTasks.length === 0 ? (
	                                                                                                            <p className="text-sm text-foreground/40">No subtasks yet.</p>
	                                                                                                        ) : (
	                                                                                                            subTasks.map((subTask) => {
	                                                                                                                const isEditingSubTask = editingItem?.type === 'subtask' && editingItem.id === subTask.id;
	                                                                                                                return (
	                                                                                                                <div key={subTask.id} className="flex items-start gap-3 py-2">
	                                                                                                                    {!isReadOnly ? (
	                                                                                                                        <button
	                                                                                                                            onClick={() => {
	                                                                                                                                if (!onSubTaskToggle || !selectedPhaseId) return;
	                                                                                                                                onSubTaskToggle(goal.id, selectedPhaseId, milestone.id, subTask.id, !subTask.isCompleted);
	                                                                                                                            }}
                                                                                                                            className={`mt-0.5 size-4 rounded border flex items-center justify-center transition-colors shrink-0
                                                                                                                                ${subTask.isCompleted ? 'bg-green-500 border-green-500' : 'border-foreground/30 hover:border-blue-400'}
                                                                                                                            `}
                                                                                                                        >
                                                                                                                            {subTask.isCompleted && (
                                                                                                                                <span className="material-symbols-outlined text-[10px] text-foreground font-bold">check</span>
	                                                                                                                            )}
	                                                                                                                        </button>
	                                                                                                                    ) : (
	                                                                                                                        <div className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
	                                                                                                                    )}
	                                                                                                                    {isEditingSubTask ? (
	                                                                                                                        <div className="min-w-0 flex-1 space-y-2">
	                                                                                                                            <input
	                                                                                                                                type="text"
	                                                                                                                                value={editingTitle}
	                                                                                                                                onChange={(e) => setEditingTitle(e.target.value)}
	                                                                                                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
	                                                                                                                                placeholder="Subtask title…"
	                                                                                                                                className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500/60"
	                                                                                                                            />
	                                                                                                                            <input
	                                                                                                                                type="text"
	                                                                                                                                value={editingDescription}
	                                                                                                                                onChange={(e) => setEditingDescription(e.target.value)}
	                                                                                                                                placeholder="Optional notes…"
	                                                                                                                                className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500/60"
	                                                                                                                            />
	                                                                                                                        </div>
	                                                                                                                    ) : (
	                                                                                                                        <div className="min-w-0 flex-1">
	                                                                                                                            <p className={`text-sm font-semibold leading-tight ${subTask.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground/90'}`}>
	                                                                                                                                {subTask.title}
	                                                                                                                            </p>
	                                                                                                                            {subTask.description && (
	                                                                                                                                <p className="text-xs text-foreground/40 mt-1 line-clamp-2">{subTask.description}</p>
	                                                                                                                            )}
	                                                                                                                        </div>
	                                                                                                                    )}
	                                                                                                                    {!isReadOnly && onSubTaskUpdate && (
	                                                                                                                        isEditingSubTask ? (
	                                                                                                                            <div className="flex items-center gap-1">
	                                                                                                                                <button
	                                                                                                                                    type="button"
	                                                                                                                                    onClick={saveEdit}
	                                                                                                                                    disabled={!editingTitle.trim()}
	                                                                                                                                    className="size-8 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-foreground flex items-center justify-center transition-all"
	                                                                                                                                    aria-label="Save subtask"
	                                                                                                                                >
	                                                                                                                                    <span className="material-symbols-outlined text-[18px]">check</span>
	                                                                                                                                </button>
	                                                                                                                                <button
	                                                                                                                                    type="button"
	                                                                                                                                    onClick={cancelEdit}
	                                                                                                                                    className="size-8 rounded-xl bg-foreground/10 hover:bg-foreground/20 text-foreground flex items-center justify-center transition-all"
	                                                                                                                                    aria-label="Cancel subtask edit"
	                                                                                                                                >
	                                                                                                                                    <span className="material-symbols-outlined text-[18px]">close</span>
	                                                                                                                                </button>
	                                                                                                                            </div>
	                                                                                                                        ) : (
	                                                                                                                            <button
	                                                                                                                                type="button"
	                                                                                                                                onClick={() => {
	                                                                                                                                    setEditingItem({ type: 'subtask', id: subTask.id });
	                                                                                                                                    setEditingTitle(subTask.title);
	                                                                                                                                    setEditingDescription(subTask.description || '');
	                                                                                                                                }}
	                                                                                                                                className="ml-auto size-8 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground/70 flex items-center justify-center transition-all"
	                                                                                                                                aria-label="Edit subtask"
	                                                                                                                            >
	                                                                                                                                <span className="material-symbols-outlined text-[18px]">edit</span>
	                                                                                                                            </button>
	                                                                                                                        )
	                                                                                                                    )}
	                                                                                                                </div>
	                                                                                                                );
	                                                                                                            })
	                                                                                                        )}
	                                                                                                    </div>

                                                                                                    {!isReadOnly && onAddSubTask && selectedTaskId === task.id && (
                                                                                                        <div className="mt-4">
                                                                                                            {isAddingSubTask ? (
                                                                                                                <div className="flex gap-2">
                                                                                                                    <input
                                                                                                                        type="text"
                                                                                                                        value={newSubTaskTitle}
                                                                                                                        onChange={(e) => setNewSubTaskTitle(e.target.value)}
                                                                                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubTask()}
                                                                                                                        placeholder="New subtask..."
                                                                                                                        className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500"
                                                                                                                        autoFocus
                                                                                                                    />
                                                                                                                    <button
                                                                                                                        onClick={handleAddSubTask}
                                                                                                                        disabled={!newSubTaskTitle.trim()}
                                                                                                                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-foreground text-sm font-bold rounded-lg transition-colors"
                                                                                                                    >
                                                                                                                        Add
                                                                                                                    </button>
                                                                                                                    <button
                                                                                                                        onClick={() => { setIsAddingSubTask(false); setNewSubTaskTitle(''); }}
                                                                                                                        className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                                                                                                    >
                                                                                                                        Cancel
                                                                                                                    </button>
                                                                                                                </div>
                                                                                                            ) : (
                                                                                                                <button
                                                                                                                    onClick={() => setIsAddingSubTask(true)}
                                                                                                                    className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-blue-500 hover:bg-blue-500/10 rounded-xl text-foreground/60 hover:text-blue-400 transition-all"
                                                                                                                >
                                                                                                                    <span className="material-symbols-outlined text-lg">add</span>
                                                                                                                    <span className="text-sm font-medium">Add Subtask</span>
                                                                                                                </button>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    )}

                                                                                                    {/* Notes (inline) */}
                                                                                                    <div className="mt-5 rounded-2xl border border-foreground/5 bg-foreground/[0.02] overflow-hidden">
                                                                                                        <div className="px-5 py-3 border-b border-foreground/5 bg-muted/60 dark:bg-black/20 flex items-center justify-between">
                                                                                                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-foreground/40">Notes</p>
                                                                                                            {!isReadOnly && onTaskUpdate && (
                                                                                                                isEditingTaskNotes ? (
                                                                                                                    <div className="flex items-center gap-2">
                                                                                                                        <button
                                                                                                                            onClick={() => {
                                                                                                                                onTaskUpdate(task.id, { description: taskNotesDraft.trim() });
                                                                                                                                setIsEditingTaskNotes(false);
                                                                                                                            }}
                                                                                                                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold transition-all"
                                                                                                                        >
                                                                                                                            Save
                                                                                                                        </button>
                                                                                                                        <button
                                                                                                                            onClick={() => {
                                                                                                                                setTaskNotesDraft(task.description || '');
                                                                                                                                setIsEditingTaskNotes(false);
                                                                                                                            }}
                                                                                                                            className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground/70 text-xs font-bold transition-all"
                                                                                                                        >
                                                                                                                            Cancel
                                                                                                                        </button>
                                                                                                                    </div>
                                                                                                                ) : (
                                                                                                                    <button
                                                                                                                        onClick={() => setIsEditingTaskNotes(true)}
                                                                                                                        className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground/70 text-xs font-bold transition-all"
                                                                                                                    >
                                                                                                                        Edit
                                                                                                                    </button>
                                                                                                                )
                                                                                                            )}
                                                                                                        </div>
                                                                                                        <div className="p-5">
                                                                                                            {!isReadOnly && onTaskUpdate && isEditingTaskNotes ? (
                                                                                                                <textarea
                                                                                                                    value={taskNotesDraft}
                                                                                                                    onChange={(e) => setTaskNotesDraft(e.target.value)}
                                                                                                                    placeholder="Add quick notes, links, constraints…"
                                                                                                                    className="w-full min-h-[100px] bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
                                                                                                                />
                                                                                                            ) : (
                                                                                                                <p className={`text-sm leading-relaxed ${taskNotesDraft ? 'text-foreground/70' : 'text-foreground/40'}`}>
                                                                                                                    {taskNotesDraft || 'No notes yet.'}
                                                                                                                </p>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>

                                                                                                    {!isReadOnly && (
                                                                                                        <div className="mt-5 flex flex-col sm:flex-row gap-2">
                                                                                                            <button
                                                                                                                onClick={() => onBeginSession?.(task.id)}
                                                                                                                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider transition-all"
                                                                                                            >
                                                                                                                Open Calendar
                                                                                                            </button>
                                                                                                            <button
                                                                                                                onClick={() => handleToggleTask(task)}
                                                                                                                className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-xs font-black uppercase tracking-wider transition-all"
                                                                                                            >
                                                                                                                {task.isCompleted ? 'Reopen Task' : 'Mark Done'}
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })
                                                                            )}

	                                                                            {/* Add Task */}
	                                                                            {!isReadOnly && (addingItemType === 'task' ? (
	                                                                                <div className="pt-2 space-y-2">
	                                                                                    <input
	                                                                                        type="text"
	                                                                                        value={newItemTitle}
	                                                                                        onChange={(e) => setNewItemTitle(e.target.value)}
	                                                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
	                                                                                        placeholder="Task title…"
	                                                                                        className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-purple-500"
	                                                                                        autoFocus
	                                                                                    />
	                                                                                    <textarea
	                                                                                        value={newTaskSubTasksText}
	                                                                                        onChange={(e) => setNewTaskSubTasksText(e.target.value)}
	                                                                                        placeholder="Subtasks (optional) — one per line…"
	                                                                                        rows={3}
	                                                                                        className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-purple-500 resize-none"
	                                                                                    />
	                                                                                    <div className="flex gap-2">
	                                                                                        <button
	                                                                                            onClick={handleAddTask}
	                                                                                            disabled={!onAddTask || !newItemTitle.trim()}
	                                                                                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-foreground text-sm font-bold rounded-lg transition-colors"
	                                                                                        >
	                                                                                            Add
	                                                                                        </button>
	                                                                                        <button
	                                                                                            onClick={() => { setAddingItemType(null); setNewItemTitle(''); setNewTaskSubTasksText(''); }}
	                                                                                            className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
	                                                                                        >
	                                                                                            Cancel
	                                                                                        </button>
	                                                                                    </div>
	                                                                                </div>
	                                                                            ) : (
	                                                                                <button
	                                                                                    onClick={() => onAddTask ? setAddingItemType('task') : alert('Add Task: Feature not yet connected. Use the chat assistant.')}
	                                                                                    className="w-full mt-2 flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-purple-500 hover:bg-purple-500/10 rounded-xl text-foreground/60 hover:text-purple-400 transition-all"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-lg">add</span>
                                                                                    <span className="text-sm font-medium">Add Task</span>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Add Milestone */}
                                            {!isReadOnly && (addingItemType === 'milestone' ? (
                                                <div className="mt-4 ml-6 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newItemTitle}
                                                        onChange={(e) => setNewItemTitle(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
                                                        placeholder="New milestone..."
                                                        className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={handleAddMilestone}
                                                        disabled={!onAddMilestone || !newItemTitle.trim()}
                                                        className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg transition-colors"
                                                    >
                                                        Add
                                                    </button>
                                                    <button
                                                        onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                                        className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => onAddMilestone ? setAddingItemType('milestone') : alert('Add Milestone: Feature not yet connected. Use the chat assistant.')}
                                                    className="w-full mt-4 ml-6 flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-primary hover:bg-primary/10 rounded-xl text-foreground/60 hover:text-primary transition-all"
                                                >
                                                    <span className="material-symbols-outlined text-lg">add</span>
                                                    <span className="text-sm font-medium">Add Milestone</span>
                                                </button>
                                            ))}

                                            {/* Coach tip (phase-level) */}
                                            {phase.coachAdvice && (
                                                <div className="mt-6 ml-6 glass-panel p-5 rounded-2xl border border-primary/20 bg-muted/40">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="material-symbols-outlined text-primary text-lg">bolt</span>
                                                        <p className="text-xs font-black uppercase tracking-[0.35em] text-primary">Solulu Note</p>
                                                    </div>
                                                    <p className="text-sm text-foreground/70 leading-relaxed">{phase.coachAdvice}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Add Phase */}
            {!isReadOnly && (
                <div className="mt-10 ml-16">
                    {addingItemType === 'phase' ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newItemTitle}
                                onChange={(e) => setNewItemTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddPhase()}
                                placeholder="New phase..."
                                className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary"
                                autoFocus
                            />
                            <button
                                onClick={handleAddPhase}
                                disabled={!onAddPhase || !newItemTitle.trim()}
                                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg transition-colors"
                            >
                                Add
                            </button>
                            <button
                                onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => onAddPhase ? setAddingItemType('phase') : alert('Add Phase: Feature not yet connected. Use the chat assistant.')}
                            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-primary hover:bg-primary/10 rounded-xl text-foreground/60 hover:text-primary transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                            <span className="text-sm font-medium">Add Phase</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );

    // New execution board UI (reactive master-detail)
    return (
        <div className="flex flex-col gap-6 pb-20">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/40">Execution</p>
                    <h2 className="text-2xl font-black text-foreground">Phases → Milestones → Tasks</h2>
                    <p className="text-sm text-foreground/50 mt-1">Pick what to do next, then execute. Progress updates live.</p>
                </div>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {/* ---------------- PHASES ---------------- */}
                <div className="glass-panel rounded-2xl border border-foreground/5 bg-muted/50 backdrop-blur-xl flex flex-col w-[280px] shrink-0 h-[560px] md:h-[620px] lg:h-[calc(100vh-360px)]">
                    <div className="px-5 py-4 border-b border-foreground/5">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground/40">Level 1</p>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-foreground">Phases</h3>
                            <span className="text-xs text-foreground/40">{phases.length}</span>
                        </div>
                    </div>

	                    <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-2 scrollbar-hide">
                        {phases.length === 0 ? (
                            <div className="text-center py-10 text-foreground/40">
                                <span className="material-symbols-outlined text-3xl mb-2">map</span>
                                <p>No phases yet</p>
                            </div>
                        ) : (
                            phases.map((phase, idx) => {
                                const status = getStatusConfig(phase, idx);
                                const isSelected = selectedPhaseId === phase.id;
                                const totalMilestones = phase.milestones.length;
                                const completedMilestones = phase.milestones.filter(m => m.isCompleted).length;
                                const phasePct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

                                return (
                                    <button
                                        key={phase.id}
                                        onClick={() => togglePhaseSelection(phase.id)}
                                        className={`w-full text-left rounded-xl border px-4 py-3 transition-all
                                            ${isSelected ? 'border-primary bg-primary/10' : 'border-foreground/5 bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/10'}
                                        `}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 size-9 rounded-xl border flex items-center justify-center font-black text-xs
                                                ${isSelected ? 'bg-primary text-primary-foreground' : `bg-muted/60 dark:bg-black/20 ${status.border} ${status.text}`}
                                            `}>
                                                {phase.number}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`font-bold leading-tight truncate ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}>{phase.title}</p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${status.indicator}`}>
                                                        {status.label}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-foreground/40 mt-1 line-clamp-2">{phase.description || '—'}</p>
                                                <div className="mt-2 flex items-center justify-between text-xs text-foreground/40">
                                                    <span>{completedMilestones}/{totalMilestones} milestones</span>
                                                    <span>{phasePct}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="p-3 border-t border-foreground/5">
                        {addingItemType === 'phase' ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newItemTitle}
                                    onChange={(e) => setNewItemTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddPhase()}
                                    placeholder="New phase..."
                                    className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary"
                                    autoFocus
                                />
                                <button
                                    onClick={handleAddPhase}
                                    disabled={!onAddPhase || !newItemTitle.trim()}
                                    className="px-3 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg transition-colors"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                    className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => onAddPhase ? setAddingItemType('phase') : alert('Add Phase: Feature not yet connected. Use the chat assistant.')}
                                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-primary hover:bg-primary/10 rounded-xl text-foreground/60 hover:text-primary transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">add</span>
                                <span className="text-sm font-medium">Add Phase</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ---------------- MILESTONES ---------------- */}
                <div className="glass-panel rounded-2xl border border-foreground/5 bg-muted/50 backdrop-blur-xl flex flex-col w-[320px] shrink-0 h-[560px] md:h-[620px] lg:h-[calc(100vh-360px)]">
                    <div className="px-5 py-4 border-b border-foreground/5">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Level 2</p>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-foreground">Milestones</h3>
                            {selectedPhase ? (
                                <span className="text-xs text-foreground/40">{milestones.filter(m => m.isCompleted).length}/{milestones.length}</span>
                            ) : (
                                <span className="text-xs text-foreground/40">—</span>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-foreground/40 truncate">
                            {selectedPhase ? `Phase ${selectedPhase.number}: ${selectedPhase.title}` : 'Select a phase'}
                        </p>
                    </div>

	                    <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-2 scrollbar-hide">
                        {!selectedPhase ? (
                            <div className="text-center py-10 text-foreground/40">
                                <span className="material-symbols-outlined text-3xl mb-2">flag</span>
                                <p>Select a phase to see milestones</p>
                            </div>
                        ) : milestones.length === 0 ? (
                            <div className="text-center py-10 text-foreground/40">
                                <span className="material-symbols-outlined text-3xl mb-2">flag</span>
                                <p>No milestones yet</p>
                            </div>
                        ) : (
                            milestones.map((milestone) => {
                                const isSelected = selectedMilestoneId === milestone.id;
                                const milestoneTasks = (milestone.tasks || []).filter(t => !t.isStrikethrough);
                                const totalTasks = milestoneTasks.length;
                                const completedTasks = milestoneTasks.filter(t => t.isCompleted).length;
                                const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

                                return (
                                    <div
                                        key={milestone.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleMilestoneSelection(milestone.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleMilestoneSelection(milestone.id);
                                            }
                                        }}
                                        className={`w-full text-left rounded-xl border px-4 py-3 transition-all
                                            ${isSelected ? 'border-primary bg-primary/10' : 'border-foreground/5 bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/10'}
                                        `}
                                    >
                                        <div className="flex items-start gap-3">
	                                            <button
	                                                onClick={(e) => {
	                                                    e.stopPropagation();
	                                                    handleToggleMilestone(milestone);
	                                                }}
	                                                className={`mt-1 size-5 rounded-lg border transition-all flex items-center justify-center shrink-0
	                                                    ${milestone.isCompleted ? 'bg-green-500 border-green-500 text-foreground' : 'border-foreground/20 text-transparent hover:border-primary'}
	                                                `}
	                                            >
                                                <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`font-bold leading-tight truncate ${milestone.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground/90'}`}>
                                                        {milestone.title}
                                                    </p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider
                                                        ${milestone.isCompleted ? 'bg-green-500 text-white' : 'bg-foreground/10 text-foreground/40'}
                                                    `}>
                                                        {milestone.isCompleted ? 'Done' : 'Open'}
                                                    </span>
                                                </div>
                                                {milestone.description && (
                                                    <p className="text-xs text-foreground/40 mt-1 line-clamp-2">{milestone.description}</p>
                                                )}
                                                <div className="mt-2 flex items-center justify-between text-xs text-foreground/40">
                                                    <span>{completedTasks}/{totalTasks} tasks</span>
                                                    <span>{totalTasks > 0 ? `${pct}%` : '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="p-3 border-t border-foreground/5">
                        {!selectedPhase ? (
                            <div className="text-xs text-foreground/40 text-center py-3">Select a phase to add milestones</div>
                        ) : addingItemType === 'milestone' ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newItemTitle}
                                    onChange={(e) => setNewItemTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
                                    placeholder="New milestone..."
                                    className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary"
                                    autoFocus
                                />
                                <button
                                    onClick={handleAddMilestone}
                                    disabled={!onAddMilestone || !newItemTitle.trim()}
                                    className="px-3 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-lg transition-colors"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                    className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => onAddMilestone ? setAddingItemType('milestone') : alert('Add Milestone: Feature not yet connected. Use the chat assistant.')}
                                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-primary hover:bg-primary/10 rounded-xl text-foreground/60 hover:text-primary transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">add</span>
                                <span className="text-sm font-medium">Add Milestone</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* ---------------- TASKS ---------------- */}
                <div className="glass-panel rounded-2xl border border-foreground/5 bg-muted/50 backdrop-blur-xl flex flex-col w-[360px] shrink-0 h-[560px] md:h-[620px] lg:h-[calc(100vh-360px)]">
                    <div className="px-5 py-4 border-b border-foreground/5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-400">Level 3</p>
                                <h3 className="text-sm font-bold text-foreground">Tasks</h3>
                                <p className="mt-1 text-xs text-foreground/40 truncate">{selectedMilestone ? selectedMilestone.title : 'Select a milestone'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setTaskFilter(prev => prev === 'open' ? 'all' : prev === 'all' ? 'done' : 'open')}
                                    className="px-3 py-2 rounded-lg bg-foreground/5 border border-foreground/10 text-xs font-bold text-foreground/70 hover:bg-foreground/10 transition-all"
                                >
                                    Filter: {taskFilterLabel}
                                </button>
                                <button
                                    onClick={() => setTaskSort(prev => prev === 'order' ? 'title' : 'order')}
                                    className="px-3 py-2 rounded-lg bg-foreground/5 border border-foreground/10 text-xs font-bold text-foreground/70 hover:bg-foreground/10 transition-all"
                                >
                                    Sort: {taskSortLabel}
                                </button>
                            </div>
                        </div>

                        {selectedMilestone && (
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-foreground/40">
                                    {selectedMilestoneTaskStats.completed}/{selectedMilestoneTaskStats.total} done
                                </span>
                                <div className="flex-1 h-2 rounded-full bg-foreground/5 overflow-hidden">
                                    <div className="h-full bg-purple-500 transition-all" style={{ width: `${selectedMilestoneTaskStats.pct}%` }} />
                                </div>
                                <span className="text-xs text-foreground/40">{selectedMilestoneTaskStats.pct}%</span>
                            </div>
                        )}
                    </div>

	                    <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-2 scrollbar-hide">
                        {!selectedMilestone ? (
                            <div className="text-center py-10 text-foreground/40">
                                <span className="material-symbols-outlined text-3xl mb-2">checklist</span>
                                <p>Select a milestone to see tasks</p>
                            </div>
                        ) : visibleTasks.length === 0 ? (
                            <div className="text-center py-10 text-foreground/40">
                                <span className="material-symbols-outlined text-3xl mb-2">checklist</span>
                                <p>No {taskFilterLabel.toLowerCase()} tasks</p>
                            </div>
                        ) : (
                            visibleTasks.map((task) => {
                                const isSelected = selectedTaskId === task.id;
                                const subTasks = (task.subTasks || []).filter(st => !st.isStrikethrough);
                                const totalSteps = subTasks.length;
                                const doneSteps = subTasks.filter(st => st.isCompleted).length;
                                const statusLabel = task.isCompleted ? 'Done' : isSelected ? 'In progress' : 'To do';
                                const statusClass = task.isCompleted
                                    ? 'bg-green-500 text-white'
                                    : isSelected
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-foreground/10 text-foreground/40';

                                return (
                                    <div
                                        key={task.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleTaskSelection(task.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                toggleTaskSelection(task.id);
                                            }
                                        }}
                                        className={`w-full text-left rounded-xl border px-4 py-3 transition-all
                                            ${isSelected ? 'border-purple-500 bg-purple-500/10' : 'border-foreground/5 bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/10'}
                                        `}
                                    >
                                        <div className="flex items-start gap-3">
	                                            <button
	                                                onClick={(e) => {
	                                                    e.stopPropagation();
	                                                    handleToggleTask(task);
	                                                }}
	                                                className={`mt-1 size-5 rounded border flex items-center justify-center transition-colors shrink-0
	                                                    ${task.isCompleted ? 'bg-green-500 border-green-500' : 'border-foreground/30 hover:border-purple-500'}
	                                                `}
	                                            >
                                                {task.isCompleted && (
                                                    <span className="material-symbols-outlined text-[12px] text-foreground font-bold">check</span>
                                                )}
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`font-bold leading-tight truncate ${task.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground/90'}`}>
                                                        {task.title}
                                                    </p>
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusClass}`}>
                                                        {statusLabel}
                                                    </span>
                                                </div>
                                                {task.description && (
                                                    <p className="text-xs text-foreground/40 mt-1 line-clamp-2">{task.description}</p>
                                                )}
                                                <div className="mt-2 flex items-center justify-between text-xs text-foreground/40">
                                                    <span>{totalSteps > 0 ? `${doneSteps}/${totalSteps} steps` : 'No steps'}</span>
                                                    {task.estimatedMinutes ? <span>{task.estimatedMinutes}m</span> : <span>—</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="p-3 border-t border-foreground/5">
                        {!selectedMilestone ? (
                            <div className="text-xs text-foreground/40 text-center py-3">Select a milestone to add tasks</div>
                        ) : addingItemType === 'task' ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newItemTitle}
                                    onChange={(e) => setNewItemTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                                    placeholder="New task..."
                                    className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-purple-500"
                                    autoFocus
                                />
                                <button
                                    onClick={handleAddTask}
                                    disabled={!onAddTask || !newItemTitle.trim()}
                                    className="px-3 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-foreground text-sm font-bold rounded-lg transition-colors"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                    className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => onAddTask ? setAddingItemType('task') : alert('Add Task: Feature not yet connected. Use the chat assistant.')}
                                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-purple-500 hover:bg-purple-500/10 rounded-xl text-foreground/60 hover:text-purple-400 transition-all"
                            >
                                <span className="material-symbols-outlined text-lg">add</span>
                                <span className="text-sm font-medium">Add Task</span>
                            </button>
                        )}
                    </div>
                </div>

	                {/* ---------------- DETAILS ---------------- */}
	                <div className="glass-panel rounded-2xl border border-foreground/5 bg-muted/50 backdrop-blur-xl flex flex-col w-[420px] shrink-0 lg:flex-1 lg:min-w-0 lg:shrink h-[560px] md:h-[620px] lg:h-[calc(100vh-360px)]">
	                    <div className="px-6 py-5 border-b border-foreground/5 flex items-start justify-between gap-4">
	                        <div className="min-w-0">
	                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Focus</p>
	                            <h3 className="text-base font-black text-foreground leading-tight truncate">{selectedTask ? selectedTask.title : 'Select a task'}</h3>
	                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/40">
	                                {selectedPhase && <span>Phase {selectedPhase.number}</span>}
	                                {selectedMilestone && (
	                                    <>
	                                        <span className="text-foreground/20">•</span>
	                                        <span className="truncate">{selectedMilestone.title}</span>
	                                    </>
	                                )}
	                            </div>
	                        </div>

	                        {selectedTask && !isReadOnly && (
	                            <div className="flex items-center gap-2 shrink-0">
	                                <button
	                                    onClick={() => onBeginSession?.(selectedTask.id)}
	                                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider transition-all"
	                                >
	                                    Open Calendar
	                                </button>
	                                <button
	                                    onClick={() => handleToggleTask(selectedTask)}
	                                    className="px-4 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-xs font-black uppercase tracking-wider transition-all"
	                                >
	                                    {selectedTask.isCompleted ? 'Reopen' : 'Mark Done'}
	                                </button>
	                            </div>
	                        )}
	                    </div>

	                    <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-6 scrollbar-hide">
	                        {!selectedTask ? (
	                            <div className="text-center py-14 text-foreground/40">
	                                <span className="material-symbols-outlined text-4xl mb-3">touch_app</span>
	                                <p className="text-sm">Select a task to see the checklist and notes</p>
	                            </div>
	                        ) : (
	                            <>
	                                <div className="space-y-3">
	                                    <div className="flex items-center gap-3">
	                                        <span className="text-xs text-foreground/40">
	                                            Steps {selectedTaskSubTaskStats.completed}/{selectedTaskSubTaskStats.total}
	                                        </span>
	                                        <div className="flex-1 h-2 rounded-full bg-foreground/5 overflow-hidden">
	                                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${selectedTaskSubTaskStats.pct}%` }} />
	                                        </div>
	                                        <span className="text-xs text-foreground/40">{selectedTaskSubTaskStats.pct}%</span>
	                                    </div>

	                                    <div className="flex flex-wrap gap-2">
	                                        {selectedTask.estimatedMinutes && (
	                                            <span className="px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-semibold text-foreground/70">
	                                                Est: {selectedTask.estimatedMinutes}m
	                                            </span>
	                                        )}
	                                        {selectedTask.difficulty && (
	                                            <span className="px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-semibold text-foreground/70">
	                                                Difficulty: {selectedTask.difficulty}/5
	                                            </span>
	                                        )}
	                                        {selectedTask.cognitiveType && (
	                                            <span className="px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-semibold text-foreground/70">
	                                                {selectedTask.cognitiveType.replace('_', ' ')}
	                                            </span>
	                                        )}
	                                        <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${selectedTask.isCompleted
	                                            ? 'bg-green-500/10 border-green-500/20 text-green-300'
	                                            : 'bg-primary/10 border-primary/20 text-primary'
	                                            }`}>
	                                            {selectedTask.isCompleted ? 'Done' : 'In progress'}
	                                        </span>
	                                    </div>
	                                </div>

	                                <div className="glass-card rounded-2xl border border-foreground/5 bg-foreground/[0.02] overflow-hidden">
	                                    <div className="px-5 py-4 border-b border-foreground/5 bg-muted/60 dark:bg-black/20 flex items-center justify-between">
	                                        <h4 className="text-sm font-bold text-foreground">Checklist</h4>
	                                        <span className="text-xs text-foreground/40">{selectedTaskSubTaskStats.pct}%</span>
	                                    </div>
	                                    <div className="p-4 space-y-2">
	                                        {((selectedTask.subTasks || []).filter(st => !st.isStrikethrough)).length === 0 ? (
	                                            <div className="text-center py-6 text-foreground/40">
	                                                <p className="text-sm">No subtasks yet</p>
	                                            </div>
	                                        ) : (
	                                            (selectedTask.subTasks || [])
	                                                .filter(st => !st.isStrikethrough)
	                                                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
	                                                .map((subTask, idx) => (
	                                                    <div key={subTask.id} className="flex items-start gap-3 rounded-xl border border-foreground/5 bg-foreground/[0.02] px-4 py-3 hover:bg-foreground/[0.04] transition-all">
	                                                        <button
	                                                            onClick={() => {
	                                                                if (!onSubTaskToggle || !selectedPhase || !selectedMilestone) return;
	                                                                onSubTaskToggle(goal.id, selectedPhase.id, selectedMilestone.id, subTask.id, !subTask.isCompleted);
	                                                            }}
	                                                            className={`mt-1 size-4 rounded border flex items-center justify-center transition-colors shrink-0
	                                                                ${subTask.isCompleted ? 'bg-green-500 border-green-500' : 'border-foreground/30 hover:border-blue-400'}
	                                                            `}
	                                                        >
	                                                            {subTask.isCompleted && (
	                                                                <span className="material-symbols-outlined text-[10px] text-foreground font-bold">check</span>
	                                                            )}
	                                                        </button>
	                                                        <div className="min-w-0 flex-1">
	                                                            <div className="flex items-center justify-between gap-2">
	                                                                <p className={`text-sm font-semibold truncate ${subTask.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground/90'}`}>
	                                                                    {subTask.title}
	                                                                </p>
	                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/30">Step {idx + 1}</span>
	                                                            </div>
	                                                            {subTask.description && (
	                                                                <p className="text-xs text-foreground/40 mt-1 line-clamp-2">{subTask.description}</p>
	                                                            )}
	                                                        </div>
	                                                    </div>
	                                                ))
	                                        )}
	                                    </div>
	                                </div>

	                                {!isReadOnly && onAddSubTask && selectedTaskId && (
	                                    <div className="pt-2">
	                                        {isAddingSubTask ? (
	                                            <div className="flex gap-2">
	                                                <input
	                                                    type="text"
	                                                    value={newSubTaskTitle}
	                                                    onChange={(e) => setNewSubTaskTitle(e.target.value)}
	                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubTask()}
	                                                    placeholder="New subtask..."
	                                                    className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500"
	                                                    autoFocus
	                                                />
	                                                <button
	                                                    onClick={handleAddSubTask}
	                                                    disabled={!newSubTaskTitle.trim()}
	                                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-foreground text-sm font-bold rounded-lg transition-colors"
	                                                >
	                                                    Add
	                                                </button>
	                                                <button
	                                                    onClick={() => { setIsAddingSubTask(false); setNewSubTaskTitle(''); }}
	                                                    className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
	                                                >
	                                                    Cancel
	                                                </button>
	                                            </div>
	                                        ) : (
	                                            <button
	                                                onClick={() => setIsAddingSubTask(true)}
	                                                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-blue-500 hover:bg-blue-500/10 rounded-xl text-foreground/60 hover:text-blue-400 transition-all"
	                                            >
	                                                <span className="material-symbols-outlined text-lg">add</span>
	                                                <span className="text-sm font-medium">Add Subtask</span>
	                                            </button>
	                                        )}
	                                    </div>
	                                )}

	                                <div className="glass-card rounded-2xl border border-foreground/5 bg-foreground/[0.02] overflow-hidden">
	                                    <div className="px-5 py-4 border-b border-foreground/5 bg-muted/60 dark:bg-black/20 flex items-center justify-between">
	                                        <h4 className="text-sm font-bold text-foreground">Notes</h4>
	                                        {!isReadOnly && onTaskUpdate && (
	                                            isEditingTaskNotes ? (
	                                                <div className="flex items-center gap-2">
	                                                    <button
	                                                        onClick={() => {
	                                                            if (!selectedTask) return;
	                                                            onTaskUpdate(selectedTask.id, { description: taskNotesDraft.trim() });
	                                                            setIsEditingTaskNotes(false);
	                                                        }}
	                                                        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold transition-all"
	                                                    >
	                                                        Save
	                                                    </button>
	                                                    <button
	                                                        onClick={() => {
	                                                            setTaskNotesDraft(selectedTask.description || '');
	                                                            setIsEditingTaskNotes(false);
	                                                        }}
	                                                        className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground/70 text-xs font-bold transition-all"
	                                                    >
	                                                        Cancel
	                                                    </button>
	                                                </div>
	                                            ) : (
	                                                <button
	                                                    onClick={() => setIsEditingTaskNotes(true)}
	                                                    className="px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground/70 text-xs font-bold transition-all"
	                                                >
	                                                    Edit
	                                                </button>
	                                            )
	                                        )}
	                                    </div>
	                                    <div className="p-4">
	                                        {!isReadOnly && onTaskUpdate && isEditingTaskNotes ? (
	                                            <textarea
	                                                value={taskNotesDraft}
	                                                onChange={(e) => setTaskNotesDraft(e.target.value)}
	                                                placeholder="Add quick notes, links, constraints…"
	                                                className="w-full min-h-[120px] bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/60"
	                                            />
	                                        ) : (
	                                            <p className={`text-sm leading-relaxed ${taskNotesDraft ? 'text-foreground/70' : 'text-foreground/40'}`}>
	                                                {taskNotesDraft || 'No notes yet. Add notes to make execution faster.'}
	                                            </p>
	                                        )}
	                                    </div>
	                                </div>

	                                {selectedPhase?.coachAdvice && (
	                                    <div className="glass-panel p-5 rounded-2xl border border-primary/20 bg-muted/40">
	                                        <div className="flex items-center gap-2 mb-2">
	                                            <span className="material-symbols-outlined text-primary text-lg">lightbulb</span>
	                                            <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">Coach Tip</p>
	                                        </div>
	                                        <p className="text-sm text-foreground/70 leading-relaxed">{selectedPhase.coachAdvice}</p>
	                                    </div>
	                                )}
	                            </>
	                        )}
	                    </div>
	                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col md:flex-row min-h-screen gap-10 pb-20">

            {/* ---------------- VERTICAL PHASE LIST (Left Shift) ---------------- */}
	            <div className={`transition-all duration-700 ease-in-out flex flex-col relative pt-6 px-4
	         ${selectedPhaseId ? 'md:w-[360px] shrink-0' : 'md:w-[600px] md:mx-auto items-center'}
	      `}>
                {/* Vertical Guide Line */}
                <div className={`absolute top-6 bottom-0 w-0.5 bg-foreground/5 transition-all duration-500
              ${selectedPhaseId ? 'left-[43px]' : 'left-[50%] -ml-px'}
          `} />

                {phases.map((phase, idx) => {
                    const status = getStatusConfig(phase, idx);
                    const isActive = selectedPhaseId === phase.id;
                    const isLast = idx === phases.length - 1;

                    return (
                        <div key={phase.id} className={`relative w-full group mb-8 transition-all duration-500
                   ${selectedPhaseId ? 'pl-20 text-left' : 'pl-0 flex flex-col items-center text-center'}
               `}>

                            {/* Timeline Indicator Node */}
                            <div
                                onClick={() => togglePhaseSelection(phase.id)}
                                className={`absolute size-14 rounded-full border-4 bg-background z-20 flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xl
                      ${selectedPhaseId ? 'left-0 top-0' : 'left-[50%] -ml-7 top-0'}
                      ${isActive ? `${status.border} shadow-[0_0_20px_hsl(var(--primary)/0.3)] scale-110 text-foreground` : `border-foreground/10 text-foreground/30 hover:border-foreground/30 hover:scale-105`}
                 `}>
                                <span className={`text-xl font-bold ${isActive ? status.text : 'text-foreground/50'}`}>
                                    {phase.number}
                                </span>
                            </div>

                            {/* Card Container */}
                            <div
                                onClick={() => togglePhaseSelection(phase.id)}
                                className={`glass-card rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
                      ${selectedPhaseId ? 'w-full' : 'w-[400px] mt-20'}
                      ${isActive ? `${status.border} ${status.bg}` : 'border-foreground/5 hover:border-foreground/20 hover:bg-foreground/[0.03]'}
                 `}>
                                {/* Card Header Strip */}
                                <div className={`px-4 py-2 flex items-center justify-between border-b border-foreground/5 bg-muted/60 dark:bg-black/20`}>
                                    <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${status.text}`}>
                                        Phase {phase.number}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${status.indicator}`}>
                                        {status.label}
                                    </span>
                                </div>

                                <div className="p-5">
                                    <h3 className={`font-bold mb-2 leading-tight ${selectedPhaseId ? 'text-lg' : 'text-2xl'} 
                                        ${isActive ? status.text : 'text-foreground'}`}>
                                        {phase.title}
                                    </h3>
                                    <p className={`text-muted-foreground text-sm leading-relaxed ${selectedPhaseId ? 'line-clamp-2' : ''}`}>
                                        {phase.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Add Phase Button */}
                <div className={`mt-6 ${selectedPhaseId ? 'pl-20' : 'flex justify-center'}`}>
                    {addingItemType === 'phase' ? (
                        <div className="flex gap-2 w-full max-w-md">
                            <input
                                type="text"
                                value={newItemTitle}
                                onChange={(e) => setNewItemTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddPhase()}
                                placeholder="Enter phase title..."
                                className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary"
                                autoFocus
                            />
                            <button
                                onClick={handleAddPhase}
                                disabled={!onAddPhase}
                                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-colors"
                            >
                                Add
                            </button>
                            <button
                                onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => onAddPhase ? setAddingItemType('phase') : alert('Add Phase: Feature not yet connected. Use the chat assistant.')}
                            className="flex items-center gap-2 px-6 py-3 border border-dashed border-foreground/20 hover:border-primary hover:bg-primary/10 rounded-xl text-foreground/60 hover:text-primary transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">add_circle</span>
                            <span className="text-sm font-medium">Add New Phase</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ---------------- MILESTONE DETAIL COLUMN (Slide In) ---------------- */}
            <div className={`flex-1 transition-all duration-500 flex flex-row gap-6
           ${selectedPhaseId ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none w-0 hidden'}
      `}>
                {/* Milestones List */}
                {selectedPhase && (
                    <div className={`transition-all duration-500 p-2
                        ${selectedMilestoneId ? 'w-[320px] shrink-0' : 'flex-1'}
                    `}>
                        <div className="flex items-center gap-4 mb-8 sticky top-0 bg-background/95 backdrop-blur z-30 py-4 border-b border-foreground/5">
                            <span className="h-8 w-1 bg-primary rounded-full" />
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-primary">Milestones</h3>
                                <h2 className={`font-black text-foreground ${selectedMilestoneId ? 'text-lg' : 'text-2xl'}`}>{selectedPhase.title}</h2>
                            </div>
                        </div>

                        {/* Debug logging moved to useEffect to avoid JSX issues */}

                        <div className="space-y-4">
                            {selectedPhase.milestones.map((milestone, mIdx) => {
                                const isSelected = selectedMilestoneId === milestone.id;
                                const taskCount = milestone.tasks?.length || 0;

                                return (
                                    <div
                                        key={milestone.id}
                                        onClick={() => {
                                            if (taskCount > 0) {
                                                toggleMilestoneSelection(milestone.id);
                                            }
                                        }}
                                        className={`glass-card rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden mb-4
                                            ${isSelected
                                                ? 'border-primary bg-primary/10 w-full'
                                                : 'border-foreground/5 bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.03]'}
                                        `}
                                    >
                                        {/* Card Header Strip */}
                                        <div className={`px-4 py-2 flex items-center justify-between border-b border-foreground/5 bg-muted/60 dark:bg-black/20`}>
                                            <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${milestone.isCompleted ? 'text-green-500' : 'text-foreground/50'}`}>
                                                Milestone {mIdx + 1}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider
                                                ${milestone.isCompleted ? 'bg-green-500 text-white' : 'bg-foreground/10 text-foreground/30'}
                                            `}>
                                                {milestone.isCompleted ? 'Completed' : 'Pending'}
                                            </span>
                                        </div>

                                        <div className="p-5">
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onMilestoneToggle && onMilestoneToggle(goal.id, selectedPhase.id, milestone.id, !milestone.isCompleted);
                                                    }}
                                                    className={`mt-1 size-6 rounded-lg border transition-all flex items-center justify-center shrink-0
                                                        ${milestone.isCompleted ? 'bg-green-500 border-green-500 text-foreground' : 'border-foreground/20 text-transparent hover:border-primary'}
                                                    `}
                                                >
                                                    <span className="material-symbols-outlined text-sm font-bold">check</span>
                                                </button>

                                                <div className="flex-1">
                                                    <h3 className={`font-bold transition-all mb-2 leading-tight ${milestone.isCompleted ? 'text-foreground/30 line-through' : ''} ${isSelected ? 'text-lg text-primary' : 'text-xl text-foreground'}`}>
                                                        {milestone.title}
                                                    </h3>
                                                    {taskCount > 0 && (
                                                        <div className="mb-2">
                                                            <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground/50'}`}>
                                                                {taskCount} tasks
                                                            </span>
                                                        </div>
                                                    )}
                                                    {!isSelected && (
                                                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">{milestone.description || "Complete this milestone to progress."}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Add Milestone Button */}
                            {addingItemType === 'milestone' ? (
                                <div className="flex gap-2 w-full mt-4">
                                    <input
                                        type="text"
                                        value={newItemTitle}
                                        onChange={(e) => setNewItemTitle(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
                                        placeholder="Enter milestone title..."
                                        className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleAddMilestone}
                                        disabled={!onAddMilestone}
                                        className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg transition-colors"
                                    >
                                        Add
                                    </button>
                                    <button
                                        onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                        className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => onAddMilestone ? setAddingItemType('milestone') : alert('Add Milestone: Feature not yet connected. Use the chat assistant.')}
                                    className="w-full mt-4 flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-primary hover:bg-primary/10 rounded-xl text-foreground/60 hover:text-primary transition-all"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    <span className="text-sm font-medium">Add Milestone</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* -------- TASK DETAIL COLUMN (Slide In from Milestone) -------- */}
                <div className={`flex-1 transition-all duration-500 flex flex-row gap-6
                    ${selectedMilestoneId ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none w-0 hidden'}
                `}>
                    {selectedMilestone && (
                        <div className={`transition-all duration-500 p-2
                            ${selectedTaskId ? 'w-[320px] shrink-0' : 'flex-1'}
                        `}>
                            <div className="flex items-center gap-4 mb-8 sticky top-0 bg-background/95 backdrop-blur z-30 py-4 border-b border-foreground/5">
                                <span className="h-8 w-1 bg-purple-500 rounded-full" />
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-purple-400">Tasks</h3>
                                    <h2 className="text-xl font-black text-foreground">{selectedMilestone.title}</h2>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {selectedMilestone.tasks && selectedMilestone.tasks.length > 0 ? (
                                    selectedMilestone.tasks.map((task, tIdx) => {
                                        const isSelected = selectedTaskId === task.id;
                                        const subTaskCount = task.subTasks?.length || 0;

                                        return (
                                            <div
                                                key={task.id}
                                                onClick={() => {
                                                    if (subTaskCount > 0) {
                                                        setSelectedTaskId(isSelected ? null : task.id);
                                                    }
                                                }}
                                                className={`glass-card rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
                                                    ${isSelected
                                                        ? 'border-purple-500 bg-purple-500/10 w-full'
                                                        : 'border-foreground/5 bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.03]'}
                                                `}
                                            >
                                                {/* Card Header Strip */}
                                                <div className={`px-4 py-2 flex items-center justify-between border-b border-foreground/5 bg-muted/60 dark:bg-black/20`}>
                                                    <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${task.isCompleted ? 'text-green-500' : 'text-purple-400'}`}>
                                                        Task {tIdx + 1}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider
                                                        ${task.isCompleted ? 'bg-green-500 text-white' : 'bg-foreground/10 text-foreground/30'}
                                                    `}>
                                                        {task.isCompleted ? 'Done' : 'ToDo'}
                                                    </span>
                                                </div>

                                                <div className="p-5">
                                                    <div className="flex gap-4 items-start">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onTaskToggle && onTaskToggle(task.id, !task.isCompleted);
                                                            }}
                                                            className={`mt-1 size-5 rounded border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all hover:scale-110
                                                            ${task.isCompleted ? 'bg-green-500 border-green-500 text-foreground' : 'border-foreground/30 hover:border-purple-500'}
                                                        `}>
                                                            {task.isCompleted && (
                                                                <span className="material-symbols-outlined text-xs">check</span>
                                                            )}
                                                        </button>
                                                        <div className="flex-1">
                                                            <h3 className={`font-bold mb-2 leading-tight ${task.isCompleted ? 'text-foreground/30 line-through' : ''} ${isSelected ? 'text-lg text-purple-400' : 'text-lg text-foreground'}`}>
                                                                {task.title}
                                                            </h3>
                                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                                {subTaskCount > 0 && (
                                                                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider ${isSelected ? 'bg-purple-500 text-white' : 'bg-foreground/10 text-foreground/50'}`}>
                                                                        {subTaskCount} subtasks
                                                                    </span>
                                                                )}
                                                                {/* NEW: Difficulty Badge */}
                                                                {task.difficulty && (
                                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${task.difficulty <= 2 ? 'bg-green-500/20 text-green-400' :
                                                                        task.difficulty <= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                                                                            task.difficulty <= 4 ? 'bg-orange-500/20 text-orange-400' :
                                                                                'bg-red-500/20 text-red-400'
                                                                        }`}>
                                                                        {task.difficulty}/5
                                                                    </span>
                                                                )}
                                                                {/* NEW: Cognitive Type Badge */}
                                                                {task.cognitiveType && (
                                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 text-foreground/60">
                                                                        {task.cognitiveType === 'deep_work' ? '🎯' :
                                                                            task.cognitiveType === 'learning' ? '📚' :
                                                                                task.cognitiveType === 'creative' ? '🎨' :
                                                                                    task.cognitiveType === 'admin' ? '📁' : '📋'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {task.description && !isSelected && (
                                                                <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">{task.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center py-8 text-foreground/40">
                                        <span className="material-symbols-outlined text-3xl mb-2">task_alt</span>
                                        <p>No tasks for this milestone</p>
                                    </div>
                                )}

                                {/* Add Task Button */}
                                {addingItemType === 'task' ? (
                                    <div className="flex gap-2 w-full mt-4">
                                        <input
                                            type="text"
                                            value={newItemTitle}
                                            onChange={(e) => setNewItemTitle(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                                            placeholder="Enter task title..."
                                            className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-purple-500"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleAddTask}
                                            disabled={!onAddTask}
                                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-foreground text-sm font-medium rounded-lg transition-colors"
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={() => { setAddingItemType(null); setNewItemTitle(''); }}
                                            className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => onAddTask ? setAddingItemType('task') : alert('Add Task: Feature not yet connected. Use the chat assistant.')}
                                        className="w-full mt-4 flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-purple-500 hover:bg-purple-500/10 rounded-xl text-foreground/60 hover:text-purple-400 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span>
                                        <span className="text-sm font-medium">Add Task</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* -------- SUBTASK DETAIL COLUMN (Slide In from Task) -------- */}
                <div className={`flex-1 transition-all duration-500 flex flex-col
                    ${selectedTaskId ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-20 pointer-events-none w-0 hidden'}
                `}>
                    {selectedTask && (
                        <div className="pb-20 p-2">
                            <div className="flex items-center gap-4 mb-8 sticky top-0 bg-background/95 backdrop-blur z-30 py-4 border-b border-foreground/5">
                                <span className="h-8 w-1 bg-blue-500 rounded-full" />
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-[0.3em] text-blue-400">Subtasks</h3>
                                    <h2 className="text-xl font-black text-foreground">{selectedTask.title}</h2>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {selectedTask.subTasks && selectedTask.subTasks.length > 0 ? (
                                    selectedTask.subTasks.map((subTask, stIdx) => (
                                        <div key={subTask.id} className="glass-card rounded-2xl border border-foreground/5 bg-foreground/[0.02] overflow-hidden hover:bg-foreground/[0.05] transition-all">
                                            {/* Header Strip for Subtask */}
                                            <div className={`px-4 py-2 flex items-center justify-between border-b border-foreground/5 bg-muted/60 dark:bg-black/20`}>
                                                <span className={`text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400`}>
                                                    Step {stIdx + 1}
                                                </span>
                                            </div>

                                            <div className="p-4 flex items-start gap-3">
                                                <div
                                                    onClick={() => onSubTaskToggle && onSubTaskToggle(goal.id, selectedPhaseId!, selectedMilestoneId!, subTask.id, !subTask.isCompleted)}
                                                    className={`mt-1 size-4 rounded border flex items-center justify-center cursor-pointer transition-colors shrink-0
                                                    ${subTask.isCompleted ? 'bg-green-500 border-green-500' : 'border-foreground/30 hover:border-foreground/50'}
                                                `}>
                                                    {subTask.isCompleted && (
                                                        <span className="material-symbols-outlined text-[10px] text-foreground font-bold">check</span>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <span className={`text-base font-medium leading-tight block ${subTask.isCompleted ? 'text-foreground/30 line-through' : 'text-foreground/90'}`}>
                                                        {subTask.title}
                                                    </span>
                                                    {subTask.description && (
                                                        <p className="text-muted-foreground text-xs mt-2">{subTask.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-foreground/40">
                                        <span className="material-symbols-outlined text-3xl mb-2">list</span>
                                        <p>No subtasks found</p>
                                    </div>
                                )}

                                {/* Add Subtask Section - only shows when a task is selected */}
                                {!isReadOnly && onAddSubTask && selectedTaskId && (
                                    <div className="mt-4">
                                        {isAddingSubTask ? (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newSubTaskTitle}
                                                    onChange={(e) => setNewSubTaskTitle(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubTask()}
                                                    placeholder="Enter subtask title..."
                                                    className="flex-1 bg-foreground/5 border border-foreground/10 rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleAddSubTask}
                                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-foreground text-sm font-medium rounded-lg transition-colors"
                                                >
                                                    Add
                                                </button>
                                                <button
                                                    onClick={() => { setIsAddingSubTask(false); setNewSubTaskTitle(''); }}
                                                    className="px-3 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground text-sm rounded-lg transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setIsAddingSubTask(true)}
                                                className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-foreground/20 hover:border-blue-500 hover:bg-blue-500/10 rounded-xl text-foreground/60 hover:text-blue-400 transition-all"
                                            >
                                                <span className="material-symbols-outlined text-lg">add</span>
                                                <span className="text-sm font-medium">Add Subtask</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PhaseExplorer;
