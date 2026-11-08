// The Runs row's lead (src/trial/lead.ts, eval-p25u-2 S9): the trial page's plain headline
// (headline.ts plainHeadline, with the kind the header shows and the record's exposure), in place
// of the raw explainTrial sentence; the exact grader sentence stays under it for trace row U31
// without the "; Kind: …" suffix, which the lead already says in words.
import { describe, expect, it } from 'vitest';
import type { Explanation } from '../../../packages/core/explain.ts';
import { exactReason, trialLead } from '../src/trial/lead.ts';

const e = {
  outcome: 'FAIL', valid: true, fault: 'model', label: 'model', label_subtype: null, deciding: null, confirmation: 'confirmed', notes: [], audited: true,
  audit_label: 'model', audit_answers: null, first_failed_check: null, secondary_reason: null, decisive_step: 98, taxonomy: 'retrieval', criteria: [],
  fault_criteria: { infra: [], grader: [], env: [], refusal: [], model: [] },
  decisive_check: { id: 'event_seen', traces_to: null, expected: 'each arrival read', found: 'marchetti_cr_ed (Patient/pt-0064)' },
  reason: 'event_seen failed: expected each arrival read, found marchetti_cr_ed (Patient/pt-0064); Kind: retrieval',
} as unknown as Explanation;
// final-1 results-inbox/10's event_seen item and exposure.
const record = {
  outcome: 'FAIL',
  checks: [{ id: 'event_seen', kind: 'gate', method: 'code', category: 'retrieval', points: null, met: false, items: [{ item: 'marchetti_cr_ed', met: false, why: 'event marchetti-cr-batch arrived at step 41 and was never read before finish', decisive_ids: ['Observation/obs-06209', 'Observation/obs-06210'], evidence: { arrived_at: 41 } }] }],
  attribution: { auto: 'retrieval', first_failed: 'event_seen', decisive_step: 98, exposure: [{ id: 'Observation/obs-06209', first_exposed_step: 71 }, { id: 'Observation/obs-06210', first_exposed_step: null }] },
};

describe('trialLead', () => {
  it('is the trial page\'s plain headline: the kind in words, then who and which records, no internal item id', () => {
    const lead = trialLead(e, record)!;
    expect(lead).toBe('Missed a record it needed: new results for Patient/pt-0064 arrived at step 41. The model opened Observation/obs-06209 at step 71 and never opened Observation/obs-06210.');
    expect(lead).not.toContain('marchetti_cr_ed');
    expect(lead).not.toContain('Kind:');
  });
});

describe('exactReason', () => {
  it('drops the "; Kind: …" suffix and keeps the check, expected and found (U31)', () => {
    expect(exactReason(e.reason)).toBe('event_seen failed: expected each arrival read, found marchetti_cr_ed (Patient/pt-0064)');
    expect(exactReason('event_seen failed: expected x, found y; Kind: retrieval (never shown)')).toBe('event_seen failed: expected x, found y');
    expect(exactReason('turn limit reached: 120 turns')).toBe('turn limit reached: 120 turns');
  });
});
