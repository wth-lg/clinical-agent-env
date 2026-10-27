// P17j JG8b (pre-audit M3): action_form, the right decision taken in a channel or form the
// protocol does not name. A gate function marks such a failure with action_form: true, as it marks
// a missing required write with omission (attribution-omission.test.ts), and attribution then
// labels the trial action_form, whatever the exposure says.
import { describe, expect, it } from 'vitest';
import { attribute, TAXONOMY } from '../attribution.ts';
import { gate, type GateCheck, type Step } from '../check.ts';
import type { CheckResult } from '../grade.ts';

const ACTION: GateCheck = gate({ id: 'G1', category: 'action', traces_to: 't', decisive_ids: ['Observation/obs-1'], fn: () => ({ met: false, evidence: {} }) });
const PROCESS: GateCheck = gate({ id: 'G0', category: 'process', traces_to: 't', decisive_ids: [], fn: () => ({ met: false, evidence: {} }) });
const step = (n: number, exposed: string[] = []): Step => ({ n, tool: 'fhir_read', exposed_ids: exposed, referenced_ids: [], written_ids: [], shown: [] }) as unknown as Step;
const failed = (id: string, category: string, actionForm: boolean): CheckResult =>
  ({ id, kind: 'gate', method: 'code', category, points: null, met: false, evidence: {}, ...(actionForm ? { action_form: true } : {}) }) as CheckResult;

describe('a gate failure marked action_form (P17j JG8b)', () => {
  it('is a TAXONOMY value', () => {
    expect(TAXONOMY).toContain('action_form');
  });

  it('labels the trial action_form when every decisive id was seen', () => {
    expect(attribute('FAIL', [ACTION], [failed('G1', 'action', true)], [step(1, ['Observation/obs-1'])])?.auto).toBe('action_form');
  });

  it('labels the trial action_form even when a decisive id was never seen', () => {
    expect(attribute('FAIL', [ACTION], [failed('G1', 'action', true)], [step(1)])?.auto).toBe('action_form');
  });

  it('without the marker keeps the other rules', () => {
    expect(attribute('FAIL', [ACTION], [failed('G1', 'action', false)], [step(1, ['Observation/obs-1'])])?.auto).toBe('reasoning');
  });

  it('only on the decisive gate: an earlier failed process gate without it stays process', () => {
    expect(attribute('FAIL', [PROCESS, ACTION], [failed('G0', 'process', false), failed('G1', 'action', true)], [step(1, ['Observation/obs-1'])])?.auto).toBe('process');
  });
});
