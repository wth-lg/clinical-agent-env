// pnpm cli audit-llm (plan phase P23, code PR): the blinded LLM auditor over a run's valid failures
// and every PASS with a met or unknown penalty. Every live path is mocked: the transport is
// scripted, HOME a temp dir. The checks the gate names: the auditor's input omits the builder's
// labels; the rendered prompt holds every FAULT_DEFINITIONS sentence and criterion; the dry run
// makes no call and prints the projection; with the ledger one cent over PROJECTED_CAP_USD less
// the projection it makes 0 calls and writes no row; a recorded verdict is not asked again.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scriptedTransport, type MockTurn } from '../../apps/web/src/harness/scenarios.ts';
import type { Transport } from '../../packages/core/anthropic.ts';
import { PROJECTED_CAP_USD } from '../../packages/core/ledger.ts';
import { AUDIT_LABELS, CONFIRMATION_CRITERIA, FAULT_DEFINITIONS, FAULT_PRECEDENCE_RULE, PASS_DEFINITION } from '../../packages/core/outcomes.ts';
import { fakeKey, tempDir, write } from '../../scripts/test/helpers.ts';
import { AUDITOR_PROMPT_VERSION, auditTargets, main, parseVerdict } from '../audit-llm.ts';
import { fixtureChecks, writeFixtureRun } from './run-fixtures.ts';

type Row = Record<string, unknown>;
const rows = (dir: string) => readFileSync(join(dir, 'audit.jsonl'), 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Row);
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Row;
const seed = (cost: number) =>
  ['reserve', 'settle'].map((kind) => JSON.stringify({ ts: 't', call_id: 'seed', kind, source: 'node', run_id: null, batch_id: null, trial: null, usage: null, cost_usd: cost })).join('\n') + '\n';
// The fixture's builder note, which the auditor must never see.
const BUILDER_NOTE = 'chose the wrong value with the evidence in view';

// The clean fixture run (two tasks, 5 PASS and 5 FAIL each), plus a met penalty on t-alpha/0, a
// PASS, so it is a target too: 11 targets, 10 failures and one PASS.
function run(): string {
  const dir = tempDir('audit-llm-run');
  writeFixtureRun(dir, 'clean');
  const file = join(dir, 'trials/t-alpha/0.json');
  const r = readJson(file);
  r.checks = [...(r.checks as Row[]), { id: 'harm_item', kind: 'rubric', points: -2, met: true, evidence: { note: 'DocumentReference/note-fx-1' } }];
  writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
  return dir;
}

const verdict = (label: string, over: Row = {}) => JSON.stringify({ label, clinically_acceptable: 'yes', tool_rejections_correct: 'yes', decisive_step: 2, evidence_ids: ['Patient/pt-0001'], reason: 'The write at step 2 set the wrong value with the patient in view.', ...over });

function harness(fetch: Transport, env: Record<string, string> = {}) {
  const home = tempDir('audit-llm-home');
  const lines: string[] = [];
  const deps = { env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), ...env }, out: (l: string) => lines.push(l), fetch, checks: fixtureChecks };
  return { deps, home, lines, text: () => lines.join('\n'), audit: (args: string[]) => main(args, deps) };
}

