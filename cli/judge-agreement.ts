// pnpm cli judge-agreement <run> [--labels <file>] [--json] [--write]
// pnpm cli judge-agreement <run> --double-label [--json] [--write]
// pnpm cli judge-agreement <run> --double-label --sample --seed <n> [--n <count>]
// Agreement of hand labels with the judge (plan phase P23; design section 5, "Calibration": 40
// judge items and 20 extractions hand-labelled with the judge outputs hidden), and, with
// --double-label, Cohen's kappa of the blinded double label and of the builder labels against
// the LLM auditor (planner-15 R14-33), each recomputed from the stored files; nothing is asked
// live and no record is changed.
//   Hand labels: <file> (default results/judge-calibration/hand-labels.jsonl), one row per item:
//     {trial: "<task>/<index>", key: "<judge cache key>", kind: "judge" | "extract",
//      answer: {verdict: met | not_met | unknown} | {value: <number | null>}, note?}
//   A line with kind "sample" is the file's own record (the seed, the labeller) and is not an
//   item. Each item is compared with the answer the record's judge cache (record.judge.cache,
//   packages/grader/judge.ts JudgeCacheEntry) holds under that key: a judge item agrees when the
//   verdicts are equal, an extraction when the values are equal; quotes are not compared, and a
//   cached entry with no answer never agrees. A row the run cannot answer (no such trial, no such
//   key, a cached entry of the other kind or with no answer, a malformed row) is a violation and
//   is not counted, and so is a (trial, key) pair labelled twice: the floors count distinct items. It prints n_judge, n_extract and both agreement rates, each disagreement, and
//   exits 1 below MIN_JUDGE_LABELS judge or MIN_EXTRACT_LABELS extraction items or on a violation.
//   The extraction floor applies only when the run's records cache an extraction (extract_cached,
//   the entries of kind extract over every record): a run whose tasks declare no hybrid item asks
//   none, so there is nothing to label, and the line says "n_extract=0 of 0 cached: no task of
//   this run asks an extraction" (final-1; coordinator ruling on builder-323's msg_d69cdbbb675b).
//   --double-label: <run>/double-labels.jsonl, written by a labeller who saw the trajectories and
//   grades but not the builder labels or the auditor's verdicts:
//     {kind: "sample", seed: <n>, n: <n>, labeller?}       the sample it labels, first
//     {trial: "<task>/<index>", label: model | environment | grader, note?}
//   The rows must be the sample the recorded seed gives (sampleTrials over the run's valid
//   failures in trial order), so the seed is checkable, and every row needs a builder label in
//   audit.jsonl (cli/audit-check.ts rowLabel: the adjudicated label, else the row's own). kappa
//   double label: builder label against double label over those rows; kappa builder vs auditor:
//   the builder label of every audit.jsonl row (pass on a PASS row with no label) against the
//   verdict cli/audit-llm.ts wrote under <run>/auditor/, over the rows that have one. Exit 1 when
//   either kappa is below KAPPA_FLOOR, fewer than MIN_DOUBLE_LABELS rows count, no auditor verdict
//   exists, or on a violation. MIN_DOUBLE_LABELS is set for the complete final run (every planned
//   task's 20 trials after W5-F, so well over 20 valid failures), not for a run of two tasks
//   (coordinator ruling on verifier-phase-P17i-P23CODE-226-1 m2): on a partial run the floor
//   fails by design, and the data PR runs the gate on the complete run. --sample --seed <n> prints the sample as a template (the sample
//   line, then one row per trial with label null) and nothing else.
//   Cohen's kappa (cohenKappa): (po - pe) / (1 - pe), po the observed agreement and pe the chance
//   agreement from each rater's label frequencies. When both raters use one category only, pe is
//   1 and the formula is 0/0: the kappa is taken as 1 (they agree on everything) and the output
//   says so, since such a kappa carries no information about the raters.
//   --json prints the result object on stdout, the lines on stderr. --write puts the result into
//   <run>/summary.json (judge_agreement, or kappa with --double-label; packages/core/summary.ts
//   Summary), only when every check holds, and leaves the rest of the file as it is; run after
//   `pnpm cli summary <run> --write`, which rewrites the file without them.
// Exit 2 on a usage error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BatchRecord } from '../packages/core/batch.ts';
import { installEgressGuard } from '../packages/core/egress.ts';
import { AUDIT_LABELS, PASS_CONFIRMED } from '../packages/core/outcomes.ts';
import { currentGrade, trialName } from '../packages/core/summary.ts';
import type { JudgeCacheEntry } from '../packages/grader/judge.ts';
import { settledRecords } from './adapters/result-sink-node.ts';
import { readLabels, rowLabel } from './audit-check.ts';
import type { AuditorOutput } from './audit-llm.ts';

