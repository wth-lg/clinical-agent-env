// The api/health probe, with no DOM reference, so apps/web/test/runner-gone.test.ts can load it
// under the root tsconfig (no DOM types): probeHealth is one GET of HEALTH_PATH against a base
// URL with a timeout; runnerGone (P25u A2; gate P25U-S4 F2) is RUNNER_GONE_PROBES of them, each
// with a timeout longer than the first load's and a short gap between them, true only when
// every one fails, so a slow answer under load or one transient drop never ends a running card.
// surface/detect.ts wraps both with the page's base URL.
import { HEALTH_PATH, parseHealth, type Health } from '../../../../packages/core/runner-api.ts';

export const HEALTH_TIMEOUT_MS = 1500;
export const RUNNER_GONE_PROBES = 2;
export const RUNNER_GONE_TIMEOUT_MS = 4000;
export const RUNNER_GONE_GAP_MS = 500;

export type Surface = { kind: 'local-runner'; health: Health } | { kind: 'browser-direct' };

export async function probeHealth(base: string, fetchFn: typeof fetch, timeoutMs: number): Promise<Surface> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(new URL(HEALTH_PATH, base), { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
    if (res.status !== 200) return { kind: 'browser-direct' };
    return { kind: 'local-runner', health: parseHealth(JSON.parse(await res.text())) };
  } catch {
    return { kind: 'browser-direct' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runnerGone(base: string, fetchFn: typeof fetch, timeoutMs = RUNNER_GONE_TIMEOUT_MS, gapMs = RUNNER_GONE_GAP_MS): Promise<boolean> {
  for (let i = 0; i < RUNNER_GONE_PROBES; i++) {
    if (i > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    if ((await probeHealth(base, fetchFn, timeoutMs)).kind === 'local-runner') return false;
  }
  return true;
}
