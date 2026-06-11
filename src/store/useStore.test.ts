import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './useStore';

const reset = () =>
  useStore.setState({
    gfSets: [
      { id: 'a', gfLow: 0.3, gfHigh: 0.7, enabled: true },
      { id: 'b', gfLow: 0.4, gfHigh: 0.85, enabled: true },
    ],
  });

describe('toggleGFSet', () => {
  beforeEach(reset);

  it('hides then shows a set', () => {
    useStore.getState().toggleGFSet('b');
    expect(useStore.getState().gfSets.find((g) => g.id === 'b')!.enabled).toBe(false);
    useStore.getState().toggleGFSet('b');
    expect(useStore.getState().gfSets.find((g) => g.id === 'b')!.enabled).toBe(true);
  });

  it('refuses to hide the last visible set (≥1 stays on the graphs)', () => {
    useStore.getState().toggleGFSet('b'); // only 'a' visible now
    useStore.getState().toggleGFSet('a'); // attempt to hide the last → no-op
    expect(useStore.getState().gfSets.find((g) => g.id === 'a')!.enabled).not.toBe(false);
  });
});
