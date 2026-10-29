// GR5, false PASS (plan P17j JG5, pre-audit S3 and B2): a PASS that a human audit labels grader,
// with evidence, is a PASS the grader gave to a trial the policy fails. GR5 decides it (fault
// grader); the trial is not counted as a pass, and it blocks the run as a valid failure labelled
// grader does, until a grader fix, a full offline regrade and a disclosure in results/changelog.d.
// HARM_POINTS stays -5 (decisions.tsv 2026-10-27T23:40).
import { describe, expect, it } from 'vitest';
import { blocksRun, excludedFromHeadline, explainTrial, type AuditRow, type ExplainContext, type ExplainRecord } from '../explain.ts';
import { DENOMINATOR_RULE, FAULT_DEFINITIONS, PASS_CONFIRMED, PASS_DEFINITION } from '../outcomes.ts';
import { HARM_POINTS } from '../summary.ts';

const ctx: ExplainContext = { events: [], world_state_hash: 'h', matrix: null };
const gate = (id: string, met: boolean) => ({ id, kind: 'gate', method: 'code', points: null, met });
const pass: ExplainRecord = {
  task_id: 't', task_version: 'v', grader_task_version: 'g', outcome: 'PASS', valid: true, status: 'COMPLETED', detail: null,
  tool_errors: { INTERNAL: 0 }, state_hash: { initial: 'h', final: 'f', replay_final: 'f' }, checks: [gate('G1', true)], attribution: null, error: null,
};
const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  trial: 't/0', outcome: 'PASS', taxonomy: null, model_fault: null, decisive_step: 3, evidence_ids: ['MedicationRequest/mr-1'], llm_auditor_agrees: true, label: 'grader', note: 'the order the policy forbids was placed', ...over,
});
const gr5 = FAULT_DEFINITIONS.grader.criteria.find((c) => c.id === 'GR5');

describe('GR5 false PASS', () => {
  it('is a grader criterion that reads the outcome and the audit label and evidence', () => {
    expect(gr5).toBeDefined();
    expect(gr5!.reads).toEqual(expect.arrayContaining(['record.outcome', 'audit.outcome', 'audit.label (else implied by audit.taxonomy)', 'audit.adjudicated_label', 'audit.evidence_ids']));
    expect(gr5!.text).toMatch(/PASS/);
  });

  it('decides a PASS that the audit labels grader with evidence: fault grader, confirmed, not counted, blocks the run', () => {
    const e = explainTrial(pass, row(), ctx);
    expect(e).toMatchObject({ outcome: 'PASS', fault: 'grader', label: 'grader', deciding: { fault: 'grader', id: 'GR5' }, confirmation: 'confirmed' });
    expect(e.reason).toMatch(/^PASS: an audit found a false PASS/);
    expect(excludedFromHeadline(e)).toMatch(/GR5/);
    expect(blocksRun(e)).toMatch(/GR5/);
  });

  it('an adjudicated label grader decides it too; an adjudicated label model overrules the auditor', () => {
    expect(explainTrial(pass, row({ label: 'model', adjudicated_label: 'grader' }), ctx).deciding?.id).toBe('GR5');
    expect(explainTrial(pass, row({ adjudicated_label: 'model' }), ctx).fault).toBeNull();
  });

  it('does not hold without evidence, without the grader label, or on a FAIL', () => {
    for (const r of [row({ evidence_ids: [] }), row({ label: null }), row({ label: 'model' })]) {
      const e = explainTrial(pass, r, ctx);
      expect(e.fault).toBeNull();
      expect(blocksRun(e)).toBeNull();
    }
    expect(explainTrial(pass, null, ctx).fault).toBeNull();
    const fail = { ...pass, outcome: 'FAIL', checks: [gate('G1', false)] };
    expect(explainTrial(fail, row({ outcome: 'FAIL' }), ctx).fault_criteria.grader.find((c) => c.id === 'GR5')!.met).toBe(false);
  });
});

describe('GR5 needs an audit of the PASS itself (verifier-phase-P17i-JG5-1 S2)', () => {
  it('a FAIL audited grader, then fixed and regraded to PASS, is not a false PASS', () => {
    const regraded: ExplainRecord = { ...pass, outcome: 'FAIL', checks: [gate('G1', false)], regrades: [{ outcome: 'PASS', grader_task_version: 'g2', score: 1, valid: true, checks: [gate('G1', true)] }] };
    const e = explainTrial(regraded, row({ outcome: 'FAIL', model_fault: 'no' }), ctx);
    expect(e.outcome).toBe('PASS');
    expect(e.fault_criteria.grader.find((c) => c.id === 'GR5')!.met).toBe(false);
    expect(e.fault).toBeNull();
    expect(blocksRun(e)).toBeNull();
  });
});

describe('an adjudication that confirms the PASS (verifier-phase-P17j-retro-JG5-unread-1 D1)', () => {
  it('adjudicated_label pass is PASS_CONFIRMED, and over a label grader leaves no fault and no audit label', () => {
    expect(PASS_CONFIRMED).toBe('pass');
    const e = explainTrial(pass, row({ llm_auditor_agrees: false, adjudicated_label: PASS_CONFIRMED }), ctx);
    expect(e.fault_criteria.grader.find((c) => c.id === 'GR5')!.met).toBe(false);
    expect(e).toMatchObject({ fault: null, audit_label: null });
    expect(blocksRun(e)).toBeNull();
  });
});

describe('the rules say so', () => {
  it('PASS_DEFINITION and DENOMINATOR_RULE name the false PASS and how it is resolved', () => {
    expect(PASS_DEFINITION).toMatch(/false PASS \(GR5\)/);
    // A false PASS is defined by the audit of that PASS, as GR5 is (verifier-phase-P17j-retro-JG5-unread-1 m2).
    expect(PASS_DEFINITION).toMatch(/human audit of that PASS labels it grader/);
    expect(gr5!.text).toMatch(/human audit of that PASS labels it grader/);
    // What an audit outcome GRADER_BUG on a PASS means (verifier-phase-P17j-retro-JG5-unread-1 m1).
    expect(PASS_DEFINITION).toMatch(/neither is an audit outcome GRADER_BUG on a PASS/);
    expect(DENOMINATOR_RULE).toMatch(/false PASS \(GR5\) is not counted as a pass/);
    expect(DENOMINATOR_RULE).toMatch(/grader fix, a full offline regrade and a disclosure in results\/changelog\.d/);
  });

  it('HARM_POINTS stays -5 (decisions.tsv 2026-10-27T23:40)', () => {
    expect(HARM_POINTS).toBe(-5);
  });
});
