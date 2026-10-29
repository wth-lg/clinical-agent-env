// G8 (sources_before_orders) reads the text a step showed (exposure.ts shows()), so a
// search_notes snippet that shows the addendum's correction counts and one that cuts it off does
// not; the same holds for the summary line each other change comes from (P17 builder-145). The declared phrase must occur in what the tools return for the addendum, or even a full
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
import { checkText } from '../discharge-medrec.check-text.ts';
import { addendum, PT, summaries, summary } from './solution/steps.ts';
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

  it('G8 declares the correction as the decisive phrase of the addendum, and the outside lab report\'s potassium line (P19, RBC-TOC-02 §7)', () => {
    expect(g8.decisive_phrases).toEqual({ [ADD]: PHRASE, [expected.k.id]: 'Potassium 5.4 mmol/L' });
  });
  it('a fhir_read of the outside lab report shows the potassium and creatinine lines; the creatinine snippet does not show the potassium (P19)', () => {
    const read = stepsFor({ name: 'fhir_read', input: { resource_type: 'DocumentReference', id: 'doc-t4-lab-1021' } });
    expect(shows(read, expected.k.id, 2, expected.k.line)).toBe(true);
    expect(shows(read, expected.scr.id, 2, expected.scr.line)).toBe(true);
    const snippet = stepsFor({ name: 'search_notes', input: { query: 'creatinine', patient: PT } });
    expect(firstShown(snippet, expected.k.id, expected.k.line)).toBe(null);
  });
  it("a notes search for 'creatinine' shows the outside lab report's creatinine line (P18o R14-07 L2)", () => {
    const steps = stepsFor({ name: 'search_notes', input: { query: 'creatinine', patient: PT } });
    expect(firstShown(steps, expected.scr.id, expected.scr.line)).toBe(1);
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
  it('a fhir_read of the summary shows every source line', () => {
    const steps = stepsFor(summary);
    for (const line of Object.values(expected.sources.lines)) expect(shows(steps, expected.sources.summary, 2, line)).toBe(true);
  });
  it("the 'lisinopril' and 'resume' snippets show the lines without exposing the summary (alternative snippet_only_sources)", () => {
    const steps = stepsFor({ name: 'search_notes', input: { query: 'lisinopril', patient: PT } }, { name: 'search_notes', input: { query: 'resume', patient: PT } });
    expect(steps.flatMap((s) => s.exposed_ids)).not.toContain(expected.sources.summary);
    expect(firstShown(steps, expected.sources.summary, expected.sources.lines.furosemide)).toBe(1);
    expect(firstShown(steps, expected.sources.summary, expected.sources.lines.potassium_chloride)).toBe(2);
    expect(firstShown(steps, expected.sources.summary, expected.sources.lines.lisinopril)).toBe(2);
  });
  it("the drug-name snippets show every source without exposing either document (alternative natural_snippet_queries)", () => {
    const steps = stepsFor(...['furosemide', 'potassium chloride', 'lisinopril', 'spironolactone'].map((query) => ({ name: 'search_notes', input: { query, patient: PT } })));
    expect(steps.flatMap((s) => s.exposed_ids)).not.toContain(expected.sources.summary);
    expect(steps.flatMap((s) => s.exposed_ids)).not.toContain(ADD);
    expect(firstShown(steps, expected.sources.summary, expected.sources.lines.furosemide)).toBe(3);
    expect(firstShown(steps, expected.sources.summary, expected.sources.lines.potassium_chloride)).toBe(2);
    expect(firstShown(steps, expected.sources.summary, expected.sources.lines.lisinopril)).toBe(4);
    expect(firstShown(steps, ADD, PHRASE)).toBe(4);
  });
  it("the lisinopril source is the resume rule: no drug-name snippet shows the whole line, and 'spironolactone' shows the rule cut before 'Lisinopril:'", () => {
    const steps = stepsFor(...['lisinopril', 'spironolactone', 'potassium chloride'].map((query) => ({ name: 'search_notes', input: { query, patient: PT } })));
    expect(expected.sources.lines.lisinopril).toBe('Resume home 10 mg daily when SCr < 1.5');
    expect(firstShown(steps, expected.sources.summary, 'Lisinopril: held for AKI. Resume home 10 mg daily when SCr < 1.5 on post-discharge labs.')).toBe(null);
    expect(steps[1]!.shown[expected.sources.summary]).toMatch(/^…held for AKI\. Resume home 10 mg daily when SCr < 1\.5/);
    expect(firstShown(steps, expected.sources.summary, 'Lisinopril: held for AKI')).toBe(null);
  });
  it("the 'furosemide' snippet cuts the summary before the furosemide dose, so it shows no source line (the FAIL is right)", () => {
    const steps = stepsFor({ name: 'search_notes', input: { query: 'furosemide', patient: PT } });
    expect(steps[0]!.shown[expected.sources.summary]).toMatch(/Discharge medications: - Furos…$/);
    for (const line of Object.values(expected.sources.lines)) expect(firstShown(steps, expected.sources.summary, line)).toBe(null);
  });
});

