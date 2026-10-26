// What the key gate says about a failed Validate: one plain sentence first, then what to do when
// there is something to do, then the API's or runner's own line as detail.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeFailure, relayLine, RELAY_ANSWERED, RELAY_FAILURE_TEXT, RELAY_TRIAL_TEXT, relayReason, trialRelayReason, type Failure } from '../src/keygate/failure.ts';

const API_LINE = 'HTTP 401 authentication_error: invalid x-api-key';

describe('describeFailure', () => {
  // Review M3 (review-security-P16h-web-1): on browser-direct every answer comes through the
  // relay, so a line from an answer says so; a compromised relay's words cannot pass for the page's.
  it('a browser-direct 401: the API did not accept the key, then the API line as the relay answered it', () => {
    expect(RELAY_ANSWERED).toBe('The relay answered: ');
    expect(describeFailure({ kind: 'api', status: 401, message: API_LINE })).toEqual({ lead: 'The API did not accept this key.', detail: `The relay answered: ${API_LINE}`, local: false });
  });

  it('a line the page wrote itself, with no answer behind it, has no attribution', () => {
    expect(describeFailure({ kind: 'api', status: null, message: 'egress guard: fetch refused' }).detail).toBe('egress guard: fetch refused');
    expect(describeFailure({ kind: 'relay', reason: 'unreachable', message: 'network error: Failed to fetch' }).detail).toBe('network error: Failed to fetch');
    expect(describeFailure({ kind: 'cap', message: 'm' }).detail).toBe('m');
  });

  it('a local-runner 401 says the same first sentence, with the runner line as detail', () => {
    const message = 'The API refused this key (unauthorized). Check the key and press Validate again.';
    expect(describeFailure({ kind: 'runner', cause: 'error', status: 401, message })).toEqual({ lead: 'The API did not accept this key.', detail: message, local: false });
  });

  // P16h PR-web-2: hosted calls go through the relay. When it cannot be reached, limits the page
  // or fails, the gate says so in the ui-contract.md sentence and points to the local-run panel.
  it('each relay failure has its ui-contract.md sentence, points to the local-run panel and keeps the raw line', () => {
    for (const reason of ['unreachable', 'limited', 'unavailable'] as const) {
      const raw = { unreachable: 'network error: Failed to fetch', limited: 'HTTP 429 rate_limit_error: relay rate limit', unavailable: 'HTTP 502 relay_error' }[reason];
      const d = describeFailure({ kind: 'relay', reason, message: raw });
      expect(d.lead, reason).toBe(RELAY_FAILURE_TEXT[reason].lead);
      expect(d.next, reason).toBe(RELAY_FAILURE_TEXT[reason].next);
      expect(d.next, reason).toMatch(/Run it on your computer/);
      expect(d.local, reason).toBe(true);
      expect(d.detail, reason).toBe(reason === 'unreachable' ? raw : `The relay answered: ${raw}`);
    }
  });

  // Ruling 2026-10-28T02:00: all three relay errors name the browsers the page works in.
  it('each relay failure names the supported browsers', () => {
    for (const reason of ['unreachable', 'limited', 'unavailable'] as const) {
      expect(RELAY_FAILURE_TEXT[reason].next, reason).toContain('This page works in a Chromium browser such as Chrome or Brave, or Firefox.');
    }
  });

  it('the relay strings are fixed in docs/requirements/ui-contract.md', () => {
    const contract = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../docs/requirements/ui-contract.md'), 'utf8');
    for (const { lead, next } of [...Object.values(RELAY_FAILURE_TEXT), ...Object.values(RELAY_TRIAL_TEXT)]) {
      expect(contract).toContain(`\`${lead}\``);
      expect(contract).toContain(`\`${next}\``);
    }
  });

  it('relayReason: no readable answer, a 429, a 5xx and a stream the relay broke off are relay failures; other answers are not', () => {
    const e = (status: number | null, partial: boolean, type: string | null = null) => ({ status, partial, type });
    expect(relayReason(e(null, true))).toBe('unreachable');
    expect(relayReason(e(null, true, 'stream_idle'))).toBe('unreachable');
    expect(relayReason(e(null, false, 'egress_refused'))).toBeNull();
    expect(relayReason(e(429, false, 'rate_limit_error'))).toBe('limited');
    for (const s of [500, 502, 529]) expect(relayReason(e(s, false))).toBe('unavailable');
    // A 200 whose stream broke off (a relay cut by its time limit, or an error event in the stream).
    expect(relayReason(e(200, true))).toBe('unavailable');
    expect(relayReason(e(200, true, 'overloaded_error'))).toBe('unavailable');
    expect(relayReason(e(200, true, 'rate_limit_error'))).toBe('limited');
    // The model's own bad tool input, and a response from another model, are not relay failures.
    expect(relayReason(e(200, true, 'invalid_tool_input'))).toBeNull();
    expect(relayReason(e(200, false, 'model_mismatch'))).toBeNull();
    for (const s of [400, 401, 403, 404, 413]) expect(relayReason(e(s, false))).toBeNull();
  });

  // Review of round 2: the relay's words reach these messages (packages/core/anthropic.ts): an
  // HTTP error's type and message from its body, a stream error event's type and message, and the
  // model a response names. The other messages are the page's own words about what happened.
  it('relayLine prefixes exactly the lines that carry the relay\'s words', () => {
    for (const m of ['HTTP 401 authentication_error: invalid x-api-key', 'HTTP 502 relay_error', 'stream error overloaded_error: Key revoked', 'response model evil-model is not claude-opus-5-5']) {
      expect(relayLine(m), m).toBe(RELAY_ANSWERED + m);
    }
    for (const m of ['network error: Failed to fetch', 'no data for 180000 ms', 'stream dropped: terminated', 'stream dropped before message_stop', 'stream ended without message_start', 'HTTP 200 without a body', 'egress guard: fetch refused', '900001 ms elapsed, past the hard bound']) {
      expect(relayLine(m), m).toBe(m);
    }
  });

  // Ruling 2026-10-28T02:00 (verifier-phase-P16h-web-1 M1): a relay failure during a live trial
  // shows the local-run fallback too. The trial's error event carries the client's last error:
  // its code, and its message, which leads with the HTTP status when one came back.
  it('trialRelayReason reads a relay failure from a trial error event, and nothing else', () => {
    const infra = (code: string, message: string) => ({ status: 'INFRA_API', code, message });
    expect(trialRelayReason(infra('network', 'network error: Failed to fetch'))).toBe('unreachable');
    expect(trialRelayReason(infra('stream_idle', 'no data for 300000 ms'))).toBe('unreachable');
    expect(trialRelayReason(infra('rate_limit_error', 'HTTP 429 rate_limit_error: relay rate limit'))).toBe('limited');
    expect(trialRelayReason(infra('http_429', 'HTTP 429'))).toBe('limited');
    expect(trialRelayReason(infra('relay_error', 'HTTP 502 relay_error'))).toBe('unavailable');
    expect(trialRelayReason(infra('overloaded_error', 'HTTP 529 overloaded_error: Overloaded'))).toBe('unavailable');
    expect(trialRelayReason(infra('authentication_error', 'HTTP 401 authentication_error: invalid x-api-key'))).toBeNull();
    expect(trialRelayReason(infra('http_200', 'stream dropped: terminated'))).toBe('unavailable');
    expect(trialRelayReason(infra('http_200', 'stream dropped before message_stop'))).toBe('unavailable');
    expect(trialRelayReason(infra('http_200', 'stream ended without message_start'))).toBe('unavailable');
    expect(trialRelayReason(infra('http_200', 'HTTP 200 without a body'))).toBe('unavailable');
    expect(trialRelayReason(infra('overloaded_error', 'stream error overloaded_error: Overloaded'))).toBe('unavailable');
    expect(trialRelayReason(infra('rate_limit_error', 'stream error rate_limit_error: slow down'))).toBe('limited');
    expect(trialRelayReason(infra('invalid_tool_input', 'tool_use input is not valid JSON'))).toBeNull();
    expect(trialRelayReason({ status: 'INVALID', code: 'model_mismatch', message: 'response model evil-model is not claude-opus-5-5' })).toBeNull();
    expect(trialRelayReason(infra('elapsed_bound', '900001 ms elapsed, past the hard bound of 900000 ms (0 ms in failed attempts and retry waits)'))).toBeNull();
    expect(trialRelayReason({ status: 'INFRA_HARNESS', code: 'egress_refused', message: 'egress guard: fetch refused' })).toBeNull();
    expect(trialRelayReason({ status: 'ENV_ERROR', code: 'INTERNAL', message: 'HTTP 502' })).toBeNull();
  });

  it('each trial relay failure has the Validate lead, names the browsers, says to run the trial again where that helps, and points below the message', () => {
    for (const reason of ['unreachable', 'limited', 'unavailable'] as const) {
      expect(RELAY_TRIAL_TEXT[reason].lead, reason).toBe(RELAY_FAILURE_TEXT[reason].lead);
      expect(RELAY_TRIAL_TEXT[reason].next, reason).toContain('This page works in a Chromium browser such as Chrome or Brave, or Firefox.');
      expect(RELAY_TRIAL_TEXT[reason].next, reason).toMatch(/“Run it on your computer” below this message\.$/);
      expect(RELAY_TRIAL_TEXT[reason].next, reason).not.toMatch(/Validate/);
    }
  });

  it('no failure names an organization that blocks browser access: through the relay no surface gets that 401', () => {
    const kinds: Failure[] = [{ kind: 'relay', reason: 'unreachable', message: 'm' }, { kind: 'api', status: 401, message: 'm' }];
    for (const f of kinds) expect(describeFailure(f).lead).not.toMatch(/organization/i);
  });

  it('a runner 409 leads with its refusal text', () => {
    expect(describeFailure({ kind: 'runner', cause: 'error', status: 409, refusal: 'Plain refusal.', message: 'runner detail' })).toEqual({ lead: 'Plain refusal.', detail: 'runner detail', local: false });
  });

  it('every failure has a lead that is one sentence, and the lead never repeats the detail', () => {
    const all: Failure[] = [
      { kind: 'api', status: 400, message: 'm' },
      { kind: 'api', status: 401, message: 'm' },
      { kind: 'api', status: 403, message: 'm' },
      { kind: 'api', status: 404, message: 'm' },
      { kind: 'api', status: 429, message: 'm' },
      { kind: 'api', status: 529, message: 'm' },
      { kind: 'api', status: null, message: 'm' },
      { kind: 'api', status: 418, message: 'm' },
      { kind: 'cap', message: 'Refused: spent $0.00 + this estimate $0.01 would cross the session cap $0.01.' },
      { kind: 'relay', reason: 'unreachable', message: 'm' },
      { kind: 'relay', reason: 'limited', message: 'm' },
      { kind: 'relay', reason: 'unavailable', message: 'm' },
      { kind: 'runner', cause: 'no-token', message: 'm' },
      { kind: 'runner', cause: 'no-answer', message: 'm' },
      { kind: 'runner', cause: 'bad-body', message: 'm' },
      { kind: 'runner', cause: 'error', status: 401, message: 'm' },
      { kind: 'runner', cause: 'error', status: 403, message: 'm' },
      { kind: 'runner', cause: 'error', status: 429, message: 'm' },
      { kind: 'runner', cause: 'error', status: 500, message: 'm' },
      { kind: 'runner', cause: 'error', status: 502, message: 'm' },
    ];
    const leads = new Set<string>();
    for (const f of all) {
      const { lead, detail } = describeFailure(f);
      expect(lead, JSON.stringify(f)).toMatch(/^[A-Z][^.]*[A-Za-z)]\.$/);
      expect(lead).not.toBe(detail);
      leads.add(lead);
    }
    // Different causes get different sentences, not one catch-all.
    expect(leads.size).toBeGreaterThanOrEqual(13);
  });

  it('the cap failure says how to continue', () => {
    expect(describeFailure({ kind: 'cap', message: 'm' }).next).toMatch(/session spend cap/);
  });

  it('a notice from the shell (Forget failed) shows as given', () => {
    expect(describeFailure({ kind: 'notice', message: 'The local runner did not forget the key: x' })).toEqual({ lead: 'The local runner did not forget the key: x', local: false });
  });
});
