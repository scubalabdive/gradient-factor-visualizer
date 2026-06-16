// ─────────────────────────────────────────────────────────────────────────────
// The gas model — minimum gas (4.4), deco adequacy (4.5), CCR bailout (4.6) and
// the two-ceiling synthesis (4.7). Pure functions over the engine's schedule
// (computeBailoutFromBottom), the cylinders, and GasParams. No UI, no React.
//
// Everything is bar and minutes. "Ration against the OC bailout TTS, never the
// loop's CC-TTS" is honoured throughout — the only TTS in play here is the OC
// ascent's (BailoutResult.bailoutTts).
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeBailoutFromBottom,
  depthToPressure,
  gasSwitchDepth,
  type BailoutResult,
  type BreathingSegment,
  type EnvironmentConfig,
  type GFSet,
  type GasMix,
} from '@gf/deco-engine';
import { bandPressure, litresByGas, stopMinutes } from './demand';
import type {
  Cylinder,
  CylinderResult,
  GasEngineOutput,
  GasModelInput,
  GasParams,
  GasResult,
} from './types';

const EPS = 1e-9;

// ── Engine plumbing: turn cylinders + gases into an engine schedule ──────────

/** The engine GasMix for a cylinder, with the engine role it needs for ascent gas
 *  switching: deco bottles are 'deco'; backgas / bottom-bailout are the 'bottom'
 *  fallback. (The cylinder's planner role — backgas/…/deco-bailout — is separate.) */
function engineGasFor(cyl: Cylinder, gases: GasMix[]): GasMix {
  const g = gases.find((x) => x.id === cyl.gasId);
  if (!g) throw new Error(`gas-model: no GasMix found for cylinder "${cyl.id}" (gasId "${cyl.gasId}")`);
  const role: GasMix['role'] = cyl.role === 'deco-bailout' ? 'deco' : 'bottom';
  return { ...g, role };
}

/**
 * The OC ascent schedule for one GF set, with its per-leg gas breakdown.
 *
 *  • CCR: load descent + bottom on the loop at the setpoint (diluent), then trigger
 *    the OC ascent on the carried bottom-bailout + deco-bailout gases (spec 4.6).
 *  • OC:  load + ascend on the OC gases (backgas + deco bottles) — the planned OC
 *    ascent, reused for deco adequacy (spec 4.5).
 *
 * The CCR loop holds the single setpoint S throughout the dive phase (spec §4.2's
 * single-S model); we map it to both engine setpoints (descent == working).
 *
 * Exported so the UI can render the exact schedule behind each figure (spec §7 —
 * "the schedule behind every figure is shown") without re-deriving the inputs.
 */
export function scheduleForGFSet(input: GasModelInput, gfSet: GFSet): BailoutResult {
  const { segments, gases, cylinders, params, env } = input;

  if (params.mode === 'ccr') {
    const ccr = params.ccr;
    if (!ccr) throw new Error('gas-model: params.ccr is required when mode === "ccr"');
    const diluent = gases.find((g) => g.id === ccr.diluentGasId);
    if (!diluent) throw new Error(`gas-model: diluent gas "${ccr.diluentGasId}" not found`);

    const bailoutCyls = cylinders.filter(
      (c) => c.role === 'bottom-bailout' || c.role === 'deco-bailout',
    );
    const bailoutGases = bailoutCyls.map((c) => engineGasFor(c, gases));
    const ccrEnv: EnvironmentConfig = {
      ...env,
      mode: 'ccr',
      setpointLow: ccr.setpoint,
      setpointHigh: ccr.setpoint,
    };
    // Load the exposure on the diluent (the bottom is loop-on at the setpoint).
    const loadSegments = segments.map((s) => ({ ...s, gasId: ccr.diluentGasId }));
    return computeBailoutFromBottom({
      segments: loadSegments,
      loadingGases: [{ ...diluent, role: 'diluent' }],
      bailoutGases,
      gfSet,
      env: ccrEnv,
      // Recognition/problem time held at depth on OC before the bailout ascent —
      // matches how reference planners model bailout (validated vs Subsurface).
      problemTimeMin: params.problemTime,
    });
  }

  // OC: load + ascend on the OC gases (backgas + deco bottles).
  const ocGases = cylinders.map((c) => engineGasFor(c, gases));
  return computeBailoutFromBottom({
    segments,
    loadingGases: ocGases,
    bailoutGases: ocGases,
    gfSet,
    env: { ...env, mode: 'oc' },
  });
}

// ── 4.4 OC minimum gas (to the first breathable source) ──────────────────────

export type MinGasResult = {
  minGasBar: number; // ceil(event_litres / V_backgas) — the gas ceiling
  eventLitres: number;
  bottomDepth: number;
  firstSwitchDepth: number; // depth of the first OC switch on ascent (0 = surface)
  combinedRmv: number;
  vBackgasLitres: number;
};

