// ─────────────────────────────────────────────────────────────────────────────
// Top-level engine entry point.
//
// Runs the shared exposure once PER GF SET and returns one GFResult each
// (spec Section 5). The exposure (segments + gases + env) is identical across GF
// sets — this is the conceptual heart of the tool: hold the dive constant, vary
// only GF Low / GF High.
// ─────────────────────────────────────────────────────────────────────────────

import { computeProfileForGFSet } from './ascent';
import { DEFAULT_ENV } from './types';
import type { EngineInput, EngineOutput, EnvironmentConfig } from './types';

/** Fill any missing environment fields with the spec defaults (Sections 4.2/4.9). */
function withEnvDefaults(env: Partial<EnvironmentConfig> | undefined): EnvironmentConfig {
  return { ...DEFAULT_ENV, ...(env ?? {}) };
}

/**
 * Compute decompression results for every GF set against the shared exposure.
 *
 * Pure function: no DOM, no React, no I/O. Inputs and outputs are plain data
 * (spec Section 5). Throws on malformed input (unknown gas id, no gases, etc.).
 */
export function runEngine(input: EngineInput): EngineOutput {
  if (input.gfSets.length < 1 || input.gfSets.length > 3) {
    throw new Error(`runEngine: expected 1..3 GF sets, got ${input.gfSets.length}`);
  }
  if (input.segments.length < 1) {
    throw new Error('runEngine: at least one dive segment is required');
  }
  if (input.gases.length < 1) {
    throw new Error('runEngine: at least one gas is required');
  }

  const env = withEnvDefaults(input.env);
  const results = input.gfSets.map((gfSet) =>
    computeProfileForGFSet(input.segments, input.gases, gfSet, env),
  );
  return { results };
}
