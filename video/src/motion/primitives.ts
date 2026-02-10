import {interpolate, spring, type SpringConfig} from 'remotion';
import {easeOutCubic} from './easings';

export const DEFAULT_SPRING: SpringConfig = {
  damping: 80,
  mass: 0.8,
  stiffness: 260,
};

export const enterUp = (opts: {
  frame: number;
  fps: number;
  delay?: number;
  duration?: number;
  y?: number;
  blur?: number;
  scaleFrom?: number;
}) => {
  const {frame, fps, delay = 0, duration = 18, y = 16, blur = 10, scaleFrom = 0.985} = opts;
  const f = Math.max(0, frame - delay);

  const s = spring({
    fps,
    frame: f,
    config: DEFAULT_SPRING,
    durationInFrames: duration,
  });

  const opacity = interpolate(s, [0, 1], [0, 1]);
  const translateY = interpolate(s, [0, 1], [y, 0]);
  const scale = interpolate(s, [0, 1], [scaleFrom, 1]);
  const b = interpolate(easeOutCubic(Math.min(1, f / duration)), [0, 1], [blur, 0]);

  return {
    opacity,
    transform: `translateY(${translateY}px) scale(${scale})`,
    filter: `blur(${b}px)`,
  } as const;
};

export const fadeInOut = (opts: {
  frame: number;
  durationInFrames: number;
  inFrames?: number;
  outFrames?: number;
}) => {
  const {frame, durationInFrames, inFrames = 12, outFrames = 12} = opts;
  const opacity = interpolate(
    frame,
    [0, inFrames, durationInFrames - outFrames, durationInFrames],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  return {opacity} as const;
};

export const staggerDelay = (index: number, framesPerItem = 3) => index * framesPerItem;

export const snapPlace = (opts: {frame: number; fps: number; delay?: number}) => {
  // Intentionally NOT spring-based: keeps us on a single spring config overall,
  // while still getting a predictable overshoot "snap" feel.
  const {frame, delay = 0} = opts;
  const f = Math.max(0, frame - delay);
  const duration = 14;
  const t = Math.min(1, f / duration);
  const e = easeOutCubic(t);

  // 0->1 quickly, then hold.
  const opacity = interpolate(e, [0, 0.25, 1], [0, 1, 1]);

  // Tiny wobble only (2px max) so it reads as "placed", not "floating in".
  const y = interpolate(e, [0, 1], [2, 0]);

  // Overshoot: 0.98 -> 1.02 -> 1.00
  const scale = interpolate(e, [0, 0.72, 1], [0.98, 1.02, 1]);
  return {
    opacity,
    transform: `translateY(${y}px) scale(${scale})`,
  } as const;
};
