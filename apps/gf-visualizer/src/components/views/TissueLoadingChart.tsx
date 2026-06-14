// View 4 — Tissue loading over time (spec §7, priority 4). The 16 compartments as
// grouped bars; each bar is a set's current combined (N₂+He) loading as a percentage
// of that compartment's GF-adjusted M-value at the current ambient pressure. Scrub
// (the shared scrubTime) and the bars fill/drain; the controlling compartment is
// highlighted. Lets the user watch fast (left) vs slow (right) tissues on/off-gas.
//
// Standalone bar chart (reuses src/viz/scale.ts); joins the shared scrubTime but
// owns a local `hovered` compartment to inspect. A ratio, so the units toggle does
// not affect it (spec §6).
import { useState } from 'react';
import { constants, depthToPressure, gfAtDepth } from '@gf/deco-engine';
import { gfSetLabel } from '../../gfLabel';
import { useEngineResults } from '../../store/useEngineResults';
import { useStore } from '../../store/useStore';
import { assignGFColors } from '../../theme/gfColors';
import { round } from '../../util';
import { compartmentAtTime, compartmentLoadFraction, controllingAtTime } from '../../viz/loading';
import { depthAtTime } from '../../viz/profile';
import { linearScale, niceTicks } from '../../viz/scale';
import { useMeasuredWidth } from '../../viz/useMeasuredWidth';

const HEIGHT = 320;
const M = { top: 16, right: 16, bottom: 38, left: 42 };
const N = constants.COMPARTMENT_COUNT; // 16

export function TissueLoadingChart() {
  const res = useEngineResults();
  const gfSets = useStore((s) => s.gfSets);
  const env = useStore((s) => s.env);
  const scrubTime = useStore((s) => s.scrubTime);
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  if (!res.ok) {
    return <div className="viz-card viz-error">⚠ Engine error — {res.error}</div>;
  }

  const results = res.results;
  const colors = assignGFColors(gfSets);
  const gfById = new Map(gfSets.map((g) => [g.id, g]));

  // Per set: the controlling compartment and all 16 loading fractions at scrubTime.
  const sets = results.map((r) => {
    const t = Math.min(scrubTime, r.runtime);
    const depth = depthAtTime(r.profile, t);
    const pAmb = depthToPressure(depth, env);
    const gfSet = gfById.get(r.gfSetId)!;
    const gf = gfAtDepth(depth, r.firstStopDepth, gfSet.gfLow, gfSet.gfHigh);
    const controlling = controllingAtTime(r.loadingTimeline, t);
    const comps = Array.from({ length: N }, (_, c) => {
      const { pN2, pHe } = compartmentAtTime(r.loadingTimeline, c, t);
      return compartmentLoadFraction(c, pN2, pHe, pAmb, gf);
    });
    return { id: r.gfSetId, color: colors[r.gfSetId] ?? 'var(--gf-1)', controlling, comps };
  });

  const maxFrac = Math.max(1, ...sets.flatMap((s) => s.comps.map((c) => c.frac)));
  const yMax = Math.max(1.05, maxFrac * 1.02);

  const plotW = Math.max(0, width - M.left - M.right);
  const plotBottom = HEIGHT - M.bottom;
  const y = linearScale([0, yMax], [plotBottom, M.top]); // % up
  const yTicks = niceTicks(0, yMax, 5);

  const groupW = plotW / N;
  const innerPad = groupW * 0.16;
  const barsArea = groupW - innerPad * 2;
  const barW = (barsArea / sets.length) * 0.86;
  const barGap = (barsArea / sets.length) * 0.14;
  const groupX = (c: number) => M.left + c * groupW;

  // Read-out target: the hovered compartment, else the first set's controlling one.
  const focus = hovered ?? sets[0]!.controlling;

  return (
    <div className="viz-card">
      <header className="viz-head">
        <span className="viz-title">Tissue loading</span>
        <span className="viz-axis-note">% of GF M-value · fast → slow</span>
      </header>

      <div className="chart" ref={wrapRef} style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            className="chart-svg"
            width={width}
            height={HEIGHT}
            onPointerLeave={() => setHovered(null)}
          >
            {/* y gridlines + % labels */}
            <g className="grid">
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={M.left + plotW} y1={y.map(t)} y2={y.map(t)} />
                  <text className="tick-label" x={M.left - 8} y={y.map(t)} dy="0.32em" textAnchor="end">
                    {round(t * 100)}
                  </text>
                </g>
              ))}
            </g>

            {/* bars */}
            {sets.map((s, si) =>
              s.comps.map((cmp, c) => {
                const x0 = groupX(c) + innerPad + si * (barW + barGap);
                const top = y.map(Math.min(cmp.frac, yMax));
                const isCtrl = s.controlling === c;
                return (
                  <rect
                    key={`${s.id}-${c}`}
                    className={'tissue-bar' + (isCtrl ? ' tissue-bar--controlling' : '')}
                    x={x0}
                    y={top}
                    width={barW}
                    height={Math.max(0, plotBottom - top)}
                    fill={s.color}
                  />
                );
              }),
            )}

            {/* 100% GF M-value limit line */}
            <line className="tissue-limit-line" x1={M.left} x2={M.left + plotW} y1={y.map(1)} y2={y.map(1)} />
            <text className="tissue-limit-label" x={M.left + plotW} y={y.map(1) - 4} textAnchor="end">
              GF limit
            </text>

            {/* compartment hit-areas + labels */}
            {Array.from({ length: N }, (_, c) => (
              <g key={`g${c}`}>
                <rect
                  className="tissue-hit"
                  x={groupX(c)}
                  y={M.top}
                  width={groupW}
                  height={plotBottom - M.top}
                  fill="transparent"
                  onPointerMove={() => setHovered(c)}
                />
                <text
                  className={'tissue-axis-label' + (c === focus ? ' is-focus' : '')}
                  x={groupX(c) + groupW / 2}
                  y={plotBottom + 14}
                  textAnchor="middle"
                >
                  {c + 1}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="pp-readout">
        <span className="pp-readout-head">
          Compartment #{focus + 1} · {constants.HALFTIME_N2[focus]} min N₂
          {hovered === null && <span className="pp-badge">controlling</span>}
        </span>
        <div className="pp-readout-grid">
          {sets.map((s) => {
            const cmp = s.comps[focus]!;
            return (
              <div className="pp-readout-row" key={s.id}>
                <span className="dot" style={{ background: s.color }} />
                <span className="pp-readout-name">{gfSetLabel(gfById.get(s.id)!)}</span>
                <span className="tabular pp-readout-val">{round(cmp.frac * 100)}%</span>
                <span className="tabular pp-readout-grad">
                  {round(cmp.pInert, 2)} / {round(cmp.mGf, 2)} bar
                </span>
              </div>
            );
          })}
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
          <span className="legend-swatch-ctrl" />
          <span className="viz-legend-name">controlling = highlighted</span>
        </li>
      </ul>
    </div>
  );
}
