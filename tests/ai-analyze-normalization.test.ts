import { beforeEach, describe, expect, it, vi } from 'vitest';

const callEdgeFunctionMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  callEdgeFunction: (...args: any[]) => callEdgeFunctionMock(...args),
}));

import { analyzeAmbitions } from '../lib/api/ai';

const baseInput = {
  ambitionText: 'Run a marathon',
  profile: {
    name: 'Alex',
    role: 'Analyst',
    bio: 'Busy schedule',
    chronotype: 'flexible',
    energyLevel: 'balanced',
  },
};

const categoryCases: Array<[string, string]> = [
  ['health', 'health'],
  ['CAREER', 'career'],
  ['Learning', 'learning'],
  ['personal', 'personal'],
  ['FINANCIAL', 'financial'],
  ['Relationships', 'relationships'],
];

const timeframeVariants = [
  { fieldKey: 'target_timeframe_weeks', question: 'By when do you want to achieve this?' },
  { fieldKey: 'target_timeframe', question: 'What is your timeframe?' },
  { fieldKey: 'target_date', question: 'What is your target date?' },
  { fieldKey: 'goal_deadline_window', question: 'What deadline are you aiming for?' },
  { fieldKey: 'completion_window', question: 'How long should this take?' },
  { fieldKey: 'weeks_to_target', question: 'How many weeks do you want to allocate?' },
  { fieldKey: 'timeline_goal', question: 'What timeline do you prefer?' },
  { fieldKey: 'eta', question: 'By when should this be done?' },
  { fieldKey: 'finish_window', question: 'Time frame to finish this goal?' },
  { fieldKey: 'plan_target', question: 'Target date for completion?' },
] as const;

const validMatrix = categoryCases.flatMap(([rawCategory, expectedCategory]) =>
  timeframeVariants.map((variant, index) => ({
    rawCategory,
    expectedCategory,
    variant,
    index,
  }))
);

const invalidNoTimeframeVariants = [
  { fieldKey: 'weekly_training_hours', question: 'How many hours per week can you train?' },
  { fieldKey: 'budget', question: 'What is your budget?' },
  { fieldKey: 'motivation', question: 'Why does this goal matter to you?' },
  { fieldKey: 'constraints', question: 'What constraints do you currently have?' },
  { fieldKey: 'support_system', question: 'Who can support you on this journey?' },
  { fieldKey: 'experience_level', question: 'What is your current level?' },
  { fieldKey: 'resources', question: 'What resources are currently available?' },
  { fieldKey: 'risk_tolerance', question: 'How much risk can you handle?' },
  { fieldKey: 'preferred_style', question: 'What style do you prefer?' },
  { fieldKey: 'baseline_metric', question: 'What is your baseline metric right now?' },
] as const;

const invalidMatrix = ['health', 'career', 'financial', 'personal'].flatMap((rawCategory) =>
  invalidNoTimeframeVariants.map((variant, index) => ({ rawCategory, variant, index }))
);

describe('analyzeAmbitions normalization and gating matrix', () => {
  beforeEach(() => {
    callEdgeFunctionMock.mockReset();
  });

  it.each(validMatrix)(
    'accepts valid timeframe variant %# ($rawCategory, $variant.fieldKey)',
    async ({ rawCategory, expectedCategory, variant, index }) => {
      callEdgeFunctionMock.mockResolvedValueOnce({
        data: {
          goals: [
            {
              title: `Goal ${index + 1}`,
              originalInput: 'Run a marathon',
              category: rawCategory,
              timeline: '',
              estimatedWeeks: 0,
              prerequisites: [{ label: 'Start baseline assessment', order: 1 }],
              intakeQuestions: [
                {
                  id: `current-${index}`,
                  fieldKey: 'current_state',
                  question: 'Where are you currently? ',
                  type: 'long_text',
                  required: true,
                },
                {
                  id: `target-${index}`,
                  fieldKey: 'target_state',
                  question: 'What exact outcome do you want?',
                  type: 'short_text',
                  required: true,
                },
                {
                  id: `time-${index}`,
                  fieldKey: variant.fieldKey,
                  question: variant.question,
                  type: 'number',
                  required: true,
                },
              ],
            },
          ],
        },
        error: null,
      });

      const response = await analyzeAmbitions(baseInput);

      expect(callEdgeFunctionMock).toHaveBeenCalledWith(
        'analyze-ambitions',
        expect.objectContaining({ ambitionText: baseInput.ambitionText })
      );
      expect(response.goals).toHaveLength(1);
      expect(response.goals[0].category).toBe(expectedCategory);
      expect(response.goals[0].timeline).toContain('weeks');
      expect(response.goals[0].intakeQuestions?.length).toBeGreaterThanOrEqual(3);
    }
  );

  it.each(invalidMatrix)(
    'rejects goals missing timeframe question %# ($rawCategory, $variant.fieldKey)',
    async ({ rawCategory, variant, index }) => {
      callEdgeFunctionMock.mockResolvedValueOnce({
        data: {
          goals: [
            {
              title: `No timeframe ${index + 1}`,
              originalInput: 'Run a marathon',
              category: rawCategory,
              timeline: '10 weeks',
              estimatedWeeks: 10,
              prerequisites: [{ label: 'Initial prep', order: 1 }],
              intakeQuestions: [
                {
                  id: `current-invalid-${index}`,
                  fieldKey: 'current_state',
                  question: 'Where are you currently?',
                  type: 'long_text',
                  required: true,
                },
                {
                  id: `target-invalid-${index}`,
                  fieldKey: 'target_state',
                  question: 'What exact outcome do you want?',
                  type: 'short_text',
                  required: true,
                },
                {
                  id: `other-invalid-${index}`,
                  fieldKey: variant.fieldKey,
                  question: variant.question,
                  type: 'short_text',
                  required: true,
                },
              ],
            },
          ],
        },
        error: null,
      });

      await expect(analyzeAmbitions(baseInput)).rejects.toThrow(/missing a timeframe question/i);
    }
  );
});
