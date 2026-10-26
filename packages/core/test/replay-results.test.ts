// Replay compares results (plan phase P17i C7, R14-35): run()'s replay re-executes every call the
// trial executed and compares each one's canonical result and is_error with the recorded
// tool_result; the first difference ends the trial ENV_ERROR replay_mismatch (E4), naming the
// call, even when the state hashes agree, so read-path nondeterminism is the environment's fault
// and not a silent model one. A test stands in for a nondeterministic tool by changing the
// recorded tool_result through onEvent, which receives the event run() keeps.
// gradeTrajectory compares only with compareResults (cli replay, which has already checked that
// the record's env_version is the checkout's); regrade grades the replayed state as before.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scriptedTransport, SCENARIOS } from '../../../apps/web/src/harness/scenarios.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { gate, type Check } from '../../grader/check.ts';
import { MessagesClient } from '../anthropic.ts';
import type { ToolResultEvent, TrialEvent } from '../events.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { gradeTrajectory, run, type RunOptions } from '../run.ts';

const root = new URL('../../../', import.meta.url);
const WORLD = new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
const MANIFEST = JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } };
const DEFINITIONS = JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8'));
const CHECKS: Check[] = [gate({ id: 'G1', category: 'retrieval', traces_to: 'instruction L4', decisive_ids: ['pt-0001'], fn: (ctx) => ({ met: ctx.exposedAt('pt-0001') !== null, evidence: {} }) })];

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

// The toy trial; tamper changes the first executed tool_result the moment run() emits it.
async function trial(tamper?: (e: ToolResultEvent) => void, over: Partial<RunOptions> = {}) {
  const store = new MemoryStore();
  admitStore(store);
  let id = 0;
  const ledger = createLedger({ store, clock: { now: () => 't' }, newId: () => `id-${++id}`, source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
  const grant = await ledger.batchStart(6);
  const transport = scriptedTransport(SCENARIOS.toy).transport;
  let clock = Date.UTC(2026, 9, 23, 12);
  const client = new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', fetch: (q) => ((clock += 4000), transport(q)), sleep: async () => {} });
  let tampered = false;
  return run('_toy', 'claude-opus-5-5', {
    tasks: nodeTaskSource({ testMode: true }), client, world: { read: async () => WORLD }, worldHash: MANIFEST.world.state_hash, definitions: DEFINITIONS,
    now: () => clock, checks: CHECKS, judge: null,
    onEvent: (e) => {
      if (tamper && !tampered && e.type === 'tool_result' && e.executed && e.name !== 'finish') {
        tampered = true;
        tamper(e);
      }
    },
    ...over,
  });
}

const firstRead = (events: readonly TrialEvent[]) => events.find((e): e is ToolResultEvent => e.type === 'tool_result' && e.executed && e.name !== 'finish')!;

describe('replay compares each re-executed call with the recorded tool_result', () => {
  it('a trial whose calls reproduce completes, with replay_final equal to final', async () => {
    const { record } = await trial();
    expect(record).toMatchObject({ status: 'COMPLETED', outcome: 'PASS' });
    expect(record.state_hash.replay_final).toBe(record.state_hash.final);
  });

  it('a read whose recorded result differs ends ENV_ERROR replay_mismatch, naming the call, though the state hashes agree', async () => {
    const { record, events } = await trial((e) => {
      (e as { content: unknown }).content = { ...(e.content as object), extra: 'not what the tool returns' };
    });
    const read = firstRead(events);
    expect(record).toMatchObject({ status: 'ENV_ERROR', detail: 'replay_mismatch', outcome: 'ENV_ERROR', valid: false });
    expect(record.state_hash.replay_final).toBeNull();
    const terminal = events.findLast((e) => e.type === 'error');
    expect(terminal).toMatchObject({ status: 'ENV_ERROR', code: 'replay_mismatch' });
    expect((terminal as { message: string }).message).toBe(`replay: call 1 (${read.name}, ${read.tool_use_id}) gave a different result: at extra, recorded "not what the tool returns", replayed absent`);
  });

  it('a call recorded as refused that succeeds on replay ends replay_mismatch on is_error', async () => {
    const { record, events } = await trial((e) => {
      (e as { is_error: boolean }).is_error = true;
    });
    const read = firstRead(events);
    expect(record).toMatchObject({ status: 'ENV_ERROR', detail: 'replay_mismatch' });
    expect((events.findLast((e) => e.type === 'error') as { message: string }).message).toBe(`replay: call 1 (${read.name}, ${read.tool_use_id}) gave is_error false, recorded true`);
  });

  it('gradeTrajectory compares results only with compareResults; without it the replayed state decides, as for a regrade', async () => {
    const { record, events } = await trial();
    const tampered = events.map((e) => (e === firstRead(events) ? { ...e, content: { changed: true } } : e));
    const opts = { tasks: nodeTaskSource({ testMode: true }), world: { read: async () => WORLD }, checks: CHECKS, events: tampered, record };
    expect((await gradeTrajectory('_toy', opts)).outcome).toBe('PASS');
    const compared = await gradeTrajectory('_toy', { ...opts, compareResults: true });
    expect(compared.outcome).toBe('GRADER_ERROR');
    expect(compared.error!.message).toMatch(/^regrade: replay: call 1 \(\w+, \S+\) gave a different result: at \S+, recorded .+, replayed .+$/);
    expect((await gradeTrajectory('_toy', { ...opts, events, compareResults: true })).outcome).toBe('PASS');
  });
});
