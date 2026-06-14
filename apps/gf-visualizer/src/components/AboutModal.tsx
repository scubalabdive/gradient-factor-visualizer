// About / Limitations modal (spec §13 acceptance + §1 disclaimer + §11 limits).
// Names the model and constants — sourced from engine/constants.ts so the figures
// can't drift from the engine — and restates that this is not a dive planner.
// Dismissible: × button, backdrop click, or Esc; the close button takes focus on open.
import { useEffect, useRef } from 'react';
import { constants } from '@gf/deco-engine';

export function AboutModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hN2 = constants.HALFTIME_N2;
  const hHe = constants.HALFTIME_HE;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="about-title" className="modal-title">
            About the Gradient Factor Visualizer
          </h2>
          <button ref={closeRef} className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body">
          <p className="modal-disclaimer">
            Educational visualization only — not a dive planner. Do not use to plan real dives.
          </p>

          <section>
            <h3>What this is</h3>
            <p>
              An interactive teaching tool for how <strong>gradient factors</strong> reshape a
              decompression profile. Set a dive, compare up to three GF sets, and scrub through time
              to watch the ceiling, the GF/M-value relationship, and the tissue loading respond.
            </p>
          </section>

          <section>
            <h3>Model</h3>
            <p>
              Bühlmann <strong>ZH-L16C</strong> (nitrogen) and <strong>ZH-L16A</strong> (helium) with{' '}
              <strong>Erik Baker gradient factors</strong>, {constants.COMPARTMENT_COUNT} tissue
              compartments. Nitrogen and helium are integrated independently and combined when
              evaluating each compartment's limit.
            </p>
          </section>

          <section>
            <h3>Open &amp; closed circuit</h3>
            <p>
              <strong>Open circuit</strong> breathes a fixed gas, so ppO₂ rises with depth;
              deco gases switch at their MOD. <strong>CCR</strong> holds ppO₂ at a setpoint and the
              diluent supplies the inert gases — a <strong>low (descent) setpoint</strong> while
              descending, then a <strong>working setpoint</strong> from the bottom through all of
              deco. The CCR model is a single diluent with no bailout, validated against a
              Subsurface CCR plan (stop depths exact, per-stop times within ±1 min).
            </p>
          </section>

          <section>
            <h3>
              Constants <span className="modal-cite">engine/constants.ts (spec §4.1) — auditable</span>
            </h3>
            <ul className="modal-list">
              <li className="tabular">
                N₂ half-times {hN2[0]}–{hN2.at(-1)} min · He {hHe[0]}–{hHe.at(-1)} min
              </li>
              <li>Per-compartment a (bar) / b coefficients · M(P) = a + P / b</li>
              <li className="tabular">
                Surface pressure {constants.P_SURFACE_DEFAULT} bar · alveolar H₂O {constants.P_H2O} bar
              </li>
              <li className="tabular">
                Water density — salt {constants.RHO_SALT} · fresh {constants.RHO_FRESH} kg/m³
              </li>
              <li className="tabular">
                Surface-saturation N₂ fraction {constants.N2_FRACTION_ATMOSPHERIC}
              </li>
              <li className="tabular">ppO₂ gas-switch presets 1.4 / 1.6 bar (default 1.6)</li>
            </ul>
          </section>

          <section>
            <h3>How to read the views</h3>
            <ul className="modal-list">
              <li>
                <strong>Deco profile</strong> — depth vs runtime; each GF set's stops appear as
                plateaus.
              </li>
              <li>
                <strong>Ceiling over time</strong> — the GF-adjusted ceiling per set, with the actual
                depth faint behind.
              </li>
              <li>
                <strong>GF / M-value pressure plot</strong> — a compartment's loading vs ambient
                pressure; each set's GF line pivots between the ambient line and the raw M-value line.
              </li>
              <li>
                <strong>Tissue loading</strong> — all {constants.COMPARTMENT_COUNT} compartments as a
                percentage of their GF-adjusted M-value; the controlling tissue is highlighted.
              </li>
            </ul>
            <p className="modal-note">
              Drag the time scrubber to move the marker across all views together; drag a GF slider to
              watch every view respond live.
            </p>
          </section>

          <section>
            <h3>Limitations</h3>
            <p>
              This is <strong>not</strong> a dive planner. There is no gas consumption / SAC, no
              repetitive dives or surface intervals, no altitude (v1), and no import of a real,
              irregular dive. Anything that would turn it into a planning aid is out of scope.
            </p>
          </section>

          <section>
            <h3>Validation</h3>
            <p>
              The engine is cross-checked against <strong>Subsurface</strong> (ZH-L16C + GF) on three
              reference profiles — air, trimix with deco-gas switches, and a fresh-water dive: stop
              depths match exactly and per-stop times agree within tolerance.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
