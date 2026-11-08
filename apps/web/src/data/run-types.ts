// The shapes of a run and its trials as the browse views read them (data/results.ts loads them
// and re-exports these). On their own here, with no Vite API, so a module the Node tests load
// (trial/session.ts, trial/resolve.ts) can name them without reaching results.ts, whose
// import.meta the root typecheck cannot see.
import type { AuditRow, ExplainRecord, Explanation } from '../../../../packages/core/explain.ts';
import type { Summary } from '../../../../packages/core/summary.ts';

export type TrialRecord = ExplainRecord & { task_id: string; index?: number; effort?: string | null; trajectory?: string; env_version?: string | null; grader_version?: string | null; cost_usd: number; judge_cost_usd?: number | null; score?: number | null };

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
  // The grader versions of the records' current grades (the last regrade kept in a record, else
  // the recorded grade), sorted.
  current: string[];
  // Records whose initial state hash is not today's manifest's, nor their task's frozen world.
  olderWorld: number;
  // Records that started from their task's frozen world (results/tasks-final.json), when that
  // is not today's manifest's.
  frozenWorld: number;
  // The run's records, and the tasks of the frozenWorld records, sorted (grading-line.ts).
  trials: number;
  frozenTasks: string[];
  // The run's offline regrade, when it holds one: its grader version and the records whose
  // outcome it changes.
  regrade: { graders: string[]; records: number; changed: string[] } | null;
}

// A task's freeze in results/tasks-final.json, as the views read it: its world, the env_version
// it froze at, and the tag and commit that reproduce its records (replay_at, else the freeze tag
// alone). A task carries one freeze per version: its entry and, for a task with a version pending
// (R42, `status: "v2-pending"`), its superseded sub-entry; a trial's freeze is the one at the
// trial's env_version (results.ts frozenFor), as cli/replay.ts replayAtOf matches it.
export interface FrozenTask {
  // The entry's own freeze (current), the one it kept under `previous` after a re-freeze on a
  // new world (R40), or a superseded version's (R42); version is the superseded one's (v1).
  role: 'current' | 'previous' | 'superseded';
  version?: string;
  // null when the entry records none: such a freeze stands for the task's trials at any version.
  env_version: string | null;
  world_hash: string;
  frozen_at: { tag: string };
  replay_at: { tag: string; commit: string } | null;
}
export type Freezes = Readonly<Record<string, readonly FrozenTask[]>>;

// What a run is to the results: the official run, one of its superseded task versions, a pilot,
// or a probe or smoke run (results.ts header); only the official run counts. A session run
// (trial/session.ts: one this surface started, shown on the trial page of run=session) never
// loads from the published results.
export type RunKind = 'official' | 'superseded' | 'pilot' | 'probe' | 'smoke' | 'session';

export interface RunData {
  runId: string;
  // The run's directory under data/, e.g. results/pilot-0.
  dir: string;
  official: boolean;
  kind: RunKind;
  // Set on a superseded version of a task of the official run (results.ts header): which run and
  // task it supersedes under, and its version (v1).
  superseded: { of: string; task: string; version: string } | null;
  // The run's parsed manifest.json, or null when it has none.
  manifest: unknown;
  grading: Grading;
  // The official run's summary.json; null for a pilot run.
  summary: Summary | null;
  trials: Trial[];
  bad: BadRecord[];
  // Problems that do not stop the views: an unreadable audit.jsonl or audit line, records that disagree with summary.json.
  warnings: string[];
}
