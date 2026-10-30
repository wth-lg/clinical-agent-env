// Double derivation for T5 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the dose times must be the ones the design
// computes by hand from the Monday 09:00 slot. The matrix checks the same equality; this test
// shows it on its own.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { derive } from './policy.ts';
import { id, ref } from './ids.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };

describe('contrast-ct-prep', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('counts 13, 7 and 1 hours back from the 09:00 Monday scan, across midnight', () => {
    const scan = Date.parse('2026-10-26T09:00:00-04:00');
    const back = (h: number) => new Date(scan - h * 3_600_000).toISOString();
    // 13 hours before 09:00 Monday is 20:00 Sunday; 7 hours is 02:00 Monday.
    expect([13, 7, 1].map(back)).toEqual(['2026-10-26T00:00:00.000Z', '2026-10-26T06:00:00.000Z', '2026-10-26T12:00:00.000Z']);
    const d = derive(world) as typeof expected;
    expect(d.prednisone.at).toEqual(['2026-10-25T20:00:00-04:00', '2026-10-26T02:00:00-04:00', '2026-10-26T08:00:00-04:00']);
    expect(d.diphenhydramine.at).toEqual(['2026-10-26T08:00:00-04:00']);
  });

  it('premedicates for the contrast reaction only, and needs a new creatinine', () => {
    const d = derive(world) as typeof expected;
    expect(d.contrast_allergy.id).toBe(ref('AllergyIntolerance/alg-t5-iohexol'));
    expect(d.regimen).toBe('premedicate');
    expect(d.other_allergies).toContain(ref('AllergyIntolerance/alg-t5-shellfish'));
    expect(d.other_allergies).toContain(ref('AllergyIntolerance/alg-t5-pvp'));
    // The last creatinine (2025-08-14) is more than 30 days before the scan.
    expect(d.creatinine).toMatchObject({ latest: ref('Observation/obs-t5-scr-0924'), required: true, current: false });
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('contrast-ct-prep');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = ['8:00 PM', '2:00 AM', '20:00', '02:00', '2026-10-25'];
    const findings = lintWorld(all, [{ source: 'contrast-ct-prep', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-RAD-07', text })) } } }]);
    expect(findings).toEqual([]);
  });

  // R14-06 (P18o): L2, an outside CMP of 2026-09-24 is the latest creatinine, 29 days before NOW
  // but 32 before the scan, so §4 still needs a new one; L1', the allergy list labels the 2019
  // reaction severe ('anaphylaxis (patient report)', added 2021) while the report of the day grades
  // it moderate, and §1 grades by the record made at the time.
  it('counts the 30 days back from the scan and grades the reaction by the report of the day', () => {
    const d = derive(world) as typeof expected;
    expect(d.creatinine).toEqual({ latest: ref('Observation/obs-t5-scr-0924'), date: '2026-09-24', required: true, current: false, before: '2026-10-26T09:00:00-04:00' });
    const allergy = store.get('AllergyIntolerance', id('alg-t5-iohexol')) as Extract<(typeof all)[number], { resourceType: 'AllergyIntolerance' }>;
    expect((allergy.reaction ?? []).map((r) => r.severity)).toContain('severe');
    expect(d.contrast_allergy.severity).toBe('moderate');
    expect(d.regimen).toBe('premedicate');
  });

  // P19 (researcher-16 T5 lever): the faxed St. Brigid ED discharge summary of 10/17 records a
  // prerenal AKI, creatinine 1.94 on arrival and 1.46 at discharge against a baseline of about 1.0,
  // not back to baseline. §4: a creatinine drawn during AKI does not establish kidney function;
  // §6: hold metformin. The values sit only in the faxed text, and the text avoids the words of the
  // pilot-1 note searches ('contrast', 'reaction', 'CT').
  it('reads the unresolved AKI from the outside ED summary and holds metformin', () => {
    const d = derive(world) as typeof expected;
    expect(d.aki).toEqual({ note: ref('DocumentReference/doc-t5-ed-1017'), date: '2026-10-17', discharge_mg_dl: 1.46, baseline_mg_dl: 1, resolved: false });
    expect(d.metformin).toEqual({ id: ref('MedicationRequest/mr-t5-metformin'), hold: true });
    expect(d.creatinine).toMatchObject({ latest: ref('Observation/obs-t5-scr-0924'), required: true, current: false });
    const doc = store.get('DocumentReference', id('doc-t5-ed-1017')) as { content: Array<{ attachment: { data: string } }>; context?: { encounter?: Array<{ reference?: string }> } };
    const text = new TextDecoder().decode(Uint8Array.from(atob(doc.content[0]!.attachment.data), (c) => c.charCodeAt(0)));
    expect(text).not.toMatch(/\b(?:contrast|reaction|ct)\b/i);
    expect(doc.context?.encounter?.[0]?.reference).toBe(ref('Encounter/enc-t5-ed-1016'));
    expect(store.get('Encounter', id('enc-t5-ed-1016'))).toMatchObject({ status: 'finished', serviceProvider: { reference: 'Organization/org-st-brigid' } });
    // No Observation or Condition carries the outside values.
    const own = (r: (typeof all)[number]) => (r as { subject?: { reference?: string } }).subject?.reference === 'Patient/pt-0015';
    expect(all.filter((r) => (r.resourceType === 'Observation' || r.resourceType === 'Condition') && own(r) && /^2026-10-1[67]/.test(String((r as { effectiveDateTime?: string; onsetDateTime?: string }).effectiveDateTime ?? (r as { onsetDateTime?: string }).onsetDateTime ?? '')))).toEqual([]);
  });

  // builder-187 (verifier-phase-P19-T5-2 M1, ruling 438): evidence_before_orders wants the ED
  // summary seen before the metformin decision, so §6 says to read outside records first.
  it('RBC-RAD-07 §6 says to read outside emergency department records before deciding on metformin', async () => {
    const policy = (await nodeTaskSource({ testMode: false }).get('contrast-ct-prep')).policies.find((p) => p.id === 'RBC-RAD-07')!.text;
    const six = policy.slice(policy.indexOf('§6 Metformin'));
    expect(six).toMatch(/Before deciding on metformin, read the patient's recent outside records, including any emergency department summary, for acute kidney injury\./);
  });
});
