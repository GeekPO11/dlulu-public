import type { TimeConstraints, TimeBlock } from '../types';

export interface WeeklyAvailability {
  defaultMinutes: number;
  weekAMinutes: number;
  weekBMinutes: number;
  usesPatterns: boolean;
}

const parseTimeToMinutes = (timeStr: string | undefined, fallback: string): number => {
  const value = timeStr || fallback;
  const [hh, mm] = value.split(':').map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
};

const mergeIntervals = (intervals: Array<[number, number]>): Array<[number, number]> => {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

const blockMatchesPattern = (block: TimeBlock, activePattern: 'default' | 'A' | 'B'): boolean => {
  const pattern = block.weekPattern || 'default';
  if (activePattern === 'default') return pattern === 'default' || !pattern;
  return pattern === 'default' || pattern === activePattern;
};

const computeWeeklyMinutes = (constraints: Partial<TimeConstraints>, activePattern: 'default' | 'A' | 'B'): number => {
  const wakeMin = parseTimeToMinutes(constraints.sleepEnd, '06:30');
  let bedMin = parseTimeToMinutes(constraints.sleepStart, '22:30');
  if (bedMin <= wakeMin) bedMin += 1440;

  const awakeStart = wakeMin;
  const awakeEnd = bedMin;
  const awakeMinutes = Math.max(0, awakeEnd - awakeStart);

  const allBlocks = [
    ...(constraints.workBlocks || []),
    ...(constraints.blockedSlots || []),
  ];

  let totalAvailable = 0;

  for (let day = 0; day < 7; day++) {
    const blockedIntervals: Array<[number, number]> = [];

    for (const block of allBlocks) {
      if (!blockMatchesPattern(block, activePattern)) continue;
      if (!block.days?.includes(day)) continue;
      const start = parseTimeToMinutes(block.start, '00:00');
      const end = parseTimeToMinutes(block.end, '00:00');
      if (end <= start) continue;

      const clampedStart = Math.max(start, awakeStart);
      const clampedEnd = Math.min(end, awakeEnd);
      if (clampedEnd > clampedStart) {
        blockedIntervals.push([clampedStart, clampedEnd]);
      }
    }

    const merged = mergeIntervals(blockedIntervals);
    const blockedMinutes = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
    totalAvailable += Math.max(0, awakeMinutes - blockedMinutes);
  }

  return totalAvailable;
};

export const calculateWeeklyAvailability = (constraints: Partial<TimeConstraints>): WeeklyAvailability => {
  const allBlocks = [
    ...(constraints.workBlocks || []),
    ...(constraints.blockedSlots || []),
  ];

  const usesPatterns = allBlocks.some(b => b.weekPattern === 'A' || b.weekPattern === 'B');
  const defaultMinutes = computeWeeklyMinutes(constraints, 'default');
  const weekAMinutes = computeWeeklyMinutes(constraints, 'A');
  const weekBMinutes = computeWeeklyMinutes(constraints, 'B');

  return { defaultMinutes, weekAMinutes, weekBMinutes, usesPatterns };
};
