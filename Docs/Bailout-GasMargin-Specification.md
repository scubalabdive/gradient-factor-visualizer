# Bailout & Minimum-Gas Planner — Specification

**Working title:** *Two Ceilings* (gas ceiling + time ceiling)
**Version:** 1.0 (hand-off to Claude Code)
**Document type:** Implementation specification. This is the contract for what to build.
**Companion to:** `GF-Visualizer-Specification.md` — shares its decompression engine.

---

## 1. Purpose & identity

A tool that answers one question for a planned exposure: **if things go wrong at the worst moment, do I have the gas to get out?** It produces two pre-dive ceilings — one in **bar/litres** (gas) and one in **minutes** (bailout time-to-surface) — and an in-water rule: *dive until the first ceiling is reached, then go up.*

It covers two domains in one tool:

- **OC technical:** minimum gas (back gas to the first breathable source) plus deco-gas adequacy.
- **CCR bailout:** the open-circuit bailout ascent from a loop failure at the bottom, end of bottom time.

### Core identity — decision-support aid

This is **not** the GF Visualizer's "educational only, never a planner" posture, and the difference is deliberate and inverted. This tool **does** produce actionable figures: required gas, available gas, margins, reserves. What it does **not** do is issue a verdict you switch off your judgement for. It computes and lays out the numbers and the reasoning; the diver makes the go/no-go call against their own training, planning, and team standards.

The practical line:
- **In scope (and forbidden in the visualizer):** required-vs-available comparison, reserve arithmetic, per-cylinder margins, a clearly-bounded margin readout.
- **Out of scope:** a single authoritative GO/NO-GO light, any claim of safety, anything that invites the diver to stop thinking. The tool informs a decision; it does not make one.

### Required disclaimer

Persistent and visible: **"Decision-support tool. Figures depend on the inputs you provide and the assumptions stated. Verify against your own planning, training, and judgement. Not a substitute for proper dive planning."** Plus an About/Limitations panel naming the model, the constants, the gas-model assumptions (Section 4.3), and the per-cylinder shareability in force.

### Non-goals

- No tank-sizing recommendations or fill advice — it works from the cylinders you declare.
- No repetitive dives, surface intervals, or residual-gas carry-over.
- No altitude in v1 (inherited limitation; v2 fast-follow when the shared engine gains it).
- No CC-TTS gas rationing — bailout is always rationed against the **OC bailout TTS** (Section 4.6).

---

## 2. Users & distribution

Same audience and rationale as the visualizer: technical and cave/CCR diving professionals, peer-reviewed before any wider release. Web app, link-shareable, cross-platform. Credibility with an expert audience is the bar — auditable constants, explicit conventions, and a gas model that a reviewer can check by hand.

---

## 3. Tech stack & the shared engine

- **React 18 + TypeScript + Vite**, matching the visualizer so the two are siblings, not strangers.
- **Monorepo** (npm / pnpm workspaces):
  - `packages/deco-engine` — the pure ZHL-16C+GF engine, extracted from the visualizer and consumed by **both** apps. No DOM, no React, no gas logic. Its purity rule is unchanged and now load-bearing for two products.
  - `packages/gas-model` — this tool's new pure layer: gas demand from a schedule, minimum gas, deco adequacy, bailout volumes. Depends on `deco-engine`, knows nothing about the UI.
  - `apps/gf-visualizer` and `apps/gas-planner`.
- **State:** Zustand or context — light.
- **Tests:** Vitest. The shared engine keeps the visualizer's regression fixture; `gas-model` ships its own (Section 9).

**Critical shared-engine consequence.** This tool requires a CCR setpoint-loading mode in the engine (Section 4.2). That code lands in the shared `deco-engine` package. Adding it means the **visualizer's existing regression fixture must be re-run and must still pass** — the OC paths must be untouched. The engine's test gate now protects both apps; treat any change to `deco-engine` as a change to both products.

---

## 4. The math

The deco schedule comes from the shared engine. Everything in this section that is *new* lives in `packages/gas-model`, except 4.2 which is an addition to `deco-engine`.

