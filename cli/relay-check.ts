// pnpm cli relay-check --url <RELAY_URL> [--rate-limit] [--json]
// Keyless checks of a deployed relay (plan phase P16h, apps/relay). RELAY_URL is the relay's
// origin or its /v1/messages URL; https, or plain http on 127.0.0.1 (apps/relay/test/serve-local.ts).
// It holds no real key: the key it sends is a sentinel built at run time, never printed, and
// written to a 0600 temp file it names, for `pnpm keyscan` over the Vercel log capture. In order:
//   canary            GET /v1/messages, no key, x-relay-canary: <nonce>: 405. vercel.json routes
//                     it to the function, so it shows in the function logs; the nonce, the
//                     answer's x-vercel-id and the time are printed for the log non-vacuity check
//   foreign Origin    POST from https://evil.example: 403
//   no Origin         POST with no Origin: 403
//   /v1/models        POST from the Pages origin: 404 (unrouted: it never reaches the function)
//   preflight         OPTIONS from the Pages origin asking for the client's header set
//                     (clientHeaderNames) and POST: 204, allow-origin exactly the Pages origin,
//                     allow-methods exactly POST, OPTIONS, allow-headers covering the set
//   other model       POST of a valid body for another model: 400
//   body B x 1.1      POST of ceil(B x 1.1) bytes (B from scripts/relay-body-max.ts): not 413
//   API 401           POST from the Pages origin with the sentinel key: the API's 401
//                     authentication_error, with the allow-origin header
// It prints which requests invoke the function (those to /v1/messages) and which do not.
//   --rate-limit  instead: GET /v1/messages in bursts until a 429 (within 60 s), then once a second
//                 until a non-429 answer (within 90 s)
//   --json        one JSON report instead of lines
// Exit 0 when every check holds; 1 otherwise; 2 on a usage error.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { maxRequestBody } from '../scripts/relay-body-max.ts';
import { ANTHROPIC_VERSION, MessagesClient, MODEL } from '../packages/core/anthropic.ts';
import { redactText } from '../packages/core/redact.ts';
import { openNodeLedger } from './adapters/ledger-node.ts';

const USAGE = 'usage: pnpm cli relay-check --url <RELAY_URL> [--rate-limit] [--json]';
export const PAGES_ORIGIN = 'https://wth-lg.github.io';
const FOREIGN_ORIGIN = 'https://evil.example';
const OTHER_MODEL = 'claude-sonnet-5-5';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TIMEOUT_MS = 30_000;

// The header names the hosted MessagesClient sends, read from a real client: it is built over a
// ledger in a temp HOME (default mode, deleted afterwards) and its one Request is answered by a
// transport here, so nothing leaves the process and no real ledger gets a row.
export async function clientHeaderNames(): Promise<string[]> {
  const home = mkdtempSync(join(tmpdir(), 'relay-headers-'));
  try {
    const { ledger } = openNodeLedger({ transport: 'offline', env: { HOME: home } });
    const grant = await ledger.batchStart(1);
    let names: string[] = [];
    const client = new MessagesClient({
      grant, ledger, apiKey: 'header-probe', maxAttempts: 1,
      fetch: async (request) => {
        names = [...request.headers.keys()];
        return new Response('{}', { status: 400 });
      },
    });
    try {
      await client.send([{ role: 'user', content: 'x' }], { max_tokens: 1 });
    } catch {
      // the 400 above: the Request was all this needed
    }
    await grant.close();
    return names.sort();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

interface Check {
  name: string;
  ok: boolean;
  status: number | null;
  detail: string;
}

const headerList = (v: string | null) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const messagesBody = (model: string, content = 'ping') => JSON.stringify({ model, max_tokens: 1, stream: true, messages: [{ role: 'user', content }] });

// A valid Messages body of exactly n bytes (n at least the size of an empty one).
function bodyOfBytes(n: number): string {
  const base = messagesBody(MODEL, '');
  if (n < base.length) throw new Error(`a body cannot be ${n} bytes`);
  return messagesBody(MODEL, 'x'.repeat(n - base.length));
}

function relayUrls(raw: string): { messages: string; models: string } | string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `--url ${raw} is not a URL`;
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))) return '--url must be https, or http on 127.0.0.1, localhost or [::1]';
  return { messages: `${url.origin}/v1/messages`, models: `${url.origin}/v1/models` };
}

