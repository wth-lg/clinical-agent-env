// pnpm cli relay-check (plan phase P16h): its keyless checks pass against the relay served by
// apps/relay/test/serve-local.ts with the Pages origin and a stub upstream that answers the API's
// 401 authentication_error; they fail against a relay that drops the origin check; the sentinel key
// is never printed and sits in a 0600 file relay-check names; --rate-limit sees a 429 and recovers.
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { authFailUpstream, serveLocal, type LocalRelay } from '../../apps/relay/test/serve-local.ts';
import { createLimiter } from '../../apps/relay/src/limiter.ts';
import { repoRoot } from '../../scripts/test/helpers.ts';
import { maxRequestBody } from '../../scripts/relay-body-max.ts';
import { clientHeaderNames } from '../relay-check.ts';

const PAGES = 'https://wth-lg.github.io';
let relay: LocalRelay | undefined;
afterEach(async () => {
  await relay?.close();
  relay = undefined;
});

// Async, so the relay in this process keeps serving while relay-check runs.
function relayCheck(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(repoRoot, 'cli/index.ts'), 'relay-check', ...args], { cwd: repoRoot, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d));
    child.stderr.on('data', (d: Buffer) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

interface Report {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; status: number | null; detail: string }>;
  canary: { nonce: string; x_vercel_id: string | null; ts: string };
  invoking: string[];
  not_invoking: string[];
  sentinel_file: string;
  body_bytes: number;
}

describe('relay-check', () => {
  it('reads the client header set from the client', async () => {
    expect(await clientHeaderNames()).toEqual(['anthropic-dangerous-direct-browser-access', 'anthropic-version', 'content-type', 'x-api-key']);
  });

  it('passes against a correct relay, never prints the sentinel and names its 0600 file', async () => {
    relay = await serveLocal({ allowedOrigin: PAGES, upstream: authFailUpstream() });
    const r = await relayCheck(['--url', relay.url, '--json']);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    const report = JSON.parse(r.stdout) as Report;
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual([
      'canary GET /v1/messages 405', 'foreign Origin 403', 'no Origin 403', '/v1/models 404', 'preflight 204', 'other model 400', 'body of B x 1.1 bytes not 413', 'Pages-origin POST gets the API 401',
    ]);
    expect(report.canary.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(report.invoking).toHaveLength(7);
    expect(report.not_invoking).toEqual(['POST /v1/models']);
    const key = readFileSync(report.sentinel_file, 'utf8').trim();
    expect(key.length).toBeGreaterThan(20);
    expect(statSync(report.sentinel_file).mode & 0o777).toBe(0o600);
    expect(r.stdout + r.stderr).not.toContain(key);
    // The relay saw the canary (its log is what the deployed check reads from Vercel), and the
    // upstream saw the sentinel only in the forwarded requests.
    expect(relay.log.some((e) => e.method === 'GET' && e.canary === report.canary.nonce && e.status === 405)).toBe(true);
    expect(report.body_bytes).toBe(Math.ceil(maxRequestBody().bytes * 1.1));
    for (const call of relay.upstreamCalls) expect(call.headers['x-api-key']).toBe(key);
  }, 120_000);

  it('the human-readable report prints the canary and which requests invoke the function', async () => {
    relay = await serveLocal({ allowedOrigin: PAGES, upstream: authFailUpstream() });
    const r = await relayCheck(['--url', relay.url]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/canary nonce [0-9a-f]{32}/);
    expect(r.stdout).toMatch(/x-vercel-id/);
    expect(r.stdout).toMatch(/invoke the function \(7\)/);
    expect(r.stdout).toMatch(/sentinel key file /);
  }, 120_000);

  it('fails against a relay that serves another origin', async () => {
    relay = await serveLocal({ allowedOrigin: 'https://evil.example', upstream: authFailUpstream() });
    const r = await relayCheck(['--url', relay.url, '--json']);
    expect(r.status).toBe(1);
    const report = JSON.parse(r.stdout) as Report;
    expect(report.checks.find((c) => c.name === 'foreign Origin 403')!.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'preflight 204')!.ok).toBe(false);
  }, 120_000);

  it('--rate-limit sees a 429 and then a non-429 answer after the window', async () => {
    relay = await serveLocal({ allowedOrigin: PAGES, upstream: authFailUpstream(), limiter: createLimiter({ limit: 20, windowMs: 2000 }) });
    const r = await relayCheck(['--url', relay.url, '--rate-limit', '--json']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const report = JSON.parse(r.stdout) as Report & { rate_limit: { first_429_after: number; recovered: boolean } };
    expect(report.rate_limit.first_429_after).toBeGreaterThan(0);
    expect(report.rate_limit.recovered).toBe(true);
    expect(relay.upstreamCalls).toHaveLength(0);
  }, 120_000);

  it('usage errors exit 2', async () => {
    expect((await relayCheck([])).status).toBe(2);
    expect((await relayCheck(['--url', 'not a url'])).status).toBe(2);
    expect((await relayCheck(['--url', 'http://example.com/v1/messages'])).status).toBe(2);
  });
});
