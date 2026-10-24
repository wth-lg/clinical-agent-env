// P11f (4), verifier-phase-P14a-4 minor 2 and 3: a REFUSAL or LIMIT comes from the record status,
// so its reason leads with the refusal or limit sentence, also when the grader failed a gate
// check (the real grader grades every trial, so it usually has one); the check follows while it
// fits. M1 is 'not applicable' only on a LIMIT or REFUSAL with no failed gate check, as
// docs/requirements/ui-contract.md says; with a failed check it still asks about exposure.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { explainTrial, formatCriterion, REASON_WORDS, type ExplainContext, type ExplainRecord } from '../explain.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';

const contract = readFileSync(join(repoRoot, 'docs/requirements/ui-contract.md'), 'utf8');
const REASON = new RegExp(/`(\\b\(\?:\[A-Za-z\][^`]*refused: \))`/.exec(contract)![1]!);

const G1 = { id: 'G1', kind: 'gate', method: 'code', category: 'action', points: null, met: false, evidence: { expected: 'apixaban 5 mg 2/day', found: 'apixaban 2.5 mg 2/day' } };
const record = (outcome: 'LIMIT' | 'REFUSAL', failed: boolean): ExplainRecord => ({
  task_id: 'renal-dose-review', task_version: 'v-1', grader_task_version: 'g-1', outcome, valid: true, status: outcome, detail: outcome === 'LIMIT' ? 'turns' : null,
  stop_reason: outcome === 'REFUSAL' ? 'refusal' : null, model_requested: 'claude-opus-5-5', models_returned: ['claude-opus-5-5'], turns: 80,
  tool_errors: { INTERNAL: 0 }, state_hash: { initial: 'h', final: 'f', replay_final: 'f' },
  checks: failed ? [G1] : [],
  attribution: failed ? { auto: outcome === 'LIMIT' ? 'did_not_finish' : 'reasoning', first_failed: 'G1', decisive_step: 9, exposure: [{ id: 'Observation/obs-wt-1', first_exposed_step: 6 }] } : null,
});
const events = {
  LIMIT: [{ v: 2, seq: 1, ts: '2026-10-24T00:00:00.000Z', turn: 80, type: 'limit', limit: 'turns', cap: 80, value: 80 }],
  REFUSAL: [{ v: 2, seq: 1, ts: '2026-10-24T00:00:00.000Z', turn: 1, type: 'response', id: 'msg_1', model: 'claude-opus-5-5', stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: null },
    content: [{ type: 'text', text: 'I cannot help with changing these medication orders because they need a licensed prescriber to sign off first.' }], usage: {}, attempts: 1, cost_usd: 0.01 }],
} as unknown as Record<'LIMIT' | 'REFUSAL', ExplainContext['events']>;
const explain = (outcome: 'LIMIT' | 'REFUSAL', failed: boolean) => explainTrial(record(outcome, failed), undefined, { events: events[outcome], world_state_hash: 'h', exposable: () => true });
const m1 = (x: ReturnType<typeof explainTrial>) => {
  const c = x.criteria.find((r) => r.id === 'M1')!;
  return `${formatCriterion(c)}: ${c.evidence}`;
};

describe('explainTrial: a REFUSAL or LIMIT reason leads with its status sentence', () => {
  it('a LIMIT with a failed check: the limit sentence, then the check; M1 asks about exposure', () => {
    const x = explain('LIMIT', true);
    expect(x.reason).toBe('turn limit reached: 80 turns; G1 failed: expected apixaban 5 mg 2/day, found apixaban 2.5 mg 2/day');
    expect(m1(x)).toBe('M1: met: Observation/obs-wt-1 exposed at step 6');
  });

  it('a REFUSAL with a failed check: the refusal sentence, then the check cut to fit', () => {
    const x = explain('REFUSAL', true);
    expect(x.reason).toMatch(/^refused: I cannot help with changing these medication orders because they need a; G1 failed: expected /);
    expect(x.reason.split(/\s+/).length).toBeLessThanOrEqual(REASON_WORDS);
    expect(x.reason).not.toMatch(/so this is reasoning/);
    expect(m1(x)).toMatch(/^M1: met: /);
  });

  it('a LIMIT or REFUSAL with no failed check: the status sentence alone, and M1 not applicable', () => {
    expect(explain('LIMIT', false).reason).toBe('turn limit reached: 80 turns');
    expect(explain('REFUSAL', false).reason).toBe('refused: I cannot help with changing these medication orders because they need a');
    for (const o of ['LIMIT', 'REFUSAL'] as const) expect(m1(explain(o, false))).toBe('M1: not applicable: no gate check failed');
  });

  it('no LIMIT reason says "so this is did not finish"; every reason matches the contract pattern', () => {
    for (const o of ['LIMIT', 'REFUSAL'] as const) for (const failed of [true, false]) {
      const { reason } = explain(o, failed);
      expect(reason).not.toMatch(/so this is did not finish/);
      expect(reason).toMatch(REASON);
    }
  });

  it('the contract says M1 is not applicable only on a LIMIT or REFUSAL with no failed gate check, and that their reasons lead with the status sentence', () => {
    expect(contract).toContain('M1 shows `M1: not applicable` only on a LIMIT or REFUSAL with no failed gate check');
    expect(contract).toMatch(/a LIMIT or REFUSAL with a failed gate check: its limit or refusal sentence first,\s+then `; <check id> failed: expected <value>, found <value>`/);
  });
});
