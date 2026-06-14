// ─────────────────────────────────────────────────────────────────────────────
// 4.3 — Gas demand from a schedule (the core of the gas model).
//
// For any breathed leg at average ambient pressure P̄ (bar) for t (min) at
// respiratory minute volume RMV (surface L/min):
//
//      gas_litres = RMV · t · P̄
//
//   • Stop at fixed depth d:  P̄ = P_amb(d).
//   • Travel d1 → d2:         P̄ = P_amb((d1 + d2)/2)   — mean-depth approximation,
//     the gas-planning standard (spec 4.3). This is the DEFAULT and the only mode
//     in v1; the engine sub-integrates the profile, but for gas volumes the
//     mean-depth point moves the answer by only a percent or two and is far more
//     auditable by hand. The choice lives HERE (not in the engine) on purpose.
//
//   • P_H2O is NOT subtracted — this is DELIVERED gas at ambient, not the alveolar
//     inert pressure the tissue model uses.
//
// HAND-CHECK (worked, for the reviewer — also asserted in the fixture):
//   A 3-minute hold at 21 m in salt water at RMV 20 L/min.
//   P_amb(21) = 1.01325 + 21 · (1030·9.80665/1e5)
//             = 1.01325 + 21 · 0.1010085 = 1.01325 + 2.121178 = 3.134428 bar.
//   gas_litres = 20 · 3 · 3.134428 = 188.07 L.   (legLitres returns 188.0657…)
// ─────────────────────────────────────────────────────────────────────────────

import { depthToPressure } from '@gf/deco-engine';
import type { BreathingSegment, EnvironmentConfig } from '@gf/deco-engine';

/** Mean ambient pressure (bar) for a breathed leg — §4.3. Stop legs have
 *  depthFrom == depthTo, so this reduces to P_amb(d). */
export function meanPamb(seg: BreathingSegment, env: EnvironmentConfig): number {
  const meanDepth = (seg.depthFrom + seg.depthTo) / 2;
  return depthToPressure(meanDepth, env);
}

/** Delivered-gas litres for one leg at respiratory minute volume `rmv`: §4.3. */
export function legLitres(seg: BreathingSegment, rmv: number, env: EnvironmentConfig): number {
  return rmv * seg.duration * meanPamb(seg, env);
}

/**
 * Sum delivered-gas litres per gasId over a schedule breakdown, using the RMV
 * supplied for each gas (deco gases breathe at rmvDeco, bailout at rmvBailout,
 * etc.). Returns a Map gasId → litres. §4.3 applied per leg, accumulated per gas.
 */
export function litresByGas(
  breakdown: BreathingSegment[],
  rmvForGas: (gasId: string) => number,
  env: EnvironmentConfig,
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const seg of breakdown) {
    const litres = legLitres(seg, rmvForGas(seg.gasId), env);
    acc.set(seg.gasId, (acc.get(seg.gasId) ?? 0) + litres);
  }
  return acc;
}

/** Time-weighted mean ambient pressure (bar) over the STOP legs breathed on a gas
 *  — the "band pressure" P̄_band feeding the inverse max-stop-time (spec 4.5).
 *  Returns 0 when the gas carries no stop time. */
export function bandPressure(
  breakdown: BreathingSegment[],
  gasId: string,
  env: EnvironmentConfig,
): number {
  let weighted = 0;
  let minutes = 0;
  for (const seg of breakdown) {
    if (seg.kind !== 'stop' || seg.gasId !== gasId) continue;
    weighted += meanPamb(seg, env) * seg.duration;
    minutes += seg.duration;
  }
  return minutes > 0 ? weighted / minutes : 0;
}

/** Total STOP minutes breathed on a gas (the inverse formula's current usage). */
export function stopMinutes(breakdown: BreathingSegment[], gasId: string): number {
  let minutes = 0;
  for (const seg of breakdown) {
    if (seg.kind === 'stop' && seg.gasId === gasId) minutes += seg.duration;
  }
  return minutes;
}
