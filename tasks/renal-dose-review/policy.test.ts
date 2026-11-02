// RBC-PHARM-07 carries the arrivals sentence every task's policy shares word for word
// (plan-amendment-w4, Event mechanism table, row "Policy sentence"), and no policy sentence names an
// item: a list patient, an item's arrival, or a value only one item holds (rulings R11).
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { expected } from './expected.ts';

const POLICY = (await nodeTaskSource({ testMode: false }).get('renal-dose-review')).policies.map((p) => p.text).join('\n');
export const ARRIVALS_SENTENCE =
  'Results, corrections and messages can arrive in your queues while you work. Before you finish, review anything that arrived after you started. If it changes a decision you already recorded under this protocol, correct that decision (change, hold or stop the order, or send a corrected message) and record why. If it does not change the decision under this protocol, leave the decision in place.';

describe('RBC-PHARM-07 text', () => {
  it('holds the shared arrivals sentence word for word, once', () => {
    expect(POLICY.split(ARRIVALS_SENTENCE).length - 1).toBe(1);
  });

  it('names no list patient and no arrival-only fact (rulings R11)', () => {
    const lower = POLICY.toLowerCase();
    const named = [...expected.items.flatMap((x) => [x.name, ...x.name.split(' '), x.patient.split('/')[1]!]), 'aspergill', 'pneumonia', 'amended', '185', '118', '1.25', '1.85', '10/'];
    expect(named.filter((w) => lower.includes(w.toLowerCase()))).toEqual([]);
  });
});
