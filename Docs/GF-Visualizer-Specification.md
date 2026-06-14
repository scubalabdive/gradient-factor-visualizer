# Gradient Factor Visualizer — Specification

**Version:** 1.0 (hand-off to Claude Code)
**Document type:** Implementation specification. This is the contract for what to build.

---

## 1. Purpose & identity

A single-page **web app** that shows, graphically, how **gradient factor (GF) settings** change a decompression profile for a **fixed dive exposure**. The user holds the dive constant and varies only GF Low / GF High across up to three settings, then *sees* the difference — first-stop depth, ceiling, stop schedule, and the underlying tissue-vs-M-value geometry.

It is a **teaching and visualization tool, not a dive planner.** This identity drives several deliberate exclusions (Section 11). It must never be presentable as something a diver would use to plan a real dive.

### Non-goals (explicitly out of scope)
- No gas consumption / SAC / tank sizing.
- No repetitive dives, surface intervals, or residual-nitrogen carry-over.
- No altitude diving in v1 (flagged as the leading fast-follow — see Section 13).
- No attempt to model a diver's real, irregular logged profile. Exposure is user-defined segments, not imported dive logs.

### Required disclaimer
A persistent, visible, unobtrusive line in the UI (e.g. footer) at all times: **"Educational visualization only — not a dive planner. Do not use to plan real dives."** Plus a short "About / Limitations" panel restating it and naming the model and constants used.

---

## 2. Users & distribution

Audience is technical and cave diving professionals reviewing and testing the tool before potential wider release. Web app so it can be shared by link, runs cross-platform, nothing to install. Build for credibility with an expert audience: correctness, auditability of constants, and a clear statement of conventions matter as much as the visuals.

---

## 3. Recommended tech stack

Not mandatory, but chosen to fit the requirements:

- **React 18 + TypeScript + Vite.**
- **Decompression engine as a pure, dependency-free TypeScript module** (`/engine`). No DOM, no React — just functions over plain data, so it is unit-testable and portable. This is the single most important architectural rule: *the engine knows nothing about the UI.*
- **Rendering:** D3 (scales + hand-built SVG) or visx for the bespoke plots. The GF/M-value pressure plot (View 3) needs custom geometry and smooth morphing, so a general charting library is likely too rigid; use it only if it doesn't constrain the showpiece.
- **State:** Zustand or React context — light is fine.
- **Tests:** Vitest. The engine ships with a regression fixture (Section 12).
- **Styling / visual system:** see Section 10. Consult the `frontend-design` skill during implementation.

---

## 4. The decompression engine

Model: **Bühlmann ZH-L16C** for nitrogen, **ZH-L16 (A) for helium**, with **Erik Baker gradient factors**. Trimix is handled by combining the two gases' coefficients per compartment (Section 4.6). 16 tissue compartments.

The engine works **internally in bar and minutes only.** Unit conversion (metres/feet) happens at the UI boundary, never inside the engine.

### 4.1 Constants (ZH-L16C, bar·minute units)

Source: Bühlmann *Tauchmedizin* (2002), as tabulated on the Bühlmann decompression algorithm reference. Pin these exactly and document the source in code comments so reviewers can audit.

| # | hN₂ (min) | aN₂ | bN₂ | hHe (min) | aHe | bHe |
|---|-----------|--------|--------|-----------|--------|--------|
| 1 | 5.0 | 1.1696 | 0.5578 | 1.88 | 1.6189 | 0.4770 |
| 2 | 8.0 | 1.0000 | 0.6514 | 3.02 | 1.3830 | 0.5747 |
| 3 | 12.5 | 0.8618 | 0.7222 | 4.72 | 1.1919 | 0.6527 |
| 4 | 18.5 | 0.7562 | 0.7825 | 6.99 | 1.0458 | 0.7223 |
| 5 | 27.0 | 0.6200 | 0.8126 | 10.21 | 0.9220 | 0.7582 |
| 6 | 38.3 | 0.5043 | 0.8434 | 14.48 | 0.8205 | 0.7957 |
| 7 | 54.3 | 0.4410 | 0.8693 | 20.53 | 0.7305 | 0.8279 |
| 8 | 77.0 | 0.4000 | 0.8910 | 29.11 | 0.6502 | 0.8553 |
| 9 | 109.0 | 0.3750 | 0.9092 | 41.20 | 0.5950 | 0.8757 |
| 10 | 146.0 | 0.3500 | 0.9222 | 55.19 | 0.5545 | 0.8903 |
| 11 | 187.0 | 0.3295 | 0.9319 | 70.69 | 0.5333 | 0.8997 |
| 12 | 239.0 | 0.3065 | 0.9403 | 90.34 | 0.5189 | 0.9073 |
| 13 | 305.0 | 0.2835 | 0.9477 | 115.29 | 0.5181 | 0.9122 |
| 14 | 390.0 | 0.2610 | 0.9544 | 147.42 | 0.5176 | 0.9171 |
| 15 | 498.0 | 0.2480 | 0.9602 | 188.24 | 0.5172 | 0.9217 |
| 16 | 635.0 | 0.2327 | 0.9653 | 240.03 | 0.5119 | 0.9267 |

