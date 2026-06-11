// Derives the engine output from the current shared exposure, memoised so it only
// recomputes when an input slice actually changes (immutable store updates keep
// references stable). A half-edited input must surface as an error state, never
// crash the app, so runEngine is wrapped — the engine itself stays pure.
import { useMemo } from 'react';
import { runEngine } from '../../engine';
import type { GFResult } from '../../engine';
import { useStore } from './useStore';

export type EngineResults =
  | { ok: true; results: GFResult[] }
  | { ok: false; error: string };

export function useEngineResults(): EngineResults {
  const segments = useStore((s) => s.segments);
  const gases = useStore((s) => s.gases);
  const gfSets = useStore((s) => s.gfSets);
  const env = useStore((s) => s.env);

  return useMemo<EngineResults>(() => {
    try {
      // Only the enabled sets are computed → disabled sets disappear from every
      // view, legend, and the outputs table at once (the store keeps ≥1 enabled).
      const active = gfSets.filter((g) => g.enabled !== false);
      const { results } = runEngine({ segments, gases, gfSets: active, env });
      return { ok: true, results };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [segments, gases, gfSets, env]);
}
