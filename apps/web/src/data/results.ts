// The committed results the browse views read (plan phase P14). The build copies them into
// dist/data/ (apps/web/build/copy-data.ts) and lists them in data/index.json; the local runner
// serves dist/data at the same paths, so every fetch here is relative to the Vite base and the
// same build works on Pages and under the runner.
//
// Two kinds of run: the official run, which data/official.json names ({"run": "runs/<id>"},
// relative to results/) and whose summary.json (validated against packages/core/summary.ts)
// gives the headline numbers; and the pilot runs (results/pilot-<n>/, results/runs/pilot-<n>/),
// never counted in the results, which Runs lists so a build with no official run still shows
// trials. From each run: each trials/**/*.json record, checked by records.ts (a bad one becomes
// an error row, never a blank view), audit.jsonl line by line and, lazily, each trajectory.
// docs/findings.md is the write-up.
//
// Every trial's explanation (outcome, label, decisive check, reason) is packages/core/explain.ts
// explainTrial over its record and audit row, with the context packages/core/explain-context.ts
// builds from the run's files, the one builder cli/audit-check.ts uses too: the run's
// manifest.json (none: M3 is pending, never compared with today's world), its matrix.json (M4,
// GR4 and B1, so a row's fault and label are the detail's) and the task's check text
// (tasks/<id>.check-text.ts). explainTrial reads the trajectory only for a REFUSAL's or LIMIT's
// sentence and for E6, which reads the step an audit answering tool_rejections_correct no cites, so
// only those trajectories are fetched up front (readsEvents): without it the list would say model
// where the trial detail says env. The trial detail asks for
// fullExplanation, which adds what the M1-M5 criteria need and the list cannot afford for every
// row: the trajectory, the task's checks (decisive ids for a regraded trial's exposure, traces_to)
// and the world when M1 reads it, so its criteria equal audit-check's.
//
// A run's grading: the grader versions its records were graded at, whether they started from
// another world than today's manifest, and, when the run holds regrade/ (an offline regrade of
// its records with a later grader), how many keep their outcome.
import { explainContext, needsWorld, worldLookup } from '../../../../packages/core/explain-context.ts';
import { auditAnswerOf, explainTrial, type AuditRow, type CheckText, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import { trialName, validateSummary, wilson, type Interval, type Summary } from '../../../../packages/core/summary.ts';
import { parseTrajectory } from '../../../../packages/core/trajectory.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { useEffect, useState } from 'react';
import { readAudit, validateRecord } from './records.ts';
import { MANIFEST } from './world.ts';

export const dataUrl = (rel: string): string => `${import.meta.env.BASE_URL}data/${rel}`;

const CHECK_TEXT = import.meta.glob<CheckText>('../../../../tasks/*.check-text.ts', { import: 'checkText', eager: true });
// A task's check text, or null when it has none (a test task).
export const checkTextOf = (task: string): CheckText | null => CHECK_TEXT[`../../../../tasks/${task}.check-text.ts`] ?? null;

export type TrialRecord = ExplainRecord & { task_id: string; index?: number; trajectory?: string; env_version?: string | null; grader_version?: string | null; cost_usd: number; judge_cost_usd?: number | null; score?: number | null };

export interface Trial {
  name: string;
  // The record's file under data/.
  file: string;
  task: string;
  record: TrialRecord;
  audit: AuditRow | null;
  trajectoryUrl: string | null;
  explanation: Explanation;
}

// A record file the views cannot read, with why.
export interface BadRecord {
  name: string;
  file: string;
  errors: string[];
}

export interface Grading {
  // The grader versions the records were graded at, sorted.
  graders: string[];
  // Records whose initial state hash is not today's manifest's.
  olderWorld: number;
  // The run's offline regrade, when it holds one: its grader version and the records whose
  // outcome it changes.
  regrade: { graders: string[]; records: number; changed: string[] } | null;
}

export interface RunData {
  runId: string;
  // The run's directory under data/, e.g. results/pilot-0.
  dir: string;
  official: boolean;
  // The run's parsed manifest.json, or null when it has none.
  manifest: unknown;
  grading: Grading;
  // The official run's summary.json; null for a pilot run.
  summary: Summary | null;
  trials: Trial[];
  bad: BadRecord[];
  // Problems that do not stop the views: unreadable audit lines, records that disagree with summary.json.
  warnings: string[];
}

export type Results =
  | { kind: 'error'; message: string }
  | { kind: 'ready'; official: RunData | null; officialError: string | null; pilots: RunData[]; findings: string | null; files: ReadonlySet<string> };

async function fetchText(rel: string): Promise<string> {
  const res = await fetch(dataUrl(rel));
  if (!res.ok) throw new Error(`data/${rel}: HTTP ${res.status}`);
  return res.text();
}
const fetchJson = async <T>(rel: string): Promise<T> => JSON.parse(await fetchText(rel)) as T;

export async function fetchEvents(trajectoryUrl: string): Promise<TrialEvent[]> {
  const res = await fetch(trajectoryUrl);
  if (!res.ok) throw new Error(`${trajectoryUrl}: HTTP ${res.status}`);
  return parseTrajectory(await res.text());
}

// The records whose explanation reads the trajectory: a REFUSAL's or LIMIT's sentence, and E6 when
// the audit row answers tool_rejections_correct no after adjudication.
export const readsEvents = (r: Pick<ExplainRecord, 'outcome'>, audit: Parameters<typeof auditAnswerOf>[0] | null): boolean =>
  r.outcome === 'REFUSAL' || r.outcome === 'LIMIT' || (audit !== null && auditAnswerOf(audit, 'tool_rejections_correct') === 'no');

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadRun(files: readonly string[], has: ReadonlySet<string>, runDir: string, summary: Summary | null): Promise<RunData> {
  const warnings: string[] = [];
  const audits: AuditRow[] = [];
  if (has.has(`${runDir}/audit.jsonl`)) {
    const read = readAudit(await fetchText(`${runDir}/audit.jsonl`));
    audits.push(...read.rows);
    warnings.push(...read.warnings);
  }
  const byTrial = new Map(audits.map((a) => [a.trial, a]));
  const manifest = has.has(`${runDir}/manifest.json`) ? await fetchJson<unknown>(`${runDir}/manifest.json`).catch((e: unknown) => {
    warnings.push(`manifest.json cannot be read: ${message(e)}`);
    return null;
  }) : null;
  const matrix = await matrixOf(runDir, has);
  const prefix = `${runDir}/trials/`;
  const recordFiles = files.filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  const loaded = await Promise.all(recordFiles.map(async (file): Promise<Trial | BadRecord> => {
    const name = file.slice(prefix.length, -'.json'.length);
    try {
      const record = await fetchJson<unknown>(file);
      const errors = validateRecord(record);
      if (errors.length > 0) return { name, file, errors };
      const r = record as TrialRecord;
      const trajectoryUrl = r.trajectory && has.has(`${runDir}/${r.trajectory}`) ? dataUrl(`${runDir}/${r.trajectory}`) : null;
      const audit = byTrial.get(trialName(r)) ?? null;
      const events = readsEvents(r, audit) && trajectoryUrl !== null ? await fetchEvents(trajectoryUrl) : [];
      return { name: trialName(r), file, task: r.task_id, record: r, audit, trajectoryUrl, explanation: explainTrial(r, audit, explainContext({ record: r, events, manifest, matrix, text: checkTextOf(r.task_id) })) };
    } catch (e) {
      return { name, file, errors: [message(e)] };
    }
  }));
  const trials = loaded.filter((x): x is Trial => 'record' in x);
  const bad = loaded.filter((x): x is BadRecord => 'errors' in x);
  trials.sort((a, b) => (a.task === b.task ? (a.record.index ?? 0) - (b.record.index ?? 0) || (a.name < b.name ? -1 : 1) : a.task < b.task ? -1 : 1));
  bad.sort((a, b) => (a.name < b.name ? -1 : 1));
  if (summary !== null) {
    // The records must be the ones summary.json counts, or the swatches and rows would not add up to k/N.
    for (const [id, t] of Object.entries(summary.tasks)) {
      const mine = trials.filter((x) => x.task === id);
      const n = mine.length + bad.filter((b) => b.name.startsWith(`${id}/`)).length;
      if (n !== t.records) warnings.push(`${id}: summary.json counts ${t.records} records, the run holds ${n}`);
      const seen: Record<string, number> = {};
      for (const x of mine) seen[x.explanation.outcome] = (seen[x.explanation.outcome] ?? 0) + 1;
      const differ = Object.keys({ ...seen, ...t.outcomes }).filter((o) => (seen[o] ?? 0) !== (t.outcomes[o] ?? 0));
      if (differ.length > 0 && n === t.records && bad.length === 0) warnings.push(`${id}: the records' outcomes differ from summary.json for ${differ.join(', ')}`);
    }
    for (const id of new Set(trials.map((x) => x.task))) if (!(id in summary.tasks)) warnings.push(`${id}: the run holds records of a task that summary.json does not list`);
  }
  const runId = summary?.run_id ?? runDir.split('/').at(-1)!;
  return { runId, dir: runDir, official: summary !== null, manifest, grading: await gradingOf(files, runDir, trials, warnings), summary, trials, bad, warnings };
}

async function gradingOf(files: readonly string[], runDir: string, trials: Trial[], warnings: string[]): Promise<Grading> {
  const graders = [...new Set(trials.map((t) => t.record.grader_version ?? 'unknown'))].sort();
  const olderWorld = trials.filter((t) => t.record.state_hash.initial !== MANIFEST.world.state_hash).length;
  const prefix = `${runDir}/regrade/trials/`;
  const regraded = files.filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  if (regraded.length === 0) return { graders, olderWorld, regrade: null };
  const byFile = new Map(trials.map((t) => [t.file.slice(`${runDir}/trials/`.length), t]));
  const rows = await Promise.all(regraded.map(async (f) => {
    try {
      const g = await fetchJson<{ outcome?: unknown; grader_version?: unknown }>(f);
      return { f, g, original: byFile.get(f.slice(prefix.length)) ?? null };
    } catch (e) {
      warnings.push(`${f} cannot be read: ${message(e)}`);
      return null;
    }
  }));
  const ok = rows.filter((x) => x !== null);
  return {
    graders,
    olderWorld,
    regrade: {
      graders: [...new Set(ok.map((x) => String(x.g.grader_version ?? 'unknown')))].sort(),
      records: ok.length,
      changed: ok.filter((x) => x.original === null || x.original.record.outcome !== x.g.outcome).map((x) => x.f.slice(prefix.length, -'.json'.length)),
    },
  };
}

// One plain line on how a run was graded, when it is not plainly today's grader on today's world:
// "Graded with grader 3 on an older world; a regrade with grader 4 gives the same outcomes."
export function gradingLine(g: Grading): string | null {
  if (g.olderWorld === 0 && g.regrade === null) return null;
  const graded = `Graded with grader ${g.graders.join(' and ')}${g.olderWorld > 0 ? ' on an older world than today\'s' : ''}`;
  if (g.regrade === null) return `${graded}.`;
  const changed = g.regrade.changed;
  return `${graded}; a regrade with grader ${g.regrade.graders.join(' and ')} gives ${changed.length === 0 ? 'the same outcomes' : `a different outcome for ${changed.join(', ')}`}.`;
}

// A pilot run's pass rate per task over its valid trials, with the Wilson 95% interval, as
// summary.ts computes it for an official run; never counted in the results.
export function pilotRates(run: RunData): Array<{ task: string; passes: number; valid: number; rate: number | null; interval: Interval | null }> {
  return [...new Set(run.trials.map((t) => t.task))].sort().map((task) => {
    const valid = run.trials.filter((t) => t.task === task && t.explanation.valid);
    const passes = valid.filter((t) => t.explanation.outcome === 'PASS').length;
    return { task, passes, valid: valid.length, rate: valid.length === 0 ? null : passes / valid.length, interval: wilson(passes, valid.length) };
  });
}

// The run's parsed matrix.json, fetched once; null when it has none or it cannot be read.
const matrices = new Map<string, Promise<unknown>>();
function matrixOf(runDir: string, has: ReadonlySet<string>): Promise<unknown> {
  const file = `${runDir}/matrix.json`;
  if (!has.has(file)) return Promise.resolve(null);
  if (!matrices.has(file)) matrices.set(file, fetchJson<unknown>(file).catch(() => null));
  return matrices.get(file)!;
}

// Whether an id is in today's world, loaded once and only when a criterion asks.
let world: Promise<(id: string) => boolean> | undefined;
const inWorld = () => (world ??= Promise.all([import('../../../../packages/env/fixture-source.ts'), import('./world.ts')]).then(async ([{ loadStore }, { worldSource }]) => {
  const store = await loadStore(worldSource());
  return worldLookup(new Set([...store.resources()].map((r) => `${r.resourceType}/${r.id}`)));
}));

// The trial's explanation with every part the criteria read (see the header).
export async function fullExplanation(t: Trial, run: RunData, has: ReadonlySet<string>): Promise<Explanation> {
  const [{ taskChecks }, matrix, events] = await Promise.all([
    import('../tasks/matrix-task.ts'),
    matrixOf(run.dir, has),
    t.trajectoryUrl === null ? Promise.resolve([]) : fetchEvents(t.trajectoryUrl),
  ]);
  const input = { record: t.record, events, manifest: run.manifest, matrix, checks: await taskChecks(t.task).catch(() => []), text: checkTextOf(t.task) };
  return explainTrial(t.record, t.audit, explainContext({ ...input, inWorld: needsWorld(input) ? await inWorld() : null }));
}

const PILOT_DIR = /^(results\/(?:runs\/)?pilot-[A-Za-z0-9._-]+)\/trials\//;

async function load(): Promise<Results> {
  const res = await fetch(dataUrl('index.json'));
  // A build always writes data/index.json; without it (vite dev) there are no results.
  if (!res.ok) return { kind: 'ready', official: null, officialError: null, pilots: [], findings: null, files: new Set() };
  const { files } = (await res.json()) as { files: string[] };
  const has = new Set(files);
  const findings = has.has('docs/findings.md') ? await fetchText('docs/findings.md') : null;
  let official: RunData | null = null;
  let officialError: string | null = null;
  let officialDir: string | null = null;
  if (has.has('results/official.json')) {
    const { run } = await fetchJson<{ run: string }>('results/official.json');
    officialDir = `results/${run.replace(/^\.\//, '').replace(/\/$/, '')}`;
    if (has.has(`${officialDir}/summary.json`)) {
      const summary = await fetchJson<unknown>(`${officialDir}/summary.json`);
      const errors = validateSummary(summary);
      if (errors.length > 0) officialError = `${officialDir}/summary.json is not a summary: ${errors.slice(0, 3).join('; ')}`;
      else official = await loadRun(files, has, officialDir, summary as Summary);
    }
  }
  const pilotDirs = [...new Set(files.flatMap((f) => PILOT_DIR.exec(f)?.[1] ?? []))].filter((d) => d !== officialDir).sort();
  const pilots = await Promise.all(pilotDirs.map((d) => loadRun(files, has, d, null)));
  return { kind: 'ready', official, officialError, pilots, findings, files: has };
}

let cached: Promise<Results> | undefined;
// A failed load is not kept, so a view opened later tries again.
export function loadResults(): Promise<Results> {
  return (cached ??= load().catch((e: unknown): Results => {
    cached = undefined;
    return { kind: 'error', message: message(e) };
  }));
}

export function useResults(): Results | null {
  const [r, setR] = useState<Results | null>(null);
  useEffect(() => {
    let live = true;
    void loadResults().then((x) => live && setR(x));
    return () => {
      live = false;
    };
  }, []);
  return r;
}
