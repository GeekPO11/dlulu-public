import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  isToday,
  isSameDay,
  isSameMonth,
  isSameYear,
  getDay,
  getDaysInMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  parseISO,
} from 'date-fns';
import type { CalendarEvent } from '../constants/calendarTypes';
import { Button } from './ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
  Filter,
  Target,
  ZoomIn,
  ZoomOut,
  Check,
  LayoutGrid,
} from 'lucide-react';
import {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetClose,
} from './ui/bottom-sheet';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { cn } from '../lib/utils';
import { analytics, AnalyticsEvents } from '../lib/analytics';

// =============================================================================
// Types
// =============================================================================

type CalendarViewMode = 'year' | 'month' | 'week' | 'day';
type HoveredEvent = { event: CalendarEvent; rect: DOMRect };

interface CalendarViewProps {
  events: CalendarEvent[];
  goals: any[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent, meta?: { mode: 'preview' | 'commit' }) => void;
  onTimeSlotClick?: (date: Date, time: string) => void;
  onCreateEvent?: () => void;
  hideHeader?: boolean;
  constraints?: {
    peakStart?: string;
    peakEnd?: string;
  };
  userProfile?: {
    name?: string;
    avatarUrl?: string;
  };
  embedded?: boolean; // If true, hides header/sidebar and simplifies UI
}

interface FilterState {
  search: string;
  eventTypes: string[];
  sources: string[];
  statuses: string[];
}

// =============================================================================
// Constants
// =============================================================================

