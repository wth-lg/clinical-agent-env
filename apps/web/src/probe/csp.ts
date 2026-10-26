// What relay-probe.html's own CSP adds to probe.html's connect-src (P16h): any port on 127.0.0.1,
// where apps/relay/test/serve-local.ts runs the relay in local mode, and the deployed relay's
// origin, RELAY_ORIGIN from surface/relay.ts. e2e/smoke.spec.ts builds that CSP from probe.html's
// and this list.
import { RELAY_ORIGIN } from '../surface/relay.ts';

export const RELAY_PROBE_ORIGIN = RELAY_ORIGIN;
export const RELAY_PROBE_SOURCES = ['http://127.0.0.1:*', RELAY_PROBE_ORIGIN] as const;
