// ─────────────────────────────────────────────────────────────────────────────
// @gf/gas-model — the pure gas layer for the bailout planner (spec §4.3–4.7).
//
// Pure functions over the engine's schedule (computeBailoutFromBottom) + Cylinder[]
// + GasParams. No UI, no React, no reaching into engine internals — it consumes
// @gf/deco-engine as a black box. Bar and minutes throughout.
// ─────────────────────────────────────────────────────────────────────────────

export const GAS_MODEL_VERSION = '0.1.0';

// Top-level entry (spec §4.7): one GasResult per GF set.
export { runGasModel, computeMinGas, scheduleForGFSet } from './model';
export type { MinGasResult } from './model';

// 4.3 demand primitives (exported for audit / UI read-outs / tests).
export { meanPamb, legLitres, litresByGas, bandPressure, stopMinutes } from './demand';

// Data model (spec §5).
export type {
  LoadingMode,
  CCRConfig,
  Cylinder,
  GasParams,
  CylinderResult,
  GasResult,
  GasEngineOutput,
  GasModelInput,
} from './types';
export { defaultShareable } from './types';
