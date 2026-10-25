// MessagesClient at a named endpoint (P16g): the relay gets the same one Request, body bytes,
// headers and ledger rows as the API, and an endpoint that could leak the key or meter a
// different call throws when the client is built.
import { describe, expect, it } from 'vitest';
import { fakeKey } from '../../../scripts/test/helpers.ts';
import { MessagesClient, type MessageParam, type Transport } from '../anthropic.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';

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

const sse = (events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const OK = sse([
  { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'done' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
]);

const PARAMS = { max_tokens: 1024, output_config: { effort: 'low' } };
const user = (): MessageParam[] => [{ role: 'user', content: 'hello' }];

// One client over a fresh in-memory ledger and a transport that records each Request it gets.
async function client(endpoint?: string) {
  const store = new MemoryStore();
  admitStore(store);
  let n = 0;
  const ledger = createLedger({ store, clock: { now: () => 't' }, newId: () => `id-${++n}`, source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
  const grant = await ledger.batchStart(1);
  const sends: Array<{ url: string; headers: string[]; body: Uint8Array }> = [];
  const fetch: Transport = async (req) => {
    sends.push({ url: req.url, headers: [...req.headers.keys()], body: new Uint8Array(await req.arrayBuffer()) });
    return new Response(OK, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  const build = () => new MessagesClient({ grant, ledger, apiKey: fakeKey(), fetch, maxAttempts: 1, ...(endpoint === undefined ? {} : { endpoint }) });
  return { store, sends, build };
}

const ledgerRows = (store: MemoryStore) => store.rows.filter((r) => r.kind === 'reserve' || r.kind === 'settle');

describe('a client with a relay endpoint', () => {
  it('sends exactly one Request to that URL, with the default endpoint\'s body bytes, header names and ledger rows', async () => {
    const relay = await client('https://relay.test/v1/messages');
    const api = await client();
    await relay.build().send(user(), PARAMS);
    await api.build().send(user(), PARAMS);
    expect(relay.sends.map((s) => s.url)).toEqual(['https://relay.test/v1/messages']);
    expect(api.sends).toHaveLength(1);
    expect(new URL(api.sends[0]!.url).hostname).not.toBe('relay.test');
    expect(relay.sends[0]!.body).toEqual(api.sends[0]!.body);
    expect(relay.sends[0]!.headers).toEqual(api.sends[0]!.headers);
    expect(ledgerRows(relay.store).map((r) => r.kind)).toEqual(['reserve', 'settle']);
    expect(ledgerRows(relay.store)).toEqual(ledgerRows(api.store));
  });

  it.each(['http://127.0.0.1:8787/v1/messages', 'http://localhost:8787/v1/messages', 'http://[::1]:8787/v1/messages', 'http://localhost/v1/messages'])(
    'accepts the loopback endpoint %s and sends exactly one Request to it',
    async (endpoint) => {
      const t = await client(endpoint);
      await t.build().send(user(), PARAMS);
      expect(t.sends.map((s) => s.url)).toEqual([endpoint]);
    },
  );

  it.each([
    // plain http off loopback
    'http://relay.test/v1/messages',
    'http://localhost.evil.example/v1/messages',
    'http://127.0.0.1.evil.example/v1/messages',
    'http://10.0.0.1/v1/messages',
    // another path
    'http://127.0.0.1:8787/v1/models',
    'https://relay.test/v1/models',
    'https://relay.test/v1/messages/',
    'https://relay.test/v1/%6Dessages',
    'https://relay.test/',
    // a query or a fragment, even an empty one
    'https://relay.test/v1/messages?x=1',
    'https://relay.test/v1/messages?',
    'https://relay.test/v1/messages#f',
    'http://127.0.0.1:8787/v1/messages?x=1',
    'http://localhost:8787/v1/messages#f',
    // credentials
    'https://user:pass@relay.test/v1/messages',
    'https://user@relay.test/v1/messages',
    'http://user:pass@127.0.0.1:8787/v1/messages',
    // another scheme, or not an absolute URL
    'wss://relay.test/v1/messages',
    'ftp://relay.test/v1/messages',
    '/v1/messages',
    'relay.test/v1/messages',
    '',
  ])('throws at construction for %j, before any reserve or send', async (endpoint) => {
    const t = await client(endpoint);
    expect(t.build).toThrow(TypeError);
    expect(ledgerRows(t.store)).toEqual([]);
    expect(t.sends).toEqual([]);
  });

  it('a refused endpoint is not echoed, so credentials in it never reach a log line', async () => {
    const t = await client('https://user:hunter2@relay.test/v1/messages');
    expect(t.build).toThrow(/endpoint/);
    expect(t.build).not.toThrow(/hunter2/);
  });
});
