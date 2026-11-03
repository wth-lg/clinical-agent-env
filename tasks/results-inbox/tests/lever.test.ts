// The W5-E lever toggles (plan-amendment-w5 G1, G2; expected.ts LEVER, overlay.ts LEVER_HOSTS):
// what each LEVER state must hold, checked without a rebuild where it can be, and the whole-list
// scan. For every state ({A,B}, {A}, {B}, {A,B,reserve}; the committed one is LEVER):
//   - the overlay built for that state adds exactly the hosts of its active items, each a Patient
//     the overlay adds with its inbox item, and no resource about any other patient (overlay
//     isolation: every patient an added resource names is a T2 slot or an added host);
//   - expected.ts leverItems gives exactly the active items' entries, and events.ts LEVER_SPECS
//     exactly the active A event;
//   - LEVER_ITEMS declares every lever id once, each A item naming its event and its sibling.
// For the committed state:
//   - the loader's LEVER (the literal packages/core/tasks.ts hashes; the same regex here until
//     W5-H lands) equals the export, and every id names a declared item;
//   - RBC-LAB-03 §2 holds RESERVE_SENTENCE exactly when 'reserve' is in LEVER;
//   - the whole-list scan: no lever host's decisive line fires on another list patient (no other
//     list patient meets §2's exception; no other patient's identifiers match the fax's header;
//     no base item's expected order falls in the fax's window), and no overlay record names a
//     patient of crc-care-gap or contrast-ct-prep (R40);
//   - the batch's numbers clear their lines (expected.ts EVENTS margins, events.test.ts) and the
//     silent sibling is the LEVER_ITEMS sibling.
import { describe, expect, it } from 'vitest';
import { nodeTaskDirs, nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { gradeRun, NULL_AGENT, trial } from '../../../packages/grader/matrix/matrix.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { TASKS, patientRefs, type WorldReader } from '../../../packages/env/overlay.ts';
import { noteText } from '../../../packages/env/tools/read/notes.ts';
import { EVENTS, LEVER, LEVER_ITEMS, RESERVE_SENTENCE, expected, leverItems, type Item } from '../expected.ts';
import { ARRIVAL, LEVER_SPECS, SPECS } from '../events.ts';
import { IDS, idOf } from '../ids.ts';
import overlay, { LEVER_HOSTS, overlayFor } from '../overlay.ts';

const STATES: ReadonlyArray<readonly string[]> = [['A', 'B'], ['A'], ['B'], ['A', 'B', 'reserve']];
const LEVER_TRAPS: Readonly<Record<string, string>> = { A: 'batch_sibling_unread', B: 'misfiled_record_acted_on', reserve: 'hemolysis_exception_missed' };
const LEVER_IDS = Object.keys(LEVER_HOSTS) as Array<keyof typeof LEVER_HOSTS>;
const store = await loadStore(matrixEnv().world);
// The committed world stands in for the base cohort the build hands the overlay: the slot Patients
// it renames keep their ids, which is all the overlay reads (the hosts are hand-written).
const reader: WorldReader = { get: store.get.bind(store), search: store.search.bind(store), resources: store.resources.bind(store), size: store.size };
const task = await nodeTaskSource({ testMode: false }).get('results-inbox');
// The task's files as text (expected.ts for the LEVER literal, task.toml for the traps).
const FILES = nodeTaskDirs().find((d) => d.id === 'results-inbox')!.files;
const T2_SLOTS: readonly string[] = TASKS.T2.slots;

// The overlay's edits for a LEVER state: the module reads expected.ts LEVER, so a state is built by
// the host functions it exposes through LEVER_HOSTS and the committed world's reader.
const LEVER_DECL = /^export const LEVER(?:\s*:\s*[^=\n]+?)?\s*=\s*\[([^\]]*)\]/m;
const leverOfText = (text: string) => (LEVER_DECL.exec(text)![1]!.match(/'([^']*)'|"([^"]*)"/g) ?? []).map((q) => q.slice(1, -1));

