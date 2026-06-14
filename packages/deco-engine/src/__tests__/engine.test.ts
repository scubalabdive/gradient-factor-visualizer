// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for the engine primitives. These lock the physics/maths of spec
// Section 4 independently of the full ascent algorithm, so a regression in a
// single formula is caught precisely.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  A_N2,
  B_N2,
  HALFTIME_HE,
  HALFTIME_N2,
  K_N2,
} from '../constants';
import {
  applyConstantDepth,
  applyDepthChange,
  barPerMetre,
  ceilingAtGF,
  combinedAB,
  depthToPressure,
  fN2,
  gasSwitchDepth,
  gfAtDepth,
  initialTissueState,
  mValue,
  mValueGF,
  modDepth,
  ocBreathing,
  pressureToDepth,
  toleratedAmbient,
} from '../index';
import type { EnvironmentConfig, GasMix } from '../types';
import { DEFAULT_ENV } from '../types';

const SALT: EnvironmentConfig = { ...DEFAULT_ENV, water: 'salt' };
const FRESH: EnvironmentConfig = { ...DEFAULT_ENV, water: 'fresh' };

const AIR: GasMix = { id: 'air', name: 'Air', fO2: 0.21, fHe: 0, role: 'bottom' };
const EAN50: GasMix = { id: 'ean50', name: 'EAN50', fO2: 0.5, fHe: 0, role: 'deco' };
const O2: GasMix = { id: 'o2', name: 'O2', fO2: 1.0, fHe: 0, role: 'deco' };
const TX1845: GasMix = { id: 'tx', name: 'Tx 18/45', fO2: 0.18, fHe: 0.45, role: 'bottom' };

describe('constants (spec 4.1)', () => {
  it('has 16 compartments per table', () => {
    expect(HALFTIME_N2).toHaveLength(16);
    expect(HALFTIME_HE).toHaveLength(16);
    expect(A_N2).toHaveLength(16);
    expect(B_N2).toHaveLength(16);
  });

  it('pins the first/last N2 rows exactly to the spec table', () => {
    expect(HALFTIME_N2[0]).toBe(5.0);
    expect(A_N2[0]).toBe(1.1696);
    expect(B_N2[0]).toBe(0.5578);
    expect(HALFTIME_N2[15]).toBe(635.0);
    expect(A_N2[15]).toBe(0.2327);
    expect(B_N2[15]).toBe(0.9653);
  });

  it('derives k = ln2 / halftime', () => {
    expect(K_N2[0]).toBeCloseTo(Math.LN2 / 5.0, 12);
  });
});

describe('pressure ↔ depth (spec 4.2)', () => {
  it('uses density-derived bar/m for salt and fresh', () => {
    expect(barPerMetre('salt')).toBeCloseTo(0.101008, 6);
    expect(barPerMetre('fresh')).toBeCloseTo(0.0980665, 7);
  });

  it('round-trips depth → pressure → depth in both water types', () => {
    for (const env of [SALT, FRESH]) {
      for (const d of [0, 3, 21, 45, 60]) {
        expect(pressureToDepth(depthToPressure(d, env), env)).toBeCloseTo(d, 9);
      }
    }
  });

  it('salt water is denser → higher pressure at the same depth', () => {
    expect(depthToPressure(40, SALT)).toBeGreaterThan(depthToPressure(40, FRESH));
  });
});

describe('gas helpers (spec 4.3 / 4.10)', () => {
  it('derives fN2 = 1 − fO2 − fHe', () => {
    expect(fN2(AIR)).toBeCloseTo(0.79, 12);
    expect(fN2(TX1845)).toBeCloseTo(0.37, 12);
  });

  it('places EAN50 switch at 21 m and O2 at 6 m (salt, ppO2 1.6)', () => {
    expect(modDepth(EAN50, 1.6, SALT)).toBeCloseTo(21.64, 1);
    expect(gasSwitchDepth(EAN50, SALT)).toBe(21);
    expect(gasSwitchDepth(O2, SALT)).toBe(6);
  });

  it('honours a manual switch-depth override', () => {
    const ean50Manual: GasMix = { ...EAN50, switchDepth: 18 };
    expect(gasSwitchDepth(ean50Manual, SALT)).toBe(18);
  });
});

