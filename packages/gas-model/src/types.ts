// ─────────────────────────────────────────────────────────────────────────────
// Gas-model data model — spec Section 5, reproduced verbatim (with comments).
//
// Reuses the engine's GasMix / DiveSegment / GFSet / EnvironmentConfig / GFResult.
// Bar and minutes throughout — no unit conversion in this package.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiveSegment, EnvironmentConfig, GFSet, GasMix } from '@gf/deco-engine';

/** Per-segment loading mode (spec §4.2). The engine implements this as the
 *  env-level `mode` ('oc' | 'ccr') today; kept here to match the spec's vocabulary. */
export type LoadingMode = 'oc' | 'ccr-setpoint';

export type CCRConfig = {
  setpoint: number; // bar ppO2, e.g. 1.3
  diluentGasId: string; // references a GasMix used as diluent
};

export type Cylinder = {
  id: string;
  gasId: string; // gas it carries
  volume: number; // litres water capacity
  fillPressure: number; // bar; available = volume * fillPressure
  role: 'backgas' | 'bottom-bailout' | 'deco-bailout';
  shareable: boolean; // donatable spare second stage; default from role
  //   (backgas → true, else false), user-overridable
};

export type GasParams = {
  mode: 'oc' | 'ccr';
  rmvSelf: number; // L/min, diver's own (stress-elevated where used)
  rmvBuddy: number; // L/min, buddy's rate — used only on shareable cyls
  rmvDeco: number; // L/min, OC deco
  rmvBailout: number; // L/min, CCR bailout (stress-elevated)
  stress: number; // multiplier, default 1.0
  problemTime: number; // min at depth before ascent, default e.g. 1
  reserveBar: number; // user reserve per cylinder (or rock-bottom)
  ccr?: CCRConfig; // present when mode === 'ccr'
};

// ---- gas-model output ----
export type CylinderResult = {
  cylinderId: string;
  requiredLitres: number;
  availableLitres: number;
  reserveLitres: number;
  marginLitres: number; // available - required - reserve
  binding: boolean; // is this the constraining cylinder?
};

export type GasResult = {
  gfSetId: string;
  gasCeilingBar: number; // min gas (OC) / bailout reserve threshold (CCR)
  timeCeilingTts: number; // max OC/bailout TTS supported, min
  bailoutTts: number; // OC bailout TTS for the current schedule, min
  perCylinder: CylinderResult[];
};

export type GasEngineOutput = { results: GasResult[] }; // one per GF set

// ─────────────────────────────────────────────────────────────────────────────
// Input to the gas model. The exposure + gases + cylinders + GasParams are shared
// across GF sets; only the GF pair varies — mirroring the visualizer's central
// idea (spec §5), so a reviewer reads the two specs the same way.
// ─────────────────────────────────────────────────────────────────────────────

export type GasModelInput = {
  segments: DiveSegment[]; // descent + bottom exposure (the worst case is loaded from this)
  gases: GasMix[]; // every gas referenced by the cylinders (+ the CCR diluent)
  cylinders: Cylinder[];
  params: GasParams;
  gfSets: GFSet[]; // 1..3
  env: EnvironmentConfig;
};

/** Default shareability from role (spec §4.8): backgas → true, everything else
 *  → false. The planner UI applies this default; exposed here so callers and
 *  tests derive it the same way. User-overridable per cylinder. */
export function defaultShareable(role: Cylinder['role']): boolean {
  return role === 'backgas';
}
