import type { CognitiveType } from '../constants/calendarTypes';

export interface DurationModelInput {
  estimatedMinutes?: number;
  difficulty?: number;
  cognitiveType?: CognitiveType;
  subTaskCount?: number;
  energyLevel?: 'high_octane' | 'balanced' | 'recovery' | string;
  sameDayLoadMinutes?: number;
  goalCadencePerWeek?: number;
  goalArchetype?: 'HABIT_BUILDING' | 'DEEP_WORK_PROJECT' | 'SKILL_ACQUISITION' | 'MAINTENANCE' | string;
}

export interface DurationModelOutput {
  focusDurationMinutes: number;
  bufferMinutes: number;
  scheduledRecommendationMinutes: number;
}

const roundToFive = (value: number): number => Math.round(value / 5) * 5;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const ARCHETYPE_BASE: Record<string, number> = {
  HABIT_BUILDING: 30,
  DEEP_WORK_PROJECT: 80,
  SKILL_ACQUISITION: 50,
  MAINTENANCE: 35,
};

const COGNITIVE_ADJUSTMENT: Partial<Record<CognitiveType, number>> = {
  deep_work: 20,
  learning: 10,
  creative: 10,
  admin: -5,
  shallow_work: -10,
};

const ENERGY_MULTIPLIER: Record<string, number> = {
  high_octane: 1.08,
  balanced: 1,
  recovery: 0.82,
};

export const computeDurationModel = (input: DurationModelInput): DurationModelOutput => {
  const estimated = Number.isFinite(Number(input.estimatedMinutes)) && Number(input.estimatedMinutes) > 0
    ? Number(input.estimatedMinutes)
    : undefined;

  const baseFromArchetype = ARCHETYPE_BASE[input.goalArchetype || ''] ?? ARCHETYPE_BASE.SKILL_ACQUISITION;
  let focus = estimated ?? baseFromArchetype;

  const cognitiveAdjustment = COGNITIVE_ADJUSTMENT[input.cognitiveType || 'shallow_work'] ?? 0;
  focus += cognitiveAdjustment;

  const difficulty = Number.isFinite(Number(input.difficulty)) ? clamp(Number(input.difficulty), 1, 5) : 3;
  focus += (difficulty - 3) * 8;

  const subTaskCount = Number.isFinite(Number(input.subTaskCount)) ? Math.max(0, Number(input.subTaskCount)) : 0;
  if (subTaskCount >= 5) focus += 10;
  else if (subTaskCount <= 1) focus -= 5;

  const energyMultiplier = ENERGY_MULTIPLIER[input.energyLevel || 'balanced'] ?? 1;
  focus *= energyMultiplier;

  const cadence = Number.isFinite(Number(input.goalCadencePerWeek)) ? Math.max(1, Number(input.goalCadencePerWeek)) : 3;
  if (cadence >= 6) focus *= 0.88;
  else if (cadence <= 2) focus *= 1.1;

  const sameDayLoad = Number.isFinite(Number(input.sameDayLoadMinutes)) ? Math.max(0, Number(input.sameDayLoadMinutes)) : 0;
  if (sameDayLoad >= 360) focus *= 0.8;
  else if (sameDayLoad >= 240) focus *= 0.9;
  else if (sameDayLoad <= 90) focus *= 1.05;

  const focusDurationMinutes = clamp(roundToFive(focus), 15, 180);

  const bufferBase = Math.max(5, focusDurationMinutes * 0.15);
  const loadBuffer = sameDayLoad >= 300 ? 10 : sameDayLoad >= 180 ? 5 : 0;
  const complexityBuffer = difficulty >= 4 ? 10 : difficulty <= 2 ? 0 : 5;
  const bufferMinutes = clamp(roundToFive(bufferBase + loadBuffer + complexityBuffer), 5, 45);

  const scheduledRecommendationMinutes = clamp(
    roundToFive(focusDurationMinutes + bufferMinutes),
    20,
    210
  );

  return {
    focusDurationMinutes,
    bufferMinutes,
    scheduledRecommendationMinutes,
  };
};
