import { describe, expect, it } from 'vitest';
import { depthToDisplay, depthUnitLabel, displayToDepth, rateUnitLabel } from './units';

describe('units (display only)', () => {
  it('metric is the identity', () => {
    expect(depthToDisplay(30, 'metric')).toBe(30);
    expect(displayToDepth(30, 'metric')).toBe(30);
  });

  it('imperial converts m↔ft and round-trips', () => {
    expect(depthToDisplay(10, 'imperial')).toBeCloseTo(32.808, 2);
    const ft = depthToDisplay(42, 'imperial');
    expect(displayToDepth(ft, 'imperial')).toBeCloseTo(42, 9);
  });

  it('labels', () => {
    expect(depthUnitLabel('metric')).toBe('m');
    expect(depthUnitLabel('imperial')).toBe('ft');
    expect(rateUnitLabel('metric')).toBe('m/min');
    expect(rateUnitLabel('imperial')).toBe('ft/min');
  });
});