const HOUR_HEIGHT = 60;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// Event type colors (Stitch Theme)
const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  goal_session: { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-primary' },
  task: { bg: 'bg-cyan-500', text: 'text-white', border: 'border-cyan-600' },
  meeting: { bg: 'bg-purple-500', text: 'text-white', border: 'border-purple-600' },
  habit: { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-600' },
  milestone_deadline: { bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-600' },
  blocked: { bg: 'bg-slate-600', text: 'text-white', border: 'border-slate-700' },
  default: { bg: 'bg-primary', text: 'text-primary-foreground', border: 'border-primary' },
};

// =============================================================================
// Utility Functions
// =============================================================================

const parseDateTime = (dateTime: string | Date | undefined): Date | null => {
  if (!dateTime) return null;
  if (dateTime instanceof Date) return dateTime;
  if (typeof dateTime === 'string') {
    // Treat date-only strings as local dates to avoid UTC shift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTime)) {
      const [year, month, day] = dateTime.split('-').map(Number);
      if (!year || !month || !day) return null;
      return new Date(year, month - 1, day, 0, 0, 0, 0);
    }
  }
  try {
    const parsed = new Date(dateTime);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const formatLocalDate = (date: Date): string => format(date, 'yyyy-MM-dd');

const resolveEventDateKey = (eventDate?: { date?: string; dateTime?: string }): string | null => {
  if (eventDate?.date) return eventDate.date;
  const parsed = parseDateTime(eventDate?.dateTime);
  return parsed ? formatLocalDate(parsed) : null;
};

const getTimeFromDateTime = (dateTime: string | Date | undefined): string | null => {
  const date = parseDateTime(dateTime);
  if (!date) return null;
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const formatTime12h = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatHour12h = (hour: number): string => {
  if (hour === 0 || hour === 24) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour > 12) return `${hour - 12} PM`;
  return `${hour} AM`;
};

const getLocalTimeZone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

const getEventDuration = (event: CalendarEvent): number => {
  const startDate = parseDateTime(event.start?.dateTime || event.start?.date);
  const endDate = parseDateTime(event.end?.dateTime || event.end?.date);
  if (!startDate || !endDate) return 60;
  const durationMs = endDate.getTime() - startDate.getTime();
  return Math.max(30, Math.floor(durationMs / (1000 * 60)));
};

const eventOccursOnDay = (event: CalendarEvent, day: Date): boolean => {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayKey = formatLocalDate(dayStart);

  const isAllDay = !!event.isAllDay || (!!event.start?.date && !event.start?.dateTime);

  if (isAllDay) {
    const startKey = resolveEventDateKey(event.start);
    if (!startKey) return false;
    let endKey = resolveEventDateKey(event.end);

    if (!endKey || endKey <= startKey) {
      const startDate = new Date(`${startKey}T00:00:00`);
      startDate.setDate(startDate.getDate() + 1);
      endKey = formatLocalDate(startDate);
    }

    return dayKey >= startKey && dayKey < endKey;
  }

  const startDate = parseDateTime(event.start?.dateTime || event.start?.date);
  if (!startDate) return false;

  let endDate = parseDateTime(event.end?.dateTime || event.end?.date);
  if (!endDate) {
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
  }

  // Use half-open overlap to avoid double-counting midnight endings.
  return startDate < dayEnd && endDate > dayStart;
};

const getEventTypeColor = (eventType?: string) => {
  return EVENT_TYPE_COLORS[eventType || ''] || EVENT_TYPE_COLORS.default;
};

type EventLayout = { col: number; cols: number };

const buildOverlapLayout = (events: CalendarEvent[]): Record<string, EventLayout> => {
  const items = events
    .map((event) => {
      const start = parseDateTime(event.start?.dateTime || event.start?.date);
      const end = parseDateTime(event.end?.dateTime || event.end?.date);
      if (!start || !end) return null;
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      return { event, startMinutes, endMinutes };
    })
    .filter(Boolean) as Array<{ event: CalendarEvent; startMinutes: number; endMinutes: number }>;

  items.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  const layout: Record<string, EventLayout> = {};
  let active: Array<{ event: CalendarEvent; endMinutes: number; col: number }> = [];
  let clusterEvents: Array<{ event: CalendarEvent; col: number }> = [];
  let clusterMaxCols = 1;

  const finalizeCluster = () => {
    if (clusterEvents.length === 0) return;
    for (const item of clusterEvents) {
      layout[item.event.id] = { col: item.col, cols: clusterMaxCols };
    }
    clusterEvents = [];
    clusterMaxCols = 1;
  };

  for (const item of items) {
    active = active.filter((a) => a.endMinutes > item.startMinutes);
    if (active.length === 0) {
      finalizeCluster();
    }

    const usedCols = new Set(active.map((a) => a.col));
    let col = 0;
    while (usedCols.has(col)) col++;

    active.push({ event: item.event, endMinutes: item.endMinutes, col });
    clusterEvents.push({ event: item.event, col });
    clusterMaxCols = Math.max(clusterMaxCols, active.length);
  }

  finalizeCluster();
  return layout;
};

const buildHoverTitle = (event: CalendarEvent): string => {
  const startDate = parseDateTime(event.start?.dateTime || event.start?.date);
  const endDate = parseDateTime(event.end?.dateTime || event.end?.date);
  const isAllDay = event.isAllDay || (!!event.start?.date && !event.start?.dateTime);
  const startTime = getTimeFromDateTime(event.start?.dateTime || event.start?.date);
  const endTime = getTimeFromDateTime(event.end?.dateTime || event.end?.date);

  const dateLabel = startDate ? format(startDate, 'EEE, MMM d, yyyy') : '';
  const timeLabel = isAllDay
    ? 'All day'
    : startTime && endTime
      ? `${startTime} - ${endTime}`
      : '';

  const description = event.description
    ? event.description.replace(/Session checklist:|Ambition:.*|Manifestation:.*|Phase:.*|Milestone:.*/g, '').trim()
    : '';

  return [
    event.summary,
    dateLabel && timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel || timeLabel,
    event.location ? `Location: ${event.location}` : '',
    description
  ].filter(Boolean).join('\n');
};

const renderEventHoverCard = (hoveredEvent: HoveredEvent | null) => {
  if (!hoveredEvent || typeof document === 'undefined') return null;

  const { event, rect } = hoveredEvent;
  const eventType = event.eventType || event.ambitionOsMeta?.eventType || 'default';
  const colors = getEventTypeColor(eventType);
  const startDate = parseDateTime(event.start?.dateTime || event.start?.date);
  const endDate = parseDateTime(event.end?.dateTime || event.end?.date);
  if (!startDate) return null;

  const isAllDay = event.isAllDay || (!!event.start?.date && !event.start?.dateTime);
  const startTime = getTimeFromDateTime(event.start?.dateTime || event.start?.date);
  const endTime = getTimeFromDateTime(event.end?.dateTime || event.end?.date);
  const timeLabel = isAllDay ? 'All day' : `${startTime} - ${endTime}`;

  const cardWidth = 260;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  const preferredLeft = rect.right + 12;
  const left = preferredLeft + cardWidth > viewportWidth - 8
    ? Math.max(8, rect.left - cardWidth - 12)
    : preferredLeft;
  const top = Math.max(8, Math.min(rect.top, viewportHeight - 220));

  const description = event.description
    ? event.description.replace(/Session checklist:|Ambition:.*|Manifestation:.*|Phase:.*|Milestone:.*/g, '').trim()
    : '';

  return createPortal(
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${cardWidth}px`,
        filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))'
      }}
    >
      <div className={cn(
        "glass-modal p-4 rounded-xl border border-border",
        colors.border
      )}>
        <div className="flex items-center gap-2 mb-2">
          <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider", colors.bg, colors.text)}>
            {eventType.replace('_', ' ')}
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {timeLabel}
          </span>
        </div>
        <h3 className="text-sm font-bold text-foreground mb-1 leading-tight">
          {event.summary}
        </h3>
        <div className="text-[10px] text-muted-foreground mb-2">
          {format(startDate, 'EEE, MMM d')}
          {!isAllDay && endDate ? ` · ${getEventDuration(event)} min` : ''}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {description}
          </p>
        )}

        <div className="flex flex-wrap gap-1 mt-3">
          {event.phaseId && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground/80">
              Phase Linked
            </span>
          )}
          {event.location && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground/80 flex items-center gap-1">
              <span className="material-symbols-outlined text-[10px]">location_on</span>
              {event.location}
            </span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground/80 flex items-center gap-1">
            <span className="material-symbols-outlined text-[10px]">bolt</span>
            {event.energyCost || 'Medium'}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

// =============================================================================
// Recurring Event Generation
// =============================================================================

const generateRecurringInstances = (event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] => {
  if (!event.recurrence || event.recurrence.length === 0) return [];

  const instances: CalendarEvent[] = [];
  const rruleStr = event.recurrence[0].replace(/^RRULE:/, '');

  const freqMatch = rruleStr.match(/FREQ=(\w+)/);
  const freq = freqMatch ? freqMatch[1] : null;

  const byDayMatch = rruleStr.match(/BYDAY=([^;]+)/);
  const byDay = byDayMatch ? byDayMatch[1].split(',') : [];

  const eventStart = parseDateTime(event.start?.dateTime || event.start?.date);
  if (!eventStart) return [];

  const originalTime = getTimeFromDateTime(event.start?.dateTime);
  if (!originalTime) return [];

  const duration = getEventDuration(event);

  const dayMap: Record<string, number> = {
    'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
  };

  const currentDate = new Date(eventStart);
  let iterations = 0;
  const maxIterations = 365;

  while (currentDate <= rangeEnd && iterations < maxIterations) {
    iterations++;

    const isInRange = currentDate >= rangeStart && currentDate <= rangeEnd;
    let matchesPattern = false;
    const dayOfWeek = currentDate.getDay();

    if (freq === 'DAILY') {
      matchesPattern = true;
    } else if (freq === 'WEEKLY') {
      matchesPattern = byDay.length === 0
        ? dayOfWeek === eventStart.getDay()
        : byDay.some(day => dayMap[day] === dayOfWeek);
    } else if (freq === 'MONTHLY') {
      matchesPattern = currentDate.getDate() === eventStart.getDate();
    } else if (freq === 'YEARLY') {
      matchesPattern = currentDate.getMonth() === eventStart.getMonth()
        && currentDate.getDate() === eventStart.getDate();
    }

    if (matchesPattern && isInRange) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const instanceStartLocal = new Date(`${dateStr}T${originalTime}:00`);
      const instanceEndLocal = new Date(instanceStartLocal.getTime() + duration * 60000);

      instances.push({
        ...event,
        id: `${event.id}-instance-${dateStr}`,
        start: {
          dateTime: instanceStartLocal.toISOString(),
          timeZone: event.start?.timeZone || getLocalTimeZone(),
        },
        end: {
          dateTime: instanceEndLocal.toISOString(),
          timeZone: event.end?.timeZone || getLocalTimeZone(),
        },
        recurringEventId: event.id,
      });
    }

    if (freq === 'DAILY') {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (freq === 'WEEKLY') {
      if (byDay.length > 0) {
        for (let i = 0; i < 7; i++) {
          currentDate.setDate(currentDate.getDate() + 1);
          if (byDay.some(day => dayMap[day] === currentDate.getDay())) break;
        }
      } else {
        currentDate.setDate(currentDate.getDate() + 7);
      }
    } else if (freq === 'MONTHLY') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else if (freq === 'YEARLY') {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return instances;
};

// =============================================================================
// Year View Component
// =============================================================================

interface YearViewProps {
  year: number;
  events: CalendarEvent[];
  onMonthClick: (month: number) => void;
  onDayClick: (date: Date) => void;
  variant?: 'desktop' | 'mobile';
  selectedDate?: Date;
}

const YearView: React.FC<YearViewProps> = ({
  year,
  events,
  onMonthClick,
  onDayClick,
  variant = 'desktop',
  selectedDate,
}) => {
  const isMobile = variant === 'mobile';
  // Pre-calculate which days have events for the entire year
  const eventDays = useMemo(() => {
    const days = new Set<string>();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    events.forEach(event => {
      if (event.recurrence && event.recurrence.length > 0) {
        const instances = generateRecurringInstances(event, yearStart, yearEnd);
        instances.forEach(inst => {
          const startDate = parseDateTime(inst.start?.dateTime || inst.start?.date);
          if (startDate) days.add(format(startDate, 'yyyy-MM-dd'));
        });
      } else {
        const startDate = parseDateTime(event.start?.dateTime || event.start?.date);
        if (startDate && startDate.getFullYear() === year) {
          days.add(format(startDate, 'yyyy-MM-dd'));
        }
      }
    });

    return days;
  }, [events, year]);

  if (isMobile) {
    return (
      <div className="flex-1 overflow-y-auto pb-24 px-4">
        <div className="space-y-3 pb-6">
          {Array.from({ length: 12 }, (_, monthIndex) => {
            const monthStart = new Date(year, monthIndex, 1);
            const daysInMonth = getDaysInMonth(monthStart);
            const isSelectedMonth = selectedDate ? isSameMonth(monthStart, selectedDate) : false;
            const bookedDays = Array.from({ length: daysInMonth }, (_, dayIndex) => dayIndex + 1)
              .filter((dayNumber) => {
                const date = new Date(year, monthIndex, dayNumber);
                return eventDays.has(format(date, 'yyyy-MM-dd'));
              });

            const visibleBookedDays = bookedDays.slice(0, 14);

            return (
              <div
                key={monthIndex}
                className={cn(
                  "rounded-2xl border p-4 transition-all cursor-pointer",
                  isSelectedMonth ? "border-primary/60 bg-primary/10" : "border-border bg-card/50"
                )}
                onClick={() => onMonthClick(monthIndex)}
                data-wt="calendar-year-month-card"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className={cn("text-base font-bold", isSelectedMonth ? "text-primary" : "text-foreground")}>
                    {MONTH_NAMES[monthIndex]}
                  </h3>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {bookedDays.length} booked
                  </span>
                </div>

                {bookedDays.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No booked dates</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {visibleBookedDays.map((dayNumber) => {
                      const date = new Date(year, monthIndex, dayNumber);
                      const isCurrentDay = isToday(date);
                      const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                      return (
                        <button
                          key={dayNumber}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDayClick(date);
                          }}
                          className={cn(
                            "h-8 min-w-8 px-2 rounded-full text-xs font-bold border transition-colors",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : isCurrentDay
                                ? "border-primary text-primary bg-primary/10"
                                : "border-primary/50 text-foreground bg-primary/5"
                          )}
                          data-wt="calendar-year-marker"
                        >
                          {dayNumber}
                        </button>
                      );
                    })}
                    {bookedDays.length > visibleBookedDays.length && (
                      <span className="h-8 px-3 inline-flex items-center rounded-full text-xs font-semibold border border-border text-muted-foreground">
                        +{bookedDays.length - visibleBookedDays.length}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 p-6 pb-24 xl:pb-0 overflow-y-auto h-full">
      {Array.from({ length: 12 }, (_, monthIndex) => {
        const monthStart = new Date(year, monthIndex, 1);
        const daysInMonth = getDaysInMonth(monthStart);
        const startDay = getDay(monthStart);

        return (
          <div
            key={monthIndex}
            className="glass-card rounded-2xl p-4 hover:border-primary/50 transition-all cursor-pointer group hover:scale-[1.02] bg-card/50"
            onClick={() => onMonthClick(monthIndex)}
          >
            {/* Month Header */}
            <h3 className="text-sm font-bold text-foreground mb-3 group-hover:text-primary transition-colors uppercase tracking-widest pl-1">
              {MONTH_NAMES[monthIndex]}
            </h3>

            {/* Mini Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-[10px]">
              {/* Day headers */}
              {DAY_NAMES_SHORT.map((day, i) => (
                <div key={i} className="text-center text-muted-foreground font-bold h-4">
                  {day}
                </div>
              ))}

              {/* Empty cells before month starts */}
              {Array.from({ length: startDay }, (_, i) => (
                <div key={`empty-${i}`} className="h-6" />
              ))}

              {/* Days */}
              {Array.from({ length: daysInMonth }, (_, dayIndex) => {
                const date = new Date(year, monthIndex, dayIndex + 1);
                const dateStr = format(date, 'yyyy-MM-dd');
                const hasEvent = eventDays.has(dateStr);
                const isCurrentDay = isToday(date);

                return (
                  <div
                    key={dayIndex}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayClick(date);
                    }}
                    className={cn(
                      "h-6 w-6 flex items-center justify-center rounded-full text-[10px] relative cursor-pointer transition-all border",
                      isCurrentDay
                        ? "bg-primary text-primary-foreground font-bold border-primary shadow-md shadow-primary/20"
                        : hasEvent
                          ? "text-foreground border-primary/70 bg-primary/10"
                          : "text-muted-foreground/90 border-transparent hover:bg-muted hover:text-foreground",
                    )}
                    data-wt={hasEvent ? "calendar-year-marker" : undefined}
                  >
                    {dayIndex + 1}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// =============================================================================
// Month View Component
// =============================================================================

interface MonthViewProps {
  date: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onTimeSlotClick?: (date: Date, time: string) => void;
  variant?: 'desktop' | 'mobile';
  selectedDate?: Date;
}

const MonthView: React.FC<MonthViewProps> = ({
  date,
  events,
  onDayClick,
  onEventClick,
  onTimeSlotClick,
  variant = 'desktop',
  selectedDate,
}) => {
  const isMobile = variant === 'mobile';
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const [hoveredEvent, setHoveredEvent] = useState<HoveredEvent | null>(null);
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  const weeks = useMemo(() => {
    return eachWeekOfInterval(
      { start: calendarStart, end: calendarEnd },
      { weekStartsOn: 0 }
    );
  }, [calendarStart, calendarEnd]);

  // Get events for a specific day (including recurring)
  const getEventsForDay = useCallback((day: Date): CalendarEvent[] => {
    const dayEvents: CalendarEvent[] = [];

    events.forEach(event => {
      if (event.recurrence && event.recurrence.length > 0) {
        const instances = generateRecurringInstances(event, day, day);
        dayEvents.push(...instances);
      } else if (eventOccursOnDay(event, day)) {
        dayEvents.push(event);
      }
    });

    return dayEvents.sort((a, b) => {
      const startA = parseDateTime(a.start?.dateTime);
      const startB = parseDateTime(b.start?.dateTime);
      if (!startA || !startB) return 0;
      return startA.getTime() - startB.getTime();
    });
  }, [events]);

  useEffect(() => {
    setHoveredEvent(null);
    setHoveredDayKey(null);
    setExpandedDayKey(null);
  }, [date, events.length]);

  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto pb-24">
        {/* Day headers */}
        <div className="grid grid-cols-7 px-4 pb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest border-b border-border/60">
          {DAY_NAMES_SHORT.map((day, i) => (
            <div key={i} className="text-center">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex-1">
          {weeks.map((weekStart, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b border-border/40 last:border-b-0">
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const currentDay = addDays(weekStart, dayIndex);
                const isCurrentMonth = isSameMonth(currentDay, date);
                const isCurrentDay = isToday(currentDay);
                const isSelected = selectedDate ? isSameDay(currentDay, selectedDate) : false;
                const dayEvents = getEventsForDay(currentDay);
                const maxEventsToShow = 2;
                const hasMore = dayEvents.length > maxEventsToShow;

                return (
                  <div
                    key={dayIndex}
                    onClick={() => onDayClick(currentDay)}
                    className={cn(
                      "min-h-[78px] px-1.5 py-1 border-r border-border/40 last:border-r-0 cursor-pointer transition-colors",
                      !isCurrentMonth && "opacity-70"
                    )}
                  >
                    <div className="flex items-center justify-start">
                      <span
                        className={cn(
                          "w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : isCurrentDay
                              ? "text-primary"
                              : "text-foreground"
                        )}
                      >
                        {format(currentDay, 'd')}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-col gap-1 min-h-0">
                      {dayEvents.slice(0, maxEventsToShow).map((event, idx) => {
                        const eventType = (event.eventType || event.ambitionOsMeta?.eventType || 'default') as string;
                        const colors = getEventTypeColor(eventType);
                        const startTime = getTimeFromDateTime(event.start?.dateTime);

                        return (
                          <button
                            key={event.id + '-' + idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick(event);
                            }}
                            data-wt={idx === 0 ? "calendar-event" : undefined}
                            className={cn(
                              "px-1.5 py-0.5 rounded-lg text-[9px] font-medium text-left whitespace-normal break-words leading-tight",
                              colors.bg,
                              colors.text,
                              "shadow-sm"
                            )}
                          >
                            <span className="font-semibold">{startTime ? `${startTime} ` : ''}</span>
                            <span>{event.summary}</span>
                          </button>
                        );
                      })}
                      {hasMore && (
                        <div className="text-[9px] text-muted-foreground pl-1">
                          +{dayEvents.length - maxEventsToShow} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden pb-24 xl:pb-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {DAY_NAMES.map((day, i) => (
          <div
            key={i}
            className="py-3 text-center text-xs font-bold text-foreground/85 uppercase tracking-wider border-r border-border last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {weeks.map((weekStart, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 border-b border-border last:border-b-0 min-h-[120px] md:min-h-[138px]">
            {Array.from({ length: 7 }, (_, dayIndex) => {
              const currentDay = addDays(weekStart, dayIndex);
              const dayKey = format(currentDay, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(currentDay, date);
              const isCurrentDay = isToday(currentDay);
              const dayEvents = getEventsForDay(currentDay);
              const isOverflowOpen = hoveredDayKey === dayKey || expandedDayKey === dayKey;
              const maxEventsToShow = 3;
              const visibleEvents = dayEvents.slice(0, maxEventsToShow);
              const hiddenEvents = dayEvents.slice(maxEventsToShow);
              const hasMore = hiddenEvents.length > 0;

              return (
                <div
                  key={dayIndex}
                  onClick={() => onDayClick(currentDay)}
                  onMouseEnter={() => setHoveredDayKey(dayKey)}
                  onMouseLeave={() => setHoveredDayKey((prev) => (prev === dayKey ? null : prev))}
                  className={cn(
                    "min-h-[120px] p-2 border-r border-border last:border-r-0 cursor-pointer transition-all hover:bg-muted/40 group relative overflow-visible",
                    !isCurrentMonth && "bg-background/50 opacity-85",
                    isCurrentDay && "bg-primary/10"
                  )}
                >
                  {/* Day number */}
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all",
                        isCurrentDay
                          ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20"
                          : "text-foreground group-hover:text-foreground font-semibold"
                      )}
                    >
                      {format(currentDay, 'd')}
                    </span>

                    {/* Add Button (appearing on hover) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onTimeSlotClick) {
                          // Open create event modal for this day at 9:00 AM
                          onTimeSlotClick(currentDay, '09:00');
                        } else {
                          onDayClick(currentDay);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-all"
                      title="Add event"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Events */}
                  <div className="flex flex-col gap-1 min-h-0">
                    {visibleEvents.map((event, idx) => {
                      const eventType = (event.eventType || event.ambitionOsMeta?.eventType || 'default') as string;
                      const colors = getEventTypeColor(eventType);
                      const startTime = getTimeFromDateTime(event.start?.dateTime);

                      return (
                        <div
                          key={event.id + '-' + idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                          onMouseEnter={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setHoveredEvent({ event, rect });
                          }}
                          onMouseLeave={() => setHoveredEvent(null)}
                          data-wt={idx === 0 ? "calendar-event" : undefined}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] sm:text-xs cursor-pointer flex items-start gap-1.5 transition-transform hover:scale-[1.01] leading-tight",
                            colors.bg, colors.text, "backdrop-blur-sm shadow-sm"
                          )}
                          title={buildHoverTitle(event)}
                        >
                          <div className={cn("w-1 h-1 rounded-full bg-foreground/40 shrink-0")} />
                          <span className="font-medium whitespace-normal break-words max-h-8 overflow-hidden">
                            {startTime ? `${startTime} ` : ''}{event.summary}
                          </span>
                        </div>
                      );
                    })}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedDayKey((prev) => (prev === dayKey ? null : dayKey));
                        }}
                        className="text-[10px] text-muted-foreground pl-2 font-semibold hover:text-foreground transition-colors text-left"
                      >
                        +{hiddenEvents.length} more
                      </button>
                    )}
                  </div>

                  {(isOverflowOpen && hasMore) && (
                    <div
                      className="absolute left-1.5 right-1.5 bottom-1.5 z-20 rounded-lg border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/80 mb-1.5">
                        More on {format(currentDay, 'MMM d')}
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {hiddenEvents.map((event, idx) => {
                          const eventType = (event.eventType || event.ambitionOsMeta?.eventType || 'default') as string;
                          const colors = getEventTypeColor(eventType);
                          const startTime = getTimeFromDateTime(event.start?.dateTime);

                          return (
                            <button
                              key={`${event.id}-overflow-${idx}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick(event);
                                setExpandedDayKey(null);
                              }}
                              onMouseEnter={(e) => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setHoveredEvent({ event, rect });
                              }}
                              onMouseLeave={() => setHoveredEvent(null)}
                              className={cn(
                                "w-full px-2 py-1 rounded text-[10px] sm:text-xs text-left flex items-start gap-1.5 leading-tight",
                                colors.bg,
                                colors.text
                              )}
                              title={buildHoverTitle(event)}
                            >
                              <span className="w-1 h-1 rounded-full bg-foreground/40 shrink-0 mt-1.5" />
                              <span className="whitespace-normal break-words">
                                {startTime ? `${startTime} ` : ''}{event.summary}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {renderEventHoverCard(hoveredEvent)}
    </div>
  );
};

