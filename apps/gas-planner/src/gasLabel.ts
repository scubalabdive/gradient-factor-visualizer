// Display name for a gas mix, derived from its O₂/He fractions (trimix notation).
// Kept separate so the store, gas editor, and later the view legends all agree.
export function gasLabel(g: { fO2: number; fHe: number }): string {
  const o2 = Math.round(g.fO2 * 100);
  const he = Math.round(g.fHe * 100);
  if (he > 0) return `Tx ${o2}/${he}`;
  if (o2 >= 100) return 'O₂';
  if (o2 === 21) return 'Air';
  return `EAN${o2}`;
}
