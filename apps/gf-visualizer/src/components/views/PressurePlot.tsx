// View 3 — GF / M-value pressure plot (spec §7, the showpiece). Compartment
// inert-gas pressure (Y, bar, up) vs ambient pressure (X, bar). Draws the ambient
// line (y = x), the raw M-value line for the selected compartment, and a GF-adjusted
// LIMIT line per set; overlays each set's trajectory of the selected/controlling
// compartment with a marker at the shared scrubTime. Dragging a GF slider pivots a
// set's limit line live — the single most important "aha" in the app.
//
// Standalone (pressure-vs-pressure axes, not the depth/time TimeDepthChart frame),
// but reuses src/viz/scale.ts. Axes are in bar, so the metric/imperial toggle does
// not affect this view (spec §6 — only depths convert).
import { useState } from 'react';
import {
  combinedAB,
  constants,
  depthToPressure,
  gfAtDepth,
  mValue,
  mValueGF,
  pressureToDepth,
} from '@gf/deco-engine';
import { gfSetLabel } from '../../gfLabel';
import { useEngineResults } from '../../store/useEngineResults';
import { useStore } from '../../store/useStore';
import { assignGFColors } from '../../theme/gfColors';
import { round } from '../../util';
import { compartmentAtTime, controllingAtTime } from '../../viz/loading';
import { depthAtTime } from '../../viz/profile';
import { linearScale, niceTicks } from '../../viz/scale';
import { useMeasuredWidth } from '../../viz/useMeasuredWidth';

const HEIGHT = 460;
const M = { top: 18, right: 20, bottom: 38, left: 54 };
const STEPS = 48; // x-samples for the (curved) operative GF limit line
const N = constants.COMPARTMENT_COUNT;

type Pt = { x: number; y: number };
const inert = (p: { pN2: number; pHe: number }) => p.pN2 + p.pHe;

