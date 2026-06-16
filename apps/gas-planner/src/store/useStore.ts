// ─────────────────────────────────────────────────────────────────────────────
// Planner state — the single shared configuration the gas model reads for every
// GF set: the exposure (segments), the gases, the cylinders, the gas parameters
// (RMVs, stress, problem time, reserve), the CCR setpoint + diluent, the GF sets,
// the environment, and the display units. Only the GF pair differs between
// results; everything else is shared (spec §5) — that invariant lives here.
//
// One coherent config serves both modes; the Mode selector flips which math runs.
// All updates are immutable so the gas-model memo (useGasResults) only recomputes
// when an input slice actually changes.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand';
import type { DiveSegment, EnvironmentConfig, GFSet, GasMix } from '@gf/deco-engine';
import { defaultShareable, type Cylinder } from '@gf/gas-model';
import { gasLabel } from '../gasLabel';
import {
  DEFAULT_CYLINDERS,
  DEFAULT_DILUENT_ID,
  DEFAULT_ENVIRONMENT,
  DEFAULT_GASES,
  DEFAULT_GF_SETS,
  DEFAULT_PARAMS,
  DEFAULT_SEGMENTS,
  DEFAULT_SETPOINT,
  MAX_GF_SETS,
  type Mode,
  type Units,
} from './defaults';

let _seq = 0;
const uid = (p: string): string => `${p}${Date.now().toString(36)}${(++_seq).toString(36)}`;

/** The mutable gas-parameter scalars (everything in GasParams except mode + ccr). */
export type ParamFields = {
  rmvSelf: number;
  rmvBuddy: number;
  rmvDeco: number;
  rmvBailout: number;
  stress: number;
  problemTime: number;
  reserveBar: number;
};

type State = {
  mode: Mode;
  segments: DiveSegment[];
  gases: GasMix[];
  cylinders: Cylinder[];
  params: ParamFields;
  setpoint: number; // CCR working setpoint, bar ppO₂
  diluentGasId: string; // CCR loop diluent (references a gas)
  gfSets: GFSet[];
  env: EnvironmentConfig;
  units: Units;
};

type Actions = {
  setMode: (mode: Mode) => void;

  addSegment: () => void;
  updateSegment: (id: string, patch: Partial<Omit<DiveSegment, 'id'>>) => void;
  removeSegment: (id: string) => void;
  moveSegment: (id: string, dir: -1 | 1) => void;

  addGas: (role: GasMix['role']) => void;
  updateGas: (id: string, patch: Partial<Omit<GasMix, 'id'>>) => void;
  removeGas: (id: string) => void;

  addCylinder: (role: Cylinder['role']) => void;
  updateCylinder: (id: string, patch: Partial<Omit<Cylinder, 'id'>>) => void;
  removeCylinder: (id: string) => void;

  setParam: <K extends keyof ParamFields>(key: K, value: number) => void;
  setSetpoint: (v: number) => void;
  setDiluent: (gasId: string) => void;

  addGFSet: () => void;
  updateGFSet: (id: string, patch: Partial<Omit<GFSet, 'id'>>) => void;
  toggleGFSet: (id: string) => void;
  removeGFSet: (id: string) => void;

  updateEnv: (patch: Partial<EnvironmentConfig>) => void;
  setUnits: (units: Units) => void;
};

