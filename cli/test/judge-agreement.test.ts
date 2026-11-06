// pnpm cli judge-agreement (plan phase P23, code PR; planner-15 R14-33): agreement of hand labels
// with the judge and extractor answers a run's records cached, and, with --double-label, Cohen's
// kappa of the blinded double label and of the builder labels against the LLM auditor's verdicts,
// recomputed from the stored files. Exit 1 below 40 judge or 20 extraction labels, below 20 double
// labels, or when either kappa is below 0.6. Mocked: fixture runs in temp dirs, no call.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_LABELS } from '../../packages/core/outcomes.ts';
import { tempDir } from '../../scripts/test/helpers.ts';
import { cohenKappa, KAPPA_FLOOR, main, MIN_DOUBLE_LABELS, MIN_EXTRACT_LABELS, MIN_JUDGE_LABELS, sampleTrials } from '../judge-agreement.ts';
import { TASKS, writeFixtureRun } from './run-fixtures.ts';

type Row = Record<string, unknown>;
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Row;
const put = (file: string, lines: Row[]) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
};
const entry = (key: string, kind: 'judge' | 'extract', answer: Row | null) => ({ key, kind, model: 'claude-opus-5-5', effort: 'medium', prompt_version: 'judge-v1', answer, error: answer === null ? 'invalid twice' : null, calls: 1 });

// The clean fixture of 20 trials per task (10 FAIL each, 20 valid failures), every record with two
// judge answers (met, not_met) and one extraction (42) in its cache; t-beta/0's extraction got no answer.
function run(): string {
  const dir = tempDir('judge-agreement-run');
  writeFixtureRun(dir, 'clean', { trials: 20 });
  for (const task of TASKS) {
    for (let i = 0; i < 20; i++) {
      const file = join(dir, 'trials', task, `${i}.json`);
      const r = readJson(file);
      r.judge = { calls: 3, unknown: 0, cache: [
        entry(`${task}-${i}-j1`, 'judge', { verdict: 'met', quote: 'the dose' }),
        entry(`${task}-${i}-j2`, 'judge', { verdict: 'not_met', quote: '' }),
        entry(`${task}-${i}-e1`, 'extract', task === 't-beta' && i === 0 ? null : { value: 42, quote: 'CrCl 42', source: 'llm' }),
      ] };
      writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
    }
  }
  return dir;
}

// 40 judge labels (two per failure) and 20 extraction labels (one per failure), with two judge
// disagreements and one extraction disagreement.
function handLabels(dir: string, over: { judge?: number; extract?: number } = {}): string {
  const failures = TASKS.flatMap((task) => Array.from({ length: 10 }, (_, k) => ({ task, i: 10 + k })));
  const judge = failures.flatMap(({ task, i }) => [
    { trial: `${task}/${i}`, key: `${task}-${i}-j1`, kind: 'judge', answer: { verdict: task === 't-alpha' && i === 10 ? 'not_met' : 'met' } },
    { trial: `${task}/${i}`, key: `${task}-${i}-j2`, kind: 'judge', answer: { verdict: task === 't-alpha' && i === 11 ? 'unknown' : 'not_met' } },
  ]);
  const extract = failures.map(({ task, i }) => ({ trial: `${task}/${i}`, key: `${task}-${i}-e1`, kind: 'extract', answer: { value: task === 't-beta' && i === 12 ? 41 : 42 } }));
  const file = join(dir, 'hand-labels.jsonl');
  put(file, [{ kind: 'sample', run: 'final-1', seed: 3, labeller: 'fixture-labeller', note: 'judge outputs hidden' }, ...judge.slice(0, over.judge ?? judge.length), ...extract.slice(0, over.extract ?? extract.length)]);
  return file;
}

const failures = (): string[] => TASKS.flatMap((task) => Array.from({ length: 10 }, (_, k) => `${task}/${10 + k}`));

