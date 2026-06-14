// ─────────────────────────────────────────────────────────────────────────────
// M-value, GF-adjusted ceiling, and GF-vs-depth interpolation.
//
// Spec Sections 4.7 (M-value & GF ceiling) and 4.8 (GF interpolation).
// ─────────────────────────────────────────────────────────────────────────────

import { COMPARTMENT_COUNT } from './constants';
import { pressureToDepth } from './pressure';
import { combinedAB } from './tissue';
import type { EnvironmentConfig, TissueState } from './types';

/** Raw Bühlmann M-value (max tolerated tissue pressure) at ambient `pAmb`:
 *      M(P_amb) = a + P_amb / b          (spec 4.7) */
export function mValue(a: number, b: number, pAmb: number): number {
  return a + pAmb / b;
}

/** GF-adjusted tolerated tissue pressure at ambient `pAmb`:
 *      M_gf(P_amb) = P_amb + GF·(M(P_amb) − P_amb)     (spec 4.7) */
export function mValueGF(a: number, b: number, pAmb: number, gf: number): number {
  const m = mValue(a, b, pAmb);
  return pAmb + gf * (m - pAmb);
}

/**
 * Inverted form: the tolerated AMBIENT pressure for a known tissue loading `pT`
 * (total inert) at gradient factor `gf`. This is the per-compartment ceiling:
 *
 *      P_amb_tol = (P_t − GF·a) / (1 − GF + GF/b)       (spec 4.7)
 */
export function toleratedAmbient(a: number, b: number, pT: number, gf: number): number {
  return (pT - gf * a) / (1 - gf + gf / b);
}

/**
 * GF interpolated linearly with depth (spec 4.8):
 *
 *      GF(depth) = GF_high + (GF_low − GF_high) * (depth / first_stop_depth)
 *
 * → GF_low at first_stop_depth, GF_high at the surface. Depth is clamped to
 * [0, first_stop_depth]: at/below the first stop GF = GF_low (so the slope is
 * anchored once the first stop is fixed); at the surface GF = GF_high.
 * If first_stop_depth ≤ 0 (no deco), GF_high governs everywhere.
 */
export function gfAtDepth(
  depthM: number,
  firstStopDepth: number,
  gfLow: number,
  gfHigh: number,
): number {
  if (firstStopDepth <= 0) return gfHigh;
  const clamped = Math.max(0, Math.min(depthM, firstStopDepth));
  return gfHigh + (gfLow - gfHigh) * (clamped / firstStopDepth);
}

export type CeilingResult = {
  /** Deepest tolerated ambient pressure across all compartments (bar). */
  toleratedAmbient: number;
  /** Ceiling depth (m); negative means the diver may surface. */
  ceilingDepth: number;
  /** Index 0..15 of the controlling (deepest-ceiling) compartment. */
  controlling: number;
};

/**
 * Overall ceiling at gradient factor `gf`, across all 16 compartments, given the
 * current tissue state. The overall ceiling is the DEEPEST compartment ceiling
 * (highest tolerated ambient pressure); the compartment producing it is the
 * controlling compartment (spec 4.7). a/b are recomputed per compartment from
 * the current N₂/He split (trimix combining, spec 4.6).
 */
export function ceilingAtGF(state: TissueState, gf: number, env: EnvironmentConfig): CeilingResult {
  let maxTol = Number.NEGATIVE_INFINITY;
  let controlling = 0;
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    const pN2 = state.pN2[i]!;
    const pHe = state.pHe[i]!;
    const { a, b } = combinedAB(i, pN2, pHe);
    const tol = toleratedAmbient(a, b, pN2 + pHe, gf);
    if (tol > maxTol) {
      maxTol = tol;
      controlling = i;
    }
  }
  return {
    toleratedAmbient: maxTol,
    ceilingDepth: pressureToDepth(maxTol, env),
    controlling,
  };
}