export const useStore = create<State & Actions>((set) => ({
  mode: 'oc',
  segments: DEFAULT_SEGMENTS,
  gases: DEFAULT_GASES,
  cylinders: DEFAULT_CYLINDERS,
  params: { ...DEFAULT_PARAMS },
  setpoint: DEFAULT_SETPOINT,
  diluentGasId: DEFAULT_DILUENT_ID,
  gfSets: DEFAULT_GF_SETS,
  env: DEFAULT_ENVIRONMENT,
  units: 'metric',

  // ── Mode ─────────────────────────────────────────────────────────────────────
  // Toggling re-roles the deepest gas source so each mode stays internally valid:
  // OC's back gas IS the CCR bottom bailout, and vice-versa. Shareability resets to
  // the role default on conversion (back gas shareable; bailout independent, §4.8).
  setMode: (mode) =>
    set((s) => {
      if (mode === s.mode) return {};
      if (mode === 'ccr') {
        const cylinders = s.cylinders.map((c) =>
          c.role === 'backgas' ? { ...c, role: 'bottom-bailout' as const, shareable: false } : c,
        );
        const bottomBailout = cylinders.find((c) => c.role === 'bottom-bailout');
        const diluentGasId = s.gases.some((g) => g.id === s.diluentGasId)
          ? s.diluentGasId
          : bottomBailout?.gasId ?? s.gases[0]?.id ?? s.diluentGasId;
        return { mode, cylinders, diluentGasId };
      }
      const cylinders = s.cylinders.map((c) =>
        c.role === 'bottom-bailout' ? { ...c, role: 'backgas' as const, shareable: true } : c,
      );
      return { mode, cylinders };
    }),

  // ── Segments ───────────────────────────────────────────────────────────────
  addSegment: () =>
    set((s) => {
      const last = s.segments[s.segments.length - 1];
      const gasId = last?.gasId ?? s.gases[0]?.id ?? 'air';
      const depth = last ? Math.max(0, Math.round(last.depth - 6)) : 30;
      return { segments: [...s.segments, { id: uid('s'), depth, time: 10, gasId }] };
    }),
  updateSegment: (id, patch) =>
    set((s) => ({ segments: s.segments.map((seg) => (seg.id === id ? { ...seg, ...patch } : seg)) })),
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
        if (patch.fO2 !== undefined || patch.fHe !== undefined) next.name = gasLabel(next);
        return next;
      }),
    })),
  removeGas: (id) =>
    set((s) => {
      const rm = gasRemovable(id, s.gases, s.segments, s.cylinders, s.diluentGasId);
      return rm.ok ? { gases: s.gases.filter((g) => g.id !== id) } : {};
    }),

  // ── Cylinders ────────────────────────────────────────────────────────────────
  addCylinder: (role) =>
    set((s) => {
      // Prefer a gas matching the new cylinder's job: deco bottle → a deco gas.
      const preferred =
        role === 'deco-bailout'
          ? s.gases.find((g) => g.role === 'deco') ?? s.gases[0]
          : s.gases.find((g) => g.role === 'bottom') ?? s.gases[0];
      const gasId = preferred?.id ?? s.gases[0]?.id ?? 'air';
      const cyl: Cylinder = {
        id: uid('c'),
        gasId,
        volume: role === 'backgas' ? 24 : 11,
        fillPressure: role === 'backgas' ? 232 : 200,
        role,
        shareable: defaultShareable(role),
      };
      return { cylinders: [...s.cylinders, cyl] };
    }),
  updateCylinder: (id, patch) =>
    set((s) => ({
      cylinders: s.cylinders.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        // Role drives the shareability default; changing role resets it unless the
        // same patch also sets shareable explicitly (spec §4.8 — defaulted from role).
        if (patch.role !== undefined && patch.shareable === undefined) {
          next.shareable = defaultShareable(patch.role);
        }
        return next;
      }),
    })),
  removeCylinder: (id) =>
    set((s) => (s.cylinders.length <= 1 ? {} : { cylinders: s.cylinders.filter((c) => c.id !== id) })),

  // ── Gas parameters ───────────────────────────────────────────────────────────
  setParam: (key, value) => set((s) => ({ params: { ...s.params, [key]: value } })),
  setSetpoint: (v) => set({ setpoint: v }),
  setDiluent: (gasId) => set({ diluentGasId: gasId }),

  // ── GF sets ────────────────────────────────────────────────────────────────
  addGFSet: () =>
    set((s) =>
      s.gfSets.length >= MAX_GF_SETS
        ? {}
        : { gfSets: [...s.gfSets, { id: uid('gf'), gfLow: 0.4, gfHigh: 0.85, enabled: true }] },
    ),
  updateGFSet: (id, patch) =>
    set((s) => ({ gfSets: s.gfSets.map((gf) => (gf.id === id ? { ...gf, ...patch } : gf)) })),
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
}));

/** Can this gas be deleted? Used to disable the control and explain why: a gas
 *  in use by a segment, a cylinder, or the CCR diluent can't be removed, and at
 *  least one bottom gas must remain. */
export function gasRemovable(
  id: string,
  gases: GasMix[],
  segments: DiveSegment[],
  cylinders: Cylinder[],
  diluentGasId: string,
): { ok: boolean; reason?: string } {
  const gas = gases.find((g) => g.id === id);
  if (!gas) return { ok: false };
  const bottomCount = gases.filter((g) => g.role === 'bottom').length;
  if (gas.role === 'bottom' && bottomCount <= 1) return { ok: false, reason: 'Keep at least one bottom gas' };
  if (cylinders.some((c) => c.gasId === id)) return { ok: false, reason: 'Used by a cylinder — remove that cylinder first' };
  if (segments.some((seg) => seg.gasId === id)) return { ok: false, reason: 'Used by an exposure leg — change it first' };
  if (diluentGasId === id) return { ok: false, reason: 'Set as the loop diluent — change the diluent first' };
  return { ok: true };
}
