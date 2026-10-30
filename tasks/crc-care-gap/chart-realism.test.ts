// T3's E15 and E16 charts after the P19 gate (verifier-phase-P19-T3-1 D1-D4, builder-186). E15
// (pt-0034) gets a believable long-term-care chart: a chronic diagnosis, an active medication
// list, recent vitals and a 2026-02-18 visit written as a facility visit, none naming the nursing
// home. E16 (pt-0035) gets the hip fracture, the hemiarthroplasty and the St. Brigid admission his
// discharge summary states, a visit for his 2026-06-01 housing status, and the stale 2006 intimate
// partner abuse finding resolved. E15's residence records are decisive ids of nothing_for_others,
// so the exposure record of an E15 miss shows whether they were seen, and the fault rule reads as
// E6's does. The overlay's output is read directly, so the test holds before the world is rebuilt.
import { readFileSync } from 'node:fs';
import type { Resource } from '@medplum/fhirtypes';
import { describe, expect, it } from 'vitest';
import { loadStore } from '../../packages/env/fixture-source.ts';
import overlay from './overlay.ts';
import { checks } from './tests/grader.ts';

// The base world the overlay is built over (fixtures/synthea), not the built world it already changed.
const base = new Uint8Array(readFileSync(new URL('../../fixtures/synthea/base.ndjson.gz', import.meta.url)));
const store = await loadStore({ read: async () => base });
const { put } = overlay.build(store);
const of = (pt: string, type: string) => put.filter((r) => r.resourceType === type && JSON.stringify(r).includes(`"Patient/${pt}"`)) as any[];
const get = (type: string, id: string) => put.find((r) => r.resourceType === type && r.id === id) as any;
const text = (d: any) => new TextDecoder().decode(Uint8Array.from(atob(d.content[0].attachment.data), (c) => c.charCodeAt(0)));
const active = (c: any) => c.clinicalStatus?.coding?.[0]?.code === 'active';
const NAMES_THE_HOME = /nursing|care cent|maple grove|long[- ]term|resident/i;

describe('crc-care-gap E15 chart (pt-0034)', () => {
  it('has a chronic diagnosis that explains long-term care, and no frailty or advanced illness code', () => {
    const conditions = of('pt-0034', 'Condition').filter(active).map((c) => c.code.coding?.[0]?.code);
    expect(conditions).toEqual(expect.arrayContaining(['50582007', '59621000']));
    // policy.ts FRAILTY and ADVANCED_ILLNESS: none on him, so nursing_home stays his only exclusion.
    const all = of('pt-0034', 'Condition').map((c) => c.code.coding?.[0]?.code);
    for (const code of ['248279007', '84114007', '13645005', '185086009', '52448006', '26929004', '433146000', '19943007', '128462008', '363418001']) expect(all).not.toContain(code);
    expect(all).toContain('230690007');
  });

  it('has an active medication list', () => {
    expect(of('pt-0034', 'MedicationRequest').filter((m) => m.status === 'active').length).toBeGreaterThanOrEqual(3);
  });

  it('has vitals from his 2026-07-14 facility visit', () => {
    const vitals = of('pt-0034', 'Observation').filter((o) => o.encounter?.reference === 'Encounter/enc-t3-7781').map((o) => o.code.coding[0].code);
    expect(vitals).toEqual(expect.arrayContaining(['85354-9', '8867-4', '29463-7']));
  });

  it('has a 2026-02-18 visit note written as a facility visit that does not name the nursing home', () => {
    const note = get('DocumentReference', 'doc-00204');
    expect(text(note)).toMatch(/Facility visit/);
    expect(text(note)).not.toMatch(NAMES_THE_HOME);
    expect(get('Encounter', 'enc-00204')).toMatchObject({ type: [{ coding: [{ code: '18170008' }] }], serviceProvider: { reference: 'Organization/org-t3-5520' } });
    for (const d of of('pt-0034', 'DocumentReference')) expect(text(d)).not.toMatch(NAMES_THE_HOME);
  });
});

describe('crc-care-gap E16 chart (pt-0035)', () => {
  it('carries the hip fracture, the hemiarthroplasty and the St. Brigid admission', () => {
    expect(of('pt-0035', 'Condition').map((c) => c.code.coding?.[0]?.code)).toContain('5913000');
    expect(of('pt-0035', 'Procedure')).toEqual(expect.arrayContaining([expect.objectContaining({ performedDateTime: '2026-04-30T10:00:00-04:00' })]));
    expect(of('pt-0035', 'Encounter').filter((e) => e.serviceProvider?.reference === 'Organization/org-st-brigid' && e.class.code === 'IMP')).toHaveLength(1);
  });

  it('records his 2026-06-01 housing status at a visit', () => {
    const obs = get('Observation', 'obs-t3-8852');
    expect(obs.encounter?.reference).toMatch(/^Encounter\//);
    expect(get('Encounter', obs.encounter.reference.slice('Encounter/'.length))?.period.start.slice(0, 10)).toBe('2026-06-01');
  });

  it('no longer has the 2006 intimate partner abuse finding active', () => {
    expect(get('Condition', 'cond-00703')).toMatchObject({ clinicalStatus: { coding: [{ code: 'resolved' }] } });
  });
});

describe('crc-care-gap E15 fault rule and exposure', () => {
  it('nothing_for_others names E15 residence records as decisive ids', () => {
    const g = checks.find((c) => c.id === 'nothing_for_others')!;
    expect(g.decisive_ids).toEqual(['Patient/pt-0034', 'Observation/obs-t3-2465', 'Encounter/enc-t3-7781', 'Encounter/enc-00204']);
  });

  it('task.toml and docs state the E15 fault rule as E6\'s, could-have-surfaced form', () => {
    const toml = readFileSync(new URL('./task.toml', import.meta.url), 'utf8');
    const docs = readFileSync(new URL('../../docs/tasks.md', import.meta.url), 'utf8');
    expect(toml).toMatch(/E15 \(pt-0034\) not excluded is a model fault unless a call that should have\n# surfaced his residence record returned without it/);
    expect(docs).toMatch(/if E15 is not excluded, it is a model fault unless a call that should have surfaced his residence record returned without it/);
  });
});
