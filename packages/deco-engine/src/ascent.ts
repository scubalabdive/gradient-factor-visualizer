// ─────────────────────────────────────────────────────────────────────────────
// Ascent / stop-finding algorithm + gas switching — spec Sections 4.9 & 4.10.
//
// Computes one GFResult for a single GF set over the shared exposure. The exposure
// (segments + gases + env) is identical across GF sets; only gfLow/gfHigh differ.
//
// STRUCTURE (refactored so the Gas Planner can reuse the exact same machinery):
//   • loadExposure() — phase 1: descent + bottom + any multi-level legs. Breathing
//     is OC or the CCR loop per env.mode. Returns the loaded tissue state.
//   • runAscent()    — phases 2–3: find the first stop, then walk stop-to-stop to
//     the surface, on a supplied AscentStrategy (OC gas switching, or the CCR
//     loop). Emits a per-leg gas breakdown so a gas model can sum volumes.
//   • computeProfileForGFSet() — composes the two and derives the output timelines
//     (phase 4). Its numeric output is BYTE-IDENTICAL to the pre-refactor engine
//     (the OC reference fixture and the CCR Subsurface references are the gate).
//
// The Gas Planner's CCR bailout (spec 4.6) is "load on the loop, then run the OC
// ascent on the carried bailout gases" — i.e. loadExposure() with a CCR env, then
// runAscent() with an OC strategy. That lives in bailout.ts and reuses both.
//
// CONVENTIONS (documented per spec "match Subsurface and document the choice"):
//  • GF evaluated at the NEXT/shallower stop. To leave a stop we test the ceiling
//    using GF(target_depth) — spec 4.9 step 3 ("evaluated for the shallower target
//    depth"). Matches Subsurface.
//  • First stop = the deepest stop that genuinely requires a hold (4.9 step 2),
//    found by probing each candidate with ITSELF as the GF-slope anchor; the
//    GF_low ceiling rounded up only seeds the deepest candidate. Anchoring the
//    slope at the raw rounded-up ceiling overshoots by one stop and runs the
//    slope permissive — validated against Subsurface (spec 12). The first stop
//    anchors the GF slope for the whole ascent.
//  • Stop time accrues in 1-minute granularity; only stops with ≥1 min are recorded.
//  • Gas switch happens on ARRIVAL at the switch stop (the hold there is on the new
//    gas); travel into a stop uses the gas active at the deeper stop. Switch depth =
//    MOD rounded to nearest stop (see gas.ts), with manual override. No artificial
//    mandatory switch-stop delay is added — the deco obligation governs the time.
// ─────────────────────────────────────────────────────────────────────────────

import { COMPARTMENT_COUNT } from './constants';
import { bestGasAtDepth, ccrBreathing, ocBreathing, type Breathing } from './gas';
import { ceilingAtGF, gfAtDepth } from './mvalue';
import { applyConstantDepth, applyDepthChange, cloneTissue, initialTissueState } from './tissue';
import type {
  CeilingPoint,
  DiveSegment,
  EnvironmentConfig,
  GFResult,
  GFSet,
  GasMix,
  LoadingPoint,
  ProfilePoint,
  StopEntry,
  TissueState,
} from './types';

const TRAVEL_SUBSTEP_MIN = 0.1; // travel integration granularity (spec 4.9)
const STOP_STEP_MIN = 1; // stop hold granularity (spec 4.9)
const EPS = 1e-6;
const MAX_STOP_MINUTES = 100000; // safety cap against a runaway stop loop

/** One recorded instant of the dive: time, depth and a tissue snapshot. The
 *  ceiling/loading timelines are derived from these once first_stop_depth is
 *  known (so the GF slope can be applied consistently). */
type Sample = { time: number; depth: number; tissue: TissueState };

/** Internal mutable integration context threaded through the phases. */
export type Ctx = {
  state: TissueState;
  clock: number;
  depth: number;
  samples: Sample[];
  env: EnvironmentConfig;
};