Per-gas decay constant: `k = ln(2) / halftime`.

### 4.2 Pressure ↔ depth (this is where fresh vs salt water enters)

```
P_amb(depth_m) = P_surface + depth_m * bar_per_metre
bar_per_metre  = rho * g / 100000        // bar per metre of water
```

- `g = 9.80665`
- `rho_salt = 1030 kg/m³`  → ≈ 0.10104 bar/m
- `rho_fresh = 1000 kg/m³` → ≈ 0.09807 bar/m
- `P_surface = 1.01325 bar` (sea level, default)

Water type is a user selector (`salt | fresh`) and changes `bar_per_metre` **everywhere** in the engine — the conversion both ways, the M-value evaluation, and the depth read out of computed ceilings. The fresh-water case matters for the cave audience and is a first-class input, not an afterthought. Tune `rho`/`g` constants if needed so reference profiles match the validation target (Section 12).

### 4.3 Inspired inert gas (alveolar simplification)

Bühlmann's simplified alveolar equation with respiratory quotient RQ = 1:

```
P_inspired_gas = (P_amb - P_H2O) * F_gas
P_H2O = 0.0627 bar
```

`F_gas` is the fraction of the relevant inert gas (N₂ or He) in the **currently breathed** mix. Compute N₂ and He inspired pressures separately.

### 4.4 Constant-depth loading (Haldane)

For a segment held at constant depth for time `t` (minutes), per gas, per compartment:

```
P_end = P_inspired + (P_start - P_inspired) * exp(-k * t)
```

### 4.5 Changing-depth loading (Schreiner)

For descent/ascent at constant rate, per gas, per compartment:

```
P_end = P_inspired_0 + R * (t - 1/k) - (P_inspired_0 - P_start - R/k) * exp(-k * t)
```

- `P_inspired_0` = inspired inert gas pressure at the **start** of the segment.
- `R` = rate of change of inspired inert gas pressure = `(depth_rate_bar_per_min) * F_gas`, sign following descent (+) / ascent (−).
- `t` = segment duration (min).

Use Schreiner for all travel segments (descent, inter-stop ascents) and Haldane for time held at a fixed depth (bottom, stops). Both gases integrate independently each step; their compartment pressures are summed only when evaluating limits.

### 4.6 Trimix: combining a / b per compartment

When a compartment holds both gases, weight the coefficients by the **partial pressures of each inert gas currently in that compartment**:

```
P_inert = P_N2 + P_He
a = (aN2 * P_N2 + aHe * P_He) / P_inert
b = (bN2 * P_N2 + bHe * P_He) / P_inert
```

(If `P_inert` is ~0, fall back to the N₂ coefficients to avoid divide-by-zero.) Recompute `a`, `b` at every evaluation because the He/N₂ ratio shifts continuously through the dive and across gas switches.

### 4.7 M-value and GF-adjusted ceiling

Raw Bühlmann M-value (max tolerated tissue pressure at ambient `P_amb`):

```
M(P_amb) = a + P_amb / b
```

GF-adjusted tolerated tissue pressure at ambient `P_amb`, for gradient factor `GF` (0..1):

```
M_gf(P_amb) = P_amb + GF * (M(P_amb) - P_amb)
```

Inverted to the **tolerated ambient pressure** for a known tissue loading `P_t` (this gives the ceiling):

```
P_amb_tol = (P_t - GF * a) / (1 - GF + GF / b)
```

The compartment ceiling depth is `pressure_to_depth(P_amb_tol)`. The **overall ceiling** at any instant is the deepest (max) ceiling across all 16 compartments; the compartment producing it is the **controlling compartment** (track its index — Views 3 and 4 need it).

### 4.8 GF interpolation with depth

GF varies linearly between `GF_low` at the first stop depth and `GF_high` at the surface:

```
GF(depth) = GF_high + (GF_low - GF_high) * (depth / first_stop_depth)
```

→ at `depth = first_stop_depth`, GF = GF_low; at `depth = 0`, GF = GF_high. The `first_stop_depth` is fixed once found (Section 4.9) and anchors the slope for the rest of the ascent.

### 4.9 Ascent / stop-finding algorithm

1. Integrate descent (Schreiner) and bottom time (Haldane) for the user's segment list, breathing the segment's assigned gas.
2. **Find the first stop:** compute the GF_low-limited ceiling across all compartments at the end of the bottom phase; round *up* to the next `stop_increment` (3 m default). That depth is `first_stop_depth` and sets the GF slope.
3. **Ascend stop to stop.** From the current stop, the next target is one increment shallower. Hold at the current stop (Haldane), recomputing each minute, until the GF-interpolated ceiling (evaluated for the shallower target depth) permits ascending to it. Travel between stops uses Schreiner at the ascent rate. Apply any gas switch on reaching its switch depth (Section 4.10).
4. Continue until the last stop (`last_stop_depth`, 3 m default) clears at `GF_high`, then surface.
5. Record: per-stop depth and duration, first-stop depth, total deco time, time-to-surface (from leaving the bottom), full runtime, the continuous ceiling timeline, and the per-compartment loading timeline with the controlling index at each step.

Use a fixed integration step (suggest 0.1 min for travel, 1 min stop granularity, or sub-step and round at the end). Match **Subsurface's** conventions for ambiguous edge cases (whether GF is evaluated at the current or next stop, rounding of the last stop) — validation (Section 12) is the arbiter, and any deliberate convention should be documented in code.

### 4.10 Gas switching & MOD

- Each gas has `fO2`, `fHe`; `fN2 = 1 − fO2 − fHe` (derived).
- A gas's **MOD** = depth at which `ppO2 = fO2 * P_amb` reaches the configured limit (`ppO2Switch`). Offer this as a **selectable preset: 1.4 or 1.6 bar**, defaulting to **1.6** (the conventional deco-switch ceiling). Both are common standards — 1.6 at the stop, 1.4 for more conservative teams — so the choice belongs to the user.
- Deco gas switches are **auto-placed at each deco gas's MOD by default**, rounded to a stop depth, with a **manual override** per gas. On switch, the breathed mix changes, which changes inspired N₂/He and therefore off-gassing from that point on.
- A switch happening during ascent applies at the stop where the diver reaches the switch depth.

---

## 5. Data model (TypeScript)

```typescript
type GasMix = {
  id: string;
  name: string;          // "Tx 18/45", "EAN50", "O2"
  fO2: number;           // 0..1
  fHe: number;           // 0..1
  role: 'bottom' | 'deco';
  switchDepth?: number;  // m; if set, manual override of MOD-derived switch
};

type DiveSegment = {     // fixed exposure; ordered. A square dive = one bottom segment.
  id: string;
  depth: number;         // m, target depth of this leg
  time: number;          // min held at this depth (excludes travel)
  gasId: string;
};

type GFSet = {
  id: string;
  name?: string;         // "30/70"
  gfLow: number;         // 0..1 (UI shows 0..100)
  gfHigh: number;        // 0..1
};

type EnvironmentConfig = {
  water: 'salt' | 'fresh';
  surfacePressure: number; // bar, default 1.01325
  ascentRate: number;      // m/min, default 9
  descentRate: number;     // m/min, default 18
  lastStopDepth: number;   // m, default 3
  stopIncrement: number;   // m, default 3
  ppO2Switch: number;      // bar, selectable preset 1.4 | 1.6, default 1.6
};

// ---- engine output ----
type ProfilePoint = { time: number; depth: number };
type CompartmentState = { pN2: number; pHe: number }; // bar; 16 per timestamp
type StopEntry = { depth: number; duration: number }; // min
type CeilingPoint = { time: number; ceiling: number };// ceiling depth, m
type LoadingPoint = {
  time: number;
  compartments: CompartmentState[];   // length 16
  controlling: number;                // index 0..15
};

type GFResult = {
  gfSetId: string;
  profile: ProfilePoint[];     // full depth/time incl. descent, bottom, stops
  stops: StopEntry[];
  firstStopDepth: number;
  totalDecoTime: number;
  tts: number;
  runtime: number;
  ceilingTimeline: CeilingPoint[];
  loadingTimeline: LoadingPoint[];
};

type EngineInput = {
  segments: DiveSegment[];
  gases: GasMix[];
  gfSets: GFSet[];             // 1..3
  env: EnvironmentConfig;
};

type EngineOutput = { results: GFResult[] };  // one per GF set
```

