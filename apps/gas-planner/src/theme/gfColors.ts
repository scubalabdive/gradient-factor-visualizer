// GF-set palette encodes conservatism as a cool→warm sequence (spec §10): the
// most conservative pair gets the coolest hue, the most aggressive the warmest.
// Hues are saturated so they never collide with the stark neutral M-value line.
// Colours resolve to the design tokens in styles/tokens.css.
import type { GFSet } from '@gf/deco-engine';

export const GF_PALETTE = ['var(--gf-1)', 'var(--gf-2)', 'var(--gf-3)'] as const;

/** Lower GF (low + high) ⇒ more conservative ⇒ cooler. */
function conservatism(gf: GFSet): number {
  return gf.gfLow + gf.gfHigh;
}

/**
 * Map each set's id to a colour by RELATIVE conservatism. Ties keep the set's
 * original order so the assignment is stable as the user drags sliders.
 */
export function assignGFColors(gfSets: GFSet[]): Record<string, string> {
  const ranked = gfSets
    .map((gf, index) => ({ id: gf.id, index, score: conservatism(gf) }))
    .sort((a, b) => a.score - b.score || a.index - b.index);

  const colors: Record<string, string> = {};
  ranked.forEach((entry, rank) => {
    colors[entry.id] = GF_PALETTE[Math.min(rank, GF_PALETTE.length - 1)]!;
  });
  return colors;
}
