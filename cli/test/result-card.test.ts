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

// A `cli classes --json` output (reports/w4-classes-json-contract.txt) for t-in, at the run's current
// grade: t-in/12 was regraded FAIL -> PASS by grader 17, so pass 11 and graders 16 and 17.
const CLASSES = {
  schema_version: 1, run_dirs: ['final'], grader_versions: ['16', '17'],
  tasks: {
    't-in': {
      trials_valid: 20, pass: 11, wilson: { lo: 0.3, hi: 0.7 }, split: { model: 9, environment: 0, grader: 1, infra: 0 }, guard_fires: 2, q: { trials: 20, seen_all: 18, rate: 0.9 },
      classes: [
        { class: 'threshold', fails: 3, observations: 40, pass_rate: 0.925, wilson: { lo: 0.8, hi: 0.97 }, labels: [{ trial: 3, gate: 'amended', label: 'reasoning' }, { trial: 5, gate: 'amended', label: 'reasoning' }, { trial: 9, gate: 'event_seen', label: 'retrieval' }],
          instances: [{ instance: 1, item: 'm1', label: 'm1', fails: 2, observations: 20 }, { instance: 2, item: 'm3', label: 'm3', fails: 1, observations: 20 }] },
        { class: 'filler', fails: 0, observations: 20, pass_rate: 1, wilson: { lo: 0.84, hi: 1 }, labels: [], instances: [{ instance: 1, item: 'm4', label: 'm4', fails: 0, observations: 20 }] },
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
    expect(faults).toMatch(/\| t-in \| 9 \| 9 \| 0 \| 1 \| 0 \| 0 \| cli classes \|/);
    expect(faults).toMatch(/\| t-low \| 16 \| not given \| not given \| not given \| not given \| 0 \| no audit\.jsonl, no classes entry \|/);
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
    expect(bad.err).toMatch(/schema_version: expected 1/);
    expect((await cli([join(root, 'missing')])).code).toBe(1);
    expect((await cli([])).code).toBe(2);
  });

  // builder-278 F1 (verifier-phase-P17i-W4F-196-1 P4): a classes JSON for another run is refused.
  it('refuses a classes JSON whose run_dirs do not name the run', async () => {
    // The verifier's probe: band-1 with probe-1's classes JSON.
    const band1 = join(import.meta.dirname, '../../apps/web/e2e/fixtures/band-verdict/results/runs/band-1');
    const probe = await cli([band1, '--classes', join(import.meta.dirname, 'fixtures/result-card/probe-1-classes.json')]);
    expect(probe.code).toBe(1);
    expect(probe.out).toBe('');
    expect(probe.err).toMatch(/classes: .*probe-1-classes\.json is not for this run: run_dirs \(results\/probe-1\) do not name this run \(.*band-1\); contrast-ct-prep: trials_valid 6, but the run's summary has 20 valid trials/);
    put(root, 'other-run.json', { ...CLASSES, run_dirs: ['results/probe-1'] });
    const other = await cli([final, '--classes', join(root, 'other-run.json')]);
    expect(other.code).toBe(1);
    expect(other.err).toMatch(/run_dirs \(results\/probe-1\) do not name this run/);
  });

  it('refuses a classes JSON whose trials_valid differ from the summary\'s trials', async () => {
    put(root, 'short.json', { ...CLASSES, tasks: { 't-in': { ...CLASSES.tasks['t-in'], trials_valid: 6 } } });
    const r = await cli([final, '--classes', join(root, 'short.json')]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/classes: .*short\.json is not for this run: t-in: trials_valid 6, but the run's summary has 20 valid trials$/);
    // A task the run does not hold.
    put(root, 'extra.json', { ...CLASSES, tasks: { ...CLASSES.tasks, 't-gone': CLASSES.tasks['t-in'] } });
    const x = await cli([final, '--classes', join(root, 'extra.json')]);
    expect(x.code).toBe(1);
    expect(x.err).toMatch(/is not for this run: t-gone: not a task of this run$/);
  });

  // builder-279 N1 (verifier-phase-P17i-W4F-196-r2-1 P-D): a classes JSON from the same run at an
  // earlier grade has the right run_dirs and trials_valid but another pass count and grader set.
  it('refuses a classes JSON from the same run at an earlier grade', async () => {
    // Before t-in/12's regrade: pass 10 at grader 16 only.
    put(root, 'pre-regrade.json', { ...CLASSES, grader_versions: ['16'], tasks: { 't-in': { ...CLASSES.tasks['t-in'], pass: 10 } } });
    const pre = await cli([final, '--classes', join(root, 'pre-regrade.json')]);
    expect(pre.code).toBe(1);
    expect(pre.out).toBe('');
    expect(pre.err).toMatch(/is not for this run: grader_versions \(16\) are not the graders of the run's current grades \(16, 17\); t-in: pass 10, but the run's summary has 11 passes$/);
    // The pass counts alone, and the grader set alone, are each refused.
    put(root, 'pass-only.json', { ...CLASSES, tasks: { 't-in': { ...CLASSES.tasks['t-in'], pass: 10 } } });
    const p = await cli([final, '--classes', join(root, 'pass-only.json')]);
    expect(p.code).toBe(1);
    expect(p.err).toMatch(/is not for this run: t-in: pass 10, but the run's summary has 11 passes$/);
    put(root, 'graders-only.json', { ...CLASSES, grader_versions: ['17'] });
    const g = await cli([final, '--classes', join(root, 'graders-only.json')]);
    expect(g.code).toBe(1);
    expect(g.err).toMatch(/is not for this run: grader_versions \(17\) are not the graders of the run's current grades \(16, 17\)$/);
  });

  it('refuses the verifier\'s stale probe-1 classes and a real pre-regrade probe-1 classes JSON', async () => {
    const probe1 = join(import.meta.dirname, '../../results/probe-1');
    // The verifier's P-D input: probe-1's classes with message-queue and results-inbox pass edited
    // and grader_versions ["15"].
    const d = await cli([probe1, '--classes', join(import.meta.dirname, 'fixtures/result-card/probe-1-classes-stale-probeD.json')]);
    expect(d.code).toBe(1);
    expect(d.out).toBe('');
    expect(d.err).toMatch(/probe-1-classes-stale-probeD\.json is not for this run: grader_versions \(15\) are not the graders of the run's current grades \(\d+(, \d+)*\)/);
    expect(d.err).toMatch(/results-inbox: pass 4, but the run's summary has \d+ passes/);
    // `pnpm cli classes probe-1 --json` on a copy of results/probe-1 with every record's regrades
    // removed: the classes JSON saved before the grader-16 regrade.
    const pre = await cli([probe1, '--classes', join(import.meta.dirname, 'fixtures/result-card/probe-1-classes-pre-regrade.json')]);
    expect(pre.code).toBe(1);
    expect(pre.out).toBe('');
    expect(pre.err).toMatch(/probe-1-classes-pre-regrade\.json is not for this run: grader_versions \(15, 16\) are not the graders of the run's current grades \(\d+(, \d+)*\)/);
    expect(pre.err).toMatch(/crc-care-gap: pass 4, but the run's summary has \d+ passes/);
    // The classes JSON at the current grade is accepted.
    const ok = await cli([probe1, '--classes', join(import.meta.dirname, 'fixtures/result-card/probe-1-classes.json')]);
    expect(ok.code, ok.err).toBe(0);
  });

  // builder-278 F2: cli classes' infra split beside summary's re-queued infra attempts, and a note
  // when the classes split counts invalid trials that 'failures' leaves out.
  it('shows cli classes\' infra split beside the re-queued infra attempts and notes invalid trials', async () => {
    const r = await cli([final, '--classes', classes]);
    const faults = r.out.split('## Failures by fault')[1]!.split('\n## ')[0]!;
    expect(faults).toMatch(/\| task \| failures \| model \| environment \| grader \| infra \(cli classes\) \| re-queued infra attempts \(summary infra_reruns\) \| source \|/);
    // t-in's classes split: model 9, environment 0, grader 1 (a GRADER_ERROR trial), infra 0.
    expect(faults).toMatch(/\| t-in \| 9 \| 9 \| 0 \| 1 \| 0 \| 0 \| cli classes \|/);
    expect(faults).toMatch(/\| t-low \| 16 \| not given \| not given \| not given \| not given \| 0 \| no audit\.jsonl, no classes entry \|/);
    expect(faults).toMatch(/- t-in: cli classes' split counts 1 invalid trial \(ENV_\*\/GRADER_ERROR: environment 0, grader 1\) that 'failures' \(valid trials only\) leaves out\./);
    // No note when the split counts only valid failures.
    put(root, 'valid-only.json', { ...CLASSES, tasks: { 't-in': { ...CLASSES.tasks['t-in'], split: { model: 9, environment: 0, grader: 0, infra: 2 } } } });
    const v = await cli([final, '--classes', join(root, 'valid-only.json')]);
    const vf = v.out.split('## Failures by fault')[1]!.split('\n## ')[0]!;
    expect(vf).toMatch(/\| t-in \| 9 \| 9 \| 0 \| 0 \| 2 \| 0 \| cli classes \|/);
    expect(vf).not.toContain('invalid trial');
  });

  // builder-278 F3 (verifier P5): tasks with 0 valid trials are out of the no-failures claim.
  it('leaves tasks with 0 valid trials out of the no-failures claim and names them', async () => {
    const r = await cli([join(import.meta.dirname, '../../apps/web/e2e/fixtures/trial/results/runs/trial-1')]);
    expect(r.code, r.err).toBe(0);
    const sec = r.out.split('## No failures')[1]!;
    expect(sec).not.toContain('Every task has at least one failure');
    expect(sec).toContain('No task with valid trials passed every trial.');
    expect(sec).toMatch(/Tasks with 0 valid trials \(not counted here\): discharge-medrec, results-inbox\./);
    // A clean task still gets its line, and no 0-trial line when every task has valid trials.
    const f = await cli([final]);
    const fs = f.out.split('## No failures')[1]!;
    expect(fs).toContain('t-sat: No failures in 20 trials.');
    expect(fs).not.toContain('0 valid trials');
  });

  it('readClasses rejects what cli/classes.ts classesJsonProblems rejects', () => {
    expect(() => readClasses({ ...CLASSES, tasks: { 't-in': { ...CLASSES.tasks['t-in'], classes: [{ class: 'x', fails: 1, observations: 'twelve' }] } } })).toThrow(/tasks\.t-in\.classes: missing or wrong type/);
    expect(readClasses(CLASSES).tasks['t-in']!.classes[0]!.instances[1]!.item).toBe('m3');
  });

  // `pnpm cli classes results/probe-1 --json` (cli/classes.ts, schema_version 1); the card's class
  // rows are results/probe-1/classes.md's.
  it('reads the probe-1 classes fixture and prints classes.md\'s rows', async () => {
    const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/result-card/probe-1-classes.json'), 'utf8')) as unknown;
    const c = readClasses(fixture);
    const all = Object.values(c.tasks).flatMap((t) => t.classes);
    expect(all).toHaveLength(37);
    expect(all.filter((k) => k.fails > 0).map((k) => `${k.class} ${k.fails}/${k.observations}`)).toEqual(['metformin_hold 1/12', 'metformin_two_series 1/12']);
    const probe = join(root, 'probe-1');
    writeRun(probe, 'probe-1', Object.fromEntries(Object.entries(c.tasks).map(([id, t]) => [id, { n: t.trials_valid, passes: t.pass }])));
    const r = await cli([probe, '--classes', join(import.meta.dirname, 'fixtures/result-card/probe-1-classes.json')]);
    expect(r.out).toContain('| metformin_hold | 1 (Anisha Margarita Schuster) | 1/6 | 1/12 | 0.92 | [0.65, 0.99] | #3: saline_prophylaxis -> retrieval |');
    expect(r.out).toContain('| metformin_two_series | 1 (m8) | 1/6 | 1/12 | 0.92 | [0.65, 0.99] | #4: decisive_seen -> reasoning |');
    expect(r.out).toContain('| egfr_window | 1 (Britt Vincenzo Mohr) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |');
    expect(r.out).toContain('| filler | 1 (Lauren Sixta Beahan) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |');
    expect(row(r.out, 'message-queue')).toMatch(/\| 5\/6 \| \[0\.44, 0\.97\] \| Above band \|/);
  });
});
