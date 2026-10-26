// What the key gate says about a failed Validate: one plain sentence first, then what to do when
// there is something to do, then the API's or runner's own line as detail.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeFailure, RELAY_FAILURE_TEXT, type Failure } from '../src/keygate/failure.ts';

const API_LINE = 'HTTP 401 authentication_error: invalid x-api-key';

describe('describeFailure', () => {
  it('a browser-direct 401: the API did not accept the key, then the raw API line', () => {
    expect(describeFailure({ kind: 'api', status: 401, message: API_LINE })).toEqual({ lead: 'The API did not accept this key.', detail: API_LINE, local: false });
  });

  it('a local-runner 401 says the same first sentence, with the runner line as detail', () => {
    const message = 'The API refused this key (unauthorized). Check the key and press Validate again.';
    expect(describeFailure({ kind: 'runner', cause: 'error', status: 401, message })).toEqual({ lead: 'The API did not accept this key.', detail: message, local: false });
  });

  // P16h PR-web-2: hosted calls go through the relay. When it cannot be reached, limits the page
  // or fails, the gate says so in the ui-contract.md sentence and points to the local-run panel.
  it('each relay failure has its ui-contract.md sentence, points to the local-run panel and keeps the raw line', () => {
    for (const reason of ['unreachable', 'limited', 'unavailable'] as const) {
      const d = describeFailure({ kind: 'relay', reason, message: 'raw' });
      expect(d.lead, reason).toBe(RELAY_FAILURE_TEXT[reason].lead);
      expect(d.next, reason).toBe(RELAY_FAILURE_TEXT[reason].next);
      expect(d.next, reason).toMatch(/Run it on your computer/);
      expect(d.local, reason).toBe(true);
      expect(d.detail, reason).toBe('raw');
    }
    expect(RELAY_FAILURE_TEXT.unreachable.next).toContain('a Chromium browser such as Chrome or Brave, or Firefox');
  });

  it('the relay strings are fixed in docs/requirements/ui-contract.md', () => {
    const contract = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../docs/requirements/ui-contract.md'), 'utf8');
    for (const { lead, next } of Object.values(RELAY_FAILURE_TEXT)) {
      expect(contract).toContain(`\`${lead}\``);
      expect(contract).toContain(`\`${next}\``);
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
