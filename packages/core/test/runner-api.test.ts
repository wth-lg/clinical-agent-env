// The local runner's health, key, trial, run and SSE contracts: every sample the UI specs route-mock with
// passes its validator, and a body with a field missing or mistyped is rejected. Every 409 reason
// the runner sends has the plain text docs/requirements/ui-contract.md lists for it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reserveRequest } from '../anthropic.ts';
import { FINAL_TRIALS_PER_TASK, worstCaseUsd } from '../cost.ts';
import {
  ContractError, HEALTH_PATH, KEY_PATH, MAX_CONCURRENCY, MAX_TRIALS_PER_TASK, parseDryRun, parseHealth, parseKeyRequest, parseKeyState,
  parseRunnerError, parseRunsList, parseSse, parseSseEnd, parseTrialsAccepted, parseTrialsRefused, parseTrialsRequest, parseTrialView,
  REFUSAL_TEXT, refusalText, RUNNER_APP, RUNS_PATH, SAMPLES, sseFrame, SSE_END, TOKEN_HEADER, TOKEN_META, TRIALS_PATH, VALIDATE_REQUEST, validateWorstCaseUsd,
} from '../runner-api.ts';

const without = (o: object, k: string) => Object.fromEntries(Object.entries(o).filter(([name]) => name !== k));

describe('runner-api samples', () => {
  it('accepts every sample', () => {
    expect(parseHealth(SAMPLES.health)).toEqual(SAMPLES.health);
    expect(parseHealth(SAMPLES.healthWithKey).key_loaded).toBe(true);
    expect(parseHealth(SAMPLES.healthOwnRun).ledger.mode).toBe('own-run');
    expect(parseKeyRequest(SAMPLES.keyRequest)).toEqual(SAMPLES.keyRequest);
    expect(parseKeyState(SAMPLES.keyAccepted)).toEqual({ key_set: true });
    expect(parseKeyState(SAMPLES.keyCleared)).toEqual({ key_set: false });
    expect(parseRunnerError(SAMPLES.keyError).error.message).toMatch(/x-api-key/);
  });

  it('names the runner app, the same-origin paths, the token header and the token meta', () => {
    expect(SAMPLES.health.app).toBe(RUNNER_APP);
    expect(RUNNER_APP).toBe('clinenv-runner');
    expect([HEALTH_PATH, KEY_PATH]).toEqual(['api/health', 'api/key']);
    expect(TOKEN_HEADER).toBe('X-Clinenv-Token');
    expect(TOKEN_META).toBe('clinenv-runner-token');
  });
});

describe('runner-api validators', () => {
  it('rejects the static build\'s health body, so the hosted page is browser-direct', () => {
    expect(() => parseHealth(SAMPLES.staticHealth)).toThrow(ContractError);
  });

  it('has the P12b plan health shape: app, version, ledger {mode, path}, key_loaded, mock', () => {
    expect(Object.keys(SAMPLES.health).sort()).toEqual(['app', 'key_loaded', 'ledger', 'mock', 'version']);
    expect(Object.keys(SAMPLES.health.ledger).sort()).toEqual(['mode', 'path']);
  });

  it('rejects a health body missing any field, or a ledger missing mode or path', () => {
    for (const k of Object.keys(SAMPLES.health)) expect(() => parseHealth(without(SAMPLES.health, k)), k).toThrow(ContractError);
    for (const k of Object.keys(SAMPLES.health.ledger)) {
      expect(() => parseHealth({ ...SAMPLES.health, ledger: without(SAMPLES.health.ledger, k) }), `ledger.${k}`).toThrow(ContractError);
    }
  });

  it('rejects a health body from another app or with a mistyped field', () => {
    expect(() => parseHealth({ ...SAMPLES.health, app: 'vite' })).toThrow(ContractError);
    expect(() => parseHealth({ ...SAMPLES.health, version: 1 })).toThrow(ContractError);
    expect(() => parseHealth({ ...SAMPLES.health, key_loaded: 'no' })).toThrow(ContractError);
    expect(() => parseHealth({ ...SAMPLES.health, mock: 'no' })).toThrow(ContractError);
    expect(() => parseHealth({ ...SAMPLES.health, ledger: null })).toThrow(ContractError);
    expect(() => parseHealth({ ...SAMPLES.health, ledger: { ...SAMPLES.health.ledger, mode: 'other' } })).toThrow(ContractError);
    expect(() => parseHealth({ ...SAMPLES.health, ledger: { ...SAMPLES.health.ledger, path: 7 } })).toThrow(ContractError);
    for (const x of [null, [], 'clinenv-runner', 200, '<!doctype html>']) expect(() => parseHealth(x)).toThrow(ContractError);
  });

  it('rejects a key request missing its key, with an empty or padded key, or with any other field', () => {
    expect(() => parseKeyRequest({})).toThrow(ContractError);
    expect(() => parseKeyRequest({ key: '' })).toThrow(ContractError);
    expect(() => parseKeyRequest({ key: ' padded ' })).toThrow(ContractError);
    expect(() => parseKeyRequest({ key: 'x'.repeat(513) })).toThrow(ContractError);
    expect(() => parseKeyRequest({ ...SAMPLES.keyRequest, remember: true })).toThrow(ContractError);
  });

  it('rejects a key state or runner error missing a field', () => {
    expect(() => parseKeyState({})).toThrow(ContractError);
    expect(() => parseRunnerError({ error: { type: 'x' } })).toThrow(ContractError);
    expect(() => parseRunnerError({ error: { message: 'x' } })).toThrow(ContractError);
    expect(() => parseRunnerError({})).toThrow(ContractError);
  });

  it('never echoes a key in an error message', () => {
    const key = ['sk', 'ant', 'api03', 'Q'.repeat(40)].join('-');
    try {
      parseKeyRequest({ key, extra: 1 });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(key);
    }
  });
});

