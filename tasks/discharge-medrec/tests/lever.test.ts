// The W5-E lever toggles of T4 (plan-amendment-w5 "T4 discharge-medrec", G1, G2; lever.ts LEVER
// and HOSTS, overlay.ts leverHosts): what each LEVER state must hold, checked without a rebuild
// where it can be, and the whole-list scan. The states: {A,B}, {A}, {B}, {A,B,reserve}; the
// committed one is LEVER.
//   - the overlay built for a state adds the A host always (its item A is its arrival alone, so A
//     toggles with no rebuild) and the B and reserve hosts exactly while their item is active, and
//     names no patient but a T4 slot or a host (overlay isolation; R40: never a frozen task's);
//   - expected.ts leverItems gives exactly the state's items, and events.ts leverSpecs exactly its A
//     event; LEVER_ITEMS declares every lever id once, A naming its spec and its silent sibling;
//   - for the committed state: expected.ts re-exports LEVER from lever.ts on a line of its own (the
//     form packages/core/tasks.ts leverOf reads into env_version), lever.ts imports nothing,
//     task.toml declares each lever item's trap exactly while it is active, instruction.md names
//     exactly the listed hosts, and RBC-TOC-02 §2 holds the post-discharge sentence;
//   - the whole-list scan: no other list patient's conditional line rests on a result from the
//     stay (Kim's and Roberts' read as before), no other fill history prints a coverage figure, the
//     batch's two potassiums clear 5.0 by the lint margin and the silent one is the newer, normal,
//     unflagged LEVER_ITEMS sibling filed to the A host, and no registry id names a crc-care-gap or
//     contrast-ct-prep patient;
//   - the null agent passes no lever item (R32).
import { describe, expect, it } from 'vitest';
import { nodeTaskDirs, nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { gradeRun, NULL_AGENT, trial } from '../../../packages/grader/matrix/matrix.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { MARGINS } from '../../../packages/env/lint/index.ts';
import { TASKS, patientRefs, type WorldReader } from '../../../packages/env/overlay.ts';
import { expected, hostPatients, LEVER_ITEMS, leverItems, POST_DISCHARGE_SENTENCE } from '../expected.ts';
import { ARRIVAL, leverSpecs, SPECS } from '../events.ts';
import { IDS, idOf } from '../ids.ts';
import { LEVER } from '../lever.ts';
import { HOSTS } from '../lever-keys.ts';
import { leverHosts } from '../overlay.ts';
import { derive } from '../policy.ts';
import { isPlanted } from '../../planted.ts';

const STATES: ReadonlyArray<readonly string[]> = [['A', 'B'], ['A'], ['B'], ['A', 'B', 'reserve']];
const LEVER_IDS = Object.keys(HOSTS) as Array<keyof typeof HOSTS>;
const ITEM_OF: Readonly<Record<string, string>> = { A: 'whitcomb-lisinopril', B: 'pruitt-metformin', reserve: 'salazar-amlodipine' };
const TRAP_OF: Readonly<Record<string, readonly string[]>> = { A: ['batch_sibling_unread'], B: ['stay_result_as_post_discharge', 'pruitt-metformin'], reserve: ['printed_coverage_taken', 'salazar-amlodipine'] };
// The hosts a state's world holds: the A host always, the others while active.
const hostsIn = (state: readonly string[]) => LEVER_IDS.filter((l) => l === 'A' || state.includes(l)).map((l) => HOSTS[l]);
const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const reader: WorldReader = { get: store.get.bind(store), search: store.search.bind(store), resources: store.resources.bind(store), size: store.size };
const task = await nodeTaskSource({ testMode: false }).get('discharge-medrec');
const FILES = nodeTaskDirs().find((d) => d.id === 'discharge-medrec')!.files;
const T4_SLOTS: readonly string[] = TASKS.T4.slots;
type Obs = { id?: string; subject?: { reference?: string }; effectiveDateTime?: string; valueQuantity?: { value?: number }; interpretation?: Array<{ coding?: Array<{ code?: string }> }>; code?: { coding?: Array<{ code?: string }> } };
const decode = (data: string | undefined) => new TextDecoder().decode(Uint8Array.from(atob(data ?? ''), (c) => c.charCodeAt(0)));

describe('discharge-medrec lever toggles (W5-E)', () => {
  it('declares every lever item once in LEVER_ITEMS; A names its spec and its sibling; LEVER names declared items only', () => {
    expect([...LEVER_ITEMS].map((i) => i.id).sort()).toEqual([...LEVER_IDS].sort());
    for (const i of LEVER_ITEMS) {
      expect(i.item).toBe(ITEM_OF[i.id]);
      expect(i.patient).toBe(`Patient/${idOf(HOSTS[i.id as keyof typeof HOSTS])}`);
      if (i.kind === 'A') {
        expect(i.spec).toBe('whitcomb-a1');
        expect(i.sibling.length).toBeGreaterThan(0);
      }
    }
    for (const id of LEVER) expect(LEVER_IDS as readonly string[], id).toContain(id);
    expect(new Set(LEVER).size).toBe(LEVER.length);
  });

  it("expected.ts re-exports LEVER from lever.ts on a line of its own, and lever.ts imports nothing (the loader's rule)", () => {
    const text = FILES['expected.ts']!;
    expect((text.match(/^export \{ LEVER \} from '\.\/lever\.ts';$/gm) ?? []).length).toBe(1);
    expect((text.match(/^export const LEVER\b/gm) ?? []).length).toBe(0);
    const lever = FILES['lever.ts']!;
    expect(lever).toMatch(/^export const LEVER = \[[^\]]*\];$/m);
    expect(lever).not.toMatch(/^import\b/m);
    expect(task.lever).toEqual([...LEVER]);
  });

  it.each(STATES.map((s) => [s.join('+'), s] as const))('state %s: leverHosts, leverItems and leverSpecs hold exactly the state\'s hosts, items and A event', (_k, state) => {
    const put = leverHosts(reader, state);
    const added = put.filter((r) => r.resourceType === 'Patient').map((r) => r.id!).sort();
    expect(added).toEqual([...hostsIn(state)].sort());
    const allowed = new Set([...T4_SLOTS, ...added]);
    for (const r of put) for (const p of patientRefs(r)) expect(allowed.has(p), `${r.resourceType}/${r.id} names Patient/${p}`).toBe(true);
    expect(leverItems(state).map((x) => x.key).sort()).toEqual([ITEM_OF.A!, ...state.filter((l) => l !== 'A').map((l) => ITEM_OF[l]!)].sort());
    expect(hostPatients(state).map((p) => p.name)).toEqual(['Gerald Whitcomb', ...(state.includes('B') ? ['Lorraine Pruitt'] : []), ...(state.includes('reserve') ? ['Victor Salazar'] : [])]);
    expect(leverSpecs(state)).toEqual(state.includes('A') ? ['whitcomb-a1'] : []);
  });

  it('the committed world holds exactly the active hosts, each numbered after the cohort, and every registry id names a T4 patient and no frozen task\'s (isolation, R40)', () => {
    const hosts = hostsIn(LEVER);
    expect(Object.keys(IDS).filter((k) => k.startsWith('pt-')).sort()).toEqual([...hosts].sort());
    const ids = hosts.map((h) => idOf(h));
    // The cohort's last Patient is the last one no task's registry names (tasks/planted.ts), so the
    // bound holds with another task's hosts in the world too (the central slots, packages/env/overlay.ts
    // TASKS, number T4's after T1's and T2's; a bound over every other Patient would fail for them).
    const last = Math.max(...all.filter((r) => r.resourceType === 'Patient' && !isPlanted(r.id)).map((r) => Number(r.id!.slice(3))));
    for (const h of ids) expect(Number(h.slice(3)) > last, h).toBe(true);
    const frozen = new Set<string>([...TASKS.T3.slots, ...TASKS.T5.slots]);
    const own = new Set([...T4_SLOTS, ...ids]);
    for (const [key, id] of Object.entries(IDS)) {
      const r = all.find((x) => x.id === id);
      expect(r, key).toBeDefined();
      for (const p of patientRefs(r!)) {
        expect(own.has(p), `${key} (${id}) names Patient/${p}`).toBe(true);
        expect(frozen.has(p), `${key} touches a frozen task's patient`).toBe(false);
      }
    }
    // Each host's chart: the clinic as PCP and the rule's MRN, like every other patient.
    for (const h of ids) {
      const p = store.get('Patient', h) as { generalPractitioner?: Array<{ reference?: string }>; identifier?: Array<{ system?: string; value?: string }> } | undefined;
      expect(p?.generalPractitioner?.[0]?.reference, h).toBe('Practitioner/pr-okafor');
      expect((p?.identifier ?? []).find((i) => i.system === 'urn:riverbend:mrn')?.value, h).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  // A declared trap needs a mutant, and a lever item's mutants exist only with its patient (the A
  // item's with its event), so task.toml [matrix] traps lists each trap exactly while its item is
  // active (the toggle checklist in lever.ts).
  it("task.toml declares each lever item's trap exactly when the item is active", () => {
    const toml = FILES['task.toml']!;
    for (const [id, traps] of Object.entries(TRAP_OF)) for (const trap of traps) expect(toml.includes(`"${trap}"`), trap).toBe(LEVER.includes(id));
  });

  it('instruction.md names the base patients and exactly the listed hosts, in list order', () => {
    const names = expected.patients.map((p) => p.name);
    expect(names.slice(0, 3)).toEqual(['Walter Kim', 'Terence Stark', 'Earnest Roberts']);
    for (const n of names) expect(task.instruction, n).toContain(n);
    for (const n of ['Lorraine Pruitt', 'Victor Salazar']) expect(task.instruction.includes(n), n).toBe(names.includes(n));
    const count = ['Three', 'Four', 'Five', 'Six'][names.length - 3]!;
    expect(task.instruction.startsWith(`${count} of my patients`)).toBe(true);
  });

  // verifier-phase-P17i-W5E-T4-222-1 B1: the request sentence (the task, the policy, the flags the
  // rubric reads) must follow the names in every LEVER state; a state switch that rewrites the names
  // must leave it. The whole instruction, so nothing else can slip in or out.
  it('instruction.md is the list of names followed by the request sentence, and the sign-off', () => {
    const names = expected.patients.map((p) => p.name);
    const count = ['Three', 'Four', 'Five', 'Six'][names.length - 3]!;
    const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    expect(task.instruction).toBe(`${count} of my patients came home from St. Brigid this past week: ${list}. Please reconcile each one's outpatient medication list per RBC-TOC-02 and flag anything you can't resolve to me.\n\n— Dr. Okafor\n`);
  });

  it('RBC-TOC-02 §2 holds the post-discharge sentence once, and it names no item (R11)', () => {
    const text = task.policies.find((p) => p.id === 'RBC-TOC-02')!.text.replace(/\s+/g, ' ');
    expect(text.split(POST_DISCHARGE_SENTENCE).length - 1).toBe(1);
    expect(text.indexOf(POST_DISCHARGE_SENTENCE)).toBeGreaterThan(text.indexOf('§2'));
    expect(text.indexOf(POST_DISCHARGE_SENTENCE)).toBeLessThan(text.indexOf('§3'));
    for (const w of ['metformin', 'creatinine', 'Pruitt', 'SCr']) expect(POST_DISCHARGE_SENTENCE.includes(w), w).toBe(false);
  });

  // The whole-list scan (G2) on the committed world.
  const items = (derive({ get: (type, rid) => all.find((r) => r.resourceType === type && r.id === rid), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) }) as unknown as { items: Array<{ key: string; kind: string; decisive: string[]; patient: string }> }).items;
  const obsOf = (patient: string, code: string) => (all.filter((r) => r.resourceType === 'Observation' && r.subject?.reference === patient && (r.code?.coding ?? []).some((c) => c.code === code)) as Obs[]);
  it("every other conditional line rests on a result after discharge: Kim's holds, Roberts' resumes, each on a post-discharge result; only the B host's defers", () => {
    expect(items.filter((x) => x.kind === 'defer').map((x) => x.key)).toEqual(LEVER.includes('B') ? ['pruitt-metformin'] : []);
    expect(items.find((x) => x.key === 'kim-lisinopril')?.kind).toBe('hold');
    expect(items.find((x) => x.key === 'roberts-lisinopril')?.kind).toBe('resume');
    expect(items.find((x) => x.key === 'whitcomb-lisinopril')?.kind).toBe('resume');
    // Each resume's post-discharge creatinine is dated after its stay, and no base conditional item
    // reads a stay result: the sentence changes nothing for them.
    for (const [key, enc, scr] of [['roberts-lisinopril', 'enc-t4-roberts-adm', 'obs-t4-roberts-scr-1020'], ['whitcomb-lisinopril', 'enc-t4-whitcomb-adm', 'obs-t4-whitcomb-scr-1021']] as const) {
      const stay = store.get('Encounter', idOf(enc)) as { period?: { end?: string } } | undefined;
      const o = store.get('Observation', idOf(scr)) as Obs | undefined;
      expect(Date.parse(o?.effectiveDateTime ?? '') > Date.parse(stay?.period?.end ?? ''), key).toBe(true);
      expect(items.find((x) => x.key === key)!.decisive).toContain(`Observation/${idOf(scr)}`);
    }
  });

  it("no fill history but the reserve host's prints a coverage figure", () => {
    type Doc = { type?: { coding?: Array<{ code?: string }> }; content?: Array<{ attachment?: { data?: string } }>; subject?: { reference?: string } };
    const docs = all.filter((r) => r.resourceType === 'DocumentReference') as unknown as Doc[];
    const printing = docs.filter((d) => (d.type?.coding ?? []).some((c) => c.code === '10160-0') && /proportion of days covered/i.test(decode(d.content?.[0]?.attachment?.data))).map((d) => d.subject?.reference);
    expect(printing).toEqual(LEVER.includes('reserve') ? [`Patient/${idOf(HOSTS.reserve)}`] : []);
  });

  it('the batch: the silent sibling is LEVER_ITEMS.A.sibling, newer, normal and unflagged; the notified value is high; both clear 5.0 by the margin and file to the A host', () => {
    const spec = SPECS.find((s) => s.id === 'whitcomb-a1')!;
    const [high, silent] = spec.resources as unknown as Obs[];
    expect(`Observation/${silent!.id}`).toBe(LEVER_ITEMS.find((i) => i.id === 'A')!.sibling[0]);
    expect(silent!.id).toBe(ARRIVAL.whitcombA1Silent);
    expect(high!.id).toBe(ARRIVAL.whitcombA1High);
    expect(high!.interpretation?.[0]?.coding?.[0]?.code).toBe('H');
    expect(silent!.interpretation).toBeUndefined();
    expect(Date.parse(silent!.effectiveDateTime!) > Date.parse(high!.effectiveDateTime!)).toBe(true);
    expect(high!.valueQuantity!.value! - 5.0).toBeGreaterThanOrEqual(MARGINS.potassium);
    expect(5.0 - silent!.valueQuantity!.value!).toBeGreaterThanOrEqual(MARGINS.potassium);
    const host = `Patient/${idOf(HOSTS.A)}`;
    expect(high!.subject?.reference).toBe(host);
    expect(silent!.subject?.reference).toBe(host);
    // The batch is newer than every potassium on his chart, so §7 reads it as the most recent.
    for (const o of obsOf(host, '2823-3')) expect(Date.parse(o.effectiveDateTime!) < Date.parse(high!.effectiveDateTime!), o.id).toBe(true);
    // The arrivals are not in the world.
    for (const r of spec.resources) expect(store.get(r.resourceType, r.id!)).toBeUndefined();
  });

  // R32: a lever item is gated like every other; the null agent passes none of them.
  it('the null agent passes no lever item (R32)', { timeout: 300_000 }, async () => {
    const env = matrixEnv();
    const mt = await loadMatrixTask('discharge-medrec');
    const r = await trial(env, mt, { kind: 'null', id: 'null', script: NULL_AGENT });
    const g = await gradeRun(env, mt, mt.checks, r);
    const failed = new Set(g.checks.flatMap((c) => c.items ?? []).filter((i) => !i.met).map((i) => i.item));
    for (const x of leverItems(LEVER)) expect(failed.has(x.key), x.key).toBe(true);
  });
});
