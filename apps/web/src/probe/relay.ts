// The relay test page (plan phase P16h), for the real-browser relay check
// (e2e/xbrowser/relay-browser.spec.ts). relay-probe.html?relay=<relay Messages URL> builds a
// MessagesClient in the page with P16g's endpoint option set to that URL and installs the egress
// guard with the relay origin metered and only the page's own origin allowed besides it, so the
// browser sends the client's real headers through a real CORS preflight, and nothing but the
// client's registered Request reaches the relay. The key comes in as a page.evaluate argument,
// never in the URL; the grant comes from an in-memory ledger (no storage), and the outcome holds
// the status and the API's error type and message, never a header.
import { ApiError, MessagesClient } from '../../../../packages/core/anthropic.ts';
import type { EgressOptions } from '../../../../packages/core/egress.ts';
import { redactText } from '../../../../packages/core/redact.ts';
import { memoryLedger } from '../adapters/ledger-browser.ts';
import { PROBE_PARAMS, probeHistory, probeProjection } from './request.ts';

export type RelayOutcome =
  | { ok: true; status: number; model: string; stop_reason: string | null; attempts: number }
  | { ok: false; status: number | null; type: string | null; message: string };

// The relay URL in the page's query, or null when the page is not in relay mode.
export function relayEndpoint(search: string): string | null {
  return new URLSearchParams(search).get('relay');
}

// The guard options for this page: none in the default mode; in relay mode the relay origin is
// metered and the page's own origin is the only other one allowed.
export function relayGuardOptions(location: { search: string; origin: string }): EgressOptions {
  const relay = relayEndpoint(location.search);
  if (relay === null) return {};
  return { meteredOrigins: [new URL(relay).origin], allowedOrigins: [location.origin] };
}

export async function relayCall(endpoint: string, apiKey: string): Promise<RelayOutcome> {
  const ledger = memoryLedger();
  const grant = await ledger.batchStart(probeProjection());
  try {
    const client = new MessagesClient({ grant, ledger, apiKey, endpoint, maxAttempts: 1, trial: 'probe:relay' });
    const r = await client.send(probeHistory(), PROBE_PARAMS);
    return { ok: true, status: r.status, model: r.message.model, stop_reason: r.message.stop_reason, attempts: r.attempts };
  } catch (e) {
    const message = redactText(e instanceof Error ? `${e.name}: ${e.message}` : String(e), [apiKey]);
    return e instanceof ApiError ? { ok: false, status: e.status, type: e.errorType, message } : { ok: false, status: null, type: null, message };
  } finally {
    await grant.close();
  }
}
