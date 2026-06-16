// Exposure — the multi-level segment editor (spec §6.2). A square dive is one row;
// add / reorder / delete legs. In OC each leg picks its breathing gas; in CCR the
// loop runs on the diluent at the setpoint, so the per-leg gas is set by the diluent
// selector (Cylinders panel) and the column reads "diluent" here.
import { useStore } from '../../store/useStore';
import { depthToDisplay, depthUnitLabel, displayToDepth } from '../../units';
import { IconButton, NumberField, Panel } from '../ui';

export function SegmentEditor() {
  const mode = useStore((s) => s.mode);
  const segments = useStore((s) => s.segments);
  const gases = useStore((s) => s.gases);
  const units = useStore((s) => s.units);
  const addSegment = useStore((s) => s.addSegment);
  const updateSegment = useStore((s) => s.updateSegment);
  const removeSegment = useStore((s) => s.removeSegment);
  const moveSegment = useStore((s) => s.moveSegment);
  const du = depthUnitLabel(units);
  const isCCR = mode === 'ccr';

  return (
    <Panel
      title="Exposure"
      subtitle={`${segments.length} leg${segments.length > 1 ? 's' : ''}`}
      actions={
        <IconButton title="Add leg" onClick={addSegment}>
          ＋
        </IconButton>
      }
    >
      {isCCR && (
        <p className="gas-ccr-note">
          Loop-on at the working setpoint — the descent + bottom load on the diluent.
        </p>
      )}
      <div className="seg-rows">
        <div className="seg-row seg-row--head">
          <span>Depth</span>
          <span>Time</span>
          <span>Gas</span>
          <span />
        </div>
        {segments.map((seg, i) => (
          <div className="seg-row" key={seg.id}>
            <NumberField
              value={depthToDisplay(seg.depth, units)}
              suffix={du}
              min={0}
              onChange={(v) => updateSegment(seg.id, { depth: displayToDepth(v, units) })}
            />
            <NumberField
              value={seg.time}
              suffix="min"
              min={0}
              onChange={(v) => updateSegment(seg.id, { time: v })}
            />
            {isCCR ? (
              <span className="seg-gas-static tabular">diluent</span>
            ) : (
              <select
                className="gas-select tabular"
                value={seg.gasId}
                aria-label="Breathing gas"
                onChange={(e) => updateSegment(seg.id, { gasId: e.target.value })}
              >
                {gases.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            <div className="row-actions">
              <IconButton title="Move up" disabled={i === 0} onClick={() => moveSegment(seg.id, -1)}>
                ↑
              </IconButton>
              <IconButton
                title="Move down"
                disabled={i === segments.length - 1}
                onClick={() => moveSegment(seg.id, 1)}
              >
                ↓
              </IconButton>
              <IconButton
                title="Delete leg"
                danger
                disabled={segments.length <= 1}
                onClick={() => removeSegment(seg.id)}
              >
                ✕
              </IconButton>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
