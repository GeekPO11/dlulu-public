import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type MockedFunction } from 'vitest';

vi.mock('../components/NeuralAnalysisLoader', async () => {
  const React = await import('react');
  return {
    default: () => React.createElement('div', null, 'Loading'),
  };
});

vi.mock('../components/StatusCheck', async () => {
  const React = await import('react');
  return {
    default: (props: any) => {
      React.useEffect(() => {
        props.onComplete([
          {
            goalTitle: 'Run a marathon',
            completedPrerequisites: [],
            skippedPrerequisites: [],
            additionalNotes: '',
            prerequisiteComments: {},
          },
        ]);
      }, []);

      return React.createElement('div', null, 'Mock Status Check');
    },
  };
});

vi.mock('../components/BlueprintReveal', async () => {
  const React = await import('react');
  return {
    default: (props: any) =>
      React.createElement(
        'div',
        null,
        'Mock Blueprint',
        props.onStartPlan
          ? React.createElement(
              'button',
              { onClick: props.onStartPlan },
              'Start Plan'
            )
          : null
      ),
  };
});

vi.mock('../services/gemini', () => ({
  analyzeAmbitions: vi.fn(),
  generatePrerequisites: vi.fn(),
  generateFullPlan: vi.fn(),
  parseRosterImage: vi.fn(),
  goalsToRoadmap: vi.fn(),
}));

import { analyzeAmbitions, generatePrerequisites, generateFullPlan, goalsToRoadmap } from '../services/gemini';
import Onboarding from '../components/Onboarding';

const analyzeAmbitionsMock = analyzeAmbitions as MockedFunction<typeof analyzeAmbitions>;
const generatePrerequisitesMock = generatePrerequisites as MockedFunction<typeof generatePrerequisites>;
const generateFullPlanMock = generateFullPlan as MockedFunction<typeof generateFullPlan>;
const goalsToRoadmapMock = goalsToRoadmap as MockedFunction<typeof goalsToRoadmap>;
const MARATHON_INTAKE_QUESTIONS = [
  {
    id: 'run-current-state',
    fieldKey: 'current_state',
    question: 'What is your current running baseline?',
    type: 'short_text',
    required: true,
    placeholder: 'Type your answer...',
  },
  {
    id: 'run-target-state',
    fieldKey: 'target_state',
    question: 'What is your target outcome?',
    type: 'short_text',
    required: true,
    placeholder: 'Type your answer...',
  },
  {
    id: 'run-weekly-time',
    fieldKey: 'weekly_time_budget_hours',
    question: 'How many hours can you train each week?',
    type: 'number',
    required: true,
    min: 1,
    max: 40,
    unit: 'hours',
    placeholder: 'Enter a number',
  },
  {
    id: 'run-timeframe',
    fieldKey: 'target_timeframe_weeks',
    question: 'By when do you want to complete this goal?',
    type: 'number',
    required: true,
    min: 1,
    max: 260,
    unit: 'weeks',
    placeholder: 'Enter a number',
  },
] as const;

