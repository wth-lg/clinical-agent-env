// The E4 sentence names the replay mismatch (plan phase P17j JG10, run-log follow-up C7 S1): a
// trial whose re-executed call gives another result than its recorded tool_result ends ENV_ERROR
// replay_mismatch (C7), and its explanation names the call's index in the tool log, the tool, and
// the field that differs with its recorded and replayed values (or is_error), instead of only the
// two state hashes. The toy trial runs for real; a test stands in for a nondeterministic tool by
// changing the recorded tool_result through onEvent, as replay-results.test.ts does.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scriptedTransport, SCENARIOS } from '../../../apps/web/src/harness/scenarios.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { MessagesClient } from '../anthropic.ts';
import type { ToolResultEvent, TrialEvent } from '../events.ts';
import { explainTrial, type ExplainRecord } from '../explain.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { run } from '../run.ts';

const root = new URL('../../../', import.meta.url);
const WORLD = new Uint8Array(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
const MANIFEST = JSON.parse(readFileSync(new URL('fixtures/manifest.json', root), 'utf8')) as { world: { state_hash: string } };
const DEFINITIONS = JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8'));

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
async function trial(tamper: (e: ToolResultEvent) => void) {
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
    now: () => clock, checks: [], judge: null,
    onEvent: (e) => {
      if (!tampered && e.type === 'tool_result' && e.executed && e.name !== 'finish') {
        tampered = true;
        tamper(e);
      }
    },
  });
}

const firstRead = (events: readonly TrialEvent[]) => events.find((e): e is ToolResultEvent => e.type === 'tool_result' && e.executed && e.name !== 'finish')!;
const explain = (record: unknown, events: readonly TrialEvent[]) => explainTrial(record as ExplainRecord, null, { events, world_state_hash: MANIFEST.world.state_hash });

describe('the E4 sentence names the replay mismatch', () => {
  it('a different result: the call index, the tool, the field and both values', async () => {
    const { record, events } = await trial((e) => {
      (e as { content: unknown }).content = { ...(e.content as object), extra: 'not what the tool returns' };
    });
    const read = firstRead(events);
    const e = explain(record, events);
    expect(e.fault).toBe('env');
    expect(e.deciding?.id).toBe('E4');
    expect(e.deciding?.evidence).toBe(`replay: call 1 (${read.name}, ${read.tool_use_id}) gave a different result: at extra, recorded "not what the tool returns", replayed absent`);
    expect(e.reason).toContain(`call 1 (${read.name}`);
    expect(e.reason).toContain('at extra');
  });

  it('a different is_error: the call index, the tool and both values', async () => {
    const { record, events } = await trial((e) => {
      (e as { is_error: boolean }).is_error = true;
    });
    const read = firstRead(events);
    expect(explain(record, events).deciding?.evidence).toBe(`replay: call 1 (${read.name}, ${read.tool_use_id}) gave is_error false, recorded true`);
  });

  // verifier JG10-1 F2: a key that only the prototype chain has on the other side (toString) is
  // absent there, not a function that has no JSON form.
  it('a key the other side has only on its prototype chain is absent there', async () => {
    const { record, events } = await trial((e) => {
      (e as { content: unknown }).content = { ...(e.content as object), toString: 'own key' };
    });
    const read = firstRead(events);
    expect(record).toMatchObject({ status: 'ENV_ERROR', detail: 'replay_mismatch' });
    expect(explain(record, events).deciding?.evidence).toBe(`replay: call 1 (${read.name}, ${read.tool_use_id}) gave a different result: at toString, recorded "own key", replayed absent`);
  });

  // decisions.tsv 2026-10-29T02:45 (verifier JG10-1 F3): a long value is cut by code points, so a
  // character outside the BMP (a surrogate pair in UTF-16) is never split.
  it('a long value is cut at 57 code points, never inside a surrogate pair', async () => {
    const long = `${'a'.repeat(55)}😀😀tail`;
    const { record, events } = await trial((e) => {
      (e as { content: unknown }).content = { ...(e.content as object), extra: long };
    });
    const evidence = explain(record, events).deciding?.evidence ?? '';
    const recorded = /recorded (.*), replayed absent$/.exec(evidence)?.[1] ?? '';
    expect(recorded).toBe(`${Array.from(JSON.stringify(long)).slice(0, 57).join('')}...`);
    expect(recorded).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('without the trajectory, E4 still reads the two state hashes', async () => {
    const { record } = await trial((e) => {
      (e as { is_error: boolean }).is_error = true;
    });
    expect(explain(record, []).deciding?.evidence).toMatch(/^final [0-9a-f]{64}, replay_final missing$/);
  });
});
