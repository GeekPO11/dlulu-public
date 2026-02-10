import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, type MockedFunction } from 'vitest';

vi.mock('../services/gemini', () => ({
  analyzeAmbitions: vi.fn(),
  generatePrerequisites: vi.fn(),
  generateFullPlan: vi.fn(),
  parseRosterImage: vi.fn(),
  goalsToRoadmap: vi.fn(),
}));

import { analyzeAmbitions, generatePrerequisites } from '../services/gemini';
import Onboarding from '../components/Onboarding';

const analyzeAmbitionsMock = analyzeAmbitions as MockedFunction<typeof analyzeAmbitions>;
const generatePrerequisitesMock = generatePrerequisites as MockedFunction<typeof generatePrerequisites>;

const healthIntakeQuestions = [
  {
    id: 'q-current-state',
    fieldKey: 'current_state',
    question: 'Current health baseline',
    type: 'long_text',
    required: true,
  },
  {
    id: 'q-target-outcome',
    fieldKey: 'target_outcome',
    question: 'Target health outcome',
    type: 'short_text',
    required: true,
  },
  {
    id: 'q-current-weight',
    fieldKey: 'current_weight_kg',
    question: 'Current weight',
    type: 'number',
    required: true,
  },
  {
    id: 'q-target-weight',
    fieldKey: 'target_weight_kg',
    question: 'Target weight',
    type: 'number',
    required: true,
  },
  {
    id: 'q-timeframe',
    fieldKey: 'target_timeframe_weeks',
    question: 'Timeline in weeks',
    type: 'number',
    required: true,
  },
  {
    id: 'q-lifestyle',
    fieldKey: 'lifestyle_pattern',
    question: 'Describe your lifestyle and activity pattern',
    type: 'long_text',
    required: true,
  },
  {
    id: 'q-age-group',
    fieldKey: 'age_group',
    question: 'What is your age group?',
    type: 'short_text',
    required: true,
  },
] as const;