describe('results-inbox lever toggles (W5-E)', () => {
  it('declares every lever item once in LEVER_ITEMS; A names its event and sibling; LEVER names declared items only', () => {
    expect([...LEVER_ITEMS].map((i) => i.id).sort()).toEqual([...LEVER_IDS].sort());
    for (const i of LEVER_ITEMS) {
      if (i.kind === 'A') {
        expect('spec' in i && typeof i.spec === 'string').toBe(true);
        expect(i.sibling.length).toBeGreaterThan(0);
      }
    }
    for (const id of LEVER) expect(LEVER_IDS, id).toContain(id);
    expect(new Set(LEVER).size).toBe(LEVER.length);
  });

  it("the loader's literal LEVER (packages/core/tasks.ts leverOf's rule) is the export", () => {
    const text = FILES['expected.ts']!;
    expect(leverOfText(text)).toEqual([...LEVER]);
    expect((text.match(/^export const LEVER\b/gm) ?? []).length).toBe(1);
  });

  it.each(STATES.map((s) => [s.join('+'), s] as const))('state %s: leverItems and LEVER_SPECS hold exactly the active items', (_k, state) => {
    const keys = leverItems(state).map((x) => x.key).sort();
    expect(keys).toEqual([...(state.includes('A') ? ['marchetti_cr_ed'] : []), ...(state.includes('B') ? ['nowicki_fax'] : []), ...(state.includes('reserve') ? ['castellano_k_exception'] : [])].sort());
    const specs = state.flatMap((l) => LEVER_SPECS[l] ?? []);
    expect(specs).toEqual(state.includes('A') ? ['marchetti-cr-batch'] : []);
    // Each item's patient is its host (every host is in the registry in every state, F3).
    for (const x of leverItems(state)) expect(x.patient, x.key).toBe(`Patient/${idOf(LEVER_HOSTS[LEVER_ITEMS.find((i) => i.item === x.key)!.id])}`);
  });

  // F3 (the T1 gate, verifier-phase-P17i-W5E-T1-214-1): no LEVER toggle may move a world id. Added
  // Patients are numbered in key order across every overlay and every record by (patient, date,
  // code), so a host, its chart and its inbox item are in the world in every state; a toggle changes
  // only the item's owner (on the list: the signed-in user; off it: Jordan Reyes, as PW4-E3 cut
  // items). The overlay's edits for every state therefore name the same resources.
  it('every host is in the world in every LEVER state; a toggle changes only its inbox item\'s owner (F3)', () => {
    const keys = (lever: readonly string[]) => (overlayFor(lever).build(reader).put ?? []).map((r) => `${r.resourceType}/${r.id}`).sort();
    const owners = (lever: readonly string[]) => Object.fromEntries((overlayFor(lever).build(reader).put ?? []).filter((r) => r.resourceType === 'Task').map((r) => [r.id, (r as { owner?: { reference?: string } }).owner?.reference]));
    const committed = keys(LEVER);
    for (const state of STATES) {
      expect(keys(state), state.join('+')).toEqual(committed);
      const o = owners(state);
      for (const [id, host] of Object.entries(LEVER_HOSTS)) {
        const item = Object.keys(o).find((t) => (overlayFor(state).build(reader).put ?? []).some((r) => r.resourceType === 'Task' && r.id === t && (r as { for?: { reference?: string } }).for?.reference === `Patient/${host}`))!;
        expect(o[item], `${state.join('+')} ${id}`).toBe(state.includes(id) ? 'Practitioner/pr-okafor' : 'Practitioner/pr-reyes');
      }
    }
  });

  it('the committed overlay adds every host with its inbox item, and names no other patient (isolation, R40)', () => {
    const edits = overlay.build(reader);
    const put = edits.put ?? [];
    const added = put.filter((r) => r.resourceType === 'Patient' && !T2_SLOTS.includes(r.id!)).map((r) => r.id!).sort();
    expect(added).toEqual(Object.values(LEVER_HOSTS).sort());
    for (const host of added) {
      const items = put.filter((r) => r.resourceType === 'Task' && (r as { for?: { reference?: string } }).for?.reference === `Patient/${host}`);
      expect(items.length, host).toBe(1);
    }
    const allowed = new Set([...T2_SLOTS, ...added]);
    for (const r of put) for (const p of patientRefs(r)) expect(allowed.has(p), `${r.resourceType}/${r.id} names Patient/${p}`).toBe(true);
    // In the committed world, every resource T2's registry numbered names T2's patients only (a
    // removal may name only a T2 slot's record: packages/env/overlay.ts applyOverlays enforces it).
    const hostIds = new Set(added.map((k) => idOf(k)));
    const frozen = new Set<string>([...TASKS.T3.slots, ...TASKS.T5.slots]);
    for (const [key, id] of Object.entries(IDS)) {
      const r = [...store.resources()].find((x) => x.id === id);
      expect(r, key).toBeDefined();
      for (const p of patientRefs(r!)) {
        expect(T2_SLOTS.includes(p) || hostIds.has(p), `${key} (${id}) names Patient/${p}`).toBe(true);
        expect(frozen.has(p), `${key} touches a frozen task's patient`).toBe(false);
      }
    }
  });

  // A declared trap needs a mutant, and a lever item's mutants exist only with its patient, so
  // task.toml [matrix] traps lists each lever item's trap exactly while the item is active (the
  // toggle checklist in expected.ts).
  it("task.toml declares each lever item's trap exactly when the item is active", () => {
    const toml = FILES['task.toml']!;
    for (const [id, trap] of Object.entries(LEVER_TRAPS)) expect(toml.includes(`"${trap}"`), trap).toBe(LEVER.includes(id));
  });

  it("RBC-LAB-03 §2 holds the reserve's sentence exactly when the reserve is active", () => {
    const lab = task.policies.find((p) => p.id === 'RBC-LAB-03')!.text.replace(/\s+/g, ' ');
    expect(lab.split(RESERVE_SENTENCE).length - 1).toBe(LEVER.includes('reserve') ? 1 : 0);
  });

  // The whole-list scan (G2) on the committed world.
  const list = expected.items;
  const patientsOf = (xs: readonly Item[]) => [...new Set(xs.map((x) => x.patient))];
  it('no list patient but the reserve host meets RBC-LAB-03 §2\'s exception (an eGFR below 30 or an active potassium-raising drug)', () => {
    const K_RAISING = /\b(lisinopril|enalapril|ramipril|benazepril|captopril|quinapril|losartan|valsartan|irbesartan|candesartan|olmesartan|telmisartan|spironolactone|eplerenone|finerenone|potassium chloride|potassium citrate)\b/i;
    const hemolyzed = list.filter((x) => x.class === 'hemolyzed');
    for (const x of hemolyzed) {
      const p = x.patient;
      type Obs = { effectiveDateTime?: string; valueQuantity?: { value?: number } };
      const egfr = ([...store.resources()].filter((r) => r.resourceType === 'Observation' && r.subject?.reference === p && (r.code?.coding ?? []).some((c) => ['98979-8', '33914-3', '62238-1'].includes(c.code ?? '')) && r.status !== 'entered-in-error') as Obs[])
        .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''))[0];
      expect(egfr === undefined || (egfr.valueQuantity?.value ?? 0) >= 30, `${x.key}: most recent eGFR`).toBe(true);
      type Med = { subject?: { reference?: string }; status?: string; medicationCodeableConcept?: { text?: string } };
      const drugs = ([...store.resources()].filter((r) => r.resourceType === 'MedicationRequest') as Med[]).filter((r) => r.subject?.reference === p && r.status === 'active' && K_RAISING.test(r.medicationCodeableConcept?.text ?? ''));
      expect(drugs.map((d) => d.medicationCodeableConcept?.text), `${x.key}: potassium-raising drugs`).toEqual([]);
    }
  });

  it.runIf(LEVER.includes('B'))("the fax's header matches no patient in the world, and its window holds no base item's expected order", () => {
    const x = list.find((i) => i.class === 'misfiled')!;
    if (x.class !== 'misfiled') return;
    const doc = store.get('DocumentReference', x.document.split('/')[1]!)!;
    const text = noteText(doc as never) ?? '';
    expect(text).toContain(`DOB ${x.header.birthDate}`);
    expect(text).toContain(`MRN ${x.header.mrn}`);
    type Pt = { id?: string; birthDate?: string; identifier?: Array<{ value?: string }> };
    const patients = [...store.resources()].filter((r) => r.resourceType === 'Patient') as Pt[];
    expect(patients.filter((p) => p.birthDate === x.header.birthDate).map((p) => p.id)).toEqual([]);
    expect(patients.filter((p) => (p.identifier ?? []).some((i) => i.value === x.header.mrn)).map((p) => p.id)).toEqual([]);
    const own = store.get('Patient', x.patient.split('/')[1]!) as Pt | undefined;
    expect(own?.birthDate).not.toBe(x.header.birthDate);
    // Her own screening schedule (annual from 06-10) and the other items' windows lie outside it.
    for (const y of list) if (y.class === 'nodule_screening') expect(y.window.start > x.window.end || y.window.end < x.window.start, y.key).toBe(true);
    for (const e of Object.values(EVENTS)) if (e.order?.window) expect(e.order.window.start > x.window.end || e.order.window.end < x.window.start).toBe(true);
    expect('2027-06-10' > x.window.end).toBe(true);
  });

  it.runIf(LEVER.includes('A'))('the batch: the silent sibling is LEVER_ITEMS.A.sibling, normal and unnotified; the notified value is high; both file to the A host', () => {
    const spec = SPECS.find((s) => s.id === 'marchetti-cr-batch')!;
    const [high, silent] = spec.resources as unknown as Array<{ id?: string; subject?: { reference?: string }; valueQuantity?: { value?: number }; interpretation?: Array<{ coding?: Array<{ code?: string }> }> }>;
    expect(`Observation/${silent!.id}`).toBe(LEVER_ITEMS.find((i) => i.id === 'A')!.sibling[0]);
    expect(silent!.id).toBe(ARRIVAL.marchettiCrSilent);
    expect(silent!.interpretation?.[0]?.coding?.[0]?.code).toBe('N');
    expect(high!.interpretation?.[0]?.coding?.[0]?.code).toBe('H');
    const host = list.find((i) => i.key === 'marchetti_cr_ed')!.patient;
    expect(high!.subject?.reference).toBe(host);
    expect(silent!.subject?.reference).toBe(host);
    // The held comparators: her creatinines before the batch, all outside the 48-hour and 7-day
    // windows of the notified value (the margins in EVENTS, checked in events.test.ts).
    const at = Date.parse('2026-10-22T18:40:00-04:00');
    type Obs = { id?: string; effectiveDateTime?: string };
    const held = [...store.resources()].filter((r) => r.resourceType === 'Observation' && r.subject?.reference === host && (r.code?.coding ?? []).some((c) => c.code === '2160-0')) as Obs[];
    expect(held.length).toBeGreaterThanOrEqual(3);
    for (const h of held) expect((at - Date.parse(h.effectiveDateTime!)) / 3_600_000, h.id).toBeGreaterThan(168 + 24);
    expect(patientsOf(list).filter((p) => p === host)).toHaveLength(1);
  });

  // R32: a lever item is gated like every other; the null agent passes none of them.
  it('the null agent passes no lever item (R32)', async () => {
    const env = matrixEnv();
    const mt = await loadMatrixTask('results-inbox');
    const r = await trial(env, mt, { kind: 'null', id: 'null', script: NULL_AGENT });
    const g = await gradeRun(env, mt, mt.checks, r);
    const failed = new Set(g.checks.flatMap((c) => c.items ?? []).filter((i) => !i.met).map((i) => i.item));
    for (const x of leverItems(LEVER)) expect(failed.has(x.key), x.key).toBe(true);
  });

  it('every lever host carries the clinic as PCP and the rule\'s MRN, like every other patient', () => {
    for (const l of LEVER_IDS.filter((l) => LEVER.includes(l))) {
      const key = LEVER_HOSTS[l];
      const id = list.find((x) => x.key === LEVER_ITEMS.find((i) => i.id === l)!.item)!.patient.split('/')[1]!;
      const p = store.get('Patient', id) as { generalPractitioner?: Array<{ reference?: string }>; identifier?: Array<{ system?: string; value?: string }> } | undefined;
      expect(p?.generalPractitioner?.[0]?.reference, key).toBe('Practitioner/pr-okafor');
      expect((p?.identifier ?? []).find((i) => i.system === 'urn:riverbend:mrn')?.value, key).toMatch(/^\d{4}-\d{2}$/);
    }
  });
});
