import { describe, expect, it } from 'vitest';
import { transformGoalFromDb } from '../lib/api/transformers';

const baseDbGoal = () => ({
  id: 'goal-db-1',
  title: 'Ship MVP',
  original_input: 'Ship MVP',
  category: 'career',
  timeline: '12 weeks',
  estimated_weeks: 12,
  strategy_overview: 'Break the scope and ship weekly.',
  critical_gaps: [],
  overview_generated: false,
  behavior_plan: null,
  priority_weight: 50,
  risk_level: 'low',
  risk_acknowledged_at: null,
  current_phase_index: 0,
  overall_progress: 0,
  status: 'active',
  is_scheduled: false,
  preferred_time: 'morning',
  frequency: 4,
  duration: 45,
  energy_cost: 'medium',
  preferred_days: [1, 3, 5],
  phases: [],
  created_at: '2026-02-08T00:00:00.000Z',
  updated_at: '2026-02-08T00:00:00.000Z',
});

describe('transformGoalFromDb', () => {
  it('normalizes legacy string critical gaps into a clean list', () => {
    const transformed = transformGoalFromDb({
      ...baseDbGoal(),
      critical_gaps: ' Missed planning \n\n No recovery buffer \n ',
    });

    expect(transformed.criticalGaps).toEqual(['Missed planning', 'No recovery buffer']);
  });

  it('parses JSON string behavior plans and keeps valid risk level values', () => {
    const transformed = transformGoalFromDb({
      ...baseDbGoal(),
      behavior_plan: JSON.stringify({
        smart: { specific: 'Ship one feature each week' },
        woop: { obstacles: ['Context switching'] },
      }),
      risk_level: 'medium',
    });

    expect(transformed.behaviorPlan?.smart?.specific).toBe('Ship one feature each week');
    expect(transformed.riskLevel).toBe('medium');
  });

  it('falls back to safe defaults for malformed risk and preferred days', () => {
    const transformed = transformGoalFromDb({
      ...baseDbGoal(),
      risk_level: 'urgent',
      preferred_days: ['1', 3, null, 5],
    });

    expect(transformed.riskLevel).toBe('low');
    expect(transformed.preferredDays).toEqual([3, 5]);
  });
});
