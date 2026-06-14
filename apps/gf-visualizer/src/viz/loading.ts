// Pure read helpers over an engine GFResult's loadingTimeline (16-compartment
// pN₂/pHe + controlling index per sample) and profile, for the pressure plot (View
// 3) trajectory, the tissue-loading bars (View 4), and the global scrubber. No DOM,
// no React — interpolation over the dense, time-ordered samples the engine produces.
// loadingTimeline shares profile's time grid.
import { combinedAB, mValueGF } from '@gf/deco-engine';
import type { LoadingPoint, ProfilePoint } from '@gf/deco-engine';

/**
 * Inert loading of compartment `c` at runtime `t` (min), each species linearly
 * interpolated between samples and clamped to the endpoints.
 */
export function compartmentAtTime(
  timeline: LoadingPoint[],
  c: number,
  t: number,
): { pN2: number; pHe: number } {
  if (timeline.length === 0) return { pN2: 0, pHe: 0 };
  const first = timeline[0]!;
  const last = timeline[timeline.length - 1]!;
  if (t <= first.time) return pick(first, c);
  if (t >= last.time) return pick(last, c);
  for (let i = 1; i < timeline.length; i++) {
    const b = timeline[i]!;
    if (t <= b.time) {
      const a = timeline[i - 1]!;
      const span = b.time - a.time;
      const pa = pick(a, c);
      if (span <= 0) return pick(b, c);
      const f = (t - a.time) / span;
      const pb = pick(b, c);
      return { pN2: pa.pN2 + f * (pb.pN2 - pa.pN2), pHe: pa.pHe + f * (pb.pHe - pa.pHe) };
    }
  }
  return pick(last, c);
}

function pick(p: LoadingPoint, c: number): { pN2: number; pHe: number } {
  const comp = p.compartments[c];
  return comp ? { pN2: comp.pN2, pHe: comp.pHe } : { pN2: 0, pHe: 0 };
}

/**
 * The controlling compartment index at runtime `t`. `controlling` is a discrete
 * per-sample value, so we take the sample at or just before `t` (step function),
 * never an interpolation.
 */
export function controllingAtTime(timeline: LoadingPoint[], t: number): number {
  if (timeline.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i]!.time <= t) idx = i;
    else break;
  }
  return timeline[idx]!.controlling;
}

/**
 * Runtime (min) at the end of the bottom phase — the last sample at the dive's max
 * depth, i.e. the moment the ascent begins.
 */
export function bottomEndTime(profile: ProfilePoint[]): number {
  if (profile.length === 0) return 0;
  let maxDepth = -Infinity;
  for (const p of profile) if (p.depth > maxDepth) maxDepth = p.depth;
  let t = 0;
  for (const p of profile) if (p.depth >= maxDepth - 1e-9) t = p.time;
  return t;
}

/**
 * Runtime (min) when the diver first reaches the first decompression stop — the
 * binding moment where the controlling tissue rides its GF-Low limit. Used to seed
 * the scrubber so View 3's marker opens on the M-value line (the "aha"), not below
 * the ambient line. Falls back to the end of the bottom when there is no deco.
 */
export function firstStopArrivalTime(profile: ProfilePoint[], firstStopDepth: number): number {
  const tEnd = bottomEndTime(profile);
  if (firstStopDepth <= 0) return tEnd;
  for (const p of profile) {
    if (p.time >= tEnd && p.depth <= firstStopDepth + 1e-6) return p.time;
  }
  return tEnd;
}

/**
 * Compartment `c`'s combined inert loading as a fraction of its GF-adjusted M-value
 * (the tolerated inert pressure) at ambient `pAmb` and gradient factor `gf` — the
 * View 4 bar height. `frac` is 1.0 exactly when the compartment sits on its limit;
 * a/b are the trimix-combined coefficients for the current N₂/He split (spec 4.6).
 */
export function compartmentLoadFraction(
  c: number,
  pN2: number,
  pHe: number,
  pAmb: number,
  gf: number,
): { pInert: number; mGf: number; frac: number } {
  const pInert = pN2 + pHe;
  const { a, b } = combinedAB(c, pN2, pHe);
  const mGf = mValueGF(a, b, pAmb, gf);
  return { pInert, mGf, frac: mGf > 0 ? pInert / mGf : 0 };
}
