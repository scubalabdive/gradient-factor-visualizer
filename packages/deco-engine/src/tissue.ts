// ─────────────────────────────────────────────────────────────────────────────
// Tissue integration — Haldane (constant depth), Schreiner (changing depth),
// trimix a/b combining, and surface-saturation initialisation.
//
// Spec Sections 4.4 (Haldane), 4.5 (Schreiner), 4.6 (trimix a/b), 4.3 (inspired).
// N₂ and He integrate INDEPENDENTLY each step; their compartment pressures are
// summed only when evaluating limits (spec 4.4/4.5).
// ─────────────────────────────────────────────────────────────────────────────

import {
  A_HE,
  A_N2,
  B_HE,
  B_N2,
  COMPARTMENT_COUNT,
  K_HE,
  K_N2,
  N2_FRACTION_ATMOSPHERIC,
  P_H2O,
} from './constants';
import type { Breathing } from './gas';
import { depthToPressure } from './pressure';
import type { EnvironmentConfig, TissueState } from './types';

/** Surface-saturated initial tissue state: all compartments equilibrated with
 *  atmospheric air at surface pressure. He starts at 0. (Plan convention:
 *  N2_FRACTION_ATMOSPHERIC = 0.7808.) */
export function initialTissueState(env: EnvironmentConfig): TissueState {
  const pN2Surface = (env.surfacePressure - P_H2O) * N2_FRACTION_ATMOSPHERIC;
  return {
    pN2: new Array<number>(COMPARTMENT_COUNT).fill(pN2Surface),
    pHe: new Array<number>(COMPARTMENT_COUNT).fill(0),
  };
}

/** Deep copy of a tissue state (state is threaded immutably between phases). */
export function cloneTissue(t: TissueState): TissueState {
  return { pN2: t.pN2.slice(), pHe: t.pHe.slice() };
}

// ── One-gas-species integrators (applied to N₂ and He separately) ────────────

/** Haldane constant-depth update for one compartment / one gas species:
 *      P_end = P_inspired + (P_start − P_inspired) * exp(−k t)      (spec 4.4) */
function haldaneStep(pStart: number, pInspired: number, k: number, t: number): number {
  return pInspired + (pStart - pInspired) * Math.exp(-k * t);
}

/** Schreiner changing-depth update for one compartment / one gas species:
 *      P_end = Pi0 + R (t − 1/k) − (Pi0 − P_start − R/k) * exp(−k t)  (spec 4.5)
 *  where Pi0 is inspired inert pressure at the START depth and R is the rate of
 *  change of inspired inert pressure (bar/min), sign per descent(+)/ascent(−). */
function schreinerStep(
  pStart: number,
  pInspired0: number,
  R: number,
  k: number,
  t: number,
): number {
  return (
    pInspired0 + R * (t - 1 / k) - (pInspired0 - pStart - R / k) * Math.exp(-k * t)
  );
}

/**
 * Constant-depth (Haldane) loading for a segment held at `depthM` for `t` minutes
 * from breathing source `breathing` (OC gas or CCR loop). Returns a NEW state. 4.4.
 */
export function applyConstantDepth(
  state: TissueState,
  depthM: number,
  t: number,
  breathing: Breathing,
  env: EnvironmentConfig,
): TissueState {
  const insp = breathing.inspired(depthToPressure(depthM, env));

  const out = cloneTissue(state);
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    out.pN2[i] = haldaneStep(state.pN2[i]!, insp.pN2, K_N2[i]!, t);
    out.pHe[i] = haldaneStep(state.pHe[i]!, insp.pHe, K_HE[i]!, t);
  }
  return out;
}

/**
 * Changing-depth (Schreiner) loading for travel from `depthStart` to `depthEnd`
 * over `t` minutes at constant rate, breathing `gas`. Mutates and returns a NEW
 * tissue state. Spec 4.5.
 *
 * The Schreiner equation is the EXACT closed-form solution for a constant-rate
 * depth change, so a single call over the whole travel is numerically identical
 * to subdividing it — sub-stepping is used elsewhere only to sample the timeline.
 */
export function applyDepthChange(
  state: TissueState,
  depthStart: number,
  depthEnd: number,
  t: number,
  breathing: Breathing,
  env: EnvironmentConfig,
): TissueState {
  if (t <= 0) return cloneTissue(state);

  const i0 = breathing.inspired(depthToPressure(depthStart, env));
  const i1 = breathing.inspired(depthToPressure(depthEnd, env));

  // R = rate of change of inspired inert pressure (bar/min). Both OC and the CCR
  // loop are linear in ambient pressure, so the secant of `inspired` across the
  // travel step is exact for OC (= depthRate·bar_per_metre·F_gas, as before) and a
  // close average for CCR through the near-surface ppO₂ cap.
  const Rn2 = (i1.pN2 - i0.pN2) / t;
  const Rhe = (i1.pHe - i0.pHe) / t;

  const out = cloneTissue(state);
  for (let i = 0; i < COMPARTMENT_COUNT; i++) {
    out.pN2[i] = schreinerStep(state.pN2[i]!, i0.pN2, Rn2, K_N2[i]!, t);
    out.pHe[i] = schreinerStep(state.pHe[i]!, i0.pHe, Rhe, K_HE[i]!, t);
  }
  return out;
}

// ── Trimix a/b combining (spec 4.6) ──────────────────────────────────────────

/** Combined Bühlmann a/b for one compartment, weighted by the partial pressures
 *  of each inert gas currently IN that compartment (spec 4.6):
 *
 *      P_inert = P_N2 + P_He
 *      a = (aN2·P_N2 + aHe·P_He) / P_inert
 *      b = (bN2·P_N2 + bHe·P_He) / P_inert
 *
 *  Recomputed at every evaluation because the He/N₂ ratio shifts continuously.
 *  Falls back to the N₂ coefficients when P_inert ≈ 0 to avoid divide-by-zero. */
export function combinedAB(compartment: number, pN2: number, pHe: number): { a: number; b: number } {
  const i = compartment;
  const pInert = pN2 + pHe;
  if (pInert < 1e-12) {
    return { a: A_N2[i]!, b: B_N2[i]! };
  }
  const a = (A_N2[i]! * pN2 + A_HE[i]! * pHe) / pInert;
  const b = (B_N2[i]! * pN2 + B_HE[i]! * pHe) / pInert;
  return { a, b };
}
