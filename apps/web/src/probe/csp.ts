// What probe.html's own CSP adds to the design connect-src for the relay mode (P16h): any port on
// 127.0.0.1, where apps/relay/test/serve-local.ts runs the relay in local mode, and the deployed
// relay's origin. e2e/smoke.spec.ts builds the probe CSP from the design CSP and this list.
export const PROBE_RELAY_ORIGIN = 'https://clinical-agent-env-relay.vercel.app';
export const PROBE_RELAY_SOURCES = ['http://127.0.0.1:*', PROBE_RELAY_ORIGIN] as const;
