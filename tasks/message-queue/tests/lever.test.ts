// The W5-E lever toggles for T6 (plan-amendment-w5 G1, G2; lever.ts LEVER, expected.ts LEVER_ITEMS,
// overlay.ts LEVER_HOSTS, events.ts LEVER_SPECS): what each LEVER state must hold, checked without
// a rebuild where it can be, and the whole-list scan. For every state ({A,B}, {A}, {B},
// {A,B,reserve}; the committed one is LEVER):
//   - the overlay built for that state adds exactly the hosts of its active static items (B, the
//     reserve), each a Patient the overlay adds with its messages and inbox items, and no resource
//     about any other patient (overlay isolation: every patient an added resource names is a T6
//     slot or an added host);
//   - expected.ts leverItems gives exactly the active items' entries, and events.ts LEVER_SPECS
//     exactly the active events: webb-a1 in place of webb-c1 while A is on, mercer-b1 while the
//     reserve is;
//   - LEVER_ITEMS declares every lever id once, each event item naming its spec and its sibling.
// For the committed state:
//   - the loader's LEVER (the literal packages/core/tasks.ts hashes from lever.ts, re-exported by
//     expected.ts) equals the export, and every id names a declared item;
//   - task.toml declares each lever item's trap exactly while the item is active;
//   - the margins each lever item turns on clear the lint's (LEVER_MARGINS; the static ones are in
//     the overlay's lint and fixtures:lint);
//   - the whole-list scan (G2): no queue patient but the B host has a second creatinine on the day
//     of a dose increase; every potassium of a queue patient in the world is a panel member (the
//     standalone look is the arrival's routing alone); no overlay record names a patient of
//     crc-care-gap or contrast-ct-prep (R40);
//   - the A arrival's focus is its potassium alone, normal, and its panel is the declared sibling;
//   - the null agent passes no lever item (R32).
import { describe, expect, it } from 'vitest';
import { nodeTaskDirs, nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { MARGINS } from '../../../packages/env/lint/index.ts';
import { TASKS, patientRefs, type WorldReader } from '../../../packages/env/overlay.ts';
import { gradeRun, NULL_AGENT, trial } from '../../../packages/grader/matrix/matrix.ts';
import { ACTIVE, ARRIVAL, LEVER_SPECS, SPECS } from '../events.ts';
import { ITEMS, LEVER, LEVER_ITEMS, LEVER_MARGINS, expected, leverItems } from '../expected.ts';
import { IDS, idOf } from '../ids.ts';
import overlay, { LEVER_HOSTS } from '../overlay.ts';

const STATES: ReadonlyArray<readonly string[]> = [['A', 'B'], ['A'], ['B'], ['A', 'B', 'reserve']];
const LEVER_TRAPS: Readonly<Record<string, string>> = { A: 'panel_member_unread', B: 'same_day_baseline', reserve: 'corrected_egfr_unread' };
const LEVER_IDS = ['A', 'B', 'reserve'] as const;
// The items each lever id puts on the queue (by name), and the event it activates.
const LEVER_NAMES: Readonly<Record<string, readonly string[]>> = { A: [], B: ['m14'], reserve: ['m15', 'm16'] };
const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
// The committed world stands in for the base cohort the build hands the overlay: the slot Patients
// it renames keep their ids, which is all the overlay reads (the hosts are hand-written).
const reader: WorldReader = { get: store.get.bind(store), search: store.search.bind(store), resources: store.resources.bind(store), size: store.size };
const task = await nodeTaskSource({ testMode: false }).get('message-queue');
const FILES = nodeTaskDirs().find((d) => d.id === 'message-queue')!.files;
const T6_SLOTS: readonly string[] = TASKS.T6.slots;
const LEVER_DECL = /^export const LEVER(?:\s*:\s*[^=\n]+?)?\s*=\s*\[([^\]]*)\]/m;
const leverOfText = (text: string) => (LEVER_DECL.exec(text)![1]!.match(/'([^']*)'|"([^"]*)"/g) ?? []).map((q) => q.slice(1, -1));
type R = { resourceType: string; id?: string; status?: string; subject?: { reference?: string }; for?: { reference?: string }; owner?: { reference?: string }; code?: { coding?: Array<{ code?: string }> }; effectiveDateTime?: string; authoredOn?: string; valueQuantity?: { value?: number }; result?: Array<{ reference?: string }>; medicationCodeableConcept?: { text?: string }; dosageInstruction?: Array<{ doseAndRate?: Array<{ doseQuantity?: { value?: number } }> }>; interpretation?: unknown };
const rs = all as unknown as R[];
const ofPatient = (p: string) => rs.filter((r) => r.subject?.reference === p);
const coded = (r: R, codes: readonly string[]) => (r.code?.coding ?? []).some((c) => codes.includes(c.code ?? ''));