// "model, grader or environment": the allowed labels as a refusal lists them.
const listed = (xs: readonly string[]) => `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;
const projectionOf = (text: string) => Number(/^LIVE_PROJECTION_USD=(\d+\.\d{6})$/m.exec(text)![1]);

describe('audit-llm', () => {
  it('targets every valid failure and every PASS with a met or unknown penalty, in trial order', () => {
    const dir = run();
    const names = auditTargets(dir).map((t) => t.trial);
    expect(names).toEqual(['t-alpha/0', 't-alpha/5', 't-alpha/6', 't-alpha/7', 't-alpha/8', 't-alpha/9', 't-beta/5', 't-beta/6', 't-beta/7', 't-beta/8', 't-beta/9']);
    expect(auditTargets(dir).find((t) => t.trial === 't-alpha/0')).toMatchObject({ outcome: 'PASS', penalties: ['harm_item'] });
  });

  it('--dry-run makes no call, opens no ledger, writes nothing and prints the projection', async () => {
    const fetch = vi.fn<Transport>();
    const dir = run();
    const h = harness(fetch);
    expect(await h.audit([dir, '--dry-run'])).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(h.text()).toMatch(/^audit-llm dry run: 11 trials \(10 failures, 1 PASS with a penalty\), 11 to ask, worst case \$\d+\.\d\d each at most$/m);
    expect(h.text()).toMatch(/^projection \$\d+\.\d\d$/m);
    expect(projectionOf(h.text())).toBeGreaterThan(0);
    expect(existsSync(join(h.home, 'spend.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'auditor'))).toBe(false);
  });

  it('the rendered prompt holds every FAULT_DEFINITIONS sentence and criterion, the trajectory by step, the grade, and no builder label', async () => {
    const dir = run();
    const t = scriptedTransport((n) => ({ text: verdict(n === 1 ? 'pass' : 'model') }));
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('A') });
    expect(await h.audit([dir])).toBe(0);
    expect(t.bodies).toHaveLength(11);
    const first = t.bodies[0]!;
    expect(first.max_tokens).toBeGreaterThan(0);
    const body = JSON.stringify(first.messages);
    const holds = (s: string) => expect(body, s.slice(0, 60)).toContain(JSON.stringify(s).slice(1, -1));
    for (const d of Object.values(FAULT_DEFINITIONS)) {
      holds(d.sentence);
      for (const c of d.criteria) holds(c.text);
    }
    holds(FAULT_PRECEDENCE_RULE);
    holds(PASS_DEFINITION);
    for (const c of CONFIRMATION_CRITERIA) if (c.id !== 'M5') holds(c.text);
    // The trajectory, numbered as grader/exposure.ts stepsOf numbers the executed calls.
    holds('step 1: fhir_read');
    holds('step 2: write_note');
    // The grade of the trial: the first body is t-alpha/0, the PASS with the penalty.
    holds('harm_item');
    // Blind: nothing of the builder's audit row reaches the auditor.
    expect(body).not.toContain(BUILDER_NOTE);
    expect(body).not.toContain('taxonomy');
    expect(body).not.toContain('model_fault');
    expect(body).not.toContain('llm_auditor_agrees');
    // A failure's body names its failed check.
    expect(JSON.stringify(t.bodies[1]!.messages)).toContain('G1');
  });

  it('writes each verdict under <run>/auditor, syncs llm_auditor_agrees into audit.jsonl, and asks a recorded trial no second time', async () => {
    const dir = run();
    // t-alpha/0 (a PASS): confirmed. t-alpha/5: environment, against the builder's model label. The rest: model.
    const t = scriptedTransport((n) => ({ text: n === 1 ? verdict('pass', { decisive_step: null, evidence_ids: ['DocumentReference/note-fx-1'] }) : n === 2 ? verdict('environment', { tool_rejections_correct: 'no' }) : verdict('model') }));
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('A') });
    expect(await h.audit([dir])).toBe(0);
    expect(t.bodies).toHaveLength(11);
    expect(readdirSync(join(dir, 'auditor', 't-alpha')).sort()).toEqual(['0.json', '5.json', '6.json', '7.json', '8.json', '9.json']);
    const a5 = readJson(join(dir, 'auditor', 't-alpha', '5.json'));
    expect(a5).toMatchObject({ trial: 't-alpha/5', outcome: 'FAIL', prompt_version: AUDITOR_PROMPT_VERSION, verdict: { label: 'environment', clinically_acceptable: 'yes', tool_rejections_correct: 'no', decisive_step: 2, evidence_ids: ['Patient/pt-0001'] }, problem: null, calls: 1 });
    expect(typeof a5.cost_usd).toBe('number');
    expect(typeof a5.prompt_sha256).toBe('string');
    const a0 = readJson(join(dir, 'auditor', 't-alpha', '0.json'));
    expect(a0).toMatchObject({ outcome: 'PASS', verdict: { label: 'pass', decisive_step: null } });
    // The file keeps no builder label and no rendered prompt.
    expect(JSON.stringify(a5)).not.toContain(BUILDER_NOTE);
    expect(JSON.stringify(a5)).not.toContain(FAULT_DEFINITIONS.model.sentence);
    const by = Object.fromEntries(rows(dir).filter((r) => typeof r.trial === 'string').map((r) => [r.trial as string, r.llm_auditor_agrees]));
    expect(by['t-alpha/5']).toBe(false);
    expect(by['t-alpha/6']).toBe(true);
    expect(by['t-beta/9']).toBe(true);
    expect(by['t-alpha/0']).toBe(true);
    // A PASS the fixture audited that is no target keeps its row as it was.
    expect(by['t-alpha/1']).toBe(true);
    expect(h.text()).toMatch(/^audit-llm t-alpha\/5: FAIL, auditor environment \(builder model: disagrees\)/m);
    expect(h.text()).toMatch(/^audit-llm: 11 of 11 verdicts, 11 calls, \$\d+\.\d\d; agrees 10, disagrees 1, unlabelled 0$/m);
    // Run again: nothing to ask, nothing changes.
    const before = readFileSync(join(dir, 'audit.jsonl'), 'utf8');
    expect(await h.audit([dir])).toBe(0);
    expect(t.bodies).toHaveLength(11);
    expect(readFileSync(join(dir, 'audit.jsonl'), 'utf8')).toBe(before);
    expect(h.text()).toMatch(/^audit-llm: 11 of 11 verdicts, 0 calls/m);
    // The dry run after it projects nothing.
    const dry = harness(vi.fn<Transport>());
    expect(await dry.audit([dir, '--dry-run'])).toBe(0);
    expect(dry.text()).toMatch(/^audit-llm dry run: 11 trials \(10 failures, 1 PASS with a penalty\), 0 to ask/m);
    expect(projectionOf(dry.text())).toBe(0);
  });

  it('an answer that is not the verdict JSON, or a label the outcome does not allow, is recorded as a problem, exits 1, and is asked again next time', async () => {
    const dir = run();
    // Call 1 (t-alpha/0, a PASS): prose. Call 2 (t-alpha/5): a label a PASS allows, refused on a
    // failure. Calls 3-11: model. Call 12, the rerun of t-alpha/0: pass. Call 13, t-alpha/5: model.
    const turns: MockTurn[] = [{ text: 'I think the model is at fault.' }, { text: verdict('pass') }];
    const t = scriptedTransport((n) => turns[n - 1] ?? { text: verdict(n === 12 ? 'pass' : 'model', n === 12 ? { decisive_step: null } : {}) });
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('A') });
    expect(await h.audit([dir])).toBe(1);
    expect(t.bodies).toHaveLength(11);
    expect(readJson(join(dir, 'auditor', 't-alpha', '0.json'))).toMatchObject({ verdict: null, problem: expect.stringContaining('not the verdict JSON'), answer: 'I think the model is at fault.' });
    expect(readJson(join(dir, 'auditor', 't-alpha', '5.json'))).toMatchObject({ verdict: null, problem: `label pass is not allowed on a FAIL (${listed(AUDIT_LABELS)})` });
    expect(h.text()).toMatch(/^audit-llm t-alpha\/0: PASS, no verdict: the last answer is not the verdict JSON/m);
    expect(h.text()).toMatch(/^audit-llm: 9 of 11 verdicts/m);
    const row = rows(dir).find((r) => r.trial === 't-alpha/0')!;
    expect(row.llm_auditor_agrees).toBe(true); // the fixture's own value, untouched without a verdict
    // Next run asks the two again, and only them.
    expect(await h.audit([dir])).toBe(0);
    expect(t.bodies).toHaveLength(13);
    expect(readJson(join(dir, 'auditor', 't-alpha', '0.json'))).toMatchObject({ verdict: { label: 'pass' }, problem: null });
    expect(readJson(join(dir, 'auditor', 't-alpha', '5.json'))).toMatchObject({ verdict: { label: 'model' }, problem: null });
    expect(h.text()).toMatch(/^audit-llm: 11 of 11 verdicts, 2 calls/m);
  });

  it('with ledger + projection = PROJECTED_CAP_USD + $0.01 it is refused with 0 calls and no ledger row', async () => {
    const fetch = vi.fn<Transport>();
    const dir = run();
    const dry = harness(fetch);
    expect(await dry.audit([dir, '--dry-run'])).toBe(0);
    const projection = projectionOf(dry.text());
    const ledger = tempDir('audit-llm-ledger');
    write(ledger, 'spend.jsonl', seed(Number((PROJECTED_CAP_USD + 0.01 - projection).toFixed(6))));
    const h = harness(fetch, { SPEND_LEDGER: join(ledger, 'spend.jsonl'), ANTHROPIC_API_KEY: fakeKey('A') });
    expect(await h.audit([dir])).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(h.text()).toContain(`audit-llm: refused before any call (ledger + projection would pass PROJECTED_CAP_USD $${PROJECTED_CAP_USD})`);
    expect(h.text()).toContain(`= $${(PROJECTED_CAP_USD + 0.01).toFixed(2)} > $${PROJECTED_CAP_USD}`);
    expect(readFileSync(join(ledger, 'spend.jsonl'), 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
    expect(existsSync(join(dir, 'auditor'))).toBe(false);
  });

  it('--result-chars cuts each tool result the auditor sees at that many characters, policies excepted', async () => {
    const dir = run();
    const file = join(dir, 'trajectories/t-alpha/5.jsonl');
    const long = 'x'.repeat(5000);
    const policy = 'p'.repeat(5000);
    const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
    events[0] = { ...events[0], content: { entries: [long] } };
    events.push({ ...events[1], seq: 3, tool_use_id: 'toolu_3', name: 'read_policy', content: { text: policy }, written_ids: [] });
    writeFileSync(file, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    const t = scriptedTransport((n) => ({ text: verdict(n === 1 ? 'pass' : 'model') }));
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('A') });
    expect(await h.audit([dir, '--result-chars', '1000'])).toBe(0);
    const body = JSON.stringify(t.bodies[1]!.messages);
    expect(body).not.toContain('x'.repeat(1001));
    // {"entries":["<5000 x>"]} is 5016 characters, cut at 1000.
    expect(body).toContain('4016 more characters cut');
    expect(body).toContain(policy);
    expect(await main([dir, '--result-chars', 'ten'], h.deps)).toBe(2);
  });

  it('parseVerdict takes the last JSON object with a label and refuses the wrong shape', () => {
    const ok = parseVerdict(`Reasoning first. {"label": "draft"} Then:\n\`\`\`json\n${verdict('grader', { evidence_ids: ['Observation/obs-1'] })}\n\`\`\``, 'FAIL', 2);
    expect(ok).toMatchObject({ verdict: { label: 'grader', evidence_ids: ['Observation/obs-1'], decisive_step: 2 } });
    expect(parseVerdict('no json here', 'FAIL', 2)).toMatchObject({ problem: expect.stringContaining('not the verdict JSON') });
    expect(parseVerdict(verdict('pass'), 'FAIL', 2)).toMatchObject({ problem: expect.stringContaining('label pass') });
    expect(parseVerdict(verdict('model'), 'PASS', 2)).toMatchObject({ problem: expect.stringContaining('label model') });
    expect(parseVerdict(verdict('model', { decisive_step: 9 }), 'FAIL', 2)).toMatchObject({ problem: expect.stringContaining('decisive_step 9') });
    expect(parseVerdict(verdict('model', { clinically_acceptable: 'maybe' }), 'FAIL', 2)).toMatchObject({ problem: expect.stringContaining('clinically_acceptable') });
    expect(parseVerdict(verdict('model', { evidence_ids: 'Patient/pt-1' }), 'FAIL', 2)).toMatchObject({ problem: expect.stringContaining('evidence_ids') });
  });

  it('usage errors exit 2 and a run without trials exits 1', async () => {
    const h = harness(vi.fn<Transport>());
    expect(await h.audit([])).toBe(2);
    expect(await h.audit(['a', 'b'])).toBe(2);
    expect(await h.audit([tempDir('audit-llm-empty')])).toBe(1);
  });
});