describe('runner-api trial, run and SSE contracts (P12b)', () => {
  it('accepts every P12b sample', () => {
    expect(parseTrialsRequest(SAMPLES.trialsRequest)).toEqual(SAMPLES.trialsRequest);
    expect(parseTrialsAccepted(SAMPLES.trialsAccepted)).toEqual(SAMPLES.trialsAccepted);
    expect(parseDryRun(SAMPLES.dryRun).projection.total_usd).toBe(SAMPLES.dryRun.projection.total_usd);
    expect(parseTrialsRefused(SAMPLES.trialsRefused).error.type).toBe('session_cap');
    expect(parseTrialView(SAMPLES.trial)).toEqual(SAMPLES.trial);
    expect(parseRunsList(SAMPLES.runs)).toEqual(SAMPLES.runs);
    expect(parseSseEnd(SAMPLES.sseEnd)).toEqual(SAMPLES.sseEnd);
    expect([TRIALS_PATH, RUNS_PATH]).toEqual(['api/trials', 'api/runs']);
  });

  it('takes 1 to 20 trials per task (the final run N) and 1 to 4 concurrency', () => {
    expect(MAX_TRIALS_PER_TASK).toBe(FINAL_TRIALS_PER_TASK);
    expect(parseTrialsRequest({ ...SAMPLES.trialsRequest, trials: MAX_TRIALS_PER_TASK }).trials).toBe(20);
    for (const trials of [0, 21, 1.5, '1', null]) expect(() => parseTrialsRequest({ ...SAMPLES.trialsRequest, trials }), String(trials)).toThrow(ContractError);
    expect(parseTrialsRequest({ ...SAMPLES.trialsRequest, concurrency: MAX_CONCURRENCY }).concurrency).toBe(4);
    for (const concurrency of [0, 5]) expect(() => parseTrialsRequest({ ...SAMPLES.trialsRequest, concurrency })).toThrow(ContractError);
  });

  it('refuses unknown fields, bad task ids, a bad effort or cap, and never echoes a key', () => {
    const key = ['sk', 'ant', 'api03', 'Z'.repeat(40)].join('-');
    const bad: unknown[] = [
      { ...SAMPLES.trialsRequest, extra: key },
      { ...SAMPLES.trialsRequest, tasks: [] },
      { ...SAMPLES.trialsRequest, tasks: ['../x'] },
      { ...SAMPLES.trialsRequest, tasks: ['a', 'a'] },
      { ...SAMPLES.trialsRequest, effort: 'turbo' },
      { ...SAMPLES.trialsRequest, session_cap_usd: 0 },
      { ...SAMPLES.trialsRequest, key: ` ${key}` },
      { ...SAMPLES.trialsRequest, smoke: 'yes' },
      { ...SAMPLES.trialsRequest, tasks: [key, 'x y'] },
    ];
    for (const b of bad) {
      try {
        parseTrialsRequest(b);
        expect.unreachable(JSON.stringify(b).slice(0, 80));
      } catch (e) {
        expect(e).toBeInstanceOf(ContractError);
        expect((e as Error).message).not.toContain(key);
      }
    }
    expect(parseTrialsRequest({ ...SAMPLES.trialsRequest, key }).key).toBe(key);
    // Unknown fields are counted, never named: a field name is client text, and an encoded key
    // passes redaction (security review P12b-4 G1).
    const encoded = key.replace('s', '%73');
    expect(() => parseTrialsRequest({ ...SAMPLES.trialsRequest, [encoded]: 1 })).toThrow(/^trials request: 1 unknown field$/);
    expect(() => parseTrialsRequest({ ...SAMPLES.trialsRequest, [encoded]: 1, [key.slice(14)]: 2 })).toThrow(/^trials request: 2 unknown fields$/);
    expect(() => parseKeyRequest({ key, [encoded]: 1 })).toThrow(/^key request: 1 unknown field$/);
  });

  it('frames and parses the SSE stream: id, event, one data line, comments dropped, a partial frame kept', () => {
    const a = sseFrame({ id: '0', event: 'request', data: '{"seq":0}' });
    const end = sseFrame({ id: null, event: SSE_END, data: JSON.stringify(SAMPLES.sseEnd) });
    expect(a).toBe('id: 0\nevent: request\ndata: {"seq":0}\n\n');
    const { frames, rest } = parseSse(`${a}: ping\n\n${end}id: 1\nevent: resp`);
    expect(frames).toEqual([{ id: '0', event: 'request', data: '{"seq":0}' }, { id: null, event: 'end', data: JSON.stringify(SAMPLES.sseEnd) }]);
    expect(rest).toBe('id: 1\nevent: resp');
  });

  it('rejects a trial view, runs list or stream end with a missing or mistyped field', () => {
    for (const k of Object.keys(SAMPLES.trial)) expect(() => parseTrialView(without(SAMPLES.trial, k)), k).toThrow(ContractError);
    expect(() => parseTrialView({ ...SAMPLES.trial, state: 'done' })).toThrow(ContractError);
    expect(() => parseRunsList({ runs: [without(SAMPLES.runs.runs[0], 'smoke')] })).toThrow(ContractError);
    expect(() => parseSseEnd({ state: 'graded' })).toThrow(ContractError);
    expect(() => parseDryRun({ ...SAMPLES.dryRun, calls: 1 })).toThrow(ContractError);
    expect(() => parseTrialsAccepted({ ...SAMPLES.trialsAccepted, trial_ids: [] })).toThrow(ContractError);
  });
});

