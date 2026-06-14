// ─────────────────────────────────────────────────────────────────────────────
// Gas-model fixture — spec §9 scenarios 1–3 + the §4.3 hand-check.
//
//   1. OC trimix — 45 m Tx 21/35, deco EAN50 (21 m) + O₂ (6 m), salt, GF 30/85.
//      → minimum gas (4.4) + per-deco-gas adequacy (4.5).
//   2. CCR — 60 m Tx 18/45 diluent, setpoint 1.3, bailout = bottom bailout + EAN50
//      + O₂, bailout-at-bottom (4.6), GF 30/85, salt.
//   3. Fresh-water OC — scenario 1's rig in fresh water, to exercise the shared
//      pressure conversion (volumes must drop with density).
//
// VALIDATION (mirrors the engine fixtures): no external CCR planner runs here, so
//   • the §4.3 arithmetic is HAND-CHECKED independently (legLitres + min gas),
//   • per-cylinder required litres are cross-checked against an independent
//     recomputation from the engine's leg breakdown (attribution + capacity split),
//   • fresh ≠ salt is asserted, the CCR binding cylinder is asserted (deepest), and
//   • the results are SNAPSHOTTED as the regression baseline.
// A REFERENCE_PLANNER slot is wired (null) for the user's Shearwater/MultiDeco
// gas figures — gas volumes within ~5% (spec §9) activates when supplied.
//
// Per-leg note: P_amb is linear in depth and depth is linear in time over a leg,
// so the mean-depth P̄ (spec 4.3) is the EXACT per-leg integral — the ~5% tolerance
// is for matching a planner's different segmentation/rounding, not our own error.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  computeBailoutFromBottom,
  DEFAULT_ENV,
  type BreathingSegment,
  type EnvironmentConfig,
  type GasMix,
} from '@gf/deco-engine';
import { computeMinGas, legLitres, runGasModel } from '../index';
import type { Cylinder, GasModelInput, GasParams, GasResult } from '../index';

// ── Gases ────────────────────────────────────────────────────────────────────
const TX2135: GasMix = { id: 'tx2135', name: 'Tx 21/35', fO2: 0.21, fHe: 0.35, role: 'bottom' };
const TX1845: GasMix = { id: 'tx1845', name: 'Tx 18/45', fO2: 0.18, fHe: 0.45, role: 'diluent' };
const EAN50: GasMix = { id: 'ean50', name: 'EAN50', fO2: 0.5, fHe: 0, role: 'deco' };
const O2: GasMix = { id: 'o2', name: 'O2', fO2: 1.0, fHe: 0, role: 'deco' };

// ── Helpers ──────────────────────────────────────────────────────────────────
const r1 = (n: number): number => Math.round(n * 10) / 10;
function snapshotResult(g: GasResult): unknown {
  return {
    gasCeilingBar: g.gasCeilingBar,
    bailoutTts: r1(g.bailoutTts),
    timeCeilingTts: r1(g.timeCeilingTts),
    perCylinder: g.perCylinder.map((c) => ({
      id: c.cylinderId,
      requiredL: Math.round(c.requiredLitres),
      availableL: Math.round(c.availableLitres),
      reserveL: Math.round(c.reserveLitres),
      marginL: Math.round(c.marginLitres),
      binding: c.binding,
    })),
  };
}
/** Independent recomputation of one gas's required litres from the engine's legs. */
function requiredFromLegs(segments: BreathingSegment[], gasId: string, rmv: number, env: EnvironmentConfig): number {
  return segments
    .filter((s) => s.gasId === gasId)
    .reduce((sum, s) => sum + legLitres(s, rmv, env), 0);
}

// ── Reference slot (wired, pending external planner gas figures) ──────────────
const REFERENCE_PLANNER = null as { note: string } | null;

// ═════════════════════════════ §4.3 hand-check ═══════════════════════════════
describe('4.3 gas demand — the hand-checked arithmetic', () => {
  const salt: EnvironmentConfig = { ...DEFAULT_ENV, water: 'salt' };
  const fresh: EnvironmentConfig = { ...DEFAULT_ENV, water: 'fresh' };
  const stopLeg = (depth: number): BreathingSegment => ({
    kind: 'stop',
    gasId: 'x',
    duration: 3,
    depthFrom: depth,
    depthTo: depth,
  });

  it('matches the worked example: 3 min @ 21 m, RMV 20, salt → 188.07 L', () => {
    // P_amb(21) = 1.01325 + 21·0.1010085 = 3.134428 bar → 20·3·3.134428 = 188.0657 L.
    expect(legLitres(stopLeg(21), 20, salt)).toBeCloseTo(188.0657, 3);
  });

  it('fresh water delivers fewer litres than salt for the same depth (density)', () => {
    // Fresh P_amb(21) = 1.01325 + 21·0.0980665 = 3.07264 bar → 20·3·3.07264 = 184.36 L.
    expect(legLitres(stopLeg(21), 20, fresh)).toBeCloseTo(184.3585, 3);
    expect(legLitres(stopLeg(21), 20, fresh)).toBeLessThan(legLitres(stopLeg(21), 20, salt));
  });
});