### 4.1 Shared engine boundary (unchanged)

The engine computes, for a given exposure + gases + GF set + environment, the full schedule: profile, stops, first-stop depth, TTS, runtime, ceiling timeline, and the per-compartment loading timeline (`GFResult`, see visualizer §5). The gas model treats this as read-only input. **Bar and minutes internally**; unit conversion stays at the UI boundary.

### 4.2 CCR loading extension (the one engine addition)

The visualizer engine derives inspired inert gas from the breathed **open-circuit** mix (its §4.3). On a closed-circuit rebreather the loop holds a constant **ppO₂ setpoint** `S` (bar) and the **diluent** supplies the inert gases. During the CC dive phase, inspired inert pressures are:

```
ppInert_total = max(0, P_amb - P_H2O - S)        // O2 takes the setpoint; inert fills the rest
inertRatio_N2 = fN2_dil / (fN2_dil + fHe_dil)
inertRatio_He = fHe_dil / (fN2_dil + fHe_dil)
P_inspired_N2 = ppInert_total * inertRatio_N2
P_inspired_He = ppInert_total * inertRatio_He
```

with `fN2_dil = 1 - fO2_dil - fHe_dil`. **Shallow-water guard:** when the diluent alone cannot supply the setpoint (`fO2_dil * (P_amb - P_H2O) > S`), the loop cannot hold setpoint; fall back to the diluent acting as an OC mix at that depth. For the bottom phase at depth this guard rarely fires, but it must be present and documented.

Loading then proceeds through the **same Haldane/Schreiner integration and the same trimix a/b combining** as the OC engine — only the inspired-gas function differs. This is implemented as a per-segment **loading mode** flag (`oc | ccr-setpoint`) on the engine, defaulting to `oc` so the visualizer is unaffected. Match a reference CCR planner's setpoint convention (Section 9) and document it.

### 4.3 Gas demand from a schedule (the core of `gas-model`)

For any breathed segment — a stop or a travel leg — at average ambient pressure `P̄` (bar) for duration `t` (min) at respiratory minute volume `RMV` (surface L/min):

```
gas_litres = RMV * t * P̄
```

- **Stop at fixed depth `d`:** `P̄ = P_amb(d)`.
- **Travel `d1 → d2`:** `P̄ = P_amb((d1 + d2) / 2)` — mean-depth approximation, the gas-planning standard. (Optionally integrate to match the engine's step; document whichever is chosen — it moves volumes by a percent or two.)

Sum per **cylinder**, assigning each schedule segment to the gas/cylinder breathed there. `P_H2O` is **not** subtracted for gas-volume purposes — this is delivered gas at ambient, not alveolar inert pressure.

### 4.4 OC minimum gas (to the first breathable source)

Minimum gas is computed on **shareable** cylinders (Section 4.8) using the **team-combined** RMV — its entire reason for existing is "buddy is out, both breathe my donatable gas to the first switch":

```
combinedRMV   = shareable ? (RMV_self + RMV_buddy) : RMV_self
event_litres  = combinedRMV * stress * (t_problem + t_ascent_to_first_switch) * P̄_event
min_gas_bar   = ceil( event_litres / V_backgas_litres )
```

- Shareable cylinders carry a spare second stage to donate while the donor keeps breathing (e.g. sidemount bottom gas, two regs). They get the **combined** RMV.
- Non-shareable cylinders (single second stage — all deco, all CCR bailout) get **self only**: donating them cuts off the donor, so they are not planned as a shared source.
- `t_problem` — time to recognise and act on the failure at depth (small fixed default, user-editable).
- `t_ascent_to_first_switch` — depth ÷ ascent rate, from target depth to the first OC gas switch.
- `P̄_event` — average ambient pressure over the event (problem time at depth + the ascent). Mean-depth weighted.
- `V_backgas_litres` — declared total water capacity of the shareable back gas.

`min_gas_bar` is the **gas ceiling** for the descent-to-first-switch phase: while above it, you can get a gas-sharing pair to the next breathable source. Touch it → ascend.

### 4.5 OC deco-gas adequacy

For each deco gas, from the current GF-driven schedule:

```
required_litres = RMV_deco * Σ over that gas's stops ( t_i * P̄_i )
margin_litres   = available_litres - required_litres - reserve_litres
```

Also expose the **inverse** (the max-TTS flip): the most stop time each deco gas supports, `max_stop_time = (available - reserve) / (RMV_deco * P̄_band)`, folded with the engine's schedule into a **max bailout/deco TTS** ceiling (Section 4.7). Show both required-vs-available *and* the time ceiling — the audience reasons in both.

### 4.6 CCR bailout-at-bottom

Worst case by construction: loop failure at **maximum depth, end of bottom time** — maximum tissue loading, longest obligation.

1. **Load** descent + bottom time using CCR setpoint loading (4.2), breathing diluent at setpoint `S`.
2. **Trigger OC bailout** at end of bottom time: run the shared engine's **OC ascent algorithm** from that loaded tissue state, breathing the **carried bailout gases** (bottom bailout, then deco bailouts auto-placed at their MODs per the visualizer's §4.10), at the chosen GF set.
3. **Sum gas per bailout cylinder** over the resulting schedule (4.3) at `RMV_bailout`.
4. **Compare** required + reserve vs available, **per cylinder**. The binding constraint is normally the deepest bailout cylinder (longest run before the first switch) — the CCR analogue of OC minimum gas.
5. The bailout schedule's runtime is the **OC bailout TTS** — the time ceiling. **Never** the CC-TTS the handset shows on the loop; label this explicitly in the UI.

