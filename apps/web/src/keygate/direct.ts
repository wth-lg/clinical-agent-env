// The key gate on browser-direct: the design's one-call check from the tab. One Messages call
// (effort low, 16 output tokens) through MessagesClient, metered by the tab ledger and admitted
// against the session cap first; one attempt, no retry. The client sends through the hosted
// relay (HOSTED_CLIENT_OPTIONS, P16h), which forwards it to the API server to server. A 200 proves
// the relay, the key and model access at once. When the relay cannot be reached, limits the page
// or fails, the gate points to the local runner instead.
import { ApiError, MessagesClient, reserveRequest, type MessageParam, type MessageParams } from '../../../../packages/core/anthropic.ts';
import { worstCaseUsd } from '../../../../packages/core/cost.ts';
import { SpendRefused } from '../../../../packages/core/ledger.ts';
import { tabLedger } from '../adapters/ledger-browser.ts';
import { HOSTED_CLIENT_OPTIONS } from '../surface/relay.ts';
import { admitTrial } from '../spend/cap.ts';
import { refreshSpent } from '../spend/session.ts';
import type { DirectFailure } from './failure.ts';

const TRIAL = 'validate';
const history = (): MessageParam[] => [{ role: 'user', content: 'Reply with the word ok.' }];
const PARAMS: MessageParams = { max_tokens: 16, output_config: { effort: 'low' } };

export type DirectResult = { ok: true } | ({ ok: false } & DirectFailure);

export const validateEstimate = (): number => worstCaseUsd(reserveRequest(history(), PARAMS, TRIAL));

export async function validateDirect(apiKey: string, cap: number): Promise<DirectResult> {
  const ledger = tabLedger();
  const estimate = validateEstimate();
  const admitted = admitTrial({ cap, spent: await refreshSpent(), estimate });
  if (!admitted.ok) return { ok: false, kind: 'cap', message: admitted.reason };
  let grant;
  try {
    grant = await ledger.batchStart(estimate);
  } catch (e) {
    return { ok: false, kind: 'cap', message: (e as Error).message };
  }
  try {
    const client = new MessagesClient({ grant, ledger, apiKey, maxAttempts: 1, trial: TRIAL, ...HOSTED_CLIENT_OPTIONS });
    await client.send(history(), PARAMS);
    return { ok: true };
  } catch (e) {
    return classify(e);
  } finally {
    await grant.close();
    await refreshSpent();
  }
}

function classify(e: unknown): DirectResult & { ok: false } {
  const message = (e as Error).message;
  if (e instanceof SpendRefused) return { ok: false, kind: 'cap', message };
  // No status: the browser never got a readable response from the relay (down, blocked, or a
  // refused CORS preflight, which looks the same to the page).
  if (e instanceof ApiError && e.status === null && e.partial) return { ok: false, kind: 'relay', reason: 'unreachable', message };
  // A 429 or 5xx through the relay: its own limit or fixed 502, or the API's answer passed through.
  if (e instanceof ApiError && e.status === 429) return { ok: false, kind: 'relay', reason: 'limited', message };
  if (e instanceof ApiError && e.status !== null && e.status >= 500) return { ok: false, kind: 'relay', reason: 'unavailable', message };
  return { ok: false, kind: 'api', status: e instanceof ApiError ? e.status : null, message };
}
