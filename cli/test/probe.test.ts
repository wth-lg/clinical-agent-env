// pnpm cli probe (plan phase P17, PR22a): the probe agent is offered only the task's read tools,
// its first request carries prompts/probe.md with the task's instruction, and its last answer's
// findings are written to <out>/<task>.json; with the ledger one cent over PROJECTED_CAP_USD
// less the dry run's projection it makes no call; the dry run makes no call and prints the
// projection. Every live path is mocked: the transport is scripted, HOME a temp dir.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { scriptedTransport, type MockTurn } from '../../apps/web/src/harness/scenarios.ts';
import type { Transport } from '../../packages/core/anthropic.ts';
import { PER_TRIAL_CAP_USD } from '../../packages/core/cost.ts';
import { PROJECTED_CAP_USD } from '../../packages/core/ledger.ts';
import { WRITE_TOOLS } from '../../packages/env/tools/write/index.ts';
import { fakeKey, tempDir, write } from '../../scripts/test/helpers.ts';
import { nodeTaskSource } from '../adapters/tasks-node.ts';
import { main } from '../probe.ts';

const TOY_INSTRUCTION = readFileSync(new URL('../../tasks/_toy/instruction.md', import.meta.url), 'utf8');
const FINDINGS = { findings: [{ kind: 'missing_fact', source: 'instruction', quote: 'a progress note', readings: [], explanation: 'The note text is not given.' }] };
const seed = (cost: number) =>
  ['reserve', 'settle'].map((kind) => JSON.stringify({ ts: 't', call_id: 'seed', kind, source: 'node', run_id: null, batch_id: null, trial: null, usage: null, cost_usd: cost })).join('\n') + '\n';

function harness(fetch: Transport, env: Record<string, string> = {}) {
  const home = tempDir('probe-home');
  const out = tempDir('probe-out');
  const lines: string[] = [];
  const deps = { env: { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl'), ...env }, out: (l: string) => lines.push(l), fetch, tasks: nodeTaskSource({ testMode: true }) };
  return { deps, out, home, lines, text: () => lines.join('\n'), probe: (args: string[]) => main(['--task', '_toy', '--out', out, ...args], deps) };
}

describe('probe', () => {
  it('offers the probe agent only read tools, sends the probe prompt with the instruction and writes its findings', async () => {
    const turns: MockTurn[] = [{ tools: [{ id: 'toolu_p1', name: 'get_context', input: {} }] }, { text: JSON.stringify(FINDINGS) }];
    const t = scriptedTransport(turns);
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('P') });
    expect(await h.probe([])).toBe(0);
    expect(t.bodies).toHaveLength(2);
    const offered = (t.bodies[0]!.tools as Array<{ name: string }>).map((x) => x.name);
    expect(offered).toEqual(['get_context', 'fhir_read']);
    for (const w of WRITE_TOOLS) expect(offered).not.toContain(w.name);
    const first = JSON.stringify(t.bodies[0]!.messages[0]!.content);
    expect(first).toContain('This is a review of a task, not the task itself.');
    expect(first).toContain(JSON.stringify(TOY_INSTRUCTION.trim()).slice(1, -1));
    const written = JSON.parse(readFileSync(join(h.out, '_toy.json'), 'utf8'));
    expect(written).toMatchObject({ task_id: '_toy', status: 'COMPLETED', findings: FINDINGS.findings, problem: null, trajectory: '_toy.jsonl' });
    expect(h.text()).toMatch(/^probe _toy: 1 finding, 2 turns, 1 tool calls/m);
    // A recorded probe is not run again.
    expect(await h.probe([])).toBe(0);
    expect(t.bodies).toHaveLength(2);
  });

  it('a last answer that is not the findings JSON fails the probe and keeps the text as problem', async () => {
    const t = scriptedTransport([{ text: 'I found two problems.' }]);
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('P') });
    expect(await h.probe([])).toBe(1);
    expect(JSON.parse(readFileSync(join(h.out, '_toy.json'), 'utf8'))).toMatchObject({ findings: null, problem: expect.stringContaining('not the findings JSON') });
  });

  it('takes the last fenced block or the last JSON object after prose (r2 F2)', async () => {
    const fenced = scriptedTransport([{ text: `Here is what I found.\n\n\`\`\`json\n${JSON.stringify(FINDINGS)}\n\`\`\`` }]);
    const a = harness(fenced.transport, { ANTHROPIC_API_KEY: fakeKey('P') });
    expect(await a.probe([])).toBe(0);
    expect(JSON.parse(readFileSync(join(a.out, '_toy.json'), 'utf8')).findings).toEqual(FINDINGS.findings);
    const bare = scriptedTransport([{ text: `I read the instruction {and the policy}. Findings:\n${JSON.stringify(FINDINGS)}` }]);
    const b = harness(bare.transport, { ANTHROPIC_API_KEY: fakeKey('P') });
    expect(await b.probe([])).toBe(0);
    expect(JSON.parse(readFileSync(join(b.out, '_toy.json'), 'utf8')).findings).toEqual(FINDINGS.findings);
  });

  it('runs a recorded probe again when its findings are null (r2 F1)', async () => {
    const t = scriptedTransport([{ text: 'I found two problems.' }, { text: JSON.stringify(FINDINGS) }]);
    const h = harness(t.transport, { ANTHROPIC_API_KEY: fakeKey('P') });
    expect(await h.probe([])).toBe(1);
    expect(await h.probe([])).toBe(0);
    expect(t.bodies).toHaveLength(2);
    expect(JSON.parse(readFileSync(join(h.out, '_toy.json'), 'utf8')).findings).toEqual(FINDINGS.findings);
  });

  it('--dry-run makes no call, opens no ledger and prints the projection', async () => {
    const fetch = vi.fn<Transport>();
    const h = harness(fetch);
    expect(await h.probe(['--dry-run'])).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(h.text()).toMatch(/^probe dry run: _toy: 1 probe with 2 read tools, per-trial cap \$6\.00$/m);
    expect(h.text()).toContain(`LIVE_PROJECTION_USD=${PER_TRIAL_CAP_USD.toFixed(6)}`);
    expect(existsSync(join(h.home, 'spend.jsonl'))).toBe(false);
    expect(existsSync(join(h.out, '_toy.json'))).toBe(false);
  });

  it('with ledger + projection = PROJECTED_CAP_USD + $0.01 it is refused with 0 calls and no ledger row', async () => {
    const fetch = vi.fn<Transport>();
    const dry = harness(fetch);
    expect(await dry.probe(['--dry-run'])).toBe(0);
    const projection = Number(/^LIVE_PROJECTION_USD=(\d+\.\d{6})$/m.exec(dry.text())![1]);
    const dir = tempDir('probe-ledger');
    write(dir, 'spend.jsonl', seed(Number((PROJECTED_CAP_USD + 0.01 - projection).toFixed(6))));
    const h = harness(fetch, { SPEND_LEDGER: join(dir, 'spend.jsonl'), ANTHROPIC_API_KEY: fakeKey('P') });
    expect(await h.probe([])).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(h.text()).toContain(`probe: refused before any call (ledger + projection would pass PROJECTED_CAP_USD $${PROJECTED_CAP_USD})`);
    expect(h.text()).toContain(`= $${(PROJECTED_CAP_USD + 0.01).toFixed(2)} > $${PROJECTED_CAP_USD}`);
    expect(readFileSync(join(dir, 'spend.jsonl'), 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
    expect(existsSync(join(h.out, '_toy.json'))).toBe(false);
  });
});
