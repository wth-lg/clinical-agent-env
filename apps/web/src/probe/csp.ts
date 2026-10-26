// What relay-probe.html's own CSP adds to the design connect-src (P16h): any port on 127.0.0.1,
// where apps/relay/test/serve-local.ts runs the relay in local mode, and the deployed relay's
// origin. e2e/smoke.spec.ts builds that CSP from the design CSP and this list; every other page,
// probe.html included, keeps the design CSP.
export const RELAY_PROBE_ORIGIN = 'https://clinical-agent-env-relay.vercel.app';
export const RELAY_PROBE_SOURCES = ['http://127.0.0.1:*', RELAY_PROBE_ORIGIN] as const;
