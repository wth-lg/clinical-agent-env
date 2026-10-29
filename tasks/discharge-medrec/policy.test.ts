// Double derivation for T4 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the decisive facts must be the design's. The
// matrix checks the same equality; this test shows it on its own.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { derive } from './policy.ts';
import { OLD_SUMMARY } from './tests/rubric.ts';
import { noteText, ORACLE_NOTE } from './solution/steps.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const decode = (data: string | undefined) => new TextDecoder().decode(Uint8Array.from(atob(data ?? ''), (c) => c.charCodeAt(0)));
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };

describe('discharge-medrec', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('resumes lisinopril on the post-discharge creatinine and takes the addendum over the summary', () => {
    const d = derive(world) as unknown as typeof expected;
    expect(d.scr).toEqual({ id: 'DocumentReference/doc-t4-lab-1021', mg_dl: 1.32, threshold: 1.5, line: 'Creatinine 1.32 mg/dL' });
    expect(d.lisinopril.action).toBe('resume');
    expect(d.spironolactone.daily_mg).toBe(25);
    expect(d.message_about).toEqual(['MedicationRequest/mr-t4-metoprolol-tart']);
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('discharge-medrec');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = ['25 mg daily, not 12.5', 'SCr 1.32'];
    const findings = lintWorld(all, [{ source: 'discharge-medrec', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-TOC-02', text })) } } }]);
    expect(findings).toEqual([]);
  });

  // Rules, not text shapes: an amended lab report is a valid result (§2), and a brand name on a
  // discharge line reads as the chart's drug (§4) through normalize.ts.
  it('derives the same from an amended lab report and a brand name for metoprolol succinate', () => {
    const swap = (r: (typeof all)[number]) => {
      if (r.resourceType === 'DocumentReference' && r.id === 'doc-t4-lab-1021') return { ...r, docStatus: 'amended' as const };
      if (r.resourceType === 'DocumentReference' && r.id === 'doc-t4-dc-1019') {
        const text = new TextDecoder().decode(Uint8Array.from(atob(r.content[0]!.attachment.data!), (c) => c.charCodeAt(0))).replace('Metoprolol XL 50 mg', 'Toprol XL 50 mg');
        const data = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
        return { ...r, content: [{ ...r.content[0]!, attachment: { ...r.content[0]!.attachment, data } }] };
      }
      return r;
    };
    const changed = all.map(swap);
    const view: WorldView = { get: (type, id) => changed.find((r) => r.resourceType === type && r.id === id), all: (type) => (type === undefined ? changed : changed.filter((r) => r.resourceType === type)) };
    expect(derive(view)).toEqual(expected);
  });

  it('names a PCP, leaves the AKI unresolved and drops the Synthea leftovers the story contradicts', () => {
    const pt = store.get('Patient', 'pt-0005');
    expect(pt?.resourceType === 'Patient' && pt.generalPractitioner).toEqual([{ reference: 'Practitioner/pr-okafor' }]);
    const aki = store.get('Condition', 'cond-t4-aki');
    expect(aki?.resourceType === 'Condition' && [aki.clinicalStatus?.coding?.[0]?.code, aki.abatementDateTime]).toEqual(['active', undefined]);
    for (const id of ['cond-00139', 'cond-00141', 'cond-00151']) expect(store.get('Condition', id)).toBeUndefined();
  });

  it('dates and justifies the orders consistently with the 2025 summary', () => {
    const succ = store.get('MedicationRequest', 'mr-t4-metoprolol-succ');
    expect(succ?.resourceType === 'MedicationRequest' && (succ.authoredOn ?? '') < '2025-03-02').toBe(true);
    const lis = store.get('MedicationRequest', 'mr-t4-lisinopril');
    expect(lis?.resourceType === 'MedicationRequest' && JSON.stringify(lis.reasonCode)).not.toMatch(/hypertension/i);
    // Both 2024 orders predate the 2025 heart-failure diagnosis, so they give his long-standing ischemic heart disease.
    const ihd = store.get('Condition', 'cond-00142');
    expect(ihd?.resourceType === 'Condition' && [ihd.code?.text?.startsWith('Ischemic heart disease'), ihd.clinicalStatus?.coding?.[0]?.code, (ihd.onsetDateTime ?? '') < '2024-02-06']).toEqual([true, 'active', true]);
    for (const mr of [succ, lis]) expect(mr?.resourceType === 'MedicationRequest' && mr.reasonCode).toEqual([{ text: 'Ischemic heart disease' }]);
  });

  it('flags a note that uses the March 2025 summary by any name, and not the oracle note', () => {
    for (const t of ['Per the March 2025 summary furosemide stays at 20 mg.', 'Per the 3/6 discharge summary.', "Per last year's discharge summary, KCl continues.", 'See doc-t4-dc-2025.', 'Echocardiogram in 3 months.', 'Potassium chloride 20 mEq daily: start.', 'Per the older St. Brigid summary.']) expect(OLD_SUMMARY.test(t), t).toBe(true);
    expect(OLD_SUMMARY.test(noteText(ORACLE_NOTE))).toBe(false);
  });

  // R14-07 (P18o): L2, the post-discharge BMP is in the chart only as the outside lab's report,
  // so §2's condition is read from that document; L1, the pantoprazole line carries no marker and
  // the substitution is stated in its own section of the summary.
  it('reads the post-discharge creatinine from the outside lab report and the substitution off the medication line', () => {
    const after = all.filter((r) => r.resourceType === 'Observation' && r.subject?.reference === 'Patient/pt-0005' && (r.code?.coding ?? []).some((c) => c.code === '2160-0') && Date.parse(r.effectiveDateTime ?? '') > Date.parse('2026-10-19T11:02:00-04:00'));
    expect(after.map((r) => r.id)).toEqual([]);
    const d = derive(world) as unknown as typeof expected;
    expect(d.scr).toEqual({ id: 'DocumentReference/doc-t4-lab-1021', mg_dl: 1.32, threshold: 1.5, line: 'Creatinine 1.32 mg/dL' });
    expect(d.lisinopril.action).toBe('resume');
    const summary = store.get('DocumentReference', 'doc-t4-dc-1019') as Extract<(typeof all)[number], { resourceType: 'DocumentReference' }>;
    const lines = decode(summary.content[0]!.attachment.data).split('\n');
    const panto = lines.filter((l) => /pantoprazole/i.test(l));
    expect(panto.find((l) => l.startsWith('- '))).toBe('- Pantoprazole 40 mg by mouth daily.');
    expect(panto.some((l) => !l.startsWith('- ') && /formulary substitution/i.test(l) && /omeprazole/i.test(l))).toBe(true);
    expect(d.not_ordered).toEqual(['pantoprazole']);
  });
});
