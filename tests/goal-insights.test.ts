import { describe, expect, it } from 'vitest';
import type { BehaviorPlan, Goal } from '../types';
import {
  deriveRiskLevelFromCriticalGaps,
  hasBehaviorPlanContent,
  isGoalOverviewComplete,
  mergeGoalOverview,
  normalizeCriticalGaps,
  resolveRiskLevel,
  riskLevelToDisplay,
} from '../lib/goalInsights';

const emptyBehaviorPlan: BehaviorPlan = {
  smart: {
    specific: '',
    measurable: '',
    achievable: '',
    relevant: '',
    timeBound: '',
  },
  woop: {
    wish: '',
    outcome: '',
    obstacles: [],
    plan: [],
  },
  implementationIntentions: [],
  habitStacking: [],
  frictionReduction: {
    remove: [],
    add: [],
  },
};

const baseGoal = (): Goal => ({
  id: 'goal-1',
  title: 'Run marathon',
  originalInput: 'Run marathon',
  category: 'health',
  timeline: '6 months',
  estimatedWeeks: 24,
  strategyOverview: '',
  criticalGaps: [],
  overviewGenerated: false,
  behaviorPlan: undefined,
  priorityWeight: 50,
  riskLevel: 'low',
  phases: [],
  currentPhaseIndex: 0,
  overallProgress: 0,
  status: 'active',
  history: [],
  preferredTime: 'morning',
  frequency: 4,
  duration: 60,
  energyCost: 'medium',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('goal insights utilities', () => {
  it('normalizes critical gaps by trimming and removing empty values', () => {
    expect(normalizeCriticalGaps(['  Sleep debt  ', '', ' ', 'Hydration', 10 as any])).toEqual([
      'Sleep debt',
      'Hydration',
    ]);
  });

  it('returns empty gaps for non-array values', () => {
    expect(normalizeCriticalGaps(undefined)).toEqual([]);
    expect(normalizeCriticalGaps('not-array')).toEqual([]);
    expect(normalizeCriticalGaps(null)).toEqual([]);
  });

  it('detects missing behavior-plan content when all fields are empty', () => {
    expect(hasBehaviorPlanContent(undefined)).toBe(false);
    expect(hasBehaviorPlanContent(emptyBehaviorPlan)).toBe(false);
  });

  it('detects behavior-plan content from SMART text, WOOP lists, and intentions', () => {
    expect(hasBehaviorPlanContent({
      ...emptyBehaviorPlan,
      smart: { ...emptyBehaviorPlan.smart, specific: 'Run 4x/week' },
    })).toBe(true);

    expect(hasBehaviorPlanContent({
      ...emptyBehaviorPlan,
      woop: { ...emptyBehaviorPlan.woop, obstacles: ['Late-night work'] },
    })).toBe(true);

    expect(hasBehaviorPlanContent({
      ...emptyBehaviorPlan,
      implementationIntentions: [{ if: 'Rain', then: 'Use treadmill' }],
    })).toBe(true);
  });

  it('derives risk level from critical gaps count', () => {
    expect(deriveRiskLevelFromCriticalGaps([])).toBe('low');
    expect(deriveRiskLevelFromCriticalGaps(['a'])).toBe('low');
    expect(deriveRiskLevelFromCriticalGaps(['a', 'b'])).toBe('medium');
    expect(deriveRiskLevelFromCriticalGaps(['a', 'b', 'c', 'd'])).toBe('high');
  });

  it('uses explicit risk level when valid and falls back to derived risk otherwise', () => {
    expect(resolveRiskLevel('high', ['a'])).toBe('high');
    expect(resolveRiskLevel('invalid', ['a', 'b'])).toBe('medium');
    expect(resolveRiskLevel(undefined, ['a', 'b', 'c', 'd'])).toBe('high');
  });

  it('maps risk levels to goals-view display labels and colors', () => {
    expect(riskLevelToDisplay('low')).toEqual({ label: 'Low Risk', toneClass: 'text-green-500' });
    expect(riskLevelToDisplay('medium')).toEqual({ label: 'Moderate Sensitivity', toneClass: 'text-yellow-500' });
    expect(riskLevelToDisplay('high')).toEqual({ label: 'High Sensitivity', toneClass: 'text-rose-500' });
  });

  it('requires strategy + gaps + behavior plan for overview completeness', () => {
    expect(isGoalOverviewComplete({
      strategyOverview: 'Solid strategy',
      criticalGaps: ['Gap 1'],
      behaviorPlan: {
        ...emptyBehaviorPlan,
        smart: { ...emptyBehaviorPlan.smart, measurable: 'Track 4 sessions weekly' },
      },
    })).toBe(true);

    expect(isGoalOverviewComplete({
      strategyOverview: 'Solid strategy',
      criticalGaps: ['Gap 1'],
      behaviorPlan: emptyBehaviorPlan,
    })).toBe(false);
  });

  it('merges generated overview and computes readiness + risk', () => {
    const goal = baseGoal();
    const merged = mergeGoalOverview(goal, {
      strategyOverview: 'Build mileage progressively',
      criticalGaps: ['Inconsistent sleep', 'Skipping recovery runs'],
      behaviorPlan: {
        ...emptyBehaviorPlan,
        smart: { ...emptyBehaviorPlan.smart, specific: 'Train 4 sessions each week' },
      },
    });

    expect(merged.strategyOverview).toBe('Build mileage progressively');
    expect(merged.criticalGaps).toEqual(['Inconsistent sleep', 'Skipping recovery runs']);
    expect(merged.overviewGenerated).toBe(true);
    expect(merged.riskLevel).toBe('medium');
    expect(hasBehaviorPlanContent(merged.behaviorPlan)).toBe(true);
  });

  it('preserves existing overview data when generated response is partial', () => {
    const goal = {
      ...baseGoal(),
      strategyOverview: 'Existing strategy',
      criticalGaps: ['Existing gap'],
      behaviorPlan: {
        ...emptyBehaviorPlan,
        smart: { ...emptyBehaviorPlan.smart, specific: 'Existing behavior' },
      },
      riskLevel: 'high' as Goal['riskLevel'],
    };

    const merged = mergeGoalOverview(goal, {
      strategyOverview: '   ',
      criticalGaps: [],
      behaviorPlan: emptyBehaviorPlan,
    });

    expect(merged.strategyOverview).toBe('Existing strategy');
    expect(merged.criticalGaps).toEqual(['Existing gap']);
    expect(merged.overviewGenerated).toBe(true);
    expect(merged.riskLevel).toBe('high');
    expect(merged.behaviorPlan?.smart.specific).toBe('Existing behavior');
  });

  it('marks overview as not generated when strategy, gaps, or behavior plan are missing', () => {
    const goal = baseGoal();

    expect(mergeGoalOverview(goal, {
      strategyOverview: '',
      criticalGaps: ['Gap'],
    }).overviewGenerated).toBe(false);

    expect(mergeGoalOverview(goal, {
      strategyOverview: 'Strategy',
      criticalGaps: [],
    }).overviewGenerated).toBe(false);

    expect(mergeGoalOverview(goal, {
      strategyOverview: 'Strategy',
      criticalGaps: ['Gap'],
      behaviorPlan: emptyBehaviorPlan,
    }).overviewGenerated).toBe(false);
  });
});