GF interaction is the shared-engine payoff: the bailout schedule responds to GF Low/High exactly as any OC profile does, so the tool shows the bailout requirement grow and shrink as GF changes — the bridge back to the visualizer.

### 4.7 The two-ceilings synthesis

Present, for the chosen GF set and target depth:

- **Gas ceiling** — the bar/litre threshold (OC: minimum gas; CCR: the reserve that still covers the full OC bailout) below which you must leave.
- **Time ceiling** — the **max OC (bailout) TTS** the carried deco/bailout gas supports.

In-water rule, stated plainly in the UI: *monitor available gas and TTS; the dive ends when either reaches its ceiling, whichever comes first.* With the standing caveat that both ceilings are computed **for the target depth** — drift significantly deeper and both are invalid; recompute.

### 4.8 Shareability — per cylinder, not a global philosophy

Whether a cylinder can be planned as a **shared** gas source is a property of its rigging, not a mode the diver picks once: it follows the **number of donatable second stages.**

- **Shareable** — a spare second stage to hand over while the donor keeps breathing. Typical case: sidemount **bottom gas**, two independent cylinders each with its own regulator. One reg fails, the diver is on the other; the remote double-failure is covered by the buddy donating one of *their* two regs. Min gas on these uses the **team-combined** RMV (Section 4.4).
- **Non-shareable** — a single second stage. **All deco cylinders and all CCR bailout/diluent cylinders** fall here: donating the reg cuts the donor off their own supply. The "one breath, pass it back" exchange exists but is not planned around. These are sized **independent** (self only).

Each `Cylinder` carries a `shareable: boolean`, **defaulted from role** (`backgas → true`, everything else → `false`) and **user-overridable** per cylinder. CCR therefore comes out fully independent by default with no special case — nothing in that config has a spare reg — while OC bottom gas defaults to team. `RMV_self` / `RMV_buddy` / `RMV_bailout` are the relevant (stress-elevated) rates; `stress` is an explicit multiplier, default 1.0.

**For peer review:** the team-combined figure on shareable bottom gas is roughly double the self-only figure, so it is not a rounding choice — it is the crux of the minimum-gas concept (reserve enough to donate to an out-of-gas buddy to the first switch). v1 defaults bottom gas to team because the target rigging (SM doubles, cave context) supports donation; the per-cylinder override lets a diver who treats double-failure as not-pre-reserved drop a cylinder to self-only deliberately.

---

## 5. Data model (TypeScript)