// ════════════════════════ Scenario 1 — OC trimix 45 m ════════════════════════
const OC_PARAMS: GasParams = {
  mode: 'oc',
  rmvSelf: 20,
  rmvBuddy: 20,
  rmvDeco: 18,
  rmvBailout: 20,
  stress: 1.0,
  problemTime: 1,
  reserveBar: 30,
};
const OC_CYLINDERS: Cylinder[] = [
  { id: 'backgas', gasId: 'tx2135', volume: 24, fillPressure: 220, role: 'backgas', shareable: true },
  { id: 'ean50', gasId: 'ean50', volume: 11, fillPressure: 200, role: 'deco-bailout', shareable: false },
  { id: 'o2', gasId: 'o2', volume: 11, fillPressure: 200, role: 'deco-bailout', shareable: false },
];
function scenario1(water: 'salt' | 'fresh'): GasModelInput {
  return {
    segments: [{ id: 's1', depth: 45, time: 25, gasId: 'tx2135' }],
    gases: [TX2135, EAN50, O2],
    cylinders: OC_CYLINDERS,
    params: OC_PARAMS,
    gfSets: [{ id: 'gf3085', gfLow: 0.3, gfHigh: 0.85 }],
    env: { ...DEFAULT_ENV, water },
  };
}

describe('Scenario 1 — OC trimix 45 m / 25 min, EAN50 + O2, salt, GF 30/85', () => {
  const input = scenario1('salt');
  const out = runGasModel(input);
  const g = out.results[0]!;

  it('minimum gas (4.4) matches the hand calc: 686 L → 29 bar on 24 L backgas', () => {
    // combinedRMV 40, stress 1, firstSwitch = EAN50 @ 21 m, ascent (45→21)/9 = 2.667 min.
    // P_amb(45)=5.5586, P_amb(33)=4.3465 → 40·(1·5.5586 + 2.667·4.3465) = 685.97 L.
    const mg = computeMinGas(input);
    expect(mg.firstSwitchDepth).toBe(21);
    expect(mg.combinedRmv).toBe(40);
    expect(mg.eventLitres).toBeCloseTo(685.97, 0);
    expect(mg.minGasBar).toBe(29);
    expect(g.gasCeilingBar).toBe(29);
  });

  it('per-deco-gas required litres (4.5) reconcile with the engine leg breakdown', () => {
    const sched = computeBailoutFromBottom({
      segments: input.segments,
      loadingGases: [TX2135, EAN50, O2],
      bailoutGases: [TX2135, EAN50, O2],
      gfSet: input.gfSets[0]!,
      env: { ...input.env, mode: 'oc' },
    });
    for (const id of ['ean50', 'o2'] as const) {
      const fromModel = g.perCylinder.find((c) => c.cylinderId === id)!.requiredLitres;
      const independent = requiredFromLegs(sched.segments, id, OC_PARAMS.rmvDeco, input.env);
      expect(fromModel).toBeCloseTo(independent, 6); // exact: same §4.3 per leg
      expect(fromModel).toBeGreaterThan(0);
    }
  });

  it('snapshots the gas result (regression baseline)', () => {
    expect(snapshotResult(g)).toMatchInlineSnapshot(`
      {
        "bailoutTts": 25,
        "gasCeilingBar": 29,
        "perCylinder": [
          {
            "availableL": 5280,
            "binding": false,
            "id": "backgas",
            "marginL": 3874,
            "requiredL": 686,
            "reserveL": 720,
          },
          {
            "availableL": 2200,
            "binding": true,
            "id": "ean50",
            "marginL": 1513,
            "requiredL": 357,
            "reserveL": 330,
          },
          {
            "availableL": 2200,
            "binding": false,
            "id": "o2",
            "marginL": 1519,
            "requiredL": 351,
            "reserveL": 330,
          },
        ],
        "timeCeilingTts": 63.8,
      }
    `);
  });
});

// ════════════════════════ Scenario 2 — CCR bailout 60 m ══════════════════════
const CCR_PARAMS: GasParams = {
  mode: 'ccr',
  rmvSelf: 20,
  rmvBuddy: 20,
  rmvDeco: 18,
  rmvBailout: 20,
  stress: 1.0,
  problemTime: 1,
  reserveBar: 30,
  ccr: { setpoint: 1.3, diluentGasId: 'tx1845' },
};
const CCR_CYLINDERS: Cylinder[] = [
  { id: 'bo', gasId: 'tx1845', volume: 11.1, fillPressure: 200, role: 'bottom-bailout', shareable: false },
  { id: 'ean50', gasId: 'ean50', volume: 11.1, fillPressure: 200, role: 'deco-bailout', shareable: false },
  { id: 'o2', gasId: 'o2', volume: 11.1, fillPressure: 200, role: 'deco-bailout', shareable: false },
];
const scenario2: GasModelInput = {
  segments: [{ id: 's1', depth: 60, time: 20, gasId: 'tx1845' }],
  gases: [TX1845, EAN50, O2],
  cylinders: CCR_CYLINDERS,
  params: CCR_PARAMS,
  gfSets: [{ id: 'gf3085', gfLow: 0.3, gfHigh: 0.85 }],
  env: { ...DEFAULT_ENV, water: 'salt' },
};

