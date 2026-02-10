export type DemoTask = {
  id: string;
  title: string;
};

export type DemoPhase = {
  id: string;
  title: string;
  weeks: string;
  progressPct: number;
  tasks: DemoTask[];
};

export type DemoRoadmap = {
  goalTitle: string;
  timeline: string;
  phases: DemoPhase[];
};

export const BASE_ROADMAP: DemoRoadmap = {
  goalTitle: 'Launch a startup in 12 weeks',
  timeline: '12 weeks',
  phases: [
    {
      id: 'p1',
      title: 'Discovery',
      weeks: 'Weeks 1–3',
      progressPct: 0,
      tasks: [
        {id: 't1', title: 'Define problem + target user'},
        {id: 't2', title: 'Interview 10 potential users'},
        {id: 't3', title: 'Write a one-page value prop'},
      ],
    },
    {
      id: 'p2',
      title: 'Build',
      weeks: 'Weeks 4–9',
      progressPct: 0,
      tasks: [
        {id: 't4', title: 'Ship landing page v1'},
        {id: 't5', title: 'Build MVP onboarding flow'},
        {id: 't6', title: 'Launch private beta (10 users)'},
      ],
    },
    {
      id: 'p3',
      title: 'Launch',
      weeks: 'Weeks 10–12',
      progressPct: 0,
      tasks: [
        {id: 't7', title: 'Prepare launch assets'},
        {id: 't8', title: 'Write announcement + demo'},
      ],
    },
  ],
};

export const withInsertedLaunchTask = (taskTitle: string | null): DemoRoadmap => {
  const r = structuredClone(BASE_ROADMAP) as DemoRoadmap;
  const launch = r.phases.find((p) => p.id === 'p3');
  if (!launch) return r;
  if (taskTitle && taskTitle.trim().length > 0) {
    launch.tasks = [
      ...launch.tasks,
      {id: `t_new_${Date.now()}`, title: taskTitle},
    ];
  }
  return r;
};
