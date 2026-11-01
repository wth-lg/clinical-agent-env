// The result card (plan-amendment-w4 PW4-F, F-1): `pnpm cli result-card <run>` gives every task, in
// band or not, k/n with its Wilson 95% interval, the verdict in words (summary.ts bandVerdict, the one
// definition), pass^k beside pass@1, the failures split model / environment / grader with the grader
// faults found and fixed, the per-class and per-event table (from a saved `cli classes --json`), the
// difficulty history over earlier runs, and the strictness evidence of a task with no failures.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from '../../packages/core/anthropic.ts';
import { main as resultCard, readClasses } from '../result-card.ts';
import { tempDir } from '../../scripts/test/helpers.ts';

type Outcome = 'PASS' | 'FAIL';

function record(run: string, task: string, index: number, outcome: Outcome, regradedTo?: Outcome): Record<string, unknown> {
  return {
    trial_id: `run:fx:${task}/${index}`, run_id: run, task_id: task, task_version: `v-${task}`, env_version: `e-${task}`, grader_task_version: `g-${task}`, grader_version: '16', index, attempt: 'a-1', mode: 'live',
    model_requested: MODEL, models_returned: [MODEL], effort: 'high', status: 'COMPLETED', detail: null, outcome, valid: true, score: outcome === 'PASS' ? 1 : 0, cost_usd: 0.4, judge_cost_usd: 0,
    turns: 2, tool_calls: 2, tool_errors: { INTERNAL: 0 }, state_hash: { initial: 'h-initial', final: 'h-final', replay_final: 'h-final' }, settled: true, trajectory: `trajectories/${task}/${index}.jsonl`,
    ...(regradedTo ? { regrades: [{ grader_version: '17', grader_task_version: `g2-${task}`, outcome: regradedTo, score: regradedTo === 'PASS' ? 1 : 0, valid: true, checks: [], error: null, changed: true, at: '2026-11-01T00:00:00Z' }] } : {}) };
}

const put = (dir: string, rel: string, x: unknown) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), typeof x === 'string' ? x : `${JSON.stringify(x, null, 2)}\n`);
};

// passes of n per task; regraded: indices whose recorded FAIL a later grader regraded to PASS.
function writeRun(dir: string, run: string, tasks: Record<string, { n: number; passes: number; regraded?: number[] }>): void {
  for (const [task, { n, passes, regraded = [] }] of Object.entries(tasks)) {
    for (let i = 0; i < n; i++) {
      const fixed = regraded.includes(i);
      put(dir, `trials/${task}/${i}.json`, record(run, task, i, i < passes && !fixed ? 'PASS' : 'FAIL', fixed ? 'PASS' : undefined));
    }
  }
  put(dir, 'manifest.json', { run_id: run, model: MODEL, effort: 'high', mode: 'live', trials: 20, world_hash: 'h-initial', task_versions: Object.fromEntries(Object.keys(tasks).map((t) => [t, `v-${t}`])), batches: [] });
}

// A `cli classes --json` output (reports/w4-classes-json-contract.txt) for t-in.
const CLASSES = {
  schema_version: 1, run_dirs: ['final'], grader_versions: ['16'],
  tasks: {
    't-in': {
      trials_valid: 20, pass: 10, wilson: { lo: 0.3, hi: 0.7 }, split: { model: 9, environment: 0, grader: 1, infra: 0 }, guard_fires: 2, q: { trials: 20, seen_all: 18, rate: 0.9 },
      classes: [
        { class: 'threshold', fails: 3, observations: 40, pass_rate: 0.925, wilson: { lo: 0.8, hi: 0.97 }, labels: [{ trial: 3, gate: 'amended', label: 'reasoning' }, { trial: 5, gate: 'amended', label: 'reasoning' }, { trial: 9, gate: 'event_seen', label: 'retrieval' }],
          instances: [{ instance: 1, item: 'm1', label: '1 (m1)', fails: 2, observations: 20 }, { instance: 2, item: 'm3', label: '2 (m3)', fails: 1, observations: 20 }] },
        { class: 'filler', fails: 0, observations: 20, pass_rate: 1, wilson: { lo: 0.84, hi: 1 }, labels: [], instances: [{ instance: 1, item: 'm4', label: '1 (m4)', fails: 0, observations: 20 }] },
      ],
      events: [{ id: 'ev-a1', item: 'm1', class: 'A', active: true, fired: 20, fails: 4, observations: 18, wilson: { lo: 0.56, hi: 0.91 }, labels: [{ trial: 2, gate: 'not_amended', label: 'reasoning' }] }],
      outside_failures: [], independence: { all_items_pass: 10, expected_per_item: 9.5, expected_per_class: 9.8 },
    },
  },
};

