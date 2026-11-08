// The decisive step the trial page links (apps/web/src/trial/decisive.ts, eval-p25u-2 MF-2): the
// step of the failing item of the decisive check, not the grader's last write to any of the check's
// ids. On final-1 crc-care-gap/5 the grader's step is 102, pt-0009's order (sr-t0011), an item
// that passed; the failing item is pt-0024's FIT order at step 82 (sr-t0002). A check whose failing
// items name no step (event_seen: "never read before finish") keeps the grader's step, the finish.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrajectory } from '../../../packages/core/trajectory.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { currentGrade } from '../../../packages/core/summary.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { decisiveOf, decisiveStepOf } from '../src/trial/decisive.ts';

// Claim audit: the page says where the step comes from, since one sentence covered a failing
// item's write (crc-care-gap/5) and the grader's finish call (contrast-ct-prep/0).
describe('decisiveOf names the source of the step', () => {
  it('crc-care-gap/5: the failing item\'s write; contrast-ct-prep/0: the finish call', () => {
    const crc = load('crc-care-gap/5');
    expect(decisiveOf(crc.record, crc.check, crc.graderStep, crc.steps)).toEqual({ step: 82, source: 'item' });
    const ct = load('contrast-ct-prep/0');
    expect(ct.check).toBe('event_seen');
    expect(decisiveOf(ct.record, ct.check, ct.graderStep, ct.steps)).toEqual({ step: 104, source: 'finish' });
    expect(ct.steps.find((s) => s.n === 104)?.tool).toBe('finish');
    // Before the trajectory loads the tool is not known: the grader's step, named as the grader's.
    expect(decisiveOf(ct.record, ct.check, ct.graderStep, null)).toEqual({ step: 104, source: 'grader' });
    expect(decisiveOf(ct.record, ct.check, null, ct.steps)).toBeNull();
  });
});

const FINAL = join(repoRoot, 'results/runs/final-1');
const load = (name: string) => {
  const record = JSON.parse(readFileSync(join(FINAL, 'trials', `${name}.json`), 'utf8')) as Parameters<typeof currentGrade>[0];
  const steps = stepsOf(parseTrajectory(readFileSync(join(FINAL, 'trajectories', `${name}.jsonl`), 'utf8')));
  const g = currentGrade(record);
  const graderStep = (g.attribution as { decisive_step: number | null } | null)?.decisive_step ?? null;
  const check = (g.attribution as { first_failed: string | null } | null)?.first_failed ?? null;
  return { record, steps, graderStep, check };
};

describe('decisiveStepOf', () => {
  it('on crc-care-gap/5 points at the failing item pt-0024 (step 82, sr-t0002), not pt-0009 at step 102', () => {
    const { record, steps, graderStep, check } = load('crc-care-gap/5');
    expect(graderStep).toBe(102);
    expect(check).toBe('fit_orders');
    expect(decisiveStepOf(record, check, graderStep, null)).toBe(82);
    expect(decisiveStepOf(record, check, graderStep, steps)).toBe(82);
    expect(steps.find((s) => s.n === 82)?.written_ids).toContain('ServiceRequest/sr-t0002');
  });

  it('keeps the grader step when the failing items name none (event_seen: never read before finish)', () => {
    const { record, steps, graderStep, check } = load('results-inbox/10');
    expect(check).toBe('event_seen');
    expect(decisiveStepOf(record, check, graderStep, steps)).toBe(graderStep);
    expect(graderStep).toBe(steps.at(-1)!.n);
  });

  it('is null when the explanation has no decisive step (a fault that is not the model\'s)', () => {
    const { record, check } = load('crc-care-gap/5');
    expect(decisiveStepOf(record, check, null, null)).toBeNull();
  });

  it('takes the first failing item in step order, from the write of its ids when it has no decision step', () => {
    const record = {
      outcome: 'FAIL',
      checks: [{ id: 'g', kind: 'gate', met: false, ids: ['A/1', 'A/2', 'A/3'], items: [
        { item: 'p1', met: true, ids: ['A/3'] },
        { item: 'p2', met: false, ids: ['A/2'] },
        { item: 'p3', met: false, ids: ['A/1'] },
      ] }],
    };
    const steps = [
      { n: 1, tool: 'w', written_ids: ['A/1'] },
      { n: 2, tool: 'w', written_ids: ['A/2'] },
      { n: 3, tool: 'w', written_ids: ['A/3'] },
    ] as unknown as Parameters<typeof decisiveStepOf>[3];
    expect(decisiveStepOf(record, 'g', 3, steps)).toBe(1);
    // Before the trajectory loads, no item step is known: the grader's step stands.
    expect(decisiveStepOf(record, 'g', 3, null)).toBe(3);
  });
});
