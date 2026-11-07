// Repeated reasons in a Runs list (P25c, Runs minor): a later row of the same task with the same
// reason names the first row that shows it, so the sentence appears once per group.
import { describe, expect, it } from 'vitest';
import { repeatedReasons } from '../src/runs/repeats.ts';

const row = (name: string, task: string, reason: string, faulted = true) => ({ name, task, reason, faulted });

describe('repeatedReasons', () => {
  it('maps each later row to the first row of its task with the same reason', () => {
    const rows = [row('a/0', 'a', 'x failed'), row('a/1', 'a', 'y failed'), row('a/2', 'a', 'x failed'), row('b/0', 'b', 'x failed'), row('b/1', 'b', 'x failed')];
    expect([...repeatedReasons(rows)]).toEqual([['a/2', 'a/0'], ['b/1', 'b/0']]);
  });
  it('ignores rows that show no reason', () => {
    const rows = [row('a/0', 'a', 'x failed', false), row('a/1', 'a', 'x failed'), row('a/2', 'a', 'x failed')];
    expect([...repeatedReasons(rows)]).toEqual([['a/2', 'a/1']]);
  });
});