describe('message-queue lever toggles (W5-E)', () => {
  it('declares every lever item once in LEVER_ITEMS; an event item names its spec and sibling; LEVER names declared items only', () => {
    expect([...LEVER_ITEMS].map((i) => i.id).sort()).toEqual([...LEVER_IDS].sort());
    for (const i of LEVER_ITEMS) {
      expect(['A', 'B']).toContain(i.kind);
      if (i.kind === 'A') {
        expect(typeof i.spec).toBe('string');
        expect(i.spec).toBe(i.event);
        expect(i.sibling.length).toBeGreaterThan(0);
      }
      expect(i.item.startsWith('Task/')).toBe(true);
    }
    for (const id of LEVER) expect(LEVER_IDS as readonly string[], id).toContain(id);
    expect(new Set(LEVER).size).toBe(LEVER.length);
  });

  it("the loader's literal LEVER (lever.ts, re-exported by expected.ts) is the export", () => {
    expect(leverOfText(FILES['lever.ts']!)).toEqual([...LEVER]);
    expect((FILES['lever.ts']!.match(/^import\b/gm) ?? []).length).toBe(0);
    expect((FILES['expected.ts']!.match(/^export \{ LEVER \} from '\.\/lever\.ts';/gm) ?? []).length).toBe(1);
    expect((FILES['expected.ts']!.match(/^export const LEVER\b/gm) ?? []).length).toBe(0);
    expect(task.lever).toEqual([...LEVER]);
  });

  it.each(STATES.map((s) => [s.join('+'), s] as const))('state %s: leverItems and LEVER_SPECS hold exactly the active items and events', (_k, state) => {
    expect(leverItems(state).map((x) => x.name).sort()).toEqual(state.flatMap((l) => LEVER_NAMES[l] ?? []).sort());
    const specs = state.flatMap((l) => LEVER_SPECS[l] ?? []);
    expect(specs).toEqual([...(state.includes('A') ? ['webb-a1'] : []), ...(state.includes('reserve') ? ['mercer-b1'] : [])]);
    for (const x of leverItems(state)) {
      const host = Object.entries(LEVER_HOSTS).find(([l]) => (LEVER_NAMES[l] ?? []).includes(x.name))![1];
      expect(x.patient, x.name).toBe(`Patient/${idOf(host)}`);
    }
  });

  it('ACTIVE holds webb-a1 while A is in LEVER and webb-c1 otherwise, mercer-b1 exactly with the reserve; SPECS holds mercer-b1 only with its host', () => {
    expect(ACTIVE.includes('webb-a1')).toBe(LEVER.includes('A'));
    expect(ACTIVE.includes('webb-c1')).toBe(!LEVER.includes('A'));
    expect(ACTIVE.includes('mercer-b1')).toBe(LEVER.includes('reserve'));
    expect(SPECS.some((s) => s.id === 'mercer-b1')).toBe(LEVER.includes('reserve'));
    expect(SPECS.some((s) => s.id === 'webb-a1')).toBe(true);
  });

  it('the committed overlay adds exactly the active static hosts, each with its messages and inbox items, and names no other patient (isolation, R40)', () => {
    const edits = overlay.build(reader);
    const put = (edits.put ?? []) as unknown as R[];
    const added = put.filter((r) => r.resourceType === 'Patient' && !T6_SLOTS.includes(r.id!)).map((r) => r.id!).sort();
    const want = (['B', 'reserve'] as const).filter((l) => LEVER.includes(l)).map((l) => LEVER_HOSTS[l]).sort();
    expect(added).toEqual(want);
    for (const [l, host] of Object.entries(LEVER_HOSTS)) {
      if (!LEVER.includes(l)) continue;
      const items = put.filter((r) => r.resourceType === 'Task' && r.for?.reference === `Patient/${host}`);
      expect(items.length, host).toBe(LEVER_NAMES[l]!.length);
      for (const t of items) expect(t.owner?.reference).toBe('Practitioner/pr-okafor');
    }
    const allowed = new Set([...T6_SLOTS, ...added]);
    for (const r of put) for (const p of patientRefs(r as never)) expect(allowed.has(p), `${r.resourceType}/${r.id} names Patient/${p}`).toBe(true);
    const hostIds = new Set(added.map((k) => idOf(k)));
    const frozen = new Set<string>([...TASKS.T3.slots, ...TASKS.T5.slots]);
    for (const [key, id] of Object.entries(IDS)) {
      const r = all.find((x) => x.id === id);
      expect(r, key).toBeDefined();
      for (const p of patientRefs(r!)) {
        expect(T6_SLOTS.includes(p) || hostIds.has(p), `${key} (${id}) names Patient/${p}`).toBe(true);
        expect(frozen.has(p), `${key} touches a frozen task's patient`).toBe(false);
      }
    }
  });

  it("task.toml declares each lever item's trap exactly when the item is active", () => {
    const toml = FILES['task.toml']!;
    for (const [id, trap] of Object.entries(LEVER_TRAPS)) expect(toml.includes(`"${trap}"`), trap).toBe(LEVER.includes(id));
  });

  it('every margin a lever item turns on clears the lint margin (R7)', () => {
    expect(LEVER_MARGINS.length).toBeGreaterThan(0);
    for (const m of LEVER_MARGINS) expect(Math.abs(m.value - m.line), m.what).toBeGreaterThanOrEqual(MARGINS[m.quantity]);
  });

  // The whole-list scan (G2) on the committed world.
  const queue = [...new Set(ITEMS.map((x) => x.patient))];
  const LIS = /^lisinopril\b/i;
  it('no queue patient but the B host has two creatinines on the day of a lisinopril dose increase, one before and one after the order', () => {
    const twoOnTheDay: string[] = [];
    for (const p of queue) {
      const orders = (rs.filter((r) => r.resourceType === 'MedicationRequest' && r.subject?.reference === p && LIS.test(r.medicationCodeableConcept?.text ?? '')) as R[]).sort((a, b) => (a.authoredOn! < b.authoredOn! ? -1 : 1));
      const dose = (m: R) => m.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value ?? 0;
      const raised = orders.filter((m) => m.status === 'active' && orders.some((o) => o.authoredOn! < m.authoredOn! && dose(o) < dose(m)));
      for (const m of raised) {
        const day = m.authoredOn!.slice(0, 10);
        const crs = ofPatient(p).filter((r) => r.resourceType === 'Observation' && coded(r, ['2160-0']) && (r.effectiveDateTime ?? '').slice(0, 10) === day);
        const before = crs.filter((r) => r.effectiveDateTime! <= m.authoredOn!);
        const after = crs.filter((r) => r.effectiveDateTime! > m.authoredOn!);
        if (crs.length > 1) twoOnTheDay.push(`${p}: ${before.length} before, ${after.length} after`);
      }
    }
    expect(twoOnTheDay).toEqual(LEVER.includes('B') ? [`Patient/${idOf(LEVER_HOSTS.B)}: 1 before, 1 after`] : []);
  });

  it('every potassium of a queue patient in the world is a member of a panel report: a potassium on its own exists only as the A arrival', () => {
    const members = new Set(rs.filter((r) => r.resourceType === 'DiagnosticReport').flatMap((d) => (d.result ?? []).map((x) => x.reference ?? '')));
    const alone = queue.flatMap((p) => ofPatient(p).filter((r) => r.resourceType === 'Observation' && coded(r, ['2823-3', '6298-4']) && !members.has(`Observation/${r.id}`)).map((r) => `Observation/${r.id}`));
    expect(alone).toEqual([]);
  });

  it.runIf(LEVER.includes('A'))('webb-a1: the focus is the potassium alone, normal; the panel is the declared sibling and lists it; the other analytes file with it', () => {
    const spec = SPECS.find((s) => s.id === 'webb-a1')!;
    const [k, panel, ...rest] = spec.resources as unknown as R[];
    expect(`Observation/${k!.id}`).toBe(`Observation/${ARRIVAL.webbA1.k}`);
    expect(k!.valueQuantity?.value).toBe(4.6);
    expect(k!.interpretation).toBeUndefined();
    expect(`DiagnosticReport/${panel!.id}`).toBe(LEVER_ITEMS.find((i) => i.id === 'A')!.sibling[0]);
    expect((panel!.result ?? []).map((r) => r.reference)).toContain(`Observation/${k!.id}`);
    expect(rest.filter((r) => r.resourceType === 'Observation').length).toBeGreaterThanOrEqual(7);
    for (const r of spec.resources) expect((r as { subject?: { reference?: string } }).subject?.reference).toBe('Patient/pt-0031');
    expect(ACTIVE.filter((s) => s === 'webb-a1' || s === 'webb-c1')).toEqual(['webb-a1']);
  });

  it.runIf(LEVER.includes('B'))('the B host: the morning creatinine is before the order, the urgent-care one after it, the 10-19 value within 4 weeks after; 46% over the morning value, 18% over the evening one', () => {
    const p = `Patient/${idOf(LEVER_HOSTS.B)}`;
    const order = rs.find((r) => r.resourceType === 'MedicationRequest' && r.subject?.reference === p && r.status === 'active' && LIS.test(r.medicationCodeableConcept?.text ?? ''))!;
    const crs = ofPatient(p).filter((r) => r.resourceType === 'Observation' && coded(r, ['2160-0'])).sort((a, b) => (a.effectiveDateTime! < b.effectiveDateTime! ? -1 : 1));
    expect(crs).toHaveLength(3);
    const [am, pm, later] = crs as [R, R, R];
    expect(am.effectiveDateTime! < order.authoredOn!).toBe(true);
    expect(pm.effectiveDateTime! > order.authoredOn!).toBe(true);
    expect(pm.effectiveDateTime!.slice(0, 10)).toBe(am.effectiveDateTime!.slice(0, 10));
    expect(Date.parse(later.effectiveDateTime!) - Date.parse(order.authoredOn!)).toBeLessThan(28 * 86_400_000);
    const rise = (a: R, b: R) => b.valueQuantity!.value! / a.valueQuantity!.value! - 1;
    expect(rise(am, later)).toBeGreaterThan(0.35);
    expect(rise(pm, later)).toBeLessThan(0.25);
    const x = ITEMS.find((i) => i.name === 'm14')!;
    expect(x.action).toBe('hold');
    expect(x.decisive).toContain(`Observation/${am.id}`);
    expect(x.decisive).toContain(`Observation/${later.id}`);
    expect(x.decisive).not.toContain(`Observation/${pm.id}`);
  });

  it('the null agent passes no lever item (R32)', { timeout: 300_000 }, async () => {
    const env = matrixEnv();
    const mt = await loadMatrixTask('message-queue');
    const r = await trial(env, mt, { kind: 'null', id: 'null', script: NULL_AGENT });
    const g = await gradeRun(env, mt, mt.checks, r);
    const failed = new Set(g.checks.flatMap((c) => c.items ?? []).filter((i) => !i.met).map((i) => i.item));
    for (const x of leverItems(LEVER)) expect(failed.has(x.item), x.name).toBe(true);
    expect(failed.has(ITEMS.find((i) => i.name === 'm12')!.item)).toBe(true);
  });

  it("every lever host carries Dr. Okafor as PCP and the rule's MRN, like every other patient", () => {
    for (const [l, key] of Object.entries(LEVER_HOSTS)) {
      if (!LEVER.includes(l)) continue;
      const p = store.get('Patient', idOf(key)) as { generalPractitioner?: Array<{ reference?: string }>; identifier?: Array<{ system?: string; value?: string }> } | undefined;
      expect(p, key).toBeDefined();
      expect(p?.generalPractitioner?.[0]?.reference, key).toBe('Practitioner/pr-okafor');
      expect((p?.identifier ?? []).find((i) => i.system === 'urn:riverbend:mrn')?.value, key).toMatch(/^\d{4}-\d{2}$/);
    }
    expect(expected.items.length).toBe(ITEMS.length);
  });
});
