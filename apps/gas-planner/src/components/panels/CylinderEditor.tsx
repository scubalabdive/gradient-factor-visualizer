// Cylinders (spec §6.2 / §4.8) — the physical bottles the planner rations against.
// Each: the gas it carries, water volume (L), fill (bar) → available litres, a role,
// and per-cylinder shareability (toggle, defaulted from role: back gas → team,
// everything else → self-only). CCR mode adds the loop diluent + working setpoint
// (spec §6.2) and offers the bottom-bailout role instead of back gas.
import { useStore } from '../../store/useStore';
import { round } from '../../util';
import { IconButton, NumberField, Panel, SegmentedControl } from '../ui';

const OC_ROLE_OPTS = [
  { value: 'backgas' as const, label: 'Back gas' },
  { value: 'deco-bailout' as const, label: 'Deco' },
];
const CCR_ROLE_OPTS = [
  { value: 'bottom-bailout' as const, label: 'Bottom' },
  { value: 'deco-bailout' as const, label: 'Deco' },
];

export function CylinderEditor() {
  const mode = useStore((s) => s.mode);
  const cylinders = useStore((s) => s.cylinders);
  const gases = useStore((s) => s.gases);
  const setpoint = useStore((s) => s.setpoint);
  const diluentGasId = useStore((s) => s.diluentGasId);
  const addCylinder = useStore((s) => s.addCylinder);
  const updateCylinder = useStore((s) => s.updateCylinder);
  const removeCylinder = useStore((s) => s.removeCylinder);
  const setSetpoint = useStore((s) => s.setSetpoint);
  const setDiluent = useStore((s) => s.setDiluent);
  const isCCR = mode === 'ccr';
  const roleOpts = isCCR ? CCR_ROLE_OPTS : OC_ROLE_OPTS;
  const deepRole = isCCR ? ('bottom-bailout' as const) : ('backgas' as const);

  return (
    <Panel
      title="Cylinders"
      subtitle={`${cylinders.length}`}
      actions={
        <>
          <IconButton title="Add bottle" onClick={() => addCylinder(deepRole)}>
            ⬣
          </IconButton>
          <IconButton title="Add deco bottle" onClick={() => addCylinder('deco-bailout')}>
            ＋
          </IconButton>
        </>
      }
    >
      {isCCR && (
        <div className="ccr-loop">
          <label className="field ccr-loop-field">
            <span className="field-label">Diluent</span>
            <select
              className="gas-select tabular"
              value={diluentGasId}
              aria-label="Loop diluent"
              onChange={(e) => setDiluent(e.target.value)}
            >
              {gases.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Working SP"
            suffix="bar"
            min={0.4}
            max={1.6}
            step={0.05}
            decimals={2}
            width={72}
            value={setpoint}
            onChange={setSetpoint}
          />
          <span className="gas-ccr-note">
            The loop holds O₂ at the setpoint; the diluent supplies the inert gas while loading.
          </span>
        </div>
      )}

      <div className="gas-list">
        {cylinders.map((c) => {
          const gas = gases.find((g) => g.id === c.gasId);
          const available = c.volume * c.fillPressure;
          const role = c.role === 'deco-bailout' ? 'deco-bailout' : deepRole;
          return (
            <div className="gas-card" key={c.id}>
              <div className="gas-card-head">
                <select
                  className="gas-select tabular cyl-gas"
                  value={c.gasId}
                  aria-label="Cylinder gas"
                  onChange={(e) => updateCylinder(c.id, { gasId: e.target.value })}
                >
                  {gases.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <SegmentedControl
                  options={roleOpts}
                  value={role}
                  ariaLabel="Cylinder role"
                  onChange={(r) => updateCylinder(c.id, { role: r })}
                />
                <IconButton
                  title="Remove cylinder"
                  danger
                  disabled={cylinders.length <= 1}
                  onClick={() => removeCylinder(c.id)}
                >
                  ✕
                </IconButton>
              </div>

              <div className="gas-fields">
                <NumberField
                  label="Volume"
                  suffix="L"
                  min={0.1}
                  step={0.5}
                  decimals={1}
                  width={64}
                  value={c.volume}
                  onChange={(v) => updateCylinder(c.id, { volume: v })}
                />
                <NumberField
                  label="Fill"
                  suffix="bar"
                  min={0}
                  width={64}
                  value={c.fillPressure}
                  onChange={(v) => updateCylinder(c.id, { fillPressure: v })}
                />
                <div className="gas-derived">
                  <span className="field-label">Available</span>
                  <span className="tabular">{round(available)} L</span>
                </div>
              </div>

              {/* Shareability only changes the OC minimum-gas math (team-combined RMV);
                  CCR bailout is independent by construction, so the toggle is OC-only. */}
              {!isCCR && (
                <div className="cyl-share">
                  <span className="field-label">Sharing</span>
                  <button
                    type="button"
                    className={'share-toggle' + (c.shareable ? ' is-on' : '')}
                    aria-pressed={c.shareable}
                    title={
                      c.shareable
                        ? 'Shareable — spare second stage; min gas uses team-combined RMV'
                        : 'Self only — single second stage; sized independent'
                    }
                    onClick={() => updateCylinder(c.id, { shareable: !c.shareable })}
                  >
                    {c.shareable ? 'Team (shareable)' : 'Self only'}
                  </button>
                </div>
              )}

              {!gas && <p className="viz-error">⚠ gas not found</p>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
