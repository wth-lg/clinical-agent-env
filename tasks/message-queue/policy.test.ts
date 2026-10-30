// Double derivation for T6 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, item by item, and each item's decisive facts must be
// the ones the design names. The matrix checks the same equality; this test shows it on its own.
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
const d = derive(world) as typeof expected;

describe('message-queue', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(d).toEqual(expected);
  });

  it('decides each item the way the design does', () => {
    expect(d.items).toHaveLength(6);
    // M1: our BMP is 45 days past 12 months, but the most recent BMP from any source is the St.
    // Brigid pre-admission report with potassium 5.8: no refill, a Task to the PCP (P19).
    expect(d.m1).toMatchObject({ action: 'task_pcp', bmp: ref('DocumentReference/doc-t6-hayes-0708'), bmp_date: '2026-07-08', potassium: 5.8, pcp: 'Practitioner/pr-okafor' });
    // M2: a note after the order says the drug was stopped: no refill, a Task to the PCP.
    expect(d.m2).toMatchObject({ action: 'task_pcp', conflict_note: ref('DocumentReference/doc-t6-odum-0811') });
    // Labels follow id order, which is patient order: Park (pt-0028, the designers' M4) is m3 and
    // Brooks (pt-0029, M3) is m4.
    // M4 Park: 12 notes in the 3-year window; the reaction is in the scanned urgent-care note only.
    expect(d.m3).toMatchObject({ action: 'hold', notes_in_window: 12, reaction_note: ref('DocumentReference/doc-t6-park-240309') });
    expect(d.m4.action).toBe('triage');
    expect(d.m5).toMatchObject({ action: 'renew', supply_days: 90, refills: 1 });
    expect(d.m6.action).toBe('route');
  });

  // Synthea charted Hayes's pregnancy; an ACE inhibitor is contraindicated in pregnancy, so a
  // pregnancy left in the chart makes holding the M1 refill the right answer (T6-findings-1 B1).
  it('charts no T6 patient on an ACE inhibitor as pregnant', () => {
    const SLOTS = ['pt-0026', 'pt-0027', 'pt-0028', 'pt-0029', 'pt-0030', 'pt-0031'].map((p) => `Patient/${p}`);
    type R = { resourceType: string; id?: string; status?: string; subject?: { reference?: string }; medicationCodeableConcept?: { text?: string; coding?: Array<{ display?: string }> }; code?: { text?: string; coding?: Array<{ code?: string; display?: string }> }; valueCodeableConcept?: { coding?: Array<{ code?: string }> }; clinicalStatus?: { coding?: Array<{ code?: string }> } };
    const rs = all as R[];
    const onAce = SLOTS.filter((p) => rs.some((r) => r.resourceType === 'MedicationRequest' && r.subject?.reference === p && r.status === 'active' && /\b(?:lisinopril|enalapril|ramipril|benazepril)\b/i.test(JSON.stringify(r.medicationCodeableConcept))));
    expect(onAce).toContain('Patient/pt-0026');
    const pregnant = rs.filter(
      (r) =>
        onAce.includes(r.subject?.reference ?? '') &&
        ((r.resourceType === 'Observation' && (r.code?.coding ?? []).some((c) => c.code === '82810-3') && (r.valueCodeableConcept?.coding ?? []).some((c) => c.code === '77386006')) ||
          (r.resourceType === 'Condition' && r.clinicalStatus?.coding?.[0]?.code === 'active' && /pregnan|obstetric|prenatal/i.test(JSON.stringify(r.code)))),
    );
    expect(pregnant.map((r) => `${r.resourceType}/${r.id}`)).toEqual([]);
  });

  // policy.ts reads every requested messages item Dr. Okafor owns; an item another task adds to
  // that queue would change T6's answer, so the queue is pinned here (review M3).
  it("Dr. Okafor's messages queue holds exactly the six T6 items", () => {
    type T = { resourceType: string; id?: string; status?: string; owner?: { reference?: string }; code?: { coding?: Array<{ system?: string; code?: string }> } };
    const queue = (all as T[]).filter((r) => r.resourceType === 'Task' && r.status === 'requested' && r.owner?.reference === 'Practitioner/pr-okafor' && (r.code?.coding ?? []).some((c) => c.system === 'urn:riverbend:inbox-queue' && c.code === 'messages'));
    expect(queue.map((r) => r.id).sort()).toEqual([id('task-t6-m1'), id('task-t6-m2'), id('task-t6-m3'), id('task-t6-m4'), id('task-t6-m5'), id('task-t6-m6')].sort());
  });

  // RBC-RX-05 §3 routes to "the patient's PCP": the chart names one for every T6 patient.
  it('names Dr. Okafor as the PCP of each T6 patient', () => {
    for (const p of ['pt-0026', 'pt-0027', 'pt-0028', 'pt-0029', 'pt-0030', 'pt-0031']) {
      expect((store.get('Patient', p) as { generalPractitioner?: Array<{ reference?: string }> }).generalPractitioner).toEqual([{ reference: 'Practitioner/pr-okafor' }]);
    }
  });

  // The overlay cannot read instruction.md or the policy files, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('message-queue');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = [id('doc-t6-park-240309'), 'Augmentin', '2024-03-09', id('mr-t6-atorvastatin'), id('doc-t6-hayes-0708'), '5.8', 'pre-admission'];
    const findings = lintWorld(all, [{ source: 'message-queue', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : task.policies[i - 1]!.id, text })) } } }]);
    expect(findings).toEqual([]);
  });

  // P19 (researcher-16 T6): the report is found only by looking at her documents. It never names
  // the drug, so search_notes 'lisinopril' misses it, and no Observation, DiagnosticReport or
  // Encounter stands behind it; it says the specimen was not hemolyzed, so the potassium is not
  // the hemolysed value of results-inbox.
  it("keeps Gloria Hayes's pre-admission BMP out of every search but her documents", () => {
    type D = { resourceType: string; id?: string; subject?: { reference?: string }; date?: string; effectiveDateTime?: string; content?: Array<{ attachment?: { data?: string } }> };
    const doc = store.get('DocumentReference', id('doc-t6-hayes-0708')) as D;
    const text = new TextDecoder().decode(Uint8Array.from(atob(doc.content![0]!.attachment!.data!), (c) => c.charCodeAt(0)));
    expect(text).toMatch(/Potassium 5\.8 mmol\/L/);
    expect(text).toMatch(/not hemolyzed/);
    expect(text).not.toMatch(/lisinopril|ACE/i);
    const sameDay = (all as D[]).filter((r) => r.subject?.reference === 'Patient/pt-0026' && ['Observation', 'DiagnosticReport'].includes(r.resourceType) && (r.effectiveDateTime ?? '').startsWith('2026-07'));
    expect(sameDay).toEqual([]);
  });

  // RBC-RX-05's preamble ("the most recent result in the chart, from any source") must not move
  // M5: Samuel Price has no laboratory report, and no A1c or eGFR after 2026-07-15.
  it("leaves Samuel Price's metformin renewal on the 2026-07-15 results", () => {
    type D = { resourceType: string; subject?: { reference?: string }; type?: { coding?: Array<{ code?: string }> }; effectiveDateTime?: string; code?: { coding?: Array<{ code?: string }> } };
    const price = (all as D[]).filter((r) => r.subject?.reference === 'Patient/pt-0030');
    expect(price.filter((r) => r.resourceType === 'DocumentReference' && (r.type?.coding ?? []).some((c) => c.code === '11502-2'))).toEqual([]);
    expect(price.filter((r) => r.resourceType === 'Observation' && (r.effectiveDateTime ?? '') > '2026-07-16' && (r.code?.coding ?? []).some((c) => ['4548-4', '98979-8', '62238-1', '33914-3'].includes(c.code ?? '')))).toEqual([]);
  });
});
