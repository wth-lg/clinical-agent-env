// What the key gate says about a failed Validate. Every failure starts with one plain sentence
// (lead), then what to do when there is something to do (next), then the API's or runner's own
// line (detail), which the gate shows in small mono; a line with the relay's words says so. A
// relay failure (P16h: the hosted site sends through the relay) sends the user to the local-run
// panel, which already shows the prerequisites and the command.
// The failure types live here, not in direct.ts or runner.ts, so this file imports nothing and
// its unit test does not pull browser code into a program without the DOM types.

// An api failure keeps the HTTP status (null when no response came back), which picks the first
// sentence.
export type DirectFailure =
  | { kind: 'cap'; message: string }
  | { kind: 'relay'; reason: RelayReason; message: string }
  | { kind: 'api'; status: number | null; message: string };
// Why a call through the relay failed: no readable answer came back, it answered 429 (its own
// limit or the API's, passed through), or it answered 5xx (its fixed 502 or the API's own) or
// broke off a stream (relayReason).
export type RelayReason = 'unreachable' | 'limited' | 'unavailable';
// cause says what went wrong with a local-runner call: no token in the page, no answer, a 200
// whose body did not parse, or an error status (with the runner's status and message).
export type RunnerFailure = { cause: 'no-token' | 'no-answer' | 'bad-body' | 'error'; message: string; status?: number; refusal?: string };

// format: a key that does not start with sk-ant-, stopped in the page before any call.
export type Failure = DirectFailure | (RunnerFailure & { kind: 'runner' }) | { kind: 'notice'; message: string } | { kind: 'format'; message: string };

// Every Anthropic API key starts with this; the gate checks it before Validate sends anything
// (pre-audit U10: a malformed key went to the network and came back as a network error).
export const KEY_PREFIX = 'sk-ant-';
export const keyFormatProblem = (key: string): Failure | null =>
  key.startsWith(KEY_PREFIX) ? null : { kind: 'format', message: `The key does not start with ${KEY_PREFIX}` };

export interface FailureText {
  lead: string;
  next?: string;
  detail?: string;
  // True when the next step is the local-run panel.
  local: boolean;
}

// The relay failures' sentences, fixed in docs/requirements/ui-contract.md (P16h). Each names the
// browsers the page works in, then points to the local-run panel (ruling 2026-10-28T02:00).
const BROWSERS = 'This page works in a Chromium browser such as Chrome or Brave, or Firefox.';
const LOCAL = 'Or run the environment on your computer instead. The steps are in “Run it on your computer” below this form.';
export const RELAY_FAILURE_TEXT: Record<RelayReason, { lead: string; next: string }> = {
  unreachable: {
    lead: 'The browser could not reach the relay that forwards calls to the API.',
    next: `${BROWSERS} ${LOCAL}`,
  },
  limited: {
    lead: 'The relay or the API is limiting requests from this page.',
    next: `Wait a minute, then press Validate again. ${BROWSERS} ${LOCAL}`,
  },
  unavailable: {
    lead: 'The relay or the API is not available at the moment.',
    next: `Press Validate again in a few minutes. ${BROWSERS} ${LOCAL}`,
  },
};

// The same failures when the relay stops a live trial: the Validate lead, then where to go next
// (the panel follows the error in the live view).
const LOCAL_TRIAL = 'Or run the environment on your computer instead. The steps are in “Run it on your computer” below this message.';
export const RELAY_TRIAL_TEXT: Record<RelayReason, { lead: string; next: string }> = {
  unreachable: { lead: RELAY_FAILURE_TEXT.unreachable.lead, next: `${BROWSERS} ${LOCAL_TRIAL}` },
  limited: { lead: RELAY_FAILURE_TEXT.limited.lead, next: `Wait a minute, then run the trial again. ${BROWSERS} ${LOCAL_TRIAL}` },
  unavailable: { lead: RELAY_FAILURE_TEXT.unavailable.lead, next: `Run the trial again in a few minutes. ${BROWSERS} ${LOCAL_TRIAL}` },
};

// The relay failure that a failed call through the relay means, from the client's error
// (packages/core/anthropic.ts ApiError): no readable answer (no status, a lost connection or a
// stall), a 429, a 5xx, or a 200 whose stream broke off (the relay cut by its time limit, or an
// error event in the stream; its type picks limited or unavailable). Null for any other answer,
// the API's own: a 4xx, the model's bad tool input, a response from another model, or a call the
// page itself refused (no status, nothing sent).
export function relayReason(e: { status: number | null; partial: boolean; type: string | null }): RelayReason | null {
  if (e.status === null) return e.partial ? 'unreachable' : null;
  if (e.status === 429) return 'limited';
  if (e.status >= 500) return 'unavailable';
  if (e.status === 200 && e.partial && e.type !== 'invalid_tool_input') return e.type === 'rate_limit_error' ? 'limited' : 'unavailable';
  return null;
}