export function PressurePlot() {
  const res = useEngineResults();
  const gfSets = useStore((s) => s.gfSets);
  const env = useStore((s) => s.env);
  const scrubTime = useStore((s) => s.scrubTime);
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<'auto' | number>('auto');

  if (!res.ok) {
    return <div className="viz-card viz-error">⚠ Engine error — {res.error}</div>;
  }

  const results = res.results;
  const colors = assignGFColors(gfSets);
  const gfById = new Map(gfSets.map((g) => [g.id, g]));

  // Active compartment: the one controlling at the current time (auto), else the
  // user's pick. Auto follows the leading tissue as you scrub.
  const c =
    selected === 'auto' ? controllingAtTime(results[0]!.loadingTimeline, scrubTime) : selected;

  // M-value basis: compartment c's combined a/b from the first set's loading now.
  const basis = compartmentAtTime(results[0]!.loadingTimeline, c, scrubTime);
  const { a, b } = combinedAB(c, basis.pN2, basis.pHe);

  // Trajectories (P_amb, P_inert) per set — profile & loadingTimeline share indices.
  const trajectories = results.map((r) => ({
    id: r.gfSetId,
    pts: r.profile.map((p, i): Pt => {
      const comp = r.loadingTimeline[i]!.compartments[c]!;
      return { x: depthToPressure(p.depth, env), y: comp.pN2 + comp.pHe };
    }),
  }));

  // Per-set marker + read-out at the shared time (clamped to each set's runtime).
  const markers = results.map((r) => {
    const t = Math.min(scrubTime, r.runtime);
    const pAmb = depthToPressure(depthAtTime(r.profile, t), env);
    const pInert = inert(compartmentAtTime(r.loadingTimeline, c, t));
    const m = mValue(a, b, pAmb);
    const grad = m > pAmb ? (pInert - pAmb) / (m - pAmb) : 0; // fraction of the M-value gap used
    return { r, pAmb, pInert, grad };
  });

  // Domains. X = ambient pressure (surface → deepest). Y spans the lines + tracks.
  const surfaceP = env.surfacePressure;
  const maxDepthM = Math.max(1, ...results.flatMap((r) => r.profile.map((p) => p.depth)));
  const xMin = surfaceP;
  const xMax = depthToPressure(maxDepthM, env);
  const yCand = [
    xMin,
    xMax,
    mValue(a, b, xMin),
    mValue(a, b, xMax),
    ...trajectories.flatMap((tr) => tr.pts.map((p) => p.y)),
  ];
  let yMin = Math.min(...yCand);
  let yMax = Math.max(...yCand);
  const pad = (yMax - yMin) * 0.06 || 0.1;
  yMin -= pad;
  yMax += pad;

  const plotW = Math.max(0, width - M.left - M.right);
  const x = linearScale([xMin, xMax], [M.left, M.left + plotW]);
  const y = linearScale([yMin, yMax], [HEIGHT - M.bottom, M.top]); // pressure UP

  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yMin, yMax, 6);

  const line = (pts: Pt[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x.map(p.x)},${y.map(p.y)}`).join('');

  const gfLimit = (r: (typeof results)[number]) => {
    const gf = gfById.get(r.gfSetId)!;
    const pts: Pt[] = [];
    for (let k = 0; k <= STEPS; k++) {
      const xx = xMin + ((xMax - xMin) * k) / STEPS;
      const g = gfAtDepth(pressureToDepth(xx, env), r.firstStopDepth, gf.gfLow, gf.gfHigh);
      pts.push({ x: xx, y: mValueGF(a, b, xx, g) });
    }
    return line(pts);
  };

  const half = constants.HALFTIME_N2[c];

  return (
    <div className="viz-card">
      <header className="viz-head">
        <span className="viz-title">GF / M-value pressure plot</span>
        <div className="pp-head-right">
          <span className="viz-axis-note">inert (bar) · ambient (bar)</span>
          <select
            className="pp-select"
            aria-label="Compartment"
            value={selected === 'auto' ? 'auto' : String(selected)}
            onChange={(e) => setSelected(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
          >
            <option value="auto">Controlling (auto)</option>
            {Array.from({ length: N }, (_, i) => (
              <option key={i} value={i}>
                #{i + 1} · {constants.HALFTIME_N2[i]} min
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="chart" ref={wrapRef} style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg className="chart-svg pp-svg" width={width} height={HEIGHT}>
            <g className="grid">
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={M.left} x2={M.left + plotW} y1={y.map(t)} y2={y.map(t)} />
                  <text className="tick-label" x={M.left - 8} y={y.map(t)} dy="0.32em" textAnchor="end">
                    {t}
                  </text>
                </g>
              ))}
              {xTicks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={x.map(t)} x2={x.map(t)} y1={M.top} y2={HEIGHT - M.bottom} />
                  <text className="tick-label" x={x.map(t)} y={HEIGHT - M.bottom + 16} textAnchor="middle">
                    {t}
                  </text>
                </g>
              ))}
            </g>

            {/* reference lines */}
            <path className="ambient-line" d={line([{ x: xMin, y: xMin }, { x: xMax, y: xMax }])} fill="none" />
            <path
              className="mvalue-line"
              d={line([{ x: xMin, y: mValue(a, b, xMin) }, { x: xMax, y: mValue(a, b, xMax) }])}
              fill="none"
            />

            {/* per-set operative GF limit + trajectory */}
            {results.map((r) => (
              <path
                key={`gf-${r.gfSetId}`}
                className="gf-limit"
                d={gfLimit(r)}
                fill="none"
                stroke={colors[r.gfSetId] ?? 'var(--gf-1)'}
              />
            ))}
            {trajectories.map((tr) => (
              <path
                key={`tr-${tr.id}`}
                className="trajectory"
                d={line(tr.pts)}
                fill="none"
                stroke={colors[tr.id] ?? 'var(--gf-1)'}
              />
            ))}

            {/* markers at the shared time */}
            {markers.map((mk) => (
              <circle
                key={`mk-${mk.r.gfSetId}`}
                className="traj-marker"
                r={4}
                cx={x.map(mk.pAmb)}
                cy={y.map(mk.pInert)}
                fill={colors[mk.r.gfSetId] ?? 'var(--gf-1)'}
              />
            ))}
          </svg>
        )}
      </div>

      <div className="pp-readout">
        <span className="pp-readout-head">
          Compartment #{c + 1} · {half} min N₂{selected === 'auto' && <span className="pp-badge">controlling</span>}
        </span>
        <div className="pp-readout-grid">
          {markers.map((mk) => (
            <div className="pp-readout-row" key={mk.r.gfSetId}>
              <span className="dot" style={{ background: colors[mk.r.gfSetId] ?? 'var(--gf-1)' }} />
              <span className="pp-readout-name">{gfSetLabel(gfById.get(mk.r.gfSetId)!)}</span>
              <span className="tabular pp-readout-val">{round(mk.pInert, 2)} bar</span>
              <span className="tabular pp-readout-grad">{round(mk.grad * 100)}% of M</span>
            </div>
          ))}
        </div>
      </div>

      <ul className="viz-legend">
        {results.map((r) => (
          <li className="viz-legend-item" key={r.gfSetId}>
            <span className="dot" style={{ background: colors[r.gfSetId] ?? 'var(--gf-1)' }} />
            <span className="viz-legend-name">{gfSetLabel(gfById.get(r.gfSetId)!)}</span>
          </li>
        ))}
        <li className="viz-legend-item">
          <span className="legend-rule legend-rule--mvalue" />
          <span className="viz-legend-name">M-value</span>
        </li>
        <li className="viz-legend-item">
          <span className="legend-rule legend-rule--ambient" />
          <span className="viz-legend-name">ambient</span>
        </li>
      </ul>
    </div>
  );
}
