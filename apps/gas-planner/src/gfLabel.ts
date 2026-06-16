// Display label for a GF set: the user's name if given, otherwise the canonical
// "low/high" pair (e.g. "30/70"). Shared by the View 1 legend and the outputs
// table so a set reads identically everywhere.
import type { GFSet } from '@gf/deco-engine';
import { round } from './util';

export function gfSetLabel(gf: GFSet): string {
  return gf.name?.trim() || `${round(gf.gfLow * 100)}/${round(gf.gfHigh * 100)}`;
}