const USAGE = [
  'usage: pnpm cli judge-agreement <run> [--labels <file>] [--json] [--write]',
  '       pnpm cli judge-agreement <run> --double-label [--json] [--write]',
  '       pnpm cli judge-agreement <run> --double-label --sample --seed <n> [--n <count>]',
].join('\n');
const REPO = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_LABELS = join(REPO, 'results', 'judge-calibration', 'hand-labels.jsonl');
export const MIN_JUDGE_LABELS = 40;
export const MIN_EXTRACT_LABELS = 20;
export const MIN_DOUBLE_LABELS = 20;
export const KAPPA_FLOOR = 0.6;
const VERDICTS = ['met', 'not_met', 'unknown'];

export interface Deps {
  out: (line: string) => void;
  err: (line: string) => void;
}

export interface Kappa {
  n: number;
  agree: number;
  agreement: number | null;
  kappa: number | null;
  categories: string[];
  note?: string;
}

const round6 = (x: number) => Number(x.toFixed(6));

// Cohen's kappa of the pairs [a, b], one per item (header).
export function cohenKappa(pairs: ReadonlyArray<readonly [string, string]>): Kappa {
  const n = pairs.length;
  const categories = [...new Set(pairs.flatMap(([a, b]) => [a, b]))].sort();
  if (n === 0) return { n, agree: 0, agreement: null, kappa: null, categories };
  const agree = pairs.filter(([a, b]) => a === b).length;
  const po = agree / n;
  const count = (side: 0 | 1, c: string) => pairs.filter((p) => p[side] === c).length / n;
  const pe = categories.reduce((s, c) => s + count(0, c) * count(1, c), 0);
  if (pe >= 1) return { n, agree, agreement: round6(po), kappa: 1, categories, note: `one category on both sides (${categories.join(', ')}): chance agreement is 1, kappa taken as 1` };
  return { n, agree, agreement: round6(po), kappa: round6((po - pe) / (1 - pe)), categories };
}

// mulberry32: a small seeded generator, so a sample is the same on every machine.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n of the names, chosen by the seed (a Fisher-Yates shuffle of the sorted distinct names), in
// sorted order; every name when n is not below their count.
export function sampleTrials(names: readonly string[], n: number, seed: number): string[] {
  const pool = [...new Set(names)].sort();
  const next = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(0, n)).sort();
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const rate = (agree: number, n: number): string => (n === 0 ? 'n/a' : (agree / n).toFixed(3));
const fmt = (k: Kappa): string => `n=${k.n} agree=${k.agree} (${k.agreement === null ? 'n/a' : k.agreement.toFixed(3)}) kappa=${k.kappa === null ? 'n/a' : k.kappa.toFixed(3)}${k.note ? ` (${k.note})` : ''}`;

// Each line of a JSONL file as an object, with its 1-based line number; a line that is not an
// object is a violation.
function readJsonl(file: string, violations: string[]): Array<{ line: number; row: Record<string, unknown> }> {
  return readFileSync(file, 'utf8').split('\n').flatMap((raw, i) => {
    if (raw.trim() === '') return [];
    try {
      const v: unknown = JSON.parse(raw);
      if (!isObj(v)) throw new Error('not an object');
      return [{ line: i + 1, row: v }];
    } catch (e) {
      violations.push(`${basename(file)} line ${i + 1}: ${(e as Error).message}`);
      return [];
    }
  });
}

interface HandLabel {
  trial: string;
  key: string;
  kind: 'judge' | 'extract';
  answer: Record<string, unknown>;
}

