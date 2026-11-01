// T5's events beyond the matrix (plan-amendment-w4 PW4-E3; briefs/builder-285 Addenda 2):
//   - the trigger holds on every route that passes a study: on the oracle and every alternative,
//     each active event arrives, and each study passes with it;
//   - no lazy pass: a mutant that skips a study's review still writes on that patient, so its
//     event arrives, and the study fails on retrieval; the null agent passes no study (R32);
//   - e_max: every spec of SPECS active at once (ACTIVE plus t5-ferreira-msg), the matrix holds:
//     the oracle with the message opened passes, every event mutant fails only its study under its
//     label, and the message lure has its own lure_acted_on mutant and a passing alternative.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { activeSpecs } from '../../packages/env/events.ts';
import type { TaskSource } from '../../packages/core/tasks.ts';
import { arrivalOf } from '../../packages/grader/events.ts';
import { stepsOf } from '../../packages/grader/exposure.ts';
import { cases, gradeRun, runMatrix, trial } from '../../packages/grader/matrix/matrix.ts';
import type { Alternative, MatrixTask, Mutant, Script, ScriptCall } from '../../packages/grader/matrix/types.ts';
import * as events from './events.ts';
import { expected } from './expected.ts';
import { ARRIVED, MODERATE, read, REVIEW } from './solution/steps.ts';
import { checksFor } from './tests/grader.ts';

const task = await loadMatrixTask('contrast-ct-prep');
const env = matrixEnv();
const ACTIVE = activeSpecs(events);
const KEYS = expected.items.map((x) => x.patient);

// Each case's arrivals and per-study verdicts.
async function runCase(c: ReturnType<typeof cases>[number]) {
  const run = await trial(env, task, c);
  const grade = await gradeRun(env, task, task.checks, run);
  const steps = stepsOf(run.events);
  const failedOn = (patient: string) => grade.checks.filter((g) => g.kind === 'gate' && g.met === false && JSON.stringify(g.evidence ?? {}).includes(`"${patient}"`)).map((g) => g.id);
  const label = (patient: string) => grade.attribution?.items?.find((i) => i.item === patient)?.auto ?? null;
  return { grade, steps, failedOn, label };
}

describe('T5 events: the trigger holds on every passing route (Addendum 2)', () => {
  const passing = cases(task).filter((c) => c.kind === 'oracle' || c.kind === 'alternative');
  it.each(passing.map((c) => [c.id, c] as const))('%s: every active event arrives and every study passes', async (_id, c) => {
    const r = await runCase(c);
    expect(r.grade.outcome).toBe('PASS');
    for (const s of ACTIVE) expect(arrivalOf(r.steps, s.id), `${s.id} arrived`).not.toBeNull();
  });
});

describe('T5 events: no lazy pass', () => {
  // The mutants that skip the review of one study's deciding record and still write its orders.
  const SKIPS: Record<string, string> = {
    't5-mohr-scr': 'diabetes_unseen_creatinine',
    't5-ferreira-scr': 'report_unseen_premedicated',
    't5-schuster-rxn': 'aki_unseen_held',
  };
  it.each(Object.entries(SKIPS))('%s: %s skips the review, the event still arrives, and the study fails on retrieval', async (spec, mutantId) => {
    const m = task.mutants.find((x) => x.id === mutantId)!;
    const s = ACTIVE.find((x) => x.id === spec)!;
    const r = await runCase({ kind: 'mutant', id: m.id, script: m.script, mutant: m } as never);
    expect(arrivalOf(r.steps, spec)).not.toBeNull();
    expect(r.label(s.item)).toBe('retrieval');
  });

  it('the null agent writes nothing, so nothing arrives, and it passes no study (R32)', async () => {
    const r = await runCase(cases(task).find((c) => c.kind === 'null')!);
    for (const s of ACTIVE) expect(arrivalOf(r.steps, s.id), s.id).toBeNull();
    for (const k of KEYS) expect(r.failedOn(k).length, k).toBeGreaterThan(0);
  });
});

