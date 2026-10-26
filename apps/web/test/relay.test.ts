// The hosted relay wiring (P16h PR-web-2): src/surface/relay.ts is the one place the relay host is
// written, and the hosted clients and guards take it from there. The behaviour (every hosted call
// goes only to RELAY_URL, a planted fetch is refused) is in e2e/relay.spec.ts and
// scripts/test/egress-guard.test.ts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RELAY_PROBE_ORIGIN } from '../src/probe/csp.ts';
import { HOSTED_CLIENT_OPTIONS, hostedGuard, RELAY_ORIGIN, RELAY_URL } from '../src/surface/relay.ts';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

describe('the relay constants', () => {
  it('RELAY_URL is the planned production URL: https, the relay origin plus the Messages path', () => {
    expect(RELAY_ORIGIN).toBe('https://clinical-agent-env-relay.vercel.app');
    expect(RELAY_URL).toBe(`${RELAY_ORIGIN}/v1/messages`);
    const url = new URL(RELAY_URL);
    expect(url.protocol).toBe('https:');
    expect(url.origin).toBe(RELAY_ORIGIN);
    expect(url.href).toBe(`${url.origin}/v1/messages`);
  });

  it('the hosted client sends to RELAY_URL through the endpoint option', () => {
    expect(HOSTED_CLIENT_OPTIONS).toEqual({ endpoint: RELAY_URL });
  });

  it('the hosted guard meters the relay and allows only the scope origin and the relay', () => {
    expect(hostedGuard('https://wth-lg.github.io')).toEqual({ allowedOrigins: ['https://wth-lg.github.io', RELAY_ORIGIN], meteredOrigins: [RELAY_ORIGIN] });
  });

  it('the relay probe page names the same relay', () => {
    expect(RELAY_PROBE_ORIGIN).toBe(RELAY_ORIGIN);
  });

  it.each(['keygate/direct.ts', 'live/transport/worker.ts'])('%s builds its client with HOSTED_CLIENT_OPTIONS', (file) => {
    expect(readFileSync(join(src, file), 'utf8')).toMatch(/\.\.\.HOSTED_CLIENT_OPTIONS\b/);
  });
});
