// Outputs table (spec §8) — a compact, one-column-per-GF-set readout beside the
// graphs: first stop, total decompression time, time-to-surface, runtime, and the
// full stop schedule. Figures are tabular/monospace so the columns align like an
// instrument. Reads the same GFResult[] the chart does; surfaces an engine error
// instead of crashing on a half-edited input.
import { gfSetLabel } from '../gfLabel';
import { useEngineResults } from '../store/useEngineResults';
import { useStore } from '../store/useStore';
import { assignGFColors } from '../theme/gfColors';
import { depthToDisplay, depthUnitLabel } from '../units';
import { round } from '../util';
import { gasPlan } from '../viz/gasPlan';

export function OutputsTable() {
  const gfSets = useStore((s) => s.gfSets);
  const units = useStore((s) => s.units);
  const gases = useStore((s) => s.gases);
  const segments = useStore((s) => s.segments);
  const env = useStore((s) => s.env);
  const res = useEngineResults();

  if (!res.ok) {
    return <div className="viz-card viz-error">⚠ Engine error — {res.error}</div>;
  }

  const results = res.results;
  const colors = assignGFColors(gfSets);
  const du = depthUnitLabel(units);
  const depth = (m: number) => `${round(depthToDisplay(m, units))} ${du}`;
  const setById = new Map(gfSets.map((g) => [g.id, g]));
  const isCCR = env.mode === 'ccr';

  // OC: the deco-gas switch plan (switch depths are depth-based, shared across sets).
  // CCR: the loop diluent (the gas of the last segment) + the setpoint pair.
  const maxDepth = Math.max(1, ...results.flatMap((r) => r.profile.map((p) => p.depth)));
  const plan = isCCR ? null : gasPlan(gases, env, maxDepth);
  const switchAt = (m: number) => plan?.switches.find((sw) => Math.abs(sw.depth - m) < 0.05);
  const diluent = gases.find((g) => g.id === segments[segments.length - 1]?.gasId);

  return (
    <div className="viz-card">
      <header className="viz-head">
        <span className="viz-title">Outputs</span>
        <span className="viz-axis-note">per GF set</span>
      </header>

      {isCCR
        ? diluent && (
            <div className="gas-plan">
              <span className="gas-plan-label">Loop</span>
              <span className="gas-plan-seq">
                <span className="gas-chip">{diluent.name}</span>
                <span className="gas-plan-at">diluent</span>
                <span className="gas-plan-arrow">·</span>
                <span className="gas-plan-at tabular">
                  SP {round(env.setpointLow, 2)} → {round(env.setpointHigh, 2)} bar
                </span>
              </span>
            </div>
          )
        : plan!.switches.length > 0 && (
            <div className="gas-plan">
              <span className="gas-plan-label">Gas plan</span>
              <span className="gas-plan-seq">
                <span className="gas-chip">{plan!.start.name}</span>
                {plan!.switches.map((sw) => (
                  <span className="gas-plan-step" key={`${sw.gas.id}-${sw.depth}`}>
                    <span className="gas-plan-arrow">→</span>
                    <span className="gas-chip">{sw.gas.name}</span>
                    <span className="gas-plan-at tabular">@ {depth(sw.depth)}</span>
                  </span>
                ))}
              </span>
            </div>
          )}

      <table className="outputs">
        <thead>
          <tr>
            <th scope="col" className="outputs-corner" />
            {results.map((r) => (
              <th scope="col" key={r.gfSetId} style={{ color: colors[r.gfSetId] ?? 'var(--gf-1)' }}>
                <span className="dot" style={{ background: colors[r.gfSetId] ?? 'var(--gf-1)' }} />
                {gfSetLabel(setById.get(r.gfSetId)!)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">First stop</th>
            {results.map((r) => (
              <td className="tabular" key={r.gfSetId}>{r.firstStopDepth > 0 ? depth(r.firstStopDepth) : 'none'}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Total deco</th>
            {results.map((r) => (
              <td className="tabular" key={r.gfSetId}>{round(r.totalDecoTime)} min</td>
            ))}
          </tr>
          <tr>
            <th scope="row">TTS</th>
            {results.map((r) => (
              <td className="tabular" key={r.gfSetId}>{round(r.tts, 1)} min</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Runtime</th>
            {results.map((r) => (
              <td className="tabular" key={r.gfSetId}>{round(r.runtime, 1)} min</td>
            ))}
          </tr>
          <tr className="outputs-schedule">
            <th scope="row">Stops<span className="outputs-sub">depth → min</span></th>
            {results.map((r) => (
              <td className="tabular" key={r.gfSetId}>
                {r.stops.length > 0 ? (
                  <ul className="outputs-stops">
                    {r.stops.map((s, i) => {
                      const sw = switchAt(s.depth);
                      return (
                        <li key={i}>
                          <span className="outputs-stop-depth">{depth(s.depth)}</span>
                          <span className="outputs-stop-arrow">→</span>
                          <span className="outputs-stop-min">{s.duration}</span>
                          {sw && <span className="outputs-stop-gas">⟶ {sw.gas.name}</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="outputs-none">no stops</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
