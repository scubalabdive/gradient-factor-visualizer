// Initial shared configuration for the planner. The landing case is the spec §9
// scenario 1 — an OC trimix dive (45 m on Tx 21/35, deco EAN50 @ 21 m + O₂ @ 6 m,
// salt, GF 30/85) — so the two ceilings and the per-cylinder table are populated
// and meaningful the moment the app opens.
//
// One coherent set of gases + cylinders serves BOTH modes (spec §6.1): the bottom
// trimix is the OC back gas; in CCR it becomes the loop diluent and the bottom
// bailout. The Mode selector flips which math runs; toggling re-roles the deepest
// source so each mode stays internally valid (see useStore.setMode).
import { DEFAULT_ENV } from '@gf/deco-engine';
import type { DiveSegment, EnvironmentConfig, GFSet, GasMix } from '@gf/deco-engine';
import type { Cylinder } from '@gf/gas-model';

export type Units = 'metric' | 'imperial';

export type Mode = 'oc' | 'ccr';

export const DEFAULT_GASES: GasMix[] = [
  { id: 'tx2135', name: 'Tx 21/35', fO2: 0.21, fHe: 0.35, role: 'bottom' },
  { id: 'ean50', name: 'EAN50', fO2: 0.5, fHe: 0, role: 'deco' },
  { id: 'o2', name: 'O₂', fO2: 1.0, fHe: 0, role: 'deco' },
];

export const DEFAULT_SEGMENTS: DiveSegment[] = [
  { id: 's1', depth: 45, time: 25, gasId: 'tx2135' },
];

// Sidemount-style rig: shareable back gas (two regs) + single-reg deco bottles.
// Shareability defaults from role (spec §4.8) — backgas true, everything else false.
export const DEFAULT_CYLINDERS: Cylinder[] = [
  { id: 'c-back', gasId: 'tx2135', volume: 24, fillPressure: 232, role: 'backgas', shareable: true },
  { id: 'c-ean50', gasId: 'ean50', volume: 11, fillPressure: 200, role: 'deco-bailout', shareable: false },
  { id: 'c-o2', gasId: 'o2', volume: 11, fillPressure: 200, role: 'deco-bailout', shareable: false },
];

// Nameless by default so the label derives live from the GF pair (see gfSetLabel);
// the user can still type a custom name to override it. Default 30/85 matches the
// spec §9 reference scenarios.
export const DEFAULT_GF_SETS: GFSet[] = [
  { id: 'gf1', gfLow: 0.3, gfHigh: 0.85 },
];

export const DEFAULT_ENVIRONMENT: EnvironmentConfig = { ...DEFAULT_ENV };

// Gas-parameter defaults (spec §5 / §4.4). Stress 1.0 because the team-combined RMV
// already carries the donate-to-a-buddy doubling; problem time 1 min; reserve 30 bar.
export const DEFAULT_PARAMS = {
  rmvSelf: 20,
  rmvBuddy: 20,
  rmvDeco: 17,
  rmvBailout: 17,
  stress: 1.0,
  problemTime: 1,
  reserveBar: 30,
} as const;

export const DEFAULT_SETPOINT = 1.3; // bar ppO₂, CCR working setpoint
export const DEFAULT_DILUENT_ID = 'tx2135';

export const MAX_GF_SETS = 3;
