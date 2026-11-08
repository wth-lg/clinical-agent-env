// The Runs row's lead (src/trial/lead.ts, eval-p25u-2 S9): the trial page's plain headline
// (headline.ts plainHeadline, with the kind the header shows and the record's exposure), in place
// of the raw explainTrial sentence; the exact grader sentence stays under it for trace row U31
// without the "; Kind: …" suffix, which the lead already says in words.
import { describe, expect, it } from 'vitest';
import type { Explanation } from '../../../packages/core/explain.ts';
import { arrivalsOf, exactReason, trialLead } from '../src/trial/lead.ts';

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

// final-1 renal-dose-review/4: fairweather-scr-batch fired after step 41 and filed enc-04001,
// obs-04003, obs-04004 and the inbox row inbox-a0002; the model read obs-04003 at step 74 and
// enc-04001 at step 78 and never obs-04004 (eval-p25u-final-F2 must-fix 1).
const renalE = { ...e, decisive_check: { id: 'event_seen', traces_to: null, expected: 'each arrival read', found: 'Patient/pt-0062 (Norman Fairweather) had an arrival that was never opened before the review finished' } } as unknown as Explanation;
const renalRecord = {
  outcome: 'FAIL',
  checks: [{ id: 'event_seen', kind: 'gate', method: 'code', category: 'retrieval', points: null, met: false, items: [{ item: 'Patient/pt-0062', met: false, why: 'event fairweather-scr-batch arrived at step 41 and was never read before finish', decisive_ids: ['Observation/obs-04004'], evidence: { arrived_at: 41 }, event: 'fairweather-scr-batch' }] }],
  attribution: { auto: 'retrieval', first_failed: 'event_seen', decisive_step: 98, exposure: [{ id: 'Observation/obs-04004', first_exposed_step: null }] },
};
const renalTrajectory = {
  rows: [
    { kind: 'arrival', spec: 'delgado-scr-amended', keys: ['Observation/obs-00249', 'Task/inbox-a0001'], step: 29 },
    { kind: 'arrival', spec: 'fairweather-scr-batch', keys: ['Encounter/enc-04001', 'Observation/obs-04003', 'Observation/obs-04004', 'Task/inbox-a0002'], step: 41 },
    { kind: 'tool', step: 74 },
  ],
  steps: [
    { n: 22, exposed_ids: ['Observation/obs-00249'] },
    { n: 73, exposed_ids: ['Observation/obs-00249'] },
    { n: 74, exposed_ids: ['Observation/obs-04003'] },
    { n: 78, exposed_ids: ['Encounter/enc-04001'] },
  ],
};

describe('arrivalsOf', () => {
  it('lists each arrival with its records, the inbox row left out, and the first step after the arrival that showed each', () => {
    expect(arrivalsOf(renalTrajectory)).toEqual([
      { spec: 'delgado-scr-amended', records: [{ id: 'Observation/obs-00249', opened_step: 73 }] },
      { spec: 'fairweather-scr-batch', records: [{ id: 'Encounter/enc-04001', opened_step: 78 }, { id: 'Observation/obs-04003', opened_step: 74 }, { id: 'Observation/obs-04004', opened_step: null }] },
    ]);
  });
});

describe('trialLead with the trajectory', () => {
  it('names what the model opened of the arrival and what it never opened (final-1 renal-dose-review/4)', () => {
    expect(trialLead(renalE, renalRecord, renalTrajectory)).toBe('Missed a record it needed: new records for Patient/pt-0062 (Norman Fairweather) arrived at step 41. The model opened Observation/obs-04003 at step 74 and Encounter/enc-04001 at step 78. It never opened Observation/obs-04004.');
  });
  it('with the record alone (the Runs row), names the deciding record never opened, not the whole arrival', () => {
    expect(trialLead(renalE, renalRecord)).toBe('Missed a record it needed: the model never opened Observation/obs-04004, a new result for Patient/pt-0062 (Norman Fairweather) that arrived at step 41.');
  });
});

describe('exactReason', () => {
  it('drops the "; Kind: …" suffix and keeps the check, expected and found (U31)', () => {
    expect(exactReason(e.reason)).toBe('event_seen failed: expected each arrival read, found marchetti_cr_ed (Patient/pt-0064)');
    expect(exactReason('event_seen failed: expected x, found y; Kind: retrieval (never shown)')).toBe('event_seen failed: expected x, found y');
    expect(exactReason('turn limit reached: 120 turns')).toBe('turn limit reached: 120 turns');
  });
});
