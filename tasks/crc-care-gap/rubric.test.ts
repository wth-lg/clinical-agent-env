// The rubric items each T3 mutant declares it loses (tests/mutants.ts `loses`), checked here
// until the matrix checks them itself: every other table item stays met, so the judge rules
// credit only the row the trap changes. Graded from the canned judge cache.
import { describe, expect, it } from 'vitest';
import { PROBES } from '../../cli/judge-calibrate.ts';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import type { Verdict } from '../../packages/grader/check.ts';
import { stepsOf } from '../../packages/grader/exposure.ts';
import { Judge, type JudgeQuestion } from '../../packages/grader/judge.ts';
import { cases, gradeRun, gradeRunWith, trial, type Case, type Miss } from '../../packages/grader/matrix/matrix.ts';
import type { ScriptCall } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { finish, message, outreach, PT } from './solution/steps.ts';
import { alternatives } from './tests/alternatives.ts';
import { mutants } from './tests/mutants.ts';
import { named } from './tests/rubric.ts';

const task = await loadMatrixTask('crc-care-gap');
const env = matrixEnv();

// Case id -> the rubric items it loses: a table item not met, or a penalty (-3) met. The
// mutants and alternatives declare theirs in tests/; the oracle loses none.
const LOSES: Record<string, readonly string[]> = {
  oracle: [],
  ...Object.fromEntries(alternatives.map((a) => [a.id, a.loses ?? []])),
  ...Object.fromEntries(mutants.map((m) => [m.id, m.loses])),
};

// The resources each member's status rests on, which the oracle must read in full (exposed, not
// only referenced by a search row) before it finishes: the table must rest on what it saw.
const DECIDING: Record<string, readonly string[]> = {
  'Patient/pt-0009': ['Condition/cond-t3-e7-frailty', 'MedicationRequest/mr-t3-e7-donepezil'],
  'Patient/pt-0011': ['Patient/pt-0011'],
  'Patient/pt-0014': ['Procedure/proc-t3-e1-colonoscopy'],
  'Patient/pt-0020': ['EpisodeOfCare/eoc-t3-e9-hospice'],
  'Patient/pt-0021': ['DocumentReference/doc-t3-e6-opnote'],
  'Patient/pt-0024': ['ServiceRequest/sr-t3-e11-fit'],
  'Patient/pt-0025': ['Procedure/proc-t3-e12-ctc'],
  ...Object.fromEntries(expected.members.filter((x) => x.decisive.length).map((x) => [x.patient, x.decisive])),
};

