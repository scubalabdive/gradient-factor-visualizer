import { describe, it, expect } from 'vitest';
import { linearScale, niceTicks } from './scale';

describe('linearScale', () => {
  it('maps domain endpoints to range endpoints', () => {
    const s = linearScale([0, 100], [0, 500]);
    expect(s.map(0)).toBe(0);
    expect(s.map(100)).toBe(500);
    expect(s.map(50)).toBe(250);
  });

  it('round-trips through invert', () => {
    const s = linearScale([0, 40], [20, 380]); // depth-downward style range
    for (const v of [0, 3, 21, 40]) {
      expect(s.invert(s.map(v))).toBeCloseTo(v, 9);
    }
  });

  it('handles a degenerate (zero-width) domain without dividing by zero', () => {
    const s = linearScale([5, 5], [0, 100]);
    expect(s.map(5)).toBe(0);
    expect(Number.isFinite(s.map(9))).toBe(true);
  });
});

describe('niceTicks', () => {
  it('spans the range with uniform, round steps', () => {
    const ticks = niceTicks(0, 80, 6);
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(80);
    const step = ticks[1]! - ticks[0]!;
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(step, 9);
    }
  });

  it('snaps the step to a 1/2/5 × 10ⁿ value', () => {
    const ticks = niceTicks(0, 100, 5);
    const step = ticks[1]! - ticks[0]!;
    expect([1, 2, 5, 10, 20, 50].includes(step)).toBe(true);
  });

  it('degrades gracefully on a zero-width range', () => {
    expect(niceTicks(10, 10)).toEqual([10]);
  });
});
