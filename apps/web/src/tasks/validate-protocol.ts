// Messages between the Tasks view and the validation Worker (validation-thread.ts), and a client
// that sends one request and resolves with its reply. One Worker serves the tab; requests queue.
// The Worker starts from a blob: URL as the trial Worker does (live/transport/worker.ts), so the
// page's CSP binds it; its base URL is the blob, so every URL a request carries is made absolute.
import type { ExplainRecord } from '../../../../packages/core/explain.ts';
import type { ReplayRecord, ReplayVerdict } from '../../../../packages/core/replay.ts';
import type { Diff } from '../../../../packages/grader/diff.ts';
import type { CaseKind } from '../../../../packages/grader/matrix/matrix.ts';
import { blobWorkerUrl } from '../live/transport/worker.ts';
import type { Change } from '../trial/state.ts';
import validationWorkerUrl from './validation-thread.ts?worker&url';

// A published trial to replay; trajectoryUrl is null when the run has no trajectory for it.
export interface ReplayTrial {
  name: string;
  record: ExplainRecord & ReplayRecord;
  trajectoryUrl: string | null;
}

export type ValidateRequest =
  | { op: 'oracle'; task: string }
  | { op: 'matrix'; task: string }
  | { op: 'replay'; task: string; trials: ReplayTrial[] }
  // The trial detail's State diff (P16): the trajectory at this absolute URL replayed on the world.
  | { op: 'state'; task: string; trajectoryUrl: string };

export type ValidateReply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface OracleResult {
  outcome: string | null;
  score: number | null;
  unknown: number;
  misses: string[];
  problems: string[];
}

// One case of the matrix as cli/matrix.ts writeMatrixJson records it in matrix.json.
export interface Probe {
  kind: CaseKind;
  id: string;
  outcome: string;
  as_expected: boolean;
  failed_checks: string[];
}

export interface MatrixRun {
  pass: boolean;
  lines: string[];
  probes: Probe[];
}

// One replayed trial: its verdict as `pnpm cli replay --json` gives it (packages/core/replay.ts).
export interface ReplayRow extends ReplayVerdict {
  name: string;
  final: string | null;
}

// A replayed trial's state: its final hash (null when a tool call threw, with the error) and
// the diff against the world (apps/web/src/trial/state.ts).
export interface StateRun {
  final: string | null;
  error: string | null;
  diff: Diff;
  changes: Change[];
}

let worker: Worker | undefined;
let next = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

export function validate(req: { op: 'oracle'; task: string }): Promise<OracleResult>;
export function validate(req: { op: 'matrix'; task: string }): Promise<MatrixRun>;
export function validate(req: ValidateRequest & { op: 'replay' }): Promise<ReplayRow[]>;
export function validate(req: ValidateRequest & { op: 'state' }): Promise<StateRun>;
export function validate(req: ValidateRequest): Promise<unknown> {
  if (worker === undefined) {
    worker = new Worker(blobWorkerUrl(validationWorkerUrl), { type: 'module', name: 'validation' });
    worker.addEventListener('message', (ev: MessageEvent<ValidateReply>) => {
      const w = waiting.get(ev.data.id);
      waiting.delete(ev.data.id);
      if (ev.data.ok) w?.resolve(ev.data.result);
      else w?.reject(new Error(ev.data.error));
    });
  }
  const id = next++;
  const abs = (u: string) => new URL(u, document.baseURI).href;
  const sent: ValidateRequest = req.op === 'replay' ? { ...req, trials: req.trials.map((t) => ({ ...t, trajectoryUrl: t.trajectoryUrl === null ? null : abs(t.trajectoryUrl) })) } : req.op === 'state' ? { ...req, trajectoryUrl: abs(req.trajectoryUrl) } : req;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, req: sent });
  });
}
