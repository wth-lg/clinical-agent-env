// The browser-direct TrialTransport: each trial runs in its own Worker (apps/web/src/worker/
// trial.ts) through packages/core/run.ts and is graded there, in the browser. start checks the
// whole batch first: one grant on the tab ledger for N times the per-trial projection, with the
// session cap as its ceiling, so a batch that would cross the cap is refused before any Worker
// starts and before any fetch. The grant stays open while the batch runs; each Worker meters
// through its own memoryLedger and reports its rows, which are ingested into the tab ledger under
// the batch's id. Events are kept in IndexedDB as they arrive. After a reload, a trial that was
// running resumes from them (live/resume.ts) once the tab holds a key again; one that had not
// started is cancelled. Stop aborts the Worker's signal, so the trial ends CANCELLED.
import type { ClientOptions } from '../../../../../packages/core/anthropic.ts';
import type { TrialEvent } from '../../../../../packages/core/events.ts';
import type { ExplainRecord } from '../../../../../packages/core/explain.ts';
import { SpendRefused, type LedgerRow } from '../../../../../packages/core/ledger.ts';
import { MAX_CONCURRENCY, refusalText } from '../../../../../packages/core/runner-api.ts';
import type { Effort, TrialRecord } from '../../../../../packages/core/run.ts';
import { MODEL, sessionCeiling, tabLedger, tabRows } from '../../adapters/ledger-browser.ts';
import { tabKey } from '../../keygate/key.ts';
import { refreshSpent, sessionCap } from '../../spend/session.ts';
import { trialProjection } from '../checks.ts';
import { getTrial, listRuns, listTrials, putEvent, putRun, putTrial, readEvents, updateTrial } from '../store.ts';
import type { LiveRun, StartResult, TrialEnd, TrialTransport } from '../types.ts';

// What the Worker's MessagesClient is built with, besides its grant and ledger: the one place
// those options come from (planner-13), so P16h can point it at the relay without touching run.ts.
export function clientOptions(start: { apiKey: string; trialId: string }): Omit<ClientOptions, 'grant' | 'ledger'> {
  return { apiKey: start.apiKey, trial: start.trialId };
}

// The origins the trial Worker may send to besides the Anthropic API, which only its client
// reaches (installEgressGuard allowedOrigins): its own, for the world, manifest and definitions.
// The page's meta CSP does not reach a Worker, so this is its connect-src. P16h adds the relay's
// origin here, beside clientOptions.
export const workerOrigins = (self: string): string[] => [self];

export interface WorkerStart {
  type: 'start';
  trialId: string;
  task: string;
  model: string;
  effort: Effort;
  apiKey: string;
  // The session cap: the Worker ledger's ceiling.
  cap: number;
  projection: number;
  // The tab ledger's rows, without this batch's own.
  seed: LedgerRow[];
  // The events kept before a reload; empty for a new trial.
  checkpoint: TrialEvent[];
  worldUrl: string;
  manifestUrl: string;
}
export type WorkerIn = WorkerStart | { type: 'cancel'; reason: string };
export type WorkerOut = { type: 'event'; event: TrialEvent } | { type: 'ledger'; rows: LedgerRow[] } | { type: 'result'; record: TrialRecord } | { type: 'failed'; error: string };

const NO_KEY = 'Add an API key to run trials. The key stays in this tab.';

interface Live {
  events: TrialEvent[];
  listeners: Set<(e: TrialEvent) => void>;
  done: Promise<TrialEnd>;
  cancel: (reason: string) => void;
}

const live = new Map<string, Live>();
// Ingests run one at a time, in arrival order.
let ingesting: Promise<unknown> = Promise.resolve();

const endOf = (record: TrialRecord): TrialEnd => ({ state: record.outcome === 'CANCELLED' ? 'cancelled' : 'graded', record: record as unknown as ExplainRecord, message: null });
const dataUrl = (path: string) => new URL(`data/fixtures/${path}`, document.baseURI).href;

