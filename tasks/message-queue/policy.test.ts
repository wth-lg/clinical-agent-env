// Double derivation for T6 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, item by item. The matrix checks the same equality; this
// test shows it on its own, with the world facts the worklist design rests on:
//   - the policy names no planted patient, id or date (check-text gate), and states nothing the
//     clock contradicts (fixture lint);
//   - every rule word the policy uses for an outside report retrieves it in search_notes, which does
//     not stem (verifier-phase-P17i-W0-3-pilot3-1 F1);
//   - the charts' ages and dates fit (verifier-phase-P17i-W1-0-1 F7): no birth date is patched, and
//     nothing planted predates its patient's birth;
//   - the two dose increases fall inside the 4-week rule, the creatinine before each is drawn
//     before the new order, and the queue holds exactly the 13 items;
//   - §2's potassium (verifier-W1-probe-T6-clinical-4 N4): the most recent valid potassium decides,
//     measured in a BMP or on its own, and a potassium on its own is not a BMP.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import { firstShown, stepsOf } from '../../packages/grader/exposure.ts';
import { trial } from '../../packages/grader/matrix/matrix.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected, ITEMS } from './expected.ts';
import { IDS, id, ref } from './ids.ts';
import { derive } from './policy.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, rid) => store.get(type, rid), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };
const d = derive(world) as unknown as typeof expected;
const SLOTS = ['pt-0026', 'pt-0027', 'pt-0028', 'pt-0029', 'pt-0030', 'pt-0031'];
const NAMES = ['Gloria Hayes', 'Frank Odum', 'Lena Park', 'Evelyn Brooks', 'Samuel Price', 'Marcus Webb'];
type R = { resourceType: string; id?: string; status?: string; subject?: { reference?: string }; patient?: { reference?: string }; for?: { reference?: string }; owner?: { reference?: string }; code?: { coding?: Array<{ system?: string; code?: string }> }; effectiveDateTime?: string; authoredOn?: string; date?: string; onsetDateTime?: string; period?: { start?: string }; sent?: string; valueQuantity?: { value?: number }; valueCodeableConcept?: { coding?: Array<{ code?: string }> }; clinicalStatus?: { coding?: Array<{ code?: string }> }; medicationCodeableConcept?: unknown };
const rs = all as R[];

