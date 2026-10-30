// Why a task fails, from the CLI (plan P17j JG7): `pnpm cli summary --write` writes model, effort,
// fault_counts (labels from audit.jsonl) and top_failed_checks, and prints the model and effort
// line and each task's fault box; `pnpm cli audit-check --json` gives the same counts per task
// with the M1-M4 count (failures with M1-M4 all met, of the valid failures). Hand counts over the
// clean fixture run: per task 5 PASS and 5 FAIL, each FAIL failing G1, attributed reasoning and
// labelled model.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { NOT_RERUN_REASON } from '../../packages/core/outcomes.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { main as auditCheck } from '../audit-check.ts';
import { main as summary } from '../summary.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

const BOX = {
  fault_counts: { failures: 5, taxonomy: { retrieval: 0, reasoning: 5, output_gap: 0, over_action: 0, process: 0, action_form: 0, did_not_finish: 0, refusal: 0, unattributed: 0 }, label: { model: 5, environment: 0, grader: 0, unlabelled: 0 }, infra_reruns: 0 },
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
    expect(await summary([dir, '--write'], { out: (l) => out.push(l), err: (l) => out.push(l) })).toBe(0);
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
    await summary([dir, '--write'], { out: (l) => out.push(l), err: (l) => out.push(l) });
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as { tasks: Record<string, { fault_counts: { label: unknown } }> };
    expect(s.tasks['t-alpha']!.fault_counts.label).toBeNull();
    expect(out).toContainEqual(expect.stringMatching(/by audit label: no audit\.jsonl;/));
  });
});

// W0-A (g): an ENV_LIMIT is never re-queued, so the batch leaves it as an unsettled attempt
// (requeue_reason ENV_LIMIT); summary counts it as env_limit and --require env_limit=0 fails on it.
describe('pnpm cli summary --require env_limit=0', () => {
  const withEnvLimit = (name: string) => {
    const dir = clean(name);
    const r = JSON.parse(readFileSync(join(dir, 'trials/t-alpha/5.json'), 'utf8')) as Record<string, unknown>;
    mkdirSync(join(dir, 'requeued/t-alpha'), { recursive: true });
    writeFileSync(join(dir, 'requeued/t-alpha/5.a-0.json'), JSON.stringify({ ...r, outcome: 'ENV_LIMIT', valid: false, fault: 'env', status: 'LIMIT', detail: 'context_window', score: null, checks: [], attribution: null, attempt: 'a-0', settled: false, requeue_reason: 'ENV_LIMIT' }));
    return dir;
  };

  it('exits 1 on a run with one ENV_LIMIT, names it, and counts env_limit in the task and the totals', async () => {
    const dir = withEnvLimit('env-limit');
    const out: string[] = [];
    expect(await summary([dir, '--allow-mock', '--require', 'env_limit=0', '--write'], { out: (l) => out.push(l), err: (l) => out.push(l) })).toBe(1);
    expect(out).toContain(`violation: ENV_LIMIT in 1 attempt (never rerun: ${NOT_RERUN_REASON.ENV_LIMIT}), required at most 0`);
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as { totals: { env_limit: number }; tasks: Record<string, { env_limit: number }> };
    expect(s.totals.env_limit).toBe(1);
    expect(s.tasks['t-alpha']!.env_limit).toBe(1);
    expect(s.tasks['t-beta']!.env_limit).toBe(0);
    expect(out).toContainEqual(expect.stringMatching(/^t-alpha\s.*ENV_LIMIT 1 /));
  });

  it('exits 0 with env_limit=1, and on the same run without the ENV_LIMIT', async () => {
    expect(await summary([withEnvLimit('env-limit-1'), '--allow-mock', '--require', 'env_limit=1'], { out: () => {}, err: () => {} })).toBe(0);
    expect(await summary([clean('env-limit-0'), '--allow-mock', '--require', 'env_limit=0'], { out: () => {}, err: () => {} })).toBe(0);
  });
});

describe('pnpm cli audit-check --json', () => {
  it('gives each task\'s fault box with the M1-M4 count', async () => {
    const out: string[] = [];
    await auditCheck([clean('audit'), '--json'], { out: (l) => out.push(l), err: () => {}, checks: fixtureChecks });
    const j = JSON.parse(out.at(-1)!) as { fault_box: Record<string, unknown> };
    for (const t of ['t-alpha', 't-beta']) expect(j.fault_box[t]).toEqual({ ...BOX, m1_m4: { met: 5, failures: 5 }, false_passes: 0 });
  });
});

// verifier-phase-P17i-JG7-1 F1, F2 and JG5-1 m2.
describe('one audit-row reader, n/a as met, and the false PASS in the counts', () => {
  const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
  const writeRows = (dir: string, xs: Array<Record<string, unknown>>) => writeFileSync(join(dir, 'audit.jsonl'), `${xs.map((r) => JSON.stringify(r)).join('\n')}\n`);
  const json = async (dir: string) => {
    const out: string[] = [];
    await auditCheck([dir, '--json'], { out: (l) => out.push(l), err: () => {}, checks: fixtureChecks });
    return JSON.parse(out.at(-1)!) as { faults: Record<string, number>; labelled_grader: number; fault_box: Record<string, { fault_counts: { label: Record<string, number> }; m1_m4: { met: number; failures: number }; false_passes: number }> };
  };

  it('summary and audit-check read the same labels: an adjudicated label that is not a label is ignored, a row without evidence_ids is skipped', async () => {
    const dir = clean('labels');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/5' ? { ...r, adjudicated_label: 'Grader' } : r.trial === 't-alpha/6' ? { ...r, label: 'grader', evidence_ids: undefined } : r)));
    await summary([dir, '--write'], { out: () => {}, err: () => {} });
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')) as { tasks: Record<string, { fault_counts: { label: Record<string, number> } }> };
    const box = (await json(dir)).fault_box['t-alpha']!.fault_counts.label;
    expect(s.tasks['t-alpha']!.fault_counts.label).toEqual(box);
    expect(box).toEqual({ model: 4, environment: 0, grader: 0, unlabelled: 1 });
  });

  it('a failure whose M1 is n/a (no gate failed) counts as confirmed in m1_m4', async () => {
    const dir = clean('m1-na');
    const file = join(dir, 'trials/t-alpha/5.json');
    const r = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...r, outcome: 'LIMIT', status: 'LIMIT', detail: 'turns', score: null, checks: [{ id: 'G1', kind: 'gate', met: true }], attribution: null }));
    writeRows(dir, rows(dir).map((x) => (x.trial === 't-alpha/5' ? { ...x, outcome: 'LIMIT', taxonomy: 'did_not_finish' } : x)));
    expect((await json(dir)).fault_box['t-alpha']!.m1_m4).toEqual({ met: 5, failures: 5 });
  });

  it('a false PASS (GR5) counts under faults.grader, labelled_grader and the task\'s false_passes', async () => {
    const dir = clean('gr5');
    writeRows(dir, rows(dir).map((r) => (r.trial === 't-alpha/0' ? { ...r, label: 'grader', model_fault: 'no' } : r)));
    const j = await json(dir);
    expect(j.faults.grader).toBe(1);
    expect(j.labelled_grader).toBe(1);
    expect(j.fault_box['t-alpha']!.false_passes).toBe(1);
    expect(j.fault_box['t-beta']!.false_passes).toBe(0);
  });
});
