// ─────────────────────────────────────────────────────────────────────────────
// Gas Planner (Two Ceilings) — scaffold entry. NO UI yet (milestones 4–7).
//
// This stub exists only to prove the workspace wiring: the planner app resolves
// BOTH the shared deco-engine and the pure gas-model as workspace dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_ENV } from '@gf/deco-engine';
import { GAS_MODEL_VERSION } from '@gf/gas-model';

export const scaffold = {
  engineDefaultMode: DEFAULT_ENV.mode,
  gasModelVersion: GAS_MODEL_VERSION,
} as const;
