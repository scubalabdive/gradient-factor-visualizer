import { describe, it, expect } from 'vitest';
import { gfSetLabel } from './gfLabel';
import type { GFSet } from '@gf/deco-engine';

const base: GFSet = { id: 'g', gfLow: 0.3, gfHigh: 0.7 };

describe('gfSetLabel', () => {
  it('derives "low/high" from the factors when unnamed', () => {
    expect(gfSetLabel(base)).toBe('30/70');
    expect(gfSetLabel({ ...base, gfLow: 0.4, gfHigh: 0.85 })).toBe('40/85');
  });

  it('prefers a user-given name', () => {
    expect(gfSetLabel({ ...base, name: 'Conservative' })).toBe('Conservative');
  });

  it('falls back to the derived label for a blank/whitespace name', () => {
    expect(gfSetLabel({ ...base, name: '   ' })).toBe('30/70');
  });
});
