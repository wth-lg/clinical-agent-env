// Fixed id slots for the Patients an overlay adds (W5, the T1 gate's F3; builder-302-slots).
// Each task that may add Patients declares a range of Patient numbers (TASKS[task].added: the
// first number and how many), after the cohort's last; its added Patients take the slots the
// overlay declares for their keys (Overlay.added), whatever the other tasks add and whether or not
// the overlay's other keys are added. A resource of an added Patient is numbered in a block
// of its Patient's slot, per type (<prefix>-<slot><3 digits>: pt-0070's Observations are
// obs-70001 on), never in the cohort's own sequence. So toggling an item in one task (its Patient
// present or absent) moves no id in another task, none of the first task's other ids, and none of
// the cohort's; and the build with no added Patient is what it was. Overflow fails loudly: more
// Patients than the task's slots, more than 999 resources of one type for one Patient, a slot
// number past 99, or a task with no slots adding a Patient.
import { describe, expect, it } from 'vitest';
import { applyOverlays, checkAddedRanges, TASKS, type Overlay, type TaskId } from '../overlay.ts';
import { worldIds } from '../renumber.ts';
import type { Resource } from '../store.ts';

const id4 = (n: number) => `pt-${String(n).padStart(4, '0')}`;
const COHORT: Resource[] = Array.from({ length: 60 }, (_, i) => ({ resourceType: 'Patient', id: id4(i + 1), birthDate: '1970-01-01', name: [{ family: `F${i + 1}` }] }) as Resource);
// Three generated observations on cohort patients, numbered as the generator numbers them.
const generated = (n: number, subject: string, at: string): Resource =>
  ({ resourceType: 'Observation', id: `obs-${String(n).padStart(5, '0')}`, status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, subject: { reference: `Patient/${subject}` }, effectiveDateTime: at }) as Resource;
const BASE: Resource[] = [...COHORT, generated(1, 'pt-0001', '2026-01-01T09:00:00-05:00'), generated(2, 'pt-0002', '2026-02-01T09:00:00-05:00'), generated(3, 'pt-0060', '2026-03-01T09:00:00-05:00')];
const patient = (key: string, family: string): Resource => ({ resourceType: 'Patient', id: key, birthDate: '1961-04-02', gender: 'female', name: [{ use: 'official', family, given: ['Ada'] }] }) as Resource;
const obs = (key: string, subject: string, at = '2026-10-01T09:00:00-04:00', code = '2160-0'): Resource =>
  ({ resourceType: 'Observation', id: key, status: 'final', code: { coding: [{ system: 'http://loinc.org', code }] }, subject: { reference: `Patient/${subject}` }, effectiveDateTime: at }) as Resource;
// An overlay with a slot for each Patient key it puts, in key order, or the slots given.
const overlay = (task: TaskId, put: Resource[], added?: Readonly<Record<string, number>>): Overlay => ({
  task,
  added: added ?? Object.fromEntries(put.filter((r) => r.resourceType === 'Patient').map((r) => r.id!).sort().map((k, i) => [k, i])),
  build: () => ({ put }),
});
const build = (overlays: Overlay[]) => applyOverlays(BASE, [], {}, overlays);
const obsIds = (rs: readonly Resource[]) => rs.filter((r) => r.resourceType === 'Observation').map((r) => r.id).sort();

