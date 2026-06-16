// Environment (spec §6.2 / §4.1). Water type changes bar/metre everywhere in the
// shared engine and is a first-class input for the cave/CCR audience — fresh vs salt
// measurably moves the gas figures for the same dive (spec §10). ppO₂ switch is the
// selectable 1.4 / 1.6 preset that sets the deco-gas switch depths. The OC/CCR
// choice lives in the top-level Mode selector, and the CCR setpoint in Cylinders, so
// neither appears here. Defaults come straight from DEFAULT_ENV.
import { useStore } from '../../store/useStore';
import {
  depthToDisplay,
  depthUnitLabel,
  displayToDepth,
  displayToRate,
  rateToDisplay,
  rateUnitLabel,
} from '../../units';
import { NumberField, Panel, SegmentedControl } from '../ui';

const WATER_OPTS = [
  { value: 'salt' as const, label: 'Salt' },
  { value: 'fresh' as const, label: 'Fresh' },
];
const PPO2_OPTS = [
  { value: 1.4, label: '1.4' },
  { value: 1.6, label: '1.6' },
];

export function EnvironmentPanel() {
  const env = useStore((s) => s.env);
  const units = useStore((s) => s.units);
  const updateEnv = useStore((s) => s.updateEnv);
  const du = depthUnitLabel(units);
  const ru = rateUnitLabel(units);

  return (
    <Panel title="Environment" defaultOpen={false}>
      <div className="env-row">
        <span className="field-label">Water</span>
        <SegmentedControl
          options={WATER_OPTS}
          value={env.water}
          ariaLabel="Water type"
          onChange={(water) => updateEnv({ water })}
        />
      </div>

      <div className="env-row">
        <span className="field-label">ppO₂ switch</span>
        <SegmentedControl
          options={PPO2_OPTS}
          value={env.ppO2Switch}
          ariaLabel="ppO2 switch limit"
          onChange={(ppO2Switch) => updateEnv({ ppO2Switch })}
        />
        <span className="field-suffix">bar</span>
      </div>

      <div className="env-fields">
        <NumberField
          label="Ascent"
          suffix={ru}
          min={1}
          width={72}
          value={rateToDisplay(env.ascentRate, units)}
          onChange={(v) => updateEnv({ ascentRate: displayToRate(v, units) })}
        />
        <NumberField
          label="Descent"
          suffix={ru}
          min={1}
          width={72}
          value={rateToDisplay(env.descentRate, units)}
          onChange={(v) => updateEnv({ descentRate: displayToRate(v, units) })}
        />
        <NumberField
          label="Last stop"
          suffix={du}
          min={0}
          width={72}
          value={depthToDisplay(env.lastStopDepth, units)}
          onChange={(v) => updateEnv({ lastStopDepth: displayToDepth(v, units) })}
        />
        <NumberField
          label="Stop incr."
          suffix={du}
          min={1}
          width={72}
          value={depthToDisplay(env.stopIncrement, units)}
          onChange={(v) => updateEnv({ stopIncrement: displayToDepth(v, units) })}
        />
        <NumberField
          label="Surface P"
          suffix="bar"
          min={0.5}
          step={0.001}
          decimals={5}
          width={92}
          value={env.surfacePressure}
          onChange={(v) => updateEnv({ surfacePressure: v })}
        />
      </div>
    </Panel>
  );
}
