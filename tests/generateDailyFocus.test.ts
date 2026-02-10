import { describe, expect, it } from 'vitest';

import { generateDailyFocus } from '../services/gemini';

type TestSubTask = {
  id: string;
  title: string;
  isCompleted: boolean;
  isStrikethrough: boolean;
  order: number;
};

type TestTask = {
  id: string;
  title: string;
  isCompleted: boolean;
  isStrikethrough: boolean;
  order: number;
  estimatedMinutes?: number;
  subTasks: TestSubTask[];
};

type TestMilestone = {
  id: string;
  title: string;
  isCompleted: boolean;
  order: number;
  tasks: TestTask[];
  subTasks?: TestSubTask[];
};

type TestPhase = {
  milestones: TestMilestone[];
};

describe('generateDailyFocus', () => {
  it('generates one focus item per goal (up to 6) with stable ids and goal mapping', async () => {
    const goals = Array.from({ length: 8 }).map((_, idx) => {
      const goalId = `g${idx + 1}`;
      const milestoneId = `m${idx + 1}`;
      const taskId = `t${idx + 1}`;
      const subtaskId = `s${idx + 1}`;

      const phases: TestPhase[] = [
        {
          milestones: [
            {
              id: milestoneId,
              title: `Milestone ${idx + 1}`,
              isCompleted: false,
              order: 1,
              tasks: [
                {
                  id: taskId,
                  title: `Task ${idx + 1}`,
                  isCompleted: false,
                  isStrikethrough: false,
                  order: 1,
                  estimatedMinutes: 30,
                  subTasks: [
                    {
                      id: subtaskId,
                      title: `Subtask ${idx + 1}`,
                      isCompleted: false,
                      isStrikethrough: false,
                      order: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      return {
        id: goalId,
        title: `Goal ${idx + 1}`,
        progress: idx * 10,
        phases,
        currentPhaseIndex: 0,
      };
    });

    const suggestions = await generateDailyFocus({
      goals,
      todayEvents: [],
      userProfile: {},
    });

    expect(suggestions).toHaveLength(6);
    suggestions.forEach((s) => {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.goalId).toBeDefined();
      expect(s.goalTitle).toBeDefined();
    });

    // Sorted by lowest progress first => Goal 1 (0%), then Goal 2 (10%), etc.
    expect(suggestions[0].goalId).toBe('g1');
    expect(suggestions[1].goalId).toBe('g2');
  });

  it('respects currentPhaseIndex when choosing the next milestone/task', async () => {
    const goal = {
      id: 'g1',
      title: 'Goal 1',
      progress: 20,
      currentPhaseIndex: 1,
      phases: [
        {
          milestones: [
            {
              id: 'm_wrong',
              title: 'WRONG PHASE MILESTONE',
              isCompleted: false,
              order: 1,
              tasks: [],
            },
          ],
        },
        {
          milestones: [
            {
              id: 'm_right',
              title: 'RIGHT PHASE MILESTONE',
              isCompleted: false,
              order: 1,
              tasks: [],
            },
          ],
        },
      ] as TestPhase[],
    };

    const suggestions = await generateDailyFocus({
      goals: [goal],
      todayEvents: [],
      userProfile: {},
    });

    expect(suggestions[0].milestoneId).toBe('m_right');
    expect(suggestions[0].title).toContain('RIGHT PHASE');
  });

  it('builds ids using goalId + milestoneId + taskId + subtaskId when a subtask is selected', async () => {
    const goal = {
      id: 'g42',
      title: 'Write a book',
      progress: 5,
      currentPhaseIndex: 0,
      phases: [
        {
          milestones: [
            {
              id: 'm1',
              title: 'Outline',
              isCompleted: false,
              order: 1,
              tasks: [
                {
                  id: 't1',
                  title: 'Draft outline',
                  isCompleted: false,
                  isStrikethrough: false,
                  order: 1,
                  subTasks: [
                    {
                      id: 's1',
                      title: 'Write chapter list',
                      isCompleted: false,
                      isStrikethrough: false,
                      order: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ] as TestPhase[],
    };

    const [suggestion] = await generateDailyFocus({
      goals: [goal],
      todayEvents: [],
      userProfile: {},
    });

    expect(suggestion.id).toBe('g42:m1:t1:s1');
    expect(suggestion.goalId).toBe('g42');
    expect(suggestion.milestoneId).toBe('m1');
    expect(suggestion.taskId).toBe('t1');
    expect(suggestion.subtaskId).toBe('s1');
    expect(suggestion.title).toBe('Write chapter list');
  });

  it('returns varied estimated durations for heterogeneous goals (avoids blanket 60m)', async () => {
    const goals = [
      {
        id: 'g1',
        title: 'Finance Admin',
        progress: 10,
        currentPhaseIndex: 0,
        frequency: 6,
        duration: 30,
        goalArchetype: 'MAINTENANCE' as const,
        phases: [
          {
            milestones: [
              {
                id: 'm1',
                title: 'Weekly admin',
                isCompleted: false,
                order: 1,
                tasks: [
                  {
                    id: 't1',
                    title: 'Review statements',
                    isCompleted: false,
                    isStrikethrough: false,
                    order: 1,
                    estimatedMinutes: 20,
                    difficulty: 2,
                    cognitiveType: 'admin',
                    subTasks: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'g2',
        title: 'Deep Work Project',
        progress: 20,
        currentPhaseIndex: 0,
        frequency: 2,
        duration: 90,
        goalArchetype: 'DEEP_WORK_PROJECT' as const,
        phases: [
          {
            milestones: [
              {
                id: 'm2',
                title: 'Architecture',
                isCompleted: false,
                order: 1,
                tasks: [
                  {
                    id: 't2',
                    title: 'Draft architecture proposal',
                    isCompleted: false,
                    isStrikethrough: false,
                    order: 1,
                    estimatedMinutes: 100,
                    difficulty: 5,
                    cognitiveType: 'deep_work',
                    subTasks: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'g3',
        title: 'Skill Building',
        progress: 30,
        currentPhaseIndex: 0,
        frequency: 4,
        duration: 55,
        goalArchetype: 'SKILL_ACQUISITION' as const,
        phases: [
          {
            milestones: [
              {
                id: 'm3',
                title: 'Study',
                isCompleted: false,
                order: 1,
                tasks: [
                  {
                    id: 't3',
                    title: 'Read chapters',
                    isCompleted: false,
                    isStrikethrough: false,
                    order: 1,
                    estimatedMinutes: 50,
                    difficulty: 3,
                    cognitiveType: 'learning',
                    subTasks: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const suggestions = await generateDailyFocus({
      goals,
      todayEvents: [],
      userProfile: { energyLevel: 'balanced' },
    });

    expect(suggestions).toHaveLength(3);
    const durations = suggestions.map((suggestion) => suggestion.estimatedDuration);
    expect(new Set(durations).size).toBeGreaterThan(1);
    expect(durations.every((value) => value === 60)).toBe(false);
  });
});
