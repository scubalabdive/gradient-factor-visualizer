// Shared chart frame for the depth-vs-time views (View 1 deco profile, View 2
// ceiling). Owns everything the two views must keep identical — depth-downward Y
// axis, time X axis, faint gridlines, width measuring, the hover cursor + state,
// the floating-readout container, and the card/legend shell — so the views can be
// thin and the axes stay pixel-identical (spec §10: one visual language).
//
// View-specific bits arrive as three render props, each given one `ChartCtx`:
//   renderPlot   → SVG curves + the marker, drawn inside the plot area
//   renderReadout→ HTML rows for the floating read-out
//   renderLegend → HTML <li>s for the legend
// The cursor + read-out track the SHARED scrubTime (spec §9), held persistently;
// moving the pointer over the chart scrubs that single current-time for all views.
import { useRef, type ReactNode } from 'react';
import type { GFResult, GFSet } from '@gf/deco-engine';
import type { Units } from '../../store/defaults';
import { useEngineResults } from '../../store/useEngineResults';
import { useStore } from '../../store/useStore';
import { assignGFColors } from '../../theme/gfColors';
import { depthToDisplay, depthUnitLabel } from '../../units';
import { linearScale, niceTicks, type Scale } from '../../viz/scale';
import { useMeasuredWidth } from '../../viz/useMeasuredWidth';

const HEIGHT = 440;
const M = { top: 18, right: 18, bottom: 34, left: 46 }; // plot margins

export type ChartCtx = {
  results: GFResult[];
  gfSets: GFSet[];
  colors: Record<string, string>;
  units: Units;
  du: string;
  toDisp: (m: number) => number;
  x: Scale; // time (min) → px
  y: Scale; // display depth → px (downward)
  plotW: number;
  time: number; // shared current-time (min), clamped to this chart's range
};

type Props = {
  title: string;
  renderPlot: (ctx: ChartCtx) => ReactNode;
  renderReadout: (ctx: ChartCtx) => ReactNode;
  renderLegend: (ctx: ChartCtx) => ReactNode;
};

export function TimeDepthChart({ title, renderPlot, renderReadout, renderLegend }: Props) {
  const res = useEngineResults();
  const gfSets = useStore((s) => s.gfSets);
  const units = useStore((s) => s.units);
  const scrubTime = useStore((s) => s.scrubTime);
  const setScrubTime = useStore((s) => s.setScrubTime);
  const [wrapRef, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!res.ok) {
    return <div className="viz-card viz-error">⚠ Engine error — {res.error}</div>;
  }

  const results = res.results;
  const colors = assignGFColors(gfSets);
  const du = depthUnitLabel(units);
  const toDisp = (m: number) => depthToDisplay(m, units);

  // Domain from the actual depth profile (deepest series, so ceilings fit too).
  const maxTime = Math.max(1, ...results.map((r) => r.profile.at(-1)?.time ?? 0));
  const maxDepthM = Math.max(1, ...results.flatMap((r) => r.profile.map((p) => p.depth)));
  const maxDepthDisp = toDisp(maxDepthM);

  const plotW = Math.max(0, width - M.left - M.right);
  const x = linearScale([0, maxTime], [M.left, M.left + plotW]);
  const y = linearScale([0, maxDepthDisp], [M.top, HEIGHT - M.bottom]); // depth downward

  const xTicks = niceTicks(0, maxTime, 8);
  const yTicks = niceTicks(0, maxDepthDisp, 6);

  // The shared current-time, clamped to what this chart can show.
  const time = Math.min(maxTime, Math.max(0, scrubTime));
  const ctx: ChartCtx = { results, gfSets, colors, units, du, toDisp, x, y, plotW, time };

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    if (px < M.left || px > M.left + plotW) return;
    setScrubTime(Math.min(maxTime, Math.max(0, x.invert(px))));
  };

  const cursorX = x.map(time);
  const flip = cursorX > M.left + plotW * 0.62; // keep the read-out on-canvas

  return (
    <div className="viz-card">
      <header className="viz-head">
        <span className="viz-title">{title}</span>
        <span className="viz-axis-note">depth ({du}) · runtime (min)</span>
      </header>

      <div className="chart" ref={wrapRef} style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg
            ref={svgRef}
            className="chart-svg"
            width={width}
            height={HEIGHT}
            onPointerMove={onMove}
          >
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

            {renderPlot(ctx)}

            <line
              className="cursor-line"
              x1={cursorX}
              x2={cursorX}
              y1={M.top}
              y2={HEIGHT - M.bottom}
              pointerEvents="none"
            />
          </svg>
        )}

        {width > 0 && (
          <div className={'chart-readout' + (flip ? ' is-flipped' : '')} style={{ left: cursorX }}>
            {renderReadout(ctx)}
          </div>
        )}
      </div>

      <ul className="viz-legend">{renderLegend(ctx)}</ul>
    </div>
  );
}
