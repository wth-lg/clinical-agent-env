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
// and the run's matrix.json, which M1's reachability reads, so its criteria equal audit-check's.
//
// A run's grading: the grader versions its records were graded at, whether they started from
// another world than today's manifest (a frozen task's own world, results/tasks-final.json, is
// counted apart: its records are historical, reproduced at the commit the freeze names, R37),
// and, when the run holds regrade/ (an offline regrade of its records with a later grader), how
// many keep their outcome.
//
// The official run's superseded task versions (R42: results/<run>/superseded/<task>-v<n>/, a
// version's trials moved there byte-identical when a later version's entered the run) load as
// runs of their own, never counted: Runs lists them under the official run, the difficulty
// history shows each beside the current version, and a trial of one opens like any other.
//
// The probe and smoke runs (results/probe-<n>/, results/smoke-<n>/, or under results/runs/; a
// grader probe or a pipeline smoke before a pilot, never a pilot) load as runs of their own too
// (probes, by name), for the difficulty history alone, labelled not counted (pre-audit-2 S24):
// they are not pilots, so the latest pilot, Overview's pilot card and Runs leave them out.
import { explainContext } from '../../../../packages/core/explain-context.ts';
import { auditAnswerOf, explainTrial, type AuditRow, type CheckText, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import { trialName, validateSummary, wilson, type Interval, type Summary } from '../../../../packages/core/summary.ts';
import { parseTrajectory } from '../../../../packages/core/trajectory.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { useEffect, useState } from 'react';
import { compareRuns } from './pilot-order.ts';
import { readAudit, validateRecord } from './records.ts';
import { MANIFEST } from './world.ts';

export const dataUrl = (rel: string): string => `${import.meta.env.BASE_URL}data/${rel}`;

const CHECK_TEXT = import.meta.glob<CheckText>('../../../../tasks/*.check-text.ts', { import: 'checkText', eager: true });
// A task's check text, or null when it has none (a test task).
export const checkTextOf = (task: string): CheckText | null => CHECK_TEXT[`../../../../tasks/${task}.check-text.ts`] ?? null;

// The shapes (run-types.ts, with no Vite API, so the Node tests can name them).
import type { BadRecord, Freezes, FrozenTask, Grading, RunData, RunKind, Trial, TrialRecord } from './run-types.ts';
export type { BadRecord, Freezes, FrozenTask, Grading, RunData, RunKind, Trial, TrialRecord } from './run-types.ts';

// A trial's freeze: the task's freeze at the trial's env_version, else one that records no
// env_version (a minimal entry), else none.
export const frozenFor = (frozen: Freezes, task: string, env: string | null | undefined): FrozenTask | null => {
  const fs = frozen[task] ?? [];
  return fs.find((f) => f.env_version !== null && f.env_version === env) ?? fs.find((f) => f.env_version === null) ?? null;
};

export type Results =
  | { kind: 'error'; message: string }
  // pilots: the pilot runs in their one order (pilot-order.ts); probes: the probe and smoke runs,
  // by name, for the difficulty history alone.
  | { kind: 'ready'; official: RunData | null; officialError: string | null; superseded: RunData[]; pilots: RunData[]; probes: RunData[]; frozen: Freezes; findings: string | null; files: ReadonlySet<string> };

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

// The records whose explanation reads the trajectory: a REFUSAL's or LIMIT's sentence, a
// replay_mismatch's E4 (the call that did not replay), and E6 when the audit row answers
// tool_rejections_correct no after adjudication.
export const readsEvents = (r: Pick<ExplainRecord, 'outcome' | 'detail'>, audit: Parameters<typeof auditAnswerOf>[0] | null): boolean =>
  r.outcome === 'REFUSAL' || r.outcome === 'LIMIT' || r.detail === 'replay_mismatch' || (audit !== null && auditAnswerOf(audit, 'tool_rejections_correct') === 'no');

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadRun(files: readonly string[], has: ReadonlySet<string>, runDir: string, summary: Summary | null, frozen: Freezes, kind: RunKind, superseded: RunData['superseded'] = null): Promise<RunData> {
  const warnings: string[] = [];
  const audits: AuditRow[] = [];
  if (has.has(`${runDir}/audit.jsonl`)) {
    // An unreadable audit.jsonl leaves the trials unaudited, as a bad line does; it never stops the load.
    const read = await fetchText(`${runDir}/audit.jsonl`).then(readAudit, (e: unknown) => ({ rows: [], warnings: [`audit.jsonl cannot be read: ${message(e)}`] }));
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
  return { runId, dir: runDir, official: summary !== null, kind, superseded, manifest, grading: await gradingOf(files, runDir, trials, warnings, frozen), summary, trials, bad, warnings };
}

// Whether a trial started from its task's frozen world, when that is not today's.
export const onFrozenWorld = (t: Pick<Trial, 'task' | 'record'>, frozen: Freezes): boolean => {
  const f = frozenFor(frozen, t.task, t.record.env_version);
  return f !== null && f.world_hash !== MANIFEST.world.state_hash && t.record.state_hash.initial === f.world_hash;
};

async function gradingOf(files: readonly string[], runDir: string, trials: Trial[], warnings: string[], frozen: Freezes): Promise<Grading> {
  const graders = [...new Set(trials.map((t) => t.record.grader_version ?? 'unknown'))].sort();
  const onFrozen = trials.filter((t) => onFrozenWorld(t, frozen));
  const frozenWorld = onFrozen.length;
  const frozenTasks = [...new Set(onFrozen.map((t) => t.task))].sort();
  const olderWorld = trials.filter((t) => t.record.state_hash.initial !== MANIFEST.world.state_hash && !onFrozenWorld(t, frozen)).length;
  const counts = { graders, olderWorld, frozenWorld, trials: trials.length, frozenTasks };
  const prefix = `${runDir}/regrade/trials/`;
  const regraded = files.filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  if (regraded.length === 0) return { ...counts, regrade: null };
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
    ...counts,
    regrade: {
      graders: [...new Set(ok.map((x) => String(x.g.grader_version ?? 'unknown')))].sort(),
      records: ok.length,
      changed: ok.filter((x) => x.original === null || x.original.record.outcome !== x.g.outcome).map((x) => x.f.slice(prefix.length, -'.json'.length)),
    },
  };
}

// The run's grading line (grading-line.ts), re-exported for the views.
export { gradingLine } from './grading-line.ts';

// A pilot run's pass rate per task over its valid trials, with the Wilson 95% interval, as
// summary.ts computes it for an official run; never counted in the results.
export function pilotRates(run: RunData): Array<{ task: string; passes: number; valid: number; rate: number | null; interval: Interval | null; outcomes: Record<string, number> }> {
  return [...new Set(run.trials.map((t) => t.task))].sort().map((task) => {
    const mine = run.trials.filter((t) => t.task === task);
    const valid = mine.filter((t) => t.explanation.valid);
    const passes = valid.filter((t) => t.explanation.outcome === 'PASS').length;
    const outcomes: Record<string, number> = {};
    for (const t of mine) outcomes[t.explanation.outcome] = (outcomes[t.explanation.outcome] ?? 0) + 1;
    return { task, passes, valid: valid.length, rate: valid.length === 0 ? null : passes / valid.length, interval: wilson(passes, valid.length), outcomes };
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

// The trial's explanation with every part the criteria read (see the header).
export async function fullExplanation(t: Trial, run: RunData, has: ReadonlySet<string>): Promise<Explanation> {
  const [{ taskChecks }, matrix, events] = await Promise.all([
    import('../tasks/matrix-task.ts'),
    matrixOf(run.dir, has),
    t.trajectoryUrl === null ? Promise.resolve([]) : fetchEvents(t.trajectoryUrl),
  ]);
  const input = { record: t.record, events, manifest: run.manifest, matrix, checks: await taskChecks(t.task).catch(() => []), text: checkTextOf(t.task) };
  return explainTrial(t.record, t.audit, explainContext(input));
}

// A pilot, probe or smoke run's directory (its kind is the name's prefix), under results/ or
// results/runs/, by a record under its trials/.
const RUN_DIR = /^(results\/(?:runs\/)?(pilot|probe|smoke)-[A-Za-z0-9._-]+)\/trials\//;
// A superseded version's directory under the official run: superseded/<task>-v<n>/trials/.
const SUPERSEDED_DIR = /^superseded\/((.+)-(v\d+))\/trials\//;

// results/tasks-final.json as the views read it: each frozen task's world and reproduce pointer;
// {} without the file or when it cannot be read (a warning the loader does not raise: the freeze
// is a hint for the State diff, never a count).
async function loadFrozen(has: ReadonlySet<string>): Promise<Freezes> {
  if (!has.has('results/tasks-final.json')) return {};
  try {
    type Entry = { env_version?: unknown; world_hash?: unknown; frozen_at?: { tag?: unknown }; replay_at?: { tag?: unknown; commit?: unknown }; superseded?: Entry & { version?: unknown }; previous?: Entry };
    const doc = await fetchJson<{ tasks?: Record<string, Entry> }>('results/tasks-final.json');
    // Each task's freezes: its entry, the freeze it kept under `previous` after a re-freeze (R40),
    // and its superseded sub-entry (R42); a freeze needs its world and tag to be a hint.
    const freeze = (t: Entry, role: FrozenTask['role'], version?: string): FrozenTask | null => {
      if (typeof t.world_hash !== 'string' || typeof t.frozen_at?.tag !== 'string') return null;
      const replay_at = typeof t.replay_at?.tag === 'string' && typeof t.replay_at.commit === 'string' ? { tag: t.replay_at.tag, commit: t.replay_at.commit } : null;
      return { role, ...(version !== undefined ? { version } : {}), env_version: typeof t.env_version === 'string' ? t.env_version : null, world_hash: t.world_hash, frozen_at: { tag: t.frozen_at.tag }, replay_at };
    };
    return Object.fromEntries(Object.entries(doc.tasks ?? {}).flatMap(([id, e]) => {
      const fs = [
        freeze(e, 'current'),
        ...(e.previous ? [freeze(e.previous, 'previous')] : []),
        ...(e.superseded ? [freeze(e.superseded, 'superseded', typeof e.superseded.version === 'string' ? e.superseded.version : undefined)] : []),
      ].filter((f): f is FrozenTask => f !== null);
      return fs.length === 0 ? [] : [[id, fs]];
    }));
  } catch {
    return {};
  }
}

async function load(): Promise<Results> {
  const res = await fetch(dataUrl('index.json'));
  // A build always writes data/index.json. Only its absence, a 404 (vite dev answers one for every
  // data/ path, vite.config.ts), means no results; any other HTTP error is a failed load.
  if (res.status === 404) return { kind: 'ready', official: null, officialError: null, superseded: [], pilots: [], probes: [], frozen: {}, findings: null, files: new Set() };
  if (!res.ok) throw new Error(`data/index.json: HTTP ${res.status}`);
  const { files } = (await res.json()) as { files: string[] };
  const has = new Set(files);
  const findings = has.has('docs/findings.md') ? await fetchText('docs/findings.md') : null;
  const frozen = await loadFrozen(has);
  let official: RunData | null = null;
  let officialError: string | null = null;
  let officialDir: string | null = null;
  const superseded: RunData[] = [];
  if (has.has('results/official.json')) {
    const { run } = await fetchJson<{ run: string }>('results/official.json');
    officialDir = `results/${run.replace(/^\.\//, '').replace(/\/$/, '')}`;
    if (has.has(`${officialDir}/summary.json`)) {
      const summary = await fetchJson<unknown>(`${officialDir}/summary.json`);
      const errors = validateSummary(summary);
      if (errors.length > 0) officialError = `${officialDir}/summary.json is not a summary: ${errors.slice(0, 3).join('; ')}`;
      else {
        official = await loadRun(files, has, officialDir, summary as Summary, frozen, 'official');
        const prefix = `${officialDir}/`;
        const keys = [...new Set(files.flatMap((f) => {
          const m = f.startsWith(prefix) ? SUPERSEDED_DIR.exec(f.slice(prefix.length)) : null;
          return m === null ? [] : [`${m[1]}\u0000${m[2]}\u0000${m[3]}`];
        }))].sort();
        for (const k of keys) {
          const [key, task, version] = k.split('\u0000') as [string, string, string];
          superseded.push(await loadRun(files, has, `${officialDir}/superseded/${key}`, null, frozen, 'superseded', { of: official.runId, task, version }));
        }
      }
    }
  }
  // By the run's name with numbers as numbers (pilot-order.ts), so the last pilot is the latest:
  // pilot-9 before pilot-10, under results/ or results/runs/ (verifier-phase-P17i-UI-2-1); the
  // probe and smoke runs apart, in the same order.
  const runName = (d: string) => d.slice(d.lastIndexOf('/') + 1);
  const runDirs = new Map<string, RunKind>();
  for (const f of files) {
    const m = RUN_DIR.exec(f);
    if (m !== null && m[1] !== officialDir) runDirs.set(m[1]!, m[2] as RunKind);
  }
  const dirs = [...runDirs.keys()].sort((a, b) => compareRuns(runName(a), runName(b)) || a.localeCompare(b));
  // Every run settles before the first failure is reported, so nothing is still fetching when
  // the load settles (ViewBody's data-preload signal relies on it).
  const settled = await Promise.allSettled(dirs.map((d) => loadRun(files, has, d, null, frozen, runDirs.get(d)!)));
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
  const runs = settled.map((s) => (s as PromiseFulfilledResult<RunData>).value);
  return { kind: 'ready', official, officialError, superseded, pilots: runs.filter((r) => r.kind === 'pilot'), probes: runs.filter((r) => r.kind !== 'pilot'), frozen, findings, files: has };
}

let cached: Promise<Results> | undefined;
// A failed load is not kept, so a view opened later tries again.
export function loadResults(): Promise<Results> {
  return (cached ??= load().catch((e: unknown): Results => {
    cached = undefined;
    return { kind: 'error', message: message(e) };
  }));
}

// Retry (eval-p25u-1 defect 5): the error notice's button drops the cached load and wakes every
// mounted useResults, which shows the loading line and loads again in place. onResultsReload
// registers a listener and returns the function that removes it.
const listeners = new Set<() => void>();
export function onResultsReload(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function reloadResults(): void {
  cached = undefined;
  for (const l of listeners) l();
}

export function useResults(): Results | null {
  const [r, setR] = useState<Results | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => onResultsReload(() => setAttempt((n) => n + 1)), []);
  useEffect(() => {
    let live = true;
    setR(null);
    void loadResults().then((x) => live && setR(x));
    return () => {
      live = false;
    };
  }, [attempt]);
  return r;
}
