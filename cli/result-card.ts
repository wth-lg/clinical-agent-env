// pnpm cli result-card <run> [--classes <file>] [--history <run>[,<run>...]] [--out <file>]
// The result card (plan-amendment-w4 PW4-F, F-1), the same for a task in the band and one outside
// it. Markdown on stdout, or into --out (the route writes results/result-card.md); sections:
//   Tasks              per task k/n over its valid trials, Wilson 95%, the verdict in words
//                      (packages/core/summary.ts bandVerdict, the one definition; summary.json's
//                      band_verdict), pass@1 and pass^3, pass^5 beside it (summary.ts passK)
//   Failures by fault  the valid failures split model / environment / grader: from the audit labels
//                      (<run>/audit.jsonl, summary.ts faultCounts) when the run has them, else from
//                      the classes JSON's split, else "not given"; infra re-runs beside them
//   Grader faults      GRADER_ERROR now and in an earlier grade, and every record a later grader
//   found and fixed    regraded to another outcome (cli regrade), with both graders
//   Per class and      from --classes, a saved `pnpm cli classes <run dirs> --json` (PW4-H0b; the
//   per event          JSON is cli/classes.ts ClassesJson, checked by its classesJsonProblems):
//                      q, guard fires, each class's fails
//                      by instance and over its observations with the pass rate's Wilson 95%
//                      (computed here from the counts with summary.ts wilson) and failure labels,
//                      and each event's. Without --classes it says "Not given".
//   Difficulty history k/n and verdict per task over the --history runs, oldest first, then this run
//   No failures        for each task with valid trials and no failure, "No failures in N trials"
//                      and the strictness evidence: <run>/matrix.json's entry at the task's
//                      grader_task_version (the oracle passes, each mutant fails as declared, each
//                      alternative passes, the null agent fails), else the command that shows it
// Each run's summary is <run>/summary.json when the run holds one (validated), else computed from
// its records exactly as `pnpm cli summary <run> --json` computes it; the card says which.
// Exit 0 when the card is written; 1 on a missing run or an unreadable summary or classes file;
// 2 on a usage error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installEgressGuard } from '../packages/core/egress.ts';
import { FINAL_PASS_BAND } from '../packages/core/cost.ts';
import { assertSummary, currentGrade, trialName, wilson, type Interval, type RegradeGrade, type Summary } from '../packages/core/summary.ts';
import { settledRecords } from './adapters/result-sink-node.ts';
import { classesJsonProblems, type ClassesJson, type Label } from './classes.ts';
import { main as summaryMain } from './summary.ts';

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };
const USAGE = 'usage: pnpm cli result-card <run> [--classes <cli classes --json output>] [--history <run>[,<run>...]] [--out <file>]';

// The classes JSON is cli/classes.ts's ClassesJson (schema_version 1), checked with its
// classesJsonProblems; the card reads trials_valid, split, guard_fires, q, classes (class, fails,
// observations, labels, instances: instance and its display label) and events (id, item, class, active, fired, fails, observations,
// labels), and computes each Wilson interval from the counts.
export function readClasses(x: unknown): ClassesJson {
  const problems = classesJsonProblems(x);
  if (problems.length > 0) throw new TypeError(`classes: ${problems.join('; ')}`);
  return x as ClassesJson;
}

// A run's summary and where it came from (header).
async function summaryOf(dir: string): Promise<{ summary: Summary; source: string }> {
  const file = join(dir, 'summary.json');
  if (existsSync(file)) {
    const s: unknown = JSON.parse(readFileSync(file, 'utf8'));
    assertSummary(s);
    return { summary: s, source: `${file}` };
  }
  const out: string[] = [];
  const err: string[] = [];
  await summaryMain([dir, '--json'], { out: (l) => out.push(l), err: (l) => err.push(l) });
  if (out.length === 0) throw new Error(err.join('\n') || `${dir}: no summary`);
  const s: unknown = JSON.parse(out.join('\n'));
  assertSummary(s);
  return { summary: s, source: 'summary computed from the records (no summary.json; as `pnpm cli summary <run> --json`)' };
}

