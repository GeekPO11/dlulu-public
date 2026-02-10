import { beforeEach, describe, expect, it, vi } from 'vitest';

const callEdgeFunctionMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  callEdgeFunction: (...args: any[]) => callEdgeFunctionMock(...args),
}));

import { analyzeAmbitions } from '../lib/api/ai';

const baseInput = {
  ambitionText: 'Become financially independent',
  profile: {
    name: 'Jordan',
    role: 'Engineer',
    bio: 'Prefers clear plans',
    chronotype: 'flexible',
    energyLevel: 'balanced',
  },
};

const categoryCases: Array<[string, string]> = [
  ['health', 'health'],
  ['CAREER', 'career'],
  ['invalid-category', 'personal'],
  ['financial', 'financial'],
  ['RELATIONSHIPS', 'relationships'],
];

type QuestionTypeCase = {
  rawType: unknown;
  expectedType: string;
  options?: Array<{ id?: string; label?: string; value?: string }>;
};

const typeCases: QuestionTypeCase[] = [
  { rawType: 'short_text', expectedType: 'short_text' },
  { rawType: 'long_text', expectedType: 'long_text' },
  { rawType: 'number', expectedType: 'number' },
  {
    rawType: 'single_select',
    expectedType: 'single_select',
    options: [
      { label: '3 months', value: '12' },
      { id: 'opt-2', label: '6 months', value: '24' },
    ],
  },
  {
    rawType: 'multi_select',
    expectedType: 'multi_select',
    options: [
      { label: 'Morning' },
      { label: 'Evening', value: 'evening' },
    ],
  },
  { rawType: 'boolean', expectedType: 'boolean' },
  { rawType: 'date', expectedType: 'date' },
  { rawType: 'timeline_text', expectedType: 'short_text' },
  { rawType: '', expectedType: 'short_text' },
  { rawType: null, expectedType: 'short_text' },
];

const matrix = categoryCases.flatMap(([rawCategory, expectedCategory]) =>
  typeCases.map((typeCase, caseIndex) => ({ rawCategory, expectedCategory, typeCase, caseIndex }))
);

describe('analyzeAmbitions question-type normalization matrix', () => {
  beforeEach(() => {
    callEdgeFunctionMock.mockReset();
  });

  it.each(matrix)(
    'normalizes category/type %# ($rawCategory, $typeCase.rawType)',
    async ({ rawCategory, expectedCategory, typeCase, caseIndex }) => {
      const questionId = `timeframe-${caseIndex}`;

      callEdgeFunctionMock.mockResolvedValueOnce({
        data: {
          goals: [
            {
              title: `Goal ${caseIndex + 1}`,
              originalInput: 'Become financially independent',
              category: rawCategory,
              timeline: '26 weeks',
              estimatedWeeks: 26,
              prerequisites: [{ label: 'Define baseline', order: 1 }],
              intakeQuestions: [
                {
                  id: `current-${caseIndex}`,
                  fieldKey: 'current_state',
                  question: 'Where are you currently?',
                  type: 'long_text',
                  required: true,
                },
                {
                  id: `target-${caseIndex}`,
                  fieldKey: 'target_state',
                  question: 'What exact outcome do you want?',
                  type: 'short_text',
                  required: true,
                },
                {
                  id: questionId,
                  fieldKey: 'target_timeframe_weeks',
                  question: 'By when do you want to achieve this goal?',
                  type: typeCase.rawType,
                  required: true,
                  options: typeCase.options,
                },
              ],
            },
          ],
        },
        error: null,
      });

      const response = await analyzeAmbitions(baseInput);
      const goal = response.goals[0];
      const timeframeQuestion = goal.intakeQuestions?.find((question) => question.id === questionId);

      expect(goal.category).toBe(expectedCategory);
      expect(timeframeQuestion).toBeTruthy();
      expect(timeframeQuestion?.type).toBe(typeCase.expectedType);

      if (typeCase.expectedType === 'single_select' || typeCase.expectedType === 'multi_select') {
        expect(timeframeQuestion?.options?.length).toBeGreaterThanOrEqual(2);
        expect(timeframeQuestion?.options?.every((option) => option.id && option.label && option.value)).toBe(true);
      } else {
        expect(timeframeQuestion?.options).toBeUndefined();
      }
    }
  );
});