describe('the Validate call', () => {
  it('is one low-effort call of at most 16 output tokens, and its worst case is what the ledger reserves for it', () => {
    expect(VALIDATE_REQUEST.params).toEqual({ max_tokens: 16, output_config: { effort: 'low' } });
    expect(validateWorstCaseUsd()).toBe(worstCaseUsd(reserveRequest(VALIDATE_REQUEST.history, VALIDATE_REQUEST.params)));
    expect(validateWorstCaseUsd()).toBeGreaterThan(0);
    expect(validateWorstCaseUsd()).toBeLessThan(0.1);
  });
});

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

// The 409 reasons apps/runner/server.ts sends, by endpoint: postTrials and startSmoke answer POST
// api/trials (Run), postKey answers POST api/key (Validate). Each `status: 409` statement names its
// reason as a literal type, as spend_refused_<cap> over SpendRefused's caps, or as a const error.
function runnerRefusals(): { key: string[]; trials: string[] } {
  const src = read('apps/runner/server.ts');
  const caps = /readonly cap: ((?:'[a-z]+'(?: \| )?)+);/.exec(read('packages/core/ledger.ts'))?.[1]?.match(/[a-z]+/g) ?? [];
  const consts = new Map([...src.matchAll(/const (\w+) = \{ type: '([a-z_]+)'/g)].map((m) => [m[1]!, m[2]!] as const));
  const part = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to));
  const reasons = (code: string) => code.split('status: 409').slice(1).flatMap((site) => {
    const statement = site.slice(0, site.search(/;\n/));
    const found = [
      ...[...statement.matchAll(/type: '([a-z_]+)'/g)].map((m) => m[1]!),
      ...(statement.includes('type: `spend_refused_${') ? caps.map((c) => `spend_refused_${c}`) : []),
      ...[...statement.matchAll(/error: (\w+)\b/g)].flatMap((m) => consts.get(m[1]!) ?? []),
    ];
    if (found.length === 0) throw new Error(`a 409 in apps/runner/server.ts names no reason this test can read: ${statement.slice(0, 120)}`);
    return found;
  });
  const trials = part('async function postTrials(', 'async function postKey(');
  const key = part('async function postKey(', 'async function readJson(');
  expect(src.split('status: 409').length - 1, 'a 409 outside postTrials, startSmoke and postKey').toBe(trials.split('status: 409').length - 1 + key.split('status: 409').length - 1);
  return { key: [...new Set(reasons(key))].sort(), trials: [...new Set(reasons(trials))].sort() };
}

