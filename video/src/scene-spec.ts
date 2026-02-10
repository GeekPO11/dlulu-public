export type SceneId =
  | 'hook'
  | 'problem'
  | 'intro'
  | 'roadmap'
  | 'gap'
  | 'schedule'
  | 'chat'
  | 'scheduleUpdate'
  | 'governance'
  | 'close';

export type SceneSpec = {
  id: SceneId;
  from: number;
  durationInFrames: number;
  label: string;
};

const DUR = {
  hook: 180, // 0:00–0:06
  problem: 360, // 0:06–0:18
  intro: 300, // 0:18–0:28
  roadmap: 900, // 0:28–0:58
  gap: 300, // 0:58–1:08
  schedule: 960, // 1:08–1:40
  chat: 750, // 1:40–2:05
  scheduleUpdate: 270, // 2:05–2:14
  governance: 270, // 2:14–2:23
  close: 210, // 2:23–2:30
} as const;

export const SCENES: SceneSpec[] = (() => {
  const ids: Array<{id: SceneId; label: string; d: number}> = [
    {id: 'hook', label: 'Hook', d: DUR.hook},
    {id: 'problem', label: 'Problem', d: DUR.problem},
    {id: 'intro', label: 'Intro', d: DUR.intro},
    {id: 'roadmap', label: 'Roadmap Compile', d: DUR.roadmap},
    {id: 'gap', label: 'Gap Check', d: DUR.gap},
    {id: 'schedule', label: 'Scheduling', d: DUR.schedule},
    {id: 'chat', label: 'Chatbot + Insert', d: DUR.chat},
    {id: 'scheduleUpdate', label: 'Calendar Update', d: DUR.scheduleUpdate},
    {id: 'governance', label: 'Governance', d: DUR.governance},
    {id: 'close', label: 'Close', d: DUR.close},
  ];

  let from = 0;
  return ids.map((s) => {
    const spec: SceneSpec = {id: s.id, label: s.label, from, durationInFrames: s.d};
    from += s.d;
    return spec;
  });
})();

