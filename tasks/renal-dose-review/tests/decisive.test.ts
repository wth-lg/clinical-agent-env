// Decisive-id integrity of T1's worklist probe (verifier-W1-probe-T1-clinical-1 F1-F2, builder-228).
// An item's decisive ids are only the records that decide its expected action: a record that cannot
// change the dose is not one. seen_before_change checks only those, so a correct route that reads
// only the deciding record passes, and attribution.ts labels a wrong dose with the deciding record
// in view as reasoning, not retrieval. The clinical verifier's variants: v1 (lindahl_inhibitor_only,
// an alternative) passes; v2 (duquette_inhibitor_seen_no_labs) and v3
// (ashworth_outside_creatinine_discarded) are reasoning on their own item alone; and
// kowalczyk_weight_only_all_three reads only the deciding weight and decides wrong. The matrix
// checks the same through Mutant.items; this file pins each case's grade by name.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { OUTSIDE } from '../../../packages/grader/items.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { gradeRun, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { Evidence } from '../../../packages/core/explain.ts';
import { checkText } from '../../renal-dose-review.check-text.ts';
import { expected } from '../expected.ts';
import { ref } from '../ids.ts';
import { alternatives } from './alternatives.ts';
import { mutants } from './mutants.ts';

const task = await loadMatrixTask('renal-dose-review');
const env = matrixEnv();

async function graded(kind: 'alternative' | 'mutant', id: string) {
  const script = (kind === 'mutant' ? mutants : alternatives).find((x) => x.id === id)?.script;
  if (script === undefined) throw new Error(`no ${kind} ${id}`);
  const run = await trial(env, task, { kind, id, script });
  const grade = await gradeRun(env, task, task.checks, run);
  const items = Object.fromEntries((grade.attribution?.items ?? []).map((i) => [i.item, i.auto]));
  return { grade, items, steps: stepsOf(run.events) };
}

describe('T1 decisive ids are the records that decide each item', () => {
  it('names, per item, only the deciding records (the table in expected.ts)', () => {
    const decisive = Object.fromEntries(expected.items.map((x) => [x.patient, x.decisive]));
    expect(decisive).toEqual({
      'Patient/pt-0040': [ref('Observation/obs-t1-1604')],
      'Patient/pt-0039': [ref('Observation/obs-t1-1503'), ref('Observation/obs-t1-1504')],
      'Patient/pt-0003': [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')],
      'Patient/pt-0041': [ref('MedicationRequest/mr-t1-1703')],
      'Patient/pt-0001': [ref('Observation/obs-t1-1103')],
      'Patient/pt-0045': [ref('DocumentReference/doc-t1-1901')],
      'Patient/pt-0038': [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405')],
      'Patient/pt-0043': [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802')],
      'Patient/pt-0002': [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')],
    });
  });

  it('no two items share a decisive record (rulings R15: each item proves its own decision)', () => {
    const all = expected.items.flatMap((x) => x.decisive);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each([
    ['lindahl_reduced_without_letter', 'Patient/pt-0045'],
    ['pellegrino_not_reviewed', 'Patient/pt-0043'],
    ['vance_raised_without_weight', 'Patient/pt-0002'],
  ])('R14: the expected action reached without the deciding record fails as retrieval on that item alone (%s)', async (id, patient) => {
    const { grade, items } = await graded('mutant', id);
    expect(grade.outcome).toBe('FAIL');
    expect(grade.checks.find((c) => c.id === 'doac_dose')!.met).toBe(true);
    expect(items).toEqual({ [patient]: 'retrieval' });
    const gate = grade.checks.find((c) => c.id === 'decisive_seen')!;
    expect(checkText.decisive_seen!.found(gate.evidence as Evidence)).toMatch(new RegExp(`was never seen before the review finished at step \\d+, though it decides the dose for ${patient} \\(`));
  });

  // v1, and the snippet the phrase sweep found (rulings R26, R29): the 'adherent' snippet ends at
  // 'ritonavir 100…', which shows the inhibitor, the letter's one atom.
  it.each([['v1: a correct route that reads only the letter line', 'lindahl_inhibitor_only'], ["R29: a snippet cut after the letter's atom", 'lindahl_snippet_cut_after_ritonavir']])('%s passes with full score (%s)', async (_v, id) => {
    const { grade } = await graded('alternative', id);
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(grade.outcome).toBe('PASS');
    expect(grade.score).toBe(1);
  });

  it.each([
    ['v2', 'duquette_inhibitor_seen_no_labs', 'Patient/pt-0041'],
    ['v3', 'ashworth_outside_creatinine_discarded', 'Patient/pt-0040'],
    ['reads only the deciding record', 'kowalczyk_weight_only_all_three', 'Patient/pt-0001'],
    ['R2, seen through a notes snippet', 'lindahl_snippet_seen_ignored', 'Patient/pt-0045'],
  ])('%s: the deciding record in view and the dose wrong is reasoning on that item alone (%s)', async (_v, id, patient) => {
    const { grade, items } = await graded('mutant', id);
    expect(grade.outcome).toBe('FAIL');
    expect(items).toEqual({ [patient]: 'reasoning' });
    expect(grade.attribution?.auto).toBe('reasoning');
  });

  it('a single patient changed in the turn of its reads fails seen_before_change on that patient alone, as process (kowalczyk_change_with_reads)', async () => {
    const { grade, items } = await graded('mutant', 'kowalczyk_change_with_reads');
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual(['seen_before_change']);
    expect(items).toEqual({ 'Patient/pt-0001': 'process' });
  });

  // Rulings R18: a deciding record seen only after the dose was written is process (the model acted
  // before checking), never reasoning; decisive_seen fails only on a record never seen before finish.
  it.each([
    ['l1_lindahl_letter_read_after_change', 'Patient/pt-0045'],
    ['l3_vance_weight_after_change', 'Patient/pt-0002'],
  ])('R18: the right dose written before the deciding record, read later, fails seen_before_change alone, as process (%s)', async (id, patient) => {
    const { grade, items } = await graded('mutant', id);
    expect(grade.outcome).toBe('FAIL');
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual(['seen_before_change']);
    expect(grade.checks.find((c) => c.id === 'decisive_seen')!.met).toBe(true);
    expect(items).toEqual({ [patient]: 'process' });
    expect(grade.attribution?.auto).toBe('process');
  });
});

describe('T1 rubric enforces only what §4 states (rulings R4)', () => {
  it('a re-sign at the same dose is no change, so it needs no note (pellegrino_resigned_no_note)', async () => {
    const { grade } = await graded('alternative', 'pellegrino_resigned_no_note');
    expect(grade.outcome).toBe('PASS');
    expect(grade.score).toBe(1);
  });
});

describe('T1 nothing_else OUTSIDE reads the committed final state', () => {
  it('a rejected medication order for a patient not on the list commits nothing, and the run passes (off_list_rejected_order)', async () => {
    const { grade, steps } = await graded('alternative', 'off_list_rejected_order');
    const rejected = steps.filter((s) => s.is_error);
    expect(rejected.map((s) => [s.tool, s.written_ids])).toEqual([['order_medication', []]]);
    const gate = grade.checks.find((c) => c.id === 'nothing_else')!;
    expect(gate.met).toBe(true);
    expect(gate.items!.find((i) => i.item === OUTSIDE)!.met).toBe(true);
    expect(grade.outcome).toBe('PASS');
  });
});
