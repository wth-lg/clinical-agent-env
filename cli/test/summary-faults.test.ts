// Why a task fails, from the CLI (plan P17j JG7): `pnpm cli summary` writes model, effort,
// fault_counts (labels from audit.jsonl) and top_failed_checks, and prints the model and effort
// line and each task's fault box; `pnpm cli audit-check --json` gives the same counts per task
// with the M1-M4 count (failures with M1-M4 all met, of the valid failures). Hand counts over the
// clean fixture run: per task 5 PASS and 5 FAIL, each FAIL failing G1, attributed reasoning and
// labelled model.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { main as summary } from '../summary.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

const BOX = {
  fault_counts: { failures: 5, taxonomy: { retrieval: 0, reasoning: 5, output_gap: 0, over_action: 0, process: 0, did_not_finish: 0, refusal: 0, unattributed: 0 }, label: { model: 5, environment: 0, grader: 0, unlabelled: 0 }, infra_reruns: 0 },
  top_failed_checks: [{ check: 'G1', count: 5 }],
};

function clean(name: string): string {
  const dir = tempDir(`faults-${name}`);
  writeFixtureRun(dir, 'clean');
  return dir;
}

describe('pnpm cli summary', () => {
  it('writes model, effort and each task\'s fault box, and prints them', async () => {
    const dir = clean('summary');
    const out: string[] = [];
    expect(await summary([dir], { out: (l) => out.push(l), err: (l) => out.push(l) })).toBe(0);
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as { model: string; effort: string; tasks: Record<string, unknown> };
    expect(s).toMatchObject({ model: MODEL, effort: 'high' });
    for (const t of ['t-alpha', 't-beta']) expect(s.tasks[t]).toMatchObject(BOX);
    expect(out).toContain(`model ${MODEL}, effort high`);
    expect(out).toContainEqual(expect.stringMatching(/^\s+failures 5: by kind reasoning 5; by audit label model 5; infra re-runs 0; top failed checks G1 5$/));
  });

  it('without audit.jsonl the labels are not given', async () => {
    const dir = clean('no-audit');
    const { rmSync } = await import('node:fs');
    rmSync(join(dir, 'audit.jsonl'));
    const out: string[] = [];
    await summary([dir], { out: (l) => out.push(l), err: (l) => out.push(l) });
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as { tasks: Record<string, { fault_counts: { label: unknown } }> };
    expect(s.tasks['t-alpha']!.fault_counts.label).toBeNull();
    expect(out).toContainEqual(expect.stringMatching(/by audit label: no audit\.jsonl;/));
  });
});

describe('pnpm cli audit-check --json', () => {
  it('gives each task\'s fault box with the M1-M4 count', async () => {
    const out: string[] = [];
    await auditCheck([clean('audit'), '--json'], { out: (l) => out.push(l), err: () => {}, checks: fixtureChecks });
    const j = JSON.parse(out.at(-1)!) as { fault_box: Record<string, unknown> };
    for (const t of ['t-alpha', 't-beta']) expect(j.fault_box[t]).toEqual({ ...BOX, m1_m4: { met: 5, failures: 5 } });
  });
});
