// The local-runner TrialTransport: the trial runs in Node, in the runner, through the same
// packages/core run() as the CLI. start posts one batch (POST api/trials, with the session cap);
// events reads the trial's SSE stream (GET api/trials/:id/events) and keeps each event in
// IndexedDB, so after a reload it shows the kept events and reconnects with Last-Event-ID set to
// the last one: the runner replays what came after and goes live. A dropped stream reconnects the
// same way. cancel is DELETE api/trials/:id; runs is GET api/runs and each trial's GET; project is
// the same POST with ?dry_run=1, which the runner answers with 0 calls. Every call
// carries the X-Clinenv-Token from the page and is same-origin; the page never calls the API.
import { parseEvent, type TrialEvent } from '../../../../../packages/core/events.ts';
import type { ExplainRecord } from '../../../../../packages/core/explain.ts';
import {
  MAX_CONCURRENCY, parseDryRun, parseRunnerError, parseRunsList, parseSse, parseSseEnd, parseTrialsAccepted, parseTrialsRefused, parseTrialView, refusalText,
  RUNS_PATH, SSE_END, TOKEN_HEADER, TRIALS_PATH, type TrialView,
} from '../../../../../packages/core/runner-api.ts';
import { runnerToken } from '../../keygate/runner.ts';
import { putEvent, readEvents } from '../store.ts';
import type { BatchRequest, LiveRun, StartResult, TrialEnd, TrialTransport } from '../types.ts';
import { allCapped } from '../typical.ts';

const RECONNECT_MS = 500;

const NO_TOKEN = { ok: false, lead: 'This page has no runner token.', detail: 'Open the UI at the address that the runner printed, then try again.' } as const;

function call(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, document.baseURI), {
    ...init,
    headers: { [TOKEN_HEADER]: token, ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...(init.headers as Record<string, string> | undefined) },
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  });
}

const json = async (res: Response): Promise<unknown> => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const batchBody = ({ task, trials, sessionCap }: BatchRequest) => ({ tasks: [task], trials, concurrency: Math.min(trials, MAX_CONCURRENCY), effort: 'high', session_cap_usd: sessionCap });

const trialPath = (id: string) => `${TRIALS_PATH}/${encodeURIComponent(id)}`;
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
});

export function runnerTransport(token = runnerToken()): TrialTransport {
  return {
    kind: 'local-runner',

    async project(req) {
      if (token === null) throw new Error(NO_TOKEN.lead);
      const res = await call(`${TRIALS_PATH}?dry_run=1`, token, { method: 'POST', body: JSON.stringify(batchBody(req)) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { projection } = parseDryRun(await json(res));
      return { usd: projection.total_usd, committed: projection.session_spent_usd, bound: allCapped(projection.lines) };
    },

    async start(req): Promise<StartResult> {
      if (token === null) return NO_TOKEN;
      let res: Response;
      try {
        res = await call(TRIALS_PATH, token, { method: 'POST', body: JSON.stringify(batchBody(req)) });
      } catch (e) {
        return { ok: false, lead: 'The local runner did not answer.', detail: (e as Error).message };
      }
      const parsed = await json(res);
      try {
        if (res.status === 202) {
          const { run_id, trial_ids } = parseTrialsAccepted(parsed);
          return { ok: true, runId: run_id, trialIds: trial_ids };
        }
        const { type, message } = (res.status === 409 ? parseTrialsRefused(parsed) : parseRunnerError(parsed)).error;
        const lead = res.status === 409 ? refusalText('trials', type) : null;
        return { ok: false, lead: lead ?? 'The local runner did not start this batch.', detail: message };
      } catch {
        return { ok: false, lead: 'The local runner sent an answer that this page cannot read.', detail: `HTTP ${res.status}` };
      }
    },

    async events(trialId, onEvent, signal): Promise<TrialEnd> {
      let last = -1;
      for (const e of await readEvents(trialId)) {
        onEvent(e);
        last = e.seq;
        if (e.type === 'graded') return { state: e.record.outcome === 'CANCELLED' ? 'cancelled' : 'graded', record: e.record as unknown as ExplainRecord, message: null };
      }
      if (token === null) return { state: 'error', record: null, message: NO_TOKEN.lead };
      for (;;) {
        if (signal.aborted) return { state: 'cancelled', record: null, message: 'stopped watching' };
        try {
          const res = await call(`${trialPath(trialId)}/events`, token, { signal, headers: last >= 0 ? { 'Last-Event-ID': String(last) } : {} });
          if (res.status === 404) return { state: 'error', record: null, message: 'The local runner has no such trial. It may have restarted.' };
          if (!res.ok || res.body === null) throw new Error(`HTTP ${res.status}`);
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            const { frames, rest } = parseSse(buffer + value);
            buffer = rest;
            for (const f of frames) {
              if (f.event === SSE_END) {
                const end = parseSseEnd(JSON.parse(f.data));
                return { state: end.state === 'queued' || end.state === 'running' ? 'error' : end.state, record: null, message: end.message };
              }
              const e: TrialEvent = parseEvent(JSON.parse(f.data));
              if (e.seq <= last) continue;
              await putEvent(trialId, e);
              last = e.seq;
              onEvent(e);
              if (e.type === 'graded') {
                return { state: e.record.outcome === 'CANCELLED' ? 'cancelled' : 'graded', record: e.record as unknown as ExplainRecord, message: null };
              }
            }
          }
        } catch (e) {
          if (signal.aborted) continue;
          if (e instanceof SyntaxError || (e as Error).message.startsWith('not a')) return { state: 'error', record: null, message: `The local runner sent an event this page cannot read: ${(e as Error).message}` };
        }
        // The stream closed before the trial ended: reconnect from the last event.
        await sleep(RECONNECT_MS, signal);
      }
    },

    async cancel(trialId) {
      if (token !== null) await call(trialPath(trialId), token, { method: 'DELETE' });
    },

    async runs(): Promise<LiveRun[]> {
      if (token === null) return [];
      const { runs } = parseRunsList(await json(await call(RUNS_PATH, token)));
      return Promise.all(runs.map(async (r) => {
        const views = await Promise.all(r.trial_ids.map(async (id): Promise<TrialView | null> => {
          try {
            return parseTrialView(await json(await call(trialPath(id), token)));
          } catch {
            return null;
          }
        }));
        return {
          runId: r.run_id, started: r.started, tasks: r.tasks, trials: r.trials, done: r.done, stopped: r.stopped,
          rows: views.filter((v): v is TrialView => v !== null).map((v) => ({
            trialId: v.trial_id, taskId: v.task_id, index: v.index, state: v.state, record: v.record as unknown as ExplainRecord | null, error: v.error,
          })),
        };
      }));
    },
  };
}
