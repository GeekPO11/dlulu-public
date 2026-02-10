import React from 'react';
import {cn} from '../utils/cn';
import type {DemoRoadmap} from '../data/demoRoadmap';

const PhaseCard: React.FC<{
  title: string;
  weeks: string;
  progressPct: number;
  tasks: Array<{title: string; isNew?: boolean; isVisible: boolean}>;
}> = ({title, weeks, progressPct, tasks}) => {
  return (
    <div className="glass-surface rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-primary">
            {title}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{weeks}</div>
        </div>
        <div className="text-sm font-black text-foreground">{progressPct}%</div>
      </div>
      <div className="mt-4 space-y-2">
        {tasks.map((t, idx) => (
          <div
            key={`${t.title}-${idx}`}
            className={cn(
              'rounded-xl border border-border bg-card/50 px-4 py-3 text-sm font-semibold text-foreground/90 transition-all',
              t.isNew && 'border-primary/60 bg-primary/10',
              !t.isVisible && 'opacity-0 translate-y-2'
            )}
          >
            {t.title}
          </div>
        ))}
      </div>
    </div>
  );
};

export const RoadmapPanel: React.FC<{
  roadmap: DemoRoadmap;
  revealCount: number; // how many tasks (across all phases) to show
  highlightNewTaskTitle?: string | null;
}> = ({roadmap, revealCount, highlightNewTaskTitle}) => {
  const allTasks = roadmap.phases.flatMap((p) => p.tasks.map((t) => ({phaseId: p.id, title: t.title})));

  const isVisibleByTaskTitle = (title: string) => {
    const index = allTasks.findIndex((t) => t.title === title);
    if (index === -1) return false;
    return index < revealCount;
  };

  return (
    <div className="w-full h-full p-8">
      <div className="flex items-end justify-between gap-8">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground/70">
            ambition
          </div>
          <div className="text-3xl font-black tracking-tight text-foreground mt-2">
            {roadmap.goalTitle}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-widest">
            {roadmap.timeline}
          </div>
          <div className="px-4 py-2 rounded-full bg-card/60 border border-border text-muted-foreground text-xs font-black uppercase tracking-widest">
            Gemini 3
          </div>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-5">
        {roadmap.phases.map((p) => (
          <PhaseCard
            key={p.id}
            title={p.title}
            weeks={p.weeks}
            progressPct={p.progressPct}
            tasks={p.tasks.map((t) => ({
              title: t.title,
              isNew: highlightNewTaskTitle ? t.title === highlightNewTaskTitle : false,
              isVisible: isVisibleByTaskTitle(t.title),
            }))}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground/70">
        <div className="size-2 rounded-full bg-primary" />
        <div className="font-bold uppercase tracking-widest">Phases</div>
        <div className="opacity-50">→</div>
        <div className="font-bold uppercase tracking-widest">Milestones</div>
        <div className="opacity-50">→</div>
        <div className="font-bold uppercase tracking-widest">Tasks</div>
      </div>
    </div>
  );
};