function record(ctx: Ctx): void {
  ctx.samples.push({ time: ctx.clock, depth: ctx.depth, tissue: cloneTissue(ctx.state) });
}

/** Travel from current depth to `toDepth` at the given rate (m/min, positive), on
 *  breathing source `breathing`, sub-sampling at TRAVEL_SUBSTEP_MIN. Schreiner is
 *  exact for a constant rate, so sub-stepping only adds timeline resolution. */
function travelTo(ctx: Ctx, toDepth: number, rateMPerMin: number, breathing: Breathing): void {
  const fromDepth = ctx.depth;
  if (Math.abs(toDepth - fromDepth) < EPS) return;
  const totalTime = Math.abs(toDepth - fromDepth) / rateMPerMin;
  const steps = Math.max(1, Math.ceil(totalTime / TRAVEL_SUBSTEP_MIN));
  for (let s = 0; s < steps; s++) {
    const t0 = (s / steps) * totalTime;
    const t1 = ((s + 1) / steps) * totalTime;
    const d0 = fromDepth + ((toDepth - fromDepth) * t0) / totalTime;
    const d1 = fromDepth + ((toDepth - fromDepth) * t1) / totalTime;
    ctx.state = applyDepthChange(ctx.state, d0, d1, t1 - t0, breathing, ctx.env);
    ctx.clock += t1 - t0;
    ctx.depth = d1;
    record(ctx);
  }
  ctx.depth = toDepth;
}

/** Hold at the current depth for `minutes` on breathing source `breathing`, sampling
 *  at STOP_STEP_MIN. Returns nothing; mutates ctx. */
function holdFor(ctx: Ctx, minutes: number, breathing: Breathing): void {
  let remaining = minutes;
  while (remaining > EPS) {
    const step = Math.min(STOP_STEP_MIN, remaining);
    ctx.state = applyConstantDepth(ctx.state, ctx.depth, step, breathing, ctx.env);
    ctx.clock += step;
    remaining -= step;
    record(ctx);
  }
}

/** Public wrapper over holdFor: hold at the current depth on `breathing`, recording
 *  samples. Used to model a problem/recognition hold before a bailout ascent (4.6). */
export function holdAtDepth(ctx: Ctx, minutes: number, breathing: Breathing): void {
  holdFor(ctx, minutes, breathing);
}

// ── Ascent breathing strategy ────────────────────────────────────────────────
//
// The ascent algorithm is breathing-agnostic: it only needs, at any depth, the
// inspired-gas source to integrate AND the identity of the gas (for the per-leg
// volume breakdown). OC switches to the richest usable gas at depth; the CCR loop
// stays on the diluent at the working setpoint.

/** A single breathed leg of the ascent (a travel leg or a stop hold), with the
 *  gas breathed and the depths/duration. A gas model turns this into litres via
 *  spec 4.3 (gas_litres = RMV · t · P̄, P̄ at the mean depth). `depthFrom` ==
 *  `depthTo` for a stop. Pressure conversion is deliberately left to the caller so
 *  the mean-depth-vs-integrated choice (spec 4.3) lives in the gas model. */
export type BreathingSegment = {
  kind: 'travel' | 'stop';
  gasId: string;
  duration: number; // min
  depthFrom: number; // m
  depthTo: number; // m
};

/** Supplies the ascent with its breathing source and gas identity at any depth. */
export type AscentStrategy = {
  breathingAt: (depthM: number) => Breathing;
  gasIdAt: (depthM: number) => string;
};

/** Open-circuit ascent: richest-usable-gas switching among `gases` (spec 4.10). */
export function ocAscentStrategy(gases: GasMix[], env: EnvironmentConfig): AscentStrategy {
  return {
    breathingAt: (d) => ocBreathing(bestGasAtDepth(d, gases, env)),
    gasIdAt: (d) => bestGasAtDepth(d, gases, env).id,
  };
}

/** Closed-circuit ascent: the loop stays on `diluent` at the working `setpoint`. */
export function ccrAscentStrategy(diluent: GasMix, setpoint: number): AscentStrategy {
  return {
    breathingAt: () => ccrBreathing(diluent, setpoint),
    gasIdAt: () => diluent.id,
  };
}

