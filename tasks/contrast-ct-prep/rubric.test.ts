// What the matrix does not show for T5's worklist. Every scripted case runs without a rejected tool
// call, except forbidden_writes_rejected, whose rejected calls are its point; so a mutant fails on
// the trap it names and not on a write the tools refused. message_dose_times takes a dose time from
// the pattern only with its day after it, and the diphenhydramine time only in its own clause. And
// each gate's check text names the first failed study and its why.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';
import { checkText } from '../contrast-ct-prep.check-text.ts';
import { expected } from './expected.ts';
import { MESSAGES, MODERATE } from './solution/steps.ts';
import { antihistamineTimed, clockTimes } from './tests/rubric.ts';
import { mutants } from './tests/mutants.ts';

const task = await loadMatrixTask('contrast-ct-prep');
const env = matrixEnv();

describe('contrast-ct-prep scripts', () => {
  it.each(cases(task).map((c) => [c.id, c] as const))('%s: no tool call is rejected, unless rejection is the case', async (id, c) => {
    const { events } = await trial(env, task, c);
    const errors = events.flatMap((e) => (e.type === 'tool_result' && e.is_error ? [{ name: e.name, content: e.content }] : []));
    if (id === 'forbidden_writes_rejected') {
      expect(errors).toHaveLength(8);
      expect(errors.every((e) => JSON.stringify(e.content).includes('past'))).toBe(true);
    } else expect(errors).toEqual([]);
  });
});

describe('message_dose_times', () => {
  it.each([
    ['8 PM Sunday', 20 * 60],
    ['8:00 p.m. on Sunday', 20 * 60],
    ['2am Monday', 2 * 60],
    ['at 02:00 on 10/26', 2 * 60],
    ['20:00 Sun 10/25', 20 * 60],
  ])('reads %s', (text, minutes) => {
    expect(clockTimes(text).map((t) => t.minutes)).toContain(minutes);
  });

  it('the oracle message gives every dose time with its day, diphenhydramine in its own clause', () => {
    expect(antihistamineTimed(MESSAGES[MODERATE.patient]!)).toBe(true);
    expect(antihistamineTimed('Take prednisone 50 mg and Benadryl 50 mg. Prednisone again at 8:00 AM Monday.')).toBe(false);
  });
});

describe('check text', () => {
  it.each(mutants.filter((m) => m.items !== undefined).map((m) => [m.id, m] as const))('%s: the first failed gate names the failed study', async (_id, m) => {
    const grade = await gradeRun(env, task, task.checks, await trial(env, task, { kind: 'mutant', id: m.id, script: m.script }));
    const failed = grade.checks.filter((c) => c.kind === 'gate' && c.met === false);
    expect(failed.length).toBeGreaterThan(0);
    for (const c of failed) {
      const text = checkText[c.id]!.found(c.evidence as Record<string, unknown>);
      const key = Object.keys(m.items!)[0]!;
      const x = expected.items.find((s) => s.patient === key);
      expect(text, c.id).toContain(x === undefined ? 'a patient not on the list' : x.name);
    }
  });
});