describe('message-queue', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(d).toEqual(expected);
  });

  it('decides the 13 items as the worklist design does: 6 renewals, 3 thirty-day supplies, 2 holds, 2 repeat requests', () => {
    const by = (a: string) => d.items.filter((x) => x.action === a).length;
    expect([by('renew'), by('bridge'), by('hold'), by('duplicate')]).toEqual([6, 3, 2, 2]);
    expect(d.items.filter((x) => x.lab === 'bmp')).toHaveLength(4);
    expect(d.items.filter((x) => x.lab === 'hba1c')).toHaveLength(1);
  });

  it("Dr. Okafor's messages queue holds exactly the 13 T6 items, and she is each patient's PCP", () => {
    const queue = rs.filter((r) => r.resourceType === 'Task' && r.status === 'requested' && r.owner?.reference === 'Practitioner/pr-okafor' && (r.code?.coding ?? []).some((c) => c.system === 'urn:riverbend:inbox-queue' && c.code === 'messages'));
    expect(queue.map((r) => `Task/${r.id}`).sort()).toEqual(ITEMS.map((x) => x.item).sort());
    for (const p of SLOTS) expect((store.get('Patient', p) as { generalPractitioner?: unknown }).generalPractitioner).toEqual([{ reference: 'Practitioner/pr-okafor' }]);
  });

  it('charts no T6 patient on an ACE inhibitor as pregnant', () => {
    const pregnant = rs.filter(
      (r) =>
        SLOTS.includes((r.subject?.reference ?? '').slice(8)) &&
        ((r.resourceType === 'Observation' && (r.code?.coding ?? []).some((c) => c.code === '82810-3') && (r.valueCodeableConcept?.coding ?? []).some((c) => c.code === '77386006')) ||
          (r.resourceType === 'Condition' && r.clinicalStatus?.coding?.[0]?.code === 'active' && /pregnan|obstetric|prenatal/i.test(JSON.stringify(r.code)))),
    );
    expect(pregnant.map((r) => `${r.resourceType}/${r.id}`)).toEqual([]);
  });

  it('the instruction and policy name no planted patient, id or date, and pass the prompt-date and leakage lint', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('message-queue');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const planted = Object.values(IDS);
    for (const t of texts) {
      for (const n of NAMES) expect(t).not.toContain(n.split(' ')[1]!);
      for (const p of [...planted, ...SLOTS]) expect(t).not.toContain(p);
      expect(t).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b/);
    }
    const answers = ['6.1', '5.9', '1.62', '1.24', '1.36', '39', 'Harbor', 'Whitfield'];
    const findings = lintWorld(all, [{ source: 'message-queue', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : task.policies[i - 1]!.id, text })) } } }]);
    expect(findings).toEqual([]);
  });

  it("every rule word the policy uses for an outside report retrieves it, with the decisive phrase, in a search of that patient's notes", async () => {
    const reports: Array<[key: Parameters<typeof id>[0], patient: string, words: string[], phrase: string]> = [
      ['doc-t6-odum-0827', 'pt-0027', ['hemolyzed', 'BMP', 'potassium'], 'hemolyzed'],
      ['doc-t6-park-1002', 'pt-0028', ['BMP', 'collected'], 'Collected: 10/02/2025'],
      ['doc-t6-brooks-0412', 'pt-0029', ['HbA1c', 'collected'], 'Collected: 04/14/2026'],
      ['doc-t6-price-0819', 'pt-0030', ['HbA1c', 'collected'], 'Collected: 08/19/2026'],
    ];
    const task = await loadMatrixTask('message-queue');
    for (const [key, patient, words, phrase] of reports) {
      for (const query of words) {
        const steps = stepsOf((await trial(matrixEnv(), task, { kind: 'alternative', id: 'terms', script: [{ calls: [{ name: 'search_notes', input: { query, patient } }] }, { calls: [{ name: 'finish', input: { summary: 'x' } }] }] })).events);
        expect(steps[0]!.referenced_ids.concat(steps[0]!.exposed_ids), `${query} -> ${key}`).toContain(ref(`DocumentReference/${key}`));
        if (query === 'collected' || query === 'hemolyzed') expect(firstShown(steps, ref(`DocumentReference/${key}`), phrase), `${query} shows ${phrase}`).not.toBeNull();
      }
    }
  });

  it("keeps each patient's Synthea birth date, and dates nothing planted before it", () => {
    const born = new Map(SLOTS.map((p) => [`Patient/${p}`, (store.get('Patient', p) as { birthDate?: string }).birthDate!]));
    expect([...born.values()]).toEqual(['1976-08-16', '1976-12-01', '1977-06-16', '1978-07-01', '1979-01-25', '1981-05-25']);
    const plantedIds = new Set<string>(Object.values(IDS));
    const early = rs.filter((r) => plantedIds.has(r.id ?? '')).flatMap((r) => {
      const p = r.subject?.reference ?? r.patient?.reference ?? r.for?.reference;
      const when = r.effectiveDateTime ?? r.authoredOn ?? r.date ?? r.onsetDateTime ?? r.period?.start ?? r.sent;
      return p && born.has(p) && when && when.slice(0, 10) < born.get(p)! ? [`${r.resourceType}/${r.id}`] : [];
    });
    expect(early).toEqual([]);
  });

  // N4: a standalone potassium (no panel) added to one patient's chart, on a copy of the world. No T6
  // patient has one, so each case moves exactly one item, and only as §2 says.
  it('§2: the most recent valid potassium decides, in a BMP or on its own; a potassium on its own is not a BMP (clinical-4 N4)', () => {
    const potassium = (rid: string, patient: string, value: number, at: string, note?: string) => ({
      resourceType: 'Observation', id: rid, status: 'final', subject: { reference: `Patient/${patient}` },
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' }] },
      effectiveDateTime: at, issued: at, valueQuantity: { value, unit: 'mmol/L' }, ...(note ? { note: [{ text: note }] } : {}),
    });
    const withOne = (added: ReturnType<typeof potassium>) => {
      const r = added as unknown as (typeof all)[number];
      const more = [...all, r];
      const view: WorldView = { get: (type, rid) => (type === r.resourceType && rid === r.id ? r : store.get(type, rid)), all: (type) => (type === undefined ? more : more.filter((x) => x.resourceType === type)) };
      return (derive(view) as unknown as typeof expected).items;
    };
    const moved = (items: typeof expected.items) => items.flatMap((x, i) => (JSON.stringify(x) === JSON.stringify(expected.items[i]) ? [] : [`${ITEMS.find((y) => y.item === x.item)!.name} ${x.action}${x.lab ? ` + ${x.lab}` : ''}`]));
    // Odum has a valid in-house BMP inside 12 months (K 4.5); a newer standalone 5.8 decides: hold.
    expect(moved(withOne(potassium('obs-n4-odum', 'pt-0027', 5.8, '2026-10-12T09:00:00-04:00')))).toEqual(['m3 hold']);
    // A newer standalone 4.2 is below the line: Odum's renewal stands, and no BMP goes with it, for
    // the valid potassium drawn after the hemolyzed one already repeats it (§1).
    expect(moved(withOne(potassium('obs-n4-odum-low', 'pt-0027', 4.2, '2026-10-12T09:00:00-04:00')))).toEqual(['m3 renew']);
    // Webb has no BMP inside 12 months: a standalone 5.8 still decides (hold) ...
    expect(moved(withOne(potassium('obs-n4-webb', 'pt-0031', 5.8, '2026-09-28T09:10:00-04:00')))).toEqual(['m12 hold']);
    // ... and a standalone 4.2 is not a BMP, so the 30-day supply and its BMP stand.
    expect(moved(withOne(potassium('obs-n4-webb-low', 'pt-0031', 4.2, '2026-09-28T09:10:00-04:00')))).toEqual([]);
    // A hemolyzed standalone 5.8 is not a valid potassium: nothing moves.
    expect(moved(withOne(potassium('obs-n4-webb-hem', 'pt-0031', 5.8, '2026-09-28T09:10:00-04:00', 'Specimen hemolyzed; may be falsely elevated.')))).toEqual([]);
  });

  it('places each dose increase inside the 4-week rule: the baseline creatinine before the new order, the next BMP within 28 days', () => {
    for (const [order, before, after] of [
      ['mr-t6-brooks-lisinopril', 'obs-t6-brooks-0921-cr', 'obs-t6-brooks-1008-cr'],
      ['mr-t6-price-lisinopril', 'obs-t6-price-0918-cr', 'obs-t6-price-1006-cr'],
    ] as const) {
      const at = Date.parse((store.get('MedicationRequest', id(order)) as R).authoredOn!);
      const b = store.get('Observation', id(before)) as R;
      const a = store.get('Observation', id(after)) as R;
      expect(Date.parse(b.effectiveDateTime!)).toBeLessThan(at);
      expect(Date.parse(a.effectiveDateTime!) - at).toBeLessThan(28 * 86_400_000);
    }
    const rise = (b: string, a: string) => (store.get('Observation', id(a as never)) as R).valueQuantity!.value! / (store.get('Observation', id(b as never)) as R).valueQuantity!.value! - 1;
    expect(rise('obs-t6-brooks-0921-cr', 'obs-t6-brooks-1008-cr')).toBeGreaterThan(0.35);
    expect(rise('obs-t6-price-0918-cr', 'obs-t6-price-1006-cr')).toBeLessThan(0.25);
  });
});