describe('Scenario 2 — CCR 60 m / 20 min Tx18/45 dil @ SP 1.3, bailout-at-bottom, GF 30/85', () => {
  const out = runGasModel(scenario2);
  const g = out.results[0]!;

  it('rations against the OC bailout TTS (never CC-TTS) and equals the engine schedule', () => {
    const sched = computeBailoutFromBottom({
      segments: scenario2.segments,
      loadingGases: [{ ...TX1845, role: 'diluent' }],
      bailoutGases: [
        { ...TX1845, role: 'bottom' },
        { ...EAN50, role: 'deco' },
        { ...O2, role: 'deco' },
      ],
      gfSet: scenario2.gfSets[0]!,
      env: { ...scenario2.env, mode: 'ccr', setpointLow: 1.3, setpointHigh: 1.3 },
      problemTimeMin: CCR_PARAMS.problemTime, // gas model passes problem time through
    });
    expect(g.bailoutTts).toBeCloseTo(sched.bailoutTts, 6);
    // Per-cylinder required reconciles with an independent leg sum at rmvBailout.
    for (const id of ['bo', 'ean50', 'o2'] as const) {
      const fromModel = g.perCylinder.find((c) => c.cylinderId === id)!.requiredLitres;
      const independent = requiredFromLegs(sched.segments, id === 'bo' ? 'tx1845' : id, CCR_PARAMS.rmvBailout, scenario2.env);
      expect(fromModel).toBeCloseTo(independent, 6);
    }
  });

  it('marks the deepest bailout cylinder (bottom bailout) as binding (spec 4.6 step 4)', () => {
    const binding = g.perCylinder.find((c) => c.binding);
    expect(binding?.cylinderId).toBe('bo');
    // Bottom bailout carries the most required litres (deep, high P̄).
    const reqById = Object.fromEntries(g.perCylinder.map((c) => [c.cylinderId, c.requiredLitres]));
    expect(reqById['bo']).toBeGreaterThan(reqById['ean50']!);
    expect(reqById['bo']).toBeGreaterThan(reqById['o2']!);
  });

  it('snapshots the gas result (regression baseline)', () => {
    expect(snapshotResult(g)).toMatchInlineSnapshot(`
      {
        "bailoutTts": 45.7,
        "gasCeilingBar": 110,
        "perCylinder": [
          {
            "availableL": 2220,
            "binding": true,
            "id": "bo",
            "marginL": 1010,
            "requiredL": 877,
            "reserveL": 333,
          },
          {
            "availableL": 2220,
            "binding": false,
            "id": "ean50",
            "marginL": 1160,
            "requiredL": 727,
            "reserveL": 333,
          },
          {
            "availableL": 2220,
            "binding": false,
            "id": "o2",
            "marginL": 1301,
            "requiredL": 586,
            "reserveL": 333,
          },
        ],
        "timeCeilingTts": 62.4,
      }
    `);
  });
});

// ════════════════════════ Scenario 3 — fresh water ═══════════════════════════
describe('Scenario 3 — scenario 1 in FRESH water exercises the pressure conversion', () => {
  const salt = runGasModel(scenario1('salt')).results[0]!;
  const fresh = runGasModel(scenario1('fresh')).results[0]!;

  it('fresh water yields a measurably smaller minimum gas than salt', () => {
    expect(fresh.gasCeilingBar).toBeLessThan(salt.gasCeilingBar);
  });

  it('snapshots the fresh-water gas result (regression baseline)', () => {
    expect(snapshotResult(fresh)).toMatchInlineSnapshot(`
      {
        "bailoutTts": 24,
        "gasCeilingBar": 28,
        "perCylinder": [
          {
            "availableL": 5280,
            "binding": false,
            "id": "backgas",
            "marginL": 3890,
            "requiredL": 670,
            "reserveL": 720,
          },
          {
            "availableL": 2200,
            "binding": true,
            "id": "ean50",
            "marginL": 1519,
            "requiredL": 351,
            "reserveL": 330,
          },
          {
            "availableL": 2200,
            "binding": false,
            "id": "o2",
            "marginL": 1551,
            "requiredL": 319,
            "reserveL": 330,
          },
        ],
        "timeCeilingTts": 63.5,
      }
    `);

    if (REFERENCE_PLANNER) {
      // Activate the ±5% gas-volume comparison against an external planner here.
    }
  });
});
