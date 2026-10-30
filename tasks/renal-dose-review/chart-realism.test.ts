// T1's chart after the P19 gate (verifier-phase-P19-T1-1 D1-D3, builder-186): the two apixaban
// mutants declare their attribution, so the matrix checks the label; the St. Brigid hematology
// visit is attended by the hematologist; the pulmonary embolism resolves when its six months of
// treatment end; and the chart carries the 10 mg loading order and the visit the 5 mg order came
// from. The overlay's output is read directly, so the test holds before the world is rebuilt.
import { describe, expect, it } from 'vitest';
import type { Resource } from '@medplum/fhirtypes';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import overlay from './overlay.ts';
import { mutants } from './tests/mutants.ts';

const store = await loadStore(matrixEnv().world);
const { put } = overlay.build(store);
const get = <T extends Resource['resourceType']>(type: T, id: string) => put.find((r) => r.resourceType === type && r.id === id) as Extract<Resource, { resourceType: T }> | undefined;

describe('renal-dose-review chart', () => {
  it.each(['apixaban_raised_vte', 'apixaban_raised_over_heme_letter'])('mutant %s declares attribution reasoning', (id) => {
    expect(mutants.find((m) => m.id === id)?.attribution).toBe('reasoning');
  });

  it('the hematology visit of 2/5/2026 is attended by the St. Brigid hematologist, not the PCP', () => {
    expect(get('Encounter', 'enc-t1-0205')?.participant).toEqual([{ individual: { reference: 'Practitioner/pr-t1-heme' } }]);
  });

  it('the pulmonary embolism resolves when treatment ends (2/11/2026), and the history entry starts then', () => {
    expect(get('Condition', 'cond-t1-pe')?.abatementDateTime).toBe('2026-02-11T10:00:00-05:00');
    expect(get('Condition', 'cond-t1-pe-hx')?.onsetDateTime).toBe('2026-02-11T10:00:00-05:00');
  });

  it('carries the 10 mg loading order from the admission, and the 5 mg order names the hematology visit it came from', () => {
    const loading = get('MedicationRequest', 'mr-t1-apixaban-10');
    expect(loading).toMatchObject({ status: 'completed', authoredOn: '2025-08-04T18:00:00-04:00', encounter: { reference: 'Encounter/enc-t1-0804' } });
    expect(loading?.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value).toBe(10);
    const five = get('MedicationRequest', 'mr-t1-apixaban-5');
    expect(five?.encounter).toEqual({ reference: 'Encounter/enc-t1-0811' });
    expect(get('Encounter', 'enc-t1-0811')).toMatchObject({ period: { start: '2025-08-11T09:30:00-04:00' }, participant: [{ individual: { reference: 'Practitioner/pr-t1-heme' } }] });
  });

  it("the letter counts the six months from the loading start, 8/4/2025", () => {
    const letter = get('DocumentReference', 'doc-t1-heme-0205');
    const text = new TextDecoder().decode(Uint8Array.from(atob(letter?.content[0]?.attachment.data ?? ''), (c) => c.charCodeAt(0)));
    expect(text).toContain('6 months of treatment from 8/4/2025');
    expect(text).not.toContain('completes 6 months of treatment on 2/11/2026');
  });
});
