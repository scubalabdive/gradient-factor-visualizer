// Initial shared exposure for the app. The common case is a single bottom
// segment on air (a square dive) with one GF set — zero friction (spec §6).
import { DEFAULT_ENV } from '@gf/deco-engine';
import type { DiveSegment, EnvironmentConfig, GFSet, GasMix } from '@gf/deco-engine';

export type Units = 'metric' | 'imperial';

export const DEFAULT_GASES: GasMix[] = [
  { id: 'air', name: 'Air', fO2: 0.21, fHe: 0, role: 'bottom' },
];

export const DEFAULT_SEGMENTS: DiveSegment[] = [
  { id: 's1', depth: 40, time: 20, gasId: 'air' },
];

// Nameless by default so the label derives live from the GF pair (see gfSetLabel);
// a user can still type a custom name to override it.
export const DEFAULT_GF_SETS: GFSet[] = [
  { id: 'gf1', gfLow: 0.3, gfHigh: 0.7 },
];

export const DEFAULT_ENVIRONMENT: EnvironmentConfig = { ...DEFAULT_ENV };

export const MAX_GF_SETS = 3;