describe('M-value & GF ceiling (spec 4.7)', () => {
  it('computes raw M-value M = a + P_amb/b', () => {
    expect(mValue(1.1696, 0.5578, 1)).toBeCloseTo(1.1696 + 1 / 0.5578, 9);
  });

  it('inverted tolerated-ambient round-trips against mValueGF', () => {
    const a = 0.4;
    const b = 0.891;
    for (const gf of [0.3, 0.7, 0.85, 1.0]) {
      for (const pAmb of [1.5, 3.0, 5.0]) {
        const pT = mValueGF(a, b, pAmb, gf);
        expect(toleratedAmbient(a, b, pT, gf)).toBeCloseTo(pAmb, 9);
      }
    }
  });

  it('GF=1 ceiling equals the raw Bühlmann tolerated ambient', () => {
    const a = 0.4;
    const b = 0.891;
    const pT = 2.5;
    // At GF=1: P_amb_tol = (pT - a) * b  (solve pT = a + P/b)
    expect(toleratedAmbient(a, b, pT, 1)).toBeCloseTo((pT - a) * b, 9);
  });
});

describe('GF interpolation with depth (spec 4.8)', () => {
  const firstStop = 21;
  it('= GF_low at the first stop, GF_high at the surface', () => {
    expect(gfAtDepth(firstStop, firstStop, 0.3, 0.7)).toBeCloseTo(0.3, 12);
    expect(gfAtDepth(0, firstStop, 0.3, 0.7)).toBeCloseTo(0.7, 12);
  });
  it('is linear in between and clamps below the first stop to GF_low', () => {
    expect(gfAtDepth(firstStop / 2, firstStop, 0.3, 0.7)).toBeCloseTo(0.5, 12);
    expect(gfAtDepth(firstStop + 10, firstStop, 0.3, 0.7)).toBeCloseTo(0.3, 12);
  });
});

describe('trimix a/b combining (spec 4.6)', () => {
  it('falls back to N2 coefficients when there is no inert gas', () => {
    const { a, b } = combinedAB(0, 0, 0);
    expect(a).toBe(A_N2[0]);
    expect(b).toBe(B_N2[0]);
  });
  it('returns pure-N2 coefficients when only N2 is present', () => {
    const { a, b } = combinedAB(5, 1.5, 0);
    expect(a).toBeCloseTo(A_N2[5]!, 12);
    expect(b).toBeCloseTo(B_N2[5]!, 12);
  });
  it('partial-pressure-weights between N2 and He', () => {
    const { a } = combinedAB(0, 1, 1); // 50/50 by partial pressure
    expect(a).toBeCloseTo((A_N2[0]! + 1.6189) / 2, 9);
  });
});

describe('integrators (spec 4.4 / 4.5)', () => {
  it('Haldane drives a compartment toward the inspired pressure', () => {
    const env = SALT;
    let s = initialTissueState(env);
    s = applyConstantDepth(s, 30, 1000, ocBreathing(AIR), env); // long soak
    const inspiredN2 = (depthToPressure(30, env) - 0.0627) * fN2(AIR);
    expect(s.pN2[0]).toBeCloseTo(inspiredN2, 4);
  });

  it('Schreiner at zero depth-change equals Haldane', () => {
    const env = SALT;
    const start = initialTissueState(env);
    const haldane = applyConstantDepth(start, 30, 7, ocBreathing(AIR), env);
    const schreiner = applyDepthChange(start, 30, 30, 7, ocBreathing(AIR), env);
    for (let i = 0; i < 16; i++) {
      expect(schreiner.pN2[i]).toBeCloseTo(haldane.pN2[i]!, 10);
    }
  });

  it('descent on-gasses N2 above the surface-saturation baseline', () => {
    const env = SALT;
    const start = initialTissueState(env);
    const afterDescent = applyDepthChange(start, 0, 45, 45 / env.descentRate, ocBreathing(AIR), env);
    expect(afterDescent.pN2[0]).toBeGreaterThan(start.pN2[0]!);
  });
});

describe('ceiling controlling compartment (spec 4.7)', () => {
  it('picks the deepest-ceiling compartment after a bottom soak', () => {
    const env = SALT;
    let s = initialTissueState(env);
    s = applyConstantDepth(s, 45, 25, ocBreathing(AIR), env);
    const c = ceilingAtGF(s, 0.3, env);
    expect(c.controlling).toBeGreaterThanOrEqual(0);
    expect(c.controlling).toBeLessThan(16);
    expect(c.ceilingDepth).toBeGreaterThan(0); // a 45m/25min air dive has an obligation at GF30
  });
});
