// The two-ceilings readout (spec §7) — a compact, instrument-grade panel per GF
// set: the gas ceiling (bar) and the time ceiling (OC bailout TTS, min) large and
// unambiguous, the per-cylinder required/available/reserve/margin table with the
// binding cylinder marked, the schedule the figures were computed from (auditable,
// not a black box), and every assumption inline. No GO/NO-GO verdict — margins and
// ceilings framed as information (spec §8).
import { computeMinGas, scheduleForGFSet } from '@gf/gas-model';
import type { BailoutResult } from '@gf/deco-engine';
import type { Cylinder, GasModelInput, GasResult } from '@gf/gas-model';
import type { GFSet, GasMix } from '@gf/deco-engine';
import { gfSetLabel } from '../gfLabel';
import { useGasResults } from '../store/useGasResults';
import { useStore } from '../store/useStore';
import { assignGFColors } from '../theme/gfColors';
import { depthToDisplay, depthUnitLabel } from '../units';
import { round } from '../util';

const ROLE_LABEL: Record<Cylinder['role'], string> = {
  backgas: 'Back gas',
  'bottom-bailout': 'Bottom',
  'deco-bailout': 'Deco',
};

export function Readout() {
  const res = useGasResults();
  const units = useStore((s) => s.units);
  const mode = useStore((s) => s.mode);
  const params = useStore((s) => s.params);
  const gfSets = useStore((s) => s.gfSets);

  if (!res.ok) {
    return (
      <div className="viz-card viz-error">
        ⚠ Can’t compute — {res.error}. Check the gases, cylinders, and exposure.
      </div>
    );
  }

  const { results, input } = res;
  const isCCR = mode === 'ccr';
  const colors = assignGFColors(gfSets);
  const setById = new Map(gfSets.map((g) => [g.id, g]));
  const du = depthUnitLabel(units);
  const depthFmt = (m: number) => `${round(depthToDisplay(m, units))} ${du}`;
  const bottomDepth = Math.max(...input.segments.map((s) => s.depth));

  return (
    <>
      <div className="rule-banner">
        <span className="rule-badge">In-water rule</span>
        <p>
          Monitor available gas and TTS — the dive ends when{' '}
          <strong>either ceiling is reached, whichever comes first</strong>. Both ceilings are
          computed for the target depth (<span className="tabular">{depthFmt(bottomDepth)}</span>);
          drift significantly deeper and both are invalid — recompute.
        </p>
      </div>

      <div className="readout-grid">
        {results.map((r) => {
          const gfSet = setById.get(r.gfSetId);
          if (!gfSet) return null;
          return (
            <GFSetReadout
              key={r.gfSetId}
              result={r}
              gfSet={gfSet}
              color={colors[r.gfSetId] ?? 'var(--gf-1)'}
              input={input}
              isCCR={isCCR}
              params={params}
              depthFmt={depthFmt}
            />
          );
        })}
      </div>
    </>
  );
}

