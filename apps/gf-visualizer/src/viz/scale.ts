// Hand-rolled, dependency-free linear scales + "nice" tick generation for the
// bespoke SVG views (spec §7/§10). Pure math, no DOM — shared by all four views.
// The depth/time mappings are linear, so this stays tiny and keeps the project
// dependency-minimal (a deliberate d3-free precedent for Views 2–4).

export type Scale = {
  /** Map a domain value to a pixel position. */
  map: (v: number) => number;
  /** Inverse: map a pixel position back to a domain value. */
  invert: (px: number) => number;
  domain: readonly [number, number];
  range: readonly [number, number];
};

/**
 * Linear scale from `domain` to `range`. A zero-width domain maps everything to
 * the range start (avoids divide-by-zero on a degenerate dive); a zero-width
 * range inverts to the domain start for the same reason.
 *
 * For the depth axis, pass a range whose start is the TOP pixel and end is the
 * BOTTOM pixel with the domain `[0, maxDepth]` — so depth increases downward
 * (the way divers read a profile, spec §10).
 */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dSpan = d1 - d0;
  const rSpan = r1 - r0;
  const map = (v: number) => (dSpan === 0 ? r0 : r0 + ((v - d0) / dSpan) * rSpan);
  const invert = (px: number) => (rSpan === 0 ? d0 : d0 + ((px - r0) / rSpan) * dSpan);
  return { map, invert, domain, range };
}

/**
 * "Nice" round tick values within [min, max], aiming for ~`count` intervals.
 * Steps snap to 1/2/5 × 10ⁿ so labels read like an instrument. Each tick is
 * rounded to the step's own precision to keep floating-point drift out of labels.
 */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || count < 1) {
    return max > min ? [min, max] : [min];
  }
  const rawStep = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) {
    ticks.push(Number(t.toFixed(decimals)));
  }
  return ticks;
}