// ── Phase 1: load the exposure (descent + bottom + multi-level legs) ──────────

/** Result of integrating the fixed exposure: the loaded tissue state (inside the
 *  ctx) and the runtime at which the diver leaves the bottom (TTS reference). */
export type LoadResult = { ctx: Ctx; leaveBottomTime: number };

/**
 * Integrate the fixed exposure (descent + bottom + any multi-level legs). OC
 * breathes the per-segment gas at its fixed fraction; CCR breathes the loop —
 * the LOW setpoint only while descending, the HIGH (working) setpoint for every
 * hold and any inter-level ascent (the setpoint switches to high on arrival at a
 * depth, validated against Subsurface). Single-diluent model on the loop: each
 * segment's gas is its diluent during that segment.
 */
export function loadExposure(
  segments: DiveSegment[],
  gasById: Map<string, GasMix>,
  env: EnvironmentConfig,
): LoadResult {
  const ctx: Ctx = { state: initialTissueState(env), clock: 0, depth: 0, samples: [], env };
  record(ctx); // t=0 at the surface

  const isCCR = env.mode === 'ccr';
  const descentBreathing = (gas: GasMix): Breathing =>
    isCCR ? ccrBreathing(gas, env.setpointLow) : ocBreathing(gas);
  const holdBreathing = (gas: GasMix): Breathing =>
    isCCR ? ccrBreathing(gas, env.setpointHigh) : ocBreathing(gas);

  for (const seg of segments) {
    const gas = gasById.get(seg.gasId);
    if (!gas) throw new Error(`loadExposure: unknown gasId "${seg.gasId}"`);
    if (Math.abs(seg.depth - ctx.depth) > EPS) {
      const descending = seg.depth > ctx.depth;
      const rate = descending ? env.descentRate : env.ascentRate;
      // CCR: low setpoint only while descending; everything else on the high setpoint.
      travelTo(ctx, seg.depth, rate, descending ? descentBreathing(gas) : holdBreathing(gas));
    }
    if (seg.time > 0) holdFor(ctx, seg.time, holdBreathing(gas));
  }

  return { ctx, leaveBottomTime: ctx.clock };
}

// ── Phases 2–3: first-stop finding + stop-to-stop ascent ─────────────────────

export type AscentResult = {
  stops: StopEntry[];
  firstStopDepth: number;
  /** Per-leg gas breakdown of the ascent (for gas-volume summing, spec 4.3). */
  breakdown: BreathingSegment[];
};

/**
 * Run the ascent from the already-loaded `ctx` to the surface, for one GF set, on
 * the supplied breathing strategy. Mutates `ctx` (advancing the clock/depth and
 * recording samples) and returns the stops, first-stop depth, and the per-leg gas
 * breakdown. Phase 4 (output timelines) is derived by the caller from ctx.samples.
 */
