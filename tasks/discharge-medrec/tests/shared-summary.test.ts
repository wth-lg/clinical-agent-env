// Pins the stop-gap in tests/grader.ts DECISIVE_KEY (builder-239; coordinator ruling on the
// verifier-W1-probe-T4-clinical-2 N1 fix): a discharge summary that decides two items, each by its
// own line, is named to attribution as <Type>/<id> for one item and as the bare <id> for the other,
// because check.ts seen_at holds one rule per decisive id and each item's line has atoms of its own
// (R29). This test fails if a later change to exposure.ts sameId (or to how attribution reads
// decisive ids) stops reading both spellings as one record, or if an item loses its own rule. The
// proper fix, per-item rules in itemGate, belongs to the attribution hardening PR; drop
// DECISIVE_KEY and this test with it.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { firstExposed, sameId, stepsOf } from '../../../packages/grader/exposure.ts';
import type { GateCheck } from '../../../packages/grader/check.ts';
import { gradeRun, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { Script } from '../../../packages/grader/matrix/types.ts';
import { expected } from '../expected.ts';
import { modify, MR, readDoc, script, searchNotes } from '../solution/steps.ts';
import { checks, firstSeen } from './grader.ts';

const gate = (id: string) => checks.find((c): c is GateCheck => c.kind === 'gate' && c.id === id)!;
const summaryOf = (patient: string) => expected.patients.find((p) => p.patient === patient)!.summary;
const SHARED = [...new Set(expected.items.flatMap((x) => x.decisive))].filter((d) => new Set(expected.items.filter((x) => x.decisive.includes(d)).map((x) => JSON.stringify(x.atoms[d]))).size > 1);

describe('a discharge summary two items decide (DECISIVE_KEY stop-gap)', async () => {
  const env = matrixEnv();
  const task = await loadMatrixTask('discharge-medrec');
  const labels = async (id: string, s: Script) => {
    const run = await trial(env, task, { kind: 'alternative', id, script: s });
    const grade = await gradeRun(env, task, task.checks, run);
    return { items: Object.fromEntries((grade.attribution?.items ?? []).map((i) => [i.item, i.auto])), steps: stepsOf(run.events) };
  };

  it('names each shared summary two ways, both the same record, each with one item\'s own rule', async () => {
    expect(SHARED).toEqual([summaryOf('Patient/pt-0005'), summaryOf('Patient/pt-0044')]);
    for (const g of ['med_actions', 'decisive_seen', 'seen_before_change'].map(gate)) {
      for (const d of SHARED) {
        const keys = g.decisive_ids.filter((k) => sameId(k, d) || sameId(d, k));
        expect(keys, `${g.id} ${d}`).toEqual([d, d.split('/')[1]!]);
        expect(keys.every((k) => sameId(k, d.split('/')[1]!)), 'both spellings name the record').toBe(true);
      }
      // Every decisive record of every item has a seen_at rule under one spelling of it.
      for (const x of expected.items) for (const d of x.decisive) {
        expect(g.decisive_ids.some((k) => sameId(k, d.split('/')[1]!) && g.seen_at?.[k] !== undefined), `${g.id} ${x.key}`).toBe(true);
      }
    }
    // Each spelling's rule is its own item's: a snippet that shows only the KCl line is seen by
    // kim-kcl's spelling and not by kim-omeprazole's.
    const { steps } = await labels('kcl_snippet', [{ calls: [KCL] }]);
    const d = summaryOf('Patient/pt-0005');
    const g = gate('decisive_seen');
    expect([d, d.split('/')[1]!].map((k) => g.seen_at![k]!(steps) !== null)).toEqual([true, false]);
  });

  it('exposure and shown text read both spellings as the one record', async () => {
    const { steps } = await labels('whole_read', [{ calls: [readDoc('kimSummary')] }]);
    const d = summaryOf('Patient/pt-0005');
    expect(firstExposed(steps, d)).not.toBeNull();
    expect(firstExposed(steps, d.split('/')[1]!)).toBe(firstExposed(steps, d));
    for (const x of expected.items.filter((i) => i.patient === 'Patient/pt-0005' && i.atoms[d] !== undefined)) {
      expect(firstSeen(steps, { ...x, atoms: { [d.split('/')[1]!]: x.atoms[d]! } }, d.split('/')[1]!), x.key).toBe(firstSeen(steps, x, d));
      expect(firstSeen(steps, x, d), x.key).not.toBeNull();
    }
  });

  // kim-kcl is named by <Type>/<id> and kim-omeprazole by the bare id. Each is labelled by whether
  // its own line was shown, whatever the sibling's line did.
  // A 'resume' snippet (anchored on the lisinopril line) shows the KCl stop line and is cut before
  // the substitution clause reaches 'in place of home'. A 'potassium chloride' snippet shows both
  // lines (R26, R29).
  const KCL = searchNotes('kim', 'resume');
  const SUB = searchNotes('kim', 'formulary substitution');
  const rewritten = modify(MR.kimOmeprazole, { value: 40, unit: 'mg', frequency: 'QD' }, 'Reconciliation review');
  it('labels the typed-spelling item reasoning when only its line was shown in a snippet', async () => {
    // Only kcl's line is shown, so a merged phrase map (the sibling's line under one spelling) would
    // read the summary as unseen for kim-kcl and label it retrieval. kim-omeprazole's own line was
    // never shown, so it fails decisive_seen as retrieval: each item reads its own line.
    expect((await labels('kcl_line_seen_kcl_kept', script({ skip: ['kimSummary'], also: [KCL], over: { kimKcl: [] } }))).items).toEqual({ 'kim-kcl': 'reasoning', 'kim-omeprazole': 'retrieval' });
  });
  it('labels the bare-spelling item by its own line: reasoning when shown, retrieval when only the sibling line was', async () => {
    expect((await labels('sub_line_seen', script({ skip: ['kimSummary'], also: [KCL, SUB], extra: [rewritten] }))).items).toEqual({ 'kim-omeprazole': 'reasoning' });
    expect((await labels('sub_line_unseen', script({ skip: ['kimSummary'], also: [KCL], extra: [rewritten] }))).items).toEqual({ 'kim-omeprazole': 'retrieval' });
  });
});