function runWorker(trialId: string, task: string, opts: { batchId: string; cap: number; projection: number; checkpoint: TrialEvent[]; apiKey: string }): Live {
  const entry: Live = { events: [...opts.checkpoint], listeners: new Set(), done: Promise.resolve({ state: 'error', record: null, message: null }), cancel: () => {} };
  live.set(trialId, entry);
  const worker = new Worker(new URL('../../worker/trial.ts', import.meta.url), { type: 'module', name: trialId });
  entry.cancel = (reason) => worker.postMessage({ type: 'cancel', reason } satisfies WorkerIn);
  entry.done = new Promise<TrialEnd>((resolve) => {
    const finish = async (end: TrialEnd) => {
      worker.terminate();
      await ingesting;
      await updateTrial(trialId, { state: end.state, record: end.record, error: end.message });
      await refreshSpent();
      resolve(end);
    };
    worker.onmessage = ({ data }: MessageEvent<WorkerOut>) => {
      if (data.type === 'event') {
        entry.events.push(data.event);
        void putEvent(trialId, data.event);
        if (data.event.seq === 0) void updateTrial(trialId, { state: 'running' });
        for (const l of entry.listeners) l(data.event);
      } else if (data.type === 'ledger') {
        const rows = data.rows.filter((r) => r.kind === 'reserve' || r.kind === 'settle').map((r) => ({ ...r, batch_id: opts.batchId }));
        if (rows.length > 0) ingesting = ingesting.then(() => tabLedger().ingest(rows)).then(refreshSpent, () => undefined);
      } else if (data.type === 'result') {
        void finish(endOf(data.record));
      } else {
        void finish({ state: 'error', record: null, message: data.error });
      }
    };
    worker.onerror = (e) => void finish({ state: 'error', record: null, message: `The trial Worker failed: ${e.message}` });
  });
  void (async () => {
    const seed = (await tabRows()).filter((r) => r.batch_id !== opts.batchId);
    const start: WorkerStart = {
      type: 'start', trialId, task, model: MODEL, effort: 'high', apiKey: opts.apiKey, cap: opts.cap, projection: opts.projection, seed, checkpoint: opts.checkpoint,
      worldUrl: dataUrl('world.ndjson.gz'), manifestUrl: dataUrl('manifest.json'),
    };
    worker.postMessage(start);
  })();
  return entry;
}

// A refusal from the tab ledger: the launcher's text for the cap that refused, then its line.
function refused(e: unknown): StartResult {
  if (e instanceof SpendRefused) return { ok: false, lead: refusalText('trials', `spend_refused_${e.cap}`) ?? 'The spend ledger refused this batch.', detail: e.message };
  return { ok: false, lead: 'This batch could not start.', detail: (e as Error).message };
}

// A trial that stops the batch (an API 401, the org-CORS refusal included): the rest do not start.
const stopsBatch = (end: TrialEnd) => (end.record as { error?: { stops_batch?: boolean } | null } | null)?.error?.stops_batch === true;

async function runBatch(ids: string[], task: string, opts: { batchId: string; cap: number; projection: number; apiKey: string; close: () => Promise<void> }) {
  const queue = [...ids];
  let stopped: string | null = null;
  const next = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (stopped !== null) {
        await updateTrial(id, { state: 'cancelled', error: stopped });
        continue;
      }
      const end = await runWorker(id, task, { ...opts, checkpoint: [] }).done;
      if (stopsBatch(end)) stopped = `The batch stopped: trial ${id} ended ${String((end.record as { outcome?: string } | null)?.outcome)}.`;
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, ids.length) }, next));
  } finally {
    await opts.close();
    await refreshSpent();
  }
}

// After a reload: resume each trial that was running, cancel each that had not started.
let recovered: Promise<void> | undefined;
function recover(): Promise<void> {
  return (recovered ??= (async () => {
    const apiKey = tabKey();
    for (const t of await listTrials()) {
      if (live.has(t.trial_id)) continue;
      if (t.state === 'queued') await updateTrial(t.trial_id, { state: 'cancelled', error: 'The page reloaded before this trial started.' });
      else if (t.state === 'running' && apiKey !== null) await resume(t.trial_id, t.task_id, t.projection ?? 0, apiKey);
    }
  })());
}

