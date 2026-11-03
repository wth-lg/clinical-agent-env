// An overlay may add its own Patients where a probe's class needs one and no free slot fits it
// (plan-amendment-worklist W1-0; decisions.tsv 2026-10-30, builder-210). An added Patient is written
// under a registry key of its task (pt-t1-<rest>), takes one of its task's fixed slots after the
// cohort's last Patient in key order within the task (TASKS added; W5, builder-302-slots:
// overlay-added-slots.test.ts), is listed in the task's registry, owned by its task like a slot (no
// other task may write on it), and given the world's MRN rule after the overlays (mrn.ts checkMrns).
// Its id above the cohort's last is a named residual (scripts/test/world-tells.test.ts) until W2-0
// grows the cohort past pt-0060.
import { describe, expect, it } from 'vitest';
import { checkMrns, mrn, MRN_SYSTEM } from '../mrn.ts';
import { applyOverlays, type Overlay, type TaskId } from '../overlay.ts';
import type { Resource } from '../store.ts';

const id4 = (n: number) => `pt-${String(n).padStart(4, '0')}`;
const BASE: Resource[] = Array.from({ length: 60 }, (_, i) => ({ resourceType: 'Patient', id: id4(i + 1), birthDate: '1970-01-01', name: [{ family: `F${i + 1}` }] }) as Resource);
const patient = (key: string, family: string): Resource => ({ resourceType: 'Patient', id: key, birthDate: '1961-04-02', gender: 'female', name: [{ use: 'official', family, given: ['Ada'] }] }) as Resource;
const obs = (key: string, subject: string): Resource => ({ resourceType: 'Observation', id: key, status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, subject: { reference: `Patient/${subject}` }, effectiveDateTime: '2026-10-01T09:00:00-04:00' }) as Resource;
const overlay = (task: TaskId, put: Resource[]): Overlay => ({ task, added: Object.fromEntries(put.filter((r) => r.resourceType === 'Patient').map((r) => r.id!).sort().map((k, i) => [k, i])), build: () => ({ put }) });
const build = (overlays: Overlay[]) => applyOverlays(BASE, [], {}, overlays);
const pts = (rs: readonly Resource[]) => rs.filter((r) => r.resourceType === 'Patient').map((r) => r.id);

describe('an overlay that adds a Patient', () => {
  it("gets it its task's first slot after the cohort's last Patient, in its registry, with every reference to it renamed, and its resources in the slot's block", () => {
    const w = build([overlay('T1', [patient('pt-t1-newcomer', 'Ito'), obs('obs-t1-newcomer-cr', 'pt-t1-newcomer')])]);
    expect(pts(w.resources).at(-1)).toBe('pt-0061');
    expect(w.ids.T1).toEqual({ 'obs-t1-newcomer-cr': 'obs-61001', 'pt-t1-newcomer': 'pt-0061' });
    const o = w.resources.find((r) => r.resourceType === 'Observation') as { subject: { reference: string } };
    expect(o.subject.reference).toBe('Patient/pt-0061');
    expect(JSON.stringify(w.resources)).not.toMatch(/pt-t1-/);
  });

  it("numbers each task's added Patients from its own slots in key order, whatever order the overlays come in", () => {
    const t1 = overlay('T1', [patient('pt-t1-zed', 'Zed')]);
    const t2 = overlay('T2', [patient('pt-t2-amy', 'Amy'), patient('pt-t2-bo', 'Bo')]);
    const a = build([t2, t1]);
    expect({ T1: a.ids.T1, T2: a.ids.T2 }).toEqual({ T1: { 'pt-t1-zed': 'pt-0061' }, T2: { 'pt-t2-amy': 'pt-0064', 'pt-t2-bo': 'pt-0065' } });
    expect(build([t1, t2]).resources).toEqual(a.resources);
  });

  it("owns it like a slot: its own resources may reference it, another task's may not", () => {
    expect(() => build([overlay('T1', [obs('obs-t1-cr', 'pt-t1-newcomer'), patient('pt-t1-newcomer', 'Ito')])])).not.toThrow();
    expect(() => build([overlay('T1', [patient('pt-t1-newcomer', 'Ito')]), overlay('T6', [obs('obs-t6-cr', 'pt-t1-newcomer')])])).toThrow(/obs-t6-cr references a patient that is not a T6 slot/);
  });

  it("writes it under its own task's key, and gives it no name", () => {
    expect(() => build([overlay('T1', [patient('pt-t6-x', 'Ito')])])).toThrow(/is not a registry key of T1/);
    expect(() => build([overlay('T1', [patient('pt-0061', 'Ito')])])).toThrow(/is not a registry key of T1/);
    expect(() => build([{ task: 'T1', names: { 'pt-t1-x': 'pt-ito' }, added: { 'pt-t1-x': 0 }, build: () => ({ put: [patient('pt-t1-x', 'Ito')] }) }])).toThrow(/name key pt-t1-x|takes no name/);
  });

  it("gets the world's MRN rule after the overlays, by its world id; a hand-written MRN fails the build", () => {
    const w = build([overlay('T1', [patient('pt-t1-newcomer', 'Ito')])]);
    const added = checkMrns(w.resources).find((r) => r.id === 'pt-0061') as { identifier: Array<{ system: string; value: string }> };
    expect(added.identifier.find((i) => i.system === MRN_SYSTEM)!.value).toBe(mrn('pt-0061'));
    const typed = { ...patient('pt-t1-newcomer', 'Ito'), identifier: [{ system: MRN_SYSTEM, value: '1234-56' }] } as Resource;
    expect(() => checkMrns(build([overlay('T1', [typed])]).resources)).toThrow(/Patient\/pt-0061: MRN 1234-56 is not/);
  });
});
