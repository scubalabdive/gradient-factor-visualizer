// ─────────────────────────────────────────────────────────────────────────────
// CCR bailout-at-bottom validation (spec §4.6 / §9 scenario 2).
//
// Scenario 2: 60 m Tx 18/45 diluent, CCR setpoint 1.3 (descent SP 0.7), 20 min
// bottom, bailout = bottom bailout (Tx 18/45 OC) + EAN50 + O₂, bailout-AT-BOTTOM,
// GF 30/85, salt. The deliverable is the OPEN-CIRCUIT bailout schedule (stops, TTS)
// from the CCR-loaded tissue state.
//
// SETPOINT CONVENTION MATCHED (documented per spec §4.2 / §9):
//   • The loop holds ppO₂ at the HIGH setpoint (1.3 bar) for the bottom hold; the
//     LOW setpoint (0.7) is descent-only — this is the same convention the OC/CCR
//     loading already pins against Subsurface 6.0.5576 (see ccr.test.ts, two
//     references). The bottom is loaded on the loop with that convention.
//   • The failure is at MAXIMUM depth, END of bottom time (worst case).
//   • From that loaded state the ascent is OPEN CIRCUIT on the carried bailout
//     gases — the runtime of THAT ascent is the OC bailout TTS (never CC-TTS).
//
// VALIDATION POSTURE (mirrors reference-profiles.test.ts): a live Shearwater /
// MultiDeco CCR cannot run in this environment, so this fixture
//   1. SNAPSHOTS the engine's OC-bailout schedule as the regression baseline,
//   2. asserts STRUCTURAL sanity + the gas-attribution invariants the gas model
//      relies on (sum of legs == TTS; deepest gas carries the longest run), and
//   3. asserts the GF coupling (the spec's "bridge back to the visualizer":
//      the bailout grows with conservatism), and
//   4. wires a SHEARWATER_REFERENCE slot (null until the user supplies numbers)
//      with a ±tolerance comparator, exactly as the OC fixture wires Subsurface.
// The CCR LOADING half is already Subsurface-validated (ccr.test.ts); the ASCENT
// half is the same OC algorithm the OC reference fixture validates — so the
// composition is validated end-to-end modulo the explicit planner numbers.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { computeBailoutFromBottom, depthToPressure } from '../index';
import { DEFAULT_ENV } from '../types';
import type { BailoutResult } from '../bailout';
import type { EnvironmentConfig, GasMix } from '../types';

// ── Gases ────────────────────────────────────────────────────────────────────
const DIL_TX1845: GasMix = { id: 'dil', name: 'Tx 18/45 (dil)', fO2: 0.18, fHe: 0.45, role: 'diluent' };
const BO_TX1845: GasMix = { id: 'bo', name: 'Tx 18/45 (BO)', fO2: 0.18, fHe: 0.45, role: 'bottom' };
const EAN50: GasMix = { id: 'ean50', name: 'EAN50', fO2: 0.5, fHe: 0, role: 'deco' };
const O2: GasMix = { id: 'o2', name: 'O2', fO2: 1.0, fHe: 0, role: 'deco' };

const CCR_ENV: EnvironmentConfig = {
  ...DEFAULT_ENV,
  water: 'salt',
  mode: 'ccr',
  setpointLow: 0.7,
  setpointHigh: 1.3,
};

