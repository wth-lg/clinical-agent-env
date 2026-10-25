// One TrialTransport per surface (plan phase P15): transport/runner.ts posts batches to the local
// runner and reads each trial's SSE stream; transport/worker.ts runs each trial in a browser
// Worker through packages/core/run.ts. The live view and the run launcher use only this
// interface, and see a trial only as its TrialEvents, so they cannot tell the surfaces apart.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import type { ExplainRecord } from '../../../../packages/core/explain.ts';

// Run ×N: trials per task, within the runner's 1 to MAX_TRIALS_PER_TASK.
export const RUN_SIZES = [1, 3, 10, 20] as const;

export interface BatchRequest {
  task: string;
  trials: number;
  // The session cap the user set (spend/session.ts).
  sessionCap: number;
}

// A refusal: a plain first sentence (REFUSAL_TEXT.trials where the runner or the ledger gave a
// reason), then the runner's or the ledger's own line.
export interface Refusal {
  lead: string;
  detail: string | null;
}

// A batch's projection, and the session's spend so far (settled, reserved and held open by
// running batches): the batch fits when their sum is within the session cap.
export interface Projected {
  usd: number;
  committed: number;
}

export type StartResult = { ok: true; runId: string; trialIds: string[] } | ({ ok: false } & Refusal);

export type TrialState = 'queued' | 'running' | 'graded' | 'cancelled' | 'error';

// How a trial's stream ended. message: why it ended without a graded event.
export interface TrialEnd {
  state: Exclude<TrialState, 'queued' | 'running'>;
  record: ExplainRecord | null;
  message: string | null;
}

export interface LiveTrialRow {
  trialId: string;
  taskId: string;
  index: number;
  state: TrialState;
  record: ExplainRecord | null;
  error: string | null;
}

export interface LiveRun {
  runId: string;
  started: string;
  tasks: string[];
  trials: number;
  done: boolean;
  stopped: string | null;
  rows: LiveTrialRow[];
}

export interface TrialTransport {
  readonly kind: 'local-runner' | 'browser-direct';
  start(req: BatchRequest): Promise<StartResult>;
  // What the batch is projected to cost and what the session has already committed, in USD, as
  // start would check them against the session cap.
  project(req: BatchRequest): Promise<Projected>;
  // Every event of the trial, those kept from before a reload first, then live ones; resolves
  // when the trial ends. A reload reconnects (local runner) or resumes (browser-direct).
  events(trialId: string, onEvent: (e: TrialEvent) => void, signal: AbortSignal): Promise<TrialEnd>;
  // Stop: the trial ends CANCELLED.
  cancel(trialId: string): Promise<void>;
  runs(): Promise<LiveRun[]>;
}

// The trial the live view shows, kept across a reload (an id, not a secret).
const CURRENT = 'clinenv.live.current';

export function currentTrial(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(CURRENT) ?? null;
  } catch {
    return null;
  }
}

export function setCurrentTrial(id: string): void {
  try {
    globalThis.sessionStorage?.setItem(CURRENT, id);
  } catch {
    // storage blocked: the view still shows the trial until a reload
  }
}