async function resume(trialId: string, task: string, projection: number, apiKey: string): Promise<void> {
  const cap = sessionCap();
  let grant;
  try {
    grant = await tabLedger().batchStart(projection, sessionCeiling(cap));
  } catch (e) {
    await updateTrial(trialId, { state: 'error', error: `The trial could not resume: ${(e as Error).message}` });
    return;
  }
  const g = grant;
  const entry = runWorker(trialId, task, { batchId: g.batch_id, cap, projection, checkpoint: await readEvents(trialId), apiKey });
  void entry.done.finally(() => g.close().then(refreshSpent));
}

export function workerTransport(sessionCap: () => number): TrialTransport {
  return {
    kind: 'browser-direct',

    async project({ task, trials }) {
      return (await trialProjection(task)) * trials;
    },

    async start({ task, trials }): Promise<StartResult> {
      const apiKey = tabKey();
      if (apiKey === null) return { ok: false, lead: NO_KEY, detail: null };
      const cap = sessionCap();
      const projection = await trialProjection(task);
      let grant;
      try {
        grant = await tabLedger().batchStart(projection * trials, sessionCeiling(cap));
      } catch (e) {
        await refreshSpent();
        return refused(e);
      }
      await refreshSpent();
      const runId = `tab-${new Date().toISOString().replace(/[-:.]/g, '')}-${crypto.randomUUID().slice(0, 4)}`;
      const trialIds = Array.from({ length: trials }, (_, i) => `${runId}.${task}.${i}`);
      await putRun({ run_id: runId, surface: 'browser-direct', started: new Date().toISOString(), tasks: [task], trials, trial_ids: trialIds, stopped: null });
      for (const [index, id] of trialIds.entries()) await putTrial({ trial_id: id, run_id: runId, task_id: task, index, state: 'queued', record: null, error: null, projection });
      const g = grant;
      void runBatch(trialIds, task, { batchId: g.batch_id, cap, projection, apiKey, close: () => g.close() });
      return { ok: true, runId, trialIds };
    },

    async events(trialId, onEvent, signal): Promise<TrialEnd> {
      await recover();
      const entry = live.get(trialId);
      if (entry === undefined) {
        const kept = await readEvents(trialId);
        kept.forEach(onEvent);
        const t = await getTrial(trialId);
        const graded = kept.findLast((e) => e.type === 'graded');
        if (graded?.type === 'graded') return endOf(graded.record);
        if (t === undefined) return { state: 'error', record: null, message: 'This tab has no such trial.' };
        if (t.state === 'running') return { state: 'error', record: null, message: 'The page reloaded during this trial. Add the key again to resume it.' };
        return { state: t.state === 'queued' ? 'error' : t.state, record: t.record, message: t.error };
      }
      entry.events.forEach(onEvent);
      entry.listeners.add(onEvent);
      const stop = new Promise<TrialEnd>((resolve) => signal.addEventListener('abort', () => resolve({ state: 'cancelled', record: null, message: 'stopped watching' }), { once: true }));
      try {
        return await Promise.race([entry.done, stop]);
      } finally {
        entry.listeners.delete(onEvent);
      }
    },

    async cancel(trialId) {
      const entry = live.get(trialId);
      if (entry !== undefined) entry.cancel('Stop pressed in the live view');
      else if ((await getTrial(trialId))?.state === 'queued') await updateTrial(trialId, { state: 'cancelled', error: 'Stopped before it started.' });
    },

    async runs(): Promise<LiveRun[]> {
      await recover();
      const trials = await listTrials();
      return (await listRuns()).filter((r) => r.surface === 'browser-direct').map((r) => {
        const rows = trials.filter((t) => t.run_id === r.run_id).sort((a, b) => a.index - b.index);
        return {
          runId: r.run_id, started: r.started, tasks: r.tasks, trials: r.trials, stopped: r.stopped,
          done: rows.every((t) => t.state !== 'queued' && t.state !== 'running'),
          rows: rows.map((t) => ({ trialId: t.trial_id, taskId: t.task_id, index: t.index, state: t.state, record: t.record, error: t.error })),
        };
      });
    },
  };
}