async function call(url: string, init: RequestInit): Promise<{ res: Response | null; text: string; error: string | null }> {
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { res, text: await res.text(), error: null };
  } catch (e) {
    return { res: null, text: '', error: `${(e as Error).name}: ${(e as Error).message}` };
  }
}

const keyHeaders = (key: string, origin: string | null): Record<string, string> => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': ANTHROPIC_VERSION,
  ...(origin === null ? {} : { origin }),
});

async function checks(urls: { messages: string; models: string }, key: string, bodyBytes: number, clientHeaders: string[]) {
  const out: Check[] = [];
  const push = (name: string, r: Awaited<ReturnType<typeof call>>, ok: boolean, detail = '') =>
    out.push({ name, ok: ok && r.error === null, status: r.res?.status ?? null, detail: redactText(r.error ?? detail, [key]) });

  const nonce = randomBytes(16).toString('hex');
  const ts = new Date().toISOString();
  const canary = await call(urls.messages, { method: 'GET', headers: { 'x-relay-canary': nonce } });
  push('canary GET /v1/messages 405', canary, canary.res?.status === 405);

  const post = (origin: string | null, body = messagesBody(MODEL), url = urls.messages) => call(url, { method: 'POST', headers: keyHeaders(key, origin), body });
  const foreign = await post(FOREIGN_ORIGIN);
  push('foreign Origin 403', foreign, foreign.res?.status === 403 && foreign.res.headers.get('access-control-allow-origin') === null);
  const none = await post(null);
  push('no Origin 403', none, none.res?.status === 403);
  const models = await post(PAGES_ORIGIN, messagesBody(MODEL), urls.models);
  push('/v1/models 404', models, models.res?.status === 404);

  const pre = await call(urls.messages, {
    method: 'OPTIONS',
    headers: { origin: PAGES_ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': clientHeaders.join(',') },
  });
  const allowed = headerList(pre.res?.headers.get('access-control-allow-headers') ?? null);
  const missing = clientHeaders.filter((h) => !allowed.includes(h));
  const preOk =
    pre.res?.status === 204 &&
    pre.res.headers.get('access-control-allow-origin') === PAGES_ORIGIN &&
    pre.res.headers.get('access-control-allow-methods') === 'POST, OPTIONS' &&
    missing.length === 0;
  push('preflight 204', pre, preOk, `allow-origin ${pre.res?.headers.get('access-control-allow-origin')}; allow-methods ${pre.res?.headers.get('access-control-allow-methods')}; allow-headers ${allowed.join(',')}${missing.length ? `; missing ${missing.join(',')}` : ''}`);

  const other = await post(PAGES_ORIGIN, messagesBody(OTHER_MODEL));
  push('other model 400', other, other.res?.status === 400);
  const big = await post(PAGES_ORIGIN, bodyOfBytes(bodyBytes));
  push('body of B x 1.1 bytes not 413', big, big.res !== null && big.res.status !== 413, `${bodyBytes} bytes`);

  const auth = await post(PAGES_ORIGIN);
  let type: string | null = null;
  try {
    type = (JSON.parse(auth.text) as { error?: { type?: string } }).error?.type ?? null;
  } catch {
    // not JSON: the check fails on the type below
  }
  push('Pages-origin POST gets the API 401', auth, auth.res?.status === 401 && type === 'authentication_error' && auth.res.headers.get('access-control-allow-origin') === PAGES_ORIGIN, `error type ${type}`);

  return {
    checks: out,
    canary: { nonce, x_vercel_id: canary.res?.headers.get('x-vercel-id') ?? null, ts },
    invoking: ['GET /v1/messages (canary)', 'POST /v1/messages (foreign Origin)', 'POST /v1/messages (no Origin)', 'OPTIONS /v1/messages', 'POST /v1/messages (other model)', 'POST /v1/messages (B x 1.1)', 'POST /v1/messages (API 401)'],
    not_invoking: ['POST /v1/models'],
  };
}

async function rateLimit(url: string): Promise<{ check: Check; first_429_after: number; recovered: boolean }> {
  const started = Date.now();
  let sent = 0;
  let first = 0;
  while (first === 0 && Date.now() - started < 60_000) {
    const burst = await Promise.all(Array.from({ length: 20 }, () => call(url, { method: 'GET' })));
    for (const r of burst) {
      sent++;
      if (first === 0 && r.res?.status === 429) first = sent;
    }
  }
  let recovered = false;
  const after = Date.now();
  while (first > 0 && !recovered && Date.now() - after < 90_000) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await call(url, { method: 'GET' });
    recovered = r.res !== null && r.res.status !== 429;
  }
  const detail = first > 0 ? `first 429 after ${first} requests in ${after - started} ms; ${recovered ? `a non-429 answer ${Date.now() - after} ms later` : 'no non-429 answer within 90 s'}` : 'no 429 within 60 s';
  return { check: { name: 'rate limit: 429, then a non-429 answer', ok: first > 0 && recovered, status: null, detail }, first_429_after: first, recovered };
}

