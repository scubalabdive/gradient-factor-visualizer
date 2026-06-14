// ─────────────────────────────────────────────────────────────────────────────
// Bailout-from-bottom — the engine seam the Gas Planner needs (spec 4.6).
//
// "Worst case by construction: loop failure at maximum depth, end of bottom time."
// We LOAD the descent + bottom on the loop (or on OC), then trigger the OPEN-
// CIRCUIT ascent from that loaded tissue state on the carried bailout gases. This
// is just loadExposure() (phase 1) + runAscent() (phases 2–3) with an OC strategy
// — the SAME deco math the visualizer uses, so the bailout schedule responds to
// GF exactly as any OC profile does (the spec's "bridge back to the visualizer").
//
// The runtime of this ascent is the **OC bailout TTS** — the time ceiling. It is
// NEVER the CC-TTS a handset shows on the loop; the field is named accordingly.
//
// This same function serves the OC technical case (spec 4.5 deco adequacy): pass
// an OC env and the OC gases as BOTH the loading and the bailout gases, and the
// "bailout from bottom" is simply the planned OC ascent with its per-gas breakdown.
// ─────────────────────────────────────────────────────────────────────────────

import { loadExposure, ocAscentStrategy, runAscent, type BreathingSegment } from './ascent';
import type {
  DiveSegment,
  EnvironmentConfig,
  GFSet,
  GasMix,
  ProfilePoint,
  StopEntry,
} from './types';

export type BailoutInput = {
  /** The exposure to load before the failure: descent + bottom (+ multi-level). */
  segments: DiveSegment[];
  /** Gases referenced by `segments` while loading — the loop diluent(s) under a
   *  CCR env, or the OC bottom/deco gases under an OC env. */
  loadingGases: GasMix[];
  /** Open-circuit gases breathed on the ascent: the bottom bailout (role
   *  `'bottom'`) plus deco bailouts (role `'deco'`), auto-placed at their MODs. */
  bailoutGases: GasMix[];
  /** The GF Low/High pair the bailout ascent is computed at. */
  gfSet: GFSet;
  /** Environment. `mode: 'ccr'` loads the bottom on the loop at the setpoints;
   *  the ASCENT is always open-circuit regardless of mode (spec 4.6). */
  env: EnvironmentConfig;
};

export type BailoutResult = {
  gfSetId: string;
  firstStopDepth: number;
  stops: StopEntry[];
  totalDecoTime: number;
  /** OC bailout TTS — runtime from leaving the bottom to the surface, breathing
   *  open circuit. The time ceiling (spec 4.7). NEVER the loop's CC-TTS. */
  bailoutTts: number;
  /** Total runtime from t=0 (surface) to surfacing again, min. */
  runtime: number;
  profile: ProfilePoint[];
  /** Per-leg gas breakdown of the OC ascent — feeds the per-cylinder volume sum
   *  (spec 4.3 / 4.6 step 3). One entry per travel leg and per stop hold. */
  segments: BreathingSegment[];
};

/**
 * Load the exposure (descent + bottom) per `env.mode`, then run the OPEN-CIRCUIT
 * ascent on the carried bailout gases from that loaded tissue state. Pure.
 *
 * The binding cylinder (spec 4.6 step 4) is left to the gas model: it sums the
 * returned `segments` per cylinder and compares required + reserve vs available.
 */
export function computeBailoutFromBottom(input: BailoutInput): BailoutResult {
  const { segments, loadingGases, bailoutGases, gfSet, env } = input;

  const loadGasById = new Map(loadingGases.map((g) => [g.id, g] as const));
  const { ctx, leaveBottomTime } = loadExposure(segments, loadGasById, env);

  // The ascent is ALWAYS open-circuit on the bailout gases (spec 4.6) — even when
  // env.mode === 'ccr', which only governed how the bottom was loaded.
  const strategy = ocAscentStrategy(bailoutGases, env);
  const { stops, firstStopDepth, breakdown } = runAscent(ctx, gfSet, env, strategy);

  const runtime = ctx.clock;
  const bailoutTts = runtime - leaveBottomTime;
  const totalDecoTime = stops.reduce((sum, s) => sum + s.duration, 0);
  const profile: ProfilePoint[] = ctx.samples.map((s) => ({ time: s.time, depth: s.depth }));

  return {
    gfSetId: gfSet.id,
    firstStopDepth,
    stops,
    totalDecoTime,
    bailoutTts,
    runtime,
    profile,
    segments: breakdown,
  };
}