// The relay failure that ended a browser-direct trial, read from its error event, which keeps the
// client's last error as its code (the error type, network, or http_<status>) and message: a lost
// connection or a stall (network, stream_idle), a stream that broke off (its message starts
// "stream " or is "HTTP 200 without a body"), or an HTTP status, which the message leads with.
// Null for any other end.
const BROKEN_STREAM = /^(stream |HTTP 200 without a body$)/;
export function trialRelayReason(end: { status: string; code: string; message: string }): RelayReason | null {
  if (end.status !== 'INFRA_API') return null;
  if (end.code === 'network' || end.code === 'stream_idle') return 'unreachable';
  const type = end.code.startsWith('http_') ? null : end.code;
  if (BROKEN_STREAM.test(end.message)) return relayReason({ status: 200, partial: true, type });
  const http = /^HTTP (\d{3})\b/.exec(end.message);
  return http === null ? null : relayReason({ status: Number(http[1]), partial: false, type });
}

// On browser-direct every answer comes through the relay, which could put any text in an error's
// message (review-security-P16h-web-1 M3). The relay's words reach exactly these messages from
// the client: an HTTP error's type and message from its body, a stream error event's type and
// message, and the model a response names. relayLine starts such a line with RELAY_ANSWERED, so a
// compromised relay's words cannot pass for the page's own; every other line is the page's own
// words about what happened (a lost connection, a broken stream, the egress guard, the cap).
export const RELAY_ANSWERED = 'The relay answered: ';
const FROM_ANSWER = /^(HTTP \d{3}(?! without a body$)|stream error |response model )/;
export const relayLine = (message: string): string => (FROM_ANSWER.test(message) ? RELAY_ANSWERED + message : message);

// The API's answer by HTTP status, the same sentence on both surfaces.
function apiLead(status: number | null): { lead: string; next?: string } {
  if (status === null) return { lead: 'The browser did not send the request to the API.' };
  if (status === 401) return { lead: 'The API did not accept this key.' };
  if (status === 403) return { lead: 'The API does not let this key use the model.' };
  if (status === 404) return { lead: 'The API did not find the model for this key.' };
  if (status === 429) return { lead: 'The API is limiting requests for this key.', next: 'Wait a minute, then press Validate again.' };
  if (status >= 500) return { lead: 'The API is not available at the moment.', next: 'Press Validate again in a few minutes.' };
  if (status >= 400) return { lead: 'The API did not accept the request.' };
  return { lead: 'The API sent an answer that this page cannot use.' };
}

function runnerLead(f: RunnerFailure): { lead: string; next?: string } {
  if (f.refusal !== undefined) return { lead: f.refusal };
  if (f.cause === 'no-token') return { lead: 'This page has no runner token.', next: 'Open the UI at the address that the runner printed, then try again.' };
  if (f.cause === 'no-answer') return { lead: 'The local runner did not answer.', next: 'Make sure that the runner is running, then press Validate again.' };
  if (f.cause === 'bad-body') return { lead: 'The local runner sent an answer that this page cannot read.' };
  // The runner relays these three API answers with their own status (apps/runner/server.ts).
  if (f.status === 401 || f.status === 403 || f.status === 429) return { lead: apiLead(f.status).lead };
  if (f.status === 502) return { lead: 'The local runner could not check the key with the API.' };
  if (f.status !== undefined && f.status >= 500) return { lead: 'The local runner had an internal error.' };
  return { lead: 'The local runner did not accept the key.' };
}

export function describeFailure(f: Failure): FailureText {
  switch (f.kind) {
    case 'relay':
      return { ...RELAY_FAILURE_TEXT[f.reason], detail: relayLine(f.message), local: true };
    case 'cap':
      return { lead: 'The session spend cap does not allow this check.', next: 'To continue, set a higher session spend cap.', detail: f.message, local: false };
    case 'api': {
      const { lead, next } = apiLead(f.status);
      return { lead, ...(next === undefined ? {} : { next }), detail: relayLine(f.message), local: false };
    }
    case 'runner': {
      const { lead, next } = runnerLead(f);
      return { lead, ...(next === undefined ? {} : { next }), ...(f.cause === 'no-token' ? {} : { detail: f.message }), local: false };
    }
    case 'notice':
      return { lead: f.message, local: false };
    case 'format':
      return { lead: `An Anthropic key starts with ${KEY_PREFIX}.`, next: 'Check the key and paste it again.', local: false };
  }
}
