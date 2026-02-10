import React, { useMemo } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameMonth,
    isToday,
    isSameDay,
    addMonths,
    subMonths,
    getDay,
    parseISO
} from 'date-fns';
import { CalendarEvent } from '../constants/calendarTypes';
import { cn } from '../lib/utils';
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    Video,
    Code,
    BarChart,
    Check,
    MapPin,
    Calendar as CalendarIcon
} from 'lucide-react';

interface ExecutionCalendarProps {
    events: CalendarEvent[];
    currentDate: Date;
    onDateChange: (date: Date) => void;
    onEventClick: (event: CalendarEvent) => void;
    onEventToggle?: (eventId: string, completed: boolean) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ExecutionCalendar: React.FC<ExecutionCalendarProps> = ({
    events,
    currentDate,
    onDateChange,
    onEventClick,
    onEventToggle
}) => {
    // 1. Calculate Grid Data
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Padding days for start of month
    const startDayOfWeek = getDay(monthStart); // 0=Sun, 1=Mon...
    const paddingDays = Array.from({ length: startDayOfWeek }, (_, i) => i);

    // 2. Heatmap Data (Event counts per day)
    const eventCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        events.forEach(event => {
            const dateStr = (event.start?.dateTime || event.start?.date || '').split('T')[0];
            if (dateStr) {
                counts[dateStr] = (counts[dateStr] || 0) + 1;
            }
        });
        return counts;
    }, [events]);

    // 3. Upcoming Sessions List (Sorted by date)
    const upcomingSessions = useMemo(() => {
        const now = new Date();
        return events
            .filter(e => {
                const start = e.start?.dateTime || e.start?.date;
                return start && new Date(start) >= now; // Future only? Mock implies "Upcoming"
            })
            .sort((a, b) => {
                const dateA = new Date(a.start?.dateTime || a.start?.date || '');
                const dateB = new Date(b.start?.dateTime || b.start?.date || '');
                return dateA.getTime() - dateB.getTime();
            })
            .slice(0, 5); // Show top 5
    }, [events]);

    // State for hover peek
    const [hoveredDate, setHoveredDate] = React.useState<Date | null>(null);

    const getIntensityClass = (count: number) => {
        if (count === 0) return 'bg-foreground/5 border-foreground/10';
        if (count === 1) return 'bg-primary/20 border-primary/30 calendar-glow';
        if (count === 2) return 'bg-primary/40 border-primary/50 calendar-glow font-bold';
        return 'bg-primary/60 border-primary/70 calendar-glow font-bold';
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start">
            {/* Left Column: Calendar Heatmap */}
            <div className="lg:col-span-6 space-y-6">
                <div className="glass-panel p-8 rounded-3xl relative">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-2xl font-bold text-foreground">{format(currentDate, 'MMMM yyyy')}</h3>
                            <p className="text-sm opacity-50 text-muted-foreground">High intensity execution phase</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onDateChange(subMonths(currentDate, 1))}
                                className="size-10 flex items-center justify-center rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-colors border border-foreground/10 text-foreground"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => onDateChange(addMonths(currentDate, 1))}
                                className="size-10 flex items-center justify-center rounded-xl bg-foreground/5 hover:bg-foreground/10 transition-colors border border-foreground/10 text-foreground"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-3 relative">
                        {WEEKDAYS.map(day => (
                            <div key={day} className="text-center text-xs font-bold opacity-30 uppercase tracking-widest pb-4 text-muted-foreground">
                                {day}
                            </div>
                        ))}

                        {/* Empty padding cells */}
                        {paddingDays.map(padding => (
                            <div key={`padding-${padding}`} className="heatmap-cell flex items-center justify-center text-sm opacity-20 text-muted-foreground">
                                {/* Could show prev month days here if needed */}
                            </div>
                        ))}

                        {/* Day cells */}
                        {daysInMonth.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const count = eventCounts[dateStr] || 0;
                            const isTodayDate = isToday(day);
                            const dayEvents = events.filter(e => {
                                const start = e.start?.dateTime || e.start?.date;
                                return start && start.startsWith(dateStr);
                            });

                            return (
                                <div
                                    key={dateStr}
                                    className={cn(
                                        "heatmap-cell flex items-center justify-center text-sm rounded-2xl transition-all cursor-pointer relative group",
                                        isTodayDate
                                            ? "today-ring overflow-hidden"
                                            : cn("border text-foreground hover:scale-105", getIntensityClass(count))
                                    )}
                                // Use simple group-hover + absolute tooltip approach for better performance/simplicity
                                >
                                    {isTodayDate ? (
                                        <div className="w-full h-full bg-background rounded-[14px] flex items-center justify-center text-sm font-bold text-foreground">
                                            {format(day, 'd')}
                                        </div>
                                    ) : (
                                        format(day, 'd')
                                    )}

                                    {/* Tooltip Peek */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 hidden group-hover:block z-50">
                                        <div className="glass-panel p-4 rounded-xl shadow-2xl border border-border bg-background/95 text-left">
                                            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-2 border-b border-border/60 pb-2">
                                                {format(day, 'EEEE, MMM do')}
                                            </div>
                                            {dayEvents.length > 0 ? (
                                                <div className="space-y-2">
                                                    {dayEvents.map(event => (
                                                        <div key={event.id} className="flex items-center gap-2 text-sm text-foreground">
                                                            <div className={cn(
                                                                "w-1.5 h-1.5 rounded-full shrink-0",
                                                                event.status === 'completed' ? "bg-emerald-500" : "bg-primary"
                                                            )} />
                                                            <span className={cn(
                                                                "truncate",
                                                                event.status === 'completed' && "opacity-50 line-through"
                                                            )}>
                                                                {event.summary}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground/60 italic">No events scheduled</p>
                                            )}
                                        </div>
                                        {/* Arrow */}
                                        <div className="absolute left-1/2 -translate-x-1/2 bottom-[-6px] w-3 h-3 bg-background border-r border-b border-border rotate-45 transform"></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-8 flex items-center gap-4 text-xs opacity-50 uppercase tracking-widest font-bold text-muted-foreground">
                        <span>Less active</span>
                        <div className="flex gap-1.5">
                            <div className="size-3 rounded bg-foreground/5"></div>
                            <div className="size-3 rounded bg-primary/20"></div>
                            <div className="size-3 rounded bg-primary/40"></div>
                            <div className="size-3 rounded bg-primary/60"></div>
                        </div>
                        <span>Highly active</span>
                    </div>
                </div>
            </div>

            {/* Right Column: Upcoming Sessions */}
            <div className="lg:col-span-4 space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-foreground">Upcoming Sessions</h3>
                    <button className="text-sm text-primary font-bold hover:underline">View All</button>
                </div>

                <div className="space-y-4">
                    {upcomingSessions.length === 0 ? (
                        <div className="glass-panel p-8 rounded-2xl text-center border border-border bg-card/60">
                            <p className="text-muted-foreground text-sm">No upcoming sessions scheduled.</p>
                        </div>
                    ) : upcomingSessions.map((session, idx) => {
                        const date = session.start?.dateTime ? new Date(session.start.dateTime) : new Date();
                        const isDone = session.status === 'completed';

                        // Style variations based on type/mock
                        const isDeepWork = session.summary.toLowerCase().includes('deep work') || session.eventType === 'goal_session' || session.ambitionOsMeta?.eventType === 'goal_session';
                        const borderColor = isDeepWork ? 'border-l-chart-3/50' : 'border-l-primary';

                        return (
                            <div
                                key={session.id}
                                onClick={() => onEventClick(session)}
                                className={cn(
                                    "glass-panel p-4 rounded-2xl flex items-center gap-5 border-l-4 group cursor-pointer hover:bg-foreground/[0.06] transition-all",
                                    borderColor,
                                    isDone && "opacity-60"
                                )}
                            >
                                {/* Date Box */}
                                <div className="flex flex-col items-center justify-center min-w-[64px] h-16 bg-foreground/5 rounded-xl border border-foreground/10 text-foreground">
                                    <span className="text-[10px] font-bold opacity-40 uppercase">{format(date, 'MMM')}</span>
                                    <span className="text-xl font-bold">{format(date, 'd')}</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1">
                                    <h4 className="font-bold text-base mb-1 text-foreground line-clamp-1">{session.summary}</h4>
                                    <div className="flex items-center gap-3 opacity-50 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            {session.durationMinutes || 60} min
                                        </span>
                                        <span className="flex items-center gap-1">
                                            {isDeepWork ? <Code className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                                            {isDeepWork ? 'Deep Work' : 'Session'}
                                        </span>
                                    </div>
                                </div>

                                {/* Check Circle */}
                                <div className="size-6 rounded-md border-2 border-foreground/10 flex items-center justify-center group-hover:border-primary transition-colors">
                                    {isDone ? (
                                        <Check className="w-4 h-4 text-primary" />
                                    ) : (
                                        <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