describe('Onboarding flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    generatePrerequisitesMock.mockResolvedValue({
      prerequisites: [
        { label: 'Baseline assessment completed', order: 1 },
        { label: 'Gear and tools ready', order: 2 },
        { label: 'Training plan selected', order: 3 },
        { label: 'Weekly schedule blocked', order: 4 },
        { label: 'Recovery plan set', order: 5 },
      ],
    } as any);
  });

  const completeIntakeStep = async (user: ReturnType<typeof userEvent.setup>) => {
    const freeTextInputs = await screen.findAllByPlaceholderText(/Type your answer/i);
    await user.type(freeTextInputs[0], 'I can currently run 10km with breaks.');
    await user.type(freeTextInputs[1], 'Complete a full marathon by year end.');
    const numericInputs = await screen.findAllByPlaceholderText(/Enter a number/i);
    await user.type(numericInputs[0], '6');
    await user.type(numericInputs[1], '24');
    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));
  };

  it('generates a plan and completes onboarding', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          prerequisites: [],
          intakeQuestions: MARATHON_INTAKE_QUESTIONS,
        },
      ],
    } as any);

    generateFullPlanMock.mockImplementation(async () => ({
      goals: [
        {
          goalTitle: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          strategyOverview: 'Plan',
          suggestedSchedule: {
            preferredTime: 'morning',
            frequency: 3,
            duration: 60,
            energyCost: 'medium',
          },
          phases: [
            {
              number: 1,
              title: 'Phase 1',
              description: 'Intro',
              startWeek: 1,
              endWeek: 4,
              milestones: [
                {
                  title: 'Milestone 1',
                  description: '',
                  targetWeek: 2,
                  tasks: [
                    {
                      title: 'Task 1',
                      description: '',
                      order: 1,
                      subTasks: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as any));

    goalsToRoadmapMock.mockReturnValue({
      goals: [
        {
          goalId: 'goal-Run a marathon',
          goalTitle: 'Run a marathon',
          category: 'health',
          startWeek: 1,
          endWeek: 12,
          preferredTimeSlot: 'morning',
          sessionsPerWeek: 3,
          minutesPerSession: 60,
          phases: [],
        },
      ],
    } as any);

    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<Onboarding onComplete={onComplete} onBack={vi.fn()} walkthroughSeen={true} />);

    await user.type(screen.getByPlaceholderText(/Your full name/i), 'Jane Doe');
    await user.type(screen.getByPlaceholderText(/Entrepreneur/i), 'Founder');
    await user.click(screen.getByRole('button', { name: /Continue Journey/i }));

    await user.type(
      screen.getByPlaceholderText(/Describe your ideal reality/i),
      'Run a marathon'
    );
    const ambitionContinue = document.querySelector(
      '[data-wt="ob-ambition-continue"]'
    ) as HTMLButtonElement | null;
    expect(ambitionContinue).toBeTruthy();
    await user.click(ambitionContinue as HTMLButtonElement);
    await completeIntakeStep(user);

    await waitFor(() =>
      expect(generateFullPlanMock).toHaveBeenCalled()
    );

    expect(generateFullPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goalContexts: [
          expect.objectContaining({
            intakeResponses: expect.objectContaining({
              current_state: 'I can currently run 10km with breaks.',
              target_state: 'Complete a full marathon by year end.',
              weekly_time_budget_hours: 6,
              target_timeframe_weeks: 24,
            }),
            intakeMissingRequired: [],
          }),
        ],
      }),
      expect.any(Function)
    );

    expect(generatePrerequisitesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.objectContaining({
          title: 'Run a marathon',
        }),
        intakeAnswers: expect.objectContaining({
          current_state: 'I can currently run 10km with breaks.',
          target_state: 'Complete a full marathon by year end.',
          weekly_time_budget_hours: 6,
          target_timeframe_weeks: 24,
        }),
      })
    );

    const startPlanButton = await screen
      .findByRole('button', { name: /Start Plan/i })
      .catch(() => null);
    if (startPlanButton) {
      await user.click(startPlanButton);
    }

    const feasibilityContinue = await screen
      .findByRole('button', { name: /^Continue$/i })
      .catch(() => null);
    if (feasibilityContinue) {
      await user.click(feasibilityContinue);
    }

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalled()
    );
  });

  it('exposes walkthrough targets on feasibility review', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          prerequisites: [],
          intakeQuestions: MARATHON_INTAKE_QUESTIONS,
        },
      ],
    } as any);

    generateFullPlanMock.mockImplementation(async () => ({
      goals: [
        {
          goalTitle: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          strategyOverview: 'Plan',
          suggestedSchedule: {
            preferredTime: 'morning',
            frequency: 3,
            duration: 60,
            energyCost: 'medium',
          },
          phases: [
            {
              number: 1,
              title: 'Phase 1',
              description: 'Intro',
              startWeek: 1,
              endWeek: 4,
              milestones: [],
            },
          ],
        },
      ],
    } as any));

    goalsToRoadmapMock.mockReturnValue({
      goals: [
        {
          goalId: 'goal-Run a marathon',
          goalTitle: 'Run a marathon',
          category: 'health',
          startWeek: 1,
          endWeek: 12,
          preferredTimeSlot: 'morning',
          sessionsPerWeek: 3,
          minutesPerSession: 60,
          phases: [],
        },
      ],
    } as any);

    const user = userEvent.setup();
    render(<Onboarding onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Your full name/i), 'Jane Doe');
    await user.type(screen.getByPlaceholderText(/Entrepreneur/i), 'Founder');
    await user.click(screen.getByRole('button', { name: /Continue Journey/i }));

    await user.type(
      screen.getByPlaceholderText(/Describe your ideal reality/i),
      'Run a marathon'
    );
    const ambitionContinue = document.querySelector(
      '[data-wt="ob-ambition-continue"]'
    ) as HTMLButtonElement | null;
    expect(ambitionContinue).toBeTruthy();
    await user.click(ambitionContinue as HTMLButtonElement);
    await completeIntakeStep(user);

    const startPlanButton = await screen.findByRole('button', { name: /Start Plan/i });
    await user.click(startPlanButton);

    expect(
      await screen.findByRole('heading', { name: /Feasibility Review/i })
    ).toBeInTheDocument();
    expect(document.querySelector('[data-wt="ob-feasibility-summary"]')).toBeTruthy();
    expect(document.querySelector('[data-wt="ob-feasibility-goals"]')).toBeTruthy();
    expect(document.querySelector('[data-wt="ob-feasibility-continue"]')).toBeTruthy();
  });
});
