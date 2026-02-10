export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export const easeInOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