const MATRIX = {
  grader_task_versions: {
    'g-t-sat': { task_id: 't-sat', pass: true, probes: [
      { kind: 'oracle', id: 'oracle', outcome: 'PASS', as_expected: true, failed_checks: [] },
      { kind: 'mutant', id: 'm-a', outcome: 'FAIL', as_expected: true, failed_checks: ['g1'] },
      { kind: 'mutant', id: 'm-b', outcome: 'FAIL', as_expected: true, failed_checks: ['g2'] },
      { kind: 'alternative', id: 'alt-a', outcome: 'PASS', as_expected: true, failed_checks: [] },
      { kind: 'null', id: 'null', outcome: 'FAIL', as_expected: true, failed_checks: ['g1'] },
    ] },
  },
};

async function cli(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await resultCard(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

// The table row of a task in the "## Tasks" section.
const row = (card: string, task: string) => card.split('## Tasks')[1]!.split('\n').find((l) => l.startsWith(`| ${task} |`)) ?? '';

describe('cli result-card', () => {
  const root = tempDir('result-card');
  const final = join(root, 'final');
  const pilot = join(root, 'pilot-4b');
  writeRun(final, 'final-1', { 't-in': { n: 20, passes: 10, regraded: [12] }, 't-low': { n: 20, passes: 4 }, 't-top': { n: 20, passes: 14 }, 't-above': { n: 20, passes: 15 }, 't-high': { n: 20, passes: 16 }, 't-sat': { n: 20, passes: 20 }, 't-nineteen': { n: 20, passes: 19 }, 't-below': { n: 20, passes: 3 } });
  put(final, 'matrix.json', MATRIX);
  writeRun(pilot, 'pilot-4b', { 't-in': { n: 8, passes: 8 }, 't-sat': { n: 8, passes: 6 } });
  const classes = join(root, 'classes.json');
  put(root, 'classes.json', CLASSES);

  it('gives each task k/n, Wilson 95%, the verdict in words and pass^k beside pass@1', async () => {
    const r = await cli([final]);
    expect(r.code, r.err).toBe(0);
    // A chance above 0 never reads 0.00 (pass^3 of 4/20 is 4/1140); pass^5 of 4/20 is 0.
    expect(row(r.out, 't-low')).toMatch(/^\| t-low \| 4\/20 \| \[0\.08, 0\.42\] \| In band \| 0\.20 \| <0\.01 \| 0\.00 \|/);
    expect(row(r.out, 't-top')).toMatch(/\| 14\/20 \| \[0\.48, 0\.85\] \| In band \| 0\.70 \| 0\.32 \| 0\.13 \|/);
    expect(row(r.out, 't-above')).toMatch(/\| 15\/20 \| .* \| Above band \|/);
    expect(row(r.out, 't-high')).toMatch(/\| 16\/20 \| .* \| Above band \|/);
    expect(row(r.out, 't-nineteen')).toMatch(/\| 19\/20 \| .* \| Saturated \|/);
    expect(row(r.out, 't-sat')).toMatch(/\| 20\/20 \| \[0\.84, 1\.00\] \| Saturated \| 1\.00 \| 1\.00 \| 1\.00 \|/);
    expect(row(r.out, 't-below')).toMatch(/\| 3\/20 \| .* \| Below band \|/);
    // The current grade: t-in/12 was FAIL at grader 16 and PASS at 17, so 11/20.
    expect(row(r.out, 't-in')).toMatch(/\| 11\/20 \| .* \| In band \| 0\.55 \|/);
    expect(r.out).toMatch(/Model claude-opus-5-5, effort high/);
    expect(r.out).toContain('summary computed from the records');
  });

  it('splits the failures and lists the grader faults found and fixed', async () => {
    const r = await cli([final, '--classes', classes]);
    const faults = r.out.split('## Failures by fault')[1]!.split('\n## ')[0]!;
    expect(faults).toMatch(/\| t-in \| 9 \| 9 \| 0 \| 1 \| 0 \| cli classes \|/);
    expect(faults).toMatch(/\| t-low \| 16 \| not given \| not given \| not given \| 0 \| no audit\.jsonl, no classes entry \|/);
    expect(r.out).toMatch(/t-in\/12: FAIL at grader 16, PASS at grader 17/);
  });

  it('prints the per-class and per-event table from the classes JSON, with Wilson from the counts', async () => {
    const r = await cli([final, '--classes', classes]);
    const sec = r.out.split('## Per class and per event')[1]!.split('\n## ')[0]!;
    expect(sec).toContain('### t-in');
    expect(sec).toMatch(/q \(trials that saw every arrival\): 18\/20/);
    expect(sec).toMatch(/finish guard fires: 2/);
    expect(sec).toMatch(/\| threshold \| 1 \(m1\) \| 2\/20 \| 3\/40 \| 0\.93 \| \[0\.80, 0\.97\] \| #3: amended -> reasoning; #5: amended -> reasoning; #9: event_seen -> retrieval \|/);
    expect(sec).toContain('|  | 2 (m3) | 1/20 |  |  |  |  |');
    expect(sec).toMatch(/\| ev-a1 \| m1 \| A \| yes \| 20 \| 4\/18 \| 0\.78 \| \[0\.55, 0\.91\] \| #2: not_amended -> reasoning \|/);
    // A task with no classes entry says so.
    expect(sec).toMatch(/### t-low\n\nNot in the classes JSON\./);
  });

  it('without --classes the per-class section says it is not given', async () => {
    const r = await cli([final]);
    expect(r.out.split('## Per class and per event')[1]).toMatch(/^\s*Not given: pass --classes <file>/);
  });

  it('gives the difficulty history, earlier runs first', async () => {
    const r = await cli([final, '--history', pilot]);
    const sec = r.out.split('## Difficulty history')[1]!.split('\n## ')[0]!;
    expect(sec).toMatch(/\| task \| pilot-4b \| final-1 \|/);
    expect(sec).toMatch(/\| t-in \| 8\/8 Above band \| 11\/20 In band \|/);
    expect(sec).toMatch(/\| t-sat \| 6\/8 Above band \| 20\/20 Saturated \|/);
    expect(sec).toMatch(/\| t-low \| none \| 4\/20 In band \|/);
  });

  it('gives a task with no failures its strictness evidence', async () => {
    const r = await cli([final]);
    const sec = r.out.split('## No failures')[1]!.split('\n## ')[0]!;
    expect(sec).toMatch(/t-sat: No failures in 20 trials\. .*matrix\.json at grader_task_version g-t-sat: the oracle passes, 2 of 2 mutants fail as declared, 1 of 1 alternatives pass, the null agent fails/);
    expect(sec).not.toContain('t-in');
    // Without matrix.json it names the command.
    const bare = tempDir('result-card-bare');
    writeRun(bare, 'bare-1', { 't-sat': { n: 6, passes: 6 } });
    const b = await cli([bare]);
    expect(b.out).toMatch(/t-sat: No failures in 6 trials\. .*no matrix\.json; the evidence is `pnpm cli matrix --task t-sat`/);
  });

  it('--out writes the card; a bad classes file or run is an error', async () => {
    const out = join(root, 'card.md');
    expect((await cli([final, '--out', out])).code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('# Result card: final-1');
    put(root, 'bad.json', { schema_version: 2, tasks: {} });
    const bad = await cli([final, '--classes', join(root, 'bad.json')]);
    expect(bad.code).toBe(1);
    expect(bad.err).toMatch(/schema_version 2/);
    expect((await cli([join(root, 'missing')])).code).toBe(1);
    expect((await cli([])).code).toBe(2);
  });

  it('readClasses names the first field that breaks the contract', () => {
    expect(() => readClasses({ ...CLASSES, tasks: { 't-in': { ...CLASSES.tasks['t-in'], classes: [{ class: 'x', fails: 1, observations: 'twelve' }] } } })).toThrow(/tasks\.t-in\.classes\[0\]\.observations/);
    expect(readClasses(CLASSES).tasks['t-in']!.classes[0]!.instances[1]!.item).toBe('m3');
  });

  // reports/w4-classes-json-contract.txt shape, built from results/probe-1/classes.md at 631695f5
  // (evidence/builder-276/probe1/classes-md-to-json.py); the card's class rows are classes.md's.
  it('reads the probe-1 classes fixture and prints classes.md\'s rows', async () => {
    const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/result-card/probe-1-classes.json'), 'utf8')) as typeof CLASSES;
    const c = readClasses(fixture);
    const all = Object.values(c.tasks).flatMap((t) => t.classes);
    expect(all).toHaveLength(37);
    expect(all.filter((k) => k.fails > 0).map((k) => `${k.class} ${k.fails}/${k.observations}`)).toEqual(['metformin_hold 1/12', 'metformin_two_series 1/12']);
    const probe = join(root, 'probe-1');
    writeRun(probe, 'probe-1', Object.fromEntries(Object.entries(c.tasks).map(([id, t]) => [id, { n: 6, passes: t.split.model + t.split.grader === 0 ? 6 : 5 }])));
    const r = await cli([probe, '--classes', join(import.meta.dirname, 'fixtures/result-card/probe-1-classes.json')]);
    expect(r.out).toContain('| metformin_hold | 1 (Anisha Margarita Schuster) | 1/6 | 1/12 | 0.92 | [0.65, 0.99] | #3: saline_prophylaxis -> retrieval |');
    expect(r.out).toContain('| metformin_two_series | 1 (m8) | 1/6 | 1/12 | 0.92 | [0.65, 0.99] | #4: decisive_seen -> reasoning |');
    expect(r.out).toContain('| egfr_window | 1 (Britt Vincenzo Mohr) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |');
    expect(r.out).toContain('| filler | 1 (Lauren Sixta Beahan) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |');
    expect(row(r.out, 'message-queue')).toMatch(/\| 5\/6 \| \[0\.44, 0\.97\] \| Above band \|/);
  });
});
