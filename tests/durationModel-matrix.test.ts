import { describe, expect, it } from 'vitest';
import { computeDurationModel } from '../utils/durationModel';
import type { CognitiveType } from '../constants/calendarTypes';

const archetypes = ['HABIT_BUILDING', 'DEEP_WORK_PROJECT', 'SKILL_ACQUISITION', 'MAINTENANCE'] as const;
const cognitiveTypes: CognitiveType[] = ['deep_work', 'learning', 'creative', 'admin', 'shallow_work'];
const energyLevels = ['high_octane', 'balanced', 'recovery'] as const;
const sameDayLoads = [60, 300] as const;

const baseCases = archetypes.flatMap((goalArchetype) =>
  cognitiveTypes.flatMap((cognitiveType) =>
    energyLevels.flatMap((energyLevel) =>
      sameDayLoads.map((sameDayLoadMinutes) => ({
        goalArchetype,
        cognitiveType,
        energyLevel,
        sameDayLoadMinutes,
      }))
    )
  )
);

const roundToFive = (value: number) => Math.round(value / 5) * 5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

describe('duration model matrix coverage', () => {
  it.each(baseCases)(
    'returns bounded and rounded output for %o',
    ({ goalArchetype, cognitiveType, energyLevel, sameDayLoadMinutes }) => {
      const output = computeDurationModel({
        estimatedMinutes: 55,
        difficulty: 3,
        cognitiveType,
        subTaskCount: 3,
        energyLevel,
        sameDayLoadMinutes,
        goalCadencePerWeek: 3,
        goalArchetype,
      });

      expect(Number.isFinite(output.focusDurationMinutes)).toBe(true);
      expect(Number.isFinite(output.bufferMinutes)).toBe(true);
      expect(Number.isFinite(output.scheduledRecommendationMinutes)).toBe(true);

      expect(output.focusDurationMinutes % 5).toBe(0);
      expect(output.bufferMinutes % 5).toBe(0);
      expect(output.scheduledRecommendationMinutes % 5).toBe(0);

      expect(output.focusDurationMinutes).toBeGreaterThanOrEqual(15);
      expect(output.focusDurationMinutes).toBeLessThanOrEqual(180);
      expect(output.bufferMinutes).toBeGreaterThanOrEqual(5);
      expect(output.bufferMinutes).toBeLessThanOrEqual(45);
      expect(output.scheduledRecommendationMinutes).toBeGreaterThanOrEqual(20);
      expect(output.scheduledRecommendationMinutes).toBeLessThanOrEqual(210);
      expect(output.scheduledRecommendationMinutes).toBeGreaterThanOrEqual(output.focusDurationMinutes);

      expect(output.scheduledRecommendationMinutes).toBe(
        clamp(roundToFive(output.focusDurationMinutes + output.bufferMinutes), 20, 210)
      );
    }
  );

  const comparisonCombos = archetypes.flatMap((goalArchetype) =>
    cognitiveTypes.map((cognitiveType) => ({ goalArchetype, cognitiveType }))
  );

  it.each(comparisonCombos.slice(0, 10))(
    'reduces focus block under high same-day load for %o',
    ({ goalArchetype, cognitiveType }) => {
      const lowLoad = computeDurationModel({
        estimatedMinutes: 60,
        difficulty: 4,
        cognitiveType,
        subTaskCount: 4,
        energyLevel: 'balanced',
        sameDayLoadMinutes: 60,
        goalCadencePerWeek: 3,
        goalArchetype,
      });

      const highLoad = computeDurationModel({
        estimatedMinutes: 60,
        difficulty: 4,
        cognitiveType,
        subTaskCount: 4,
        energyLevel: 'balanced',
        sameDayLoadMinutes: 360,
        goalCadencePerWeek: 3,
        goalArchetype,
      });

      expect(highLoad.focusDurationMinutes).toBeLessThanOrEqual(lowLoad.focusDurationMinutes);
      expect(highLoad.scheduledRecommendationMinutes).toBeLessThanOrEqual(lowLoad.scheduledRecommendationMinutes);
    }
  );

  it.each(comparisonCombos.slice(10, 20))(
    'increases focus block for high energy compared with recovery for %o',
    ({ goalArchetype, cognitiveType }) => {
      const highEnergy = computeDurationModel({
        estimatedMinutes: 70,
        difficulty: 3,
        cognitiveType,
        subTaskCount: 3,
        energyLevel: 'high_octane',
        sameDayLoadMinutes: 120,
        goalCadencePerWeek: 3,
        goalArchetype,
      });

      const recoveryEnergy = computeDurationModel({
        estimatedMinutes: 70,
        difficulty: 3,
        cognitiveType,
        subTaskCount: 3,
        energyLevel: 'recovery',
        sameDayLoadMinutes: 120,
        goalCadencePerWeek: 3,
        goalArchetype,
      });

      expect(highEnergy.focusDurationMinutes).toBeGreaterThanOrEqual(recoveryEnergy.focusDurationMinutes);
      expect(highEnergy.scheduledRecommendationMinutes).toBeGreaterThanOrEqual(
        recoveryEnergy.scheduledRecommendationMinutes
      );
    }
  );

  it.each(comparisonCombos.slice(0, 10))(
    'uses shorter blocks for high cadence than low cadence for %o',
    ({ goalArchetype, cognitiveType }) => {
      const lowCadence = computeDurationModel({
        estimatedMinutes: 65,
        difficulty: 2,
        cognitiveType,
        subTaskCount: 2,
        energyLevel: 'balanced',
        sameDayLoadMinutes: 90,
        goalCadencePerWeek: 2,
        goalArchetype,
      });

      const highCadence = computeDurationModel({
        estimatedMinutes: 65,
        difficulty: 2,
        cognitiveType,
        subTaskCount: 2,
        energyLevel: 'balanced',
        sameDayLoadMinutes: 90,
        goalCadencePerWeek: 6,
        goalArchetype,
      });

      expect(highCadence.focusDurationMinutes).toBeLessThanOrEqual(lowCadence.focusDurationMinutes);
      expect(highCadence.scheduledRecommendationMinutes).toBeLessThanOrEqual(
        lowCadence.scheduledRecommendationMinutes
      );
    }
  );
});
