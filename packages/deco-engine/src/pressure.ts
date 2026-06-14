// ─────────────────────────────────────────────────────────────────────────────
// Pressure ↔ depth conversion — spec Section 4.2.
//
// This is the ONLY place salt vs fresh water enters. `bar_per_metre` derived from
// water density flows into every depth/pressure conversion, M-value evaluation,
// and ceiling read-out, exactly as the spec requires. The engine carries bar
// internally; metres exist only at this boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { G, RHO_FRESH, RHO_SALT } from './constants';
import type { EnvironmentConfig } from './types';

/** bar of pressure per metre of water column, for the configured water type.
 *  bar_per_metre = rho * g / 100000  (spec 4.2). */
export function barPerMetre(water: EnvironmentConfig['water']): number {
  const rho = water === 'salt' ? RHO_SALT : RHO_FRESH;
  return (rho * G) / 100000;
}

/** Ambient absolute pressure (bar) at a given depth (m). Spec 4.2:
 *  P_amb = P_surface + depth * bar_per_metre. */
export function depthToPressure(depthM: number, env: EnvironmentConfig): number {
  return env.surfacePressure + depthM * barPerMetre(env.water);
}

/** Depth (m) corresponding to an absolute pressure (bar). Inverse of the above.
 *  May return negative for sub-surface tolerated pressures; callers that want a
 *  display depth should clamp at 0 (a negative ceiling means "can surface"). */
export function pressureToDepth(pressureBar: number, env: EnvironmentConfig): number {
  return (pressureBar - env.surfacePressure) / barPerMetre(env.water);
}
