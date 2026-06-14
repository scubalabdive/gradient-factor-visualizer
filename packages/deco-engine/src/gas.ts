// ─────────────────────────────────────────────────────────────────────────────
// Gas helpers — inert fractions, inspired inert-gas pressures, MOD, and the
// "best gas at depth" selection used for deco gas switching.
//
// Spec Sections 4.3 (inspired inert gas) and 4.10 (gas switching & MOD).
// ─────────────────────────────────────────────────────────────────────────────

import { P_H2O } from './constants';
import { depthToPressure, pressureToDepth } from './pressure';
import type { EnvironmentConfig, GasMix } from './types';

/** Inert nitrogen fraction of a mix: fN2 = 1 − fO2 − fHe (spec 4.10). */
export function fN2(gas: GasMix): number {
  return 1 - gas.fO2 - gas.fHe;
}

/** Inspired inert-gas partial pressure (bar) for one gas species at ambient
 *  pressure `pAmb` (bar), using Bühlmann's alveolar simplification with RQ = 1:
 *
 *      P_inspired = (P_amb − P_H2O) * F_gas          (spec 4.3)
 *
 *  Computed separately for N₂ and He. Returns 0 cleanly when F_gas = 0.
 */
export function inspiredInert(pAmb: number, fGas: number): number {
  return (pAmb - P_H2O) * fGas;
}

/** Maximum operating depth (m) of a gas: the depth at which ppO2 = fO2 * P_amb
 *  reaches `ppO2Limit` (bar). Spec 4.10. */
export function modDepth(gas: GasMix, ppO2Limit: number, env: EnvironmentConfig): number {
  if (gas.fO2 <= 0) return Number.POSITIVE_INFINITY; // no O₂ → no oxygen ceiling
  const pAmbAtLimit = ppO2Limit / gas.fO2;
  return pressureToDepth(pAmbAtLimit, env);
}

/** Round a depth to the nearest stop increment.
 *
 *  CONVENTION (documented in plan): deco-gas switch depths are the MOD rounded to
 *  the NEAREST stop increment — not strictly down. This yields the conventional
 *  switches (EAN50 → 21 m, O₂ → 6 m at ppO2 1.6) and matches Subsurface's
 *  observed behaviour, at the cost of ppO2 sitting a hair above nominal at the
 *  rounded stop (≈1.62 bar at 6 m on O₂). Round-down would push O₂ to 3 m, which
 *  is non-standard. Isolated here so it is trivial to flip if the Subsurface
 *  cross-check demands. */
export function roundToStop(depthM: number, stopIncrement: number): number {
  return Math.round(depthM / stopIncrement) * stopIncrement;
}

/** Effective switch depth (m) of a deco gas: the manual override if provided,
 *  otherwise its MOD rounded to a stop increment. Spec 4.10. */
export function gasSwitchDepth(gas: GasMix, env: EnvironmentConfig): number {
  if (gas.switchDepth !== undefined) return gas.switchDepth;
  const mod = modDepth(gas, env.ppO2Switch, env);
  if (!Number.isFinite(mod)) return Number.POSITIVE_INFINITY;
  return roundToStop(mod, env.stopIncrement);
}

/**
 * Select the gas to breathe at a given depth during ASCENT/deco.
 *
 * Rule (spec 4.10, plan convention): the richest usable gas wins. A deco gas
 * becomes usable once the diver has ascended to (or above) its switch depth,
 * i.e. currentDepth ≤ switchDepth. Among all usable deco gases we pick the
 * highest fO₂ (then lowest fHe as a tiebreak). If no deco gas is usable yet, the
 * bottom gas is breathed.
 *
 * This makes the active gas a deterministic function of depth, so the switch
 * "happens at the stop where the diver reaches the switch depth" automatically.
 */
export function bestGasAtDepth(depthM: number, gases: GasMix[], env: EnvironmentConfig): GasMix {
  const bottom = gases.find((g) => g.role === 'bottom') ?? gases[0];
  if (!bottom) throw new Error('bestGasAtDepth: no gases provided');

  let chosen = bottom;
  let chosenSwitch = Number.NEGATIVE_INFINITY; // for deco; bottom handled as fallback
  let haveDeco = false;

  for (const g of gases) {
    if (g.role !== 'deco') continue;
    const sd = gasSwitchDepth(g, env);
    const usable = depthM <= sd + 1e-9;
    if (!usable) continue;
    if (
      !haveDeco ||
      g.fO2 > chosen.fO2 + 1e-9 ||
      (Math.abs(g.fO2 - chosen.fO2) <= 1e-9 && g.fHe < chosen.fHe - 1e-9)
    ) {
      chosen = g;
      chosenSwitch = sd;
      haveDeco = true;
    }
  }
  void chosenSwitch;
  return chosen;
}

/** Convenience: depth → ambient pressure → ppO2 for a gas. Not used by the core
 *  integration but handy for UI/MOD displays later. */
export function ppO2AtDepth(gas: GasMix, depthM: number, env: EnvironmentConfig): number {
  return gas.fO2 * depthToPressure(depthM, env);
}

// ── Breathing source: what the tissues actually inspire (OC gas vs CCR loop) ──
//
// The tissue integrators (tissue.ts) only need the inspired inert partial pressures
// as a function of ambient pressure; everything else (Haldane/Schreiner, M-values,
// GF, ceiling) is identical for OC and CCR. So the only OC/CCR difference is HERE.
//
// OC: the gas fraction is fixed, so inspired_inert_species = (pAmb − P_H2O)·fSpecies
//     and ppO2 = fO2·pAmb rises with depth.
// CCR: the loop holds ppO2 at the setpoint, so the inert portion is what's left,
//      split by the diluent's N₂:He ratio:
//        ppO2  = min(setpoint, pAmb − P_H2O)               (capped near surface)
//        inert = (pAmb − P_H2O − ppO2)                     (clamped ≥ 0)
//        inspired_inert_species = inert · (fSpecies_dil / (fN2_dil + fHe_dil))
// Both are linear in pAmb in the normal regime, so tissue.ts derives the Schreiner
// rate as the secant of `inspired` across the travel step (exact for OC, and for
// CCR away from the near-surface cap).

export type Breathing = {
  /** Inspired inert partial pressures (bar) at ambient pressure `pAmb`. */
  inspired: (pAmb: number) => { pN2: number; pHe: number };
};

/** Open-circuit: a fixed-fraction gas (the v1 behaviour). */
export function ocBreathing(gas: GasMix): Breathing {
  const fNitro = fN2(gas);
  const fHelium = gas.fHe;
  return {
    inspired: (pAmb) => ({
      pN2: inspiredInert(pAmb, fNitro),
      pHe: inspiredInert(pAmb, fHelium),
    }),
  };
}

/** Closed-circuit rebreather: a constant-ppO₂ loop on `setpoint` (bar) with the
 *  given diluent supplying the inert gases in its N₂:He ratio. */
export function ccrBreathing(diluent: GasMix, setpoint: number): Breathing {
  const fNitro = fN2(diluent);
  const fHelium = diluent.fHe;
  const inertFrac = fNitro + fHelium;
  const rN2 = inertFrac > 1e-12 ? fNitro / inertFrac : 0;
  const rHe = inertFrac > 1e-12 ? fHelium / inertFrac : 0;
  return {
    inspired: (pAmb) => {
      const usable = pAmb - P_H2O; // alveolar dry gas pressure
      const ppO2 = Math.min(setpoint, usable); // can't hold the setpoint near surface
      const inert = Math.max(0, usable - ppO2);
      return { pN2: inert * rN2, pHe: inert * rHe };
    },
  };
}
