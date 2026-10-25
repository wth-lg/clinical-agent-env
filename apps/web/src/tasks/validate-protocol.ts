// Messages between the Tasks view and the validation Worker (validation-thread.ts), and a client
// that sends one request and resolves with its reply. One Worker serves the tab; requests queue.
import type { ExplainRecord } from '../../../../packages/core/explain.ts';
import type { ReplayRecord, ReplayVerdict } from '../../../../packages/core/replay.ts';
import type { CaseKind } from '../../../../packages/grader/matrix/matrix.ts';

// A published trial to replay; trajectoryUrl is null when the run has no trajectory for it.
export interface ReplayTrial {
  name: string;
  record: ExplainRecord & ReplayRecord;
  trajectoryUrl: string | null;
}

export type ValidateRequest =
  | { op: 'oracle'; task: string }
  | { op: 'matrix'; task: string }
  | { op: 'replay'; task: string; trials: ReplayTrial[] };

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

let worker: Worker | undefined;
let next = 1;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

export function validate(req: { op: 'oracle'; task: string }): Promise<OracleResult>;
export function validate(req: { op: 'matrix'; task: string }): Promise<MatrixRun>;
export function validate(req: ValidateRequest & { op: 'replay' }): Promise<ReplayRow[]>;
export function validate(req: ValidateRequest): Promise<unknown> {
  if (worker === undefined) {
    worker = new Worker(new URL('./validation-thread.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (ev: MessageEvent<ValidateReply>) => {
      const w = waiting.get(ev.data.id);
      waiting.delete(ev.data.id);
      if (ev.data.ok) w?.resolve(ev.data.result);
      else w?.reject(new Error(ev.data.error));
    });
  }
  const id = next++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, req });
  });
}
