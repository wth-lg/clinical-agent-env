// The P19 gate fixes that read files (builder-186; verifier-phase-P19-T3-1 D1-D4 and
// verifier-phase-P19-T6-1 D1-D2). Task tests may not read files (eslint isomorphic-imports), so
// the overlay checks build each overlay over the base world (fixtures/synthea, not the built world
// it already changed) and the wording checks read task.toml and docs/tasks.md here.
//   T3 E15 (pt-0034): a long-term-care chart (a chronic diagnosis, an active medication list,
//      recent vitals, a 2026-02-18 visit written as a facility visit), none naming the nursing
//      home; his residence records are decisive ids of nothing_for_others; the fault rule reads
//      as E6's.
//   T3 E16 (pt-0035): the hip fracture, hemiarthroplasty and St. Brigid admission his discharge
//      summary states, a visit for his 2026-06-04 housing status, the 2006 IPV finding resolved.
//   T6: each scanned outside lab report is authored and kept by its laboratory (W1 T6 probe); the
//      threshold is "5.5 mmol/L or higher" everywhere, with KDIGO's ">5.5" named as its source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadStore } from '../../packages/env/fixture-source.ts';
import type { Resource } from '../../packages/env/store.ts';
import t3 from '../../tasks/crc-care-gap/overlay.ts';
import { checks as t3Checks } from '../../tasks/crc-care-gap/tests/grader.ts';
import t6 from '../../tasks/message-queue/overlay.ts';
import { expected as t3Expected } from '../../tasks/crc-care-gap/expected.ts';

const repo = (rel: string) => new URL(`../../${rel}`, import.meta.url);
const base = new Uint8Array(readFileSync(repo('fixtures/synthea/base.ndjson.gz')));
const store = await loadStore({ read: async () => base });
const t3Put = t3.build(store).put ?? [];
const t6Put = t6.build(store).put ?? [];

// The fields these checks read, loosely typed: the overlays write many resource types.
type R = Resource & {
  code?: { coding?: Array<{ code?: string }> };
  clinicalStatus?: { coding?: Array<{ code?: string }> };
  status?: string;
  encounter?: { reference?: string };
  performedDateTime?: string;
  serviceProvider?: { reference?: string };
  class?: { code?: string };
  period?: { start?: string };
  content?: Array<{ attachment: { data?: string } }>;
};
const of = (pt: string, type: string) => t3Put.filter((r) => r.resourceType === type && JSON.stringify(r).includes(`"Patient/${pt}"`)) as R[];
const get = (put: readonly Resource[], type: string, id: string) => put.find((r) => r.resourceType === type && r.id === id) as R | undefined;
const text = (d: R | undefined) => new TextDecoder().decode(Uint8Array.from(atob(d?.content?.[0]?.attachment.data ?? ''), (c) => c.charCodeAt(0)));
const codeOf = (c: R) => c.code?.coding?.[0]?.code;
const active = (c: R) => c.clinicalStatus?.coding?.[0]?.code === 'active';
const NAMES_THE_HOME = /nursing|care cent|maple grove|facility|long[- ]term|resident/i;