describe('crc-care-gap rubric', () => {
  it.each(Object.entries(LOSES))('%s loses %j', async (id, loses) => {
    const c = cases(task).find((x) => x.id === id);
    expect(c, `case ${id}`).toBeDefined();
    const misses: Miss[] = [];
    const grade = await gradeRun(env, task, task.checks, await trial(env, task, c!), misses);
    expect(misses).toEqual([]);
    const lost = grade.checks.filter((r) => r.kind === 'rubric' && ((r.points! > 0 && r.met !== true) || (r.points! < 0 && r.met !== false))).map((r) => r.id).sort();
    expect(lost).toEqual([...loses].sort());
  });

  it('the oracle exposes every resource a member\'s status rests on', async () => {
    const oracle = cases(task).find((x) => x.id === 'oracle')!;
    const steps = stepsOf((await trial(env, task, oracle)).events);
    const exposed = new Set(steps.flatMap((s) => s.exposed_ids));
    expect(Object.keys(DECIDING).sort()).toEqual(expected.members.map((x) => x.patient).sort());
    expect(Object.values(DECIDING).flat().filter((id) => !exposed.has(id))).toEqual([]);
  });

  // The alternative must reach E4's birth date only through search_patients, or its PASS above
  // says nothing about search exposure.
  it('e4_birth_date_from_search_patients exposes E4 through search_patients alone', async () => {
    const c = cases(task).find((x) => x.id === 'e4_birth_date_from_search_patients')!;
    const steps = stepsOf((await trial(env, task, c)).events);
    const e4 = steps.filter((s) => s.exposed_ids.includes('Patient/pt-0023')).map((s) => s.tool);
    expect(e4.length).toBeGreaterThan(0);
    expect(new Set(e4)).toEqual(new Set(['search_patients']));
  });

  it.each([
    ["Harrison O’Keefe", 'Patient/pt-0019'],
    ['HARRISON OKEEFE', 'Patient/pt-0019'],
    ['Angela Vigil', 'Patient/pt-0021'],
    ['Pagac', 'Patient/pt-0014'],
    ['Okafor CRC 2026', null],
    ['Ángela Vigil', 'Patient/pt-0021'],
    ['Mrs. Vigil', 'Patient/pt-0021'],
    ['| pt-0017 | Open gap |', 'Patient/pt-0017'],
    ['Patient/pt-0023', 'Patient/pt-0023'],
    ['pt-00170', null],
  ])('finds the row of %j', (text, patient) => {
    const hit = expected.members.filter((x) => named(x, text)).map((x) => x.patient);
    expect(hit).toEqual(patient ? [patient] : []);
  });

  // contacted_<patient> is hybrid (verifier-phase-P17i-P17-T3-1 S3): code finds the messages that
  // reach the patient (met, no judge call) and the Tasks and staff messages the trial created
  // about them; the judge decides whether those ask for contact. A stub judge answers each of the
  // verifier's 13 sentences (cli/judge-calibrate.ts PROBES, run live by --probes) with its true
  // answer, so these cases pin the code half: what is asked, with which text, and what is met.
  describe('contacted_pt_0020', () => {
    const SET = PROBES['crc-care-gap']!.find((p) => p.check === 'contacted_pt_0020')!;
    const SENTENCES = SET.items;
    class StubJudge extends Judge {
      readonly asked: JudgeQuestion[] = [];
      override async judge(q: JudgeQuestion): Promise<Verdict> {
        if (!q.criterion.includes(SET.criterion)) return { met: 'unknown', evidence: { reason: 'stub' } };
        this.asked.push(q);
        const s = SENTENCES.find((x) => q.text.includes(x.text));
        return s === undefined ? { met: 'unknown', evidence: { reason: 'no sentence' } } : { met: s.expected === 'met', evidence: { verdict: s.expected } };
      }
    }
    const task9 = (description: string): ScriptCall => ({ name: 'create_task', input: { patient: PT.E9, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description } });
    const grade = async (calls: ScriptCall[]) => {
      const c: Case = { kind: 'alternative', id: 'contact-probe', script: [{ calls }, { calls: [finish()] }], loses: [] };
      const judge = new StubJudge();
      const g = await gradeRunWith(env, task, await trial(env, task, c), judge);
      const r = g.checks.find((x) => x.id === 'contacted_pt_0020')!;
      return { met: r.met, points: r.points, asked: judge.asked };
    };

    it.each(SENTENCES.map((x) => [x.label, x.text, x.expected] as const))('a Task for E9: %s', async (_label, text, want) => {
      const r = await grade([task9(text)]);
      expect(r.asked.map((q) => q.text)).toEqual([text]);
      expect(r.met).toBe(want === 'met');
      expect(r.points).toBe(-5);
    });

    it.each(SENTENCES.map((x) => [x.label, x.text, x.expected] as const))('a staff message about E9: %s', async (_label, text, want) => {
      const r = await grade([message('Group/pool-scheduling', 'Kelsie Rohan', text, [`Patient/${PT.E9}`])]);
      expect(r.asked.map((q) => q.text)).toEqual([`Kelsie Rohan\n${text}`]);
      expect(r.met).toBe(want === 'met');
    });

    it('a message that reaches E9 is contact, with no judge call', async () => {
      const r = await grade([outreach(PT.E9, null)]);
      expect(r).toMatchObject({ met: true, asked: [] });
    });

    // E5 may be contacted (expected.ts message null), so no contacted item asks about her Task.
    it('nothing about E9 asks nothing and is not met', async () => {
      const r = await grade([{ name: 'create_task', input: { patient: PT.E5, owner: 'Group/pool-scheduling', due: '2026-10-30', priority: 'routine', description: 'Please call this patient to offer a FIT kit.' } }]);
      expect(r).toMatchObject({ met: false, asked: [] });
    });

    it('a Task and a staff message about E9 are one question', async () => {
      const r = await grade([task9(SENTENCES[1]!.text), message('Group/pool-scheduling', 'Kelsie Rohan', SENTENCES[0]!.text, [`Patient/${PT.E9}`])]);
      expect(r.asked.length).toBe(1);
      expect(r.met).toBe(true);
    });
  });
});
