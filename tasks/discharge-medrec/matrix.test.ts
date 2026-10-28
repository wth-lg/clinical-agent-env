// G8 (sources_before_orders) reads the text a step showed (exposure.ts shows()), so a
// search_notes snippet that shows the addendum's correction counts and one that cuts it off does
// not. The declared phrase must occur in what the tools return for the addendum, or even a full
// read would count as not shown (reports/verifier-phase-exposure-2.md, phrase authoring); the
// tool tests run the read tools on the built world. Declared losses are checked by the matrix
// itself (pnpm cli matrix).
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../cli/matrix.ts';
import { clock } from '../../packages/env/clock.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../packages/env/tools/read/index.ts';
import { callTool } from '../../packages/env/tools/registry.ts';
import type { GateCtx, Step } from '../../packages/grader/check.ts';
import { firstShown, shows, stepsOf } from '../../packages/grader/exposure.ts';
import { trajectory } from '../../packages/grader/test/helpers.ts';
import { expected } from './expected.ts';
import { addendum, summaries } from './solution/steps.ts';
import { checks } from './tests/grader.ts';

const g8 = checks.find((c) => c.id === 'sources_before_orders')!;
const met = async (ctx: GateCtx) => (g8.kind === 'gate' ? (await g8.fn(ctx)).met : null);
const ADD = expected.sources.addendum;
const PHRASE = expected.sources.correction;

describe('the addendum correction as the read tools show it', async () => {
  const ctx: ReadContext = { world: await loadStore(matrixEnv().world), clock, policies: [], catalog: [] };
  const stepsFor = (...calls: Array<{ name: string; input: unknown }>) =>
    stepsOf(trajectory(calls.map(({ name, input }) => {
      const r = callTool(READ_TOOLS, name, input, ctx);
      return { name, input, content: r.content, exposed: r.exposed_ids, referenced: r.referenced_ids };
    })));

  it('G8 declares the correction as the decisive phrase of the addendum', () => {
    expect(g8.decisive_phrases).toEqual({ [ADD]: PHRASE });
  });
  it('a fhir_read of the addendum shows the correction', () => {
    const steps = stepsFor(addendum);
    expect(steps[0]!.exposed_ids).toContain(ADD);
    expect(shows(steps, ADD, 2, PHRASE)).toBe(true);
  });
  it('the discharge-summary search_notes snippet shows it without exposing the addendum', () => {
    const steps = stepsFor(summaries);
    expect(steps[0]!.referenced_ids).toContain(ADD);
    expect(steps[0]!.exposed_ids).not.toContain(ADD);
    expect(steps[0]!.shown[ADD]).toContain('Correction: spironolactone 25 mg daily');
    expect(firstShown(steps, ADD, PHRASE)).toBe(1);
    expect(shows(steps, ADD, 1, PHRASE)).toBe(false);
  });
});

describe('sources_before_orders reads the text shown', () => {
  const SCR = expected.scr.id;
  const SPIRO = 'MedicationRequest/new-spiro';
  // Step 1 reads the creatinine, step 2 is a notes search or read, step 3 orders spironolactone.
  const ctxWith = (second: Partial<Step>): GateCtx => {
    const step = (n: number, s: Partial<Step>): Step => ({ n, seq: n, turn: n, tool: 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...s });
    const steps = [step(1, { exposed_ids: [SCR] }), step(2, second), step(3, { tool: 'order_medication', written_ids: [SPIRO] })];
    const spiro = { resourceType: 'MedicationRequest', id: 'new-spiro', status: 'active', subject: { reference: expected.patient }, medicationCodeableConcept: { text: 'spironolactone 25 MG Oral Tablet' } };
    const final = { get: (type: string, id: string) => (`${type}/${id}` === SPIRO ? spiro : undefined) };
    return { steps, final, exposedAt: (id: string) => steps.find((s) => s.exposed_ids.includes(id))?.n ?? null } as unknown as GateCtx;
  };

  it('passes when a search_notes snippet showed the correction before the order', async () => {
    expect(await met(ctxWith({ tool: 'search_notes', referenced_ids: [ADD], shown: { [ADD]: '…Correction: spironolactone 25 mg daily, not 12.5 m…' } }))).toBe(true);
  });
  it('fails when the snippet cut the correction off', async () => {
    expect(await met(ctxWith({ tool: 'search_notes', referenced_ids: [ADD], shown: { [ADD]: '…Discharge Summary Addendum (signed) Patient: Walter Kim…' } }))).toBe(false);
  });
  it('fails when nothing showed the addendum', async () => {
    expect(await met(ctxWith({ tool: 'search_notes', shown: {} }))).toBe(false);
  });
});
