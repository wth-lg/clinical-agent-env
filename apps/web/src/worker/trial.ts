// The browser-direct trial Worker (plan phase P15): one trial per Worker, through packages/core
// run(), graded here in the browser. The page posts one start message (live/transport/worker.ts
// WorkerStart) with the key, the session cap and the tab ledger's rows. The client comes from a
// grant of a memoryLedger seeded with those rows and opened with the session cap as its ceiling;
// its options come from clientOptions, the one place they are set. Each ledger append goes back to
// the page, which keeps the tab ledger. A start with a checkpoint resumes a trial a reload cut
// off (live/resume.ts): the kept events are checked, not posted again. A cancel message aborts the
// trial's signal, so it ends CANCELLED. The egress guard is installed first, as in every entry
// point that holds a client.
import { installEgressGuard } from '../../../../packages/core/egress.ts';
import type { TrialEvent } from '../../../../packages/core/events.ts';
import { run, type RunOptions } from '../../../../packages/core/run.ts';
import { grantClient, memoryLedger, sessionCeiling } from '../adapters/ledger-browser.ts';
import { browserNow } from '../adapters/clock-browser.ts';
import { browserTaskSource } from '../adapters/tasks-browser.ts';
import { taskChecks } from '../live/checks.ts';
import { resumeClient, sameEvent } from '../live/resume.ts';
import { clientOptions, type WorkerIn, type WorkerOut } from '../live/transport/worker.ts';
import definitionsUrl from '../../../../fixtures/definitions-pruned.json?url';

installEgressGuard(globalThis);

const scope = globalThis as unknown as { postMessage(m: WorkerOut): void; addEventListener(t: 'message', l: (e: { data: WorkerIn }) => void): void };
const post = (m: WorkerOut) => scope.postMessage(m);
const controller = new AbortController();
let started = false;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
const json = async <T>(url: string): Promise<T> => JSON.parse(new TextDecoder().decode(await fetchBytes(url))) as T;

scope.addEventListener('message', ({ data }) => {
  if (data.type === 'cancel') return controller.abort(data.reason);
  if (data.type !== 'start' || started) return;
  started = true;
  const start = data;
  void (async () => {
    const ledger = memoryLedger({ rows: start.seed, onAppend: (rows) => post({ type: 'ledger', rows }) });
    const grant = await ledger.batchStart(start.projection, sessionCeiling(start.cap));
    try {
      const [manifest, world, definitions, checks] = await Promise.all([
        json<{ world: { state_hash: string } }>(start.manifestUrl),
        fetchBytes(start.worldUrl),
        json<NonNullable<RunOptions['definitions']>>(new URL(definitionsUrl, import.meta.url).href),
        taskChecks(start.task),
      ]);
      const client = grantClient({ grant, ledger, ...clientOptions(start) });
      const kept = start.checkpoint;
      const onEvent = (e: TrialEvent) => {
        if (e.seq >= kept.length) return post({ type: 'event', event: e });
        if (!sameEvent(e, kept[e.seq]!)) controller.abort(`resume: event ${e.seq} (${e.type}) differs from the one kept before the reload`);
      };
      const { record } = await run(start.task, start.model, {
        tasks: browserTaskSource({ testMode: false }),
        client: kept.length > 0 ? resumeClient(client, kept) : client,
        judge: client,
        world: { read: async () => world },
        worldHash: manifest.world.state_hash,
        definitions,
        now: browserNow,
        effort: start.effort,
        trialId: start.trialId,
        checks,
        signal: controller.signal,
        onEvent,
      });
      post({ type: 'result', record });
    } finally {
      await grant.close();
    }
  })().catch((e: unknown) => post({ type: 'failed', error: e instanceof Error ? e.message : String(e) }));
});
