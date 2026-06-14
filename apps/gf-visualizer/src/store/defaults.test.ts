import { describe, expect, it } from 'vitest';
import { runEngine } from '@gf/deco-engine';
import { DEFAULT_ENVIRONMENT, DEFAULT_GASES, DEFAULT_GF_SETS, DEFAULT_SEGMENTS } from './defaults';

describe('default exposure', () => {
  it('runs through the engine and yields one result per GF set', () => {
    const { results } = runEngine({
      segments: DEFAULT_SEGMENTS,
      gases: DEFAULT_GASES,
      gfSets: DEFAULT_GF_SETS,
      env: DEFAULT_ENVIRONMENT,
    });
    expect(results).toHaveLength(DEFAULT_GF_SETS.length);
    expect(results[0]!.runtime).toBeGreaterThan(0);
  });
});