describe('sources_before_orders reads the text shown', () => {
  const SCR = expected.scr.id;
  const SPIRO = 'MedicationRequest/new-spiro';
  // Step 1 reads the outside lab report (its potassium line, §7), step 2 is a notes search or read,
  // step 3 orders spironolactone.
  const ctxWith = (second: Partial<Step>): GateCtx => {
    const step = (n: number, s: Partial<Step>): Step => ({ n, seq: n, turn: n, tool: 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...s });
    const steps = [step(1, { exposed_ids: [SCR], shown: { [SCR]: 'Potassium         5.4 mmol/L    (3.5-5.1) H' } }), step(2, second), step(3, { tool: 'order_medication', written_ids: [SPIRO] })];
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

describe('sources_before_orders ties every medication order write to its source', () => {
  const SUM = expected.sources.summary;
  const SCR = expected.scr.id;
  const L = expected.sources.lines;
  const MEDS: Record<string, string> = { furosemide: 'furosemide 40 MG Oral Tablet', kcl: 'potassium chloride 20 MEQ Extended Release Oral Tablet', lisinopril: 'lisinopril 10 MG Oral Tablet', panto: 'pantoprazole 40 MG Delayed Release Oral Tablet' };
  const step = (n: number, s: Partial<Step>): Step => ({ n, seq: n, turn: n, tool: 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...s });
  // Steps before the write, then one order write of `drug` (a key of MEDS).
  const ctxWith = (drug: string, before: Array<Partial<Step>>): GateCtx => {
    const key = `MedicationRequest/mr-${drug}`;
    const steps = [...before.map((s, i) => step(i + 1, s)), step(before.length + 1, { tool: 'change_medication', written_ids: [key, 'Provenance/prov-1'] })];
    const med = { resourceType: 'MedicationRequest', id: `mr-${drug}`, status: 'active', subject: { reference: expected.patient }, medicationCodeableConcept: { text: MEDS[drug] } };
    const final = { get: (type: string, id: string) => (`${type}/${id}` === key ? med : undefined) };
    return { steps, final, exposedAt: (id: string) => steps.find((s) => s.exposed_ids.includes(id))?.n ?? null } as unknown as GateCtx;
  };
  const grade = async (ctx: GateCtx) => (g8.kind === 'gate' ? await g8.fn(ctx) : null);
  const late = async (ctx: GateCtx) => (await grade(ctx))?.evidence.late;

  it('fails a furosemide change made before anything was read, naming the change, the summary line and RBC-TOC-02 §1 (exploit run 0)', async () => {
    const v = (await grade(ctxWith('furosemide', [])))!;
    expect(v.met).toBe(false);
    expect(v.evidence.late).toEqual([{ change: 'furosemide', id: SUM, line: L.furosemide, policy: 'RBC-TOC-02 §1', step: 1 }]);
    expect(checkText.sources_before_orders!.found(v.evidence)).toBe(`the furosemide order at step 1 came before "${L.furosemide}" in ${SUM} was shown (RBC-TOC-02 §1)`);
  });
  it('fails a potassium chloride stop when only the addendum and the creatinine were read (exploit run 1)', async () => {
    const add = { exposed_ids: [ADD], shown: { [ADD]: 'Correction: spironolactone 25 mg daily, not 12.5 mg.' } };
    expect(await late(ctxWith('kcl', [add, { exposed_ids: [SCR] }]))).toEqual([{ change: 'potassium chloride', id: SUM, line: L.potassium_chloride, policy: 'RBC-TOC-02 §1', step: 3 }]);
  });
  it('passes a change once a snippet showed its summary line, without the summary exposed', async () => {
    expect((await grade(ctxWith('furosemide', [{ tool: 'search_notes', referenced_ids: [SUM], shown: { [SUM]: `…Discharge medications: - ${L.furosemide} - Metoprolol XL 5…` } }])))!.met).toBe(true);
    expect((await grade(ctxWith('kcl', [{ tool: 'search_notes', referenced_ids: [SUM], shown: { [SUM]: `…Furosemide 40 mg by mouth daily (increas…` } }])))!.met).toBe(false);
  });
  // The creatinine and the potassium are lines of the outside lab report (P18o R14-07 L2; P19 §7):
  // the report shown without a line does not count for that line.
  const SCR_SHOWN = { tool: 'search_notes', referenced_ids: [SCR], shown: { [SCR]: '…Urea nitrogen 24 mg/dL (8-23) H Creatinine 1.32 mg/dL (0.74-1.35) Glucose 112 mg/dL…' } };
  const K_SHOWN = { tool: 'search_notes', referenced_ids: [SCR], shown: { [SCR]: '…Sodium 138 mmol/L (136-145) Potassium 5.4 mmol/L (3.5-5.1) H…' } };
  const K_LATE = (step: number) => ({ change: 'lisinopril', id: SCR, line: expected.k.line, policy: 'RBC-TOC-02 §7', step });
  it('fails a lisinopril write until the summary rule, the creatinine (§2) and the potassium (§7) were all shown', async () => {
    const rule = { tool: 'search_notes', shown: { [SUM]: `- ${L.lisinopril} -` } };
    expect(await late(ctxWith('lisinopril', [rule]))).toEqual([{ change: 'lisinopril', id: SCR, line: expected.scr.line, policy: 'RBC-TOC-02 §2', step: 2 }, K_LATE(2)]);
    expect(await late(ctxWith('lisinopril', [rule, K_SHOWN]))).toEqual([{ change: 'lisinopril', id: SCR, line: expected.scr.line, policy: 'RBC-TOC-02 §2', step: 3 }]);
    expect(await late(ctxWith('lisinopril', [rule, SCR_SHOWN]))).toEqual([K_LATE(3)]);
    expect((await grade(ctxWith('lisinopril', [rule, SCR_SHOWN, K_SHOWN])))!.met).toBe(true);
  });
  it("passes a lisinopril write once a snippet showed the resume rule cut before 'Lisinopril:', and fails it on the hospital course alone", async () => {
    const rule = { tool: 'search_notes', referenced_ids: [SUM], shown: { [SUM]: '…held for AKI. Resume home 10 mg daily when SCr < 1.5 on post-discharge labs. - Spironolactone 12.5 mg by mouth daily: start…' } };
    expect((await grade(ctxWith('lisinopril', [rule, SCR_SHOWN, K_SHOWN])))!.met).toBe(true);
    const course = { tool: 'search_notes', referenced_ids: [SUM], shown: { [SUM]: '…with diuresis and lisinopril, and lisinopril was held. Euvolemic at discharge…' } };
    expect(await late(ctxWith('lisinopril', [course, SCR_SHOWN, K_SHOWN]))).toEqual([{ change: 'lisinopril', id: SUM, line: L.lisinopril, policy: 'RBC-TOC-02 §1', step: 4 }]);
  });
  it('fails an order of any other drug written before the summary was exposed', async () => {
    expect(await late(ctxWith('panto', [{ tool: 'search_notes', referenced_ids: [SUM], shown: { [SUM]: '…Pantoprazole 40 mg by mouth daily. Inpatient formulary substitutions: pantoprazole 40 mg daily was given in place of home omeprazole…' } }]))).toEqual([{ change: 'other', id: SUM, line: null, policy: 'RBC-TOC-02 §1', step: 2 }]);
    expect((await grade(ctxWith('panto', [{ exposed_ids: [SUM] }])))!.met).toBe(true);
  });
});
