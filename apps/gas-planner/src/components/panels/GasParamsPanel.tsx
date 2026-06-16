// Gas parameters (spec §6.3 / §5) — the rates and margins every figure is built on.
// RMVs are surface L/min (stress-elevated where used): self + buddy feed OC minimum
// gas (team-combined on shareable back gas), deco feeds OC deco adequacy, bailout
// feeds the CCR bailout. Stress is an explicit multiplier on the min-gas event;
// problem time is the at-depth recognition hold; reserve is per-cylinder. Everything
// is visible and editable — a decision-support figure is only as good as its inputs.
import { useStore } from '../../store/useStore';
import { NumberField, Panel } from '../ui';

export function GasParamsPanel() {
  const mode = useStore((s) => s.mode);
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const isCCR = mode === 'ccr';

  return (
    <Panel title="Gas parameters" defaultOpen={false}>
      <div className="params-group">
        <span className="params-legend">RMV — surface L/min</span>
        <div className="env-fields">
          <NumberField
            label="Self"
            suffix="L/min"
            min={1}
            width={68}
            value={params.rmvSelf}
            onChange={(v) => setParam('rmvSelf', v)}
          />
          <NumberField
            label="Buddy"
            suffix="L/min"
            min={1}
            width={68}
            value={params.rmvBuddy}
            onChange={(v) => setParam('rmvBuddy', v)}
          />
          <NumberField
            label="Deco"
            suffix="L/min"
            min={1}
            width={68}
            value={params.rmvDeco}
            onChange={(v) => setParam('rmvDeco', v)}
          />
          <NumberField
            label="Bailout"
            suffix="L/min"
            min={1}
            width={68}
            value={params.rmvBailout}
            onChange={(v) => setParam('rmvBailout', v)}
          />
        </div>
        <span className="params-hint">
          {isCCR
            ? 'Bailout RMV rations the OC ascent; self + buddy + deco apply to OC mode.'
            : 'Self + buddy = team-combined min gas on shareable cylinders; deco rations the deco bottles.'}
        </span>
      </div>

      <div className="env-fields">
        <NumberField
          label="Stress ×"
          min={1}
          step={0.1}
          decimals={1}
          width={68}
          value={params.stress}
          onChange={(v) => setParam('stress', v)}
        />
        <NumberField
          label="Problem time"
          suffix="min"
          min={0}
          width={68}
          value={params.problemTime}
          onChange={(v) => setParam('problemTime', v)}
        />
        <NumberField
          label="Reserve"
          suffix="bar"
          min={0}
          width={68}
          value={params.reserveBar}
          onChange={(v) => setParam('reserveBar', v)}
        />
      </div>
    </Panel>
  );
}
