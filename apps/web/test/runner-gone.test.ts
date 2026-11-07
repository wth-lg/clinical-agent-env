// Gate P25U-S4 F2: before the live card says the runner stopped, the page probes api/health more
// than once, with a longer timeout than the first load's, so a health answer that is slow under
// load (a transient stream drop while the runner is alive) never ends a running card.
import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../../../packages/core/runner-api.ts';
import { HEALTH_TIMEOUT_MS, runnerGone, RUNNER_GONE_PROBES, RUNNER_GONE_TIMEOUT_MS } from '../src/surface/probe.ts';

const BASE = 'http://127.0.0.1:4850/';
const ok = () => Promise.resolve(new Response(JSON.stringify(SAMPLES.health), { status: 200, headers: { 'content-type': 'application/json' } }));
const refused = () => Promise.reject(new TypeError('Failed to fetch'));

describe('runnerGone', () => {
  it('probes at least twice, each with a longer timeout than the first load', () => {
    expect(RUNNER_GONE_PROBES).toBeGreaterThanOrEqual(2);
    expect(RUNNER_GONE_TIMEOUT_MS).toBeGreaterThan(HEALTH_TIMEOUT_MS);
  });

  it('is true only when every probe fails', async () => {
    let calls = 0;
    const fetchFn = (() => (calls++, refused())) as unknown as typeof fetch;
    expect(await runnerGone(BASE, fetchFn, 50, 0)).toBe(true);
    expect(calls).toBe(RUNNER_GONE_PROBES);
  });

  it('is false when a later probe answers as the runner', async () => {
    let calls = 0;
    const fetchFn = (() => (calls++ === 0 ? refused() : ok())) as unknown as typeof fetch;
    expect(await runnerGone(BASE, fetchFn, 50, 0)).toBe(false);
    expect(calls).toBe(2);
  });

  it('is false when the runner answers slower than the first load\'s timeout but within the probe\'s', async () => {
    const slow = (() => new Promise<Response>((resolve) => setTimeout(() => void ok().then(resolve), HEALTH_TIMEOUT_MS + 100))) as unknown as typeof fetch;
    expect(await runnerGone(BASE, slow, HEALTH_TIMEOUT_MS + 2000, 0)).toBe(false);
  }, 10_000);
});
