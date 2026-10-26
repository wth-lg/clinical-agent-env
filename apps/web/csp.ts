// The app's Content-Security-Policy, written once (P16h PR-web-1, UD-4). The Vite build writes it
// into index.html (vite.config.ts), and every file that pins the CSP imports it: the e2e specs,
// the no-direct-anthropic rule's test, the egress-guard plants, the runner tests and
// cli/runner-check.ts. connect-src allows the page's own origin and the hosted relay (PR-web-2),
// whose origin comes from src/surface/relay.ts, the one file that writes the relay host; the
// page never reaches the API host itself. The test pages (probe.html, harness.html,
// relay-probe.html) keep their own CSP meta. worker-src blob: lets the trial Worker start from a
// blob: URL, so this policy binds it too (src/live/transport/worker.ts).
import { RELAY_ORIGIN } from './src/surface/relay.ts';

export const APP_CSP = `default-src 'self'; connect-src 'self' ${RELAY_ORIGIN}; script-src 'self'; worker-src 'self' blob:`;

// The one origin connect-src allows besides 'self'.
export const CONNECT_ORIGIN = RELAY_ORIGIN;