// =============================================================================
// Week View Component
// =============================================================================

interface WeekViewProps {
  date: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent, meta?: { mode: 'preview' | 'commit' }) => void;
  onTimeSlotClick?: (date: Date, time: string) => void;
  mode?: 'week' | 'day';
  showHeader?: boolean;
  variant?: 'desktop' | 'mobile';
}

const WeekView: React.FC<WeekViewProps> = ({
  date,
  events,
  onDayClick,
  onEventClick,
  onEventUpdate,
  onTimeSlotClick,
  mode = 'week',
  showHeader = true,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [resizingEvent, setResizingEvent] = useState<CalendarEvent | null>(null);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [currentDuration, setCurrentDuration] = useState(0);
  const [hoveredEvent, setHoveredEvent] = useState<{
    event: CalendarEvent;
    rect: DOMRect;
  } | null>(null);

  // Calculate visible days based on mode
  const visibleDays = useMemo(() => {
    if (mode === 'day') {
      return [date];
    }
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [date, mode]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const gridHeight = 24 * HOUR_HEIGHT;

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const targetScrollTop = Math.max(0, (currentHour - 2) * HOUR_HEIGHT);
      scrollContainerRef.current.scrollTop = targetScrollTop;
    }
  }, []);

  // Get events for a day (including recurring)
  const getEventsForDay = useCallback((day: Date): CalendarEvent[] => {
    const dayEvents: CalendarEvent[] = [];

    events.forEach(event => {
      if (event.recurrence && event.recurrence.length > 0) {
        const instances = generateRecurringInstances(event, day, day);
        dayEvents.push(...instances);
      } else if (eventOccursOnDay(event, day)) {
        dayEvents.push(event);
      }
    });

    return dayEvents.sort((a, b) => {
      const startA = parseDateTime(a.start?.dateTime);
      const startB = parseDateTime(b.start?.dateTime);
      if (!startA || !startB) return 0;
      return startA.getTime() - startB.getTime();
    });
  }, [events]);

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop = (currentMinutes / 60) * HOUR_HEIGHT;
  const timeColumnWidthClass = isMobile ? "w-10" : "w-12 sm:w-16";

  // Handle resize
  const handleResizeStart = useCallback((event: CalendarEvent, clientY: number) => {
    const duration = getEventDuration(event);
    setResizingEvent(event);
    setResizeStartY(clientY);
    setOriginalDuration(duration);
    setCurrentDuration(duration); // Initialize current duration
  }, []);

  const handleResizeMove = useCallback((clientY: number) => {
    if (!resizingEvent) return;

    const deltaY = clientY - resizeStartY;
    const deltaMinutes = Math.round(deltaY / (HOUR_HEIGHT / 60));
    const newDuration = Math.max(30, originalDuration + deltaMinutes);

    // Track current duration for use in handleResizeEnd
    setCurrentDuration(newDuration);

    const startDate = parseDateTime(resizingEvent.start?.dateTime);
    if (!startDate) return;

    const newEndDate = new Date(startDate.getTime() + newDuration * 60000);
    const updatedEvent: CalendarEvent = {
      ...resizingEvent,
      end: {
        dateTime: newEndDate.toISOString(),
        timeZone: resizingEvent.end?.timeZone || getLocalTimeZone(),
      },
      durationMinutes: newDuration,
      updated: new Date().toISOString(),
    };

    if (onEventUpdate) {
      onEventUpdate(updatedEvent, { mode: 'preview' });
    }
  }, [resizingEvent, resizeStartY, originalDuration, onEventUpdate]);

  const handleResizeEnd = useCallback(() => {
    if (resizingEvent && onEventUpdate) {
      const startDate = parseDateTime(resizingEvent.start?.dateTime);
      if (startDate) {
        // Use the tracked currentDuration instead of recalculating (fixes the resizeStartY - resizeStartY = 0 bug)
        const finalDuration = currentDuration || originalDuration;
        const newEndDate = new Date(startDate.getTime() + finalDuration * 60000);

        const finalEvent: CalendarEvent = {
          ...resizingEvent,
          end: {
            dateTime: newEndDate.toISOString(),
            timeZone: resizingEvent.end?.timeZone || getLocalTimeZone(),
          },
          durationMinutes: finalDuration,
          updated: new Date().toISOString(),
        };

        onEventUpdate(finalEvent, { mode: 'commit' });
      }
    }
    setResizingEvent(null);
    setResizeStartY(0);
    setOriginalDuration(0);
    setCurrentDuration(0);
  }, [resizingEvent, onEventUpdate, currentDuration, originalDuration]);


  // Mouse event handlers for resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingEvent) handleResizeMove(e.clientY);
    };
    const handleMouseUp = () => {
      if (resizingEvent) handleResizeEnd();
    };

    if (resizingEvent) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingEvent, handleResizeMove, handleResizeEnd]);

  // Hide hover card on scroll to avoid stale positioning
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => setHoveredEvent(null);
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      {showHeader && (
        <div className={cn("flex border-b border-border flex-shrink-0 bg-background", isMobile && "px-1")}>
          <div className={cn(timeColumnWidthClass, "flex-shrink-0 border-r border-border")} />
          {visibleDays.map((day, idx) => {
            const isCurrentDay = isToday(day);
            return (
              <div
                key={idx}
                onClick={() => onDayClick(day)}
                className={cn(
                  "flex-1 min-w-[100px] py-4 text-center border-r border-border last:border-r-0 cursor-pointer transition-colors hover:bg-muted/50",
                  isCurrentDay && "bg-muted/40",
                  isMobile && "min-w-0 py-2"
                )}
              >
                <div
                  className={cn(
                    "text-[10px] sm:text-xs font-bold uppercase mb-1",
                    isCurrentDay ? "text-primary" : "text-muted-foreground",
                    isMobile && "text-[9px]"
                  )}
                >
                  {format(day, 'EEE')}
                </div>
                <div
                  className={cn(
                    "text-xl sm:text-2xl font-black",
                    isCurrentDay ? "text-foreground" : "text-muted-foreground",
                    isMobile && "text-lg"
                  )}
                >
                  {format(day, 'd')}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div
        ref={scrollContainerRef}
        className={cn(
          "flex-1 overflow-y-auto bg-background scrollbar-thin pb-24 xl:pb-0",
          isMobile ? "overflow-x-hidden" : "overflow-x-auto"
        )}
      >
        <div
          className="flex relative"
          style={{ minWidth: mode === 'week' && !isMobile ? '800px' : '100%', height: `${gridHeight}px` }}
        >
          {/* Time labels */}
          <div className={cn(timeColumnWidthClass, "flex-shrink-0 border-r border-border bg-background relative z-10")}>
            {hours.map((hour, idx) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-center pt-2"
                style={{ top: `${idx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              >
                <span className={cn("text-[11px] font-bold text-muted-foreground", isMobile && "text-[10px] font-medium")}>
                  {formatHour12h(hour).replace(' ', '')}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {visibleDays.map((day, dayIdx) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentDay = isToday(day);

            return (
              <div
                key={dayIdx}
                className={cn(
                  "flex-1 border-r border-border last:border-r-0 relative",
                  isMobile ? "min-w-0" : "min-w-[100px]"
                  // Grid Lines Background
                )}
                style={{ height: `${gridHeight}px` }}
              >
                {/* Horizontal Grid Lines */}
                {hours.map((hour, hourIdx) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-b border-border/60 pointer-events-none"
                    style={{ top: `${hourIdx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Clickable Slots (Overlay) */}
                {hours.map((hour, hourIdx) => (
                  <div
                    key={`slot-${hour}`}
                    className="absolute left-0 right-0 z-0 hover:bg-muted/40 transition-colors cursor-pointer"
                    style={{ top: `${hourIdx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    onClick={() => onTimeSlotClick?.(day, `${hour.toString().padStart(2, '0')}:00`)}
                  />
                ))}

                {/* Current time indicator */}
                {isCurrentDay && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <div className="w-2.5 h-2.5 bg-primary rounded-full -ml-1.5 shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                    <div className="flex-1 h-[2px] bg-primary" />
                    <div className="px-1.5 py-0.5 ml-2 bg-primary text-primary-foreground text-[9px] font-bold rounded">LIVE</div>
                  </div>
                )}

                {/* Events */}
                {(() => {
                  const layout = buildOverlapLayout(dayEvents);
                  return dayEvents.map((event, eventIdx) => {
                    const startDate = parseDateTime(event.start?.dateTime);
                    const endDate = parseDateTime(event.end?.dateTime);
                    if (!startDate || !endDate) return null;

                    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
                    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
                    const top = (startMinutes / 60) * HOUR_HEIGHT;
                    const height = Math.max(24, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT - 2);

                    const eventType = event.eventType || event.ambitionOsMeta?.eventType;
                    const colors = getEventTypeColor(eventType);
                    const startTime = getTimeFromDateTime(event.start?.dateTime);
                    const endTime = getTimeFromDateTime(event.end?.dateTime);
                    const isVirtual = !!event.recurringEventId;
                    const layoutInfo = layout[event.id] || { col: 0, cols: 1 };
                    const colWidth = 100 / layoutInfo.cols;
                    const left = `calc(${layoutInfo.col * colWidth}% + 4px)`;
                    const width = `calc(${colWidth}% - 8px)`;

                    // Determine Styling based on type (matching Reference)
                    const rawType = (eventType as string);
                    let borderClass = 'bg-primary';
                    if (rawType === 'habit') borderClass = 'bg-emerald-500';
                    else if (rawType === 'goal_session') borderClass = 'bg-primary';
                    else if (rawType === 'milestone_deadline') borderClass = 'bg-rose-500';
                    else if (rawType === 'task') borderClass = 'bg-blue-400';

                    return (
                      <div
                        key={event.id + '-' + eventIdx}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        onMouseEnter={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setHoveredEvent({ event, rect });
                        }}
                        onMouseLeave={() => setHoveredEvent(null)}
                        data-wt={eventIdx === 0 ? "calendar-event" : undefined}
                        className={cn(
                          "absolute rounded-xl overflow-hidden shadow-lg z-10 cursor-pointer group glass-card hover:scale-[1.01] transition-all border-none ring-1 ring-border/60",
                          height < 40 ? "flex items-center px-2" : "p-3"
                        )}
                        title={buildHoverTitle(event)}
                        style={{ top: `${top}px`, height: `${height}px`, left, width }}
                      >
                        {/* Left colored accent strip */}
                        <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", borderClass)} />

                        {height < 40 ? (
                          <div className="pl-3 flex items-center gap-2 truncate w-full">
                            <span className={cn("text-[10px] font-bold", colors.text.replace('text-primary-foreground', 'text-primary').replace('text-white', 'text-primary'))}>
                              {startTime}
                            </span>
                            <span className="text-[10px] sm:text-xs font-semibold text-foreground truncate">
                              {event.summary}
                            </span>
                          </div>
                        ) : (
                          <div className="pl-3 flex flex-col h-full">
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {startTime} - {endTime}
                            </span>
                            <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-tight line-clamp-2">
                              {event.summary}
                            </h3>
                          </div>
                        )}

                        {/* Resize handle */}
                        {!isVirtual && (
                          <div
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity z-20"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleResizeStart(event, e.clientY);
                            }}
                          >
                            <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-muted-foreground/40 rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            );
          })}
          {/* Hover Peek Card (rendered in portal to avoid clipping) */}
          {renderEventHoverCard(hoveredEvent)}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Day View Component
// =============================================================================

interface DayViewProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onEventUpdate?: (event: CalendarEvent, meta?: { mode: 'preview' | 'commit' }) => void;
  onTimeSlotClick?: (date: Date, time: string) => void;
  showHeader?: boolean;
  variant?: 'desktop' | 'mobile';
}

const DayView: React.FC<DayViewProps> = ({
  date,
  events,
  onEventClick,
  onEventUpdate,
  onTimeSlotClick,
  showHeader = true,
  variant = 'desktop',
}) => {
  const isMobile = variant === 'mobile';
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const gridHeight = 24 * HOUR_HEIGHT;

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const targetScrollTop = Math.max(0, (currentHour - 2) * HOUR_HEIGHT);
      scrollContainerRef.current.scrollTop = targetScrollTop;
    }
  }, []);

  // Get events for this day
  const dayEvents = useMemo(() => {
    const result: CalendarEvent[] = [];

    events.forEach(event => {
      if (event.recurrence && event.recurrence.length > 0) {
        const instances = generateRecurringInstances(event, date, date);
        result.push(...instances);
      } else if (eventOccursOnDay(event, date)) {
        result.push(event);
      }
    });

    return result.sort((a, b) => {
      const startA = parseDateTime(a.start?.dateTime);
      const startB = parseDateTime(b.start?.dateTime);
      if (!startA || !startB) return 0;
      return startA.getTime() - startB.getTime();
    });
  }, [events, date]);

  // Current time indicator
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeTop = (currentMinutes / 60) * HOUR_HEIGHT;
  const isCurrentDay = isToday(date);
  const timeColumnWidthClass = isMobile ? "w-10" : "w-12 sm:w-16";

  return (
    <div className="flex flex-col h-full">
      {/* Day header */}
      {showHeader && (
        <div className="flex border-b border-border flex-shrink-0 bg-background">
          <div className={cn(timeColumnWidthClass, "flex-shrink-0 border-r border-border")} />
          <div className={cn(
            "flex-1 py-4 text-center",
            isCurrentDay && "bg-muted/40",
            isMobile && "py-2"
          )}>
            <div className={cn(
              "text-[11px] sm:text-sm text-muted-foreground font-medium uppercase",
              isMobile && "text-[10px]"
            )}>
              {format(date, 'EEEE')}
            </div>
            <div className={cn(
              "text-2xl sm:text-3xl font-bold mt-1",
              isCurrentDay ? "text-primary" : "text-foreground",
              isMobile && "text-xl"
            )}>
              {format(date, 'd')}
            </div>
            <div className={cn(
              "text-[11px] sm:text-sm text-muted-foreground",
              isMobile && "text-[10px]"
            )}>
              {format(date, 'MMMM yyyy')}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto bg-background pb-24 xl:pb-0"
      >
        <div className="flex relative" style={{ height: `${gridHeight}px` }}>
          {/* Time labels */}
          <div className={cn(timeColumnWidthClass, "flex-shrink-0 border-r border-border bg-background relative")}>
            {hours.map((hour, idx) => (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start justify-end pr-2"
                style={{ top: `${idx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              >
                <span className={cn("text-xs text-muted-foreground -mt-2.5", isMobile && "text-[10px]")}>
                  {formatHour12h(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Main column */}
          <div
            className={cn(
              "flex-1 relative",
              isCurrentDay && "bg-muted/40"
            )}
            style={{ height: `${gridHeight}px` }}
          >
            {/* Hour lines */}
            {hours.map((hour, hourIdx) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-border/60 cursor-pointer hover:bg-muted/40 transition-colors"
                style={{ top: `${hourIdx * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                onClick={() => onTimeSlotClick?.(date, `${hour.toString().padStart(2, '0')}:00`)}
              >
                <div
                  className="absolute left-0 right-0 border-t border-border/40"
                  style={{ top: `${HOUR_HEIGHT / 2}px` }}
                />
              </div>
            ))}

            {/* Current time indicator */}
            {isCurrentDay && (
              <div
                className="absolute left-0 right-0 z-30 pointer-events-none"
                style={{ top: `${currentTimeTop}px` }}
              >
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full -ml-1.5" />
                  <div className="flex-1 h-0.5 bg-red-500" />
                </div>
              </div>
            )}

            {/* Events */}
            {(() => {
              const layout = buildOverlapLayout(dayEvents);
              return dayEvents.map((event, eventIdx) => {
                const startDate = parseDateTime(event.start?.dateTime);
                const endDate = parseDateTime(event.end?.dateTime);
                if (!startDate || !endDate) return null;

                const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
                const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
                const top = (startMinutes / 60) * HOUR_HEIGHT;
                const height = Math.max(40, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT - 2);

                const eventType = event.eventType || event.ambitionOsMeta?.eventType;
                const colors = getEventTypeColor(eventType);
                const startTime = getTimeFromDateTime(event.start?.dateTime);
                const endTime = getTimeFromDateTime(event.end?.dateTime);
                const layoutInfo = layout[event.id] || { col: 0, cols: 1 };
                const colWidth = 100 / layoutInfo.cols;
                const left = `calc(${layoutInfo.col * colWidth}% + 6px)`;
                const width = `calc(${colWidth}% - 12px)`;

                return (
                  <div
                    key={event.id + '-' + eventIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    data-wt={eventIdx === 0 ? "calendar-event" : undefined}
                    className={cn(
                      "absolute rounded-lg px-3 py-2 overflow-hidden shadow-md z-10 cursor-pointer",
                      colors.bg, colors.text,
                      "hover:opacity-90 transition-opacity"
                    )}
                    style={{ top: `${top}px`, height: `${height}px`, left, width }}
                  >
                    <div className="text-[10px] sm:text-xs font-medium opacity-80">
                      {startTime && endTime ? `${formatTime12h(startTime)} - ${formatTime12h(endTime)}` : ''}
                    </div>
                    <div className="text-xs sm:text-sm font-semibold truncate">
                      {event.summary}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Filter Panel Component
// =============================================================================

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  availableTypes: string[];
  availableSources: string[];
  onClose: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filters,
  onFilterChange,
  availableTypes,
  availableSources,
  onClose,
}) => {
  const toggleType = (type: string) => {
    const newTypes = filters.eventTypes.includes(type)
      ? filters.eventTypes.filter(t => t !== type)
      : [...filters.eventTypes, type];
    onFilterChange({ ...filters, eventTypes: newTypes });
  };

  const toggleSource = (source: string) => {
    const newSources = filters.sources.includes(source)
      ? filters.sources.filter(s => s !== source)
      : [...filters.sources, source];
    onFilterChange({ ...filters, sources: newSources });
  };

  return (
    <div className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-lg p-4 z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Filters</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Search</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="flex w-full border border-border bg-background text-foreground focus:ring-0 placeholder:text-muted-foreground pl-8 pr-3 rounded-lg h-9 text-xs"
            placeholder="Search events..."
            value={filters.search}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
          />
        </div>
      </div>

      {/* Event Types */}
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Event Type</p>
        <div className="flex flex-wrap gap-1.5">
          {availableTypes.map(type => {
            const colors = getEventTypeColor(type);
            const isActive = filters.eventTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={cn(
                  "px-2 py-1 rounded-md text-xs font-medium transition-all",
                  isActive ? `${colors.bg} ${colors.text}` : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {type.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sources */}
      <div className="mb-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Source</p>
        <div className="flex flex-wrap gap-1.5">
          {availableSources.map(source => {
            const isActive = filters.sources.includes(source);
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={cn(
                  "px-2 py-1 rounded-md text-xs font-medium transition-all",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {source}
              </button>
            );
          })}
        </div>
      </div>

      {/* Clear Filters */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => onFilterChange({ search: '', eventTypes: [], sources: [], statuses: [] })}
      >
        Clear All Filters
      </Button>
    </div>
  );
};

// =============================================================================
// Main Calendar View Component
// =============================================================================

const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  goals,
  selectedDate,
  onDateChange,
  onEventClick,
  onEventUpdate,
  onTimeSlotClick,
  onCreateEvent,
  hideHeader = false,
  constraints,
  userProfile,
  embedded = false,
}) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    eventTypes: [],
    sources: [],
    statuses: [],
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // Track calendar view on mount
  useEffect(() => {
    analytics.track(AnalyticsEvents.CALENDAR_VIEWED, {
      view_mode: viewMode,
      event_count: events.length,
    });
  }, []);

  // Get unique event types and sources for filter options
  const { availableTypes, availableSources } = useMemo(() => {
    const types = new Set<string>();
    const sources = new Set<string>();

    events.forEach(event => {
      const eventType = event.eventType || event.ambitionOsMeta?.eventType;
      const source = (event as any).source || (event.ambitionOsMeta as any)?.source;
      if (eventType) types.add(eventType);
      if (source) sources.add(source);
    });

    return {
      availableTypes: Array.from(types),
      availableSources: Array.from(sources),
    };
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          event.summary?.toLowerCase().includes(searchLower) ||
          event.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Event type filter
      if (filters.eventTypes.length > 0) {
        const eventType = event.eventType || event.ambitionOsMeta?.eventType;
        if (!eventType || !filters.eventTypes.includes(eventType)) return false;
      }

      // Source filter
      if (filters.sources.length > 0) {
        const source = (event as any).source || (event.ambitionOsMeta as any)?.source;
        if (!source || !filters.sources.includes(source)) return false;
      }

      // Ambition filter
      if (selectedGoalId) {
        const goalId = event.goalId || event.ambitionOsMeta?.goalId;
        if (goalId !== selectedGoalId) return false;
      }

      return true;
    });
  }, [events, filters, selectedGoalId]);

  const aiInsightText = useMemo(() => {
    const todayEvents = filteredEvents.filter(e =>
      e.start?.dateTime && isSameDay(parseISO(e.start.dateTime), selectedDate)
    ).length;
    const peakStart = constraints?.peakStart || '09:00';
    const activeGoals = goals.filter(g => g.status === 'active').length;

    if (todayEvents === 0) {
      return `Today looks open! Consider scheduling a deep work session during your peak hours (${peakStart}).`;
    }
    if (todayEvents > 3) {
      return `Busy day ahead with ${todayEvents} sessions. Prioritize your most important ambition work first.`;
    }
    if (activeGoals > 0) {
      return `You have ${todayEvents} session${todayEvents > 1 ? 's' : ''} today. Focus on making progress during your peak productivity window (${peakStart}).`;
    }
    return `Stay focused on your ${activeGoals} active ambition${activeGoals > 1 ? 's' : ''} today.`;
  }, [filteredEvents, selectedDate, constraints, goals]);

  const getEventsForDay = useCallback((day: Date): CalendarEvent[] => {
    const dayEvents: CalendarEvent[] = [];

    filteredEvents.forEach(event => {
      if (event.recurrence && event.recurrence.length > 0) {
        const instances = generateRecurringInstances(event, day, day);
        dayEvents.push(...instances);
      } else if (eventOccursOnDay(event, day)) {
        dayEvents.push(event);
      }
    });

    return dayEvents;
  }, [filteredEvents]);

  const weekStripDays = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [selectedDate]);

  const weekStripEventDays = useMemo(() => {
    const daysWithEvents = new Set<string>();
    weekStripDays.forEach(day => {
      if (getEventsForDay(day).length > 0) {
        daysWithEvents.add(format(day, 'yyyy-MM-dd'));
      }
    });
    return daysWithEvents;
  }, [weekStripDays, getEventsForDay]);

  // Navigation functions
  const navigate = (direction: 'prev' | 'next') => {
    let newDate: Date;
    switch (viewMode) {
      case 'year':
        newDate = direction === 'prev' ? subYears(selectedDate, 1) : addYears(selectedDate, 1);
        break;
      case 'month':
        newDate = direction === 'prev' ? subMonths(selectedDate, 1) : addMonths(selectedDate, 1);
        break;
      case 'week':
        newDate = direction === 'prev' ? subWeeks(selectedDate, 1) : addWeeks(selectedDate, 1);
        break;
      case 'day':
        newDate = direction === 'prev' ? subDays(selectedDate, 1) : addDays(selectedDate, 1);
        break;
      default:
        return;
    }
    onDateChange(newDate);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const isMobileDayOrWeek = viewMode === 'day' || viewMode === 'week';
  const showWeekStrip = viewMode === 'day';

  const mobileBackLabel = useMemo(() => {
    if (viewMode === 'day' || viewMode === 'week') {
      return format(selectedDate, 'MMMM');
    }
    if (viewMode === 'month') {
      return format(selectedDate, 'yyyy');
    }
    return format(selectedDate, 'yyyy');
  }, [viewMode, selectedDate]);

  const mobileDateLabel = useMemo(() => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
      return `${format(weekStart, 'MMM d')} — ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    return format(selectedDate, 'EEEE — MMM d, yyyy');
  }, [viewMode, selectedDate]);

  const handleMobileBack = () => {
    if (viewMode === 'day' || viewMode === 'week') {
      setViewMode('month');
      return;
    }
    if (viewMode === 'month') {
      setViewMode('year');
    }
  };

  // View transitions
  const handleMonthClick = (month: number) => {
    onDateChange(new Date(selectedDate.getFullYear(), month, 1));
    setViewMode('month');
  };

  const handleDayClick = (date: Date) => {
    onDateChange(date);
    if (viewMode === 'year') {
      setViewMode('month');
    } else if (viewMode === 'month') {
      setViewMode('day');
    }
  };

  const zoomOut = () => {
    if (viewMode === 'day') setViewMode('week');
    else if (viewMode === 'week') setViewMode('month');
    else if (viewMode === 'month') setViewMode('year');
  };

  const zoomIn = () => {
    if (viewMode === 'year') setViewMode('month');
    else if (viewMode === 'month') setViewMode('week');
    else if (viewMode === 'week') setViewMode('day');
  };

  // Get display title based on view mode
  const getDisplayTitle = () => {
    switch (viewMode) {
      case 'year':
        return format(selectedDate, 'yyyy');
      case 'month':
        return format(selectedDate, 'MMMM yyyy');
      case 'week':
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
        return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
      case 'day':
        return format(selectedDate, 'EEEE, MMMM d, yyyy');
      default:
        return '';
    }
  };

  const hasActiveFilters = filters.search || filters.eventTypes.length > 0 || filters.sources.length > 0;

  return (
    <div className={cn("relative flex h-full w-full flex-col overflow-hidden bg-background font-sans text-foreground", embedded ? "bg-transparent" : "")}>
      {/* Global Header (Top Nav) - Only show if hideHeader is false AND not embedded */}
      {!hideHeader && !embedded && (
        <header className="hidden xl:flex items-center justify-between whitespace-nowrap px-10 py-3 glass-nav z-20 shrink-0">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-4 text-foreground">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-primary-foreground">bolt</span>
              </div>
              <h2 className="text-foreground text-xl font-bold leading-tight tracking-[-0.015em]">dlulu life</h2>
            </div>
          </div>
          <div className="flex flex-1 justify-end gap-4 items-center">
            <div className="relative min-w-40 max-w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="flex w-full min-w-0 flex-1 border border-border bg-card text-foreground focus:ring-0 placeholder:text-muted-foreground px-11 rounded-xl h-10 text-sm font-normal"
                placeholder="Search by title or description..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <button
              onClick={() => {
                alert('Calendar Notifications\n\nGet reminded about your schedule (coming soon)!\n\n• Session start reminders\n• Deadline alerts\n• Rescheduling suggestions\n• Daily agenda summary');
              }}
              className="flex size-10 items-center justify-center rounded-xl bg-card/60 text-muted-foreground hover:text-foreground hover:bg-card transition-colors border border-border"
              title="Calendar notifications (coming soon)"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
            {userProfile?.avatarUrl ? (
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10 border-2 border-border"
                style={{ backgroundImage: `url('${userProfile.avatarUrl}')` }}
              />
            ) : (
              <div className="flex items-center justify-center rounded-full size-10 border-2 border-border bg-primary text-primary-foreground font-bold text-sm">
                {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </div>
        </header>
      )}

      <main className="flex flex-1 overflow-hidden">
        {/* Mobile Layout */}
        <div className={cn("flex flex-1 flex-col xl:hidden", embedded ? "bg-transparent" : "bg-background")}>
          <div className={cn("bg-background", embedded ? "bg-transparent" : "")}>
            <div className={cn("px-4 pt-4 pb-3 border-b border-border/60", embedded ? "pb-2" : "")} data-wt="calendar-header">
              <div className="flex items-center justify-between gap-3">
                {viewMode !== 'year' ? (
                  <button
                    onClick={handleMobileBack}
                    className="flex items-center gap-2 rounded-full bg-card/70 border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-card transition-colors active:scale-95"
                    title="Back"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>{mobileBackLabel}</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-1.5 rounded-full bg-card/70 border border-border px-2 py-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
                        title="Change view"
                        data-wt="calendar-viewmode"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-40 p-1.5 rounded-xl bg-card/95 border border-border shadow-xl">
                      {(['year', 'month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setViewMode(mode)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            viewMode === mode ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                          )}
                        >
                          <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                          {viewMode === mode && <Check className="w-4 h-4 text-primary" />}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>

                  <div className="relative">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-colors",
                        hasActiveFilters
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      )}
                      title="Filter"
                    >
                      <Search className="w-4 h-4" />
                      {hasActiveFilters && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>

                    {showFilters && (
                      <FilterPanel
                        filters={filters}
                        onFilterChange={setFilters}
                        availableTypes={availableTypes}
                        availableSources={availableSources}
                        onClose={() => setShowFilters(false)}
                      />
                    )}
                  </div>

                  {!embedded && (
                    <BottomSheet open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
                      <BottomSheetTrigger asChild>
                        <button
                          className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
                          title="Ambitions & insights"
                        >
                          <Target className="w-4 h-4" />
                        </button>
                      </BottomSheetTrigger>
                      <BottomSheetContent>
                        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" />
                        <div className="px-4 pt-4 pb-6 space-y-5">
                          <BottomSheetHeader className="px-1">
                            <BottomSheetTitle>Ambitions & Insights</BottomSheetTitle>
                            <BottomSheetClose className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                              <span className="material-symbols-outlined text-lg">close</span>
                            </BottomSheetClose>
                          </BottomSheetHeader>

                          {/* Mini Calendar */}
                          <div className="glass-surface rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-foreground">{format(selectedDate, 'MMMM')}</span>
                              <div className="flex gap-1">
                                <ChevronLeft
                                  className="w-4 h-4 cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => onDateChange(subMonths(selectedDate, 1))}
                                  title="Previous month"
                                />
                                <ChevronRight
                                  className="w-4 h-4 cursor-pointer hover:text-primary transition-colors"
                                  onClick={() => onDateChange(addMonths(selectedDate, 1))}
                                  title="Next month"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground mb-1">
                              <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {Array.from({ length: getDaysInMonth(selectedDate) }, (_, i) => {
                                const dayNum = i + 1;
                                const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), dayNum);
                                const isTodayLocal = isToday(date);
                                const isSelected = isSameDay(date, selectedDate);
                                return (
                                  <div
                                    key={i}
                                    className={cn(
                                      "h-8 flex items-center justify-center text-xs rounded-full cursor-pointer transition-all hover:bg-muted",
                                      isTodayLocal ? "bg-primary text-primary-foreground font-bold" : isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
                                    )}
                                    onClick={() => onDateChange(date)}
                                  >
                                    {dayNum}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Ambitions */}
                          <div className="glass-surface rounded-2xl p-4">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Ambitions</p>
                            <div className="flex flex-col gap-1">
                              {goals?.map((goal, i) => {
                                const isSelected = selectedGoalId === goal.id;
                                return (
                                  <div
                                    key={goal.id}
                                    onClick={() => setSelectedGoalId(goal.id)}
                                    className={cn(
                                      "flex items-center gap-3 px-3 py-2 rounded-xl border border-border transition-colors text-left cursor-pointer",
                                      isSelected ? "bg-muted" : "hover:bg-muted/60"
                                    )}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedGoalId(goal.id);
                                      }
                                    }}
                                  >
                                    <div className={cn("size-2 rounded-full", i === 0 ? "bg-primary" : i === 1 ? "bg-rose-400" : "bg-blue-400")}></div>
                                    <p className="text-foreground text-sm font-medium truncate">{goal.title}</p>
                                    {isSelected && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedGoalId(null);
                                        }}
                                        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
                                        title="Clear filter"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setIsMobileDrawerOpen(false);
                              onCreateEvent?.();
                            }}
                            data-wt="calendar-new-event"
                            className="w-full flex items-center justify-center gap-2 rounded-xl h-12 bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 shrink-0"
                          >
                            <Plus className="w-5 h-5" />
                            <span>New Event</span>
                          </button>

                          <div className="glass-card p-4 rounded-xl border border-border">
                            <p className="text-[10px] font-bold text-primary uppercase mb-1">AI INSIGHT</p>
                            <p className="text-xs text-foreground leading-relaxed">"{aiInsightText}"</p>
                          </div>
                        </div>
                      </BottomSheetContent>
                    </BottomSheet>
                  )}

                  <button
                    onClick={() => onCreateEvent?.()}
                    className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
                    title="New event"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {viewMode === 'year' && (
                <div className="pt-3">
                  <h2 className="text-4xl font-black tracking-tight text-foreground">{format(selectedDate, 'yyyy')}</h2>
                  <div className="mt-2 h-px bg-border/60" />
                </div>
              )}

              {viewMode === 'month' && (
                <div className="pt-3">
                  <h2 className="text-3xl font-black tracking-tight text-foreground">{format(selectedDate, 'MMMM')}</h2>
                </div>
              )}

              {showWeekStrip && (
                <div className="pt-3">
                  <div className="grid grid-cols-7 gap-1">
                    {weekStripDays.map(day => {
                      const dayKey = format(day, 'yyyy-MM-dd');
                      const isSelected = isSameDay(day, selectedDate);
                      const isTodayDay = isToday(day);
                      const hasEvents = weekStripEventDays.has(dayKey);
                      return (
                        <button
                          key={dayKey}
                          onClick={() => onDateChange(day)}
                          className="flex flex-col items-center gap-1"
                          aria-pressed={isSelected}
                        >
                          <span className={cn(
                            "text-[10px] uppercase tracking-wide",
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}>
                            {format(day, 'EEEEE')}
                          </span>
                          <span className={cn(
                            "w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold transition-colors",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : isTodayDay
                                ? "text-primary"
                                : "text-foreground"
                          )}>
                            {format(day, 'd')}
                          </span>
                          <span className={cn(
                            "h-1 w-1 rounded-full",
                            hasEvents ? (isSelected ? "bg-primary-foreground" : "bg-primary") : "bg-transparent"
                          )} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isMobileDayOrWeek && (
                <div className="mt-3 flex items-center">
                  <button
                    onClick={goToToday}
                    title="Go to today"
                    className="flex items-center justify-center rounded-full h-9 px-4 bg-card/70 border border-border text-foreground text-xs font-bold hover:bg-card transition-colors active:scale-95"
                  >
                    Today
                  </button>
                  <div className="flex-1 text-center">
                    <div className="text-sm font-semibold text-foreground">
                      {mobileDateLabel}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Peak productivity window: {constraints?.peakStart || '09:00'} - {constraints?.peakEnd || '12:00'}
                    </div>
                  </div>
                  <div className="w-16" />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {viewMode === 'year' && (
              <YearView
                year={selectedDate.getFullYear()}
                events={filteredEvents}
                onMonthClick={handleMonthClick}
                onDayClick={handleDayClick}
                variant="mobile"
                selectedDate={selectedDate}
              />
            )}

            {viewMode === 'month' && (
              <MonthView
                date={selectedDate}
                events={filteredEvents}
                onDayClick={handleDayClick}
                onEventClick={onEventClick}
                onTimeSlotClick={onTimeSlotClick}
                variant="mobile"
                selectedDate={selectedDate}
              />
            )}

            {viewMode === 'week' && (
              <WeekView
                date={selectedDate}
                events={filteredEvents}
                onDayClick={handleDayClick}
                onEventClick={onEventClick}
                onEventUpdate={onEventUpdate}
                onTimeSlotClick={onTimeSlotClick}
                variant="mobile"
              />
            )}

            {viewMode === 'day' && (
              <DayView
                date={selectedDate}
                events={filteredEvents}
                onEventClick={onEventClick}
                onEventUpdate={onEventUpdate}
                onTimeSlotClick={onTimeSlotClick}
                variant="mobile"
                showHeader={false}
              />
            )}
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden xl:flex flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* Left Sidebar - Hidden if embedded */}
            {!embedded && (
              <aside className="w-full lg:w-80 max-h-[55vh] lg:max-h-none flex flex-col border-b lg:border-b-0 lg:border-r border-border bg-background p-6 gap-8 overflow-y-auto scrollbar-none shrink-0">
                <div className="flex flex-col gap-2">
                  <h1 className="text-foreground text-xl font-bold">{format(selectedDate, 'MMMM yyyy')}</h1>
                  <p className="text-muted-foreground text-sm font-normal">Manifesting your vision</p>
                </div>

                {/* Mini Calendar */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-foreground">{format(selectedDate, 'MMMM')}</span>
                    <div className="flex gap-1">
                      <ChevronLeft
                        className="w-4 h-4 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => onDateChange(subMonths(selectedDate, 1))}
                        title="Previous month"
                      />
                      <ChevronRight
                        className="w-4 h-4 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => onDateChange(addMonths(selectedDate, 1))}
                        title="Next month"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground mb-1">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {/* Minimal grid for current month context */}
                    {Array.from({ length: getDaysInMonth(selectedDate) }, (_, i) => {
                      const dayNum = i + 1;
                      const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), dayNum);
                      const isTodayLocal = isToday(date);
                      const isSelected = isSameDay(date, selectedDate);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "h-8 flex items-center justify-center text-xs rounded-full cursor-pointer transition-all hover:bg-muted",
                            isTodayLocal ? "bg-primary text-primary-foreground font-bold" : isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
                          )}
                          onClick={() => onDateChange(date)}
                        >
                          {dayNum}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ambitions Legend */}
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-3">Ambitions</p>
                  {goals?.map((goal, i) => {
                    const isSelected = selectedGoalId === goal.id;
                    return (
                      <div
                        key={goal.id}
                        onClick={() => setSelectedGoalId(goal.id)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-xl border border-border transition-colors text-left cursor-pointer",
                          isSelected ? "bg-muted" : "hover:bg-muted/60"
                        )}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedGoalId(goal.id);
                          }
                        }}
                      >
                        <div className={cn("size-2 rounded-full", i === 0 ? "bg-primary" : i === 1 ? "bg-rose-400" : "bg-blue-400")}></div>
                        <p className="text-foreground text-sm font-medium truncate">{goal.title}</p>
                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGoalId(null);
                            }}
                            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
                            title="Clear filter"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* New Event (always below ambitions list) */}
                <div className="mt-4">
                  <button
                    onClick={onCreateEvent}
                    data-wt="calendar-new-event"
                    className="w-full flex items-center justify-center gap-2 rounded-xl h-12 bg-primary text-primary-foreground text-sm font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 shrink-0"
                  >
                    <Plus className="w-5 h-5" />
                    <span>New Event</span>
                  </button>
                </div>

                {/* AI Insight */}
                <div className="mt-4">
                  <div className="glass-card p-4 rounded-xl mb-4 border border-border shrink-0">
                    <p className="text-[10px] font-bold text-primary uppercase mb-1">AI INSIGHT</p>
                    <p className="text-xs text-foreground leading-relaxed">"{aiInsightText}"</p>
                  </div>
                </div>
              </aside>
            )}

            {/* Main Calendar Content */}
            <div className={cn("flex flex-1 flex-col overflow-hidden", embedded ? "bg-transparent" : "bg-background")}>
              {/* Main Content Header */}
              <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shrink-0", embedded ? "pb-4" : "p-4 sm:p-6 border-b border-border mt-2 lg:mt-0")} data-wt="calendar-header">
                <div className="flex flex-col">
                  <h2 className="text-3xl font-black tracking-tight text-foreground">{format(selectedDate, 'EEEE, MMM d')}</h2>
                  <p className="text-muted-foreground text-sm">Peak productivity window: {constraints?.peakStart || '09:00'} - {constraints?.peakEnd || '12:00'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
                  <div className="flex h-10 items-center rounded-xl bg-card/60 border border-border p-1 overflow-x-auto max-w-full" data-wt="calendar-viewmode">
                    {(['year', 'month', 'week', 'day'] as CalendarViewMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        title={`Switch to ${mode} view`}
                        className={cn(
                          "px-2.5 sm:px-4 py-1.5 text-sm font-medium transition-all rounded-lg",
                          viewMode === mode ? "bg-background text-foreground shadow-sm font-bold" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex h-10 items-center rounded-xl bg-card/60 border border-border p-1">
                    <button
                      onClick={zoomOut}
                      disabled={viewMode === 'year'}
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                        viewMode === 'year'
                          ? "text-muted-foreground/60 cursor-not-allowed"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                      title="Zoom out (less detail)"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                      onClick={zoomIn}
                      disabled={viewMode === 'day'}
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-lg transition-all",
                        viewMode === 'day'
                          ? "text-muted-foreground/60 cursor-not-allowed"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                      title="Zoom in (more detail)"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={goToToday}
                    title="Go to today"
                    className="flex items-center justify-center rounded-xl h-10 px-4 sm:px-6 bg-card/60 border border-border text-foreground text-sm font-bold hover:bg-card transition-colors active:scale-95"
                  >
                    Today
                  </button>

                  {/* Filter Toggle Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={cn(
                        "flex items-center justify-center rounded-xl h-10 px-4 text-sm font-bold transition-colors active:scale-95",
                        hasActiveFilters
                          ? "bg-primary text-primary-foreground"
                          : "bg-card/60 border border-border text-foreground hover:bg-card"
                      )}
                    >
                      <Filter className="w-4 h-4 mr-2" />
                      Filter
                      {hasActiveFilters && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-white" />
                      )}
                    </button>

                    {showFilters && (
                      <FilterPanel
                        filters={filters}
                        onFilterChange={setFilters}
                        availableTypes={availableTypes}
                        availableSources={availableSources}
                        onClose={() => setShowFilters(false)}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Calendar Content */}
              <div className="flex-1 overflow-hidden">
                {viewMode === 'year' && (
                  <YearView
                    year={selectedDate.getFullYear()}
                    events={filteredEvents}
                    onMonthClick={handleMonthClick}
                    onDayClick={handleDayClick}
                  />
                )}

                {viewMode === 'month' && (
                  <MonthView
                    date={selectedDate}
                    events={filteredEvents}
                    onDayClick={handleDayClick}
                    onEventClick={onEventClick}
                    onTimeSlotClick={onTimeSlotClick}
                  />
                )}

                {viewMode === 'week' && (
                  <WeekView
                    date={selectedDate}
                    events={filteredEvents}
                    onDayClick={handleDayClick}
                    onEventClick={onEventClick}
                    onEventUpdate={onEventUpdate}
                    onTimeSlotClick={onTimeSlotClick}
                  />
                )}

                {viewMode === 'day' && (
                  <DayView
                    date={selectedDate}
                    events={filteredEvents}
                    onEventClick={onEventClick}
                    onEventUpdate={onEventUpdate}
                    onTimeSlotClick={onTimeSlotClick}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CalendarView;
