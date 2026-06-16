// Derives the gas-model output from the current shared configuration, memoised so
// it only recomputes when an input slice actually changes (immutable store updates
// keep references stable — this is what makes a GF-slider drag recompute live, spec
// §11 milestone 6). A half-edited input must surface as an error state, never crash
// the app, so runGasModel is wrapped — the model itself stays pure.
//
// The built GasModelInput is returned alongside so the readout can render the exact
// schedule behind each figure (scheduleForGFSet) from the same source of truth.
import { useMemo } from 'react';
import { runGasModel } from '@gf/gas-model';
import type { GasModelInput, GasParams, GasResult } from '@gf/gas-model';
import { useStore } from './useStore';

export type GasResults =
  | { ok: true; results: GasResult[]; input: GasModelInput }
  | { ok: false; error: string };

export function useGasResults(): GasResults {
  const mode = useStore((s) => s.mode);
  const segments = useStore((s) => s.segments);
  const gases = useStore((s) => s.gases);
  const cylinders = useStore((s) => s.cylinders);
  const paramFields = useStore((s) => s.params);
  const setpoint = useStore((s) => s.setpoint);
  const diluentGasId = useStore((s) => s.diluentGasId);
  const gfSets = useStore((s) => s.gfSets);
  const env = useStore((s) => s.env);

  return useMemo<GasResults>(() => {
    try {
      // Only enabled sets are computed → a hidden set drops off the readout at once
      // (the store keeps ≥1 enabled).
      const active = gfSets.filter((g) => g.enabled !== false);
      const params: GasParams = {
        mode,
        ...paramFields,
        ccr: mode === 'ccr' ? { setpoint, diluentGasId } : undefined,
      };
      const input: GasModelInput = { segments, gases, cylinders, params, gfSets: active, env };
      const { results } = runGasModel(input);
      return { ok: true, results, input };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, segments, gases, cylinders, paramFields, setpoint, diluentGasId, gfSets, env]);
}