The exposure (`segments` + `gases` + `env`) is **shared and identical across all GF sets**. Only `gfLow`/`gfHigh` differ between results. This is the conceptual heart of the tool and must be obvious in both the code and the UI.

---

## 6. Inputs / UI panels

1. **Dive profile (segment editor).** Multi-level supported in v1. Add / reorder / delete depth+time legs; one bottom segment is the default starting state, so the common case (a square dive) is a single row and zero friction. Each leg picks its breathing gas.
2. **Gas editor.** One bottom gas plus any number of deco gases, entered as O₂/He fractions (trimix notation, e.g. 18/45). Show derived N₂%, MOD at the configured ppO₂, and the auto switch depth (with manual override).
3. **GF sets (up to 3).** Each is a GF Low / GF High pair (sliders + numeric entry), optionally named, with an assigned colour. Sliders drive live recompute (Section 9).
4. **Environment.** Water type (fresh/salt), ascent/descent rates, last stop depth, stop increment, ppO₂ switch limit (selectable 1.4 / 1.6 bar), surface pressure. Sensible defaults pre-filled (Section 4.2 / 4.9).

Units: **metric default, with a metric/imperial toggle** affecting display only.

---

## 7. Visualizations

Build in this order (the diver's own priority ranking). All four read from the same `EngineOutput`. A **global time scrubber** links Views 2–4; the GF sliders drive all four.

### View 1 — Deco profile comparison *(priority 1)*
Depth (Y, increasing **downward**) vs time (X, minutes). Up to 3 GF sets overlaid on shared axes, each in its colour; stops render as horizontal plateaus. The descent + bottom phase is shared and identical; the curves diverge only on ascent. Scrub/hover reads out depth, runtime and current stop per set. Legend carries each set's name + key metrics (first stop, total deco, TTS).

### View 2 — Ceiling over time *(priority 2)*
Ceiling depth (Y, downward) vs time per GF set, with the actual depth profile drawn faintly behind for reference. Makes visible how a lower GF Low deepens the early ceiling and GF High governs the shallow portion.

### View 3 — GF / M-value pressure plot *(priority 3 — the showpiece)*
Compartment inert-gas pressure (Y, bar) vs ambient pressure (X, bar). Draw: the **ambient line** (P_t = P_amb, 45°), the **raw M-value line** for the selected compartment, and the **GF-adjusted line** per GF set. Overlay the **trajectory of the controlling (or selected) compartment** through the dive as a path, with a marker that moves as the time scrubber moves. Defaults to the controlling compartment; user can select any of the 16. Dragging a GF slider visibly **pivots** that set's line between the ambient and M-value lines — this is the single most important "aha" moment in the app, so make it smooth and legible.

### View 4 — Tissue loading over time *(priority 4)*
The 16 compartments as bars (or small multiples), each showing current combined (N₂+He) loading as a percentage of its GF-adjusted M-value at the current ambient pressure. Scrub through time; bars fill/drain; the controlling compartment is highlighted. Lets the user watch fast vs slow compartments on- and off-gas.

---

## 8. Outputs table

Beside the graphs, a compact table — one column per GF set — showing: first stop depth, total decompression time, time-to-surface, runtime, and the full stop schedule (depth → minutes). Figures set in tabular/monospace numerals so they align like an instrument readout.

---

## 9. Interaction & performance

- GF slider drags **recompute all (≤3) sets and morph the views in real time.** Target recompute well under one frame; debounce if a drag stutters. A full 16-compartment integration over a single dive is cheap, so this is achievable.
- Curves **morph** between states rather than snapping — the live causality between a GF change and the profile/ceiling/pressure-plot response *is* the lesson.
- The global scrubber sets a single "current time" shared by Views 2–4 (and optionally a marker in View 1).

---

## 10. Visual design direction — "magnificent" is a requirement

Treat the aesthetic as pedagogy, not polish. Direction agreed with the diver:

- **Instrument, not web form.** The calm, precise authority of a high-end dive computer, elevated to desktop data-viz quality. It should feel like a scientific instrument.
- **Deep dark canvas.** Near-black / deep-navy background so the data glows. **Depth runs downward** on every depth axis — the way divers already read a profile, so the layout mirrors the dive.
- **One consistent visual language across all four views.** The ambient line, raw M-value line, and GF-adjusted lines keep the same colour and weight everywhere, so each view reinforces a single mental model. The raw **M-value line must be visually distinct** (e.g. a stark dashed treatment — "the physical limit") and must never collide with any GF-set colour.
- **GF-set palette encodes risk:** a perceptual sequence from cool (more conservative) to warm (more aggressive). With up to 3 sets, assign hues by relative conservatism of the pair.
- **Motion as teaching.** Real-time morphing on slider drag (Section 9).
- **Tufte-grade restraint.** High data-ink ratio, whisper-faint gridlines, generous breathing room, tabular numerals. The curves and the depth axis carry the composition; nothing else competes.

Implementation should follow the `frontend-design` skill for tokens, type, and spacing. Exact hex values are left to implementation provided the principles above hold.

---

## 11. What keeps it from being a planner

Re-stating, because it is a hard requirement and a few reviewers will probe it: no consumption/SAC/tank maths, no repetitive-dive logic, no surface intervals, no altitude (v1), no import or modelling of a real irregular dive. The disclaimer (Section 1) is always visible. If a feature request would turn this into a planning aid, it belongs in a different product.

---

## 12. Validation plan

Before sharing, cross-check the engine against **Subsurface** (open-source, ZH-L16C + GF, supports trimix and gas switches), which serves as the reference implementation.

- **Reference profiles** (compute in both, compare):
  1. Air, 45 m / 25 min, GF 30/70, salt water.
  2. Trimix 18/45 bottom, 60 m / 20 min, deco gases EAN50 + O₂, GF 30/85, salt water.
  3. A fresh-water profile (e.g. 50 m / 30 min, Tx 21/35, EAN50 deco, GF 40/75) to exercise the fresh-water pressure conversion.
- **Tolerances:** stop depths exact; per-stop times within ±1 min; TTS within ±2 min. Document any systematic offset and its cause (rounding granularity, gas-switch evaluation convention).
- Capture inputs + expected outputs as a **regression fixture** run by Vitest so the engine can't silently drift.

---

## 13. Acceptance criteria

- [ ] Engine is a pure TypeScript module with no UI dependency; passes the regression fixture within tolerance against Subsurface on all three reference profiles.
- [ ] Trimix with ≥2 deco gas switches produces correct switch depths from MOD at the configured ppO₂, with working manual override.
- [ ] Fresh vs salt selector measurably changes computed stops for the same dive.
- [ ] Up to 3 GF sets compute and overlay on shared axes in all four views.
- [ ] Dragging a GF slider recomputes and morphs all views smoothly in real time.
- [ ] Multi-level segment editor: add/reorder/delete legs; single bottom segment is the default.
- [ ] Metric/imperial toggle affects display only, never engine internals.
- [ ] View 3 renders the ambient line, raw M-value line, per-set GF lines, and the controlling-compartment trajectory, with selectable compartment.
- [ ] Outputs table shows first stop, total deco, TTS, runtime, and stop schedule per set.
- [ ] Disclaimer is always visible; About/Limitations panel names the model and constants.
- [ ] Constants match Section 4.1 exactly, with the source cited in code.

---

## 14. Build milestones

1. **Engine + tests** — constants, conversions, Haldane/Schreiner, trimix combining, GF ceiling, ascent algorithm, gas switching. Validate against Subsurface. *Nothing else starts until this passes.*
2. **Data model, state, input panels** — segment editor (multi-level), gas editor, GF sets, environment.
3. **View 1 + outputs table.**
4. **View 2.**
5. **View 3 (showpiece) + global time scrubber.**
6. **View 4.**
7. **Visual polish pass to the Section 10 standard; disclaimer + About panel.**

---

## 15. Fast-follows (noted, not built in v1)

- **Multi-level profiles** are already in v1 per the diver's request; the segment-based engine made this near-free.
- **Altitude diving** — the leading v2 item, important for the cave audience: reduced surface pressure plus pre-dive tissue equilibration to altitude. It is a real modelling change, not a constant swap, which is why it is held out of v1.
- Possible later: export/share a configured comparison by URL; additional inert-gas handling refinements; a "why did this stop appear" annotation layer driven by the controlling compartment.

---

## Appendix — open implementation choices (decide during build)
- View 3 default: auto-show the controlling compartment (recommended) vs. a fixed default compartment; either way, allow selecting any of the 16.
- Integration granularity and rounding: choose to match Subsurface within the Section 12 tolerances; document the choice.