Reuses the visualizer's `GasMix`, `DiveSegment`, `GFSet`, `EnvironmentConfig`, and `GFResult` from the shared engine. Additions:

```typescript
type LoadingMode = 'oc' | 'ccr-setpoint';

type CCRConfig = {
  setpoint: number;        // bar ppO2, e.g. 1.3
  diluentGasId: string;    // references a GasMix used as diluent
};

type Cylinder = {
  id: string;
  gasId: string;           // gas it carries
  volume: number;          // litres water capacity
  fillPressure: number;    // bar; available = volume * fillPressure
  role: 'backgas' | 'bottom-bailout' | 'deco-bailout';
  shareable: boolean;      // donatable spare second stage; default from role
                           //   (backgas → true, else false), user-overridable
};

type GasParams = {
  mode: 'oc' | 'ccr';
  rmvSelf: number;         // L/min, diver's own (stress-elevated where used)
  rmvBuddy: number;        // L/min, buddy's rate — used only on shareable cyls
  rmvDeco: number;         // L/min, OC deco
  rmvBailout: number;      // L/min, CCR bailout (stress-elevated)
  stress: number;          // multiplier, default 1.0
  problemTime: number;     // min at depth before ascent, default e.g. 1
  reserveBar: number;      // user reserve per cylinder (or rock-bottom)
  ccr?: CCRConfig;         // present when mode === 'ccr'
};

// ---- gas-model output ----
type CylinderResult = {
  cylinderId: string;
  requiredLitres: number;
  availableLitres: number;
  reserveLitres: number;
  marginLitres: number;            // available - required - reserve
  binding: boolean;                // is this the constraining cylinder?
};

type GasResult = {
  gfSetId: string;
  gasCeilingBar: number;           // min gas (OC) / bailout reserve threshold (CCR)
  timeCeilingTts: number;          // max OC/bailout TTS supported, min
  bailoutTts: number;              // OC bailout TTS for the current schedule, min
  perCylinder: CylinderResult[];
};

type GasEngineOutput = { results: GasResult[] };   // one per GF set
```

The exposure + gases + cylinders + `GasParams` are shared across GF sets; only the GF pair varies — mirroring the visualizer's central idea, so a reviewer reads the two specs the same way.

---

## 6. Inputs / UI panels

1. **Mode selector** — OC technical | CCR bailout. Switches which fields and which math (4.4–4.5 vs 4.6) are active.
2. **Exposure** — reuse the visualizer's multi-level segment editor; a square dive is one row. (CCR: bottom segments are loop-on at setpoint.)
3. **Gases & cylinders** — each gas as O₂/He fractions with derived N₂%, MOD, auto switch depth (manual override). Each cylinder: gas, volume (L), fill (bar), role. CCR mode adds **diluent** + **setpoint**.
4. **Gas parameters** — RMVs (self, buddy, deco, bailout), stress multiplier, problem time, reserve. **Shareability is set per cylinder** in the cylinder editor (toggle, defaulted from role), not as a global mode. Sensible defaults pre-filled; everything visible and editable, nothing hidden.
5. **GF sets (up to 3)** — same control as the visualizer, so you can see how conservatism moves the gas and time ceilings.

Units: metric default, metric/imperial display toggle; engine internals untouched.

---

## 7. Outputs / the readout

A compact, instrument-grade panel per GF set:

- **Gas ceiling** (bar) and **time ceiling** (min), large and unambiguous.
- **Per-cylinder table** — required / available / reserve / margin, the binding cylinder marked. Tabular numerals.
- **The bailout (or min-gas) schedule** it was computed from — depths, times, gas per segment — so the figure is auditable, not a black box.
- A one-line restatement of the in-water rule and the target-depth caveat.

Every figure carries its assumptions inline (RMV, stress, reserve, shareable y/n) — a decision-support number is only as good as the stated inputs beside it.

---

## 8. Decision-support guardrails

What keeps it a decision *aid*, not an oracle:

