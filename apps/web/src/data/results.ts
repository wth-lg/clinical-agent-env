// The committed results the browse views read (plan phase P14). The build copies them into
// dist/data/ (apps/web/build/copy-data.ts) and lists them in data/index.json; the local runner
// serves dist/data at the same paths, so every fetch here is relative to the Vite base and the
// same build works on Pages and under the runner. data/official.json names the run
// ({"run": "runs/<id>"}, relative to results/); from that run: summary.json (validated against
// packages/core/summary.ts), each trials/<task>/<index>.json, audit.jsonl and, lazily, each
// trajectory. docs/findings.md is the write-up. With no official run the views show their empty
// state.
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
import { MANIFEST } from './world.ts';

export const dataUrl = (rel: string): string => `${import.meta.env.BASE_URL}data/${rel}`;

export type TrialRecord = ExplainRecord & { task_id: string; index?: number; trajectory?: string; env_version?: string | null; cost_usd: number; score?: number | null };

export interface Trial {
  name: string;
  task: string;
  record: TrialRecord;
  audit: AuditRow | null;
  trajectoryUrl: string | null;
  explanation: Explanation;
}

export interface RunData {
  runId: string;
  summary: Summary;
  trials: Trial[];
  findings: string | null;
}

export type Results = { kind: 'empty'; findings: string | null } | { kind: 'error'; message: string } | { kind: 'ready'; run: RunData };

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

async function load(): Promise<Results> {
  const res = await fetch(dataUrl('index.json'));
  // A build always writes data/index.json; without it (vite dev) there are no results.
  if (!res.ok) return { kind: 'empty', findings: null };
  const { files } = (await res.json()) as { files: string[] };
  const has = new Set(files);
  const findings = has.has('docs/findings.md') ? await fetchText('docs/findings.md') : null;
  if (!has.has('results/official.json')) return { kind: 'empty', findings };
  const { run } = await fetchJson<{ run: string }>('results/official.json');
  const runDir = `results/${run.replace(/^\.\//, '').replace(/\/$/, '')}`;
  if (!has.has(`${runDir}/summary.json`)) return { kind: 'empty', findings };
  const summary = await fetchJson<unknown>(`${runDir}/summary.json`);
  const errors = validateSummary(summary);
  if (errors.length > 0) return { kind: 'error', message: `${runDir}/summary.json is not a summary: ${errors.slice(0, 3).join('; ')}` };
  const audits = has.has(`${runDir}/audit.jsonl`) ? (await fetchText(`${runDir}/audit.jsonl`)).split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as AuditRow) : [];
  const byTrial = new Map(audits.map((a) => [a.trial, a]));
  const recordFiles = files.filter((f) => f.startsWith(`${runDir}/trials/`) && f.endsWith('.json'));
  const records = await Promise.all(recordFiles.map((f) => fetchJson<TrialRecord>(f)));
  const trials = await Promise.all(records.map(async (record): Promise<Trial> => {
    const name = trialName(record);
    const trajectoryUrl = record.trajectory && has.has(`${runDir}/${record.trajectory}`) ? dataUrl(`${runDir}/${record.trajectory}`) : null;
    const audit = byTrial.get(name) ?? null;
    const events = readsEvents(record) && trajectoryUrl !== null ? await fetchEvents(trajectoryUrl) : [];
    return { name, task: record.task_id, record, audit, trajectoryUrl, explanation: explainTrial(record, audit, { events, world_state_hash: MANIFEST.world.state_hash }) };
  }));
  trials.sort((a, b) => (a.task === b.task ? (a.record.index ?? 0) - (b.record.index ?? 0) : a.task < b.task ? -1 : 1));
  return { kind: 'ready', run: { runId: (summary as Summary).run_id, summary: summary as Summary, trials, findings } };
}

let cached: Promise<Results> | undefined;
export function loadResults(): Promise<Results> {
  return (cached ??= load().catch((e: unknown) => ({ kind: 'error', message: e instanceof Error ? e.message : String(e) })));
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
