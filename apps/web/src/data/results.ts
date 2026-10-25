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
// explainTrial over its record and audit row, with the manifest's state hash; explainTrial reads
// the trajectory only for a REFUSAL's or LIMIT's sentence, so only those trajectories are
// fetched up front.
import { explainTrial, type AuditRow, type ExplainRecord, type Explanation } from '../../../../packages/core/explain.ts';
import { trialName, validateSummary, type Summary } from '../../../../packages/core/summary.ts';
import { parseTrajectory } from '../../../../packages/core/trajectory.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { useEffect, useState } from 'react';
import { validateAuditRow, validateRecord } from './records.ts';
import { MANIFEST } from './world.ts';

export const dataUrl = (rel: string): string => `${import.meta.env.BASE_URL}data/${rel}`;

export type TrialRecord = ExplainRecord & { task_id: string; index?: number; trajectory?: string; env_version?: string | null; cost_usd: number; judge_cost_usd?: number | null; score?: number | null };

export interface Trial {
  name: string;
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

export interface RunData {
  runId: string;
  official: boolean;
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

// The records whose explanation reads the trajectory.
export const readsEvents = (r: Pick<ExplainRecord, 'outcome'>): boolean => r.outcome === 'REFUSAL' || r.outcome === 'LIMIT';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadRun(files: readonly string[], has: ReadonlySet<string>, runDir: string, summary: Summary | null): Promise<RunData> {
  const warnings: string[] = [];
  const audits: AuditRow[] = [];
  if (has.has(`${runDir}/audit.jsonl`)) {
    (await fetchText(`${runDir}/audit.jsonl`)).split('\n').forEach((line, i) => {
      if (line.trim() === '') return;
      try {
        const row = JSON.parse(line) as unknown;
        const errors = validateAuditRow(row);
        if (errors.length === 0) audits.push(row as AuditRow);
        else warnings.push(`audit.jsonl line ${i + 1} cannot be read: ${errors.join('; ')}`);
      } catch (e) {
        warnings.push(`audit.jsonl line ${i + 1} cannot be read: ${message(e)}`);
      }
    });
  }
  const byTrial = new Map(audits.map((a) => [a.trial, a]));
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
      const events = readsEvents(r) && trajectoryUrl !== null ? await fetchEvents(trajectoryUrl) : [];
      return { name: trialName(r), task: r.task_id, record: r, audit, trajectoryUrl, explanation: explainTrial(r, audit, { events, world_state_hash: MANIFEST.world.state_hash }) };
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
  return { runId, official: summary !== null, summary, trials, bad, warnings };
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