- **No GO/NO-GO light, no "you are safe."** Margins and ceilings, framed as information.
- **Assumptions travel with the number** — never a bare figure.
- **The schedule behind every figure is shown** — auditable by hand.
- The About panel names the model, constants, the CCR setpoint convention, the gas-model approximations (mean-depth, no `P_H2O` subtraction for delivered gas), and which cylinders are treated as shareable.

---

## 9. Validation plan

The deco schedule is already validated by the shared engine's existing fixture. Validate the **new** surfaces:

- **CCR setpoint loading** — against a reference CCR planner (Shearwater desktop / MultiDeco CCR). Same dive + bailout; compare the OC-bailout schedule (stops, TTS).
- **Gas volumes** — by hand calculation (4.3 is simple arithmetic) and against the planner's gas figures where it produces them.

Reference scenarios (compute in both, capture as a Vitest fixture):

1. **OC trimix** — 45 m bottom, deco EAN50 (21 m) + O₂ (6 m), salt, GF 30/85. Min gas + per-deco-gas adequacy.
2. **CCR** — 60 m, Tx diluent, setpoint 1.3, bailout = bottom bailout + EAN50 + O₂, bailout-at-bottom, GF 30/85. Compare bailout TTS and per-cylinder volumes.
3. **Fresh-water** case to exercise the shared pressure conversion.

Tolerances: deco schedule per the engine's existing tolerances; **gas volumes within ~5%** (mean-depth vs integrated, rounding). Document any systematic offset and its cause.

---

## 10. Acceptance criteria

- [ ] Shared `deco-engine` gains a `ccr-setpoint` loading mode; **visualizer regression fixture still passes unchanged**.
- [ ] `gas-model` is a pure module (no UI), with its own passing fixture against the reference planner within tolerance.
- [ ] OC mode produces minimum gas (to first switch) and per-deco-gas required-vs-available with margins.
- [ ] CCR mode produces a bailout-at-bottom (end of bottom time) OC ascent, per-cylinder required/available/margin, with the binding cylinder identified.
- [ ] Both ceilings (gas in bar, time as **OC bailout TTS**) are shown per GF set; CC-TTS is never used for the gas figure and is labelled as such.
- [ ] Dragging a GF slider recomputes both ceilings and per-cylinder figures.
- [ ] Fresh vs salt measurably changes gas figures for the same dive.
- [ ] Shareability is per-cylinder (toggle, defaulted from role, user-overridable); min gas uses team-combined RMV on shareable cylinders and self-only on the rest; the rule is stated in the About panel.
- [ ] Every output figure shows its assumptions inline; the schedule behind it is displayed.
- [ ] No GO/NO-GO verdict anywhere; disclaimer always visible.

---

## 11. Build milestones

1. **Monorepo + engine extraction** — move `deco-engine` to a shared package; both apps build against it; visualizer fixture green.
2. **CCR loading mode** in the engine + its validation against the reference planner. *Nothing CCR-facing starts until this passes.*
3. **`gas-model`** — demand (4.3), OC min gas (4.4), deco adequacy (4.5), CCR bailout (4.6), two-ceiling synthesis (4.7), with fixture.
4. **Input panels** — mode, exposure (reuse), gases/cylinders, gas params, GF sets.
5. **Readout** — ceilings, per-cylinder table, the schedule behind each figure, inline assumptions.
6. **GF coupling** — live recompute on slider drag; the bailout-grows-and-shrinks demonstration.
7. **Polish + About/Limitations + disclaimer**, to the visualizer's visual standard.

---

## 12. Fast-follows (noted, not built in v1)

- **Donation modelling on single-reg cylinders** — the "one breath, pass it back" exchange on deco/bailout bottles. v1 treats these as strictly independent; a future mode could model partial sharing if a team wants it (with appropriate scepticism about planning around it).
- **Bailout from other points** — not just bottom/end-of-bottom; let the diver test a failure mid-ascent.
- **Altitude** — arrives when the shared engine gains it (v2 there too).
- **Shared link / export** of a configured comparison.
- A **side-by-side with the visualizer** — same exposure, deco curves and gas ceilings in one view — once both apps are stable.