// The auditor's outputs: every failure model but t-beta/15 (environment); the four audited PASSes confirmed.
function auditorOutputs(dir: string): void {
  for (const name of failures()) {
    const [task, i] = name.split('/') as [string, string];
    put(join(dir, 'auditor', task, `${i}.json`), [{ trial: name, outcome: 'FAIL', verdict: { label: name === 't-beta/15' ? 'environment' : 'model', clinically_acceptable: 'yes', tool_rejections_correct: 'yes', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], reason: 'wrong value' }, problem: null }]);
  }
  for (const task of TASKS) for (const i of [0, 1]) put(join(dir, 'auditor', task, `${i}.json`), [{ trial: `${task}/${i}`, outcome: 'PASS', verdict: { label: 'pass', clinically_acceptable: 'yes', tool_rejections_correct: 'yes', decisive_step: null, evidence_ids: [], reason: 'right' }, problem: null }]);
}

function doubleLabels(dir: string, labels: Record<string, string> = {}, header: Row = { kind: 'sample', seed: 7, n: 20, labeller: 'fixture-verifier' }): void {
  const names = sampleTrials(failures(), header.n as number, header.seed as number);
  put(join(dir, 'double-labels.jsonl'), [header, ...names.map((trial) => ({ trial, label: labels[trial] ?? 'model', note: 'blind' }))]);
}