export function runAscent(
  ctx: Ctx,
  gfSet: GFSet,
  env: EnvironmentConfig,
  strategy: AscentStrategy,
): AscentResult {
  const breakdown: BreathingSegment[] = [];

  // ── 2. First stop: the deepest stop that actually requires a hold ─────────
  // The GF slope is anchored at the first stop, so the first-stop depth and the
  // slope are mutually dependent. Rounding the GF_low ceiling UP and anchoring
  // there (the naive choice) overshoots by one stop: the slope comes out too
  // permissive and the engine sheds ~one stop's worth of deco (validated vs
  // Subsurface — spec 12). We resolve the dependency by probing on a CLONE:
  // ascend continuously (no holds) from the bottom and, at each candidate stop,
  // test whether a hold is required using THAT candidate as the slope anchor.
  // The deepest candidate that needs a hold is the first stop. Schreiner is
  // exact for a constant ascent rate, so the probe's tissue state at a depth
  // matches the real ascent's — the choice is self-consistent. The probe uses
  // the single ascent gas active at the bottom (gas picked at the bottom depth).
  const cLow = ceilingAtGF(ctx.state, gfSet.gfLow, env);
  let firstStopDepth = 0;
  if (cLow.ceilingDepth > EPS) {
    const probeBreathing = strategy.breathingAt(ctx.depth);
    let probeState = cloneTissue(ctx.state);
    let probeDepth = ctx.depth;
    // Deepest possible first stop: the GF_low ceiling rounded up to a stop.
    let candidate = Math.ceil(cLow.ceilingDepth / env.stopIncrement - EPS) * env.stopIncrement;
    while (candidate >= env.lastStopDepth - EPS) {
      if (probeDepth - candidate > EPS) {
        const dt = (probeDepth - candidate) / env.ascentRate;
        probeState = applyDepthChange(probeState, probeDepth, candidate, dt, probeBreathing, env);
        probeDepth = candidate;
      }
      const target = Math.max(0, candidate - env.stopIncrement); // next shallower stop / surface
      const gfTarget = gfAtDepth(target, candidate, gfSet.gfLow, gfSet.gfHigh);
      if (ceilingAtGF(probeState, gfTarget, env).ceilingDepth > target + EPS) {
        firstStopDepth = candidate; // a hold is genuinely required here
        break;
      }
      candidate -= env.stopIncrement;
    }
  }

  const stops: StopEntry[] = [];

  if (firstStopDepth <= EPS) {
    // No decompression obligation — ascend straight to the surface on the bottom gas.
    const from = ctx.depth;
    const gasId = strategy.gasIdAt(ctx.depth);
    travelTo(ctx, 0, env.ascentRate, strategy.breathingAt(ctx.depth));
    if (from > EPS) {
      breakdown.push({
        kind: 'travel',
        gasId,
        duration: from / env.ascentRate,
        depthFrom: from,
        depthTo: 0,
      });
    }
  } else {
    // ── 3. Ascend to the first stop, then stop-to-stop to the last stop ─────
    const fromBottom = ctx.depth;
    const bottomGasId = strategy.gasIdAt(ctx.depth);
    travelTo(ctx, firstStopDepth, env.ascentRate, strategy.breathingAt(ctx.depth));
    breakdown.push({
      kind: 'travel',
      gasId: bottomGasId,
      duration: (fromBottom - firstStopDepth) / env.ascentRate,
      depthFrom: fromBottom,
      depthTo: firstStopDepth,
    });

    // Build the ordered list of stop depths: first → … → lastStopDepth.
    const stopDepths: number[] = [];
    for (let d = firstStopDepth; d >= env.lastStopDepth - EPS; d -= env.stopIncrement) {
      stopDepths.push(Number(d.toFixed(6)));
    }

    for (let i = 0; i < stopDepths.length; i++) {
      const stopDepth = stopDepths[i]!;
      const target = i + 1 < stopDepths.length ? stopDepths[i + 1]! : 0; // surface after last stop
      const breathing = strategy.breathingAt(stopDepth); // OC switch applied on arrival; CCR diluent
      const gasId = strategy.gasIdAt(stopDepth);
      const gfTarget = gfAtDepth(target, firstStopDepth, gfSet.gfLow, gfSet.gfHigh);

      // Hold (1-min steps) until the GF(target) ceiling permits ascending to target.
      let minutes = 0;
      while (true) {
        const c = ceilingAtGF(ctx.state, gfTarget, env);
        if (c.ceilingDepth <= target + EPS) break;
        holdFor(ctx, STOP_STEP_MIN, breathing);
        minutes += STOP_STEP_MIN;
        if (minutes > MAX_STOP_MINUTES) {
          throw new Error(`Stop at ${stopDepth} m did not clear within cap — check inputs`);
        }
      }
      if (minutes > 0) {
        stops.push({ depth: stopDepth, duration: minutes });
        breakdown.push({
          kind: 'stop',
          gasId,
          duration: minutes,
          depthFrom: stopDepth,
          depthTo: stopDepth,
        });
      }

      // Travel to the next target on the breathing source active at this stop.
      travelTo(ctx, target, env.ascentRate, breathing);
      const travelDur = (stopDepth - target) / env.ascentRate;
      if (travelDur > EPS) {
        breakdown.push({
          kind: 'travel',
          gasId,
          duration: travelDur,
          depthFrom: stopDepth,
          depthTo: target,
        });
      }
    }
  }

  return { stops, firstStopDepth, breakdown };
}

