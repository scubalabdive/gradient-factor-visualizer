// View 2 — Ceiling over time (spec §7, priority 2). The GF-adjusted ceiling depth
// per set (bold, set colour) over runtime, with that set's actual depth profile
// drawn faintly behind for reference. Makes visible how a lower GF Low deepens the
// early ceiling and GF High governs the shallow portion.
//
// Shares the depth-vs-time axes/grid/hover with View 1 via TimeDepthChart; this
// view only supplies the curves, markers, read-out and legend.
import type { GFResult } from '@gf/deco-engine';
import { gfSetLabel } from '../../gfLabel';
import { round } from '../../util';
import { ceilingAtTime, depthAtTime } from '../../viz/profile';
import { TimeDepthChart, type ChartCtx } from './TimeDepthChart';

const ceilingPath = (r: GFResult, c: ChartCtx) =>
  r.ceilingTimeline
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${c.x.map(p.time)},${c.y.map(c.toDisp(p.ceiling))}`)
    .join('');

const depthPath = (r: GFResult, c: ChartCtx) =>
  r.profile
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${c.x.map(p.time)},${c.y.map(c.toDisp(p.depth))}`)
    .join('');

export function CeilingChart() {
  return (
    <TimeDepthChart
      title="Ceiling over time"
      renderPlot={(c) => (
        <>
          {/* faint actual-depth reference per set, drawn behind */}
          {c.results.map((r) => (
            <path
              key={`ref-${r.gfSetId}`}
              className="depth-ref"
              d={depthPath(r, c)}
              fill="none"
              stroke={c.colors[r.gfSetId] ?? 'var(--gf-1)'}
            />
          ))}
          {/* bold ceiling per set, on top */}
          {c.results.map((r) => (
            <path
              key={`ceil-${r.gfSetId}`}
              className="ceiling-curve"
              d={ceilingPath(r, c)}
              fill="none"
              stroke={c.colors[r.gfSetId] ?? 'var(--gf-1)'}
            />
          ))}
          {c.results.map((r) => (
            <circle
              key={`dot-${r.gfSetId}`}
              className="hover-dot"
              r={3.5}
              cx={c.x.map(c.time)}
              cy={c.y.map(c.toDisp(ceilingAtTime(r.ceilingTimeline, c.time)))}
              fill={c.colors[r.gfSetId] ?? 'var(--gf-1)'}
            />
          ))}
        </>
      )}
      renderReadout={(c) => {
        const t = c.time;
        return (
          <>
            <div className="chart-readout-time tabular">
              {round(t, 1)} min<span className="chart-readout-key"> ceiling · ↓actual</span>
            </div>
            {c.results.map((r) => (
              <div className="chart-readout-row" key={r.gfSetId}>
                <span className="dot" style={{ background: c.colors[r.gfSetId] ?? 'var(--gf-1)' }} />
                <span className="chart-readout-name">
                  {gfSetLabel(c.gfSets.find((g) => g.id === r.gfSetId)!)}
                </span>
                <span className="tabular chart-readout-depth">
                  {round(c.toDisp(ceilingAtTime(r.ceilingTimeline, t)))} {c.du}
                </span>
                <span className="tabular chart-readout-stop">
                  ↓{round(c.toDisp(depthAtTime(r.profile, t)))} {c.du}
                </span>
              </div>
            ))}
          </>
        );
      }}
      renderLegend={(c) =>
        c.results.map((r) => (
          <li className="viz-legend-item" key={r.gfSetId}>
            <span className="dot" style={{ background: c.colors[r.gfSetId] ?? 'var(--gf-1)' }} />
            <span className="viz-legend-name">{gfSetLabel(c.gfSets.find((g) => g.id === r.gfSetId)!)}</span>
            <span className="viz-legend-metrics tabular">
              first {r.firstStopDepth > 0 ? `${round(c.toDisp(r.firstStopDepth))} ${c.du}` : 'none'}
            </span>
          </li>
        ))
      }
    />
  );
}
