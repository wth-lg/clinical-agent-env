// The tab's live runs in IndexedDB: runs, trials and each trial's events, so a reload can show
// what already streamed and reconnect from the last event (local runner) or resume the trial
// from its checkpoint (browser-direct). Nothing here holds the key: events carry request bodies,
// never headers, and the Worker's start message (with the key) is never stored.
import type { TrialEvent } from '../../../../packages/core/events.ts';
import type { ExplainRecord } from '../../../../packages/core/explain.ts';
import type { TrialState } from './types.ts';

export const DB_NAME = 'clinenv-live';

export interface StoredRun {
  run_id: string;
  surface: 'local-runner' | 'browser-direct';
  started: string;
  tasks: string[];
  trials: number;
  trial_ids: string[];
  stopped: string | null;
}

export interface StoredTrial {
  trial_id: string;
  run_id: string;
  task_id: string;
  index: number;
  state: TrialState;
  record: ExplainRecord | null;
  error: string | null;
  // Browser-direct: what the trial's grant was opened with, for a resume.
  projection?: number;
}

let db: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  return (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('runs', { keyPath: 'run_id' });
      d.createObjectStore('trials', { keyPath: 'trial_id' }).createIndex('run_id', 'run_id');
      d.createObjectStore('events', { keyPath: ['trial_id', 'seq'] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putRun = (r: StoredRun) => tx('runs', 'readwrite', (s) => s.put(r)).then(() => undefined);
export const getRun = (id: string) => tx<StoredRun | undefined>('runs', 'readonly', (s) => s.get(id));
export const listRuns = () => tx<StoredRun[]>('runs', 'readonly', (s) => s.getAll());
export const putTrial = (t: StoredTrial) => tx('trials', 'readwrite', (s) => s.put(t)).then(() => undefined);
export const getTrial = (id: string) => tx<StoredTrial | undefined>('trials', 'readonly', (s) => s.get(id));
export const listTrials = () => tx<StoredTrial[]>('trials', 'readonly', (s) => s.getAll());

export async function updateTrial(id: string, patch: Partial<StoredTrial>): Promise<void> {
  const t = await getTrial(id);
  if (t !== undefined) await putTrial({ ...t, ...patch });
}

export const putEvent = (trialId: string, e: TrialEvent) => tx('events', 'readwrite', (s) => s.put({ trial_id: trialId, seq: e.seq, event: e })).then(() => undefined);

export async function readEvents(trialId: string): Promise<TrialEvent[]> {
  const rows = await tx<Array<{ event: TrialEvent }>>('events', 'readonly', (s) => s.getAll(IDBKeyRange.bound([trialId, 0], [trialId, Number.MAX_SAFE_INTEGER])));
  return rows.map((r) => r.event);
}
