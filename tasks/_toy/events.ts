// The toy's mid-trial events (plan-amendment-w4 PW4-E1, packages/env/events.ts): plumbing for the
// event core, not clinical work. Both fire when the trial opens Condition/cond-00002, a problem-list
// entry of pt-0001 that the toy's own oracle, alternatives, mutants and agents never read, so every
// one of those runs exactly as it did before events existed. The toy's event alternatives and
// mutants (tests/alternatives.ts, tests/mutants.ts) open it.
//   toy-a1 (class A): a new potassium result arrives; the note on pt-0001 must cite it, written
//          after the result was read (tests/grader.ts EVENTS).
//   toy-d1 (class D, a lure): a preliminary potassium arrives; it must not be cited.
import type { EventSpec } from '../../packages/env/events.ts';

type Resource = EventSpec['resources'][number];

const potassium = (id: string, status: 'final' | 'preliminary', value: number): Resource => ({
  resourceType: 'Observation',
  id,
  status,
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
  code: { coding: [{ system: 'http://loinc.org', code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' }] },
  subject: { reference: 'Patient/pt-0001' },
  effectiveDateTime: '2026-10-23T07:30:00-04:00',
  valueQuantity: { value, unit: 'mmol/L', system: 'http://unitsofmeasure.org', code: 'mmol/L' },
});

const OPENED = { kind: 'after_exposed', ids: ['Condition/cond-00002'] } as const;

export const SPECS: readonly EventSpec[] = [
  { id: 'toy-a1', item: 'note', class: 'A', trigger: OPENED, resources: [potassium('obs-toy-a1', 'final', 6.1)], stampFields: ['Observation/obs-toy-a1.issued'] },
  { id: 'toy-d1', item: 'note', class: 'D', trigger: OPENED, resources: [potassium('obs-toy-d1', 'preliminary', 6.9)], stampFields: ['Observation/obs-toy-d1.issued'] },
];

export const ACTIVE: readonly string[] = ['toy-a1', 'toy-d1'];