const canonical = (v: unknown): string => JSON.stringify(v) ?? 'null';

export interface Agreement {
  n_judge: number;
  judge_agree: number;
  judge_agreement: number | null;
  n_extract: number;
  extract_agree: number;
  extract_agreement: number | null;
  // The extraction entries the run's records cache; 0 means no task of the run asks one.
  extract_cached: number;
  labels: string;
  disagreements: Array<{ trial: string; key: string; kind: 'judge' | 'extract'; hand: unknown; cached: unknown }>;
  violations: string[];
}

// The hand labels of `file` against the records' judge caches (header).
export function agreement(records: ReadonlyMap<string, BatchRecord>, file: string): Agreement {
  const violations: string[] = [];
  const extractCached = [...records.values()].reduce((n, r) => n + ((r as { judge?: { cache?: JudgeCacheEntry[] } }).judge?.cache ?? []).filter((e) => e.kind === 'extract').length, 0);
  const out: Agreement = { n_judge: 0, judge_agree: 0, judge_agreement: null, n_extract: 0, extract_agree: 0, extract_agreement: null, extract_cached: extractCached, labels: file, disagreements: [], violations };
  if (!existsSync(file)) violations.push(`${file} is missing`);
  const rows = existsSync(file) ? readJsonl(file, violations) : [];
  const seen = new Set<string>();
  for (const { line, row } of rows) {
    if (row.kind === 'sample') continue;
    const where = `${basename(file)} line ${line}`;
    if (typeof row.trial !== 'string' || typeof row.key !== 'string' || (row.kind !== 'judge' && row.kind !== 'extract') || !isObj(row.answer)) {
      violations.push(`${where}: an item needs trial, key, kind judge or extract, and an answer object`);
      continue;
    }
    const l = row as unknown as HandLabel;
    if (l.kind === 'judge' && !VERDICTS.includes(l.answer.verdict as string)) {
      violations.push(`${where}: a judge answer needs verdict ${VERDICTS.slice(0, -1).join(', ')} or ${VERDICTS.at(-1)}`);
      continue;
    }
    if (l.kind === 'extract' && !Object.hasOwn(l.answer, 'value')) {
      violations.push(`${where}: an extraction answer needs value`);
      continue;
    }
    if (seen.has(`${l.trial}\n${l.key}`)) {
      violations.push(`${l.trial} ${l.key}: labelled twice`);
      continue;
    }
    seen.add(`${l.trial}\n${l.key}`);
    const r = records.get(l.trial);
    if (r === undefined) {
      violations.push(`${l.trial}: the run has no such trial`);
      continue;
    }
    const cache: readonly JudgeCacheEntry[] = (r as { judge?: { cache?: JudgeCacheEntry[] } }).judge?.cache ?? [];
    const entry = cache.find((e) => e.key === l.key);
    if (entry === undefined) {
      violations.push(`${l.trial} ${l.key}: the record cached no ${l.kind} answer under that key`);
      continue;
    }
    const what = l.kind === 'extract' ? 'extraction' : 'judge answer';
    if (entry.kind !== l.kind) {
      violations.push(`${l.trial} ${l.key}: the record cached a${entry.kind === 'extract' ? 'n extraction' : ' judge answer'} under that key, not a ${what}`);
      continue;
    }
    if (entry.answer === null) {
      violations.push(`${l.trial} ${l.key}: the cached ${what} has no answer (${entry.error ?? 'no error recorded'})`);
      continue;
    }
    const hand = l.kind === 'judge' ? l.answer.verdict : l.answer.value;
    const cached = l.kind === 'judge' ? entry.answer.verdict : entry.answer.value;
    const agree = canonical(hand) === canonical(cached);
    if (l.kind === 'judge') {
      out.n_judge++;
      if (agree) out.judge_agree++;
    } else {
      out.n_extract++;
      if (agree) out.extract_agree++;
    }
    if (!agree) out.disagreements.push({ trial: l.trial, key: l.key, kind: l.kind, hand, cached });
  }
  out.judge_agreement = out.n_judge === 0 ? null : round6(out.judge_agree / out.n_judge);
  out.extract_agreement = out.n_extract === 0 ? null : round6(out.extract_agree / out.n_extract);
  if (out.n_judge < MIN_JUDGE_LABELS) violations.push(`${out.n_judge} judge labels, need ${MIN_JUDGE_LABELS}`);
  if (out.extract_cached > 0 && out.n_extract < MIN_EXTRACT_LABELS) violations.push(`${out.n_extract} extraction labels, need ${MIN_EXTRACT_LABELS}`);
  return out;
}