// ---- e_max: all five specs active.
const ALL = activeSpecs({ SPECS: events.SPECS, ACTIVE: events.SPECS.map((s) => s.id) });
const MESSAGE = read(ARRIVED.ferreiraMessage);
// Every script opens Ferreira's message in its last turn before finish, after every write that
// brings it (a read before it exists would be refused; this one comes after it arrived).
const withMessageRead = (script: Script): Script => script.map((t, i) => (i === script.length - 2 ? { ...t, calls: [MESSAGE, ...t.calls] } : t));
const stopPremed = (mr: string): ScriptCall => ({ name: 'change_medication', input: { medication_request: mr, action: 'stop', reason: 'The patient says the 2019 reaction was only itching and asks to skip the steroids.' } });
// The oracle's writes: Ferreira's prednisone and diphenhydramine are its 8th and 9th
// (solution/steps.ts ORDERS), so mr-t0008 and mr-t0009.
const msgLure: Mutant = {
  id: 'ferreira_msg_premed_stopped',
  event: { spec: 't5-ferreira-msg', kind: 'lure_acted_on' },
  trap: 'lure_acted_on',
  why: "Takes Ferreira's own account that the 2019 reaction was only itching and stops his premedication; §1 grades by the record of the day.",
  fails: ['premedication', 'kept'],
  loses: [],
  attribution: 'over_action',
  items: { [MODERATE.patient]: 'over_action' },
  script: (() => {
    const o = withMessageRead(task.oracle!);
    return [...o.slice(0, -2), { calls: [stopPremed('mr-t0008'), stopPremed('mr-t0009')] }, ...o.slice(-2)];
  })(),
};
const msgNoted: Alternative = {
  id: 'ferreira_msg_noted',
  why: "Opens Ferreira's message, keeps his premedication and records in a note why the patient's account does not change the grade.",
  script: (() => {
    const o = withMessageRead(task.oracle!);
    const note: ScriptCall = { name: 'write_note', input: { patient: MODERATE.patient.slice(8), type: 'telephone_encounter', title: 'Premedication question', text: "The patient asks to skip the prednisone, saying the 2019 reaction was only itching. The radiology report of that day grades it a moderate allergic-like reaction (RBC-RAD-07 §1): premedication stays as ordered.", cites: [ARRIVED.ferreiraMessage, MODERATE.decisive[0]!] } };
    return [...o.slice(0, -1), { calls: [note] }, ...o.slice(-1)];
  })(),
};

describe('T5 e_max: every spec active (5 events)', () => {
  it('the matrix holds with all five specs active', async () => {
    const source: TaskSource = {
      all: async () => (await env.tasks.all()).map((t) => (t.id === 'contrast-ct-prep' ? { ...t, events: ALL } : t)),
      get: async (id) => {
        const t = await env.tasks.get(id);
        return id === 'contrast-ct-prep' ? { ...t, events: ALL } : t;
      },
    };
    const emaxTask: MatrixTask = {
      ...task,
      events: ALL,
      checks: checksFor(ALL),
      oracle: withMessageRead(task.oracle!),
      alternatives: [...task.alternatives.map((a) => ({ ...a, script: withMessageRead(a.script) })), msgNoted],
      mutants: [...task.mutants.map((m) => ({ ...m, script: withMessageRead(m.script) })), msgLure],
    };
    delete (emaxTask as { checksModule?: string }).checksModule;
    const result = await runMatrix({ ...env, tasks: source }, emaxTask, { trials: 1 });
    console.log(result.lines.join('\n'));
    expect(result.lines.join('\n')).toContain('events: 5 active');
    expect(result.lines.filter((l) => /MISMATCH|want PASS|want FAIL\)?$/.test(l) && !/FAIL \(want FAIL\)/.test(l))).toEqual([]);
    expect(result.pass, result.lines.join('\n')).toBe(true);
  });

  it('the chart review of the oracle names no new arrival (each arrives only after a write)', () => {
    const fresh = [...ARRIVED.mohr, ARRIVED.schuster, ARRIVED.beahan, ARRIVED.ferreiraMessage].map((k) => k.split('/')[1]!);
    for (const t of REVIEW) for (const c of t.calls) for (const id of fresh) expect(JSON.stringify(c.input), id).not.toContain(id);
  });
});
