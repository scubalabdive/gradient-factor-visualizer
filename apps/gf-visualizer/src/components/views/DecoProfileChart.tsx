// View 1 — Deco profile comparison (spec §7, priority 1). Depth (Y, downward) vs
// runtime (X), up to 3 GF-set curves overlaid on shared axes. The descent + bottom
// phase is identical across sets; the curves diverge only on ascent, with stops as
// horizontal plateaus. Deco-gas switches show as labelled depth lines + a per-curve
// marker where each set reaches the switch. Hover reads out depth, runtime and stop.
//
// All the axis/grid/hover scaffolding lives in TimeDepthChart; this view supplies
// the curves, markers, read-out rows and legend.
import type { GFResult } from '@gf/deco-engine';
import { gfSetLabel } from '../../gfLabel';
import { useStore } from '../../store/useStore';
import { round } from '../../util';
import { gasPlan } from '../../viz/gasPlan';
import { firstStopArrivalTime } from '../../viz/loading';
import { currentStopAtTime, depthAtTime } from '../../viz/profile';
import { TimeDepthChart, type ChartCtx } from './TimeDepthChart';

const pathFor = (r: GFResult, c: ChartCtx) =>
  r.profile
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${c.x.map(p.time)},${c.y.map(c.toDisp(p.depth))}`)
    .join('');

export function DecoProfileChart() {
  const gases = useStore((s) => s.gases);
  const env = useStore((s) => s.env);

  return (
    <TimeDepthChart
      title="Deco profile"
      renderPlot={(c) => {
        const maxDepth = Math.max(1, ...c.results.flatMap((r) => r.profile.map((p) => p.depth)));
        // OC deco-gas switches only; CCR holds a single diluent (no switch lines).
        const switches = env.mode === 'oc' ? gasPlan(gases, env, maxDepth).switches : [];
        const xL = c.x.map(c.x.domain[0]);
        const xR = c.x.map(c.x.domain[1]);
        return (
          <>
            {/* gas-switch depth lines (behind the curves) */}
            {switches.map((sw) => {
              const yy = c.y.map(c.toDisp(sw.depth));
              return (
                <g key={`gs-${sw.gas.id}-${sw.depth}`} pointerEvents="none">
                  <line className="gas-switch-line" x1={xL} x2={xR} y1={yy} y2={yy} />
                  <text className="gas-switch-label" x={xR - 5} y={yy - 4} textAnchor="end">
                    {sw.gas.name} · {round(c.toDisp(sw.depth))} {c.du}
                  </text>
                </g>
              );
            })}

            {/* GF-set curves */}
            {c.results.map((r) => (
              <path
                key={r.gfSetId}
                className="profile-curve"
                d={pathFor(r, c)}
                fill="none"
                stroke={c.colors[r.gfSetId] ?? 'var(--gf-1)'}
              />
            ))}

            {/* gas-switch markers: where each set actually switches */}
            {c.results.flatMap((r) =>
              switches.map((sw) => {
                const t = firstStopArrivalTime(r.profile, sw.depth);
                const cx = c.x.map(t);
                const cy = c.y.map(c.toDisp(sw.depth));
                return (
                  <path
                    key={`m-${r.gfSetId}-${sw.gas.id}-${sw.depth}`}
                    className="gas-switch-marker"
                    d={`M${cx},${cy - 4} L${cx + 4},${cy} L${cx},${cy + 4} L${cx - 4},${cy} Z`}
                    fill={c.colors[r.gfSetId] ?? 'var(--gf-1)'}
                  />
                );
              }),
            )}

            {/* hover cursor markers */}
            {c.results.map((r) => (
              <circle
                key={r.gfSetId}
                className="hover-dot"
                r={3.5}
                cx={c.x.map(c.time)}
                cy={c.y.map(c.toDisp(depthAtTime(r.profile, c.time)))}
                fill={c.colors[r.gfSetId] ?? 'var(--gf-1)'}
              />
            ))}
          </>
        );
      }}
      renderReadout={(c) => {
        const t = c.time;
        return (
          <>
            <div className="chart-readout-time tabular">{round(t, 1)} min</div>
            {c.results.map((r) => {
              const stop = currentStopAtTime(r.profile, r.stops, t);
              return (
                <div className="chart-readout-row" key={r.gfSetId}>
                  <span className="dot" style={{ background: c.colors[r.gfSetId] ?? 'var(--gf-1)' }} />
                  <span className="chart-readout-name">
                    {gfSetLabel(c.gfSets.find((g) => g.id === r.gfSetId)!)}
                  </span>
                  <span className="tabular chart-readout-depth">
                    {round(c.toDisp(depthAtTime(r.profile, t)))} {c.du}
                  </span>
                  <span className="chart-readout-stop">
                    {stop ? `@${round(c.toDisp(stop.depth))} ${c.du}` : '—'}
                  </span>
                </div>
              );
            })}
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
              {' · '}deco {round(r.totalDecoTime)} min
              {' · '}TTS {round(r.tts, 1)} min
            </span>
          </li>
        ))
      }
    />
  );
}