export interface DoubleLabel {
  double_label: Kappa & { seed: number | null; sample_n: number | null };
  builder_vs_auditor: Kappa;
  disagreements: { double_label: Array<{ trial: string; builder: string; double: string }>; builder_vs_auditor: Array<{ trial: string; builder: string; auditor: string }> };
  violations: string[];
}

// The builder label of each audit.jsonl row that gives one (header), keyed by trial.
function builderLabels(dir: string, records: ReadonlyMap<string, BatchRecord>, violations: string[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const { label } of readLabels(dir, violations) ?? []) {
    if (label === null) continue;
    const r = records.get(label.trial);
    const outcome = r === undefined ? label.outcome : currentGrade(r).outcome;
    const said = rowLabel(label) ?? (outcome === 'PASS' ? PASS_CONFIRMED : null);
    if (said !== null) labels.set(label.trial, said);
  }
  return labels;
}

// The two kappas of the run (header).
export function doubleLabel(dir: string, records: ReadonlyMap<string, BatchRecord>): DoubleLabel {
  const violations: string[] = [];
  const builder = builderLabels(dir, records, violations);
  const failures = [...records.values()].filter((r) => currentGrade(r).valid && currentGrade(r).outcome !== 'PASS').map(trialName).sort();
  const file = join(dir, 'double-labels.jsonl');
  const pairs: Array<[string, string]> = [];
  const disagreements: DoubleLabel['disagreements'] = { double_label: [], builder_vs_auditor: [] };
  let seed: number | null = null;
  let sampleN: number | null = null;
  if (!existsSync(file)) violations.push('double-labels.jsonl is missing');
  else {
    const rows = readJsonl(file, violations);
    const samples = rows.filter(({ row }) => row.kind === 'sample');
    if (samples.length === 0) violations.push('double-labels.jsonl has no sample line ({"kind": "sample", "seed": <n>, "n": <n>}) recording the seed');
    else if (samples.length > 1) violations.push('double-labels.jsonl has more than one sample line');
    const s = samples[0]?.row;
    if (s !== undefined && (!Number.isSafeInteger(s.seed) || !Number.isSafeInteger(s.n) || (s.n as number) < 1)) violations.push('the sample line needs a whole-number seed and n');
    else if (s !== undefined) {
      seed = s.seed as number;
      sampleN = s.n as number;
    }
    const seen = new Set<string>();
    const named: string[] = [];
    for (const { line, row } of rows) {
      if (row.kind === 'sample') continue;
      if (typeof row.trial !== 'string' || typeof row.label !== 'string') {
        violations.push(`double-labels.jsonl line ${line}: a row needs trial and label`);
        continue;
      }
      named.push(row.trial);
      if (seen.has(row.trial)) {
        violations.push(`${row.trial}: labelled twice`);
        continue;
      }
      seen.add(row.trial);
      const r = records.get(row.trial);
      if (r === undefined) {
        violations.push(`${row.trial}: the run has no such trial`);
        continue;
      }
      if (!failures.includes(row.trial)) {
        violations.push(`${row.trial}: ${currentGrade(r).outcome} is not a valid failure`);
        continue;
      }
      if (!(AUDIT_LABELS as readonly string[]).includes(row.label)) {
        violations.push(`${row.trial}: label ${row.label} is not one of ${AUDIT_LABELS.join(', ')}`);
        continue;
      }
      const b = builder.get(row.trial);
      if (b === undefined) {
        violations.push(`${row.trial}: no builder label in audit.jsonl`);
        continue;
      }
      pairs.push([b, row.label]);
      if (b !== row.label) disagreements.double_label.push({ trial: row.trial, builder: b, double: row.label });
    }
    if (seed !== null && sampleN !== null) {
      const want = sampleTrials(failures, sampleN, seed);
      const have = [...new Set(named)].sort();
      if (want.join('\n') !== have.join('\n')) {
        const missing = want.filter((t) => !have.includes(t));
        const extra = have.filter((t) => !want.includes(t));
        violations.push(`the rows are not the sample of seed ${seed} (n=${sampleN}) over the run's ${failures.length} valid failures: ${[missing.length > 0 ? `missing ${missing.join(', ')}` : '', extra.length > 0 ? `extra ${extra.join(', ')}` : ''].filter((s) => s !== '').join('; ')}`);
      }
    }
  }
  const double = cohenKappa(pairs);
  if (double.n < MIN_DOUBLE_LABELS) violations.push(`${double.n} double labels, need ${MIN_DOUBLE_LABELS} (the floor is set for the complete final run, every planned task's trials; a run of fewer tasks cannot meet it)`);
  if (double.kappa !== null && double.kappa < KAPPA_FLOOR) violations.push(`double label kappa ${double.kappa.toFixed(3)} is below ${KAPPA_FLOOR}`);
  // The builder labels against the auditor's verdicts, over every audited trial with both.
  const auditorPairs: Array<[string, string]> = [];
  for (const [trial, b] of [...builder].sort(([x], [y]) => (x < y ? -1 : 1))) {
    const r = records.get(trial);
    if (r === undefined) continue;
    const file = join(dir, 'auditor', r.task_id, `${r.index}.json`);
    if (!existsSync(file)) continue;
    let a: AuditorOutput;
    try {
      a = JSON.parse(readFileSync(file, 'utf8')) as AuditorOutput;
    } catch (e) {
      violations.push(`${file}: ${(e as Error).message}`);
      continue;
    }
    if (a.verdict === null || a.verdict === undefined || typeof a.verdict.label !== 'string') continue;
    auditorPairs.push([b, a.verdict.label]);
    if (b !== a.verdict.label) disagreements.builder_vs_auditor.push({ trial, builder: b, auditor: a.verdict.label });
  }
  const auditor = cohenKappa(auditorPairs);
  if (auditor.n === 0) violations.push('no auditor verdict under auditor/ for any audited trial; run pnpm cli audit-llm <run> first');
  if (auditor.kappa !== null && auditor.kappa < KAPPA_FLOOR) violations.push(`builder vs auditor kappa ${auditor.kappa.toFixed(3)} is below ${KAPPA_FLOOR}`);
  return { double_label: { ...double, seed, sample_n: sampleN }, builder_vs_auditor: auditor, disagreements, violations };
}