describe('Onboarding', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    generatePrerequisitesMock.mockResolvedValue({
      prerequisites: [
        { label: 'Baseline assessment completed', order: 1 },
        { label: 'Environment and tools ready', order: 2 },
        { label: 'Initial routine selected', order: 3 },
        { label: 'Weekly cadence blocked', order: 4 },
        { label: 'Progress tracker prepared', order: 5 },
      ],
    } as any);
  });

  it('requires name and role before continuing to goals', async () => {
    const user = userEvent.setup();
    render(<Onboarding onComplete={vi.fn()} onBack={vi.fn()} />);

    const continueButton = screen.getByRole('button', { name: /Continue Journey/i });
    expect(continueButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/Your full name/i), 'Jane Doe');
    await user.type(screen.getByPlaceholderText(/Entrepreneur/i), 'Founder');

    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(
      screen.getByRole('heading', { name: /What's your ambition/i })
    ).toBeInTheDocument();
  });

  it('submits ambitions and renders status check', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          intakeQuestions: healthIntakeQuestions,
          prerequisites: [{ label: 'Buy running shoes', order: 1 }],
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

    await waitFor(() =>
      expect(analyzeAmbitionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ambitionText: expect.stringContaining('Run a marathon'),
        })
      )
    );

    expect(
      await screen.findByText(/Run a marathon/i)
    ).toBeInTheDocument();
  });

  it('allows skipping profile and moves to goals', async () => {
    const user = userEvent.setup();
    render(<Onboarding onComplete={vi.fn()} onBack={vi.fn()} />);

    await user.click(
      screen.getByRole('button', { name: /Skip for now/i })
    );

    expect(
      screen.getByRole('heading', { name: /What's your ambition/i })
    ).toBeInTheDocument();
  });

  it('calls onBack when closing from step 0', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<Onboarding onComplete={vi.fn()} onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('restores onboarding progress from sessionStorage', async () => {
    sessionStorage.setItem(
      'dlulu_onboarding_progress',
      JSON.stringify({
        step: 1,
        profile: { name: 'Jane', role: 'Founder' },
        ambitionInput: 'Launch a startup',
        selectedGoals: [],
        constraints: {},
      })
    );

    render(<Onboarding onComplete={vi.fn()} onBack={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: /What's your ambition/i })
    ).toBeInTheDocument();

    const ambitionInput = screen.getByPlaceholderText(
      /Describe your ideal reality/i
    ) as HTMLInputElement;
    expect(ambitionInput.value).toBe('Launch a startup');
  });

  it('prefills ambition input when initialAmbition is provided', async () => {
    const user = userEvent.setup();
    render(
      <Onboarding
        onComplete={vi.fn()}
        onBack={vi.fn()}
        initialAmbition="Become fit"
      />
    );

    await user.type(screen.getByPlaceholderText(/Your full name/i), 'Jane Doe');
    await user.type(screen.getByPlaceholderText(/Entrepreneur/i), 'Founder');
    await user.click(screen.getByRole('button', { name: /Continue Journey/i }));

    const ambitionInput = screen.getByPlaceholderText(
      /Describe your ideal reality/i
    ) as HTMLInputElement;
    expect(ambitionInput.value).toBe('Become fit');
  });

  it('validates required intake fields before moving to status check', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          intakeQuestions: [
            ...healthIntakeQuestions,
          ],
          prerequisites: [],
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

    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));
    expect((await screen.findAllByText(/This field is required/i)).length).toBeGreaterThan(0);

    const numberInputs = await screen.findAllByPlaceholderText(/Enter a number/i);
    const textInputs = await screen.findAllByPlaceholderText(/Type your answer/i);
    await user.type(textInputs[0], 'I currently run 2 times per week.');
    await user.type(textInputs[1], 'Complete marathon-ready conditioning.');
    await user.type(textInputs[2], 'Desk job, mostly sedentary weekdays with evening walks.');
    await user.type(textInputs[3], '30-39');
    await user.type(numberInputs[0], '90');
    await user.type(numberInputs[1], '80');
    await user.type(numberInputs[2], '12');
    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));

    expect(await screen.findByText(/What have you already completed/i)).toBeInTheDocument();
  });

  it('passes existing goal context during add-goal ambition analysis', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          intakeQuestions: healthIntakeQuestions,
          prerequisites: [{ label: 'Buy running shoes', order: 1 }],
        },
      ],
    } as any);

    const user = userEvent.setup();
    render(
      <Onboarding
        onComplete={vi.fn()}
        onBack={vi.fn()}
        isAddGoalMode={true}
        initialStep={1}
        existingGoals={[
          {
            id: 'goal-1',
            title: 'Existing Goal',
            category: 'career',
            timeline: '24 weeks',
            estimatedWeeks: 24,
            status: 'active',
            preferredTime: 'morning',
            frequency: 3,
            duration: 60,
            energyCost: 'medium',
            phases: [],
            currentPhaseIndex: 0,
            overallProgress: 15,
            history: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            originalInput: 'Existing Goal',
          },
        ] as any}
      />
    );

    await user.type(
      screen.getByPlaceholderText(/Describe your ideal reality/i),
      'Run a marathon'
    );

    const ambitionContinue = document.querySelector(
      '[data-wt="ob-ambition-continue"]'
    ) as HTMLButtonElement | null;
    expect(ambitionContinue).toBeTruthy();
    await user.click(ambitionContinue as HTMLButtonElement);

    await waitFor(() =>
      expect(analyzeAmbitionsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ambitionText: expect.stringContaining('Run a marathon'),
          isAddGoalMode: true,
          existingGoals: expect.arrayContaining([
            expect.objectContaining({
              title: 'Existing Goal',
              timeline: '24 weeks',
            }),
          ]),
        })
      )
    );
  });

  it('requires feasibility acknowledgement for unrealistic intake timelines', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Lose weight safely',
          originalInput: 'Lose weight fast',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          intakeQuestions: [
            {
              id: 'q-current-state',
              fieldKey: 'current_state',
              question: 'Current health baseline',
              type: 'long_text',
              required: false,
            },
            {
              id: 'q-target-outcome',
              fieldKey: 'target_outcome',
              question: 'Target health outcome',
              type: 'short_text',
              required: false,
            },
            {
              id: 'q-current-weight',
              fieldKey: 'current_weight_kg',
              question: 'Current weight',
              type: 'number',
              required: true,
            },
            {
              id: 'q-target-weight',
              fieldKey: 'target_weight_kg',
              question: 'Target weight',
              type: 'number',
              required: true,
            },
            {
              id: 'q-timeframe',
              fieldKey: 'target_timeframe_weeks',
              question: 'Timeline in weeks',
              type: 'number',
              required: true,
            },
            {
              id: 'q-lifestyle',
              fieldKey: 'lifestyle_pattern',
              question: 'Describe your lifestyle and activity pattern',
              type: 'long_text',
              required: true,
            },
            {
              id: 'q-age-group',
              fieldKey: 'age_group',
              question: 'What is your age group?',
              type: 'short_text',
              required: true,
            },
          ],
          prerequisites: [],
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
      'Lose weight fast'
    );

    const ambitionContinue = document.querySelector(
      '[data-wt="ob-ambition-continue"]'
    ) as HTMLButtonElement | null;
    expect(ambitionContinue).toBeTruthy();
    await user.click(ambitionContinue as HTMLButtonElement);

    const numberInputs = await screen.findAllByPlaceholderText(/Enter a number/i);
    const textInputs = await screen.findAllByPlaceholderText(/Type your answer/i);
    await user.type(textInputs[0], 'I currently exercise twice a week.');
    await user.type(textInputs[1], 'Get leaner and improve stamina.');
    await user.type(textInputs[2], 'Mostly desk job, light evening walks.');
    await user.type(textInputs[3], '25-34');
    await user.type(numberInputs[0], '90');
    await user.type(numberInputs[1], '70');
    await user.type(numberInputs[2], '2');

    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));
    expect(await screen.findByText(/Please acknowledge the feasibility warning/i)).toBeInTheDocument();

    await user.click(
      screen.getByLabelText(/I understand this timeline may not be realistic/i)
    );
    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));
    expect(await screen.findByText(/What have you already completed/i)).toBeInTheDocument();
  });

  it('regenerates prerequisites after intake and renders the personalized checklist', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          intakeQuestions: [...healthIntakeQuestions],
          prerequisites: [{ label: 'Preliminary checklist item', order: 1 }],
        },
      ],
    } as any);

    generatePrerequisitesMock.mockResolvedValueOnce({
      prerequisites: [
        { label: 'Get gait analysis from a running store', order: 1 },
        { label: 'Confirm weekly training availability in calendar', order: 2 },
        { label: 'Establish current long-run baseline distance', order: 3 },
        { label: 'Select a race date that matches target timeline', order: 4 },
        { label: 'Set recovery and injury-prevention routine', order: 5 },
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

    const numberInputs = await screen.findAllByPlaceholderText(/Enter a number/i);
    const textInputs = await screen.findAllByPlaceholderText(/Type your answer/i);
    await user.type(textInputs[0], 'I run twice per week right now.');
    await user.type(textInputs[1], 'Finish my first marathon confidently.');
    await user.type(textInputs[2], 'Mostly desk job, available early mornings.');
    await user.type(textInputs[3], '30-39');
    await user.type(numberInputs[0], '82');
    await user.type(numberInputs[1], '76');
    await user.type(numberInputs[2], '20');
    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));

    await waitFor(() => expect(generatePrerequisitesMock).toHaveBeenCalledTimes(1));
    expect(generatePrerequisitesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.objectContaining({ title: 'Run a marathon' }),
        intakeAnswers: expect.objectContaining({
          current_state: 'I run twice per week right now.',
          target_state: 'Finish my first marathon confidently.',
          current_weight_kg: 82,
          target_weight_kg: 76,
          target_timeframe_weeks: 20,
        }),
      })
    );

    expect(await screen.findByText(/What have you already completed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Get gait analysis from a running store/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Preliminary checklist item/i })).not.toBeInTheDocument();
  });

  it('blocks status check on prerequisite-generation failure and allows retry', async () => {
    analyzeAmbitionsMock.mockResolvedValue({
      goals: [
        {
          title: 'Run a marathon',
          originalInput: 'Run a marathon',
          category: 'health',
          timeline: '12 weeks',
          estimatedWeeks: 12,
          intakeQuestions: [...healthIntakeQuestions],
          prerequisites: [{ label: 'Initial placeholder prerequisite', order: 1 }],
        },
      ],
    } as any);

    generatePrerequisitesMock
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValueOnce({
        prerequisites: [
          { label: 'Confirm shoes and running surface plan', order: 1 },
          { label: 'Map weekly training windows with constraints', order: 2 },
          { label: 'Set current pace and endurance baseline', order: 3 },
          { label: 'Pick a realistic event and taper timeline', order: 4 },
          { label: 'Define injury risk guardrails', order: 5 },
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

    const numberInputs = await screen.findAllByPlaceholderText(/Enter a number/i);
    const textInputs = await screen.findAllByPlaceholderText(/Type your answer/i);
    await user.type(textInputs[0], 'I run 5k a few times a month.');
    await user.type(textInputs[1], 'Run my first marathon and avoid injury.');
    await user.type(textInputs[2], 'Busy weekdays, longer weekend slots.');
    await user.type(textInputs[3], '25-34');
    await user.type(numberInputs[0], '88');
    await user.type(numberInputs[1], '80');
    await user.type(numberInputs[2], '24');
    await user.click(screen.getByRole('button', { name: /Continue to verification/i }));

    expect(await screen.findByText(/Service unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Step 3: Intake Questions/i)).toBeInTheDocument();
    expect(generatePrerequisitesMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Retry personalized status check/i }));
    expect(await screen.findByText(/What have you already completed/i)).toBeInTheDocument();
    expect(generatePrerequisitesMock).toHaveBeenCalledTimes(2);
  });
});
