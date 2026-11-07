// The trial header's plain lines (P25u S3, J2, J8b, J20): the headline a non-specialist can read,
// built from the kind of failure and the decisive gate check's first failed item; the one sentence
// that says why the fault is the model's, from the confirmation criteria; and the confirmation
// phrase every screen shares (copy rule C5: "confirmed by the record (M1–M4) and the human audit
// (M5)"). Pure, so the e2e specs can import it too.
import { describe, expect, it } from 'vitest';
import type { Explanation } from '../../../packages/core/explain.ts';
import { confirmationWords, faultWhy, plainHeadline } from '../src/trial/headline.ts';

const base = (over: Partial<Explanation>): Explanation => ({
  outcome: 'FAIL',
  valid: true,
  fault: 'model',
  label: 'model',
  label_subtype: null,
  deciding: { fault: 'model', id: 'MF1', evidence: 'current outcome FAIL, event_seen failed' },
  confirmation: 'confirmed',
  notes: [],
  audited: true,
  audit_label: 'model',
  audit_answers: null,
  decisive_check: { id: 'event_seen', traces_to: 'RBC-RAD-07', expected: 'each result or report that arrived during the trial opened', found: 'Patient/pt-0047 (Britt Vincenzo Mohr, 08:00)' },
  first_failed_check: null,
  secondary_reason: null,
  decisive_step: 104,
  taxonomy: 'retrieval',
  reason: 'event_seen failed: expected ..., found Patient/pt-0047 (Britt Vincenzo Mohr, 08:00); Kind: retrieval',
  criteria: [
    { id: 'M1', met: true, evidence: 'Observation/obs-07502 exposed at step 75' },
    { id: 'M2', met: true, evidence: '0 INTERNAL tool errors' },
    { id: 'M3', met: true, evidence: 'initial equals the manifest' },
    { id: 'M4', met: true, evidence: 'oracle passes' },
    { id: 'M5', met: true, evidence: 'labelled model' },
  ],
  fault_criteria: { infra: [], grader: [], env: [], refusal: [], model: [] },
  ...over,
});

// The decisive check's items, as the record holds them (the first failed item carries why, the
// records it turns on and, on an event gate, the step the arrival fired at): final-1
// contrast-ct-prep/0's event_seen.
const EVENT_CHECKS = [{ id: 'event_seen', items: [{ item: 'Patient/pt-0047', met: false, why: 'event t5-mohr-scr arrived at step 52 and was never read before finish', decisive_ids: ['Observation/obs-07502', 'Observation/obs-07501'], evidence: { arrived_at: 52 } }, { item: 'Patient/pt-0015', met: true }] }];
const eventCheck = (item: string, why: string, decisive_ids: string[], arrived_at: number, id = 'event_seen') => [{ id, items: [{ item, met: false, why, decisive_ids, evidence: { arrived_at } }] }];

