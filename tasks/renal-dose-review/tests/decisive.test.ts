// Decisive-id integrity of T1's worklist probe (verifier-W1-probe-T1-clinical-1 F1-F2, builder-228).
// An item's decisive ids are only the records that decide its expected action: a record that cannot
// change the dose is not one. seen_before_change checks only those, so a correct route that reads
// only the deciding record passes, and attribution.ts labels a wrong dose with the deciding record
// in view as reasoning, not retrieval. The clinical verifier's variant v2
// (duquette_inhibitor_seen_no_labs) and delgado_outside_creatinine_discarded are reasoning on their
// own item alone; vance_criteria_misread reads the deciding records and decides wrong. (The other
// variants were about patients the five-patient list dropped, builder-281.) The matrix checks the
// same through Mutant.items; this file pins each case's grade by name, on the active events.
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
      'Patient/pt-0003': [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302'), 'Patient/pt-0003'],
      'Patient/pt-0041': [ref('MedicationRequest/mr-t1-1703')],
      'Patient/pt-0038': [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405'), 'Patient/pt-0038'],
      'Patient/pt-0043': [ref('Observation/obs-t1-1801'), ref('Observation/obs-t1-1802'), 'Patient/pt-0043'],
      'Patient/pt-0002': [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')],
    });
  });

  it('no two items share a decisive record (rulings R15: each item proves its own decision)', () => {
    const all = expected.items.flatMap((x) => x.decisive);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each([
    ['pellegrino_not_reviewed', 'Patient/pt-0043'],
    // R33: the age on the Patient, a Cockcroft-Gault input (verifier-W1T-190-falsepass F4).
    ['delgado_age_never_seen', 'Patient/pt-0003'],
    ['moravec_age_never_seen', 'Patient/pt-0038'],
    ['pellegrino_age_never_seen', 'Patient/pt-0043'],
  ])('R14: the expected action reached without the deciding record fails as retrieval on that item alone (%s)', async (id, patient) => {
    const { grade, items } = await graded('mutant', id);
    expect(grade.outcome).toBe('FAIL');
    expect(grade.checks.find((c) => c.id === 'doac_dose')!.met).toBe(true);
    expect(items).toEqual({ [patient]: 'retrieval' });
    const gate = grade.checks.find((c) => c.id === 'decisive_seen')!;
    expect(checkText.decisive_seen!.found(gate.evidence as Evidence)).toMatch(new RegExp(`was never seen before the review finished at step \\d+, though it decides the dose for ${patient} \\(`));
  });

  it.each([
    ['R33: the age from a search_patients row (Cockcroft-Gault input)', 'delgado_age_from_search_patients'],
  ])('%s passes with full score (%s)', async (_v, id) => {
    const { grade } = await graded('alternative', id);
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(grade.outcome).toBe('PASS');
    expect(grade.score).toBe(1);
  });

  it.each([
    ['v2', 'duquette_inhibitor_seen_no_labs', 'Patient/pt-0041'],
    ['the outside creatinine seen and set aside', 'delgado_outside_creatinine_discarded', 'Patient/pt-0003'],
    ['reads the deciding records', 'vance_criteria_misread', 'Patient/pt-0002'],
  ])('%s: the deciding record in view and the dose wrong is reasoning on that item alone (%s)', async (_v, id, patient) => {
    const { grade, items } = await graded('mutant', id);
    expect(grade.outcome).toBe('FAIL');
    expect(items).toEqual({ [patient]: 'reasoning' });
    expect(grade.attribution?.auto).toBe('reasoning');
  });

  it('a single patient changed in the turn of its reads fails seen_before_change on that patient alone, as process (duquette_change_with_reads)', async () => {
    const { grade, items } = await graded('mutant', 'duquette_change_with_reads');
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual(['seen_before_change']);
    expect(items).toEqual({ 'Patient/pt-0041': 'process' });
  });

  // Rulings R18: a deciding record seen only after the dose was written is process (the model acted
  // before checking), never reasoning; decisive_seen fails only on a record never seen before finish.
  it.each([
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

describe('R38(a): a fired amend never excuses the base review', () => {
  it.each([
    ['delgado_blind_note_fires_amend', 'Patient/pt-0003'],
  ])('%s: the blind note fires the amend, the dose is the delivered one, and the item fails decisive_seen as retrieval', async (id, patient) => {
    const { grade, items, steps } = await graded('mutant', id);
    expect(steps.some((s) => (s.arrivals ?? []).length > 0)).toBe(true);
    expect(grade.outcome).toBe('FAIL');
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual(['decisive_seen']);
    expect(items).toEqual({ [patient]: 'retrieval' });
  });

  // R38(d): the dermatology letter alone decides Vance's dose on the chart as delivered (a §2
  // inhibitor at a criteria dose of 5 mg gives 2.5 mg whatever the criteria; expected.ts), so it is
  // an any-of route and his base records are not also required. A blind note that then reads
  // nothing still fails, on the arrival.
  it('R38(d): a blind note on Vance, then the letter read and 2.5 mg kept, passes (vance_blind_note_letter_decides)', async () => {
    const { grade, steps } = await graded('alternative', 'vance_blind_note_letter_decides');
    expect(steps.some((s) => (s.arrivals ?? []).some((a) => a.spec === 'vance-itraconazole'))).toBe(true);
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(grade.outcome).toBe('PASS');
  });

  it('R38(d): a blind raise of Vance before his weight, corrected after the letter, fails seen_before_change alone, as process (vance_raised_without_weight)', async () => {
    const { grade, items } = await graded('mutant', 'vance_raised_without_weight');
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual(['seen_before_change']);
    expect(items).toEqual({ 'Patient/pt-0002': 'process' });
  });

  it('R38(d): a blind note on Vance that then reads nothing fails event_seen alone, as retrieval (vance_blind_note_reads_nothing)', async () => {
    const { grade, items } = await graded('mutant', 'vance_blind_note_reads_nothing');
    expect(grade.outcome).toBe('FAIL');
    expect(grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual(['event_seen']);
    expect(items).toEqual({ 'Patient/pt-0002': 'retrieval' });
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
