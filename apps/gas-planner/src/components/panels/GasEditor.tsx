// Gases (spec §6.2) — the mixes, entered as O₂/He fractions with derived N₂%, MOD,
// and auto switch depth (manual override). Derived read-outs come straight from the
// engine's own gas helpers so the UI can never disagree with the integration. A
// gas's role (bottom / deco) drives its auto switch depth and which cylinders prefer
// it; cylinders reference these gases by id.
import type { EnvironmentConfig, GasMix } from '@gf/deco-engine';
import { fN2, gasSwitchDepth, modDepth } from '@gf/deco-engine';
import type { Units } from '../../store/defaults';
import { gasRemovable, useStore } from '../../store/useStore';
import { depthToDisplay, depthUnitLabel, displayToDepth } from '../../units';
import { round } from '../../util';
import { IconButton, NumberField, Panel, SegmentedControl } from '../ui';

const ROLE_OPTS = [
  { value: 'bottom' as const, label: 'Bottom' },
  { value: 'deco' as const, label: 'Deco' },
];

export function GasEditor() {
  const gases = useStore((s) => s.gases);
  const segments = useStore((s) => s.segments);
  const cylinders = useStore((s) => s.cylinders);
  const diluentGasId = useStore((s) => s.diluentGasId);
  const env = useStore((s) => s.env);
  const units = useStore((s) => s.units);
  const addGas = useStore((s) => s.addGas);
  const updateGas = useStore((s) => s.updateGas);
  const removeGas = useStore((s) => s.removeGas);
  const du = depthUnitLabel(units);
  const bottomCount = gases.filter((g) => g.role === 'bottom').length;

  return (
    <Panel
      title="Gases"
      subtitle={`${gases.length}`}
      actions={
        <>
          <IconButton title="Add bottom gas" onClick={() => addGas('bottom')}>
            ⬣
          </IconButton>
          <IconButton title="Add deco gas" onClick={() => addGas('deco')}>
            ＋
          </IconButton>
        </>
      }
    >
      <div className="gas-list">
        {gases.map((g) => {
          const o2 = round(g.fO2 * 100);
          const he = round(g.fHe * 100);
          const n2 = round(fN2(g) * 100);
          const mod = modDepth(g, env.ppO2Switch, env);
          const isLastBottom = g.role === 'bottom' && bottomCount <= 1;
          const rm = gasRemovable(g.id, gases, segments, cylinders, diluentGasId);
          return (
            <div className="gas-card" key={g.id}>
              <div className="gas-card-head">
                <span className="gas-name tabular">{g.name}</span>
                <SegmentedControl
                  options={ROLE_OPTS}
                  value={g.role === 'deco' ? 'deco' : 'bottom'}
                  ariaLabel="Gas role"
                  onChange={(role) => {
                    if (isLastBottom && role === 'deco') return; // keep ≥1 bottom gas
                    updateGas(g.id, { role });
                  }}
                />
                <IconButton
                  title={rm.ok ? 'Remove gas' : `Can’t remove — ${rm.reason}`}
                  danger
                  disabled={!rm.ok}
                  onClick={() => removeGas(g.id)}
                >
                  ✕
                </IconButton>
              </div>

              <div className="gas-fields">
                <NumberField
                  label="O₂ %"
                  value={o2}
                  min={0}
                  max={round(100 - he)}
                  width={56}
                  onChange={(v) => updateGas(g.id, { fO2: v / 100 })}
                />
                <NumberField
                  label="He %"
                  value={he}
                  min={0}
                  max={round(100 - o2)}
                  width={56}
                  onChange={(v) => updateGas(g.id, { fHe: v / 100 })}
                />
                <div className="gas-derived">
                  <span className="field-label">N₂</span>
                  <span className="tabular">{n2}%</span>
                </div>
                <div className="gas-derived">
                  <span className="field-label">MOD</span>
                  <span className="tabular">
                    {Number.isFinite(mod) ? `${round(depthToDisplay(mod, units))} ${du}` : '—'}
                  </span>
                </div>
              </div>

              {g.role === 'deco' && (
                <SwitchDepthControl gas={g} env={env} units={units} onChange={updateGas} />
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SwitchDepthControl(props: {
  gas: GasMix;
  env: EnvironmentConfig;
  units: Units;
  onChange: (id: string, patch: Partial<Omit<GasMix, 'id'>>) => void;
}) {
  const { gas, env, units, onChange } = props;
  const du = depthUnitLabel(units);
  const auto = gasSwitchDepth({ ...gas, switchDepth: undefined }, env);
  const isManual = gas.switchDepth !== undefined;
  const autoFinite = Number.isFinite(auto);

  return (
    <div className="gas-switch">
      <span className="field-label">Switch</span>
      {isManual ? (
        <NumberField
          value={depthToDisplay(gas.switchDepth ?? 0, units)}
          suffix={du}
          min={0}
          width={56}
          onChange={(v) => onChange(gas.id, { switchDepth: displayToDepth(v, units) })}
        />
      ) : (
        <span className="tabular">
          {autoFinite ? `${round(depthToDisplay(auto, units))} ${du}` : '—'}{' '}
          <span className="muted">auto</span>
        </span>
      )}
      {isManual ? (
        <button
          type="button"
          className="link-btn"
          onClick={() => onChange(gas.id, { switchDepth: undefined })}
        >
          reset
        </button>
      ) : (
        <button
          type="button"
          className="link-btn"
          disabled={!autoFinite}
          onClick={() => onChange(gas.id, { switchDepth: round(auto) })}
        >
          override
        </button>
      )}
    </div>
  );
}
