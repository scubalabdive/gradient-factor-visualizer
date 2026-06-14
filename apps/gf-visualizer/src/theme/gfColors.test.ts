import { describe, expect, it } from 'vitest';
import type { GFSet } from '@gf/deco-engine';
import { assignGFColors } from './gfColors';

const mk = (id: string, gfLow: number, gfHigh: number): GFSet => ({ id, gfLow, gfHigh });

describe('assignGFColors', () => {
  it('gives the coolest hue to the most conservative set', () => {
    const colors = assignGFColors([mk('aggr', 0.85, 0.85), mk('cons', 0.3, 0.7)]);
    expect(colors['cons']).toBe('var(--gf-1)');
    expect(colors['aggr']).toBe('var(--gf-2)');
  });

  it('handles a single set', () => {
    expect(assignGFColors([mk('a', 0.4, 0.8)])).toEqual({ a: 'var(--gf-1)' });
  });

  it('orders three sets cool→warm by conservatism', () => {
    const colors = assignGFColors([
      mk('mid', 0.4, 0.8),
      mk('cons', 0.2, 0.6),
      mk('aggr', 0.9, 0.95),
    ]);
    expect(colors['cons']).toBe('var(--gf-1)');
    expect(colors['mid']).toBe('var(--gf-2)');
    expect(colors['aggr']).toBe('var(--gf-3)');
  });
});
