// packages/env/renumber.ts numbers the world by the rule scripts/fixtures-synthea.ts numbered the
// base cohort with. Applied to the base cohort alone it gives back the cohort's own ids, apart from
// three pairs of one patient's same-day medication orders: Synthea ordered those by an empty code
// (its orders named their drug through a Medication resource, which the prune folds into
// medicationCodeableConcept), and the world orders them by the drug's code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gunzip } from '../../../scripts/fixtures-lib.ts';
import { worldIds } from '../renumber.ts';
import type { Resource } from '../store.ts';

const base = gunzip(readFileSync(new URL('../../../fixtures/synthea/base.ndjson.gz', import.meta.url)))
  .toString('utf8')
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l) as Resource);

describe('renumber', () => {
  it("gives the base cohort back its own ids, but for three same-day order pairs", () => {
    const ids = worldIds(base);
    const moved = [...ids].filter(([k, v]) => k.slice(k.indexOf('/') + 1) !== v).map(([k, v]) => `${k} -> ${v}`).sort();
    expect(ids.size).toBe(base.filter((r) => r.resourceType !== 'Patient').length);
    expect(moved).toEqual([
      'MedicationRequest/mr-00081 -> mr-00082',
      'MedicationRequest/mr-00082 -> mr-00081',
      'MedicationRequest/mr-00131 -> mr-00132',
      'MedicationRequest/mr-00132 -> mr-00131',
      'MedicationRequest/mr-00321 -> mr-00322',
      'MedicationRequest/mr-00322 -> mr-00321',
    ]);
  });

  it('numbers a registry key among the generated ids of its patient by date, and refuses a mixed prefix', () => {
    const obs = (id: string, patient: string, date: string) => ({ resourceType: 'Observation', id, status: 'final', code: { text: 'x' }, subject: { reference: `Patient/${patient}` }, effectiveDateTime: date }) as Resource;
    const ids = worldIds([obs('obs-00001', 'pt-0001', '2026-01-01'), obs('obs-00002', 'pt-0002', '2026-01-01'), obs('obs-t1-k', 'pt-0001', '2026-02-01'), obs('obs-00003', 'pt-0001', '2026-03-01')]);
    expect(Object.fromEntries(ids)).toEqual({ 'Observation/obs-00001': 'obs-00001', 'Observation/obs-t1-k': 'obs-00002', 'Observation/obs-00003': 'obs-00003', 'Observation/obs-00002': 'obs-00004' });
    expect(() => worldIds([obs('obs-00001', 'pt-0001', '2026-01-01'), obs('lab-t1-k', 'pt-0001', '2026-01-02')])).toThrow(/prefix/);
  });
});
