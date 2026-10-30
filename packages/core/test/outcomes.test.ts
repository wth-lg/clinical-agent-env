// The attribution definitions (plan phase P14a): one sentence and ordered criteria per Fault, the
// AUDIT_LABEL mapping to the three audit labels, and PASS_DEFINITION and DENOMINATOR_RULE built
// from the outcome table, so no surface lists them by hand.
import { describe, expect, it } from 'vitest';
import {
  AUDIT_LABEL, AUDIT_LABELS, CONFIRMATION_CRITERIA, CONFIRMATION_DEFINITIONS, DENOMINATOR_OPERATOR_NOTE, DENOMINATOR_RULE, FAULT, FAULT_DEFINITIONS, FAULT_PRECEDENCE,
  FAULT_PRECEDENCE_RULE, NOT_RERUN_REASON, OUTCOMES, PASS_DEFINITION, RERUN_OUTCOMES, RUN_BLOCKS, VALID_OUTCOMES, isValid, type Fault,
} from '../outcomes.ts';

const FAULTS: Fault[] = ['model', 'refusal', 'env', 'grader', 'infra'];

describe('FAULT_DEFINITIONS', () => {
  it('gives every Fault one plain sentence and the criteria that decide it, each with an id, one sentence, the record fields it reads and a check', () => {
    expect(Object.keys(FAULT_DEFINITIONS).sort()).toEqual([...FAULTS].sort());
    const all = [...FAULTS.flatMap((f) => FAULT_DEFINITIONS[f].criteria), ...CONFIRMATION_CRITERIA, ...RUN_BLOCKS];
    for (const f of FAULTS) {
      expect(FAULT_DEFINITIONS[f].sentence).toMatch(/^[A-Z][^\n.]*\.$/);
      expect(FAULT_DEFINITIONS[f].criteria.length).toBeGreaterThan(0);
    }
    for (const c of all) {
      expect(c.id).toMatch(/^[A-Z]+[0-9]+$/);
      // One sentence: a capital, no full stop inside, a full stop at the end.
      expect(c.text, c.id).toMatch(/^[A-Z][^\n]*\.$/);
      expect(c.text.slice(0, -1), c.id).not.toMatch(/\.\s/);
      expect(c.reads.length, c.id).toBeGreaterThan(0);
      for (const r of c.reads) expect(r, c.id).toMatch(/^(?:record|audit|manifest|matrix|world|trajectory)\b/);
      expect(typeof c.check).toBe('function');
    }
  });

  it('lists the confirmation criteria M1-M5 in order, and decides model by MF1 (FAIL) and MF2 (LIMIT)', () => {
    expect(CONFIRMATION_CRITERIA.map((c) => c.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    expect(FAULT_DEFINITIONS.model.criteria.map((c) => c.id)).toEqual(['MF1', 'MF2']);
  });

  it('gives each infra and refusal outcome of the FAULT map one criterion', () => {
    expect(FAULT_DEFINITIONS.infra.criteria.map((c) => c.id)).toEqual(['I1', 'I2', 'I3', 'I4']);
    expect(OUTCOMES.filter((o) => FAULT[o] === 'infra')).toHaveLength(4);
    expect(FAULT_DEFINITIONS.refusal.criteria.map((c) => c.id)).toEqual(['R1']);
  });

  it('defines E5 as the negation of M1 and GR4 as the negation of M4', () => {
    const ids = (f: Fault) => FAULT_DEFINITIONS[f].criteria.map((c) => c.id);
    expect(ids('env')).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']);
    expect(ids('grader')).toEqual(['GR1', 'GR2', 'GR3', 'GR4', 'GR5']);
    expect(FAULT_DEFINITIONS.env.criteria[4]!.text).toMatch(/M1/);
    expect(FAULT_DEFINITIONS.grader.criteria[3]!.text).toMatch(/M4/);
  });

  it('has no two criteria with the same id or text', () => {
    const all = [...FAULTS.flatMap((f) => FAULT_DEFINITIONS[f].criteria), ...CONFIRMATION_CRITERIA, ...RUN_BLOCKS];
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.text)).size).toBe(all.length);
  });
});