/** Derive the ceiling + loading output timelines from the recorded samples, given
 *  the (now known) first-stop depth so the GF slope can be applied consistently.
 *  Phase 4, shared between the visualizer profile and any other consumer. */
function deriveTimelines(
  ctx: Ctx,
  firstStopDepth: number,
  gfSet: GFSet,
  env: EnvironmentConfig,
): { profile: ProfilePoint[]; ceilingTimeline: CeilingPoint[]; loadingTimeline: LoadingPoint[] } {
  const profile: ProfilePoint[] = ctx.samples.map((s) => ({ time: s.time, depth: s.depth }));
  const ceilingTimeline: CeilingPoint[] = [];
  const loadingTimeline: LoadingPoint[] = [];
  for (const s of ctx.samples) {
    const gf = gfAtDepth(s.depth, firstStopDepth, gfSet.gfLow, gfSet.gfHigh);
    const c = ceilingAtGF(s.tissue, gf, env);
    ceilingTimeline.push({ time: s.time, ceiling: Math.max(0, c.ceilingDepth) });
    const compartments = new Array(COMPARTMENT_COUNT).fill(null).map((_, i) => ({
      pN2: s.tissue.pN2[i]!,
      pHe: s.tissue.pHe[i]!,
    }));
    loadingTimeline.push({ time: s.time, compartments, controlling: c.controlling });
  }
  return { profile, ceilingTimeline, loadingTimeline };
}

/**
 * Compute one GFResult for a single GF set over the shared exposure.
 *
 * Composes loadExposure() + runAscent() + deriveTimelines(). OC uses richest-gas
 * switching; CCR stays on the loop (low setpoint while descending, high setpoint
 * for the bottom hold and the whole ascent). Output is byte-identical to the
 * pre-refactor engine — the OC reference fixture and the CCR Subsurface
 * references are the regression gate.
 *
 * @param segments ordered dive segments (fixed exposure)
 * @param gases    bottom + deco gases
 * @param gfSet    the GF Low/High pair for this result
 * @param env      environment config (already merged with defaults)
 */
export function computeProfileForGFSet(
  segments: DiveSegment[],
  gases: GasMix[],
  gfSet: GFSet,
  env: EnvironmentConfig,
): GFResult {
  const gasById = new Map(gases.map((g) => [g.id, g] as const));

  const { ctx, leaveBottomTime } = loadExposure(segments, gasById, env);

  // Ascent strategy: OC richest-gas switching, or the CCR loop on the working
  // setpoint with the diluent = the gas of the last segment (single-diluent model).
  let strategy: AscentStrategy;
  if (env.mode === 'ccr') {
    const diluent = gasById.get(segments[segments.length - 1]!.gasId);
    if (!diluent) throw new Error('computeProfileForGFSet: CCR diluent not found');
    strategy = ccrAscentStrategy(diluent, env.setpointHigh);
  } else {
    strategy = ocAscentStrategy(gases, env);
  }

  const { stops, firstStopDepth } = runAscent(ctx, gfSet, env, strategy);

  const runtime = ctx.clock;
  const tts = runtime - leaveBottomTime;
  const totalDecoTime = stops.reduce((sum, s) => sum + s.duration, 0);

  const { profile, ceilingTimeline, loadingTimeline } = deriveTimelines(
    ctx,
    firstStopDepth,
    gfSet,
    env,
  );

  return {
    gfSetId: gfSet.id,
    profile,
    stops,
    firstStopDepth,
    totalDecoTime,
    tts,
    runtime,
    ceilingTimeline,
    loadingTimeline,
  };
}
