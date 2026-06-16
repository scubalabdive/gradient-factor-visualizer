// About / Limitations modal (spec §8 + §1 disclaimer). Names the model and
// constants — sourced from the shared engine's constants.ts so the figures can't
// drift — the CCR setpoint convention, the gas-model approximations (mean-depth, no
// P_H2O for delivered gas), and the per-cylinder shareability in force. States the
// decision-support identity plainly: it informs a go/no-go call, it does not make one.
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
            About Gas Planner
          </h2>
          <button ref={closeRef} className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="modal-body">
          <p className="modal-disclaimer">
            Decision-support tool. Figures depend on the inputs you provide and the assumptions
            stated. Verify against your own planning, training, and judgement. Not a substitute for
            proper dive planning.
          </p>

          <section>
            <h3>What this is</h3>
            <p>
              A planner that answers one question: <strong>if things go wrong at the worst moment,
              do I have the gas to get out?</strong> It produces two pre-dive ceilings — a{' '}
              <strong>gas ceiling</strong> (bar/litres) and a <strong>time ceiling</strong> (bailout
              time-to-surface) — and the in-water rule: dive until the first ceiling is reached, then
              go up. It <strong>informs</strong> a go/no-go decision; it does not make one. There is
              no GO/NO-GO light and no claim of safety anywhere.
            </p>
          </section>

          <section>
            <h3>The two domains</h3>
            <p>
              <strong>OC technical</strong> — minimum gas (back gas to the first breathable source,
              team-combined on shareable cylinders) plus per-deco-gas adequacy.{' '}
              <strong>CCR bailout</strong> — the open-circuit bailout ascent from a loop failure at
              maximum depth, end of bottom time (the worst case by construction). Bailout is always
              rationed against the <strong>OC bailout TTS</strong>, never the CC-TTS the handset shows
              on the loop.
            </p>
          </section>

          <section>
            <h3>Model</h3>
            <p>
              The schedule comes from the shared Bühlmann <strong>ZH-L16C</strong> (nitrogen) +{' '}
              <strong>ZH-L16A</strong> (helium) engine with <strong>Erik Baker gradient factors</strong>,{' '}
              {constants.COMPARTMENT_COUNT} compartments — the same engine the GF Visualizer uses, so
              the bailout requirement grows and shrinks with GF exactly as any OC profile does. CCR
              loading holds ppO₂ at the setpoint and the diluent supplies the inert gas; the setpoint
              convention is validated against a Subsurface CCR plan (stop depths exact, per-stop times
              within ±1 min).
            </p>
          </section>

          <section>
            <h3>Gas-model assumptions</h3>
            <ul className="modal-list">
              <li>
                <strong>Mean-depth</strong> gas volumes: <span className="tabular">litres = RMV · t · P̄</span>,
                with P̄ at the mean depth of each leg (the gas-planning standard).
              </li>
              <li>
                <strong>Delivered gas at ambient</strong> — alveolar water vapour (P_H₂O) is{' '}
                <em>not</em> subtracted for gas volumes; it is not the tissue inert pressure.
              </li>
              <li>
                <strong>Shareability is per cylinder</strong>, defaulted from role: back gas → team
                (a spare second stage to donate, min gas uses the combined RMV); all deco and CCR
                bailout cylinders → self-only (single second stage). User-overridable.
              </li>
              <li>
                The time ceiling holds the schedule’s shape while flexing stop time — a documented v1
                approximation.
              </li>
            </ul>
          </section>

          <section>
            <h3>
              Constants <span className="modal-cite">deco-engine/constants.ts (§4.1) — auditable</span>
            </h3>
            <ul className="modal-list">
              <li className="tabular">
                N₂ half-times {hN2[0]}–{hN2.at(-1)} min · He {hHe[0]}–{hHe.at(-1)} min
              </li>
              <li className="tabular">
                Surface pressure {constants.P_SURFACE_DEFAULT} bar · alveolar H₂O {constants.P_H2O} bar
              </li>
              <li className="tabular">
                Water density — salt {constants.RHO_SALT} · fresh {constants.RHO_FRESH} kg/m³
              </li>
            </ul>
          </section>

          <section>
            <h3>Limitations</h3>
            <p>
              No tank-sizing or fill advice (it works from the cylinders you declare). No repetitive
              dives, surface intervals, or residual gas. No altitude (v1). Both ceilings are computed{' '}
              <strong>for the target depth</strong> — go deeper and recompute.
            </p>
          </section>

          <section>
            <h3>Validation</h3>
            <p>
              The deco schedule is cross-checked against <strong>Subsurface</strong>; the gas model’s
              arithmetic is hand-checked and asserted in a fixture, with the CCR bailout matched to
              Subsurface within ~5% on gas volumes (the single-setpoint abstraction explains the
              residual).
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