describe('FAULT_PRECEDENCE and confirmation', () => {
  it('orders every fault once: infra, grader, env, refusal, model, and the rule names them in that order', () => {
    expect(FAULT_PRECEDENCE).toEqual(['infra', 'grader', 'env', 'refusal', 'model']);
    expect([...FAULT_PRECEDENCE].sort()).toEqual([...FAULTS].sort());
    expect(FAULT_PRECEDENCE_RULE).toMatch(/infra[^.]*grader[^.]*environment[^.]*refusal[^.]*model/);
  });

  it('defines confirmed, provisional and contradicted in one sentence each', () => {
    expect(Object.keys(CONFIRMATION_DEFINITIONS)).toEqual(['confirmed', 'provisional', 'contradicted']);
    for (const s of Object.values(CONFIRMATION_DEFINITIONS)) expect(s).toMatch(/^[A-Z][^\n]*\.$/);
  });
});

describe('AUDIT_LABEL', () => {
  it('maps the five faults to the three audit labels; infra has none', () => {
    expect(AUDIT_LABEL).toEqual({
      model: { label: 'model', subtype: null },
      refusal: { label: 'model', subtype: 'refusal' },
      grader: { label: 'grader', subtype: null },
      env: { label: 'environment', subtype: null },
      infra: null,
    });
    expect([...AUDIT_LABELS].sort()).toEqual(['environment', 'grader', 'model']);
  });
});