describe('plainHeadline', () => {
  it('opens with the kind of failure in words, then what arrived for whom and at which step on an event gate', () => {
    expect(plainHeadline(base({}), EVENT_CHECKS, 'retrieval')).toBe('Missed a record it needed: new results for Patient/pt-0047 (Britt Vincenzo Mohr, 08:00) arrived at step 52, and the model did not review them before finishing.');
  });
  it('names the patient from the found text when that text is a clause, never pasting the clause in (gate F2: renal-dose-review/4, 10, 13, 19)', () => {
    const e = base({ decisive_check: { id: 'event_seen', traces_to: null, expected: 'each arrival read', found: 'Patient/pt-0062 (Norman Fairweather) had an arrival that was never opened before the review finished' } });
    const checks = eventCheck('Patient/pt-0062', 'event fairweather-scr-batch arrived at step 30 and was never read before finish', ['Observation/obs-04004'], 30);
    expect(plainHeadline(e, checks, 'retrieval')).toBe('Missed a record it needed: a new result for Patient/pt-0062 (Norman Fairweather) arrived at step 30, and the model never opened it before finishing.');
  });
  it('names the patient, not the event slug, when the item is a slug (gate F5: results-inbox)', () => {
    const e = base({ decisive_check: { id: 'event_seen', traces_to: null, expected: 'each arrival read', found: 'marchetti_cr_ed (Patient/pt-0064)' } });
    const checks = eventCheck('marchetti_cr_ed', 'event marchetti-cr-batch arrived at step 41 and was never read before finish', ['Observation/obs-06209', 'Observation/obs-06210'], 41);
    const line = plainHeadline(e, checks, 'retrieval')!;
    expect(line).toBe('Missed a record it needed: new results for Patient/pt-0064 arrived at step 41, and the model did not review them before finishing.');
    expect(line).not.toContain('marchetti');
  });
  it('says what kind of record arrived: a message, a report', () => {
    const e = base({ decisive_check: { id: 'event_seen', traces_to: null, expected: 'each arrival read', found: 'Patient/pt-0012 (Ira Moravec)' } });
    expect(plainHeadline(e, eventCheck('Patient/pt-0012', 'event moravec-weight-reported arrived at step 20 and was never read before finish', ['Communication/comm-00101'], 20), 'retrieval')).toBe('Missed a record it needed: a new message for Patient/pt-0012 (Ira Moravec) arrived at step 20, and the model never opened it before finishing.');
    expect(plainHeadline(e, eventCheck('Patient/pt-0012', 'event vance-itraconazole arrived at step 9 and was never read before finish', ['DocumentReference/doc-00301'], 9), 'retrieval')).toBe('Missed a record it needed: a new report for Patient/pt-0012 (Ira Moravec) arrived at step 9, and the model never opened it before finishing.');
  });
  it('says "never opened" only for an arrival that was never read: an arrival whose trigger never held is told by its own reason, without the event slug (gate F3)', () => {
    const e = base({ decisive_check: { id: 'event_delivered', traces_to: null, expected: 'every active event arrived', found: 'Patient/pt-0062 (Norman Fairweather)' }, fault: 'env', label: 'environment' });
    const checks = eventCheck('Patient/pt-0062', 'event fairweather-scr-batch arrived at step 30 though its trigger never held', ['Observation/obs-04004'], 30, 'event_delivered');
    const line = plainHeadline(e, checks, null)!;
    expect(line).toBe('Failed a gate check: Patient/pt-0062 (Norman Fairweather): an arrival arrived at step 30 though its trigger never held.');
    expect(line).not.toContain('never opened');
    expect(line).not.toContain('fairweather-scr-batch');
  });
  it('keeps the check text\'s own sentence on a gate whose found value is a clause, with no event slug (crc-care-gap fit_orders)', () => {
    const e = base({ decisive_check: { id: 'fit_orders', traces_to: null, expected: 'one FIT order per due patient', found: 'a FIT order for Patient/pt-0022 (Tiny Darline Koss) without a complete screening review ever made' } });
    const checks = [{ id: 'fit_orders', items: [{ item: 'Patient/pt-0022', met: false, why: "ordered after crc-b2 arrived without the trial ever making a complete review of the patient's Observation from 2024-01-01 records", decisive_ids: ['Patient/pt-0022'] }] }];
    const line = plainHeadline(e, checks, 'retrieval')!;
    expect(line).toBe('Missed a record it needed: a FIT order for Patient/pt-0022 (Tiny Darline Koss) without a complete screening review ever made.');
    expect(line).not.toContain('crc-b2');
  });
  it('names the first failed item\'s reason on a gate with items and no arrival', () => {
    const checks = [{ id: 'doac_dose', items: [{ item: 'Patient/pt-0003', met: false, why: 'rivaroxaban 20 mg once daily; the policy dose is 15 mg' }] }];
    const e = base({ decisive_check: { id: 'doac_dose', traces_to: null, expected: 'the policy dose', found: 'Patient/pt-0003 (Ada Delgado)' }, taxonomy: 'reasoning' });
    expect(plainHeadline(e, checks, 'reasoning')).toBe('Read the records it needed, but decided wrongly: Patient/pt-0003 (Ada Delgado): rivaroxaban 20 mg once daily; the policy dose is 15 mg.');
  });
  it('falls back to what the check found, then to the check\'s name, and never repeats a full stop', () => {
    const e = base({ decisive_check: { id: 'note_on_patient', traces_to: null, expected: 'a note', found: 'no note on Patient/pt-0001.' }, taxonomy: 'output_gap' });
    expect(plainHeadline(e, null, 'output_gap')).toBe('Said it did the action, but the chart does not show it: no note on Patient/pt-0001.');
    const bare = base({ decisive_check: { id: 'note_on_patient', traces_to: null, expected: '', found: '' }, taxonomy: null });
    expect(plainHeadline(bare, [], null)).toBe('Failed a gate check: note_on_patient was not met.');
  });
  it('says no internal event id, and no check id, in the plain line', () => {
    const line = plainHeadline(base({}), EVENT_CHECKS, 'retrieval')!;
    expect(line).not.toContain('t5-mohr-scr');
    expect(line).not.toContain('event_seen');
  });
  it('keeps the plain words of a pass, a false pass, a refusal, a limit and an excluded trial', () => {
    expect(plainHeadline(base({ outcome: 'PASS', fault: null, deciding: null, decisive_check: null, taxonomy: null }), [], null)).toBe('Passed every gate check.');
    expect(plainHeadline(base({ outcome: 'PASS', fault: 'grader', decisive_check: null, taxonomy: null }), [], null)).toBe('Passed, but the grader was wrong: an audit found a false PASS.');
    expect(plainHeadline(base({ outcome: 'REFUSAL', fault: 'refusal', decisive_check: null, taxonomy: null }), [], null)).toBe('The model refused the task.');
    expect(plainHeadline(base({ outcome: 'LIMIT', decisive_check: null, taxonomy: 'did_not_finish' }), [], 'did_not_finish')).toBe('The model did not finish: the trial stopped at a limit.');
    expect(plainHeadline(base({ outcome: 'ENV_ERROR', valid: false, fault: 'env' }), [], null)).toBeNull();
  });
});

