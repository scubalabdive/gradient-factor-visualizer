// The deco-gas switch plan for a dive, derived from the engine's OWN gas logic
// (bestGasAtDepth / gasSwitchDepth) so it matches what was actually breathed. Switch
// depths are shared across GF sets (depth-based); only the time of each switch
// differs per set (found from that set's profile in the chart). Pure — no DOM/React.
import { bestGasAtDepth, gasSwitchDepth } from '@gf/deco-engine';
import type { EnvironmentConfig, GasMix } from '@gf/deco-engine';

export type GasSwitch = { depth: number; gas: GasMix };
export type GasPlan = { start: GasMix; switches: GasSwitch[] };

/**
 * Ordered deco-gas switches for the ascent (deep → shallow) plus the gas breathed at
 * the bottom. A switch is recorded only where the active gas actually changes, so
 * overlapping/duplicate switch depths collapse cleanly. Switch depths deeper than the
 * dive's max depth are dropped (that gas is usable the whole dive — no switch shown).
 */
export function gasPlan(gases: GasMix[], env: EnvironmentConfig, maxDepth: number): GasPlan {
  const start = bestGasAtDepth(maxDepth, gases, env);
  const candidates = gases
    .filter((g) => g.role === 'deco')
    .map((g) => gasSwitchDepth(g, env))
    .filter((d) => Number.isFinite(d) && d > 0 && d <= maxDepth + 1e-9)
    .sort((a, b) => b - a); // deep → shallow

  const switches: GasSwitch[] = [];
  let prev = start;
  for (const depth of candidates) {
    const gas = bestGasAtDepth(depth, gases, env);
    if (gas.id !== prev.id) {
      switches.push({ depth, gas });
      prev = gas;
    }
  }
  return { start, switches };
}
