// App shell — dark instrument layout (spec §10, to the visualizer's standard): a
// Mode selector + input-panel column beside the stage (the two-ceilings readout),
// the always-visible decision-support disclaimer footer (spec §1), and an
// About/Limitations modal naming the model, constants, and assumptions (spec §8).
import { useState } from 'react';
import { AboutModal } from './components/AboutModal';
import { Readout } from './components/Readout';
import { CylinderEditor } from './components/panels/CylinderEditor';
import { EnvironmentPanel } from './components/panels/EnvironmentPanel';
import { GasEditor } from './components/panels/GasEditor';
import { GasParamsPanel } from './components/panels/GasParamsPanel';
import { GFSetsEditor } from './components/panels/GFSetsEditor';
import { SegmentEditor } from './components/panels/SegmentEditor';
import { SegmentedControl } from './components/ui';
import { useStore } from './store/useStore';

const UNIT_OPTS = [
  { value: 'metric' as const, label: 'Metric' },
  { value: 'imperial' as const, label: 'Imperial' },
];
const MODE_OPTS = [
  { value: 'oc' as const, label: 'OC technical' },
  { value: 'ccr' as const, label: 'CCR bailout' },
];

export function App() {
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" />
          <div className="brand-text">
            <h1 className="brand-title">Two Ceilings</h1>
            <span className="brand-sub">bailout &amp; minimum-gas planner</span>
          </div>
        </div>
        <div className="header-tools">
          <SegmentedControl options={UNIT_OPTS} value={units} ariaLabel="Units" onChange={setUnits} />
          <button type="button" className="about-btn" onClick={() => setAboutOpen(true)}>
            About
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="mode-bar">
            <span className="mode-bar-label">Mode</span>
            <SegmentedControl options={MODE_OPTS} value={mode} ariaLabel="Planner mode" onChange={setMode} />
          </div>
          <SegmentEditor />
          <GasEditor />
          <CylinderEditor />
          <GasParamsPanel />
          <GFSetsEditor />
          <EnvironmentPanel />
        </aside>

        <main className="stage">
          <Readout />
        </main>
      </div>

      <footer className="app-footer">
        Decision-support tool. Figures depend on the inputs you provide and the assumptions stated.
        Verify against your own planning, training, and judgement. Not a substitute for proper dive
        planning.
      </footer>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
