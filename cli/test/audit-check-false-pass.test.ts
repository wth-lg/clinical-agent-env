// audit-check and the false PASS (plan P17j JG5): an audit row that labels a PASS grader, with
// evidence, is GR5, so the run fails and --json leaves the trial out of its denominator; and
// every PASS whose current grade has a penalty (a rubric item with negative points) met or unknown
// needs an audit row with evidence ids, on top of the MIN_AUDITED_PASSES sample.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

type Row = Record<string, unknown>;
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Row);
const writeRows = (dir: string, xs: Row[]) => writeFileSync(join(dir, 'audit.jsonl'), xs.map((r) => JSON.stringify(r)).join('\n') + '\n');

function clean(name: string): string {
  const dir = tempDir(`false-pass-${name}`);
  writeFixtureRun(dir, 'clean');
  return dir;
}

// A penalty in the current grade of a fixture trial (a PASS: G1 met).
function penalty(dir: string, trial: string, points: number, met: boolean | 'unknown'): void {
  const file = join(dir, 'trials', `${trial}.json`);
  const r = JSON.parse(readFileSync(file, 'utf8')) as { checks: Row[] };
  r.checks = [...r.checks, { id: 'reply_names_other_patient', kind: 'rubric', method: 'judge', points, met }];
  writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
}

async function check(dir: string, json = false): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await auditCheck([dir, ...(json ? ['--json'] : [])], { out: (s) => out.push(s), err: (s) => err.push(s), checks: fixtureChecks });
  return { code, out, err };
}

describe('a false PASS (GR5)', () => {
  it('the clean fixture passes, and counts all 20 valid trials', async () => {
    const r = await check(clean('base'), true);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ valid: 20, excluded: [], denominator: 20 });
  });

  it('an audit row labelling a PASS grader with evidence fails the run and leaves the trial out of the denominator', async () => {
    const dir = clean('gr5');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label: 'grader', model_fault: 'no', note: 'the grader passed an order the policy forbids' } : r)));
    const r = await check(dir, true);
    expect(r.code).toBe(1);
    expect(r.err).toContainEqual(expect.stringMatching(/^violation: t-alpha\/0: PASS is a false PASS \(GR5\)/));
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ valid: 20, excluded: ['t-alpha/0'], denominator: 19 });
    // The text line gives the failures labelled grader, then the false PASS beside it, as the page's
    // fault box does (decisions.tsv 2026-10-29T22:20); --json's labelled_grader still counts both.
    expect(r.err).toContainEqual(expect.stringMatching(/^audit-check: 10\/10 failures labelled, environment 0, grader 0 \(1 false PASS\); /));
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ labelled_grader: 1 });
  });

  it('a PASS labelled grader without evidence ids is a violation, not a GR5', async () => {
    const dir = clean('gr5-no-evidence');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label: 'grader', evidence_ids: [] } : r)));
    const r = await check(dir, true);
    expect(r.err).toContain('violation: t-alpha/0: a PASS labelled grader (a false PASS, GR5) needs evidence ids');
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: [], denominator: 20 });
  });
});

describe('the label of a PASS row (verifier-phase-P17i-JG5-1 S1)', () => {
  it('a label that is not one of the audit labels is a violation, so a typo cannot hide a false PASS', async () => {
    const dir = clean('label-typo');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label: 'Grader' } : r)));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: label Grader is not one of model, grader, environment');
  });

  it('on a PASS only grader (a false PASS) is a label; model or environment is a violation', async () => {
    for (const label of ['model', 'environment']) {
      const dir = clean(`label-${label}`);
      writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label } : r)));
      const r = await check(dir);
      expect(r.code).toBe(1);
      expect(r.out).toContain(`violation: t-alpha/0: a PASS labelled ${label}; on a PASS the only label is grader, a false PASS (GR5); a confirmed PASS has no label (adjudicated_label pass when adjudication confirms it)`);
    }
  });
});

describe('every PASS with a met or unknown penalty is audited', () => {
  for (const [points, met] of [[-8, true], [-3, true], [-6, 'unknown']] as const) {
    it(`an unaudited PASS with a ${met === true ? 'met' : 'unknown'} ${points} item fails the run, naming it`, async () => {
      const dir = clean(`penalty${points}`);
      penalty(dir, 't-alpha/3', points, met);
      const r = await check(dir);
      expect(r.code).toBe(1);
      expect(r.out).toContain(`violation: t-alpha/3: PASS with penalty reply_names_other_patient (${points} points) ${met === true ? 'met' : 'unknown'} has no audit row with evidence ids`);
    });
  }

  it('an audited PASS with a met penalty, or a PASS whose penalty was not triggered, passes', async () => {
    const audited = clean('penalty-audited');
    penalty(audited, 't-alpha/0', -8, true);
    expect((await check(audited)).code).toBe(0);
    const quiet = clean('penalty-not-met');
    penalty(quiet, 't-alpha/3', -8, false);
    expect((await check(quiet)).code).toBe(0);
  });

  it('an audit row with no evidence ids does not count', async () => {
    const dir = clean('penalty-no-evidence');
    penalty(dir, 't-alpha/0', -8, true);
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, evidence_ids: [] } : r)));
    expect((await check(dir)).out).toContain('violation: t-alpha/0: PASS with penalty reply_names_other_patient (-8 points) met has no audit row with evidence ids');
  });
});

