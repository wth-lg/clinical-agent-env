// The browser gets a task's mid-trial event specs from the task (plan-amendment-w4 Correction 2,
// PW4-E1 stage 2): browserTaskSource bundles each tasks/<id>/events.ts as text and as a module, and
// the grader validation Worker (src/tasks/validation-thread.ts) replays a trial's tool log with the
// specs of that source. The test loads the Worker module with a fake Worker scope and a fetch that
// serves the fixtures, then asks it for the state an event trial reaches: only a replay that
// re-fires the toy's events reaches the trial's recorded final hash.
// Both web modules use Vite's import.meta API, which the root tsconfig (it compiles apps/web/test)
// has no types for, so they are imported by a path the compiler does not follow; vitest loads them.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { MessagesClient } from '../../../packages/core/anthropic.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../../../packages/core/ledger.ts';
import { run } from '../../../packages/core/run.ts';
import { toJsonl } from '../../../packages/core/trajectory.ts';
import type { TaskFiles, TaskSource } from '../../../packages/core/tasks.ts';
import { scenarioTransport } from '../src/harness/scenarios.ts';

const viteModule = (path: string) => import(/* @vite-ignore */ path);
const BROWSER = '../src/adapters/tasks-browser.ts';
const VALIDATION = '../src/tasks/validation-thread.ts';

const root = new URL('../../../', import.meta.url);
const WORLD = new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
const DEFINITIONS_TEXT = readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } };

class MemoryStore implements LedgerStore {
  rows: LedgerRow[] = [];
  async transact<T>(fn: (rows: readonly LedgerRow[]) => { append: LedgerRow[]; result: T }): Promise<T> {
    const { append, result } = fn(this.rows);
    this.rows.push(...append);
    return result;
  }
  async read(): Promise<LedgerRow[]> {
    return [...this.rows];
  }
}

describe('browserTaskSource', () => {
  it('bundles the toy events.ts as its module, and gives _toy its two active specs', async () => {
    const { browserTaskDirs, browserTaskSource } = (await viteModule(BROWSER)) as { browserTaskDirs: () => TaskFiles[]; browserTaskSource: (o: { testMode: boolean }) => TaskSource };
    const toy = browserTaskDirs().find((d) => d.id === '_toy')!;
    expect(toy.files['events.ts']).toContain('toy-a1');
    expect(toy.events?.ACTIVE).toEqual(['toy-a1', 'toy-d1']);
    expect((await browserTaskSource({ testMode: true }).get('_toy')).events.map((s) => s.id)).toEqual(['toy-a1', 'toy-d1']);
    expect((await browserTaskSource({ testMode: true }).get('results-inbox')).events).toEqual([]);
  });
});

describe('the grader validation Worker', () => {
  let replies: Array<{ id: number; ok?: boolean; result?: unknown; error?: string }> = [];
  let listener: (e: { data: unknown }) => void = () => {};
  const TRAJECTORY_URL = 'https://example.test/trajectory.jsonl';
  let trajectory = '';
  let finalHash = '';

  beforeAll(async () => {
    // The event trial, run in Node, whose trajectory the Worker fetches.
    const store = new MemoryStore();
    admitStore(store);
    let id = 0;
    const ledger = createLedger({ store, clock: { now: () => 't' }, newId: () => `id-${++id}`, source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
    const grant = await ledger.batchStart(6);
    const { record, events } = await run('_toy', 'claude-opus-5-5', {
      tasks: nodeTaskSource({ testMode: true }),
      client: new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', fetch: scenarioTransport('toyEvent').transport }),
      world: { read: async () => WORLD },
      worldHash: MANIFEST.world.state_hash,
      definitions: JSON.parse(DEFINITIONS_TEXT),
      now: () => 0,
    });
    await grant.close();
    expect(events.filter((e) => e.type === 'env_event')).toHaveLength(2);
    trajectory = toJsonl(events);
    finalHash = record.state_hash.final!;

    vi.stubGlobal('location', { origin: 'https://example.test' });
    vi.stubGlobal('addEventListener', (_t: string, l: (e: { data: unknown }) => void) => (listener = l));
    vi.stubGlobal('postMessage', (m: { id: number }) => replies.push(m));
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input);
      if (url === TRAJECTORY_URL) return new Response(trajectory);
      if (url.includes('world.ndjson.gz')) return new Response(WORLD);
      if (url.includes('definitions-pruned.json')) return new Response(DEFINITIONS_TEXT);
      return new Response('not found', { status: 404 });
    });
    await viteModule(VALIDATION);
  }, 120_000);

  afterAll(() => vi.unstubAllGlobals());

  it('replays the event trial to its recorded final state', async () => {
    replies = [];
    listener({ data: { id: 1, req: { op: 'state', task: '_toy', trajectoryUrl: TRAJECTORY_URL } } });
    await vi.waitFor(() => expect(replies.some((r) => r.id === 1 && r.ok !== undefined)).toBe(true), { timeout: 60_000 });
    const reply = replies.find((r) => r.id === 1)!;
    expect(reply.error).toBeUndefined();
    expect((reply.result as { final: string | null; error: string | null }).error).toBeNull();
    expect((reply.result as { final: string }).final).toBe(finalHash);
  });
});
