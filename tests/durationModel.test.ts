import { describe, expect, it } from 'vitest';

import { computeDurationModel } from '../utils/durationModel';

describe('computeDurationModel', () => {
  it('returns rounded values and respects min/max bounds', () => {
    const tiny = computeDurationModel({
      estimatedMinutes: 1,
      difficulty: 1,
      cognitiveType: 'admin',
      energyLevel: 'recovery',
      sameDayLoadMinutes: 480,
      goalCadencePerWeek: 7,
      goalArchetype: 'MAINTENANCE',
    });

    const huge = computeDurationModel({
      estimatedMinutes: 999,
      difficulty: 5,
      cognitiveType: 'deep_work',
      energyLevel: 'high_octane',
      sameDayLoadMinutes: 0,
      goalCadencePerWeek: 1,
      goalArchetype: 'DEEP_WORK_PROJECT',
    });

    expect(tiny.focusDurationMinutes).toBeGreaterThanOrEqual(15);
    expect(tiny.focusDurationMinutes).toBeLessThanOrEqual(180);
    expect(tiny.bufferMinutes).toBeGreaterThanOrEqual(5);
    expect(tiny.bufferMinutes).toBeLessThanOrEqual(45);
    expect(tiny.scheduledRecommendationMinutes).toBeGreaterThanOrEqual(20);
    expect(tiny.scheduledRecommendationMinutes).toBeLessThanOrEqual(210);

    expect(huge.focusDurationMinutes).toBeLessThanOrEqual(180);
    expect(huge.scheduledRecommendationMinutes).toBeLessThanOrEqual(210);

    expect(tiny.focusDurationMinutes % 5).toBe(0);
    expect(tiny.bufferMinutes % 5).toBe(0);
    expect(tiny.scheduledRecommendationMinutes % 5).toBe(0);
    expect(huge.focusDurationMinutes % 5).toBe(0);
    expect(huge.bufferMinutes % 5).toBe(0);
    expect(huge.scheduledRecommendationMinutes % 5).toBe(0);
  });

  it('applies same-day load and energy effects deterministically', () => {
    const lowLoadHighEnergy = computeDurationModel({
      estimatedMinutes: 60,
      difficulty: 3,
      cognitiveType: 'learning',
      energyLevel: 'high_octane',
      sameDayLoadMinutes: 30,
      goalCadencePerWeek: 3,
      goalArchetype: 'SKILL_ACQUISITION',
    });

    const highLoadRecovery = computeDurationModel({
      estimatedMinutes: 60,
      difficulty: 3,
      cognitiveType: 'learning',
      energyLevel: 'recovery',
      sameDayLoadMinutes: 420,
      goalCadencePerWeek: 3,
      goalArchetype: 'SKILL_ACQUISITION',
    });

    expect(lowLoadHighEnergy.focusDurationMinutes).toBeGreaterThan(highLoadRecovery.focusDurationMinutes);
    expect(lowLoadHighEnergy.scheduledRecommendationMinutes).toBeGreaterThan(highLoadRecovery.scheduledRecommendationMinutes);
  });

  it('adds meaningful buffer and keeps scheduled block >= focus block', () => {
    const output = computeDurationModel({
      estimatedMinutes: 75,
      difficulty: 4,
      cognitiveType: 'deep_work',
      subTaskCount: 6,
      energyLevel: 'balanced',
      sameDayLoadMinutes: 240,
      goalCadencePerWeek: 2,
      goalArchetype: 'DEEP_WORK_PROJECT',
    });

    expect(output.bufferMinutes).toBeGreaterThanOrEqual(5);
    expect(output.scheduledRecommendationMinutes).toBeGreaterThanOrEqual(output.focusDurationMinutes);
    expect(output.scheduledRecommendationMinutes).toBe(output.focusDurationMinutes + output.bufferMinutes);
  });

  it('produces non-uniform recommendations for heterogeneous task profiles', () => {
    const cases = [
      computeDurationModel({ estimatedMinutes: 25, difficulty: 2, cognitiveType: 'admin', goalArchetype: 'MAINTENANCE' }),
      computeDurationModel({ estimatedMinutes: 55, difficulty: 3, cognitiveType: 'learning', goalArchetype: 'SKILL_ACQUISITION' }),
      computeDurationModel({ estimatedMinutes: 95, difficulty: 5, cognitiveType: 'deep_work', goalArchetype: 'DEEP_WORK_PROJECT' }),
    ];

    const uniqueDurations = new Set(cases.map((item) => item.scheduledRecommendationMinutes));
    expect(uniqueDurations.size).toBeGreaterThan(1);
  });
});
