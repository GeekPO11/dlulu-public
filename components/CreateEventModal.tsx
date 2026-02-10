import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { logger } from '../lib/logger';
import type { Goal } from '../types';
import type { CalendarEvent, EventType, CognitiveType } from '../constants/calendarTypes';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

// =============================================================================
// Types
// =============================================================================

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Partial<CalendarEvent>) => Promise<void> | void;
  goals: Goal[];
  initialDate?: Date;
  initialTime?: string;
  existingEvents?: CalendarEvent[];
}

// =============================================================================
// Component
// =============================================================================

const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  goals,
  initialDate,
  initialTime,
  existingEvents = [],
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(initialDate || new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(initialTime || '09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [eventType, setEventType] = useState<EventType>('task');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<string>('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [energyCost, setEnergyCost] = useState<'high' | 'medium' | 'low'>('medium');
  // NEW: Intelligence fields for research-backed scheduling
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [cognitiveType, setCognitiveType] = useState<CognitiveType>('shallow_work');
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [conflicts, setConflicts] = useState<CalendarEvent[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isLoading]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setLocation('');
      setSelectedDate(format(initialDate || new Date(), 'yyyy-MM-dd'));
      setStartTime(initialTime || '09:00');
      setEndTime(initialTime ? addHour(initialTime) : '10:00');
      setSelectedGoalId('');
      setEventType('task');
      setIsRecurring(false);
      setRecurrenceRule('FREQ=WEEKLY;BYDAY=MO,WE,FR');
      setPriority('medium');
      setEnergyCost('medium');
      // Reset intelligence fields
      setDifficulty(3);
      setCognitiveType('shallow_work');
      setIsLocked(false);
      setConflicts([]);
      setSaveError(null);
    }
  }, [isOpen, initialDate, initialTime]);

  // Check for conflicts when form values change
  useEffect(() => {
    if (selectedDate && startTime && endTime) {
      const detectedConflicts = checkConflicts(selectedDate, startTime, endTime);
      setConflicts(detectedConflicts);
    }
  }, [selectedDate, startTime, endTime, existingEvents]);

  const addHour = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const newHours = (hours + 1) % 24;
    return `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Helper function to extract time from dateTime
  const getTimeFromDateTime = (dateTime: string | Date | undefined): string | null => {
    if (!dateTime) return null;
    try {
      if (typeof dateTime === 'string') {
        const d = new Date(dateTime);
        if (Number.isNaN(d.getTime())) return null;
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
      if (dateTime instanceof Date) {
        return `${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}`;
      }
      return null;
    } catch { return null; }
  };

  const getTimeZoneOffsetMs = (timeZone: string, date: Date): number => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }

    let year = Number(map.year);
    let month = Number(map.month);
    let day = Number(map.day);
    let hour = Number(map.hour);
    const minute = Number(map.minute);
    const second = Number(map.second);

    if (hour === 24) {
      hour = 0;
      const rollover = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      rollover.setUTCDate(rollover.getUTCDate() + 1);
      year = rollover.getUTCFullYear();
      month = rollover.getUTCMonth() + 1;
      day = rollover.getUTCDate();
    }

    const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
    return asUTC - date.getTime();
  };

  const zonedDateTimeToUtcDate = (dateStr: string, timeStr: string, timeZone: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
    const offset1 = getTimeZoneOffsetMs(timeZone, utcGuess);
    const utc1 = new Date(utcGuess.getTime() - offset1);
    const offset2 = getTimeZoneOffsetMs(timeZone, utc1);
    return new Date(utcGuess.getTime() - offset2);
  };

  const parseRecurrenceDays = (rule?: string): number[] => {
    if (!rule) return [];
    const match = /BYDAY=([^;]+)/.exec(rule);
    if (!match) return [];
    const dayMap: Record<string, number> = {
      SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
    };
    return match[1]
      .split(',')
      .map(d => d.trim().toUpperCase())
      .map(d => dayMap[d])
      .filter(d => d !== undefined);
  };

  // Check for event conflicts
  const checkConflicts = (
    eventDate: string,
    startTime: string,
    endTime: string,
    excludeEventId?: string
  ): CalendarEvent[] => {
    const eventStart = new Date(`${eventDate}T${startTime}:00`);
    const eventEnd = new Date(`${eventDate}T${endTime}:00`);

    return existingEvents.filter(event => {
      if (excludeEventId && event.id === excludeEventId) return false;

      const timezone = event.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const isAllDay = !!event.isAllDay || (!!event.start?.date && !event.start?.dateTime);

      // Handle recurring events
      if (event.isRecurring) {
        const rule = event.recurrenceRule || (event.recurrence?.[0]?.replace(/^RRULE:/, '') ?? '');
        const freqMatch = /FREQ=([^;]+)/.exec(rule || '');
        const freq = freqMatch?.[1] || 'WEEKLY';
        const dayOfWeek = new Date(eventDate).getDay();

        if (freq === 'DAILY') {
          // Always occurs
        } else if (freq === 'WEEKLY') {
          const days = parseRecurrenceDays(rule);
          if (days.length > 0 && !days.includes(dayOfWeek)) return false;
        } else {
          // For unsupported recurrence patterns, skip conflict detection
          return false;
        }

        if (isAllDay) {
          return true;
        }

        const startTimeStr = getTimeFromDateTime(event.start?.dateTime || event.start?.date) || '09:00';
        const durationMs = (() => {
          const baseStart = event.start?.dateTime ? new Date(event.start.dateTime) : null;
          const baseEnd = event.end?.dateTime ? new Date(event.end.dateTime) : null;
          if (!baseStart || !baseEnd) return 60 * 60 * 1000;
          return Math.max(15 * 60 * 1000, baseEnd.getTime() - baseStart.getTime());
        })();

        const occStart = zonedDateTimeToUtcDate(eventDate, startTimeStr, timezone);
        const occEnd = new Date(occStart.getTime() + durationMs);
        return eventStart < occEnd && eventEnd > occStart;
      }

      // Non-recurring events
      if (isAllDay) {
        const startDateStr = event.start?.date || event.start?.dateTime?.slice(0, 10);
        const endDateStr = event.end?.date || event.end?.dateTime?.slice(0, 10) || startDateStr;
        if (!startDateStr) return false;

        const existingStart = new Date(`${startDateStr}T00:00:00`);
        const existingEnd = new Date(`${endDateStr}T00:00:00`);
        if (existingEnd.getTime() <= existingStart.getTime()) {
          existingEnd.setDate(existingEnd.getDate() + 1);
        }
        return eventStart < existingEnd && eventEnd > existingStart;
      }

      const eventStartTime = event.start?.dateTime;
      const eventEndTime = event.end?.dateTime;
      if (!eventStartTime || !eventEndTime) return false;
      const existingStart = new Date(eventStartTime);
      const existingEnd = new Date(eventEndTime);

      return eventStart < existingEnd && eventEnd > existingStart;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    setIsLoading(true);
    setSaveError(null);

    const startLocal = new Date(`${selectedDate}T${startTime}:00`);
    const endLocal = new Date(`${selectedDate}T${endTime}:00`);
    const startDateTime = startLocal.toISOString();
    const endDateTime = endLocal.toISOString();

    const start = startLocal;
    const end = endLocal;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setSaveError('Invalid start or end time');
      setIsLoading(false);
      return;
    }
    if (end <= start) {
      setSaveError('End time must be after start time');
      setIsLoading(false);
      return;
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const eventDraft: Partial<CalendarEvent> = {
      summary: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      start: { dateTime: startDateTime, timeZone },
      end: { dateTime: endDateTime, timeZone },
      goalId: selectedGoalId || undefined,
      eventType,
      priority,
      energyCost,
      isRecurring,
      recurrenceRule: isRecurring ? recurrenceRule : undefined,
      recurrence: isRecurring ? [`RRULE:${recurrenceRule}`] : undefined,
      source: 'manual',
      syncStatus: 'local_only',
      status: 'scheduled',
      rescheduleCount: 0,
      // NEW: Intelligence fields
      difficulty,
      cognitiveType,
      isLocked,
    };

    try {
      await onSave(eventDraft);
      onClose();
    } catch (err: any) {
      logger.error('[CreateEventModal] Failed to create event', err);
      setSaveError(err?.message || 'Failed to create event');
    } finally {
      setIsLoading(false);
    }
  };

  // EventType must match the defined types in calendarTypes.ts
  const eventTypes: { value: EventType; label: string; icon: string }[] = [
    { value: 'goal_session', label: 'Ambition Session', icon: 'flag' },
    { value: 'task', label: 'Task', icon: 'task_alt' },
    { value: 'habit', label: 'Habit', icon: 'repeat' },
    { value: 'milestone_deadline', label: 'Milestone Deadline', icon: 'event' },
    { value: 'blocked', label: 'Blocked Time', icon: 'block' },
  ];

  // =============================================================================
  // Render
  // =============================================================================

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-card border border-border p-0 gap-0 shadow-2xl">
        <DialogDescription className="sr-only">
          Create a calendar event with schedule, ambition link, and focus metadata.
        </DialogDescription>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border/60">
          <DialogTitle className="text-lg font-medium text-foreground">Create Event</DialogTitle>
          {/* Close button is handled by DialogPrimitive, but we can add a custom one if needed. 
              Radix default close button is usually fine, but the design shows a simple X. */}
        </div>

        <div className="p-6 space-y-5">
          {/* Event Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Event Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g. Deep Work: Funnel Optimization"
              data-wt="create-event-title"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground h-11 focus:ring-1 focus:ring-primary/50 focus:border-primary/50 rounded-xl"
              autoFocus
            />
          </div>

          {/* Linked Ambition */}
          <div className="space-y-1.5">
            <Label htmlFor="goal" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Linked Ambition
            </Label>
            <div className="relative">
              <select
                id="goal"
                value={selectedGoalId}
                onChange={(e) => setSelectedGoalId(e.target.value)}
                className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 cursor-pointer"
              >
                <option value="">No ambition linked</option>
                {goals.map(goal => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <span className="material-symbols-outlined text-[20px]">expand_more</span>
              </div>
            </div>
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-2 gap-4" data-wt="create-event-datetime">
            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Date
              </Label>
              <div className="relative">
                <Input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-card border-border text-foreground h-11 pl-3 pr-2 rounded-xl focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Time Range */}
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Time
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="bg-card border-border text-foreground h-11 px-2 rounded-xl focus:ring-1 focus:ring-primary/50 text-center min-w-0"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  id="end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="bg-card border-border text-foreground h-11 px-2 rounded-xl focus:ring-1 focus:ring-primary/50 text-center min-w-0"
                />
              </div>
            </div>
          </div>

          {/* Session Type (Event Type) */}
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Session Type
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {eventTypes.slice(0, 3).map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setEventType(type.value)}
                  className={`
                    flex flex-col items-center justify-center gap-1 h-[72px] rounded-xl border transition-all duration-200
                    ${eventType === type.value
                      ? 'bg-primary/10 border-primary text-primary shadow-[0_0_15px_hsl(var(--primary)/0.15)]'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground'}
                  `}
                >
                  <span className={`material-symbols-outlined text-2xl ${eventType === type.value ? 'text-primary' : 'text-muted-foreground'}`}>
                    {type.icon}
                  </span>
                  <span className="text-[11px] font-medium">{type.label}</span>
                </button>
              ))}
            </div>
            {/* Show remaining types in a small dropdown or secondary row if needed, 
                or just assume the top 3 are primary. For "match design", we stick to the grid. 
                But to ensure "all fields", let's include the others in a simpler way if selected 
                or just put them in the grid? Let's expand the grid to fit all if logical.
                Actually, let's keep it simple: 3 columns. If there are more, we wrap.
            */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {eventTypes.slice(3).map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setEventType(type.value)}
                  className={`
                      flex items-center justify-center gap-2 h-10 rounded-xl border transition-all duration-200 px-3
                      ${eventType === type.value
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted/60'}
                    `}
                >
                  <span className="material-symbols-outlined text-lg">{type.icon}</span>
                  <span className="text-[11px] font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority, Energy, Recurrence - Collapsible or just simplified fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="priority" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Priority
              </Label>
              <div className="relative">
                <select
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <span className="material-symbols-outlined text-[20px]">expand_more</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="energy" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                Energy
              </Label>
              <div className="relative">
                <select
                  id="energy"
                  value={energyCost}
                  onChange={(e) => setEnergyCost(e.target.value as any)}
                  className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="high">High Voltage</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low Key</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                  <span className="material-symbols-outlined text-[20px]">expand_more</span>
                </div>
              </div>
            </div>
          </div>

          {/* NEW: Intelligence Fields Row */}
          <div className="space-y-3">
            {/* Difficulty Slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Difficulty
                </Label>
                <span className="text-xs text-primary font-medium">{difficulty}/5</span>
              </div>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setDifficulty(level as 1 | 2 | 3 | 4 | 5)}
                    className={`flex-1 h-2 rounded-full transition-all duration-200 ${level <= difficulty
                        ? level <= 2 ? 'bg-green-500' : level <= 3 ? 'bg-yellow-500' : level <= 4 ? 'bg-orange-500' : 'bg-red-500'
                        : 'bg-muted'
                      }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {difficulty === 1 ? 'Easy task' : difficulty === 2 ? 'Moderate' : difficulty === 3 ? 'Standard' : difficulty === 4 ? 'Challenging' : 'Very difficult'}
              </p>
            </div>

            {/* Cognitive Type & Lock Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Task Type
                </Label>
                <div className="relative">
                  <select
                    value={cognitiveType}
                    onChange={(e) => setCognitiveType(e.target.value as CognitiveType)}
                    className="w-full bg-card border border-border text-foreground h-11 px-3 rounded-xl text-base appearance-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="deep_work">🎯 Deep Work</option>
                    <option value="shallow_work">📋 Shallow Work</option>
                    <option value="learning">📚 Learning</option>
                    <option value="creative">🎨 Creative</option>
                    <option value="admin">📁 Admin</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    <span className="material-symbols-outlined text-[20px]">expand_more</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                  Lock Event
                </Label>
                <button
                  type="button"
                  onClick={() => setIsLocked(!isLocked)}
                  className={`w-full h-11 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 ${isLocked
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-card border-border text-muted-foreground hover:bg-muted/60'
                    }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {isLocked ? 'lock' : 'lock_open'}
                  </span>
                  <span className="text-sm font-medium">
                    {isLocked ? 'Locked' : 'Unlocked'}
                  </span>
                </button>
                {isLocked && (
                  <p className="text-[10px] text-primary/70">Won't auto-reschedule</p>
                )}
              </div>
            </div>
          </div>

          {/* Description (Optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="desc" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Description
            </Label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes..."
              className="w-full bg-card border border-border text-foreground rounded-xl p-3 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
          </div>

          {/* Location (Optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="location" className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              Location
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="bg-card border-border text-foreground h-11 focus:ring-1 focus:ring-primary/50 focus:border-primary/50 rounded-xl"
            />
          </div>

          {/* Errors / Conflicts */}
          {conflicts.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex gap-3">
              <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
              <div className="text-xs text-amber-200/80">
                <p className="font-medium">Conflict Detected</p>
                <p>{conflicts.length} overlapping event{conflicts.length > 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-300">
              {saveError}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || isLoading}
            data-wt="create-event-save"
            className="flex-1 h-12 rounded-xl bg-brand-gradient hover:opacity-90 transition-opacity text-primary-foreground font-medium shadow-lg shadow-primary/20"
          >
            {isLoading ? 'Creating...' : 'Create Event'}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
};

export default CreateEventModal;
