// ─────────────────────────────────────────────────────────────────────────────
// Data model — spec Section 5, reproduced verbatim (with documenting comments).
//
// The engine works INTERNALLY IN BAR AND MINUTES ONLY. Depth fields below are in
// metres because they belong to user-facing input/output; the engine converts to
// bar at its boundary (see pressure.ts) and never carries feet anywhere.
// ─────────────────────────────────────────────────────────────────────────────

export type GasMix = {
  id: string;
  name: string; // "Tx 18/45", "EAN50", "O2"
  fO2: number; // 0..1
  fHe: number; // 0..1
  role: 'bottom' | 'deco';
  switchDepth?: number; // m; if set, manual override of MOD-derived switch
};

export type DiveSegment = {
  // fixed exposure; ordered. A square dive = one bottom segment.
  id: string;
  depth: number; // m, target depth of this leg
  time: number; // min held at this depth (excludes travel)
  gasId: string;
};

export type GFSet = {
  id: string;
  name?: string; // "30/70"
  gfLow: number; // 0..1 (UI shows 0..100)
  gfHigh: number; // 0..1
  enabled?: boolean; // UI-only: show on the graphs (default true). Engine ignores it.
};

export type EnvironmentConfig = {
  water: 'salt' | 'fresh';
  surfacePressure: number; // bar, default 1.01325
  ascentRate: number; // m/min, default 9
  descentRate: number; // m/min, default 18
  lastStopDepth: number; // m, default 3
  stopIncrement: number; // m, default 3
  ppO2Switch: number; // bar, selectable preset 1.4 | 1.6, default 1.6
};

// ---- engine output ----
export type ProfilePoint = { time: number; depth: number };
export type CompartmentState = { pN2: number; pHe: number }; // bar; 16 per timestamp
export type StopEntry = { depth: number; duration: number }; // min
export type CeilingPoint = { time: number; ceiling: number }; // ceiling depth, m
export type LoadingPoint = {
  time: number;
  compartments: CompartmentState[]; // length 16
  controlling: number; // index 0..15
};

export type GFResult = {
  gfSetId: string;
  profile: ProfilePoint[]; // full depth/time incl. descent, bottom, stops
  stops: StopEntry[];
  firstStopDepth: number;
  totalDecoTime: number;
  tts: number;
  runtime: number;
  ceilingTimeline: CeilingPoint[];
  loadingTimeline: LoadingPoint[];
};

export type EngineInput = {
  segments: DiveSegment[];
  gases: GasMix[];
  gfSets: GFSet[]; // 1..3
  env: EnvironmentConfig;
};

export type EngineOutput = { results: GFResult[] }; // one per GF set

// ─────────────────────────────────────────────────────────────────────────────
// Internal engine types (not part of the spec's public data model).
// ─────────────────────────────────────────────────────────────────────────────

/** Inert-gas loading of all 16 compartments, in bar. The single mutable state
 *  threaded through integration. N₂ and He are tracked independently per 4.5. */
export type TissueState = {
  pN2: number[]; // length 16, bar
  pHe: number[]; // length 16, bar
};

/** Default environment per spec Sections 4.2 / 4.9 / 5. */
export const DEFAULT_ENV: EnvironmentConfig = {
  water: 'salt',
  surfacePressure: 1.01325,
  ascentRate: 9,
  descentRate: 18,
  lastStopDepth: 3,
  stopIncrement: 3,
  ppO2Switch: 1.6,
};