async function check(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('judge-agreement', () => {
  it('prints n_judge, n_extract and both agreement rates, and exits 0 at 40 and 20 labels', async () => {
    const dir = run();
    const labels = handLabels(dir);
    const r = await check([dir, '--labels', labels]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('judge-agreement: n_judge=40 agree=38 (0.950), n_extract=20 agree=19 (0.950)');
    expect(r.out).toContain('t-alpha/10 t-alpha-10-j1 judge: hand not_met, cached met');
    expect(r.out).toContain('t-beta/12 t-beta-12-e1 extract: hand 41, cached 42');
    const j = await check([dir, '--labels', labels, '--json']);
    expect(j.code).toBe(0);
    expect(JSON.parse(j.out)).toMatchObject({ n_judge: 40, judge_agree: 38, judge_agreement: 0.95, n_extract: 20, extract_agree: 19, extract_agreement: 0.95, violations: [] });
    expect((JSON.parse(j.out) as { disagreements: unknown[] }).disagreements).toHaveLength(3);
  });

  it('exits 1 below 40 judge or 20 extraction labels, naming the floor', async () => {
    const dir = run();
    const a = await check([dir, '--labels', handLabels(dir, { judge: 39 })]);
    expect(a.code).toBe(1);
    expect(a.out).toContain(`violation: 39 judge labels, need ${MIN_JUDGE_LABELS}`);
    const b = await check([dir, '--labels', handLabels(dir, { extract: 19 })]);
    expect(b.code).toBe(1);
    expect(b.out).toContain(`violation: 19 extraction labels, need ${MIN_EXTRACT_LABELS}`);
  });

  it('the extraction floor applies only when the run caches an extraction: a run whose tasks ask none passes at 0 and says so', async () => {
    // No task of final-1 declares a hybrid item, so its records cache no extraction (builder-323;
    // coordinator ruling on msg_d69cdbbb675b): the 20-label floor cannot apply there.
    const dir = run();
    for (const task of TASKS) {
      for (let i = 0; i < 20; i++) {
        const file = join(dir, 'trials', task, `${i}.json`);
        const r = readJson(file);
        (r.judge as { cache: Array<{ kind: string }> }).cache = (r.judge as { cache: Array<{ kind: string }> }).cache.filter((e) => e.kind !== 'extract');
        writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
      }
    }
    const r = await check([dir, '--labels', handLabels(dir, { extract: 0 })]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('judge-agreement: n_judge=40 agree=38 (0.950), n_extract=0 of 0 cached: no task of this run asks an extraction');
    expect(r.out).not.toContain('violation');
    const j = await check([dir, '--labels', handLabels(dir, { extract: 0 }), '--json']);
    expect(JSON.parse(j.out)).toMatchObject({ n_judge: 40, n_extract: 0, extract_cached: 0, extract_agreement: null, violations: [] });
    // With an extraction cached, the floor stands: the clean run at 0 extraction labels exits 1.
    const cached = run();
    const c = await check([cached, '--labels', handLabels(cached, { extract: 0 })]);
    expect(c.code).toBe(1);
    expect(c.out).toContain(`violation: 0 extraction labels, need ${MIN_EXTRACT_LABELS}`);
    expect(c.out).toContain('n_extract=0 agree=0 (n/a)');
    expect(JSON.parse((await check([cached, '--labels', handLabels(cached), '--json'])).out)).toMatchObject({ extract_cached: 40 });
  });

  it('a label whose key the record did not cache, a cached answer that is null, a trial the run has not, or a malformed row is a violation', async () => {
    const dir = run();
    const file = join(dir, 'hand-labels.jsonl');
    const lines = readFileSync(handLabels(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
    lines.push({ trial: 't-alpha/10', key: 'no-such-key', kind: 'judge', answer: { verdict: 'met' } });
    lines.push({ trial: 't-beta/0', key: 't-beta-0-e1', kind: 'extract', answer: { value: 42 } });
    lines.push({ trial: 't-gamma/1', key: 'k', kind: 'judge', answer: { verdict: 'met' } });
    lines.push({ trial: 't-alpha/10', key: 't-alpha-10-j1', kind: 'judge', answer: { verdict: 'maybe' } });
    put(file, lines);
    const r = await check([dir, '--labels', file]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/10 no-such-key: the record cached no judge answer under that key');
    expect(r.out).toContain('violation: t-beta/0 t-beta-0-e1: the cached extraction has no answer (invalid twice)');
    expect(r.out).toContain('violation: t-gamma/1: the run has no such trial');
    expect(r.out).toContain('violation: hand-labels.jsonl line 65: a judge answer needs verdict met, not_met or unknown');
    expect(r.out).toContain('n_judge=40');
  });

  it('a (trial, key) pair labelled twice is a violation and counts once, so repeats cannot meet the floors', async () => {
    const dir = run();
    const one = { trial: 't-alpha/10', key: 't-alpha-10-j1', kind: 'judge', answer: { verdict: 'met' } };
    const two = { trial: 't-alpha/10', key: 't-alpha-10-e1', kind: 'extract', answer: { value: 42 } };
    const file = join(dir, 'repeats.jsonl');
    put(file, [...Array.from({ length: 40 }, () => one), ...Array.from({ length: 20 }, () => two)]);
    const r = await check([dir, '--labels', file]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: t-alpha/10 t-alpha-10-j1: labelled twice');
    expect(r.out).toContain('violation: t-alpha/10 t-alpha-10-e1: labelled twice');
    expect(r.out).toContain(`violation: 1 judge labels, need ${MIN_JUDGE_LABELS}`);
    expect(r.out).toContain(`violation: 1 extraction labels, need ${MIN_EXTRACT_LABELS}`);
    expect(r.out).toContain('n_judge=1 agree=1 (1.000), n_extract=1 agree=1 (1.000)');
    // One repeat in a full file: the counts stay 40 and 20, and the repeat is a violation.
    const full = readFileSync(handLabels(dir), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
    put(file, [...full, full[1]!]);
    const again = await check([dir, '--labels', file]);
    expect(again.code).toBe(1);
    expect(again.out).toContain('violation: t-alpha/10 t-alpha-10-j1: labelled twice');
    expect(again.out).toContain('n_judge=40 agree=38');
  });

  it('--write puts the agreement into <run>/summary.json and leaves the rest of it as it was', async () => {
    const dir = run();
    writeFileSync(join(dir, 'summary.json'), `${JSON.stringify({ schema_version: 10, run_id: 'final-1', tasks: {} }, null, 2)}\n`);
    expect((await check([dir, '--labels', handLabels(dir), '--write'])).code).toBe(0);
    const s = readJson(join(dir, 'summary.json'));
    expect(s).toMatchObject({ schema_version: 10, run_id: 'final-1', judge_agreement: { n_judge: 40, judge_agreement: 0.95, n_extract: 20, extract_agreement: 0.95 } });
    expect(typeof (s.judge_agreement as Row).labels).toBe('string');
    // Written twice, the file is the same.
    const text = readFileSync(join(dir, 'summary.json'), 'utf8');
    expect((await check([dir, '--labels', handLabels(dir), '--write'])).code).toBe(0);
    expect(readFileSync(join(dir, 'summary.json'), 'utf8')).toBe(text);
    // Without a summary.json, --write is refused.
    const bare = run();
    const r = await check([bare, '--labels', handLabels(bare), '--write']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('summary.json is missing; run pnpm cli summary <run> --write first');
  });

  it('cohenKappa: the textbook example, perfect agreement, one category, and no pairs', () => {
    const pairs: Array<[string, string]> = [
      ...Array.from({ length: 20 }, (): [string, string] => ['yes', 'yes']),
      ...Array.from({ length: 5 }, (): [string, string] => ['yes', 'no']),
      ...Array.from({ length: 10 }, (): [string, string] => ['no', 'yes']),
      ...Array.from({ length: 15 }, (): [string, string] => ['no', 'no']),
    ];
    expect(cohenKappa(pairs)).toMatchObject({ n: 50, agree: 35, agreement: 0.7, kappa: 0.4, categories: ['no', 'yes'] });
    expect(cohenKappa([['a', 'a'], ['b', 'b'], ['c', 'c']])).toMatchObject({ n: 3, agree: 3, kappa: 1 });
    // One category on both sides: chance agreement is 1, and kappa is taken as 1 with a note.
    expect(cohenKappa([['model', 'model'], ['model', 'model']])).toMatchObject({ n: 2, agree: 2, agreement: 1, kappa: 1, categories: ['model'], note: 'one category on both sides (model): chance agreement is 1, kappa taken as 1' });
    // Each side one category, different ones: no agreement.
    expect(cohenKappa([['a', 'b'], ['a', 'b']])).toMatchObject({ n: 2, agree: 0, kappa: 0 });
    expect(cohenKappa([])).toMatchObject({ n: 0, agree: 0, agreement: null, kappa: null });
  });

  it('sampleTrials is deterministic in the seed, takes n of the sorted names, and never repeats one', () => {
    const names = failures();
    const a = sampleTrials(names, 10, 7);
    expect(a).toEqual(sampleTrials([...names].reverse(), 10, 7));
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    expect(a).toEqual([...a].sort());
    expect(a).not.toEqual(sampleTrials(names, 10, 8));
    expect(sampleTrials(names, 20, 7)).toEqual([...names].sort());
    expect(sampleTrials(names, 25, 7)).toEqual([...names].sort());
  });

  it('--double-label recomputes both kappas from the stored labels and exits 0 at 20 labels with both at or above 0.6', async () => {
    const dir = run();
    auditorOutputs(dir);
    doubleLabels(dir);
    const r = await check([dir, '--double-label']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('judge-agreement --double-label: double label n=20 agree=20 (1.000) kappa=1.000 (one category on both sides (model): chance agreement is 1, kappa taken as 1); builder vs auditor n=24 agree=23 (0.958) kappa=0.867');
    expect(r.out).toContain('t-beta/15: builder model, auditor environment');
    const j = await check([dir, '--double-label', '--json']);
    expect(JSON.parse(j.out)).toMatchObject({ double_label: { n: 20, agree: 20, kappa: 1, seed: 7 }, builder_vs_auditor: { n: 24, agree: 23 }, violations: [] });
    expect((JSON.parse(j.out) as { builder_vs_auditor: { kappa: number } }).builder_vs_auditor.kappa).toBeCloseTo(0.8667, 3);
  });

  it('--double-label exits 1 when a kappa is below the floor, below 20 double labels, or when the rows are not the seeded sample', async () => {
    const dir = run();
    auditorOutputs(dir);
    // Two double labels say environment against the builder's model: agreement 0.9, chance 0.9, kappa 0.
    doubleLabels(dir, { 't-alpha/12': 'environment', 't-beta/13': 'environment' });
    const low = await check([dir, '--double-label']);
    expect(low.code).toBe(1);
    expect(low.out).toContain('double label n=20 agree=18 (0.900) kappa=0.000');
    expect(low.out).toContain(`violation: double label kappa 0.000 is below ${KAPPA_FLOOR}`);
    expect(low.out).toContain('t-alpha/12: builder model, double label environment');
    // 10 double labels of a seeded sample of 10.
    doubleLabels(dir, {}, { kind: 'sample', seed: 7, n: 10, labeller: 'fixture-verifier' });
    const few = await check([dir, '--double-label']);
    expect(few.code).toBe(1);
    expect(few.out).toContain(`violation: 10 double labels, need ${MIN_DOUBLE_LABELS}`);
    // The rows are the sample of seed 7, and the line records seed 8 (n=10: at n=20 every seed gives all 20).
    const names = sampleTrials(failures(), 20, 7);
    put(join(dir, 'double-labels.jsonl'), [{ kind: 'sample', seed: 8, n: 10, labeller: 'fixture-verifier' }, ...sampleTrials(failures(), 10, 7).map((trial) => ({ trial, label: 'model' }))]);
    const wrong = await check([dir, '--double-label']);
    expect(wrong.code).toBe(1);
    expect(wrong.out).toMatch(/violation: the rows are not the sample of seed 8 \(n=10\) over the run's 20 valid failures: missing .*; extra /);
    // No header: nothing says the seed.
    put(join(dir, 'double-labels.jsonl'), names.map((trial) => ({ trial, label: 'model' })));
    const noSeed = await check([dir, '--double-label']);
    expect(noSeed.code).toBe(1);
    expect(noSeed.out).toContain('violation: double-labels.jsonl has no sample line ({"kind": "sample", "seed": <n>, "n": <n>}) recording the seed');
  });

  it('--double-label without auditor outputs, or without the file, is a violation; a PASS, a trial with no builder row, or a label outside the set is one too', async () => {
    const dir = run();
    doubleLabels(dir);
    const none = await check([dir, '--double-label']);
    expect(none.code).toBe(1);
    expect(none.out).toContain('violation: no auditor verdict under auditor/ for any audited trial; run pnpm cli audit-llm <run> first');
    auditorOutputs(dir);
    const names = sampleTrials(failures(), 20, 7);
    put(join(dir, 'double-labels.jsonl'), [{ kind: 'sample', seed: 7, n: 20 }, ...names.slice(0, 17).map((trial) => ({ trial, label: 'model' })), { trial: 't-alpha/0', label: 'model' }, { trial: names[17], label: 'retrieval' }, { trial: names[18], label: 'model' }, { trial: names[19], label: 'model' }]);
    const bad = await check([dir, '--double-label']);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('violation: t-alpha/0: PASS is not a valid failure');
    expect(bad.out).toContain(`violation: ${names[17]}: label retrieval is not one of ${AUDIT_LABELS.join(', ')}`);
    const missing = await check([tempDir('judge-agreement-nofile'), '--double-label']);
    expect(missing.code).toBe(1);
  });

  it('--double-label --write puts both kappas into summary.json', async () => {
    const dir = run();
    auditorOutputs(dir);
    doubleLabels(dir);
    writeFileSync(join(dir, 'summary.json'), `${JSON.stringify({ schema_version: 10, run_id: 'final-1', tasks: {} }, null, 2)}\n`);
    expect((await check([dir, '--double-label', '--write'])).code).toBe(0);
    const s = readJson(join(dir, 'summary.json'));
    expect(s).toMatchObject({ run_id: 'final-1', kappa: { double_label: { n: 20, kappa: 1, seed: 7 }, builder_vs_auditor: { n: 24 } } });
  });

  it('--double-label --sample --seed prints the seeded sample as a template', async () => {
    const dir = run();
    const r = await check([dir, '--double-label', '--sample', '--seed', '7']);
    expect(r.code).toBe(0);
    const lines = r.out.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
    expect(lines[0]).toMatchObject({ kind: 'sample', seed: 7, n: 20 });
    expect(lines.slice(1).map((l) => l.trial)).toEqual(sampleTrials(failures(), 20, 7));
    expect(lines[1]).toMatchObject({ label: null, note: '' });
    expect(existsSync(join(dir, 'double-labels.jsonl'))).toBe(false);
    expect((await check([dir, '--double-label', '--sample'])).code).toBe(2);
    expect((await check([dir, '--sample', '--seed', '7'])).code).toBe(2);
  });

  it('usage errors exit 2; a run without trials exits 1', async () => {
    expect((await check([])).code).toBe(2);
    expect((await check(['a', 'b'])).code).toBe(2);
    expect((await check([tempDir('judge-agreement-empty')])).code).toBe(1);
    const dir = run();
    const r = await check([dir, '--labels', join(dir, 'none.jsonl')]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('violation: ');
    expect(r.out).toContain('none.jsonl is missing');
  });
});
