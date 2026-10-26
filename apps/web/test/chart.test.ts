// The read-only Chart tab (pre-audit S12, P17j JU10): a task's patients come from the world the
// task's overlay built (its marked resources' subjects and its marked Group's members), and a
// patient's chart lists every Condition, MedicationRequest, AllergyIntolerance, Observation and
// DocumentReference the store holds for that patient, nothing else.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { CHART_TYPES, chartOf, patientOf, TASK_MARKER, taskPatients, type FhirResource } from '../src/tasks/chart.ts';

const REPO = join(import.meta.dirname, '../../..');
const world: FhirResource[] = gunzipSync(readFileSync(join(REPO, 'fixtures/world.ndjson.gz'))).toString('utf8')
  .split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as FhirResource);
const subjectOf = (r: FhirResource) => patientOf(r);

describe('taskPatients', () => {
  it('finds the one patient of a single-patient task', () => {
    expect(taskPatients(world, 'renal-dose-review')).toEqual(['Patient/pt-0002']);
    expect(taskPatients(world, 'discharge-medrec')).toEqual(['Patient/pt-0005']);
    expect(taskPatients(world, 'contrast-ct-prep')).toEqual(['Patient/pt-0015']);
  });
  it('finds every member of the panel task\'s group, and the patients of the inbox and queue tasks', () => {
    const panel = world.find((r) => r.resourceType === 'Group' && r.id === 'grp-t3-okafor-crc') as unknown as { member: { entity: { reference: string } }[] };
    expect(taskPatients(world, 'crc-care-gap')).toEqual(expect.arrayContaining(panel.member.map((m) => m.entity.reference)));
    expect(taskPatients(world, 'crc-care-gap').length).toBeGreaterThanOrEqual(12);
    expect(taskPatients(world, 'results-inbox').length).toBeGreaterThan(1);
    expect(taskPatients(world, 'message-queue').length).toBeGreaterThan(1);
  });
  it('is empty for a task it has no marker for', () => {
    expect(taskPatients(world, '_toy')).toEqual([]);
  });
});

describe('chartOf', () => {
  it('lists exactly the store\'s chart resources of the patient, by type', () => {
    for (const p of ['Patient/pt-0002', 'Patient/pt-0015', 'Patient/pt-0009']) {
      const chart = chartOf(world, p);
      for (const type of CHART_TYPES) {
        const want = world.filter((r) => r.resourceType === type && subjectOf(r) === p).map((r) => r.id).sort();
        expect(chart.rows.filter((x) => x.type === type).map((x) => x.id).sort(), `${p} ${type}`).toEqual(want);
      }
      expect(chart.patient?.id).toBe(p.slice('Patient/'.length));
    }
  });
});

describe('verifier JU10-1 F2-F5', () => {
  it('every task has a marker and at least one patient', () => {
    const tasks = readdirSync(join(REPO, 'tasks'), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
    for (const t of tasks) {
      expect(TASK_MARKER[t], t).toBeDefined();
      expect(taskPatients(world, t).length, t).toBeGreaterThan(0);
    }
  });
  it('a note shows its decoded text: the T4 discharge summary names metoprolol', () => {
    const notes = chartOf(world, 'Patient/pt-0005').rows.filter((r) => r.type === 'DocumentReference');
    expect(notes.some((r) => r.body.toLowerCase().includes('metoprolol'))).toBe(true);
  });
  it('lists procedures, inbox tasks with their notes, and appointments', () => {
    expect(chartOf(world, 'Patient/pt-0008').rows.find((r) => r.id === 'task-t2-inbox-4')?.detail).toMatch(/critical value/);
    expect(chartOf(world, 'Patient/pt-0015').rows.some((r) => r.type === 'Appointment' && r.id === 'appt-t5-1026')).toBe(true);
  });
  it('lists current items first in a section, and shows component values', () => {
    const meds = chartOf(world, 'Patient/pt-0002').rows.filter((r) => r.type === 'MedicationRequest');
    const firstPast = meds.findIndex((r) => !r.current);
    expect(firstPast === -1 || meds.slice(firstPast).every((r) => !r.current)).toBe(true);
    const bp = world.find((r) => r.resourceType === 'Observation' && Array.isArray(r.component) && patientOf(r) !== null);
    if (bp) expect(chartOf(world, patientOf(bp)!).rows.find((r) => r.id === bp.id)?.detail).not.toBe('');
  });
});
