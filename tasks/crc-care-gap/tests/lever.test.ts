// The W5-style lever toggles of T3 v2 (R42; plan-amendment-w5 G1, G2; lever.ts LEVER, lever-keys.ts
// HOSTS, overlay.ts leverHosts): what each LEVER state must hold, checked without a rebuild where it
// can be, and the whole-list scan. The states: {A}, {} and {A,reserve}; the committed one is LEVER.
//   - the overlay built for a state adds the A host always (her item A is her arrival alone, so A
//     toggles with no rebuild) and the reserve host exactly while the reserve is active; each host
//     is a panel member while in the world; no put names a patient but a T3 slot or a host (overlay
//     isolation; R40: never a contrast-ct-prep patient);
//   - expected.ts panelOf gives exactly the state's members, and events.ts leverSpecs exactly its A
//     event; LEVER_ITEMS declares every lever id once, A naming its spec and its silent sibling;
//   - for the committed state: expected.ts re-exports LEVER from lever.ts on a line of its own (the
//     form packages/core/tasks.ts leverOf reads into env_version), lever.ts imports nothing, and
//     task.toml declares each lever item's trap exactly while it is active;
//   - the batch (events.ts crc-b3): the routed cover names no deciding fact (no collection date, no
//     'withdrawn'), the silent re-issued result is the LEVER_ITEMS sibling, final, collected before
//     the period by at least two days, and the cancelled original keeps its 2026 collection date;
//   - the whole-list scan: policy.ts on the committed world gives each member the planned status;
//     no member but Koss (planned, D1) and the A host holds a FOBT collected within 14 days of the
//     period's start; no member but the reserve host holds a care episode in a status §4 does not
//     count; no registry id names a contrast-ct-prep patient;
//   - the null agent passes no lever item (R32).
import { describe, expect, it } from 'vitest';
import { nodeTaskDirs, nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { TASKS, patientRefs, type WorldReader } from '../../../packages/env/overlay.ts';
import { gradeRun, NULL_AGENT, trial } from '../../../packages/grader/matrix/matrix.ts';
import { isPlanted } from '../../planted.ts';
import { COVER_TEXT, leverSpecs, SPECS } from '../events.ts';
import { ARRIVAL } from '../solution/steps.ts';
import { expected, LEVER_ITEMS, panelOf } from '../expected.ts';
import { IDS, idOf } from '../ids.ts';
import { LEVER } from '../lever.ts';
import { HOSTS, SLOT } from '../lever-keys.ts';
import { leverHosts } from '../overlay.ts';
import { derive } from '../policy.ts';

const STATES: ReadonlyArray<readonly string[]> = [['A'], [], ['A', 'reserve']];
const LEVER_IDS = Object.keys(HOSTS) as Array<keyof typeof HOSTS>;
const TRAP_OF: Readonly<Record<string, readonly string[]>> = { A: ['batch_sibling_unread'], reserve: ['hospice_episode_status_misread'] };
// The hosts a state's world holds: the A host always, the reserve host while active.
const hostsIn = (state: readonly string[]) => LEVER_IDS.filter((l) => l === 'A' || state.includes(l)).map((l) => HOSTS[l]);
const BASE = ['Patient/pt-0009', 'Patient/pt-0020', 'Patient/pt-0022', 'Patient/pt-0024'];
const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const reader: WorldReader = { get: store.get.bind(store), search: store.search.bind(store), resources: store.resources.bind(store), size: store.size };
const task = await nodeTaskSource({ testMode: false }).get('crc-care-gap');
const FILES = nodeTaskDirs().find((d) => d.id === 'crc-care-gap')!.files;
const T3_SLOTS: readonly string[] = TASKS.T3.slots;
type Obs = { id?: string; status?: string; subject?: { reference?: string }; effectiveDateTime?: string; code?: { coding?: Array<{ code?: string }> }; performer?: Array<{ reference?: string }> };
const decode = (data: string | undefined) => new TextDecoder().decode(Uint8Array.from(atob(data ?? ''), (c) => c.charCodeAt(0)));
const DAY = 86_400_000;

describe('crc-care-gap lever toggles (T3 v2, R42)', () => {
  it('declares every lever item once in LEVER_ITEMS; A names its spec and its sibling; LEVER names declared items only', () => {
    expect([...LEVER_ITEMS].map((i) => i.id).sort()).toEqual([...LEVER_IDS].sort());
    for (const i of LEVER_ITEMS) {
      expect(i.item).toBe(`Patient/${idOf(HOSTS[i.id as keyof typeof HOSTS])}`);
      expect(i.patient).toBe(idOf(HOSTS[i.id as keyof typeof HOSTS]));
      if (i.kind === 'A') {
        expect(i.spec).toBe('crc-b3');
        expect(i.sibling.length).toBeGreaterThan(0);
      }
    }
    expect(LEVER_ITEMS.find((i) => i.id === 'reserve')?.reserve).toBe(true);
    for (const id of LEVER) expect(LEVER_IDS as readonly string[], id).toContain(id);
    expect(new Set(LEVER).size).toBe(LEVER.length);
    expect(Object.values(SLOT).sort()).toEqual([0, 1]);
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

  it.each(STATES.map((s) => [s.join('+') || 'none', s] as const))('state %s: leverHosts, panelOf and leverSpecs hold exactly the state\'s hosts, members and A event', (_k, state) => {
    const put = leverHosts(reader, state);
    const added = put.filter((r) => r.resourceType === 'Patient').map((r) => r.id!).sort();
    expect(added).toEqual([...hostsIn(state)].sort());
    const allowed = new Set([...T3_SLOTS, ...added]);
    for (const r of put) for (const p of patientRefs(r)) expect(allowed.has(p), `${r.resourceType}/${r.id} names Patient/${p}`).toBe(true);
    expect(panelOf(state).sort()).toEqual([...BASE, ...hostsIn(state).map((h) => `Patient/${idOf(h)}`)].sort());
    expect(leverSpecs(state)).toEqual(state.includes('A') ? ['crc-b3'] : []);
  });

  it('the committed world holds exactly the active hosts, each numbered after the cohort, and every registry id names a T3 patient and no contrast-ct-prep patient (isolation, R40)', () => {
    const hosts = hostsIn(LEVER);
    expect(Object.keys(IDS).filter((k) => k.startsWith('pt-')).sort()).toEqual([...hosts].sort());
    const ids = hosts.map((h) => idOf(h));
    const last = Math.max(...all.filter((r) => r.resourceType === 'Patient' && !isPlanted(r.id)).map((r) => Number(r.id!.slice(3))));
    for (const h of ids) expect(Number(h.slice(3)) > last, h).toBe(true);
    const frozen = new Set<string>(TASKS.T5.slots);
    const own = new Set([...T3_SLOTS, ...ids]);
    for (const [key, id] of Object.entries(IDS)) {
      const r = all.find((x) => x.id === id);
      expect(r, key).toBeDefined();
      for (const p of patientRefs(r!)) {
        expect(own.has(p), `${key} (${id}) names Patient/${p}`).toBe(true);
        expect(frozen.has(p), `${key} touches a frozen task's patient`).toBe(false);
      }
    }
    for (const h of ids) {
      const p = store.get('Patient', h) as { generalPractitioner?: Array<{ reference?: string }>; identifier?: Array<{ system?: string; value?: string }> } | undefined;
      expect(p?.generalPractitioner?.[0]?.reference, h).toBe('Practitioner/pr-okafor');
      expect((p?.identifier ?? []).find((i) => i.system === 'urn:riverbend:mrn')?.value, h).toMatch(/^\d{4}-\d{2}$/);
    }
    // The panel Group lists exactly the state's members.
    const group = store.get('Group', idOf('grp-t3-okafor-crc')) as { member?: Array<{ entity?: { reference?: string } }>; quantity?: number } | undefined;
    expect((group?.member ?? []).map((m) => m.entity?.reference).sort()).toEqual(panelOf(LEVER).sort());
    expect(group?.quantity).toBe(panelOf(LEVER).length);
  });

  it("task.toml declares each lever item's trap exactly when the item is active", () => {
    const toml = FILES['task.toml']!;
    for (const [id, traps] of Object.entries(TRAP_OF)) for (const trap of traps) expect(toml.includes(`"${trap}"`), trap).toBe(LEVER.includes(id));
  });

  // The batch (R39(a), (b); verifier 214 F1): the routed cover decides nothing on its own; the
  // silent re-issued result is the deciding sibling.
  it('crc-b3: the cover names no deciding fact; the silent re-issued FIT is the sibling, final, collected before the period; the original keeps its 2026 date and is cancelled', () => {
    const spec = SPECS.find((s) => s.id === 'crc-b3')!;
    const [cover, reissued, original] = spec.resources as unknown as [{ resourceType: string; id: string; content: Array<{ attachment: { data?: string } }> }, Obs, Obs];
    expect(cover.resourceType).toBe('DocumentReference');
    const text = decode(cover.content[0]!.attachment.data);
    expect(text).toBe(COVER_TEXT);
    for (const w of ['2025', '12/28', 'December', 'withdrawn', 'collection date', 'collected on']) expect(text.toLowerCase().includes(w.toLowerCase()), w).toBe(false);
    expect(LEVER_ITEMS.find((i) => i.id === 'A')!.sibling).toEqual([`Observation/${reissued.id}`]);
    expect(ARRIVAL.Q[1]).toEqual(['Observation', reissued.id]);
    expect(reissued.status).toBe('final');
    expect(reissued.code?.coding?.[0]?.code).toBe('29771-3');
    expect(reissued.performer?.[0]?.reference).toBe('Organization/org-harbor-lab');
    expect(Date.parse('2026-01-01T00:00:00-05:00') - Date.parse(reissued.effectiveDateTime!)).toBeGreaterThanOrEqual(2 * DAY);
    expect(original.id).toBe(idOf('obs-t3-quintero-fit'));
    expect(original.status).toBe('entered-in-error');
    expect(original.effectiveDateTime!.startsWith('2026-01')).toBe(true);
    // The re-issued result is a new record (R41 addendum 2: never a window target; the event gates
    // grade it) absent from the world, in a range no other task's arrivals use.
    expect(store.get('Observation', reissued.id!)).toBeUndefined();
    expect(reissued.id).toMatch(/^obs-050\d\d$/);
  });

  // The whole-list scan (G2) on the committed world.
  const world = { get: (type: string, rid: string) => all.find((r) => r.resourceType === type && r.id === rid), all: (type?: string) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };
  const items = (derive(world) as unknown as { items: Array<{ patient: string; status: string; reason: string; decisive: string[] }> }).items;
  it(`policy.ts gives each member the planned status for LEVER [${LEVER.join(', ')}]`, () => {
    type Row = [string, string, string];
    const planned: Row[] = ([
      ['Patient/pt-0009', 'excluded', 'frailty_dementia_medication'],
      ['Patient/pt-0020', 'excluded', 'hospice'],
      ['Patient/pt-0022', 'met', 'fobt'],
      ['Patient/pt-0024', 'met', 'sdna_fit'],
      [`Patient/${idOf(HOSTS.A)}`, 'met', 'fobt'],
      ...(LEVER.includes('reserve') ? [[`Patient/${idOf(HOSTS.reserve)}`, 'gap', 'hospice_not_counted']] : []),
    ] as Row[]).sort((a, b) => a[0].localeCompare(b[0]));
    expect(items.map((x) => [x.patient, x.status, x.reason])).toEqual(planned);
    expect(expected.items.map((x) => [x.patient, x.status, x.reason])).toEqual(planned);
  });

  it('no member but Koss and the A host holds a FOBT collected within 14 days of the period; no member but the reserve host holds a care episode in a status §4 does not count', () => {
    const members = new Set(panelOf(LEVER));
    const near = (all as unknown as Obs[]).filter((r) => (r as { resourceType: string }).resourceType === 'Observation' && members.has(r.subject?.reference ?? '')
      && r.code?.coding?.some((c) => c.code === '29771-3') === true && Math.abs(Date.parse(r.effectiveDateTime ?? '') - Date.parse('2026-01-01T00:00:00-05:00')) <= 14 * DAY);
    expect(near.map((r) => r.subject?.reference ?? '').sort()).toEqual(['Patient/pt-0022', `Patient/${idOf(HOSTS.A)}`].sort());
    const episodes = all.filter((r) => r.resourceType === 'EpisodeOfCare' && members.has((r as { patient?: { reference?: string } }).patient?.reference ?? ''));
    const notCounted = episodes.filter((e) => !['planned', 'active', 'onhold', 'finished'].includes((e as { status?: string }).status ?? ''));
    expect(notCounted.map((e) => (e as { patient?: { reference?: string } }).patient?.reference)).toEqual(LEVER.includes('reserve') ? [`Patient/${idOf(HOSTS.reserve)}`] : []);
  });

  it('the null agent passes no lever item (R32)', async () => {
    const env = matrixEnv();
    const mt = await loadMatrixTask('crc-care-gap');
    const run = await trial(env, mt, { kind: 'null', id: 'null', script: NULL_AGENT });
    const grade = await gradeRun(env, mt, mt.checks, run, []);
    const failed = new Set(grade.checks.filter((c) => c.kind === 'gate').flatMap((c) => ((c as { items?: Array<{ item: string; met: boolean }> }).items ?? []).filter((i) => !i.met).map((i) => i.item)));
    for (const i of LEVER_ITEMS) if (LEVER.includes(i.id)) expect(failed.has(i.item), i.id).toBe(true);
  });
});
