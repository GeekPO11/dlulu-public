import type { BehaviorPlan, Goal } from '../types';

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const listHasContent = (items: unknown): boolean =>
  Array.isArray(items) && items.some((item) => hasText(item));

export const normalizeCriticalGaps = (gaps: unknown): string[] => {
  if (!Array.isArray(gaps)) return [];
  return gaps
    .filter((gap): gap is string => typeof gap === 'string')
    .map((gap) => gap.trim())
    .filter(Boolean);
};

export const hasBehaviorPlanContent = (plan?: BehaviorPlan | null): boolean => {
  if (!plan) return false;

  return Boolean(
    hasText(plan.smart?.specific) ||
    hasText(plan.smart?.measurable) ||
    hasText(plan.smart?.achievable) ||
    hasText(plan.smart?.relevant) ||
    hasText(plan.smart?.timeBound) ||
    hasText(plan.woop?.wish) ||
    hasText(plan.woop?.outcome) ||
    listHasContent(plan.woop?.obstacles) ||
    listHasContent(plan.woop?.plan) ||
    Array.isArray(plan.implementationIntentions) && plan.implementationIntentions.some((item) => hasText(item?.if) || hasText(item?.then)) ||
    Array.isArray(plan.habitStacking) && plan.habitStacking.some((item) => hasText(item?.anchor) || hasText(item?.routine) || hasText(item?.reward)) ||
    listHasContent(plan.frictionReduction?.remove) ||
    listHasContent(plan.frictionReduction?.add)
  );
};

export const deriveRiskLevelFromCriticalGaps = (gaps: unknown): Goal['riskLevel'] => {
  const gapCount = normalizeCriticalGaps(gaps).length;
  if (gapCount >= 4) return 'high';
  if (gapCount >= 2) return 'medium';
  return 'low';
};

export const resolveRiskLevel = (riskLevel: unknown, gaps: unknown): Goal['riskLevel'] => {
  const derived = deriveRiskLevelFromCriticalGaps(gaps);
  if (riskLevel !== 'low' && riskLevel !== 'medium' && riskLevel !== 'high') {
    return derived;
  }

  const rank: Record<Goal['riskLevel'], number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  return rank[derived] > rank[riskLevel] ? derived : riskLevel;
};

export const riskLevelToDisplay = (riskLevel: Goal['riskLevel']) => {
  if (riskLevel === 'high') {
    return {
      label: 'High Sensitivity',
      toneClass: 'text-rose-500',
    };
  }
  if (riskLevel === 'medium') {
    return {
      label: 'Moderate Sensitivity',
      toneClass: 'text-yellow-500',
    };
  }
  return {
    label: 'Low Risk',
    toneClass: 'text-green-500',
  };
};

export interface GoalOverviewResult {
  strategyOverview?: string;
  criticalGaps?: string[];
  behaviorPlan?: BehaviorPlan;
}

export interface GoalOverviewSnapshot {
  strategyOverview?: string | null;
  criticalGaps?: unknown;
  behaviorPlan?: BehaviorPlan | null;
}

export const isGoalOverviewComplete = (
  snapshot: GoalOverviewSnapshot,
): boolean => {
  const strategyReady = hasText(snapshot.strategyOverview ?? '');
  const gapsReady = normalizeCriticalGaps(snapshot.criticalGaps).length > 0;
  const behaviorReady = hasBehaviorPlanContent(snapshot.behaviorPlan);
  return strategyReady && gapsReady && behaviorReady;
};

export const mergeGoalOverview = (
  goal: Goal,
  result: GoalOverviewResult,
) => {
  const generatedStrategy = hasText(result.strategyOverview) ? result.strategyOverview.trim() : '';
  const existingStrategy = hasText(goal.strategyOverview) ? goal.strategyOverview.trim() : '';
  const strategyOverview = generatedStrategy || existingStrategy;

  const generatedGaps = normalizeCriticalGaps(result.criticalGaps);
  const existingGaps = normalizeCriticalGaps(goal.criticalGaps);
  const criticalGaps = generatedGaps.length > 0 ? generatedGaps : existingGaps;

  const behaviorPlan = hasBehaviorPlanContent(result.behaviorPlan)
    ? result.behaviorPlan
    : goal.behaviorPlan;

  const overviewGenerated = isGoalOverviewComplete({
    strategyOverview,
    criticalGaps,
    behaviorPlan,
  });
  const riskLevel = resolveRiskLevel(goal.riskLevel, criticalGaps);

  return {
    strategyOverview,
    criticalGaps,
    behaviorPlan,
    overviewGenerated,
    riskLevel,
  };
};
