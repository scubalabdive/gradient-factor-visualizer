// ─────────────────────────────────────────────────────────────────────────────
// App state — the single shared exposure (segments + gases + gfSets + env) that
// every GF set and every view reads from, plus the display units toggle. Only
// gfLow/gfHigh differ between results; the exposure is identical across sets
// (spec §5) — that invariant lives here, in one store.
//
// All updates are immutable so unchanged slices keep their reference and the
// engine memo (useEngineResults) only recomputes when something actually changed.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import type { DiveSegment, EnvironmentConfig, GFSet, GasMix } from '../../engine';
import { gasLabel } from '../gasLabel';
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_GASES,
  DEFAULT_GF_SETS,
  DEFAULT_SEGMENTS,
  MAX_GF_SETS,
  type Units,
} from './defaults';

let _seq = 0;
const uid = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(++_seq).toString(36)}`;

type State = {
  segments: DiveSegment[];
  gases: GasMix[];
  gfSets: GFSet[];
  env: EnvironmentConfig;
  units: Units;
  /** Shared "current time" (min) driving the linked cursor/marker across the
   *  views (spec §9). Seeded by the scrubber; consumers clamp to [0, runtime]. */
  scrubTime: number;
};

type Actions = {
  addSegment: () => void;
  updateSegment: (id: string, patch: Partial<Omit<DiveSegment, 'id'>>) => void;
  removeSegment: (id: string) => void;
  moveSegment: (id: string, dir: -1 | 1) => void;

  addGas: (role: GasMix['role']) => void;
  updateGas: (id: string, patch: Partial<Omit<GasMix, 'id'>>) => void;
  removeGas: (id: string) => void;

  addGFSet: () => void;
  updateGFSet: (id: string, patch: Partial<Omit<GFSet, 'id'>>) => void;
  toggleGFSet: (id: string) => void;
  removeGFSet: (id: string) => void;

  updateEnv: (patch: Partial<EnvironmentConfig>) => void;
  setUnits: (units: Units) => void;
  setScrubTime: (t: number) => void;
};

export const useStore = create<State & Actions>((set) => ({
  segments: DEFAULT_SEGMENTS,
  gases: DEFAULT_GASES,
  gfSets: DEFAULT_GF_SETS,
  env: DEFAULT_ENVIRONMENT,
  units: 'metric',
  scrubTime: 0,

  // ── Segments ───────────────────────────────────────────────────────────────
  addSegment: () =>
    set((s) => {
      const last = s.segments[s.segments.length - 1];
      const gasId = last?.gasId ?? s.gases[0]?.id ?? 'air';
      const depth = last ? Math.max(0, Math.round(last.depth - 6)) : 30;
      return { segments: [...s.segments, { id: uid('s'), depth, time: 10, gasId }] };
    }),
  updateSegment: (id, patch) =>
    set((s) => ({
      segments: s.segments.map((seg) => (seg.id === id ? { ...seg, ...patch } : seg)),
    })),
  removeSegment: (id) =>
    set((s) => (s.segments.length <= 1 ? {} : { segments: s.segments.filter((seg) => seg.id !== id) })),
  moveSegment: (id, dir) =>
    set((s) => {
      const i = s.segments.findIndex((seg) => seg.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.segments.length) return {};
      const next = s.segments.slice();
      const a = next[i]!;
      next[i] = next[j]!;
      next[j] = a;
      return { segments: next };
    }),

  // ── Gases ──────────────────────────────────────────────────────────────────
  addGas: (role) =>
    set((s) => {
      const gas: GasMix =
        role === 'bottom'
          ? { id: uid('g'), name: 'Air', fO2: 0.21, fHe: 0, role: 'bottom' }
          : { id: uid('g'), name: 'EAN50', fO2: 0.5, fHe: 0, role: 'deco' };
      return { gases: [...s.gases, gas] };
    }),
  updateGas: (id, patch) =>
    set((s) => ({
      gases: s.gases.map((g) => {
        if (g.id !== id) return g;
        const next = { ...g, ...patch };
        // Keep the display name in sync when the mix changes.
        if (patch.fO2 !== undefined || patch.fHe !== undefined) next.name = gasLabel(next);
        return next;
      }),
    })),
  removeGas: (id) =>
    set((s) => {
      const gas = s.gases.find((g) => g.id === id);
      if (!gas) return {};
      const bottomCount = s.gases.filter((g) => g.role === 'bottom').length;
      if (gas.role === 'bottom' && bottomCount <= 1) return {}; // keep ≥1 bottom gas
      if (s.segments.some((seg) => seg.gasId === id)) return {}; // in use by a segment
      return { gases: s.gases.filter((g) => g.id !== id) };
    }),

  // ── GF sets ────────────────────────────────────────────────────────────────
  addGFSet: () =>
    set((s) =>
      s.gfSets.length >= MAX_GF_SETS
        ? {}
        : // Nameless: the label derives live from the GF pair until the user names it.
          { gfSets: [...s.gfSets, { id: uid('gf'), gfLow: 0.4, gfHigh: 0.85, enabled: true }] },
    ),
  updateGFSet: (id, patch) =>
    set((s) => ({ gfSets: s.gfSets.map((gf) => (gf.id === id ? { ...gf, ...patch } : gf)) })),
  // Show/hide a set on the graphs. Keeps ≥1 set visible (an empty stage is useless).
  toggleGFSet: (id) =>
    set((s) => {
      const target = s.gfSets.find((g) => g.id === id);
      if (!target) return {};
      const isOn = target.enabled !== false;
      const onCount = s.gfSets.filter((g) => g.enabled !== false).length;
      if (isOn && onCount <= 1) return {};
      return { gfSets: s.gfSets.map((g) => (g.id === id ? { ...g, enabled: !isOn } : g)) };
    }),
  removeGFSet: (id) =>
    set((s) => (s.gfSets.length <= 1 ? {} : { gfSets: s.gfSets.filter((gf) => gf.id !== id) })),

  // ── Environment / units ──────────────────────────────────────────────────────
  updateEnv: (patch) => set((s) => ({ env: { ...s.env, ...patch } })),
  setUnits: (units) => set({ units }),
  setScrubTime: (t) => set({ scrubTime: t }),
}));

/** Can this gas be deleted? (UI uses this to disable the control + explain why.) */
export function gasRemovable(
  gas: GasMix,
  gases: GasMix[],
  segments: DiveSegment[],
): { ok: boolean; reason?: string } {
  const bottomCount = gases.filter((g) => g.role === 'bottom').length;
  if (gas.role === 'bottom' && bottomCount <= 1) return { ok: false, reason: 'need one bottom gas' };
  if (segments.some((seg) => seg.gasId === gas.id)) return { ok: false, reason: 'in use by a segment' };
  return { ok: true };
}
