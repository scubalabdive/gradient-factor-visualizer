// ─────────────────────────────────────────────────────────────────────────────
// ZH-L16C tissue constants (spec Section 4.1) — PIN THESE EXACTLY.
//
// Model: Bühlmann ZH-L16C for nitrogen, ZH-L16 (A) for helium, with Erik Baker
// gradient factors. 16 tissue compartments.
//
// SOURCE (cited per spec, for reviewer audit):
//   A. A. Bühlmann, "Tauchmedizin" (Springer, 2002), as tabulated on the
//   Bühlmann decompression algorithm reference (the standard ZH-L16C N₂ set and
//   ZH-L16A He set). The values below are transcribed directly from spec
//   Section 4.1 Table — halftimes in minutes; a in bar; b dimensionless.
//
// Coefficient meanings (Workman/Baker form, bar·minute units):
//   h  = compartment halftime (minutes)
//   a  = intercept of the M-value line (bar)
//   b  = reciprocal slope of the M-value line (dimensionless)
//   M(P_amb) = a + P_amb / b
// ─────────────────────────────────────────────────────────────────────────────

export const COMPARTMENT_COUNT = 16;

/** Nitrogen halftimes (min), ZH-L16C — spec 4.1 column hN₂. */
export const HALFTIME_N2: readonly number[] = [
  5.0, 8.0, 12.5, 18.5, 27.0, 38.3, 54.3, 77.0, 109.0, 146.0, 187.0, 239.0, 305.0, 390.0, 498.0,
  635.0,
];

/** Nitrogen a-coefficients (bar), ZH-L16C — spec 4.1 column aN₂. */
export const A_N2: readonly number[] = [
  1.1696, 1.0, 0.8618, 0.7562, 0.62, 0.5043, 0.441, 0.4, 0.375, 0.35, 0.3295, 0.3065, 0.2835, 0.261,
  0.248, 0.2327,
];

/** Nitrogen b-coefficients (dimensionless), ZH-L16C — spec 4.1 column bN₂. */
export const B_N2: readonly number[] = [
  0.5578, 0.6514, 0.7222, 0.7825, 0.8126, 0.8434, 0.8693, 0.891, 0.9092, 0.9222, 0.9319, 0.9403,
  0.9477, 0.9544, 0.9602, 0.9653,
];

/** Helium halftimes (min), ZH-L16A — spec 4.1 column hHe. */
export const HALFTIME_HE: readonly number[] = [
  1.88, 3.02, 4.72, 6.99, 10.21, 14.48, 20.53, 29.11, 41.2, 55.19, 70.69, 90.34, 115.29, 147.42,
  188.24, 240.03,
];

/** Helium a-coefficients (bar), ZH-L16A — spec 4.1 column aHe. */
export const A_HE: readonly number[] = [
  1.6189, 1.383, 1.1919, 1.0458, 0.922, 0.8205, 0.7305, 0.6502, 0.595, 0.5545, 0.5333, 0.5189,
  0.5181, 0.5176, 0.5172, 0.5119,
];

/** Helium b-coefficients (dimensionless), ZH-L16A — spec 4.1 column bHe. */
export const B_HE: readonly number[] = [
  0.477, 0.5747, 0.6527, 0.7223, 0.7582, 0.7957, 0.8279, 0.8553, 0.8757, 0.8903, 0.8997, 0.9073,
  0.9122, 0.9171, 0.9217, 0.9267,
];

/** Per-gas decay constant k = ln(2) / halftime (spec 4.1). Precomputed. */
export const K_N2: readonly number[] = HALFTIME_N2.map((h) => Math.LN2 / h);
export const K_HE: readonly number[] = HALFTIME_HE.map((h) => Math.LN2 / h);

// ─────────────────────────────────────────────────────────────────────────────
// Physical / environmental constants (spec Sections 4.2 / 4.3).
// ─────────────────────────────────────────────────────────────────────────────

/** Standard gravity (m/s²) — spec 4.2. */
export const G = 9.80665;

/** Salt water density (kg/m³) — spec 4.2 (→ ≈ 0.10101 bar/m). */
export const RHO_SALT = 1030;

/** Fresh water density (kg/m³) — spec 4.2 (→ ≈ 0.09807 bar/m). */
export const RHO_FRESH = 1000;

/** Default sea-level surface pressure (bar) — spec 4.2. */
export const P_SURFACE_DEFAULT = 1.01325;

/** Alveolar water-vapour pressure (bar), RQ = 1 simplification — spec 4.3. */
export const P_H2O = 0.0627;

// ─────────────────────────────────────────────────────────────────────────────
// Documented convention constants (see plan / Section 4 notes).
// ─────────────────────────────────────────────────────────────────────────────

/** Fraction of N₂ in atmospheric air used to seed surface-saturated tissues.
 *  CONVENTION: 0.7808 (true atmospheric N₂). Note that a breathing "air" mix is
 *  entered by the user as fO₂=0.21 → fN₂=0.79 (spec's fN2 = 1−fO2−fHe), so the
 *  pre-dive saturation gas (0.7808) and breathing air (0.79) differ very slightly.
 *  This is a documented, isolated knob and a minor offset source vs Subsurface
 *  (which uses ≈0.78126). */
export const N2_FRACTION_ATMOSPHERIC = 0.7808;