/**
 * Minimum gas on the shareable back gas, team-combined (spec 4.4 / 4.8): "buddy is
 * out, both breathe my donatable gas to the first switch." Self-only if the back
 * gas is not shareable. The event = problem time held at depth + the ascent from
 * the bottom to the first OC gas switch (or the surface if there is none).
 */
export function computeMinGas(input: GasModelInput): MinGasResult {
  const { segments, gases, cylinders, params, env } = input;
  const bottomDepth = Math.max(...segments.map((s) => s.depth));

  // First OC switch on ascent = the DEEPEST deco-gas switch depth shallower than
  // the bottom (the first bottle you'd switch to going up). None ⇒ surface (0).
  let firstSwitchDepth = 0;
  for (const c of cylinders) {
    if (c.role !== 'deco-bailout') continue;
    const sd = gasSwitchDepth(engineGasFor(c, gases), env);
    if (Number.isFinite(sd) && sd < bottomDepth - EPS) {
      firstSwitchDepth = Math.max(firstSwitchDepth, sd);
    }
  }

  const backgas = cylinders.filter((c) => c.role === 'backgas');
  const vBackgasLitres = backgas.reduce((s, c) => s + c.volume, 0);
  const anyShareable = backgas.some((c) => c.shareable);
  const combinedRmv = anyShareable ? params.rmvSelf + params.rmvBuddy : params.rmvSelf;

  const tAscent = (bottomDepth - firstSwitchDepth) / env.ascentRate;
  const pBottom = depthToPressure(bottomDepth, env);
  const pAscent = depthToPressure((bottomDepth + firstSwitchDepth) / 2, env);
  // event_litres = combinedRMV · stress · (problem-hold litres-rate + ascent litres-rate).
  // We carry the two P̄ terms explicitly (bottom hold at P_amb(d); ascent at the
  // mean-depth P̄) — the honest decomposition of the spec's single P̄_event.
  const eventLitres =
    combinedRmv * params.stress * (params.problemTime * pBottom + tAscent * pAscent);

  const minGasBar = vBackgasLitres > 0 ? Math.ceil(eventLitres / vBackgasLitres) : Infinity;
  return { minGasBar, eventLitres, bottomDepth, firstSwitchDepth, combinedRmv, vBackgasLitres };
}

// ── Per-cylinder required / available / reserve / margin (4.5 & 4.6) ──────────

/** Required litres for a fixed total demand, split across cylinders by capacity
 *  (used for the pooled back gas in min gas). */
function pooledResults(cyls: Cylinder[], totalRequired: number, params: GasParams): CylinderResult[] {
  const totalVol = cyls.reduce((s, c) => s + c.volume, 0);
  return cyls.map((c) => {
    const requiredLitres = totalVol > EPS ? totalRequired * (c.volume / totalVol) : totalRequired;
    const availableLitres = c.volume * c.fillPressure;
    const reserveLitres = params.reserveBar * c.volume;
    return {
      cylinderId: c.id,
      requiredLitres,
      availableLitres,
      reserveLitres,
      marginLitres: availableLitres - requiredLitres - reserveLitres,
      binding: false,
    };
  });
}

/** Per-cylinder results from a per-gas demand map. When several cylinders carry the
 *  same gas (e.g. sidemount), that gas's required litres are split between them by
 *  capacity and its available litres are the sum — so each physical cylinder still
 *  appears, and the binding pick degenerates correctly to one cylinder per gas. */
function gasDemandResults(
  cyls: Cylinder[],
  litresOfGas: Map<string, number>,
  params: GasParams,
): CylinderResult[] {
  const volByGas = new Map<string, number>();
  for (const c of cyls) volByGas.set(c.gasId, (volByGas.get(c.gasId) ?? 0) + c.volume);

  return cyls.map((c) => {
    const totalVol = volByGas.get(c.gasId) ?? c.volume;
    const gasLitres = litresOfGas.get(c.gasId) ?? 0;
    const requiredLitres = totalVol > EPS ? gasLitres * (c.volume / totalVol) : gasLitres;
    const availableLitres = c.volume * c.fillPressure;
    const reserveLitres = params.reserveBar * c.volume;
    return {
      cylinderId: c.id,
      requiredLitres,
      availableLitres,
      reserveLitres,
      marginLitres: availableLitres - requiredLitres - reserveLitres,
      binding: false,
    };
  });
}

/** Mark the constraining cylinder (smallest margin) as binding. */
function markBinding(results: CylinderResult[]): void {
  let bestIdx = -1;
  let bestMargin = Infinity;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r && r.marginLitres < bestMargin) {
      bestMargin = r.marginLitres;
      bestIdx = i;
    }
  }
  const binding = results[bestIdx];
  if (binding) binding.binding = true;
}

// ── 4.7 time ceiling: the inverse (max-TTS flip) of 4.5 ──────────────────────

