# Claude Code kickoff — Bailout & Minimum-Gas Planner (engine + gas math only)

**Read first:** `Bailout-GasMargin-Specification.md` is the contract. This prompt scopes the
**first working session** to milestones 1–3 of §11 only. Build nothing UI-facing — no React
components, no views, no panels, no styling. This session ends with a pure, tested gas model
sitting on top of a shared, still-green deco engine. The visualizer spec
(`GF-Visualizer-Specification.md`) describes the engine you are extracting; treat its §4 and §5
as the source of truth for the engine's behaviour and types.

## The one rule that governs everything

The deco engine is **pure** (no DOM, no React, no gas logic) and is now shared by two apps.
Every change you make to it must leave the **visualizer's existing regression fixture passing,
unchanged**. That fixture is the gate. If it goes red, you have changed OC behaviour and must
fix that before doing anything else.

## Scope of this session — do these three, in order, stopping at each gate

### 1. Monorepo + engine extraction
- Set up a pnpm (or npm) workspace monorepo:
  - `packages/deco-engine` — the existing pure ZHL-16C+GF engine, moved out of the visualizer
    verbatim. Keep its constants (visualizer §4.1), conversions, Haldane/Schreiner, trimix a/b
    combining, GF ceiling, ascent algorithm, gas switching, and its types (visualizer §5).
  - `packages/gas-model` — new, empty for now, depends on `deco-engine`.
  - `apps/gf-visualizer` — the existing app, now consuming `deco-engine` as a workspace dependency.
  - `apps/gas-planner` — scaffold only (package.json, tsconfig, a stub entry). No UI.
- **Gate:** the visualizer builds against the extracted package and its **regression fixture
  passes unchanged**. Do not proceed until green. Report the fixture result explicitly.

### 2. CCR setpoint-loading mode in the shared engine (spec §4.2)
- Add a per-segment **loading mode** flag (`'oc' | 'ccr-setpoint'`) to the engine, **defaulting
  to `'oc'`** so the visualizer's OC paths are byte-for-byte unaffected.
- Implement the setpoint-driven inspired-inert-gas function exactly as §4.2:
  - `ppInert_total = max(0, P_amb - P_H2O - S)`, split N₂/He by the diluent's inert ratio.
  - Implement and **document the shallow-water guard**: when
    `fO2_dil * (P_amb - P_H2O) > S`, the loop can't hold setpoint — fall back to the diluent as
    an OC mix at that depth.
- Loading otherwise reuses the **same Haldane/Schreiner integration and the same trimix a/b
  combining** as OC. Only the inspired-gas function differs.
- **Gate (hard):** validate CCR loading against a reference CCR planner (Shearwater desktop or
  MultiDeco CCR) on reference scenario 2 from spec §9 — a 60 m Tx-diluent dive at setpoint 1.3,
  bailout = bottom bailout + EAN50 + O₂, bailout-at-bottom. Compare the **OC-bailout schedule**
  (stops, TTS). Capture it as a fixture (next step). *Nothing gas-facing depends on this until
  it passes within the engine's existing tolerances.* Document the setpoint convention you
  matched.
- **Re-run the visualizer fixture again** after this change. Still green, still unchanged.

### 3. `packages/gas-model` — the pure gas layer (spec §4.3–4.7)
Implement as pure functions over `GFResult` + `GasParams` + `Cylinder[]`, no UI, no engine
internals reached into. Use the types in spec §5 verbatim.

- **4.3 gas demand** — `gas_litres = RMV * t * P̄`; stops use `P_amb(d)`, travel uses mean-depth
  `P_amb((d1+d2)/2)`. **Do not** subtract `P_H2O` (delivered gas, not alveolar). Document the
  mean-depth-vs-integrated choice; mean-depth is the default.
- **4.4 OC minimum gas** — team-combined RMV on **shareable** cylinders, self-only on the rest.
  `shareable` is per-cylinder, defaulted from role (`backgas → true`, else `false`),
  overridable. Round `min_gas_bar` up.
- **4.5 OC deco-gas adequacy** — `required_litres` per deco gas from the GF schedule;
  `margin = available - required - reserve`. Also expose the inverse (`max_stop_time`) feeding
  the max-TTS ceiling.
- **4.6 CCR bailout-at-bottom** — load descent + bottom on `ccr-setpoint`; trigger the engine's
  **OC ascent** from that loaded tissue state on the carried bailout gases at the chosen GF; sum
  gas per cylinder; compare required + reserve vs available per cylinder; mark the binding
  cylinder. Runtime of that ascent is the **OC bailout TTS** — never CC-TTS.
- **4.7 two-ceilings synthesis** — emit `GasResult` per GF set: `gasCeilingBar`,
  `timeCeilingTts`, `bailoutTts`, `perCylinder[]`.
- **Fixture (spec §9):** capture scenarios 1 (OC trimix 45 m), 2 (CCR 60 m), and 3 (fresh water)
  as a Vitest fixture. Deco schedule to the engine's existing tolerances; **gas volumes within
  ~5%** of hand calculation / the reference planner. Cross-check 4.3 by hand for at least one
  segment in a code comment so a reviewer can audit the arithmetic.

## Conventions to honour (don't rediscover them)
- **Bar and minutes internally**, everywhere. No unit conversion in either package.
- Independent self-rescue for everything single-reg; team-combined only on `shareable`
  cylinders. This is the crux of min gas — get it right and comment it.
- Ration against **OC bailout TTS**, never the loop's CC-TTS. Label it in every return value /
  comment where ambiguity is possible.
- Match the visualizer's gas-switch placement (MOD at the configured ppO₂, manual override) for
  bailout deco gases.

## Definition of done for this session
- [ ] Monorepo builds; both apps resolve `deco-engine` as a workspace dependency.
- [ ] Visualizer regression fixture **passes unchanged** (report the run).
- [ ] Engine has a `ccr-setpoint` loading mode defaulting to `oc`; OC paths untouched.
- [ ] CCR loading validated against a reference planner on scenario 2; convention documented.
- [ ] `gas-model` is pure (no UI, no React) and implements §4.3–4.7.
- [ ] `gas-model` fixture passes on scenarios 1–3 within tolerance; one hand-check in comments.
- [ ] No UI, no views, no components were created. (If you felt tempted, stop and leave a note
      instead.)

## Explicitly out of scope this session
Input panels, the readout, GF-slider live recompute, any visual/instrument styling, the
About/Limitations panel, the disclaimer wiring. Those are milestones 4–7 and come next session.