export default async function relayCheck(args: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { url: { type: 'string' }, 'rate-limit': { type: 'boolean', default: false }, json: { type: 'boolean', default: false } } }));
  } catch (e) {
    process.stderr.write(`relay-check: ${(e as Error).message}\n${USAGE}\n`);
    return 2;
  }
  if (values.url === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const urls = relayUrls(values.url);
  if (typeof urls === 'string') {
    process.stderr.write(`relay-check: ${urls}\n${USAGE}\n`);
    return 2;
  }
  const print = (report: object, lines: string[]) => process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : `${lines.join('\n')}\n`);
  const line = (c: Check) => `${c.ok ? 'PASS' : 'FAIL'} ${c.name}: status ${c.status ?? '-'}${c.detail ? `; ${c.detail}` : ''}`;

  if (values['rate-limit']) {
    const r = await rateLimit(urls.messages);
    print({ ok: r.check.ok, checks: [r.check], rate_limit: { first_429_after: r.first_429_after, recovered: r.recovered } }, [line(r.check)]);
    return r.check.ok ? 0 : 1;
  }

  const key = ['sk', 'ant', 'api03', 'relaycheck', randomBytes(24).toString('base64url')].join('-');
  const sentinelFile = join(mkdtempSync(join(tmpdir(), 'relay-check-')), 'sentinel-key');
  writeFileSync(sentinelFile, `${key}\n`, { mode: 0o600 });
  const bodyBytes = Math.ceil(maxRequestBody().bytes * 1.1);
  const r = await checks(urls, key, bodyBytes, await clientHeaderNames());
  const ok = r.checks.every((c) => c.ok);
  print({ ok, ...r, sentinel_file: sentinelFile, body_bytes: bodyBytes }, [
    `relay-check ${urls.messages}`,
    `canary nonce ${r.canary.nonce}; x-vercel-id ${r.canary.x_vercel_id ?? '(none)'}; sent ${r.canary.ts}`,
    ...r.checks.map(line),
    `requests that invoke the function (${r.invoking.length}): ${r.invoking.join('; ')}`,
    `requests that do not (unrouted): ${r.not_invoking.join('; ')}`,
    `sentinel key file ${sentinelFile} (0600; the key is not printed)`,
    ok ? 'relay-check: every check passed' : 'relay-check: FAILED',
  ]);
  return ok ? 0 : 1;
}
