// Global time scrubber (spec §9) — sets the single shared "current time" that the
// linked views read (View 1/2 cursor, View 3 trajectory marker). A slim sticky bar
// at the top of the stage so it stays reachable while scrolling the views.
//
// Seeds to the end of the bottom phase on first load (the deepest, most-loaded
// moment — where the GF story is most legible) and re-clamps when the dive shortens.
import { useEffect, useRef } from 'react';
import { useEngineResults } from '../store/useEngineResults';
import { useStore } from '../store/useStore';
import { round } from '../util';
import { firstStopArrivalTime } from '../viz/loading';

export function Scrubber() {
  const res = useEngineResults();
  const scrubTime = useStore((s) => s.scrubTime);
  const setScrubTime = useStore((s) => s.setScrubTime);
  const seeded = useRef(false);

  const ok = res.ok;
  const maxRuntime = ok ? Math.max(...res.results.map((r) => r.runtime)) : 0;
  // Seed at the first-stop arrival of the most conservative set — the binding
  // moment where the controlling tissue rides its GF limit (View 3's "aha").
  const seedTime = ok ? firstStopArrivalTime(res.results[0]!.profile, res.results[0]!.firstStopDepth) : 0;

  // One-shot seed so the first impression isn't t=0.
  useEffect(() => {
    if (ok && !seeded.current && scrubTime === 0 && seedTime > 0) {
      seeded.current = true;
      setScrubTime(seedTime);
    }
  }, [ok, seedTime, scrubTime, setScrubTime]);

  // Keep the shared time inside the (possibly shrunk) dive.
  useEffect(() => {
    if (ok && scrubTime > maxRuntime) setScrubTime(maxRuntime);
  }, [ok, maxRuntime, scrubTime, setScrubTime]);

  if (!ok) return null;

  const t = Math.min(maxRuntime, Math.max(0, scrubTime));

  return (
    <div className="scrubber">
      <span className="scrubber-label">Time</span>
      <input
        type="range"
        className="scrubber-range"
        min={0}
        max={round(maxRuntime, 1)}
        step={0.1}
        value={t}
        aria-label="Current time"
        onChange={(e) => setScrubTime(parseFloat(e.target.value))}
      />
      <span className="scrubber-value tabular">
        {round(t, 1)} <span className="scrubber-unit">/ {round(maxRuntime, 1)} min</span>
      </span>
    </div>
  );
}