describe('crc-care-gap E15 chart (pt-0034)', () => {
  // builder-189 removed his hemiplegia (50582007), a stray cue (researcher-17 section 1.2); his
  // December 2025 stroke and his hypertension explain long-term care.
  it('has a chronic diagnosis that explains long-term care, and no frailty, advanced illness or hemiplegia code', () => {
    expect(of('pt-0034', 'Condition').filter(active).map(codeOf)).toEqual(expect.arrayContaining(['230690007', '59621000']));
    expect(of('pt-0034', 'Condition').map(codeOf)).not.toContain('50582007');
    // policy.ts FRAILTY and ADVANCED_ILLNESS: none on him, so nursing_home stays his only exclusion.
    const all = of('pt-0034', 'Condition').map(codeOf);
    for (const code of ['248279007', '84114007', '13645005', '185086009', '52448006', '26929004', '433146000', '19943007', '128462008', '363418001']) expect(all).not.toContain(code);
    expect(all).toContain('230690007');
  });

  it('has an active medication list', () => {
    expect(of('pt-0034', 'MedicationRequest').filter((m) => m.status === 'active').length).toBeGreaterThanOrEqual(3);
  });

  it('has vitals from his 2026-07-14 facility visit', () => {
    const vitals = of('pt-0034', 'Observation').filter((o) => o.encounter?.reference === 'Encounter/enc-t3-7781').map(codeOf);
    expect(vitals).toEqual(expect.arrayContaining(['85354-9', '8867-4', '29463-7']));
  });

  it('has a 2026-02-18 visit note written as a visit on rounds that does not name the nursing home', () => {
    const note = get(t3Put, 'DocumentReference', 'doc-00204');
    expect(text(note)).toMatch(/^\n2026-02-18\n\n# Chief Complaint\n[^]*Seen on rounds\./);
    expect(text(note)).not.toMatch(NAMES_THE_HOME);
    expect(get(t3Put, 'Encounter', 'enc-00204')).toMatchObject({ type: [{ coding: [{ code: '18170008' }] }], serviceProvider: { reference: 'Organization/org-t3-5520' } });
    for (const d of of('pt-0034', 'DocumentReference')) expect(text(d)).not.toMatch(NAMES_THE_HOME);
  });
});

describe('crc-care-gap E16 chart (pt-0035)', () => {
  it('carries the hip fracture, the hemiarthroplasty and the St. Brigid admission', () => {
    expect(of('pt-0035', 'Condition').map(codeOf)).toContain('5913000');
    expect(of('pt-0035', 'Procedure').map((p) => p.performedDateTime)).toContain('2026-04-30T10:00:00-04:00');
    expect(of('pt-0035', 'Encounter').filter((e) => e.serviceProvider?.reference === 'Organization/org-st-brigid' && e.class?.code === 'IMP')).toHaveLength(1);
  });

  it('records his 2026-06-04 housing status at a visit', () => {
    const ref = get(t3Put, 'Observation', 'obs-t3-8852')?.encounter?.reference ?? '';
    expect(ref).toMatch(/^Encounter\//);
    expect(get(t3Put, 'Encounter', ref.slice('Encounter/'.length))?.period?.start?.slice(0, 10)).toBe('2026-06-04');
  });

  it('no longer has the 2006 intimate partner abuse finding active', () => {
    expect(get(t3Put, 'Condition', 'cond-00703')).toMatchObject({ clinicalStatus: { coding: [{ code: 'resolved' }] } });
  });
});

describe('crc-care-gap no-contact fault rule and exposure', () => {
  // Since the W1 probe (builder-213; ruling R1) each member who needs no contact names only the
  // records that decide it, and the fault rule says such a member is read by them or fails as
  // retrieval (R32). E15 (pt-0034), whose residence was the P19 case, is off the panel since the
  // PW4-E3 list cut (builder-283); his chart above stays as P19 built it, and docs/tasks.md keeps
  // his rule until the W4 train rewrites the T3 section. The rule now covers the four members.
  it('nothing_for_others names every no-contact member\'s decisive records as decisive ids', () => {
    const noContact = t3Expected.items.filter((x) => x.order === false);
    expect(noContact.length).toBeGreaterThan(0);
    expect(t3Checks.find((c) => c.id === 'nothing_for_others')!.decisive_ids).toEqual(expect.arrayContaining(noContact.flatMap((x) => x.decisive)));
  });

  it('task.toml states the no-contact fault rule; docs keep E15\'s in the could-have-surfaced form', () => {
    expect(readFileSync(repo('tasks/crc-care-gap/task.toml'), 'utf8')).toMatch(/A member who needs no order or message is read by\n# their decisive records, or fails no_contact_reviewed as retrieval \(R32\)/);
    expect(readFileSync(repo('docs/tasks.md'), 'utf8')).toMatch(/if E15 is not excluded, it is a model fault unless a call that should have surfaced his residence record returned without it/);
  });
});

describe('message-queue outside reports and threshold wording', () => {
  // W1 T6 probe: each scanned outside report is authored and kept by the laboratory that ran it.
  it('each scanned outside laboratory report is authored and kept by its laboratory', () => {
    for (const [doc, lab] of [['doc-t6-odum-0827', 'org-t6-brigid-lab'], ['doc-t6-park-1002', 'org-t6-brigid-lab'], ['doc-t6-brooks-0412', 'org-t6-harbor'], ['doc-t6-price-0819', 'org-t6-harbor']]) {
      expect(get(t6Put, 'DocumentReference', doc!)).toMatchObject({ author: [{ reference: `Organization/${lab}` }], custodian: { reference: `Organization/${lab}` } });
    }
    expect(get(t6Put, 'Organization', 'org-t6-brigid-lab')).toMatchObject({ name: 'St. Brigid Regional Laboratory', partOf: { reference: 'Organization/org-st-brigid' } });
  });

  it('words the threshold as 5.5 mmol/L or higher, citing KDIGO >5.5 as its source', () => {
    const toml = readFileSync(repo('tasks/message-queue/task.toml'), 'utf8');
    expect(toml).toMatch(/5\.5 mmol\/L or higher/);
    expect(toml).toMatch(/>5\.5 mmol\/l/);
    expect(toml).not.toMatch(/is the hyperkalemia action threshold of the KDIGO/);
    expect(readFileSync(repo('docs/tasks.md'), 'utf8').split('\n').filter((l) => /above 5\.5/.test(l))).toEqual([]);
  });
});