describe('PASS_DEFINITION and DENOMINATOR_RULE', () => {
  it('PASS_DEFINITION says every gate check of the current grade is met and any environment or grader criterion that holds is a note (verify m2, review F4)', () => {
    expect(PASS_DEFINITION).toMatch(/every gate check of its current grade is met/);
    expect(PASS_DEFINITION).toMatch(/environment or grader criterion that holds is shown as a note/);
    expect(PASS_DEFINITION).not.toMatch(/no environment criterion/);
    expect(PASS_DEFINITION).not.toMatch(/valid outcomes/);
  });

  it('names as counted exactly VALID_OUTCOMES and as excluded exactly the other outcomes', () => {
    const excluded = OUTCOMES.filter((o) => !VALID_OUTCOMES.includes(o));
    const [counted, rest] = DENOMINATOR_RULE.split('every other outcome is excluded');
    expect(rest).toBeDefined();
    for (const o of VALID_OUTCOMES) expect(counted).toMatch(new RegExp(`\\b${o}\\b`));
    for (const o of excluded) {
      expect(counted).not.toMatch(new RegExp(`\\b${o}\\b`));
      expect(rest).toMatch(new RegExp(`\\b${o}\\b`));
    }
    expect(excluded).toEqual(['INVALID', 'INFRA_HARNESS', 'INFRA_API', 'CANCELLED', 'ENV_ERROR', 'ENV_LIMIT', 'GRADER_ERROR']);
  });

  // W0-A: ENV_LIMIT is never rerun either: the same task stops the same way (NOT_RERUN_REASON).
  it('reruns every excluded outcome but GRADER_ERROR, which blocks the run until a grader fix and a full offline regrade, and ENV_LIMIT', () => {
    expect(RERUN_OUTCOMES).toEqual(OUTCOMES.filter((o) => !isValid(o) && FAULT[o] !== 'grader' && o !== 'ENV_LIMIT'));
    expect(RERUN_OUTCOMES).not.toContain('GRADER_ERROR');
    expect(RERUN_OUTCOMES).not.toContain('ENV_LIMIT');
    expect(DENOMINATOR_RULE).toMatch(/GRADER_ERROR[^.]*blocks the run until a grader fix and a full offline regrade/);
    expect(DENOMINATOR_RULE).toMatch(/GRADER_ERROR and ENV_LIMIT are excluded and never rerun as a model trial/);
    // Every "rerun" that is not "never rerun" is said of the rerun outcomes only.
    const rerunClause = /([A-Z_, ]+(?:and [A-Z_]+)?) (?:are|is) excluded and rerun/.exec(DENOMINATOR_RULE);
    expect(rerunClause).not.toBeNull();
    expect(rerunClause![1]).not.toMatch(/GRADER_ERROR/);
    for (const o of RERUN_OUTCOMES) expect(rerunClause![1]).toMatch(new RegExp(`\\b${o}\\b`));
  });

  it('the operator note says grader_error=0 checks each current grade after any offline regrade, and grader_error_history is disclosure, never a require key', () => {
    expect(DENOMINATOR_OPERATOR_NOTE).toMatch(/grader_error=0[^.]*checks each record's current grade after any offline regrade/);
    expect(DENOMINATOR_OPERATOR_NOTE).toMatch(/grader_error_history[^.]*for disclosure/);
    expect(DENOMINATOR_OPERATOR_NOTE).toMatch(/grader_error_history is never a require key/);
    expect(DENOMINATOR_OPERATOR_NOTE).toMatch(/env_error_raw/);
    expect(DENOMINATOR_RULE).not.toMatch(/require|env_error_raw|summary --/);
  });

  // Rule P-L fails safe (decisions.tsv 2026-10-30T10:39): the texts say a cap stop is the model's
  // only while it looped and that a human reviews every ENV_LIMIT, since every run gates on 0.
  it('E8, MF2, the reader rule and the operator note state rule P-L and the human review of every ENV_LIMIT', () => {
    const text = (id: string) => [...FAULT_DEFINITIONS.env.criteria, ...FAULT_DEFINITIONS.model.criteria].find((c) => c.id === id)!.text;
    expect(text('MF2')).toMatch(/while it was looping \(rule P-L: at least 10 of its last 20 calls repeat an earlier call on the same target, and none of them writes to a target not written before\)/);
    expect(text('E8')).toMatch(/rule P-L found no loop[^.]*a human reviews the stop/);
    expect(FAULT_DEFINITIONS.env.sentence).toMatch(/without strong evidence that the model was looping/);
    expect(DENOMINATOR_RULE).toContain(`ENV_LIMIT: ${NOT_RERUN_REASON.ENV_LIMIT}`);
    expect(NOT_RERUN_REASON.ENV_LIMIT).toMatch(/^a human reviews it first/);
    expect(DENOMINATOR_OPERATOR_NOTE).toMatch(/env_limit requirement[^.]*a human reviews every ENV_LIMIT[^.]*also when the model padded its calls/);
  });

  it('the reader rule counts a refusal as a model failure and names refusal_excluded_rate, the view without refusals', () => {
    expect(DENOMINATOR_RULE).toMatch(/refusal counts as a model failure inside the denominator/);
    expect(DENOMINATOR_RULE).toMatch(/refusal_excluded_rate/);
    // 115: round 3 added the environment- and grader-labelled exclusion and how each is resolved.
    // 135 (+20): round 4 says what is enforced instead (audit-check fails the run, no headline pass rate).
    // 167 (+32): P17j JG5 adds the false PASS (GR5) sentence.
    // 197 (+30): W0-A adds ENV_LIMIT and each never-rerun outcome's reason (NOT_RERUN_REASON).
    expect(DENOMINATOR_RULE.split(/\s+/).length).toBeLessThanOrEqual(197);
  });
});

describe('round 3 (pr-review P14a-2): denominator, precedence and confirmation text', () => {
  it('DENOMINATOR_RULE says what is enforced on an environment- or grader-labelled valid failure, and how each is resolved (review F3, P14a-3 F2)', () => {
    const [, second] = DENOMINATOR_RULE.split(/(?<=\.)\s+(?=[A-Z`])/);
    expect(second).toMatch(/valid failure labelled environment or grader is not allowed in a committed run: cli audit-check fails the run until/);
    expect(second).toMatch(/a grader label is resolved by that fix and regrade, or an environment label by an environment fix and a rerun of only the affected trials, disclosed in results\/changelog\.d/);
    expect(second).toMatch(/so a run with one has no headline pass rate\.$/);
    // It no longer claims a denominator that nothing reports.
    expect(DENOMINATOR_RULE).not.toMatch(/labelled environment or grader is excluded from the denominator/);
  });

  it('M4 judges only a FAIL: a REFUSAL or LIMIT comes from the record status, which a grader fix cannot change (P14a-3 F1)', () => {
    const m4 = CONFIRMATION_CRITERIA.find((c) => c.id === 'M4')!;
    expect(m4.text).toMatch(/outcome is not FAIL/);
    expect(m4.reads).toContain('record.outcome');
    const gr4 = FAULT_DEFINITIONS.grader.criteria.find((c) => c.id === 'GR4')!;
    expect(gr4.text).toMatch(/FAIL/);
  });

  it('FAULT_PRECEDENCE_RULE no longer says an environment fault only reruns the trial, and gives the reason for each step', () => {
    expect(FAULT_PRECEDENCE_RULE).not.toMatch(/only reruns/);
    expect(FAULT_PRECEDENCE_RULE).toMatch(/check the trial failed/);
    expect(FAULT_PRECEDENCE_RULE).toMatch(/refusal/);
  });

  it('CONFIRMATION_DEFINITIONS.confirmed names the record-fact criteria and the audit for the rest', () => {
    expect(CONFIRMATION_DEFINITIONS.confirmed).toMatch(/E1-E4, E7, E8, GR1 or GR2/);
    expect(CONFIRMATION_DEFINITIONS.confirmed).toMatch(/E5, E6, GR3, GR4 or GR5/);
  });

  it('GR4 and M4 read the matrix\'s failed checks against the trial\'s failed check; B1 is the run-level block', () => {
    const gr4 = FAULT_DEFINITIONS.grader.criteria.find((c) => c.id === 'GR4')!;
    expect(gr4.text).toMatch(/same gate check as this FAIL trial/);
    expect(gr4.reads.join(' ')).toMatch(/failed_checks/);
    expect(RUN_BLOCKS.map((c) => c.id)).toEqual(['B1']);
    expect(RUN_BLOCKS[0]!.text).toMatch(/^[A-Z][^\n]*\.$/);
  });

  it('the M5 text is the rule the code checks', () => {
    const m5 = CONFIRMATION_CRITERIA.find((c) => c.id === 'M5')!;
    expect(m5.text).toMatch(/its adjudicated label, else its label/);
  });
});

describe('FAULT_DEFINITIONS in plain words (review-ui-P16-1 F4, verifier-phase-P16-2 F4)', () => {
  it('no fault sentence or criterion text uses a field name, a constant name or a technical word', () => {
    const texts = Object.values(FAULT_DEFINITIONS).flatMap((d) => [d.sentence, ...d.criteria.map((c) => c.text)]);
    for (const t of texts) {
      expect(t).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
      expect(t).not.toMatch(/\bMODEL\b|\boracle\b|\bexception\b|\binvariant\b|\bstop_reason\b/);
    }
  });
});

// verifier-ui-copy-1 m1-m3: "failed with an error" everywhere; ASD-STE 100 wording (different from,
// no "is when", at most 25 words in I1 and GR4: shortened, not split, because each text is one
// sentence the UI sets inside a line); and the M1-M5 texts in plain words too.
describe('fault and confirmation texts in plain words, ASD-STE 100 (verifier-ui-copy-1 m1-m3)', () => {
  const words = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.split(/\s+/).filter(Boolean).length);
  it('M1 on a GRADER_ERROR says a check failed with an error, not that it threw', () => {
    const m1 = CONFIRMATION_CRITERIA.find((c) => c.id === 'M1')!;
    expect(m1.check({ outcome: 'GRADER_ERROR', decisive: null } as never)).toMatchObject({ met: 'n/a', evidence: 'a grader check failed with an error, so no gate check gave a verdict on the model' });
  });
  it('no fault text says "different ... than", "is when" or "tells nothing"', () => {
    const texts = Object.values(FAULT_DEFINITIONS).flatMap((d) => [d.sentence, ...d.criteria.map((c) => c.text)]);
    for (const t of texts) expect(t).not.toMatch(/different[^.]* than|\bis when\b|tells nothing/);
  });
  it('I1 and GR4 have no sentence over 25 words', () => {
    for (const [f, id] of [['infra', 'I1'], ['grader', 'GR4']] as const) {
      const c = FAULT_DEFINITIONS[f].criteria.find((x) => x.id === id)!;
      expect(Math.max(...words(c.text)), c.text).toBeLessThanOrEqual(25);
    }
  });
  it('no M1-M5 text uses a field name or a code word', () => {
    for (const c of CONFIRMATION_CRITERIA) {
      expect(c.text, c.id).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
      expect(c.text, c.id).not.toMatch(/decisive id|\bINTERNAL\b|\boracle\b|\bmodel_fault\b/);
    }
  });
});
