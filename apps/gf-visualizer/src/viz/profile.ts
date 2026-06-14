// Pure read helpers over an engine GFResult's profile / ceiling / stops, for the
// charts' hover read-outs (spec §7). No DOM, no React — just interpolation over the
// dense, time-ordered samples the engine already produces.
import type { CeilingPoint, ProfilePoint, StopEntry } from '@gf/deco-engine';

/**
 * Linear interpolation of a time-ordered sample series at runtime `t`, clamped to
 * the endpoints. Shared by `depthAtTime` and `ceilingAtTime` — both series are the
 * engine's dense, strictly-increasing-in-time samples, so this is exact at vertices
 * and smooth between. `valueOf` picks the field to interpolate.
 */
function lerpByTime<T extends { time: number }>(
  points: T[],
  t: number,
  valueOf: (p: T) => number,
): number {
  if (points.length === 0) return 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (t <= first.time) return valueOf(first);
  if (t >= last.time) return valueOf(last);
  // A single dive is a few hundred points; a scan is plenty.
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!;
    if (t <= b.time) {
      const a = points[i - 1]!;
      const span = b.time - a.time;
      if (span <= 0) return valueOf(b);
      return valueOf(a) + ((t - a.time) / span) * (valueOf(b) - valueOf(a));
    }
  }
  return valueOf(last);
}

/** Actual depth (m) at runtime `t` (min). */
export function depthAtTime(profile: ProfilePoint[], t: number): number {
  return lerpByTime(profile, t, (p) => p.depth);
}

/** GF-adjusted ceiling depth (m) at runtime `t` (min). */
export function ceilingAtTime(timeline: CeilingPoint[], t: number): number {
  return lerpByTime(timeline, t, (p) => p.ceiling);
}

/**
 * The decompression stop the diver is holding at runtime `t`, or null when in
 * transit or on the bottom. A held stop shows as a depth plateau in the profile,
 * so we flag it only when the depth at `t` is flat (constant in a small
 * neighbourhood) AND matches a stop depth — the bottom plateau is deeper than any
 * deco stop, so it never matches.
 */
export function currentStopAtTime(
  profile: ProfilePoint[],
  stops: StopEntry[],
  t: number,
  tol = 0.25,
): StopEntry | null {
  if (stops.length === 0) return null;
  const flat = Math.abs(depthAtTime(profile, t + 0.05) - depthAtTime(profile, t - 0.05)) < 1e-3;
  if (!flat) return null;
  const d = depthAtTime(profile, t);
  let best: StopEntry | null = null;
  let bestErr = tol;
  for (const s of stops) {
    const err = Math.abs(s.depth - d);
    if (err <= bestErr) {
      bestErr = err;
      best = s;
    }
  }
  return best;
}
