// Display-only metric/imperial conversion (spec §6: "affects display only, never
// engine internals"). The engine always works in metres; the UI converts at the
// edge for entry and read-out. Pressures (surface pressure, ppO₂) stay in bar in
// both modes — only depths and per-minute rates convert.
import type { Units } from './store/defaults';

const FT_PER_M = 3.280839895;

export function depthToDisplay(metres: number, units: Units): number {
  return units === 'imperial' ? metres * FT_PER_M : metres;
}
export function displayToDepth(value: number, units: Units): number {
  return units === 'imperial' ? value / FT_PER_M : value;
}

// Rates are per-minute distances — same linear factor.
export const rateToDisplay = depthToDisplay;
export const displayToRate = displayToDepth;

export function depthUnitLabel(units: Units): string {
  return units === 'imperial' ? 'ft' : 'm';
}
export function rateUnitLabel(units: Units): string {
  return units === 'imperial' ? 'ft/min' : 'm/min';
}
