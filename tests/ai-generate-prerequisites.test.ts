import { beforeEach, describe, expect, it, vi } from 'vitest';

const callEdgeFunctionMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  callEdgeFunction: (...args: any[]) => callEdgeFunctionMock(...args),
}));

import { generatePrerequisites } from '../lib/api/ai';

const baseInput = {
  goal: {
    title: 'Run a marathon',
    category: 'health',
    timeline: '20 weeks',
    estimatedWeeks: 20,
    originalInput: 'Run my first marathon',
  },
  intakeAnswers: {
    current_state: 'Can run 5k with moderate effort',
    target_state: 'Finish a full marathon',
    weekly_time_budget_hours: 6,
    target_timeframe_weeks: 20,
  },
  profile: {
    role: 'Founder',
    bio: 'Busy weekdays',
    chronotype: 'early_bird' as const,
    energyLevel: 'balanced' as const,
  },
};

describe('generatePrerequisites API wrapper', () => {
  beforeEach(() => {
    callEdgeFunctionMock.mockReset();
  });

  it('calls generate-prerequisites and normalizes valid output', async () => {
    callEdgeFunctionMock.mockResolvedValueOnce({
      data: {
        prerequisites: [
          { label: '  Confirm race date and cutoff time  ', order: 4 },
          { label: 'Assess current long-run baseline', order: 2 },
          { label: 'Assess current long-run baseline', order: 3 },
          { label: 'Get footwear gait analysis', order: 1 },
          { label: 'Schedule weekly training blocks', order: 5 },
          { label: 'Set recovery protocol', order: 6 },
        ],
      },
      error: null,
    });

    const result = await generatePrerequisites(baseInput);

    expect(callEdgeFunctionMock).toHaveBeenCalledWith(
      'generate-prerequisites',
      expect.objectContaining({
        goal: expect.objectContaining({
          title: 'Run a marathon',
          category: 'health',
        }),
        intakeAnswers: expect.objectContaining({
          current_state: 'Can run 5k with moderate effort',
          target_timeframe_weeks: 20,
        }),
        userProfile: expect.objectContaining({
          role: 'Founder',
          chronotype: 'early_bird',
        }),
      })
    );

    expect(result.prerequisites).toEqual([
      { label: 'Get footwear gait analysis', order: 1 },
      { label: 'Assess current long-run baseline', order: 2 },
      { label: 'Confirm race date and cutoff time', order: 3 },
      { label: 'Schedule weekly training blocks', order: 4 },
      { label: 'Set recovery protocol', order: 5 },
    ]);
  });

  it('throws when edge function returns an error', async () => {
    callEdgeFunctionMock.mockResolvedValueOnce({
      data: null,
      error: 'Function unavailable',
    });

    await expect(generatePrerequisites(baseInput)).rejects.toThrow(/Function unavailable/i);
  });

  it('throws when no data is returned', async () => {
    callEdgeFunctionMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    await expect(generatePrerequisites(baseInput)).rejects.toThrow(/No data returned from generate-prerequisites/i);
  });

  it('throws when AI returns too few prerequisites', async () => {
    callEdgeFunctionMock.mockResolvedValueOnce({
      data: {
        prerequisites: [
          { label: 'Baseline check', order: 1 },
          { label: 'Schedule setup', order: 2 },
          { label: 'Resource prep', order: 3 },
        ],
      },
      error: null,
    });

    await expect(generatePrerequisites(baseInput)).rejects.toThrow(/too few personalized prerequisites/i);
  });
});