describe('added Patients take fixed slots per task (W5 F3)', () => {
  it('TASKS declares each lever task\'s slots after the cohort, three each, none overlapping; the frozen task declares none', () => {
    const ranges = (Object.entries(TASKS) as Array<[TaskId, { added?: { first: number; count: number } }]>).flatMap(([t, v]) => (v.added ? [[t, v.added.first, v.added.count] as const] : []));
    expect(ranges).toEqual([['T1', 61, 3], ['T2', 64, 3], ['T3', 73, 3], ['T4', 67, 3], ['T6', 70, 3]]);
    // T3's range came with its v2 lever (R42); T5, frozen, declares none.
    expect(TASKS.T5).not.toHaveProperty('added');
  });

  it('numbers a task\'s added Patients from its own range in key order, whatever the other tasks add', () => {
    const t1 = overlay('T1', [patient('pt-t1-b', 'B'), patient('pt-t1-a', 'A')]);
    const t6 = overlay('T6', [patient('pt-t6-k', 'K'), obs('obs-t6-k-cr', 'pt-t6-k')]);
    const both = build([t1, t6]);
    expect(both.ids.T1).toEqual({ 'pt-t1-a': 'pt-0061', 'pt-t1-b': 'pt-0062' });
    expect(both.ids.T6).toEqual({ 'obs-t6-k-cr': 'obs-70001', 'pt-t6-k': 'pt-0070' });
    expect(build([t6]).ids.T6).toEqual(both.ids.T6);
    expect(build([t6, t1]).resources).toEqual(both.resources);
    // A key with a slot that is not added this build (an inactive item) leaves the others' slots alone.
    const m = build([overlay('T6', [patient('pt-t6-m', 'M')], { 'pt-t6-k': 0, 'pt-t6-m': 1 })]);
    expect(m.ids.T6).toEqual({ 'pt-t6-m': 'pt-0071' });
  });

  it('a toggle in one task moves no id of another task, none of the task\'s own other ids and none of the cohort\'s', () => {
    const a = [patient('pt-t1-a', 'A'), obs('obs-t1-a-cr', 'pt-t1-a'), obs('obs-t1-a-k', 'pt-t1-a', '2026-10-02T09:00:00-04:00', '2823-3')];
    const b = [patient('pt-t1-b', 'B'), obs('obs-t1-b-cr', 'pt-t1-b')];
    const t6 = overlay('T6', [patient('pt-t6-k', 'K'), obs('obs-t6-k-cr', 'pt-t6-k'), obs('obs-t6-k-k', 'pt-t6-k', '2026-09-01T09:00:00-04:00', '2823-3')]);
    const slots = { 'pt-t1-a': 0, 'pt-t1-b': 1 };
    const on = build([overlay('T1', [...a, ...b], slots), t6]);
    const off = build([overlay('T1', b, slots), t6]);
    expect(off.ids.T6).toEqual(on.ids.T6);
    expect(off.ids.T1).toEqual({ 'obs-t1-b-cr': on.ids.T1['obs-t1-b-cr'], 'pt-t1-b': on.ids.T1['pt-t1-b'] });
    expect(on.ids.T1['pt-t1-b']).toBe('pt-0062');
    expect(off.synthea).toEqual(on.synthea);
    expect(on.ids.T6).toEqual({ 'obs-t6-k-cr': 'obs-70002', 'obs-t6-k-k': 'obs-70001', 'pt-t6-k': 'pt-0070' });
  });

  it('numbers an added Patient\'s resources in its slot\'s block, per type, in (date, code) order, and leaves the cohort\'s numbering as it was', () => {
    const none = build([]);
    const with6 = build([overlay('T6', [patient('pt-t6-k', 'K'), obs('obs-t6-k-cr', 'pt-t6-k'), obs('obs-t6-k-k', 'pt-t6-k', '2026-10-01T09:00:00-04:00', '2823-3')])]);
    expect(none.synthea).toEqual({ 'obs-00001': 'obs-00001', 'obs-00002': 'obs-00002', 'obs-00003': 'obs-00003' });
    expect(with6.synthea).toEqual(none.synthea);
    expect(obsIds(with6.resources)).toEqual(['obs-00001', 'obs-00002', 'obs-00003', 'obs-70001', 'obs-70002']);
    // The same instant: the code orders them (2160-0 before 2823-3).
    expect(with6.ids.T6).toEqual({ 'obs-t6-k-cr': 'obs-70001', 'obs-t6-k-k': 'obs-70002', 'pt-t6-k': 'pt-0070' });
    const o = with6.resources.find((r) => r.id === 'obs-70001') as { subject: { reference: string } };
    expect(o.subject.reference).toBe('Patient/pt-0070');
    expect(JSON.stringify(with6.resources)).not.toMatch(/pt-t6-|obs-t6-/);
  });

  it('fails loudly on overflow: more Patients than the slots, more than 999 resources of a type for one Patient, a task with no slots', () => {
    expect(() => build([overlay('T6', ['a', 'b', 'c', 'd'].map((k) => patient(`pt-t6-${k}`, k)))])).toThrow(/overlay T6: added slot 3 for pt-t6-d is outside 0 to 2 \(3 slots, pt-0070 to pt-0072\)/);
    expect(() => build([overlay('T6', [patient('pt-t6-k', 'K')], {})])).toThrow(/overlay T6: adds Patient\/pt-t6-k without a slot: declare its slot index in the overlay's added/);
    expect(() => build([overlay('T6', [patient('pt-t6-k', 'K'), patient('pt-t6-m', 'M')], { 'pt-t6-k': 1, 'pt-t6-m': 1 })])).toThrow(/overlay T6: added slot 1 is given to pt-t6-k and pt-t6-m/);
    const many = Array.from({ length: 1000 }, (_, i) => obs(`obs-t6-k-${i}`, 'pt-t6-k', `2026-01-01T00:${String(i % 60).padStart(2, '0')}:00-05:00`, `code-${i}`));
    expect(() => build([overlay('T6', [patient('pt-t6-k', 'K'), ...many])])).toThrow(/Patient\/pt-0070: 1000 Observation resources, at most 999 in its slot/);
    expect(() => build([overlay('T5', [patient('pt-t5-x', 'X')])])).toThrow(/overlay T5: adds Patient\/pt-t5-x, and T5 declares no added-Patient slots/);
  });

  // The #215 gate (verifier-phase-P17i-SLOTS-215-1): S1, M1, M2, M3, M4.
  it('S1: a resource a LEVER toggle can add or remove (OverlayEdits.lever) must sit on an added Patient; one on a cohort Patient fails the build by name', () => {
    const lever = (put: Resource[], keys: string[], added?: Readonly<Record<string, number>>): Overlay => ({ ...overlay('T1', put, added), build: () => ({ put, lever: keys }) });
    expect(() => build([lever([patient('pt-t1-a', 'A'), obs('obs-t1-a-cr', 'pt-t1-a')], ['pt-t1-a', 'obs-t1-a-cr'])])).not.toThrow();
    expect(() => build([lever([obs('obs-t1-x', 'pt-0001')], ['obs-t1-x'], {})])).toThrow(/overlay T1: lever resource Observation\/obs-t1-x sits on the cohort's Patient\/pt-0001; a resource a LEVER toggle adds or removes must sit on an added Patient/);
    // A declared key this build does not put is an inactive item's: allowed.
    expect(() => build([lever([patient('pt-t1-a', 'A')], ['pt-t1-a', 'obs-t1-off'])])).not.toThrow();
  });

  it('M1: a resource that references an added Patient anywhere numbers in that Patient\'s block; one that references two added Patients is rejected', () => {
    const mixed = { ...obs('obs-t1-m', 'pt-0001'), performer: [{ reference: 'Patient/pt-t1-a' }] } as Resource;
    const w = build([overlay('T1', [patient('pt-t1-a', 'A'), mixed])]);
    expect(w.ids.T1).toEqual({ 'obs-t1-m': 'obs-61001', 'pt-t1-a': 'pt-0061' });
    expect(w.synthea).toEqual(build([]).synthea);
    const two = { ...obs('obs-t1-two', 'pt-t1-a'), performer: [{ reference: 'Patient/pt-t1-b' }] } as Resource;
    expect(() => build([overlay('T1', [patient('pt-t1-a', 'A'), patient('pt-t1-b', 'B'), two])])).toThrow(/renumber: Observation\/obs-t1-two references two added Patients \(pt-0061, pt-0062\)/);
  });

  it('M3: a range past pt-0099, or one inside the cohort, or two that overlap, is rejected when TASKS is checked', () => {
    expect(() => checkAddedRanges([['T1', { first: 98, count: 3 }]], 60)).toThrow(/overlay: T1's added-Patient slots reach pt-0100, past pt-0099/);
    expect(() => checkAddedRanges([['T1', { first: 60, count: 3 }]], 60)).toThrow(/inside the cohort/);
    expect(() => checkAddedRanges([['T1', { first: 61, count: 3 }], ['T2', { first: 63, count: 3 }]], 60)).toThrow(/overlap/);
    expect(() => checkAddedRanges([['T1', { first: 61, count: 3 }], ['T2', { first: 64, count: 3 }]], 60)).not.toThrow();
  });

  it('M4: an Overlay.added key that is not a Patient key of the task is rejected', () => {
    expect(() => build([overlay('T1', [patient('pt-t1-a', 'A')], { 'pt-t1-a': 0, 'pt-t6-zz': 1 })])).toThrow(/overlay T1: added names pt-t6-zz, which is not a Patient key of T1 \(pt-t1-<rest>\)/);
    expect(() => build([overlay('T1', [patient('pt-t1-a', 'A')], { 'pt-t1-a': 0, foo: 1 })])).toThrow(/added names foo, which is not a Patient key of T1/);
  });

  it('M2: a cohort sequence that reaches a block in use fails loudly', () => {
    const many = Array.from({ length: 61001 }, (_, i) => generated(i + 1, 'pt-0001', `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}-05:00`));
    expect(() => worldIds([...many, obs('obs-61x', 'pt-0061')], new Set(['pt-0061']))).toThrow(/renumber: 61001 Observation resources of the cohort reach the block of Patient\/pt-0061 \(obs-61001\)/);
    expect(() => worldIds(many)).not.toThrow();
  });

  // The #215 round-2 gate (verifier-phase-P17i-SLOTS-215-2-1): N3, F4.
  it('N3: a LEVER-driven remove is refused: a lever key that names a removal fails the build by name', () => {
    const lever: Overlay = { task: 'T1', added: { 'pt-t1-a': 0 }, build: () => ({ put: [patient('pt-t1-a', 'A')], remove: [{ resourceType: 'Observation', id: 'obs-00001' }], lever: ['pt-t1-a', 'obs-00001'] }) };
    expect(() => build([lever])).toThrow(/overlay T1: lever names obs-00001, a removal; a LEVER toggle may not remove a resource \(a removal is of a base resource, on a cohort Patient\)/);
  });

  it('F4: a lever resource that references no Patient is refused', () => {
    const org = { resourceType: 'Organization', id: 'org-t1-x', name: 'X' } as Resource;
    const lever: Overlay = { task: 'T1', names: { 'org-t1-x': 'org-x' }, added: { 'pt-t1-a': 0 }, build: () => ({ put: [patient('pt-t1-a', 'A'), org], lever: ['pt-t1-a', 'org-t1-x'] }) };
    expect(() => build([lever])).toThrow(/overlay T1: lever resource Organization\/org-t1-x references no Patient; a resource a LEVER toggle adds or removes must sit on an added Patient/);
  });
});
