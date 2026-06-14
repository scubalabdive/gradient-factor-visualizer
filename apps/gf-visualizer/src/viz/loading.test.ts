import { describe, it, expect } from 'vitest';
import {
  bottomEndTime,
  compartmentAtTime,
  compartmentLoadFraction,
  controllingAtTime,
  firstStopArrivalTime,
} from './loading';
import type { CompartmentState, LoadingPoint, ProfilePoint } from '@gf/deco-engine';

// Build a tiny 2-compartment timeline (only indices we assert need to be present).
function lp(time: number, c0: CompartmentState, c1: CompartmentState, controlling: number): LoadingPoint {
  return { time, compartments: [c0, c1], controlling };
}

const timeline: LoadingPoint[] = [
  lp(0, { pN2: 0.74, pHe: 0 }, { pN2: 0.74, pHe: 0 }, 0),
  lp(10, { pN2: 1.5, pHe: 0.5 }, { pN2: 1.0, pHe: 0.2 }, 0),
  lp(20, { pN2: 2.0, pHe: 1.0 }, { pN2: 1.4, pHe: 0.4 }, 1),
];

describe('compartmentAtTime', () => {
  it('is exact at vertices', () => {
    expect(compartmentAtTime(timeline, 0, 10)).toEqual({ pN2: 1.5, pHe: 0.5 });
    expect(compartmentAtTime(timeline, 1, 20)).toEqual({ pN2: 1.4, pHe: 0.4 });
  });

  it('interpolates both species linearly', () => {
    const r = compartmentAtTime(timeline, 0, 15); // halfway 10→20 for compartment 0
    expect(r.pN2).toBeCloseTo(1.75, 9);
    expect(r.pHe).toBeCloseTo(0.75, 9);
  });

  it('clamps outside the time range', () => {
    expect(compartmentAtTime(timeline, 0, -5)).toEqual({ pN2: 0.74, pHe: 0 });
    expect(compartmentAtTime(timeline, 0, 999)).toEqual({ pN2: 2.0, pHe: 1.0 });
  });
});

describe('controllingAtTime', () => {
  it('steps to the sample at or before t (no interpolation)', () => {
    expect(controllingAtTime(timeline, 0)).toBe(0);
    expect(controllingAtTime(timeline, 15)).toBe(0); // still sample @10
    expect(controllingAtTime(timeline, 20)).toBe(1);
    expect(controllingAtTime(timeline, 999)).toBe(1);
  });
});

const ascentProfile: ProfilePoint[] = [
  { time: 0, depth: 0 },
  { time: 2, depth: 40 },
  { time: 22, depth: 40 }, // last sample at the bottom
  { time: 24, depth: 21 }, // arrives at first stop (21 m)
  { time: 27, depth: 21 },
  { time: 30, depth: 0 },
];

describe('bottomEndTime', () => {
  it('returns the last time at max depth (start of ascent)', () => {
    expect(bottomEndTime(ascentProfile)).toBe(22);
  });
});

describe('firstStopArrivalTime', () => {
  it('returns the first time the diver reaches the first stop depth', () => {
    expect(firstStopArrivalTime(ascentProfile, 21)).toBe(24);
  });

  it('falls back to the end of the bottom when there is no deco', () => {
    expect(firstStopArrivalTime(ascentProfile, 0)).toBe(22);
  });
});

describe('compartmentLoadFraction', () => {
  it('reports combined loading and frac = pInert / GF M-value', () => {
    const r = compartmentLoadFraction(0, 1.5, 0.5, 3.0, 0.6);
    expect(r.pInert).toBeCloseTo(2.0, 9);
    expect(r.mGf).toBeGreaterThan(0);
    expect(r.frac).toBeCloseTo(r.pInert / r.mGf, 9);
  });

  it('reaches exactly 1.0 when the loading sits on the GF M-value', () => {
    // pHe = 0 → a/b are the N₂ coefficients regardless of pN₂ magnitude, so the GF
    // M-value is the same when we then load pN₂ up to it.
    const probe = compartmentLoadFraction(3, 1.0, 0, 2.5, 0.7);
    const atLimit = compartmentLoadFraction(3, probe.mGf, 0, 2.5, 0.7);
    expect(atLimit.frac).toBeCloseTo(1, 9);
  });

  it('uses the trimix-combined a/b (He shifts the limit vs all-N₂)', () => {
    const trimix = compartmentLoadFraction(0, 1.0, 1.0, 3.0, 0.8);
    const allN2 = compartmentLoadFraction(0, 2.0, 0, 3.0, 0.8);
    expect(trimix.pInert).toBeCloseTo(allN2.pInert, 9); // same total inert
    expect(trimix.mGf).not.toBeCloseTo(allN2.mGf, 3); // but a different limit
  });
});
