// App shell — dark instrument layout (spec §10): an input-panel column beside the
// stage (global scrubber + all four views + outputs table), the always-visible
// disclaimer footer (spec §1), and an About/Limitations modal naming the model and
// constants (spec §13).
import { useState } from 'react';
import { AboutModal } from './components/AboutModal';
import { OutputsTable } from './components/OutputsTable';
import { Scrubber } from './components/Scrubber';
import { CeilingChart } from './components/views/CeilingChart';
import { DecoProfileChart } from './components/views/DecoProfileChart';
import { PressurePlot } from './components/views/PressurePlot';
import { TissueLoadingChart } from './components/views/TissueLoadingChart';
import { EnvironmentPanel } from './components/panels/EnvironmentPanel';
import { GasEditor } from './components/panels/GasEditor';
import { GFSetsEditor } from './components/panels/GFSetsEditor';
import { SegmentEditor } from './components/panels/SegmentEditor';
import { SegmentedControl } from './components/ui';
import { useStore } from './store/useStore';

const UNIT_OPTS = [
  { value: 'metric' as const, label: 'Metric' },
  { value: 'imperial' as const, label: 'Imperial' },
];

export function App() {
  const units = useStore((s) => s.units);
  const setUnits = useStore((s) => s.setUnits);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" />
          <div className="brand-text">
            <h1 className="brand-title">Gradient Factor Visualizer</h1>
            <span className="brand-sub">ZH-L16C · gradient factors</span>
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
          <SegmentEditor />
          <GasEditor />
          <GFSetsEditor />
          <EnvironmentPanel />
        </aside>

        <main className="stage">
          <Scrubber />
          <DecoProfileChart />
          <CeilingChart />
          <PressurePlot />
          <TissueLoadingChart />
          <OutputsTable />
        </main>
      </div>

      <footer className="app-footer">
        Educational visualization only — not a dive planner. Do not use to plan real dives.
      </footer>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
