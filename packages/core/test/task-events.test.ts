// A task's mid-trial event specs come from the task (plan-amendment-w4 Correction 2, PW4-E1 stage
// 2): the TaskSource imports tasks/<id>/events.ts beside its text, parseTask keeps the active specs
// as Task.events, and run(), replay and gradeTrajectory read them from there. A task's events.ts
// that is read as text but not imported, or the reverse, is refused, so the code that fires is the
// code env_version hashed. The Node source imports the file by the hash of the text it read, so a
// source built after an edit runs the edited file. The worker host (packages/core/worker-host.ts,
// which apps/web's harness Worker runs) gets the specs through its TaskSource like any caller.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scenarioTransport } from '../../../apps/web/src/harness/scenarios.ts';
import { nodeTaskSource, TASKS_DIR } from '../../../cli/adapters/tasks-node.ts';
import { tempDir } from '../../../scripts/test/helpers.ts';
import { MessagesClient } from '../anthropic.ts';
import type { EnvEvent, TrialEvent } from '../events.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { parseTask, taskSource, taskVersions } from '../tasks.ts';
import { hostTrial, type HostOutbound, type HostScope } from '../worker-host.ts';

const root = new URL('../../../', import.meta.url);
const WORLD = new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
const MANIFEST = JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } };
const DEFINITIONS = JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8'));
const FILES = { 'task.toml': '[task]\nid = "x"\ntitle = "X"\n', 'instruction.md': 'Do it.' };
const SPEC = {
  id: 'x-1', item: 'i', class: 'A', trigger: { kind: 'after_exposed', ids: ['Patient/pt-0001'] }, stampFields: [],
  resources: [{ resourceType: 'Observation', id: 'obs-x-1', status: 'final', code: { text: 'x' }, subject: { reference: 'Patient/pt-0001' } }],
};

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

describe('the Node TaskSource loads events.ts', () => {
  it('gives _toy its two active specs, and a task without events.ts none', async () => {
    const tasks = nodeTaskSource({ testMode: true });
    expect((await tasks.get('_toy')).events.map((s) => [s.id, s.class])).toEqual([['toy-a1', 'A'], ['toy-d1', 'D']]);
    // A task without events.ts: the toy with its events.ts taken away (R37: no real task's data).
    const dir = tempDir('task-events-none');
    cpSync(join(TASKS_DIR, '_toy'), join(dir, '_toy'), { recursive: true });
    rmSync(join(dir, '_toy', 'events.ts'));
    expect((await nodeTaskSource({ root: dir, testMode: true }).get('_toy')).events).toEqual([]);
  });

  it('imports the events.ts it read: a source built after an edit runs the edited ACTIVE list', async () => {
    const dir = tempDir('task-events-root');
    cpSync(join(TASKS_DIR, '_toy'), join(dir, '_toy'), { recursive: true });
    const before = await nodeTaskSource({ root: dir, testMode: true }).get('_toy');
    const file = join(dir, '_toy', 'events.ts');
    writeFileSync(file, readFileSync(file, 'utf8').replace("ACTIVE: readonly string[] = ['toy-a1', 'toy-d1']", "ACTIVE: readonly string[] = ['toy-d1']"));
    const after = await nodeTaskSource({ root: dir, testMode: true }).get('_toy');
    expect(before.events.map((s) => s.id)).toEqual(['toy-a1', 'toy-d1']);
    expect(after.events.map((s) => s.id)).toEqual(['toy-d1']);
    // ACTIVE is in an env file: the edit moves env_version, not grader_task_version.
    const [a, b] = await Promise.all([taskVersions(before, MANIFEST.world.state_hash), taskVersions(after, MANIFEST.world.state_hash)]);
    expect(b.env_version).not.toBe(a.env_version);
    expect(b.grader_task_version).toBe(a.grader_task_version);
  });
});

describe('parseTask and events.ts', () => {
  it('keeps the active specs in SPECS order', async () => {
    const t = await parseTask({ id: 'x', files: { ...FILES, 'events.ts': '...' }, events: { SPECS: [SPEC as never, { ...SPEC, id: 'x-2' } as never], ACTIVE: ['x-2', 'x-1'] } });
    expect(t.events.map((s) => s.id)).toEqual(['x-1', 'x-2']);
  });

  it('refuses a module without its file, a file without its module, an unknown ACTIVE id and a module that exports no lists', async () => {
    await expect(parseTask({ id: 'x', files: FILES, events: { SPECS: [], ACTIVE: [] } })).rejects.toThrow(/an events module was given, and the task has no events.ts/);
    await expect(parseTask({ id: 'x', files: { ...FILES, 'events.ts': '' } })).rejects.toThrow(/events.ts was read as text but not imported/);
    await expect(parseTask({ id: 'x', files: { ...FILES, 'events.ts': '' }, events: { SPECS: [SPEC as never], ACTIVE: ['nope'] } })).rejects.toThrow(/tasks\/x\/events.ts: events: ACTIVE names nope/);
    await expect(parseTask({ id: 'x', files: { ...FILES, 'events.ts': '' }, events: {} as never })).rejects.toThrow(/must export SPECS and ACTIVE/);
  });

  it('a source over directories that carry no module refuses a task with events.ts', async () => {
    const tasks = taskSource(async () => [{ id: 'x', files: { ...FILES, 'events.ts': '' } }], { testMode: true });
    await expect(tasks.get('x')).rejects.toThrow(/not imported/);
  });
});

describe('the worker host', () => {
  it('runs the toy event route with the specs of its TaskSource: both events fire, once each', async () => {
    const store = new MemoryStore();
    admitStore(store);
    const posted: HostOutbound[] = [];
    let listener: (e: { data: unknown }) => void = () => {};
    let done: () => void = () => {};
    const finished = new Promise<void>((r) => (done = r));
    const scope: HostScope = {
      postMessage: (m) => {
        posted.push(m);
        if (m.type !== 'event') done();
      },
      addEventListener: (_t, l) => (listener = l),
    };
    hostTrial(scope, async (_start, defer) => {
      let id = 0;
      const ledger = createLedger({ store, clock: { now: () => 't' }, newId: () => `id-${++id}`, source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
      const grant = await ledger.batchStart(6);
      defer(() => grant.close());
      return {
        tasks: nodeTaskSource({ testMode: true }),
        client: new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', fetch: scenarioTransport('toyEvent').transport }),
        world: { read: async () => WORLD },
        worldHash: MANIFEST.world.state_hash,
        definitions: DEFINITIONS,
        now: () => 0,
      };
    });
    listener({ data: { type: 'start', task: '_toy', model: 'claude-opus-5-5' } });
    await finished;
    const events = posted.flatMap((p): TrialEvent[] => (p.type === 'event' ? [p.event] : []));
    expect(events.filter((e): e is EnvEvent => e.type === 'env_event').map((e) => e.spec)).toEqual(['toy-a1', 'toy-d1']);
    const result = posted.find((p) => p.type === 'result');
    expect(result?.type === 'result' && result.record.status).toBe('COMPLETED');
  });
});