/**
 * The max OC/bailout TTS the carried gas supports (spec 4.5 inverse, 4.7).
 *
 * For each gas that carries stop time: max_stop_time = (available − reserve) /
 * (RMV · P̄_band). Its headroom over the CURRENT stop time is the extra stop
 * minutes it can still cover; the gas with the LEAST headroom binds. The time
 * ceiling is the current bailout TTS plus that minimum headroom — i.e. how far the
 * exposure could extend before the tightest gas runs out (holding the schedule's
 * shape, a documented v1 approximation). A negative headroom (already short) pulls
 * the ceiling BELOW the current TTS — a clear "you don't have enough" signal.
 */
function computeTimeCeiling(
  breakdown: BreathingSegment[],
  cyls: Cylinder[],
  rmvForGas: (gasId: string) => number,
  reserveBar: number,
  currentBailoutTts: number,
  env: EnvironmentConfig,
): number {
  const availByGas = new Map<string, number>();
  const volByGas = new Map<string, number>();
  for (const c of cyls) {
    availByGas.set(c.gasId, (availByGas.get(c.gasId) ?? 0) + c.volume * c.fillPressure);
    volByGas.set(c.gasId, (volByGas.get(c.gasId) ?? 0) + c.volume);
  }

  let minHeadroom = Infinity;
  for (const [gasId, available] of availByGas) {
    const pBand = bandPressure(breakdown, gasId, env);
    if (pBand <= EPS) continue; // this gas carries no stop time
    const usable = available - reserveBar * (volByGas.get(gasId) ?? 0);
    const maxStop = usable / (rmvForGas(gasId) * pBand);
    const headroom = maxStop - stopMinutes(breakdown, gasId);
    if (headroom < minHeadroom) minHeadroom = headroom;
  }
  return Number.isFinite(minHeadroom) ? currentBailoutTts + minHeadroom : currentBailoutTts;
}

// ── 4.7 synthesis: one GasResult per GF set ──────────────────────────────────

function gasResultForGFSet(input: GasModelInput, gfSet: GFSet): GasResult {
  const { cylinders, params, env } = input;
  const sched = scheduleForGFSet(input, gfSet);

  if (params.mode === 'ccr') {
    // 4.6 CCR bailout-at-bottom: per bailout cylinder, all breathed at rmvBailout.
    const bailoutCyls = cylinders.filter(
      (c) => c.role === 'bottom-bailout' || c.role === 'deco-bailout',
    );
    const rmvForGas = (): number => params.rmvBailout;
    const litres = litresByGas(sched.segments, rmvForGas, env);
    const perCylinder = gasDemandResults(bailoutCyls, litres, params);
    markBinding(perCylinder);

    const binding = perCylinder.find((r) => r.binding);
    const bindingCyl = bailoutCyls.find((c) => c.id === binding?.cylinderId);
    // CCR gas ceiling = the bar the binding cylinder must still hold to cover the
    // full OC bailout + its reserve (spec 4.7).
    const gasCeilingBar =
      binding && bindingCyl
        ? Math.ceil((binding.requiredLitres + binding.reserveLitres) / bindingCyl.volume)
        : 0;
    const timeCeilingTts = computeTimeCeiling(
      sched.segments,
      bailoutCyls,
      rmvForGas,
      params.reserveBar,
      sched.bailoutTts,
      env,
    );
    return { gfSetId: gfSet.id, gasCeilingBar, timeCeilingTts, bailoutTts: sched.bailoutTts, perCylinder };
  }

  // OC: 4.4 min gas (back gas) + 4.5 deco adequacy (deco bottles).
  const minGas = computeMinGas(input);
  const backgas = cylinders.filter((c) => c.role === 'backgas');
  const decoCyls = cylinders.filter((c) => c.role === 'deco-bailout');
  const decoGasIds = new Set(decoCyls.map((c) => c.gasId));
  const rmvForGas = (gasId: string): number =>
    decoGasIds.has(gasId) ? params.rmvDeco : params.rmvSelf;
  const litres = litresByGas(sched.segments, rmvForGas, env);

  const backgasResults = pooledResults(backgas, minGas.eventLitres, params); // required = min gas
  const decoResults = gasDemandResults(decoCyls, litres, params);
  const perCylinder = [...backgasResults, ...decoResults];
  markBinding(perCylinder);

  const timeCeilingTts = computeTimeCeiling(
    sched.segments,
    decoCyls,
    () => params.rmvDeco,
    params.reserveBar,
    sched.bailoutTts,
    env,
  );
  return {
    gfSetId: gfSet.id,
    gasCeilingBar: minGas.minGasBar, // OC gas ceiling = minimum gas
    timeCeilingTts,
    bailoutTts: sched.bailoutTts,
    perCylinder,
  };
}

/**
 * Run the gas model over every GF set against the shared exposure + cylinders +
 * params. One GasResult per GF set (spec §5/§4.7). Pure: no DOM, no React, no I/O.
 */
export function runGasModel(input: GasModelInput): GasEngineOutput {
  if (input.gfSets.length < 1 || input.gfSets.length > 3) {
    throw new Error(`runGasModel: expected 1..3 GF sets, got ${input.gfSets.length}`);
  }
  const results = input.gfSets.map((gfSet) => gasResultForGFSet(input, gfSet));
  return { results };
}