function bailoutAt(gfLow: number, gfHigh: number): BailoutResult {
  return computeBailoutFromBottom({
    segments: [{ id: 's1', depth: 60, time: 20, gasId: 'dil' }],
    loadingGases: [DIL_TX1845],
    bailoutGases: [BO_TX1845, EAN50, O2],
    gfSet: { id: `gf-${gfLow}-${gfHigh}`, gfLow, gfHigh },
    env: CCR_ENV,
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function stopSchedule(r: BailoutResult): string {
  return r.stops.length === 0 ? '(no stops)' : r.stops.map((s) => `${s.depth}m→${s.duration}`).join(', ');
}
/** Minutes breathed on each gas, summed over the per-leg breakdown. */
function minutesByGas(r: BailoutResult): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const seg of r.segments) acc[seg.gasId] = round1((acc[seg.gasId] ?? 0) + seg.duration);
  return acc;
}

// ── Reference slot (wired, pending the user's Shearwater/MultiDeco numbers) ───
type BailoutRef = { firstStopDepth: number; stops: { depth: number; duration: number }[]; totalDeco: number };
// `as` (not a bare `null` literal) so TS keeps the union and narrows correctly in the `if` below.
const SHEARWATER_REFERENCE = null as BailoutRef | null; // ← fill from a reference CCR planner to activate

// ─────────────────────────────────────────────────────────────────────────────
describe('CCR bailout-at-bottom — scenario 2 (60 m Tx18/45 dil, SP 1.3, GF 30/85)', () => {
  const r = bailoutAt(0.3, 0.85);

  it('prints the OC bailout schedule (the §4.6 deliverable)', () => {
    // eslint-disable-next-line no-console
    console.log('\n========== CCR BAILOUT-AT-BOTTOM — SCENARIO 2 ==========');
    // eslint-disable-next-line no-console
    console.log('  60 m / 20 min, Tx 18/45 diluent @ SP 1.3 → OC bailout (Tx18/45 + EAN50 + O2), GF 30/85, salt');
    // eslint-disable-next-line no-console
    console.log(`  first stop : ${r.firstStopDepth} m`);
    // eslint-disable-next-line no-console
    console.log(`  stops      : ${stopSchedule(r)}`);
    // eslint-disable-next-line no-console
    console.log(`  OC bailout TTS : ${round1(r.bailoutTts)} min   total deco : ${r.totalDecoTime} min   runtime : ${round1(r.runtime)} min`);
    // eslint-disable-next-line no-console
    console.log(`  minutes by gas : ${JSON.stringify(minutesByGas(r))}`);
    expect(r.stops.length).toBeGreaterThan(0);
  });

  it('is structurally sane: monotonic, increment-aligned, reaches the surface', () => {
    for (let i = 1; i < r.profile.length; i++) {
      expect(r.profile[i]!.time).toBeGreaterThanOrEqual(r.profile[i - 1]!.time - 1e-9);
    }
    expect(r.profile.at(-1)!.depth).toBeCloseTo(0, 6);
    expect(r.firstStopDepth % CCR_ENV.stopIncrement).toBeCloseTo(0, 9);
    let prev = Infinity;
    for (const s of r.stops) {
      expect(s.depth % CCR_ENV.stopIncrement).toBeCloseTo(0, 9);
      expect(s.depth).toBeLessThan(prev);
      expect(s.depth).toBeLessThanOrEqual(r.firstStopDepth);
      expect(s.depth).toBeGreaterThanOrEqual(CCR_ENV.lastStopDepth);
      expect(s.duration).toBeGreaterThan(0);
      prev = s.depth;
    }
    expect(r.stops.at(-1)!.depth).toBe(CCR_ENV.lastStopDepth);
  });

  it('switches bailout gases at their MODs: EAN50 carries the 21 m stop, O2 the 6 m stop', () => {
    const stopGas = new Map(r.segments.filter((s) => s.kind === 'stop').map((s) => [s.depthFrom, s.gasId]));
    expect(stopGas.get(21)).toBe('ean50'); // EAN50 MOD ≈ 21 m at ppO2 1.6
    expect(stopGas.get(6)).toBe('o2'); // O2 MOD ≈ 6 m at ppO2 1.6
  });

  it('attributes gas the gas model relies on: legs sum to TTS; deepest gas binds by volume', () => {
    const sumLegs = r.segments.reduce((s, x) => s + x.duration, 0);
    expect(sumLegs).toBeCloseTo(r.bailoutTts, 6); // the breakdown accounts for ALL bailout time

    // The binding cylinder is normally the DEEPEST bailout gas (spec §4.6 step 4) —
    // and that is a VOLUME claim, not a time one: shallow O₂ runs the most MINUTES,
    // but the bottom bailout is breathed at ~5 bar, so its litres dominate. Here we
    // prove the litres-proxy Σ(t·P̄) (spec 4.3) is largest for the bottom bailout —
    // the gas model turns this exact rollup into the binding cylinder.
    const barMinByGas: Record<string, number> = {};
    for (const seg of r.segments) {
      const pBar = depthToPressure((seg.depthFrom + seg.depthTo) / 2, CCR_ENV); // mean-depth P̄
      barMinByGas[seg.gasId] = (barMinByGas[seg.gasId] ?? 0) + seg.duration * pBar;
    }
    const deepest = barMinByGas['bo'] ?? 0;
    for (const [gas, barMin] of Object.entries(barMinByGas)) {
      if (gas !== 'bo') expect(deepest).toBeGreaterThan(barMin);
    }
  });

  it('responds to GF like any OC profile (the bridge back to the visualizer)', () => {
    const conservative = bailoutAt(0.2, 0.8);
    const liberal = bailoutAt(0.5, 0.9);
    // More conservative ⇒ at least as much deco; more liberal ⇒ at most as much.
    expect(conservative.totalDecoTime).toBeGreaterThanOrEqual(r.totalDecoTime);
    expect(liberal.totalDecoTime).toBeLessThanOrEqual(r.totalDecoTime);
    expect(conservative.firstStopDepth).toBeGreaterThanOrEqual(r.firstStopDepth);
  });

  it('matches the regression baseline (snapshot) / the reference planner when supplied', () => {
    expect({
      firstStop: r.firstStopDepth,
      stops: stopSchedule(r),
      totalDeco: r.totalDecoTime,
      bailoutTts: round1(r.bailoutTts),
      minutesByGas: minutesByGas(r),
    }).toMatchInlineSnapshot(`
      {
        "bailoutTts": 43.7,
        "firstStop": 30,
        "minutesByGas": {
          "bo": 8.2,
          "ean50": 15.5,
          "o2": 19.6,
        },
        "stops": "30m→1, 27m→1, 24m→2, 21m→1, 18m→2, 15m→2, 12m→3, 9m→6, 6m→7, 3m→12",
        "totalDeco": 37,
      }
    `);

    if (SHEARWATER_REFERENCE) {
      const ref = SHEARWATER_REFERENCE;
      expect(r.firstStopDepth).toBe(ref.firstStopDepth);
      expect(r.stops.map((s) => s.depth)).toEqual(ref.stops.map((s) => s.depth));
      r.stops.forEach((s, i) => {
        const tol = s.depth === CCR_ENV.lastStopDepth ? 2 : 1; // last stop is GF_high-governed
        expect(Math.abs(s.duration - ref.stops[i]!.duration)).toBeLessThanOrEqual(tol);
      });
      expect(Math.abs(r.totalDecoTime - ref.totalDeco)).toBeLessThanOrEqual(3);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('computeBailoutFromBottom — OC mode reproduces the planned OC ascent', () => {
  // With an OC env and the OC gases as BOTH loading and bailout gases, "bailout
  // from bottom" IS the planned OC ascent — the same schedule the visualizer
  // produces (spec §4.5 reuse). Pin it to Profile 2's reference stops.
  const AIR_BOTTOM: GasMix = { id: 'tx', name: 'Tx 18/45', fO2: 0.18, fHe: 0.45, role: 'bottom' };
  const ocEnv: EnvironmentConfig = { ...DEFAULT_ENV, water: 'salt', mode: 'oc' };
  const r = computeBailoutFromBottom({
    segments: [{ id: 's1', depth: 60, time: 20, gasId: 'tx' }],
    loadingGases: [AIR_BOTTOM, EAN50, O2],
    bailoutGases: [AIR_BOTTOM, EAN50, O2],
    gfSet: { id: 'gf', gfLow: 0.3, gfHigh: 0.85 },
    env: ocEnv,
  });

  it('reproduces Profile 2 (Tx18/45 60/20 EAN50+O2 GF30/85): 30 m first stop, 38 min deco', () => {
    expect(r.firstStopDepth).toBe(30);
    expect(stopSchedule(r)).toBe('30m→1, 27m→1, 24m→2, 21m→1, 18m→2, 15m→2, 12m→3, 9m→6, 6m→7, 3m→13');
    expect(r.totalDecoTime).toBe(38);
  });
});