// A PASS row whose model_fault is unclear or whose LLM auditor disagrees needs adjudication. The
// adjudicator either labels it grader (a false PASS, GR5) or confirms it with adjudicated_label
// pass (outcomes.ts PASS_CONFIRMED); a confirmed PASS carries no label (verifier-phase-P17j-retro-JG5-unread-1 D1).
describe('adjudicating a PASS row (verifier-phase-P17j-retro-JG5-unread-1 D1, FF1-FF4)', () => {
  const patch = (dir: string, f: (r: Row) => Row) => writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? f(r) : r)));

  it('FF1: an LLM auditor disagrees, and the adjudicator confirms the PASS: the run passes and counts the trial', async () => {
    const dir = clean('ff1');
    patch(dir, (r) => ({ ...r, llm_auditor_agrees: false, adjudicated_label: 'pass', note: 'the auditor read the order as a dose change; it is a refill' }));
    const r = await check(dir, true);
    expect(r.err.filter((s) => s.startsWith('violation'))).toEqual([]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: [], denominator: 20, labelled_grader: 0 });
  });

  it('FF1: an adjudicated_label model on a PASS is still a violation, and the message names the form that confirms the PASS', async () => {
    const dir = clean('ff1-model');
    patch(dir, (r) => ({ ...r, llm_auditor_agrees: false, adjudicated_label: 'model' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: a PASS labelled model; on a PASS the only label is grader, a false PASS (GR5); a confirmed PASS has no label (adjudicated_label pass when adjudication confirms it)');
  });

  it('FF2: an LLM auditor disagrees and nothing is adjudicated: a violation that names both PASS forms', async () => {
    const dir = clean('ff2');
    patch(dir, (r) => ({ ...r, llm_auditor_agrees: false }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: the LLM auditor disagrees, and no adjudicated_label is recorded (on a PASS: grader for a false PASS, pass to confirm it)');
  });

  it('FF3: model_fault unclear, confirmed by adjudicated_label pass: the run passes', async () => {
    const dir = clean('ff3');
    patch(dir, (r) => ({ ...r, model_fault: 'unclear', adjudicated_label: 'pass' }));
    const r = await check(dir, true);
    expect(r.err.filter((s) => s.startsWith('violation'))).toEqual([]);
    expect(r.code).toBe(0);
  });

  it('FF4: adjudicated_label grader is a false PASS (GR5), kept for a real one', async () => {
    const dir = clean('ff4');
    patch(dir, (r) => ({ ...r, llm_auditor_agrees: false, adjudicated_label: 'grader' }));
    const r = await check(dir, true);
    expect(r.code).toBe(1);
    expect(r.err).toContainEqual(expect.stringMatching(/^violation: t-alpha\/0: PASS is a false PASS \(GR5\)/));
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: ['t-alpha/0'], denominator: 19 });
  });

  it('adjudicated_label pass over a label grader confirms the PASS: no GR5', async () => {
    const dir = clean('pass-over-grader');
    patch(dir, (r) => ({ ...r, label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass', note: 'the grader was right to pass it' }));
    const r = await check(dir, true);
    expect(r.err.filter((s) => s.startsWith('violation'))).toEqual([]);
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: [], denominator: 20 });
  });

  it('adjudicated_label pass on a failure is a violation: it only confirms a PASS', async () => {
    const dir = clean('pass-on-fail');
    const fail = rows(dir).find((r) => r.outcome !== 'PASS')!;
    writeRows(dir, rows(dir).map((r) => (r.trial === fail.trial ? { ...r, adjudicated_label: 'pass' } : r)));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`violation: ${fail.trial as string}: adjudicated_label pass confirms a PASS, and the current grade is ${fail.outcome as string}`);
  });
});

// m1: on a PASS row, clinically_acceptable no says the PASS is not clinically right, a false PASS,
// so the label grader with evidence (GR5) answers it; an audit outcome GRADER_BUG on a PASS is not a
// form of a false PASS (the row's outcome is the current grade), and the messages point to the form
// that works.
describe('clinically_acceptable no and GRADER_BUG on a PASS row (verifier-phase-P17j-retro-JG5-unread-1 m1)', () => {
  const patch = (dir: string, f: (r: Row) => Row) => writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? f(r) : r)));

  it('a GR5 row that answers clinically_acceptable no gets only the GR5 violation', async () => {
    const dir = clean('fp4');
    patch(dir, (r) => ({ ...r, label: 'grader', clinically_acceptable: 'no' }));
    const r = await check(dir, true);
    const v = r.err.filter((s) => s.startsWith('violation'));
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/^violation: t-alpha\/0: PASS is a false PASS \(GR5\)/);
  });

  it('clinically_acceptable no on a PASS with no label needs the label grader with evidence', async () => {
    const dir = clean('ca-no-pass');
    patch(dir, (r) => ({ ...r, clinically_acceptable: 'no' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: clinically_acceptable no on a PASS (the PASS is not clinically right) needs the label grader with evidence, a false PASS (GR5); adjudicated_clinically_acceptable yes overrules it');
  });

  it('clinically_acceptable no overruled by adjudicated yes, confirmed by adjudicated_label pass and a note, passes', async () => {
    const dir = clean('ca-no-overruled');
    patch(dir, (r) => ({ ...r, clinically_acceptable: 'no', adjudicated_clinically_acceptable: 'yes', adjudicated_label: 'pass', note: 'the auditor missed the documented contraindication check' }));
    const r = await check(dir);
    expect(r.out.filter((s) => s.startsWith('violation'))).toEqual([]);
    expect(r.code).toBe(0);
  });

  it('an audit outcome GRADER_BUG on a PASS names the false PASS form', async () => {
    const dir = clean('fp1');
    patch(dir, (r) => ({ ...r, outcome: 'GRADER_BUG', label: 'grader', clinically_acceptable: 'no' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: labelled GRADER_BUG, the record says PASS; a false PASS is recorded as outcome PASS with the label grader and evidence ids (GR5)');
  });
});

// adjudicated_label pass settles a PASS row only when the row needs adjudication: model_fault
// unclear, the LLM auditor disagrees, or an auditor's no is overruled by an adjudicated yes. When it
// overrules the row's own label grader or environment, a note must say why. Any other pass is a
// violation, and the row keeps its own label, so a false PASS nobody disputed stays GR5
// (verifier-phase-P17i-P17j-S3retro-1 A1).
describe('adjudicated_label pass only settles a row that needs adjudication (verifier-phase-P17i-P17j-S3retro-1 A1)', () => {
  const patch = (dir: string, f: (r: Row) => Row) => writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? f(r) : r)));
  const withoutNote = ({ note: _note, ...r }: Row): Row => r;
  const notNeeded = 'violation: t-alpha/0: adjudicated_label pass confirms a PASS only on a row that needs adjudication (model_fault unclear, the LLM auditor disagrees, or an answer no overruled to yes); nothing here calls for it';

  for (const [name, f] of [
    ['A1: label grader, the LLM auditor agrees, a note', (r: Row) => ({ ...r, label: 'grader', llm_auditor_agrees: true, adjudicated_label: 'pass' })],
    ['A1b: label grader, the LLM auditor agrees, no note', (r: Row) => ({ ...withoutNote(r), label: 'grader', llm_auditor_agrees: true, adjudicated_label: 'pass' })],
    ['A1c: label grader, no LLM verdict, no note', (r: Row) => ({ ...withoutNote(r), label: 'grader', llm_auditor_agrees: null, adjudicated_label: 'pass' })],
  ] as const) {
    it(`${name}: a violation that names the rule, and the PASS stays a false PASS (GR5)`, async () => {
      const dir = clean(name.slice(0, 3).toLowerCase());
      patch(dir, f);
      const r = await check(dir, true);
      expect(r.code).toBe(1);
      expect(r.err).toContain(notNeeded);
      expect(r.err).toContainEqual(expect.stringMatching(/^violation: t-alpha\/0: PASS is a false PASS \(GR5\)/));
      expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: ['t-alpha/0'], denominator: 19, labelled_grader: 1 });
    });
  }

  it('pass on an unlabelled PASS that nothing disputes is a violation too', async () => {
    const dir = clean('pass-not-needed');
    patch(dir, (r) => ({ ...r, adjudicated_label: 'pass' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain(notNeeded);
  });

  it('pass over a label grader on a disputed row needs a note: without one, a violation, and GR5 stands', async () => {
    const dir = clean('pass-over-grader-no-note');
    patch(dir, (r) => ({ ...withoutNote(r), label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass' }));
    const r = await check(dir, true);
    expect(r.code).toBe(1);
    expect(r.err).toContain('violation: t-alpha/0: adjudicated_label pass overrules the label grader, and needs a note that says why');
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ excluded: ['t-alpha/0'], denominator: 19 });
  });

  it('pass over a label environment on a disputed row needs a note: without one, a violation', async () => {
    const dir = clean('pass-over-env-no-note');
    patch(dir, (r) => ({ ...withoutNote(r), label: 'environment', model_fault: 'unclear', adjudicated_label: 'pass', note: '  ' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: adjudicated_label pass overrules the label environment, and needs a note that says why');
  });

  it('pass over a label environment on a disputed row, with a note, confirms the PASS', async () => {
    const dir = clean('pass-over-env-note');
    patch(dir, (r) => ({ ...r, label: 'environment', model_fault: 'unclear', adjudicated_label: 'pass', note: 'the tool refusal was right; the PASS stands' }));
    const r = await check(dir);
    expect(r.out.filter((s) => s.startsWith('violation'))).toEqual([]);
    expect(r.code).toBe(0);
  });

  it('an overruled clinically_acceptable no calls for adjudication, and pass there needs a note like any overrule', async () => {
    const dir = clean('ca-overruled-no-note');
    patch(dir, (r) => ({ ...withoutNote(r), clinically_acceptable: 'no', adjudicated_clinically_acceptable: 'yes', adjudicated_label: 'pass' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: clinically_acceptable no, overruled by adjudicated_clinically_acceptable yes, needs an adjudicated_label and a note');
    expect(r.out).not.toContain(notNeeded);
  });

  // verifier-phase-P17i-P17j-S3retror2-1 B3, B3x: a label that is not an audit label is a violation
  // on every row, and pass needs a note over any label of the row's own, so neither hides the other.
  const variants = ['Grader', 'GRADER', 'grader ', ' environment', 'Environment'];
  const notALabel = (label: string) => `violation: t-alpha/0: label ${label} is not one of model, grader, environment`;

  it('B3x: a label that is not an audit label is a violation on its own', async () => {
    for (const label of variants) {
      const dir = clean(`b3x-${variants.indexOf(label)}`);
      patch(dir, (r) => ({ ...r, label }));
      const r = await check(dir);
      expect(r.code).toBe(1);
      expect(r.out).toContain(notALabel(label));
    }
  });

  it('B3: pass over a case or whitespace variant of grader or environment, with no note, is a violation, and the label stays one', async () => {
    for (const label of variants) {
      const dir = clean(`b3-${variants.indexOf(label)}`);
      patch(dir, (r) => ({ ...withoutNote(r), label, llm_auditor_agrees: false, adjudicated_label: 'pass' }));
      const r = await check(dir, true);
      expect(r.code).toBe(1);
      expect(r.err).toContain(`violation: t-alpha/0: adjudicated_label pass overrules the label ${label}, and needs a note that says why`);
      expect(r.err).toContain(notALabel(label));
    }
  });

  it('B3: a pass the rule accepts never hides a label that is not an audit label', async () => {
    for (const label of variants) {
      const dir = clean(`b3-note-${variants.indexOf(label)}`);
      patch(dir, (r) => ({ ...r, label, llm_auditor_agrees: false, adjudicated_label: 'pass', note: 'the human read the chart: the PASS is right' }));
      const r = await check(dir);
      expect(r.code).toBe(1);
      expect(r.out.filter((s) => s.startsWith('violation'))).toEqual([notALabel(label)]);
    }
  });

  it('a valid adjudicated_label does not hide a row label that is not an audit label either', async () => {
    const dir = clean('adjudicated-hides-label');
    patch(dir, (r) => ({ ...r, label: 'Grader', llm_auditor_agrees: false, adjudicated_label: 'grader' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain(notALabel('Grader'));
  });

  it('pass over the label model on a disputed row needs a note too', async () => {
    const dir = clean('pass-over-model-no-note');
    patch(dir, (r) => ({ ...withoutNote(r), label: 'model', llm_auditor_agrees: false, adjudicated_label: 'pass' }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/0: adjudicated_label pass overrules the label model, and needs a note that says why');
  });

  it('B1n: a note that is not text is a violation of its line, not a crash', async () => {
    const dir = clean('b1n');
    patch(dir, (r) => ({ ...r, label: 'grader', llm_auditor_agrees: false, adjudicated_label: 'pass', note: 7 }));
    const r = await check(dir);
    expect(r.code).toBe(1);
    expect(r.out).toContainEqual(expect.stringMatching(/^violation: audit\.jsonl line \d+: note must be text$/));
  });

  it('FF3 with no note: an unlabelled row needs none', async () => {
    const dir = clean('ff3-no-note');
    patch(dir, (r) => ({ ...withoutNote(r), model_fault: 'unclear', adjudicated_label: 'pass' }));
    const r = await check(dir);
    expect(r.out.filter((s) => s.startsWith('violation'))).toEqual([]);
    expect(r.code).toBe(0);
  });
});
