// The key gate's words (P25u slice S4, J11 and A13): the first thing on the gate is Browse the
// results, with the headline result under it; the key form says where a key comes from, what a
// trial costs (from the official run's records, never a fixed figure), and how to forget the key.
import { describe, expect, it } from 'vitest';
import { costRangeText, keyHints, passLine } from '../src/keygate/hints.ts';

describe('J11: the line under Browse the results', () => {
  it('gives the official run\'s passes over its trials and says the failures are explained', () => {
    expect(passLine({ passes: 88, trials: 120 })).toBe('88 of 120 trials pass; see why each failure happened.');
  });

  it('with no official run it still says what there is to see', () => {
    expect(passLine(null)).toBe('See the tasks, the published trials and why each failure happened.');
  });
});

describe('A13: the hint lines under the key field', () => {
  const tasks = { a: { mean_cost_usd: 1.2 }, b: { mean_cost_usd: 2.37 }, c: { mean_cost_usd: 1.9 } };

  it('the cost of one trial is the range of the tasks\' mean costs, to the cent', () => {
    expect(costRangeText(tasks)).toBe('about $1.20 to $2.37');
    expect(costRangeText({ a: { mean_cost_usd: 1.5 } })).toBe('about $1.50');
    expect(costRangeText({})).toBeNull();
  });

  it('says where to get a key and what a trial costs, then how to forget the key, after where the key goes', () => {
    const lines = keyHints('local-runner', costRangeText(tasks));
    expect(lines.slice(-2)).toEqual([
      'Get a key at console.anthropic.com under API keys. One trial costs about $1.20 to $2.37.',
      'Forget key in the top bar drops it at any time.',
    ]);
    expect(lines[0]).toMatch(/local runner/);
  });

  it('with no cost figure the first sentence stands alone', () => {
    expect(keyHints('browser-direct', null).at(-2)).toBe('Get a key at console.anthropic.com under API keys.');
    expect(keyHints('browser-direct', null)[1]).toMatch(/through a relay that forwards it and keeps no copy/);
  });
});
