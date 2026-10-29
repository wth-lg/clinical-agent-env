// The committed probe results answer the live question (verifier-phase-P17i-P18o-levers-1 F1): a
// criterion change that skips `judge-calibrate --probes` leaves results/judge-calibration/<id>.json
// showing probes of a question no grade asks. For each probe set in PROBES, the stored set has the
// criterion the matrix asks today, the same paraphrases with the same expected verdicts, and every
// paraphrase agrees. No call: a stub judge records the questions and answers unknown.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Verdict } from '../../packages/grader/check.ts';
import { Judge, type JudgeQuestion } from '../../packages/grader/judge.ts';
import { cases, gradeRunWith, trial } from '../../packages/grader/matrix/matrix.ts';
import { PROBES, type Calibration } from '../judge-calibrate.ts';
import { loadMatrixTask, matrixEnv } from '../matrix.ts';

const SLOW = 120_000;
const env = matrixEnv();

class AskedJudge extends Judge {
  readonly asked: JudgeQuestion[] = [];
  override async judge(q: JudgeQuestion): Promise<Verdict> {
    this.asked.push(q);
    return { met: 'unknown', evidence: { reason: 'stub' } };
  }
}

type Stored = NonNullable<Calibration['probes']>[number];
const storedProbes = (id: string): Stored[] => {
  const c = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'results', 'judge-calibration', `${id}.json`), 'utf8')) as { probes?: Stored | Stored[] };
  return c.probes === undefined ? [] : Array.isArray(c.probes) ? c.probes : [c.probes];
};

describe.each(Object.keys(PROBES))('probes of %s', (id) => {
  it('are stored for the criterion the matrix asks, with every paraphrase and its expected verdict, all agreeing', { timeout: SLOW }, async () => {
    const task = await loadMatrixTask(id);
    const stored = storedProbes(id);
    for (const set of PROBES[id]!) {
      let criteria: string[] = [];
      for (const c of [...cases(task)].sort((a, b) => Number(b.kind === 'oracle') - Number(a.kind === 'oracle'))) {
        const judge = new AskedJudge();
        await gradeRunWith(env, task, await trial(env, task, c), judge);
        criteria = [...new Set(judge.asked.map((q) => q.criterion).filter((x) => x.includes(set.criterion)))];
        if (criteria.length > 0) break;
      }
      expect(criteria, `${set.check} ${set.about ?? ''}`).toHaveLength(1);
      const s = stored.find((p) => p.check === set.check && p.about === set.about);
      expect(s, `${set.check} ${set.about ?? ''} stored`).toBeDefined();
      expect(s!.criterion, `${set.check} ${set.about ?? ''}`).toBe(criteria[0]);
      expect(s!.items.map(({ label, text, expected }) => ({ label, text, expected }))).toEqual(set.items.map(({ label, text, expected }) => ({ label, text, expected })));
      expect(s!.items.filter((p) => !p.agree).map((p) => p.label)).toEqual([]);
    }
  });
});
