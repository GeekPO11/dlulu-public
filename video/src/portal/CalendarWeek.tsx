import React from 'react';
import {cn} from '../utils/cn';
import {snapPlace} from '../motion/primitives';
import type {DemoCalendarEvent} from '../data/demoCalendar';
import {CALENDAR_END_HOUR, CALENDAR_START_HOUR} from '../data/demoCalendar';
import {useCurrentFrame, useVideoConfig} from 'remotion';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const HOUR_HEIGHT = 56;
const TIME_COL_W = 90;

const hourLabel = (h: number) => {
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh} ${period}`;
};

export const CalendarWeek: React.FC<{
  title?: string;
  events: DemoCalendarEvent[];
  revealSessionsCount: number; // only counts kind=session
  highlightEventId?: string | null;
}> = ({title = 'Week View', events, revealSessionsCount, highlightEventId}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const hours = [];
  for (let h = CALENDAR_START_HOUR; h <= CALENDAR_END_HOUR; h++) hours.push(h);

  const sessions = events.filter((e) => e.kind === 'session');
  const sessionVisible = new Set(sessions.slice(0, revealSessionsCount).map((s) => s.id));

  const gridW = 1500;
  const gridH = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT;
  const dayW = Math.floor((gridW - TIME_COL_W) / 7);

  return (
    <div className="w-full h-full p-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground/70">
            calendar
          </div>
          <div className="text-2xl font-black text-foreground mt-2">{title}</div>
        </div>
        <div className="px-4 py-2 rounded-full bg-card/60 border border-border text-muted-foreground text-xs font-black uppercase tracking-widest">
          Constraint-aware
        </div>
      </div>

      <div
        className="mt-6 rounded-3xl border border-border bg-card/40 overflow-hidden relative"
        style={{width: gridW, height: gridH + 52}}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 h-[52px] flex items-center border-b border-border bg-background/40">
          <div style={{width: TIME_COL_W}} />
          <div className="flex-1 grid grid-cols-7">
            {DAYS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-black uppercase tracking-widest text-muted-foreground/70"
              >
                {d}
              </div>
            ))}
          </div>
        </div>

        {/* Time labels + grid */}
        <div className="absolute left-0 right-0 bottom-0 top-[52px] flex">
          <div style={{width: TIME_COL_W}} className="border-r border-border bg-background/20">
            {hours.slice(0, -1).map((h) => (
              <div
                key={h}
                className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 flex items-start justify-center pt-2"
                style={{height: HOUR_HEIGHT}}
              >
                {hourLabel(h)}
              </div>
            ))}
          </div>

          <div className="relative flex-1">
            {/* Horizontal grid lines */}
            {hours.slice(0, -1).map((h, idx) => (
              <div
                key={`line-${h}`}
                className="absolute left-0 right-0 border-t border-border/70"
                style={{top: idx * HOUR_HEIGHT}}
              />
            ))}
            {/* Vertical day lines */}
            {DAYS.map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 border-l border-border/70"
                style={{left: i * dayW}}
              />
            ))}

            {/* Events */}
            {events.map((e) => {
              const top = (e.startHour - CALENDAR_START_HOUR) * HOUR_HEIGHT + 6;
              const height = e.durationHours * HOUR_HEIGHT - 12;
              const left = e.dayIndex * dayW + 8;
              const width = dayW - 16;
              const isSession = e.kind === 'session';
              const isVisible = !isSession || sessionVisible.has(e.id);
              const delay = isSession ? 26 + sessions.findIndex((s) => s.id === e.id) * 10 : 0;
              const anim = isSession ? snapPlace({frame, fps, delay}) : {opacity: 1, transform: 'none'};

              return (
                <div
                  key={e.id}
                  className={cn(
                    'absolute rounded-2xl border border-border flex items-start justify-between gap-3 px-4 py-3',
                    e.kind === 'blocked'
                      ? 'bg-slate-600/30 text-slate-200 border-slate-500/30'
                      : 'bg-primary/20 text-foreground border-primary/30',
                    e.kind === 'session' && e.id === highlightEventId && 'border-primary bg-primary/25'
                  )}
                  style={{
                    top,
                    left,
                    width,
                    height,
                    opacity: isVisible ? (anim as any).opacity : 0,
                    transform: isVisible ? (anim as any).transform : 'translateY(6px) scale(0.98)',
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-widest opacity-70">
                      {e.kind === 'blocked' ? 'blocked' : 'session'}
                    </div>
                    <div className="mt-1 text-sm font-bold leading-tight line-clamp-2">{e.title}</div>
                  </div>
                  {e.kind === 'session' ? (
                    <div className="text-xs font-black text-primary mt-1">AI</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
