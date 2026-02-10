import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Goal, UserProfile, TimeConstraints } from '../types';
import type { CalendarEvent, EventType, EventStatus, CognitiveType } from '../constants/calendarTypes';
import { supabase } from '../lib/supabase';
import { sendChatbotMessage, type ChatMessage, type ChatbotContext } from '../services/gemini/chatbot';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface EventDetailModalProps {
  isOpen: boolean;
  event: CalendarEvent;
  goals: Goal[];
  calendarSchemaCapabilities?: {
    isLocked: boolean;
    difficulty: boolean;
    cognitiveType: boolean;
    effortMinutesAllocated: boolean;
    durationMinutes: boolean;
  };
  userProfile?: UserProfile;
  constraints?: TimeConstraints;
  calendarEvents?: CalendarEvent[];
  onClose: () => void;
  onSave: (updates: Partial<CalendarEvent>) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onToggleTask?: (taskId: string) => Promise<void> | void;
  onToggleSubTask?: (subtaskId: string) => Promise<void> | void;
}

const EventDetailModal: React.FC<EventDetailModalProps> = ({
  isOpen,
  event,
  goals,
  calendarSchemaCapabilities,
  userProfile,
  constraints,
  calendarEvents = [],
  onClose,
  onSave,
  onDelete,
  onToggleTask,
  onToggleSubTask,
}) => {
  const capabilities = useMemo(() => ({
    isLocked: calendarSchemaCapabilities?.isLocked ?? true,
    difficulty: calendarSchemaCapabilities?.difficulty ?? true,
    cognitiveType: calendarSchemaCapabilities?.cognitiveType ?? true,
    effortMinutesAllocated: calendarSchemaCapabilities?.effortMinutesAllocated ?? true,
    durationMinutes: calendarSchemaCapabilities?.durationMinutes ?? true,
  }), [calendarSchemaCapabilities]);

  // State
  const [title, setTitle] = useState(event.summary);
  const [description, setDescription] = useState(event.description || '');
  const [location, setLocation] = useState(event.location || '');
  const [eventType, setEventType] = useState<EventType>(event.eventType || 'task');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>(event.priority || 'medium');
  const [energyCost, setEnergyCost] = useState<'high' | 'medium' | 'low'>(event.energyCost || 'medium');
  const [status, setStatus] = useState<EventStatus>(event.status || 'scheduled');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(event.difficulty || 3);
  const [cognitiveType, setCognitiveType] = useState<CognitiveType>(event.cognitiveType || 'shallow_work');
  const [isLocked, setIsLocked] = useState<boolean>(!!event.isLocked);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [date, setDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkedItems, setLinkedItems] = useState<Array<{
    id: string;
    taskId: string | null;
    subtaskId: string | null;
    title: string;
    isCompleted: boolean;
    taskTitle?: string | null;
  }>>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [showCompletedItems, setShowCompletedItems] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatMessagesRef = useRef<ChatMessage[]>([]);

  // Resolve roadmap links for display
  const resolvedGoalId = event.goalId || event.ambitionOsMeta?.goalId;
  const resolvedPhaseId = event.phaseId || event.ambitionOsMeta?.phaseId;
  const resolvedMilestoneId = event.milestoneId || event.ambitionOsMeta?.milestoneId;

  const roadmapLookup = useMemo(() => {
    const goalById = new Map<string, Goal>();
    const phaseById = new Map<string, { id: string; title: string; goalId: string; coachAdvice?: string }>();
    const milestoneById = new Map<string, { id: string; title: string; phaseId: string; goalId: string }>();

    for (const goal of goals || []) {
      goalById.set(goal.id, goal);
      for (const phase of goal.phases || []) {
        phaseById.set(phase.id, { id: phase.id, title: phase.title, goalId: goal.id, coachAdvice: phase.coachAdvice });
        for (const milestone of phase.milestones || []) {
          milestoneById.set(milestone.id, {
            id: milestone.id,
            title: milestone.title,
            phaseId: phase.id,
            goalId: goal.id,
          });
        }
      }
    }

    return { goalById, phaseById, milestoneById };
  }, [goals]);

  const linkedGoal = resolvedGoalId ? roadmapLookup.goalById.get(resolvedGoalId) : undefined;
  const linkedPhase = resolvedPhaseId ? roadmapLookup.phaseById.get(resolvedPhaseId) : undefined;
  const linkedMilestone = resolvedMilestoneId ? roadmapLookup.milestoneById.get(resolvedMilestoneId) : undefined;

  // Initialize state on open
  useEffect(() => {
    if (isOpen) {
      setTitle(event.summary);
      setDescription(event.description || '');
      setLocation(event.location || '');
      setEventType(event.eventType || 'task');
      setPriority(event.priority || 'medium');
      setEnergyCost(event.energyCost || 'medium');
      setStatus(event.status || 'scheduled');
      setDifficulty(event.difficulty || 3);
      setCognitiveType(event.cognitiveType || 'shallow_work');
      setIsLocked(!!event.isLocked);
      setSaveError(null);
      setShowCompletedItems(false);
      setChecklistError(null);
      setIsChatOpen(false);
      setChatInput('');
      setChatMessages([]);

      const start = event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
          ? new Date(`${event.start.date}T00:00:00`)
          : new Date();
      const end = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
          ? new Date(`${event.end.date}T00:00:00`)
          : new Date(start.getTime() + 60 * 60 * 1000);

      setDate(format(start, 'yyyy-MM-dd'));
      setStartTime(format(start, 'HH:mm'));
      setEndTime(format(end, 'HH:mm'));

      loadLinkedItems();
    }
  }, [isOpen, event]);

  const loadLinkedItems = async () => {
    if (!event?.id) return;
    setIsLoadingItems(true);
    try {
      const { data, error } = await (supabase as any)
        .from('calendar_event_items')
        .select(`
          id, task_id, subtask_id, display_order,
          tasks ( id, title, is_completed ),
          subtasks ( id, title, is_completed )
        `)
        .eq('calendar_event_id', event.id)
        .order('display_order');

      if (error) throw error;

      if (data) {
        const fallbackTitle = linkedMilestone?.title || event.summary || 'Session item';
        setLinkedItems(data.map((row: any) => ({
          id: row.id,
          taskId: row.task_id,
          subtaskId: row.subtask_id,
          title: row.subtasks?.title || row.tasks?.title || fallbackTitle,
          isCompleted: row.subtasks?.is_completed ?? row.tasks?.is_completed ?? false,
          taskTitle: row.tasks?.title || null,
        })));
      } else {
        setLinkedItems([]);
      }
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : 'Failed to load checklist items.');
    } finally {
      setIsLoadingItems(false);
    }
  };

  const timezone = event.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const computedDurationMinutes = useMemo(() => {
    if (!date || !startTime || !endTime) return event.durationMinutes;
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return event.durationMinutes;
    const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
    return diff > 0 ? diff : event.durationMinutes;
  }, [date, startTime, endTime, event.durationMinutes]);

  const toComparableIso = (value?: string | null): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const proposedStartIso = useMemo(() => {
    const candidate = new Date(`${date}T${startTime}`);
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
  }, [date, startTime]);

  const proposedEndIso = useMemo(() => {
    const candidate = new Date(`${date}T${endTime}`);
    return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
  }, [date, endTime]);

  const scheduleValidationError = useMemo(() => {
    if (!proposedStartIso || !proposedEndIso) return 'Invalid date or time';
    if (new Date(proposedEndIso) <= new Date(proposedStartIso)) return 'End time must be after start time';
    return null;
  }, [proposedEndIso, proposedStartIso]);

  const previousStartIso = toComparableIso(event.start?.dateTime) ?? toComparableIso(event.start?.date ? `${event.start.date}T00:00:00` : null);
  const previousEndIso = toComparableIso(event.end?.dateTime) ?? toComparableIso(event.end?.date ? `${event.end.date}T00:00:00` : null);

  const hasUnsavedChanges = useMemo(() => {
    const previousDescription = event.description || '';
    const previousLocation = event.location || '';
    const previousEventType = event.eventType || 'task';
    const previousPriority = event.priority || 'medium';
    const previousEnergyCost = event.energyCost || 'medium';
    const previousDifficulty = event.difficulty || 3;
    const previousCognitiveType = event.cognitiveType || 'shallow_work';
    const previousIsLocked = !!event.isLocked;
    const previousDuration = event.durationMinutes;

    return (
      title !== event.summary ||
      description !== previousDescription ||
      location !== previousLocation ||
      eventType !== previousEventType ||
      priority !== previousPriority ||
      energyCost !== previousEnergyCost ||
      status !== (event.status || 'scheduled') ||
      (capabilities.difficulty && difficulty !== previousDifficulty) ||
      (capabilities.cognitiveType && cognitiveType !== previousCognitiveType) ||
      (capabilities.isLocked && isLocked !== previousIsLocked) ||
      (capabilities.durationMinutes && typeof computedDurationMinutes === 'number' && computedDurationMinutes !== previousDuration) ||
      proposedStartIso !== previousStartIso ||
      proposedEndIso !== previousEndIso
    );
  }, [
    title,
    event.summary,
    description,
    event.description,
    location,
    event.location,
    eventType,
    event.eventType,
    priority,
    event.priority,
    energyCost,
    event.energyCost,
    status,
    event.status,
    capabilities.difficulty,
    difficulty,
    event.difficulty,
    capabilities.cognitiveType,
    cognitiveType,
    event.cognitiveType,
    capabilities.isLocked,
    isLocked,
    event.isLocked,
    capabilities.durationMinutes,
    computedDurationMinutes,
    event.durationMinutes,
    proposedStartIso,
    previousStartIso,
    proposedEndIso,
    previousEndIso,
  ]);

  const checklistStats = useMemo(() => {
    const total = linkedItems.length;
    const completed = linkedItems.filter(i => i.isCompleted).length;
    return { total, completed };
  }, [linkedItems]);

  const checklistGroups = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; items: typeof linkedItems }>();
    for (const item of linkedItems) {
      const key = item.taskId || `standalone:${item.id}`;
      const title = item.taskTitle || linkedMilestone?.title || 'Session items';
      if (!groups.has(key)) groups.set(key, { id: key, title, items: [] });
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [linkedItems, linkedMilestone]);

  const eventTypeLabels: Record<EventType, string> = {
    goal_session: 'Ambition Session',
    task: 'Task',
    habit: 'Habit',
    milestone_deadline: 'Milestone Deadline',
    blocked: 'Blocked Time',
    imported: 'Imported',
  };

  const cognitiveTypeLabels: Record<CognitiveType, string> = {
    deep_work: 'Deep Work',
    shallow_work: 'Shallow Work',
    learning: 'Learning',
    creative: 'Creative',
    admin: 'Admin',
  };

  const schedulingInsight =
    event.schedulingReasoning ||
    event.aiMetadata?.scheduling?.reasoning ||
    event.rationale ||
    '';

  const coachAdvice = linkedPhase?.coachAdvice?.trim() || '';

  const visibleChecklistGroups = useMemo(() => {
    if (showCompletedItems) return checklistGroups;
    return checklistGroups
      .map(group => ({ ...group, items: group.items.filter(item => !item.isCompleted) }))
      .filter(group => group.items.length > 0);
  }, [checklistGroups, showCompletedItems]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  const handleSave = async (newStatus?: EventStatus): Promise<boolean> => {
    setIsSaving(true);
    setSaveError(null);
    try {
      if (scheduleValidationError) {
        setSaveError(scheduleValidationError);
        return false;
      }

      const startDateTime = proposedStartIso!;
      const endDateTime = proposedEndIso!;
      const nextStatus = newStatus || status;
      const currentStatus = event.status || 'scheduled';
      const shouldSetCompletedAt = nextStatus === 'completed' && currentStatus !== 'completed';
      const shouldClearCompletedAt = nextStatus !== 'completed' && currentStatus === 'completed';

      const previousDescription = event.description || '';
      const previousLocation = event.location || '';
      const previousEventType = event.eventType || 'task';
      const previousPriority = event.priority || 'medium';
      const previousEnergyCost = event.energyCost || 'medium';
      const previousDifficulty = event.difficulty || 3;
      const previousCognitiveType = event.cognitiveType || 'shallow_work';
      const previousIsLocked = !!event.isLocked;
      const previousDuration = event.durationMinutes;
      const nextDuration = computedDurationMinutes;

      const updates: Partial<CalendarEvent> = {};
      if (title !== event.summary) updates.summary = title;
      if (description !== previousDescription) updates.description = description;
      if (location !== previousLocation) updates.location = location;
      if (eventType !== previousEventType) updates.eventType = eventType;
      if (priority !== previousPriority) updates.priority = priority;
      if (energyCost !== previousEnergyCost) updates.energyCost = energyCost;
      if (nextStatus !== currentStatus) updates.status = nextStatus;
      if (capabilities.difficulty && difficulty !== previousDifficulty) updates.difficulty = difficulty;
      if (capabilities.cognitiveType && cognitiveType !== previousCognitiveType) updates.cognitiveType = cognitiveType;
      if (capabilities.isLocked && isLocked !== previousIsLocked) updates.isLocked = isLocked;
      if (capabilities.durationMinutes && typeof nextDuration === 'number' && nextDuration !== previousDuration) {
        updates.durationMinutes = nextDuration;
      }
      if (startDateTime !== previousStartIso) {
        updates.start = { dateTime: startDateTime, timeZone: event.start?.timeZone || timezone };
      }
      if (endDateTime !== previousEndIso) {
        updates.end = { dateTime: endDateTime, timeZone: event.end?.timeZone || timezone };
      }
      if (shouldSetCompletedAt) updates.completedAt = new Date().toISOString();
      if (shouldClearCompletedAt) updates.completedAt = null;

      if (Object.keys(updates).length === 0) {
        return true;
      }

      await onSave(updates);
      setSaveError(null);
      if (newStatus) setStatus(newStatus);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save event changes.';
      setSaveError(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const toggleComplete = async () => {
    const previousStatus = status;
    const newStatus = status === 'completed' ? 'scheduled' : 'completed';
    setStatus(newStatus);
    const saved = await handleSave(newStatus);
    if (!saved) setStatus(previousStatus);
  };

  const handleChecklistToggle = async (item: {
    id: string;
    taskId: string | null;
    subtaskId: string | null;
    isCompleted: boolean;
  }) => {
    const nextCompleted = !item.isCompleted;
    setChecklistError(null);
    setLinkedItems(prev => prev.map(p => p.id === item.id ? { ...p, isCompleted: nextCompleted } : p));

    try {
      if (item.subtaskId) {
        if (!onToggleSubTask) {
          throw new Error('Subtask updates are unavailable in this view.');
        }
        await onToggleSubTask(item.subtaskId);
      } else if (item.taskId) {
        if (!onToggleTask) {
          throw new Error('Task updates are unavailable in this view.');
        }
        await onToggleTask(item.taskId);
      } else {
        throw new Error('Checklist item is not linked to a task or subtask.');
      }
    } catch (error) {
      setLinkedItems(prev => prev.map(p => p.id === item.id ? { ...p, isCompleted: item.isCompleted } : p));
      const message = error instanceof Error ? error.message : 'Failed to update checklist item.';
      setChecklistError(message);
      return;
    }

    try {
      await loadLinkedItems();
    } catch {
      // Keep optimistic state if refresh fails after a successful toggle.
    }
  };

  const buildFocusedEventContext = (): ChatbotContext['focusedEvent'] => ({
    id: event.id,
    summary: title || event.summary,
    date,
    startTime,
    endTime,
    status,
    eventType,
    priority,
    energyCost,
    cognitiveType,
    difficulty,
    goal: linkedGoal ? { id: linkedGoal.id, title: linkedGoal.title } : undefined,
    phase: linkedPhase ? { id: linkedPhase.id, title: linkedPhase.title, coachAdvice: linkedPhase.coachAdvice } : undefined,
    milestone: linkedMilestone ? { id: linkedMilestone.id, title: linkedMilestone.title } : undefined,
    checklist: {
      total: checklistStats.total,
      completed: checklistStats.completed,
      items: linkedItems.slice(0, 20).map(item => ({
        title: item.title,
        isCompleted: item.isCompleted,
        type: item.subtaskId ? 'subtask' : item.taskId ? 'task' : 'milestone'
      }))
    },
    schedulingInsight: schedulingInsight || undefined,
  });

  const openChatWithPrompt = (prompt: string) => {
    setIsChatOpen(true);
    setChatInput(prompt);
    requestAnimationFrame(() => {
      const inputEl = document.getElementById('event-inline-chat-input');
      if (inputEl) (inputEl as HTMLInputElement).focus();
    });
  };

  const sendInlineChat = async () => {
    if (!chatInput.trim() || !userProfile || !constraints) return;
    const content = chatInput.trim();
    const userMessage: ChatMessage = {
      id: `inline-user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    const nextHistory = [...chatMessagesRef.current, userMessage];
    setChatMessages(nextHistory);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const context: ChatbotContext = {
        userProfile,
        goals,
        constraints,
        calendarEvents,
        currentDate: new Date(),
        currentView: 'calendar',
        focusedGoalId: linkedGoal?.id,
        focusedEvent: buildFocusedEventContext(),
      };

      const response = await sendChatbotMessage(content, nextHistory, context);
      const assistantMessage: ChatMessage = {
        id: `inline-assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden bg-card border border-border p-0">
        <DialogTitle className="sr-only">Event Details</DialogTitle>
        <DialogDescription className="sr-only">
          Review and edit event details, schedule, checklist status, and notes.
        </DialogDescription>
        <div className="flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-6 border-b border-border bg-card/80">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-3">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-wt="event-detail-title"
                  className="text-2xl font-semibold bg-transparent border-border/60"
                  placeholder="Event title"
                />
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wider">
                  <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">
                    {eventTypeLabels[eventType]}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border">
                    Priority: {priority}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border">
                    Energy: {energyCost}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border">
                    Focus: {cognitiveTypeLabels[cognitiveType]}
                  </span>
                  {isLocked && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
                      Locked
                    </span>
                  )}
                  {event.sessionIndex !== undefined && event.totalSessions !== undefined && (
                    <span className="px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border">
                      Session {event.sessionIndex}/{event.totalSessions}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{date} • {startTime}–{endTime}</span>
                  {computedDurationMinutes !== undefined ? <span>{computedDurationMinutes} min</span> : null}
                  <span>{timezone}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                <Button
                  variant={status === 'completed' ? 'default' : 'outline'}
                  onClick={toggleComplete}
                  data-wt="event-detail-complete"
                >
                  {status === 'completed' ? 'Completed' : 'Mark Complete'}
                </Button>
                <div className="w-[160px]">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EventStatus)}
                    className="mt-2 w-full bg-card border border-border text-foreground h-10 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="skipped">Skipped</option>
                    <option value="snoozed">Snoozed</option>
                    <option value="rescheduled">Rescheduled</option>
                    <option value="missed">Missed</option>
                  </select>
                </div>
              </div>
            </div>
            {saveError && (
              <div className="mt-3 text-xs text-red-500">{saveError}</div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Schedule */}
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Schedule</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Start</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">End</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-11" />
                </div>
              </div>
              {event.isRecurring && event.recurrenceRule && (
                <p className="text-xs text-muted-foreground">Repeats: {event.recurrenceRule}</p>
              )}
            </section>

            {/* Context */}
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Context</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ambition</Label>
                  <div className="text-sm text-foreground">{linkedGoal?.title || 'Not linked'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Phase</Label>
                  <div className="text-sm text-foreground">{linkedPhase?.title || '—'}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Milestone</Label>
                  <div className="text-sm text-foreground">{linkedMilestone?.title || '—'}</div>
                </div>
              </div>
              {(event.effortMinutesAllocated !== undefined || event.sessionIndex !== undefined) && (
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {event.sessionIndex !== undefined && event.totalSessions !== undefined && (
                    <span>Session {event.sessionIndex} of {event.totalSessions}</span>
                  )}
                  {event.effortMinutesAllocated !== undefined && (
                    <span>Effort allocated: {event.effortMinutesAllocated} min</span>
                  )}
                  {(computedDurationMinutes !== undefined || event.durationMinutes !== undefined) && (
                    <span>Scheduled block: {computedDurationMinutes ?? event.durationMinutes} min</span>
                  )}
                </div>
              )}
              {capabilities.effortMinutesAllocated === false && (
                <p className="text-xs text-amber-500">
                  Effort allocation field requires a schema upgrade.
                </p>
              )}
            </section>

            {/* Coach Advice */}
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Coach Advice</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openChatWithPrompt('Can you summarize and advise for this event?')}
                  >
                    Ask about this event
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!coachAdvice}
                    onClick={() => openChatWithPrompt('Using the coach advice below, how should I approach this session?')}
                  >
                    Ask Solulu
                  </Button>
                </div>
              </div>
              {coachAdvice ? (
                <div className="rounded-xl border border-border bg-card/60 p-4 text-sm text-foreground">
                  {coachAdvice}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No coach advice yet for this phase.
                </div>
              )}

              {isChatOpen && (
                <div className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Solulu Chat
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
                    {chatMessages.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        Ask anything about this session or the coach advice above.
                      </div>
                    )}
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "text-sm leading-relaxed",
                          msg.role === 'user' ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        <span className="font-semibold mr-2">
                          {msg.role === 'user' ? 'You' : 'Solulu'}:
                        </span>
                        {msg.content}
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="text-sm text-muted-foreground">Solulu is thinking…</div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="event-inline-chat-input"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendInlineChat();
                        }
                      }}
                      placeholder="Ask about this event…"
                      className="flex-1 h-10"
                      disabled={isChatLoading || !userProfile || !constraints}
                    />
                    <Button
                      onClick={() => void sendInlineChat()}
                      disabled={isChatLoading || !chatInput.trim() || !userProfile || !constraints}
                    >
                      Send
                    </Button>
                  </div>
                  {!userProfile || !constraints ? (
                    <div className="text-xs text-muted-foreground">
                      Chat needs your profile and schedule context.
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {/* Focus & Effort */}
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Focus & Effort</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Session Type</Label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as EventType)}
                    className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="goal_session">Ambition Session</option>
                    <option value="task">Task</option>
                    <option value="habit">Habit</option>
                    <option value="milestone_deadline">Milestone Deadline</option>
                    <option value="blocked">Blocked</option>
                    <option value="imported">Imported</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                    className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Energy</Label>
                  <select
                    value={energyCost}
                    onChange={(e) => setEnergyCost(e.target.value as 'high' | 'medium' | 'low')}
                    className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cognitive Type</Label>
                  <select
                    value={cognitiveType}
                    onChange={(e) => setCognitiveType(e.target.value as CognitiveType)}
                    disabled={!capabilities.cognitiveType}
                    className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="deep_work">Deep Work</option>
                    <option value="shallow_work">Shallow Work</option>
                    <option value="learning">Learning</option>
                    <option value="creative">Creative</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Difficulty</Label>
                    <span className="text-xs text-primary font-medium">{difficulty}/5</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficulty(level as 1 | 2 | 3 | 4 | 5)}
                        disabled={!capabilities.difficulty}
                        className={`flex-1 h-2 rounded-full transition-all ${level <= difficulty
                          ? level <= 2 ? 'bg-green-500' : level <= 3 ? 'bg-yellow-500' : level <= 4 ? 'bg-orange-500' : 'bg-red-500'
                          : 'bg-muted'
                          }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lock Event</Label>
                  <Button
                    type="button"
                    variant={isLocked ? 'default' : 'outline'}
                    onClick={() => setIsLocked(!isLocked)}
                    className="w-full"
                    disabled={!capabilities.isLocked}
                  >
                    {isLocked ? 'Locked' : 'Unlocked'}
                  </Button>
                  {!capabilities.isLocked && (
                    <p className="text-[11px] text-amber-500">Schema upgrade required to persist lock state.</p>
                  )}
                </div>
              </div>
              {(!capabilities.difficulty || !capabilities.cognitiveType) && (
                <p className="text-xs text-amber-500">
                  Some focus fields are disabled until your calendar schema is upgraded.
                </p>
              )}
            </section>

            {/* Notes */}
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notes</h3>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</Label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Add location"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</Label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Add notes..."
                    className="w-full bg-card border border-border rounded-xl p-3 text-base min-h-[320px] resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
                  />
                </div>
              </div>
            </section>

            {/* Checklist */}
            <section className="space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Session Checklist</h3>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-primary font-semibold">
                    {checklistStats.completed}/{checklistStats.total} done
                  </span>
                  {checklistStats.completed > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCompletedItems(prev => !prev)}
                      className="px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    >
                      Completed ({checklistStats.completed})
                    </button>
                  )}
                </div>
              </div>
              {checklistError && (
                <div className="text-xs text-red-500">{checklistError}</div>
              )}
              {isLoadingItems ? (
                <div className="text-sm text-muted-foreground">Loading checklist…</div>
              ) : visibleChecklistGroups.length > 0 ? (
                <div className="space-y-3">
                  {visibleChecklistGroups.map((group) => (
                    <div key={group.id} className="rounded-xl border border-border bg-card/60">
                      <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                        {group.title}
                      </div>
                      <div className="divide-y divide-border/60">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              void handleChecklistToggle(item);
                            }}
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
                          >
                            <div className={cn(
                              "mt-0.5 size-5 rounded border flex items-center justify-center",
                              item.isCompleted ? "bg-primary border-primary text-primary-foreground" : "border-border text-transparent"
                            )}>
                              <span className="material-symbols-outlined text-[14px]">check</span>
                            </div>
                            <div className="flex-1">
                              <div className={cn(
                                "text-sm font-medium",
                                item.isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                              )}>
                                {item.title}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {item.subtaskId ? 'Subtask' : item.taskId ? 'Task' : 'Milestone'}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {linkedItems.length === 0
                    ? 'No checklist items linked to this event.'
                    : 'All checklist items are completed.'}
                </div>
              )}
            </section>

            {/* Insight */}
            {schedulingInsight && (
              <section className="space-y-2 rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Scheduling Insight</h3>
                <p className="text-sm text-muted-foreground">{schedulingInsight}</p>
                {event.aiConfidenceScore ? (
                  <p className="text-xs text-muted-foreground">AI confidence: {event.aiConfidenceScore}%</p>
                ) : null}
              </section>
            )}
          </div>

          {/* Footer */}
          <div
            className="sticky bottom-0 z-10 p-4 sm:p-6 border-t border-border bg-card/95 backdrop-blur flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <div className="text-xs text-muted-foreground">
              Source: {event.source || 'manual'} • Sync: {event.syncStatus || 'local_only'}
              {!hasUnsavedChanges && !isSaving && (
                <span className="block sm:inline sm:ml-2 text-emerald-500">All changes saved</span>
              )}
              {scheduleValidationError && (
                <span className="block sm:inline sm:ml-2 text-red-500">{scheduleValidationError}</span>
              )}
            </div>
            <div className="flex gap-2 sm:gap-3">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button variant="destructive" onClick={onDelete} disabled={isSaving}>
                Delete
              </Button>
              <Button
                onClick={() => { void handleSave(); }}
                data-wt="event-detail-save"
                disabled={isSaving || !hasUnsavedChanges || !!scheduleValidationError}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EventDetailModal;