function GFSetReadout(props: {
  result: GasResult;
  gfSet: GFSet;
  color: string;
  input: GasModelInput;
  isCCR: boolean;
  params: { rmvSelf: number; rmvBuddy: number; rmvDeco: number; rmvBailout: number; stress: number; problemTime: number; reserveBar: number };
  depthFmt: (m: number) => string;
}) {
  const { result: r, gfSet, color, input, isCCR, params, depthFmt } = props;
  const gasById = new Map<string, GasMix>(input.gases.map((g) => [g.id, g]));
  const cylById = new Map<string, Cylinder>(input.cylinders.map((c) => [c.id, c]));

  let sched: BailoutResult | null = null;
  try {
    sched = scheduleForGFSet(input, gfSet);
  } catch {
    sched = null;
  }

  // OC headline gas ceiling = minimum gas; surface its derivation so the bar figure
  // is auditable (the deco/time figures are backed by the ascent schedule below).
  const minGas = !isCCR ? safeMinGas(input) : null;

  return (
    <section className="readout-card" style={{ borderTopColor: color }}>
      <header className="readout-head">
        <span className="dot" style={{ background: color, color }} />
        <span className="readout-title">{gfSetLabel(gfSet)}</span>
        <span className="readout-gf tabular">
          GF {round(gfSet.gfLow * 100)}/{round(gfSet.gfHigh * 100)}
        </span>
      </header>

      <div className="ceilings">
        <div className="ceiling">
          <span className="ceiling-val tabular">
            {Number.isFinite(r.gasCeilingBar) ? round(r.gasCeilingBar) : '—'}
            <span className="ceiling-unit">bar</span>
          </span>
          <span className="ceiling-label">Gas ceiling</span>
          <span className="ceiling-sub">
            {isCCR ? 'bailout reserve · binding cylinder' : 'minimum gas · to first switch'}
          </span>
        </div>
        <div className="ceiling">
          <span className="ceiling-val tabular">
            {round(r.timeCeilingTts, 1)}
            <span className="ceiling-unit">min</span>
          </span>
          <span className="ceiling-label">Time ceiling</span>
          <span className="ceiling-sub tabular">
            max OC {isCCR ? 'bailout' : 'ascent'} TTS · now {round(r.bailoutTts, 1)} min
          </span>
        </div>
      </div>

      <table className="cyl-table">
        <thead>
          <tr>
            <th scope="col">Cylinder</th>
            <th scope="col">Req</th>
            <th scope="col">Avail</th>
            <th scope="col">Reserve</th>
            <th scope="col">Margin</th>
          </tr>
        </thead>
        <tbody>
          {r.perCylinder.map((cr) => {
            const cyl = cylById.get(cr.cylinderId);
            const gas = cyl ? gasById.get(cyl.gasId) : undefined;
            const ok = cr.marginLitres >= 0;
            return (
              <tr key={cr.cylinderId} className={cr.binding ? 'is-binding' : undefined}>
                <th scope="row">
                  <span className="cyl-gas-name">{gas?.name ?? '—'}</span>
                  <span className="cyl-role">
                    {cyl ? ROLE_LABEL[cyl.role] : ''}
                    {cyl && cyl.shareable ? ' · team' : ''}
                  </span>
                  {cr.binding && <span className="binding-tag">binding</span>}
                </th>
                <td className="tabular">{round(cr.requiredLitres)}</td>
                <td className="tabular">{round(cr.availableLitres)}</td>
                <td className="tabular">{round(cr.reserveLitres)}</td>
                <td className={'tabular ' + (ok ? 'margin-ok' : 'margin-low')}>
                  {ok ? '+' : ''}
                  {round(cr.marginLitres)} L
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {minGas && (
        <p className="derivation tabular">
          min gas = {round(minGas.combinedRmv)} L/min × {params.stress} ×&nbsp;
          ({params.problemTime} min @ {depthFmt(minGas.bottomDepth)} + ascent to{' '}
          {depthFmt(minGas.firstSwitchDepth)}) = {round(minGas.eventLitres)} L ÷{' '}
          {round(minGas.vBackgasLitres)} L = {round(r.gasCeilingBar)} bar
        </p>
      )}

      <div className="schedule">
        <div className="schedule-head">
          <span className="schedule-title">{isCCR ? 'OC bailout schedule' : 'OC ascent schedule'}</span>
          {sched && (
            <span className="schedule-meta tabular">
              first stop {sched.firstStopDepth > 0 ? depthFmt(sched.firstStopDepth) : 'none'} · deco{' '}
              {round(sched.totalDecoTime)} min
            </span>
          )}
        </div>
        {sched && sched.stops.length > 0 ? (
          <ul className="schedule-stops">
            {sched.stops.map((s, i) => {
              const gas = gasById.get(stopGasId(sched!, s.depth));
              return (
                <li key={i}>
                  <span className="stop-depth tabular">{depthFmt(s.depth)}</span>
                  <span className="stop-arrow">→</span>
                  <span className="stop-min tabular">{s.duration} min</span>
                  {gas && <span className="stop-gas">{gas.name}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="schedule-none">no decompression stops</span>
        )}
      </div>

      <p className="assumptions">
        {isCCR
          ? `bailout RMV ${params.rmvBailout} L/min · problem ${params.problemTime} min · reserve ${params.reserveBar} bar/cyl`
          : `RMV self ${params.rmvSelf} / buddy ${params.rmvBuddy} / deco ${params.rmvDeco} L/min · stress ×${params.stress} · reserve ${params.reserveBar} bar/cyl`}
      </p>
    </section>
  );
}

/** Which gas a stop at depth `d` is breathed on, from the schedule's leg breakdown. */
function stopGasId(sched: BailoutResult, depth: number): string {
  const leg = sched.segments.find(
    (s) => s.kind === 'stop' && Math.abs(s.depthFrom - depth) < 0.05,
  );
  return leg?.gasId ?? '';
}

function safeMinGas(input: Parameters<typeof computeMinGas>[0]) {
  try {
    return computeMinGas(input);
  } catch {
    return null;
  }
}