describe('faultWhy', () => {
  it('says why the fault is the model\'s from the confirmation criteria that are met', () => {
    expect(faultWhy(base({}))).toBe("Why it is the model's fault: the records it needed were shown to it or within reach (M1), no tool failed inside the environment (M2), and a person reviewed it and agrees (M5).");
  });
  it('leaves out a criterion that is pending or not met, and is null with none met', () => {
    const e = base({ criteria: base({}).criteria.map((c) => (c.id === 'M5' ? { ...c, met: 'pending' } : c)) });
    expect(faultWhy(e)).toBe("Why it is the model's fault: the records it needed were shown to it or within reach (M1) and no tool failed inside the environment (M2).");
    expect(faultWhy(base({ criteria: base({}).criteria.map((c) => ({ ...c, met: 'pending' })) }))).toBeNull();
  });
  it('is null for a pass, an excluded trial, and a fault that is not the model\'s', () => {
    expect(faultWhy(base({ outcome: 'PASS', fault: null, deciding: null }))).toBeNull();
    expect(faultWhy(base({ outcome: 'ENV_ERROR', valid: false, fault: 'env' }))).toBeNull();
    expect(faultWhy(base({ fault: 'env', label: 'environment' }))).toBeNull();
  });
});

describe('confirmationWords', () => {
  const rows = (m: Record<string, unknown>) => ['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => ({ id, met: m[id] ?? true }));
  it('is the shared phrase when the record and the audit both confirm', () => {
    expect(confirmationWords(rows({}))).toBe('confirmed by the record (M1–M4) and the human audit (M5)');
    expect(confirmationWords(rows({ M1: 'n/a' }))).toBe('confirmed by the record (M1–M4) and the human audit (M5)');
  });
  it('says what is pending or not met', () => {
    expect(confirmationWords(rows({ M5: 'pending' }))).toBe('confirmed by the record (M1–M4) while the human audit (M5) is pending');
    expect(confirmationWords(rows({ M4: 'pending' }))).toBe('confirmed by the record so far (M4 pending) and the human audit (M5)');
    expect(confirmationWords(rows({ M3: false, M5: false }))).toBe('not confirmed by the record (M3 not met), and the human audit (M5) disagrees');
  });
});