// docs/requirements/ui-contract.md lists each as `- Validate, `<reason>`: `<text>`` or `- Run, ...`.
function contractRefusals(): { key: Record<string, string>; trials: Record<string, string> } {
  const out = { key: {} as Record<string, string>, trials: {} as Record<string, string> };
  for (const m of read('docs/requirements/ui-contract.md').matchAll(/^- (Validate|Run), `([a-z_]+)`: `([^`]+)`$/gm)) {
    out[m[1] === 'Validate' ? 'key' : 'trials'][m[2]!] = m[3]!;
  }
  return out;
}

describe('runner refusal text', () => {
  it('has a text for every 409 reason the runner sends, and for no other', () => {
    const sent = runnerRefusals();
    expect(sent.trials).toEqual(expect.arrayContaining(['fixtures_changed', 'no_key', 'session_cap', 'spend_refused_ceiling']));
    expect(sent.key).toEqual(expect.arrayContaining(['session_cap', 'spend_refused_ceiling']));
    expect(Object.keys(REFUSAL_TEXT.trials).sort()).toEqual(sent.trials);
    expect(Object.keys(REFUSAL_TEXT.key).sort()).toEqual(sent.key);
  });

  it('returns the ui-contract.md strings byte for byte', () => {
    expect(contractRefusals()).toEqual(REFUSAL_TEXT);
    expect(refusalText('key', 'session_cap')).toBe(REFUSAL_TEXT.key.session_cap);
    expect(refusalText('trials', 'spend_refused_ceiling')).toBe(REFUSAL_TEXT.trials.spend_refused_ceiling);
  });

  it('has no text for a reason the runner does not send, or for an inherited name', () => {
    expect(refusalText('key', 'authentication_error')).toBeNull();
    expect(refusalText('key', 'no_key')).toBeNull();
    expect(refusalText('trials', 'toString')).toBeNull();
  });

  // When no trials are running, waiting changes nothing, so each cap text also says what does
  // (verifier-phase-P11f-3 S2). The session is the runner process's (apps/runner/server.ts
  // startRunner: session, inSession), so a restart starts one with no spend and no cap. The project
  // spending limit counts the whole spend ledger, which a restart does not change; `pnpm cli
  // spend --check` lists what it holds, an open batch of a runner that died included.
  it('says what to do when a cap refuses and no trials are running', () => {
    const restart = 'If no trials are running, restart the runner. A restart starts a new session with no spend.';
    const ledger = 'A runner restart does not reset this limit. Run pnpm cli spend --check to see what uses it.';
    expect(REFUSAL_TEXT.key.session_cap).toContain(restart);
    expect(REFUSAL_TEXT.key.spend_refused_ceiling).toContain(restart);
    for (const text of [REFUSAL_TEXT.key.spend_refused_projected, REFUSAL_TEXT.trials.projected_cap, REFUSAL_TEXT.trials.spend_refused_projected]) {
      expect(text).toContain(ledger);
    }
    expect(REFUSAL_TEXT.key.spend_refused_projected).toContain('If trials are running, wait for them to finish.');
  });

  // Two caps, two names (verifier-phase-P11f-3 m1): PROJECTED_CAP_USD, which refuses a batch or
  // call by its estimate, is the project spending limit; ACTUAL_CAP_USD, which blocks every call
  // once settled spend reaches it, is the hard spending stop.
  it('names the projected cap and the hard stop differently', () => {
    const all = [...Object.values(REFUSAL_TEXT.key), ...Object.values(REFUSAL_TEXT.trials)];
    for (const text of all) expect(text).not.toContain('total spending limit');
    for (const text of [REFUSAL_TEXT.key.spend_refused_projected, REFUSAL_TEXT.trials.projected_cap, REFUSAL_TEXT.trials.spend_refused_projected]) {
      expect(text).toContain('the project spending limit');
      expect(text).not.toContain('spending stop');
    }
    for (const text of [REFUSAL_TEXT.key.spend_refused_actual, REFUSAL_TEXT.trials.spend_refused_actual]) {
      expect(text).toMatch(/^The project has reached its hard spending stop\. /);
      expect(text).not.toContain('spending limit');
    }
  });

  it('is plain: short sentences, no status codes and no reason ids', () => {
    for (const [reason, text] of [...Object.entries(REFUSAL_TEXT.key), ...Object.entries(REFUSAL_TEXT.trials)]) {
      expect(text, reason).not.toMatch(/\b[45][0-9]{2}\b|_|api\//);
      for (const sentence of text.split(/(?<=\.) /)) {
        expect(sentence, reason).toMatch(/^[A-Z].*\.$/);
        expect(sentence.split(' ').length, `${reason}: ${sentence}`).toBeLessThanOrEqual(20);
      }
    }
  });
});