const two = (x: number) => x.toFixed(2);
// A chance above 0 never reads 0.00.
const chance = (x: number | null) => (x === null ? 'n/a' : x > 0 && x < 0.005 ? '<0.01' : two(x));
const interval = (w: Interval | null) => (w === null ? 'n/a' : `[${two(w.lo)}, ${two(w.hi)}]`);
const table = (head: string[], rows: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
const labelText = (ls: readonly Label[]) => ls.map((l) => `#${l.trial}: ${l.gate} -> ${l.label}`).join('; ');
// The pass rate and its Wilson 95% interval of fails out of observations.
const passOf = (fails: number, observations: number) => ({ rate: observations === 0 ? 'n/a' : two((observations - fails) / observations), w: interval(wilson(observations - fails, observations)) });

interface MatrixProbe { kind: string; id: string; outcome: string; as_expected: boolean }
// The strictness evidence of a task with no failures (header).
function strictness(dir: string, task: string, gtvs: readonly string[]): string {
  const file = join(dir, 'matrix.json');
  const command = `\`pnpm cli matrix --task ${task}\` (the reference solution passes and every probe gives the verdict expected; the Tasks view runs the same probes)`;
  if (!existsSync(file)) return `The run has no matrix.json; the evidence is ${command}.`;
  const m = JSON.parse(readFileSync(file, 'utf8')) as { grader_task_versions?: Record<string, { task_id: string; probes: MatrixProbe[] }> };
  const gtv = gtvs.find((g) => m.grader_task_versions?.[g]?.task_id === task);
  if (gtv === undefined) return `matrix.json has no entry at this task's grader_task_version (${gtvs.join(', ') || 'none recorded'}); the evidence is ${command}.`;
  const probes = m.grader_task_versions![gtv]!.probes;
  const of = (kind: string) => probes.filter((p) => p.kind === kind);
  const ok = (kind: string) => of(kind).filter((p) => p.as_expected).length;
  const oracle = of('oracle');
  const parts = [
    oracle.length > 0 && oracle.every((p) => p.as_expected) ? 'the oracle passes' : 'the oracle does not pass',
    `${ok('mutant')} of ${of('mutant').length} mutants fail as declared`,
    `${ok('alternative')} of ${of('alternative').length} alternatives pass`,
    ...(of('null').length > 0 ? [of('null').every((p) => p.as_expected) ? 'the null agent fails' : 'the null agent does not fail'] : []),
  ];
  return `Strictness evidence, matrix.json at grader_task_version ${gtv}: ${parts.join(', ')}.`;
}

// Records whose current grade (a later grader's regrade) differs from the recorded outcome.
function graderFixes(dir: string): string[] {
  return settledRecords(dir).flatMap(({ record }) => {
    const r = record as typeof record & { regrades?: Array<RegradeGrade & { grader_version?: string }>; grader_version?: string };
    const g = currentGrade(r);
    if (!g.regraded || g.outcome === r.outcome) return [];
    return [`${trialName(r)}: ${r.outcome} at grader ${r.grader_version ?? 'unknown'}, ${g.outcome} at grader ${r.regrades!.at(-1)!.grader_version ?? 'unknown'}`];
  }).sort();
}

export function card(input: { dir: string; summary: Summary; source: string; classes: ClassesJson | null; classesFile: string | null; history: Array<{ summary: Summary }> }): string {
  const { dir, summary: s, classes } = input;
  const tasks = Object.entries(s.tasks);
  const lines: string[] = [`# Result card: ${s.run_id}`, ''];
  const trials = tasks.reduce((a, [, t]) => a + t.trials, 0);
  lines.push(`Model ${s.model ?? '(the records differ or none is recorded)'}, effort ${s.effort ?? '(the records differ or none is recorded)'}. ${trials} valid trials over ${tasks.length} tasks.`);
  lines.push(`Summary: ${input.source}. Classes: ${input.classesFile ?? 'not given'}.`);
  lines.push(`Target band ${FINAL_PASS_BAND[0] * 100}% to ${FINAL_PASS_BAND[1] * 100}%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".`, '');

  lines.push('## Tasks', '');
  lines.push(...table(['task', 'k/n', 'Wilson 95%', 'verdict', 'pass@1', 'pass^3', 'pass^5', 'ENV_ERROR raw', 'ENV_LIMIT', 'GRADER_ERROR (earlier)'], tasks.map(([id, t]) => [
    id, `${t.passes}/${t.trials}`, interval(t.wilson95), t.band_verdict ?? 'no valid trials', chance(t.pass_k[1]), chance(t.pass_k[3]), chance(t.pass_k[5]), String(t.env_error_raw), String(t.env_limit), `${t.grader_error} (${t.grader_error_history})`,
  ])), '');

  lines.push('## Failures by fault', '');
  lines.push(...table(['task', 'failures', 'model', 'environment', 'grader', 'infra re-runs', 'source'], tasks.map(([id, t]) => {
    const f = t.fault_counts;
    const c = classes?.tasks[id];
    if (f.label !== null) return [id, String(f.failures), String(f.label.model), String(f.label.environment), String(f.label.grader), String(f.infra_reruns), `audit.jsonl${f.label.unlabelled > 0 ? ` (${f.label.unlabelled} unlabelled)` : ''}`];
    if (c !== undefined) return [id, String(f.failures), String(c.split.model), String(c.split.environment), String(c.split.grader), String(f.infra_reruns), 'cli classes'];
    return [id, String(f.failures), 'not given', 'not given', 'not given', String(f.infra_reruns), `no audit.jsonl, no classes entry`];
  })), '');

  lines.push('## Grader faults found and fixed', '');
  const fixes = graderFixes(dir);
  const errors = tasks.reduce((a, [, t]) => a + t.grader_error, 0);
  const history = tasks.reduce((a, [, t]) => a + t.grader_error_history, 0);
  lines.push(`GRADER_ERROR at the current grade: ${errors}; in an earlier grade: ${history}. Records a later grader regraded to another outcome: ${fixes.length === 0 ? 'none' : fixes.length}.`);
  for (const f of fixes) lines.push(`- ${f}`);
  lines.push('');

  lines.push('## Per class and per event', '');
  if (classes === null) lines.push('Not given: pass --classes <file>, the saved output of `pnpm cli classes <run dirs> --json`.', '');
  else {
    for (const [id] of tasks) {
      lines.push(`### ${id}`, '');
      const c = classes.tasks[id];
      if (c === undefined) {
        lines.push('Not in the classes JSON.', '');
        continue;
      }
      lines.push(`${c.trials_valid} valid trials. q (trials that saw every arrival): ${c.q === null ? 'no events' : `${c.q.seen_all}/${c.q.trials}`}. finish guard fires: ${c.guard_fires}.`, '');
      const rows: string[][] = [];
      for (const k of c.classes) {
        const p = passOf(k.fails, k.observations);
        k.instances.forEach((n, i) => rows.push(i === 0
          ? [k.class, `${n.instance} (${n.label})`, `${n.fails}/${n.observations}`, `${k.fails}/${k.observations}`, p.rate, p.w, labelText(k.labels)]
          : ['', `${n.instance} (${n.label})`, `${n.fails}/${n.observations}`, '', '', '', '']));
        if (k.instances.length === 0) rows.push([k.class, '', '', `${k.fails}/${k.observations}`, p.rate, p.w, labelText(k.labels)]);
      }
      lines.push(...table(['class', 'instance (item)', 'fails', 'class fails / observations', 'pass rate', 'Wilson 95%', 'failure labels (trial: gate -> label)'], rows), '');
      if (c.events.length === 0) lines.push('No events.', '');
      else {
        lines.push(...table(['event', 'item', 'class', 'active', 'fired', 'fails / observations', 'pass rate', 'Wilson 95%', 'failure labels'], c.events.map((e) => {
          const p = passOf(e.fails, e.observations);
          return [e.id, e.item ?? '', e.class ?? '', e.active ? 'yes' : 'no', String(e.fired), `${e.fails}/${e.observations}`, p.rate, p.w, labelText(e.labels)];
        })), '');
      }
    }
  }

  lines.push('## Difficulty history', '');
  const runs = [...input.history.map((h) => h.summary), s];
  const ids = [...new Set(runs.flatMap((r) => Object.keys(r.tasks)))].sort();
  lines.push(...table(['task', ...runs.map((r) => r.run_id)], ids.map((id) => [id, ...runs.map((r) => {
    const t = r.tasks[id];
    return t === undefined || t.trials === 0 ? 'none' : `${t.passes}/${t.trials} ${t.band_verdict}`;
  })])), '');

  lines.push('## No failures', '');
  const clean = tasks.filter(([, t]) => t.trials > 0 && t.passes === t.trials);
  if (clean.length === 0) lines.push('Every task has at least one failure.');
  for (const [id, t] of clean) lines.push(`- ${id}: No failures in ${t.trials} trials. ${strictness(dir, id, t.grader_task_versions)}`);
  lines.push('');
  return lines.join('\n');
}

export async function main(args: string[], deps: Deps = defaults): Promise<number> {
  let dir: string | undefined;
  let classesFile: string | null = null;
  let out: string | null = null;
  const history: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === '--classes' && args[i + 1] !== undefined) classesFile = args[++i] as string;
    else if (a === '--out' && args[i + 1] !== undefined) out = args[++i] as string;
    else if (a === '--history' && args[i + 1] !== undefined) history.push(...(args[++i] as string).split(',').filter((d) => d !== ''));
    else if (!a.startsWith('--') && dir === undefined) dir = a;
    else {
      deps.err(`result-card: unexpected argument ${a}\n${USAGE}`);
      return 2;
    }
  }
  if (dir === undefined) {
    deps.err(`result-card: a run directory is required\n${USAGE}`);
    return 2;
  }
  for (const d of [dir, ...history]) {
    if (!existsSync(join(d, 'trials'))) {
      deps.err(`result-card: ${d} has no trials/ directory`);
      return 1;
    }
  }
  try {
    const classes = classesFile === null ? null : readClasses(JSON.parse(readFileSync(classesFile, 'utf8')));
    const { summary, source } = await summaryOf(dir);
    const past = await Promise.all(history.map(summaryOf));
    const text = card({ dir, summary, source, classes, classesFile, history: past });
    if (out === null) deps.out(text);
    else {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${text}\n`);
      deps.err(`result-card: wrote ${out} (${basename(dir)})`);
    }
    return 0;
  } catch (e) {
    deps.err(`result-card: ${(e as Error).message}`);
    return 1;
  }
}

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2));
}