// Puts `fields` into <run>/summary.json, which must exist; false when it does not.
function writeSummary(dir: string, fields: Record<string, unknown>, violations: string[]): void {
  const file = join(dir, 'summary.json');
  if (!existsSync(file)) {
    violations.push('summary.json is missing; run pnpm cli summary <run> --write first');
    return;
  }
  const s = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const text = `${JSON.stringify({ ...s, ...fields }, null, 2)}\n`;
  if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
}

export async function main(args: string[], deps: Deps): Promise<number> {
  let dir: string | undefined;
  let labels = DEFAULT_LABELS;
  let json = false;
  let write = false;
  let double = false;
  let sample = false;
  let seed: number | undefined;
  let n = MIN_DOUBLE_LABELS;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--json') json = true;
    else if (a === '--write') write = true;
    else if (a === '--double-label') double = true;
    else if (a === '--sample') sample = true;
    else if (a === '--labels' && args[i + 1] !== undefined) labels = args[++i]!;
    else if ((a === '--seed' || a === '--n') && args[i + 1] !== undefined) {
      const v = Number(args[++i]);
      if (!Number.isSafeInteger(v) || v < 0 || (a === '--n' && v < 1)) return usage(deps, `${a} needs a whole number`);
      if (a === '--seed') seed = v;
      else n = v;
    } else if (a.startsWith('--')) return usage(deps, a === '--labels' || a === '--seed' || a === '--n' ? `${a} needs a value` : `unknown argument ${a}`);
    else if (dir !== undefined) return usage(deps, 'one run directory');
    else dir = a;
  }
  if (dir === undefined) return usage(deps, 'a run directory is required');
  if ((sample || seed !== undefined) && !double) return usage(deps, '--sample and --seed go with --double-label');
  if (sample && seed === undefined) return usage(deps, '--sample needs --seed <n>');
  if (seed !== undefined && !sample) return usage(deps, '--seed goes with --sample');
  if (sample && (json || write)) return usage(deps, '--sample prints a template; --json and --write do not apply');
  if (double && labels !== DEFAULT_LABELS) return usage(deps, '--labels does not apply with --double-label');
  if (!existsSync(join(dir, 'trials'))) {
    deps.err(`judge-agreement: ${dir} has no trials/ directory`);
    return 1;
  }
  const records = new Map(settledRecords(dir).map((s) => [trialName(s.record), s.record]));
  const say = json ? deps.err : deps.out;
  if (sample) {
    const failures = [...records.values()].filter((r) => currentGrade(r).valid && currentGrade(r).outcome !== 'PASS').map(trialName);
    deps.out(JSON.stringify({ kind: 'sample', seed, n, labeller: '' }));
    for (const trial of sampleTrials(failures, n, seed!)) deps.out(JSON.stringify({ trial, label: null, note: '' }));
    return 0;
  }
  if (double) {
    const d = doubleLabel(dir, records);
    if (write && d.violations.length === 0) writeSummary(dir, { kappa: { double_label: d.double_label, builder_vs_auditor: d.builder_vs_auditor } }, d.violations);
    else if (write) say('summary.json not written: a check does not hold');
    for (const x of d.disagreements.double_label) say(`  - ${x.trial}: builder ${x.builder}, double label ${x.double}`);
    for (const x of d.disagreements.builder_vs_auditor) say(`  - ${x.trial}: builder ${x.builder}, auditor ${x.auditor}`);
    for (const v of d.violations) say(`violation: ${v}`);
    say(`judge-agreement --double-label: double label ${fmt(d.double_label)}; builder vs auditor ${fmt(d.builder_vs_auditor)}`);
    if (json) deps.out(JSON.stringify(d));
    return d.violations.length === 0 ? 0 : 1;
  }
  const a = agreement(records, labels);
  if (write && a.violations.length === 0) {
    const { disagreements: _d, violations: _v, ...fields } = a;
    writeSummary(dir, { judge_agreement: fields }, a.violations);
  } else if (write) say('summary.json not written: a check does not hold');
  // A judge verdict reads bare, an extraction value as JSON.
  const shown = (kind: 'judge' | 'extract', v: unknown) => (kind === 'judge' && typeof v === 'string' ? v : canonical(v));
  for (const x of a.disagreements) say(`  - ${x.trial} ${x.key} ${x.kind}: hand ${shown(x.kind, x.hand)}, cached ${shown(x.kind, x.cached)}`);
  for (const v of a.violations) say(`violation: ${v}`);
  const extract = a.extract_cached === 0 ? 'n_extract=0 of 0 cached: no task of this run asks an extraction' : `n_extract=${a.n_extract} agree=${a.extract_agree} (${rate(a.extract_agree, a.n_extract)})`;
  say(`judge-agreement: n_judge=${a.n_judge} agree=${a.judge_agree} (${rate(a.judge_agree, a.n_judge)}), ${extract}; labels ${labels}`);
  if (json) deps.out(JSON.stringify(a));
  return a.violations.length === 0 ? 0 : 1;
}

function usage(deps: Deps, problem: string): number {
  deps.err(`judge-agreement: ${problem}\n${USAGE}`);
  return 2;
}

const defaults: Deps = { out: (l) => process.stdout.write(`${l}\n`), err: (l) => process.stderr.write(`${l}\n`) };

export default (args: string[]) => {
  installEgressGuard(globalThis);
  return main(args, defaults);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installEgressGuard(globalThis);
  process.exitCode = await main(process.argv.slice(2), defaults);
}
