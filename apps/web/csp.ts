// The app's Content-Security-Policy, written once (P16h PR-web-1, UD-4). The Vite build writes it
// into index.html (vite.config.ts), and every file that pins the CSP imports it: the e2e specs,
// the no-direct-anthropic rule and its test, the egress-guard plants, the runner tests and
// cli/runner-check.ts. The test pages (probe.html, harness.html, relay-probe.html) keep their own
// CSP meta. worker-src blob: lets the trial Worker start from a blob: URL, so this policy binds
// it too (src/live/transport/worker.ts). This exact literal is the one place outside
// packages/core/anthropic.ts that lint lets name the API host (no-direct-anthropic).
export const APP_CSP = "default-src 'self'; connect-src 'self' https://api.anthropic.com; script-src 'self'; worker-src 'self' blob:";

// The one origin connect-src allows besides 'self', read from APP_CSP so no other file names it.
export const CONNECT_ORIGIN = /connect-src 'self' (\S+);/.exec(APP_CSP)?.[1] ?? '';
