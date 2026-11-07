// Which surface this page is on, decided once at load. The local runner serves the UI and
// answers a same-origin GET api/health with a body parseHealth accepts. The path is resolved
// against the page's base URL, so it reaches the runner wherever it serves the UI: served at its
// root, that is /api/health. The static build answers with its own api/health file, which is
// not clinenv-runner; any other answer, an error or no answer within the timeout also means
// browser-direct, except on the runner's own page (below). Only the local runner is ever sent
// the key (keygate/runner.ts). The body is parsed from its text: a static host may serve the
// extensionless file under any content type. The probe itself is surface/probe.ts, which has no
// DOM reference, so the Node tests can load it.
import { HEALTH_TIMEOUT_MS, probeHealth, runnerGone as probeRunnerGone, type Surface } from './probe.ts';

export { HEALTH_TIMEOUT_MS, RUNNER_GONE_GAP_MS, RUNNER_GONE_PROBES, RUNNER_GONE_TIMEOUT_MS, type Surface } from './probe.ts';

export async function detectSurface(base = document.baseURI, fetchFn: typeof fetch = fetch, timeoutMs = HEALTH_TIMEOUT_MS): Promise<Surface> {
  return probeHealth(base, fetchFn, timeoutMs);
}

// Whether the runner's process is gone, for a page the runner serves (P25u A2; gate P25U-S4
// F2): two probes with a longer timeout than the first load's, true only when both fail.
export const runnerGone = (base = document.baseURI, fetchFn: typeof fetch = fetch): Promise<boolean> => probeRunnerGone(base, fetchFn);

// The runner's own page carries the token meta that only the runner injects. There a failed,
// slow or unparseable health means the runner is not responding, never browser-direct: the
// runner's page must not start sending the key from the tab to the API. The caller shows that
// state and retries until the runner answers.
export type Detected = Surface | { kind: 'runner-down' };

export async function detect(runnerPage: boolean, base = document.baseURI): Promise<Detected> {
  const surface = await detectSurface(base);
  return runnerPage && surface.kind === 'browser-direct' ? { kind: 'runner-down' } : surface;
}

export const SURFACE_LABEL: Record<Surface['kind'], string> = {
  'local-runner': 'Local runner',
  'browser-direct': 'Hosted',
};
