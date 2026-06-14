import { describe, it, expect } from 'vitest';
import { gasPlan } from './gasPlan';
import { DEFAULT_ENV } from '@gf/deco-engine';
import type { GasMix } from '@gf/deco-engine';

const air: GasMix = { id: 'air', name: 'Air', fO2: 0.21, fHe: 0, role: 'bottom' };
const ean50: GasMix = { id: 'e', name: 'EAN50', fO2: 0.5, fHe: 0, role: 'deco' };
const o2: GasMix = { id: 'o', name: 'O₂', fO2: 1, fHe: 0, role: 'deco' };

describe('gasPlan', () => {
  it('derives the conventional switches at ppO₂ 1.6 (EAN50 @ 21 m, O₂ @ 6 m)', () => {
    const plan = gasPlan([air, ean50, o2], DEFAULT_ENV, 45);
    expect(plan.start.id).toBe('air');
    expect(plan.switches.map((s) => [s.depth, s.gas.id])).toEqual([
      [21, 'e'],
      [6, 'o'],
    ]);
  });

  it('honours a manual switch-depth override', () => {
    const plan = gasPlan([air, { ...ean50, switchDepth: 24 }], DEFAULT_ENV, 45);
    expect(plan.switches).toEqual([{ depth: 24, gas: { ...ean50, switchDepth: 24 } }]);
  });

  it('shows no switches when there are no deco gases', () => {
    const plan = gasPlan([air], DEFAULT_ENV, 30);
    expect(plan.start.id).toBe('air');
    expect(plan.switches).toEqual([]);
  });

  it('drops a deco gas whose switch depth is deeper than the dive (used throughout)', () => {
    // A shallow 12 m dive: EAN50 (switch 21 m) is usable the whole time — no switch.
    const plan = gasPlan([air, ean50], DEFAULT_ENV, 12);
    expect(plan.start.id).toBe('e');
    expect(plan.switches).toEqual([]);
  });
});
