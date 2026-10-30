// The read-only Chart tab (pre-audit S12, P17j JU10): a task's patients come from the world the
// task's overlay built (its marked resources' subjects and its marked Group's members), and a
// patient's chart lists every resource of the chart types that the store holds for that patient,
// nothing else. The expected rows come from e2e/fixtures/chart-oracle.ts, a deep `reference` walk
// that does not use patientOf (verifier-phase-P17j-retro-JU10-1 D2).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHART_TYPES, chartOf, patientOf, TASK_PLANTED, taskPatients } from '../src/tasks/chart.ts';
import { chartIds, world } from '../e2e/fixtures/chart-oracle.ts';
import { id as t2 } from '../../../tasks/results-inbox/ids.ts';
import { id as t3 } from '../../../tasks/crc-care-gap/ids.ts';
import { id as t5 } from '../../../tasks/contrast-ct-prep/ids.ts';
import { id as t6 } from '../../../tasks/message-queue/ids.ts';

const REPO = join(import.meta.dirname, '../../..');

describe('taskPatients', () => {
  it('finds the one patient of a single-patient task', () => {
    expect(taskPatients(world, 'renal-dose-review')).toEqual(['Patient/pt-0002']);
    expect(taskPatients(world, 'discharge-medrec')).toEqual(['Patient/pt-0005']);
    expect(taskPatients(world, 'contrast-ct-prep')).toEqual(['Patient/pt-0015']);
  });
  it('finds every member of the panel task\'s group, and the patients of the inbox and queue tasks', () => {
    const panel = world.find((r) => r.resourceType === 'Group' && r.id === t3('grp-t3-okafor-crc')) as unknown as { member: { entity: { reference: string } }[] };
    expect(taskPatients(world, 'crc-care-gap')).toEqual(expect.arrayContaining(panel.member.map((m) => m.entity.reference)));
    expect(taskPatients(world, 'crc-care-gap').length).toBeGreaterThanOrEqual(12);
    expect(taskPatients(world, 'results-inbox').length).toBeGreaterThan(1);
    expect(taskPatients(world, 'message-queue').length).toBeGreaterThan(1);
  });
  it('is empty for a task it has no registry for', () => {
    expect(taskPatients(world, '_toy')).toEqual([]);
  });
});

describe('chartOf', () => {
  it('lists exactly the store\'s chart resources of each task patient, by type', () => {
    const patients = [...new Set(Object.keys(TASK_PLANTED).flatMap((t) => taskPatients(world, t)))];
    expect(patients.length).toBeGreaterThanOrEqual(29);
    for (const p of patients) {
      const chart = chartOf(world, p);
      for (const type of CHART_TYPES) expect(chart.rows.filter((x) => x.type === type).map((x) => x.id).sort(), `${p} ${type}`).toEqual(chartIds(p, type));
      expect(chart.patient?.id).toBe(p.slice('Patient/'.length));
    }
  });
});

describe('verifier JU10-1 F2-F5', () => {
  it('every task has a registry and at least one patient', () => {
    const tasks = readdirSync(join(REPO, 'tasks'), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
    for (const t of tasks) {
      expect(TASK_PLANTED[t], t).toBeDefined();
      expect(taskPatients(world, t).length, t).toBeGreaterThan(0);
    }
  });
  it('a note shows its decoded text: the T4 discharge summary names metoprolol', () => {
    const notes = chartOf(world, 'Patient/pt-0005').rows.filter((r) => r.type === 'DocumentReference');
    expect(notes.some((r) => r.body.toLowerCase().includes('metoprolol'))).toBe(true);
  });
  it('lists procedures, inbox tasks with their notes, and appointments', () => {
    expect(chartOf(world, 'Patient/pt-0008').rows.find((r) => r.id === t2('task-t2-inbox-4'))?.detail).toMatch(/critical value/);
    expect(chartOf(world, 'Patient/pt-0015').rows.some((r) => r.type === 'Appointment' && r.id === t5('appt-t5-1026'))).toBe(true);
  });
  it('lists current items first in a section, and shows component values', () => {
    const meds = chartOf(world, 'Patient/pt-0002').rows.filter((r) => r.type === 'MedicationRequest');
    const firstPast = meds.findIndex((r) => !r.current);
    expect(firstPast === -1 || meds.slice(firstPast).every((r) => !r.current)).toBe(true);
    const bp = world.find((r) => r.resourceType === 'Observation' && Array.isArray(r.component) && patientOf(r) !== null);
    if (bp) expect(chartOf(world, patientOf(bp)!).rows.find((r) => r.id === bp.id)?.detail).not.toBe('');
  });
  // The resources T6, T3 and T2 turn on (verifier-phase-P17j-retro-JU10-1 D1).
  it('lists a patient\'s messages with their text, episodes of care and orders', () => {
    const msg = chartOf(world, 'Patient/pt-0026').rows.find((r) => r.id === t6('comm-t6-m1'));
    expect(msg).toMatchObject({ type: 'Communication', text: 'Refill request', date: '2026-10-21T19:12:00-04:00' });
    expect(msg?.body).toContain('refill my lisinopril 20 mg');
    expect(chartOf(world, 'Patient/pt-0020').rows.find((r) => r.id === t3('eoc-t3-8215'))).toMatchObject({ type: 'EpisodeOfCare', text: 'Hospice care', status: 'active', date: '2026-08-20', current: true });
    expect(chartOf(world, 'Patient/pt-0024').rows.find((r) => r.id === t3('sr-t3-6648'))).toMatchObject({ type: 'ServiceRequest', status: 'active', current: true });
    expect(chartOf(world, 'Patient/pt-0024').rows.find((r) => r.id === t3('sr-t3-6648'))?.text).toMatch(/^FIT kit/);
    expect(chartOf(world, 'Patient/pt-0006').rows.some((r) => r.id === t2('sr-t2-gi-1020'))).toBe(true);
  });
});
