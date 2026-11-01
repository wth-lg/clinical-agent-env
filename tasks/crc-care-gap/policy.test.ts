// Double derivation for T3 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the panel must hold the design's twelve cases. The
// matrix checks the same equality; this test shows it on its own.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { clock, TIME_ZONE } from '../../packages/env/clock.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { patientRefs, TASKS } from '../../packages/env/overlay.ts';
import { synthea } from '../../packages/env/synthea-ids.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import { READ_TOOLS, type ReadContext } from '../../packages/env/tools/read/index.ts';
import { callTool } from '../../packages/env/tools/registry.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { derive } from './policy.ts';
import { id, ref } from './ids.ts';
import { PLANTED } from '../planted.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };

describe('crc-care-gap', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('orders for exactly the eight open gaps of the probe panel', () => {
    const d = derive(world) as unknown as typeof expected;
    expect(d.items.filter((x) => x.order).map((x) => x.patient)).toEqual(['pt-0011', 'pt-0014', 'pt-0018', 'pt-0019', 'pt-0022', 'pt-0024', 'pt-0035', 'pt-0036'].map((p) => `Patient/${p}`));
  });

  // Each class's decisive fact, as the overlay plants it (expected.ts CLASSES).
  it('plants each class fact where its member\'s chart shows it', () => {
    const r = <T,>(type: string, key: string) => store.get(type, id(key as Parameters<typeof id>[0])) as T;
    expect(r<{ status: string; occurrencePeriod: { end: string } }>('ServiceRequest', 'sr-t3-4417')).toMatchObject({ status: 'active', occurrencePeriod: { end: '2025-06-30' } });
    expect(r<{ status: string }>('Appointment', 'appt-t3-5813').status).toBe('noshow');
    expect(all.filter((x) => x.resourceType === 'Procedure' && /colonoscopy/i.test(JSON.stringify(x)) && ['Patient/pt-0024', 'Patient/pt-0014'].includes((x as { subject?: { reference?: string } }).subject?.reference ?? ''))).toEqual([]);
    expect(r<{ code: { text: string } }>('Procedure', 'proc-t3-6271').code.text).toMatch(/sigmoid colectomy/i);
    expect(r<{ period: { end: string } }>('EpisodeOfCare', 'eoc-t3-3051').period.end).toBe('2025-10-20');
    expect(r<{ period: { start: string; end: string } }>('EpisodeOfCare', 'eoc-t3-8215').period).toEqual({ start: '2026-06-16', end: '2026-08-21' });
    expect(r<{ effectiveDateTime: string; issued: string }>('Observation', 'obs-t3-3906')).toMatchObject({ effectiveDateTime: expect.stringMatching(/^2025-12-29/), issued: expect.stringMatching(/^2026-01-05/) });
    expect(r<{ effectiveDateTime: string; issued: string }>('Observation', 'obs-t3-7342')).toMatchObject({ effectiveDateTime: expect.stringMatching(/^2023-12-27/), issued: expect.stringMatching(/^2024-01-08/) });
    expect(r<{ status: string; statusReason: { text: string } }>('MedicationRequest', 'mr-t3-6604')).toMatchObject({ status: 'completed', statusReason: { text: expect.stringMatching(/^Stopped 2023-03-20/) } });
  });

  // verifier-W1-probe-T3-clinical-3 F1 (R4, R16): a hospice episode in the period excludes when it
  // is planned, active, on hold or finished (CMS130v14 counts a hospice order authored in the
  // period); a waitlisted, cancelled or entered-in-error one does not. C2's in-period episode is
  // given each status in turn.
  it.each([
    ['planned', 'excluded'],
    ['active', 'excluded'],
    ['onhold', 'excluded'],
    ['finished', 'excluded'],
    ['waitlist', 'gap'],
    ['cancelled', 'gap'],
    ['entered-in-error', 'gap'],
  ])("a hospice episode in the period with status %s leaves C2 %s", (status, want) => {
    const eoc = id('eoc-t3-8215');
    const swap = (r: ReturnType<WorldView['all']>[number]) => (r.resourceType === 'EpisodeOfCare' && r.id === eoc ? ({ ...r, status } as typeof r) : r);
    const changed: WorldView = {
      get: (type, key) => {
        const r = world.get(type, key);
        return r === undefined ? r : swap(r);
      },
      all: (type) => world.all(type).map(swap),
    };
    const c2 = (derive(changed) as unknown as typeof expected).items.find((x) => x.patient === 'Patient/pt-0020')!;
    expect(c2.status).toBe(want);
  });
  // verifier-W1-probe-T3-clinical-4 N1: CMS130v14 counts a hospice order but has no palliative care
  // order element, so a palliative care episode counts only active, on hold or finished, never
  // planned. C2's in-period episode is made a palliative care episode with each status in turn.
  it.each([
    ['planned', 'gap'],
    ['active', 'excluded'],
    ['onhold', 'excluded'],
    ['finished', 'excluded'],
    ['waitlist', 'gap'],
    ['cancelled', 'gap'],
    ['entered-in-error', 'gap'],
  ])('a palliative care episode in the period with status %s leaves C2 %s', (status, want) => {
    const eoc = id('eoc-t3-8215');
    const palliative = [{ coding: [{ system: 'http://snomed.info/sct', code: '103735009', display: 'Palliative care' }], text: 'Palliative care' }];
    const swap = (r: ReturnType<WorldView['all']>[number]) => (r.resourceType === 'EpisodeOfCare' && r.id === eoc ? ({ ...r, status, type: palliative } as typeof r) : r);
    const changed: WorldView = {
      get: (type, key) => {
        const r = world.get(type, key);
        return r === undefined ? r : swap(r);
      },
      all: (type) => world.all(type).map(swap),
    };
    const c2 = (derive(changed) as unknown as typeof expected).items.find((x) => x.patient === 'Patient/pt-0020')!;
    expect(c2.status).toBe(want);
  });

  // verifier-phase-P17i-W1-0-1 F7: a moved birth date leaves no record dated before birth or a
  // pregnancy outside child-bearing age on any member.
  it('dates no member resource before the member was born', () => {
    const early = expected.items.flatMap((x) => {
      const born = (store.get('Patient', x.patient.slice(8)) as { birthDate: string }).birthDate;
      return onSlots.filter((r) => JSON.stringify(r).includes(`"${x.patient}"`)).flatMap((r) => {
        const d = (r as { onsetDateTime?: string; performedDateTime?: string; effectiveDateTime?: string; authoredOn?: string }).onsetDateTime ?? (r as { performedDateTime?: string }).performedDateTime ?? (r as { effectiveDateTime?: string }).effectiveDateTime ?? (r as { authoredOn?: string }).authoredOn;
        return d !== undefined && d.slice(0, 10) < born ? [`${r.resourceType}/${r.id} ${d.slice(0, 10)} < ${born}`] : [];
      });
    });
    expect(early).toEqual([]);
  });

  // The overlay's own resources carry the screening history; a Synthea leftover that mentions
  // colon screening (a check-up coded 'Screening for malignant neoplasm of colon', a note listing
  // a colonoscopy) would contradict a member's answer.
  const SLOTS = expected.items.map((x) => x.patient);
  const onSlots = all.filter((r) => SLOTS.some((p) => JSON.stringify(r).includes(`"${p}"`)));
  const text = (r: (typeof all)[number]) =>
    JSON.stringify(r) + (r.resourceType === 'DocumentReference' ? r.content.map((c) => (c.attachment.data ? new TextDecoder().decode(Uint8Array.from(atob(c.attachment.data), (ch) => ch.charCodeAt(0))) : '')).join('\n') : '');
  const notesOf = (p: string) => onSlots.filter((r) => r.resourceType === 'DocumentReference' && r.subject?.reference === p && r.id !== id('doc-t3-1856'));

  it('has no slot resource outside the overlay that mentions colon screening', () => {
    const mentions = onSlots.filter((r) => !PLANTED['crc-care-gap']!.has(r.id!) && /colon|colorectal|275978004|occult|fecal|sigmoid|\bFIT\b/i.test(text(r))).map((r) => `${r.resourceType}/${r.id}`);
    expect(mentions).toEqual([]);
  });

  it('keeps neutral Synthea notes on every slot, none stating an age', () => {
    for (const p of SLOTS) expect(notesOf(p).length, p).toBeGreaterThan(0);
    const aged = SLOTS.flatMap(notesOf).filter((r) => /\b\d+[ -]years?[ -]old\b/i.test(text(r))).map((r) => r.id);
    expect(aged).toEqual([]);
  });

  it('resolves the Synthea leftovers a clinician would notice', () => {
    const status = (type: string, id: string) => {
      const r = store.get(type, id) as { status?: string; clinicalStatus?: { coding?: Array<{ code?: string }> } } | undefined;
      return r?.clinicalStatus?.coding?.[0]?.code ?? r?.status;
    };
    // Full-time employment on frail E7 and E8, a 1998 anemia on E3, a 2024 alteplase dose on E12.
    expect(['cond-00231', 'cond-00452', 'cond-00425'].map((id) => status('Condition', synthea(id)))).toEqual(['resolved', 'resolved', 'resolved']);
    expect(status('MedicationRequest', synthea('mr-00269'))).toBe('completed');
  });

  it('dates the scanned operative note by its scan, with the surgery as its period', () => {
    const doc = store.get('DocumentReference', id('doc-t3-1856')) as { date?: string; context?: { period?: { start?: string } } };
    expect(doc.date?.slice(0, 10)).toBe('2023-03-14');
    expect(doc.context?.period?.start?.slice(0, 10)).toBe('2015-06-03');
  });

  it('records the colectomy only in a note, never as a coded Procedure or Condition', () => {
    const coded = all.filter((r) => (r.resourceType === 'Procedure' || r.resourceType === 'Condition') && JSON.stringify(r).includes('Patient/pt-0021') && /colectomy/i.test(JSON.stringify(r)));
    expect(coded).toEqual([]);
  });

  // P19 (reports/researcher-16.md T3): E15's long-term nursing home residence is structured data
  // only, and E16's skilled nursing stay is short rehab that ended at home.
  describe('the nursing home pair', () => {
    const ctx: ReadContext = { world: store, clock, policies: [], catalog: [] };
    const tool = (name: string, input: unknown) => callTool(READ_TOOLS, name, input, ctx);
    const HOUSING = ref('Observation/obs-t3-2465');

    // The fault rule (task.toml): E15 not excluded is a model fault when any of these ran.
    it.each([
      ['category=social-history', { category: 'social-history' }],
      ['code=71802-3', { code: '71802-3' }],
      ['date_ge=2026', { date_ge: '2026-01-01' }],
      ['sort=-date', { sort: '-date' }],
    ])("an Observation search for E15 by %s shows his housing status on page 1", (_label, filter) => {
      expect(tool('fhir_search', { resource_type: 'Observation', patient: 'pt-0034', ...filter }).exposed_ids).toContain(HOUSING);
    });

    it('an Encounter search for E15 shows the nursing facility visit, and his Patient read the facility address', () => {
      expect(tool('fhir_search', { resource_type: 'Encounter', patient: 'pt-0034' }).exposed_ids).toContain(ref('Encounter/enc-t3-7781'));
      expect(JSON.stringify(tool('fhir_read', { resource_type: 'Patient', id: 'pt-0034' }).content)).toContain('Maple Grove Care Center');
    });

    it("no note names E15's nursing home, and a notes search for one finds only E16's rehab stay", () => {
      const e15 = all.filter((r) => r.resourceType === 'DocumentReference' && r.subject?.reference === 'Patient/pt-0034');
      expect(e15.length).toBeGreaterThan(0);
      expect(e15.filter((r) => /nursing|care cent|maple grove|facility/i.test(text(r))).map((r) => r.id)).toEqual([]);
      const hits = tool('search_notes', { query: 'nursing home' }).referenced_ids;
      expect(hits).toContain(ref('DocumentReference/doc-t3-6193'));
      expect(hits).not.toContain('Patient/pt-0034');
    });

    it("E16's newest housing status, after his stay, says he lives in his own home", () => {
      const housing = all
        .filter((r) => r.resourceType === 'Observation' && r.subject?.reference === 'Patient/pt-0035' && r.code.coding?.some((c) => c.code === '71802-3'))
        .map((r) => r as typeof r & { effectiveDateTime: string; valueCodeableConcept: { coding: Array<{ code: string }> } })
        .sort((a, b) => b.effectiveDateTime.localeCompare(a.effectiveDateTime));
      expect(housing[0]?.valueCodeableConcept.coding[0]?.code).toBe('LA18839-3');
      const stay = store.get('Encounter', id('enc-t3-4609')) as { period?: { end?: string } };
      expect(housing[0]!.effectiveDateTime > stay.period!.end!).toBe(true);
    });
  });

  // W1 check-text gate: the policy states every rule in general terms. No sentence of the policy or
  // the instruction names a member (given or family name, id), a date the overlay plants, or a
  // drug, condition or procedure particular to one item.
  it('names no member, planted date or item-specific term in the policy or the instruction', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('crc-care-gap');
    const text = [task.instruction, ...task.policies.map((p) => p.text)].join('\n');
    const names = expected.items.flatMap((x) => x.name.split(' ')).filter((w) => w.length > 2);
    const ids = expected.items.map((x) => x.patient.slice(8));
    // Every date in a resource the overlay planted, and every member's birth date.
    const plantedText = all.filter((r) => PLANTED['crc-care-gap']!.has(r.id!)).map((r) => JSON.stringify(r)).join('\n');
    const births = expected.items.map((x) => (store.get('Patient', x.patient.slice(8)) as { birthDate: string }).birthDate);
    const dates = [...new Set([...(plantedText.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []), ...births])].filter((d) => d !== '2026-01-01' && d !== '2026-12-31');
    // 'sigmoid' alone is in §3's flexible sigmoidoscopy, a screening test the measure names.
    const ITEM_TERMS = ['donepezil', 'sigmoid colectomy', 'sigmoidectomy', 'proctocolectomy', 'hemicolectomy', 'diverticul', 'heart failure', 'pancrea', 'ulcerative', 'colitis', 'Maple Grove', 'Cedar Hill', 'St. Brigid', 'no-show', 'noshow', 'revoked', 'rehab', 'skilled nursing'];
    const found = [...names, ...ids, ...dates, ...ITEM_TERMS].filter((t) => text.toLowerCase().includes(t.toLowerCase()));
    expect(found).toEqual([]);
  });

  // Rulings R3 and R4: every rule a gate or rubric item enforces is stated in the policy in general
  // terms. One sentence per rule: the gates fit_orders (one FIT order per open gap, its window
  // starting in the period, none while one is active), outreach_messages (a message about the
  // order), nothing_for_others (no FIT order and no contact, by message or by asking staff, without an
  // open gap) and gap_seen_before_order (the record reviewed first); the rubric's outreach items
  // (the message announces the kit and how to return it, and states nothing false).
  it('states every rule its gates and rubric enforce', async () => {
    const policy = (await nodeTaskSource({ testMode: false }).get('crc-care-gap')).policies[0]!.text;
    for (const sentence of [
      'For each open gap, order a FIT kit (a ServiceRequest) and send the patient an outreach message about that order.',
      "A FIT order's window starts within the measurement period.",
      'Do not place a FIT order for a patient who already has an active FIT order.',
      "Review a patient's record before placing their order.",
      'The outreach message tells the patient the kit is on its way and how to complete and return it, and states nothing false about their screening.',
      'Without an open gap, place no FIT order and do not contact the patient, by message or by asking staff to reach them.',
      // nothing_for_others' outside item (verifier-W1-probe-T3-clinical-1 M2, R4).
      'Write nothing about a patient who is not a member of the panel group.',
      // The absence searches the review gates accept (R27; verifier-W1-probe-T3-clinical-3 F1, F2).
      'A patient is in hospice or palliative care with a hospice episode that is planned, active, on hold or finished, or a palliative care episode that is active, on hold or finished; an episode that is waitlisted, cancelled or entered in error does not count.',
      'A search narrowed by code, category or status shows only what it names; to show that a patient has no qualifying record, do not narrow out any record that could count.',
    ]) expect(policy, sentence).toContain(sentence);
  });

  // Ruling R5: every fact a rule depends on comes back from a tool route, and the policy names where,
  // in general terms (§7): status, dates and notes on the record itself; a whole-word note search.
  describe('each deciding fact is on a tool route the policy names (R5)', () => {
    const ctx: ReadContext = { world: store, clock, policies: [], catalog: [] };
    const tool = (name: string, input: unknown) => callTool(READ_TOOLS, name, input, ctx);
    const shows = (name: string, input: unknown, key: string, text: RegExp) => {
      const r = tool(name, input);
      return r.exposed_ids.includes(ref(key as Parameters<typeof ref>[0])) && text.test(JSON.stringify(r.content));
    };
    it('the policy says where status and dates are', async () => {
      const policy = (await nodeTaskSource({ testMode: false }).get('crc-care-gap')).policies[0]!.text;
      expect(policy).toContain("A record's status, dates and notes are on the record itself: an order's or appointment's status, a test's collection and result dates, a care episode's start and end, a medication order's status and the reason it stopped.");
    });
    it.each([
      ['A1 open order and its window', 'fhir_search', { resource_type: 'ServiceRequest', patient: 'pt-0024' }, 'ServiceRequest/sr-t3-4417', /"status":"active".*2025-06-30|2025-06-30.*"status":"active"/],
      ['A2 no-show appointment', 'fhir_search', { resource_type: 'Appointment', patient: 'pt-0014' }, 'Appointment/appt-t3-5813', /noshow/],
      ['B2 sigmoid colectomy', 'fhir_search', { resource_type: 'Procedure', patient: 'pt-0036', count: 50 }, 'Procedure/proc-t3-6271', /Sigmoid colectomy/],
      ['C1 hospice episode end', 'fhir_search', { resource_type: 'EpisodeOfCare', patient: 'pt-0011' }, 'EpisodeOfCare/eoc-t3-3051', /2025-10-20/],
      ['C2 hospice episode in 2026', 'fhir_search', { resource_type: 'EpisodeOfCare', patient: 'pt-0020' }, 'EpisodeOfCare/eoc-t3-8215', /2026-06-16/],
      ['D1 FIT collection and result dates', 'fhir_search', { resource_type: 'Observation', patient: 'pt-0022', code: '29771-3' }, 'Observation/obs-t3-3906', /2025-12-29.*2026-01-05/],
      ['D2 sDNA-FIT collection and result dates', 'fhir_search', { resource_type: 'Observation', patient: 'pt-0018', code: '77354-9' }, 'Observation/obs-t3-7342', /2023-12-27.*2024-01-08/],
      ['G2 donepezil stopped in 2023', 'fhir_search', { resource_type: 'MedicationRequest', patient: 'pt-0019', count: 50 }, 'MedicationRequest/mr-t3-6604', /Stopped 2023-03-20/],
      ['H1 housing status', 'fhir_search', { resource_type: 'Observation', patient: 'pt-0034', category: 'social-history' }, 'Observation/obs-t3-2465', /Lives in nursing home/],
      ['H2 housing status', 'fhir_search', { resource_type: 'Observation', patient: 'pt-0035', category: 'social-history' }, 'Observation/obs-t3-8852', /own home/],
      ['B1 operative note, read', 'fhir_read', { resource_type: 'DocumentReference', id: id('doc-t3-1856') }, 'DocumentReference/doc-t3-1856', /total proctocolectomy/],
      // Ruling R21: H2's other routes to where he lives.
      ['H2 discharge summary, read', 'fhir_read', { resource_type: 'DocumentReference', id: id('doc-t3-6193') }, 'DocumentReference/doc-t3-6193', /discharged home/],
      ['H2 rehab stay discharged home', 'fhir_search', { resource_type: 'Encounter', patient: 'pt-0035', date_ge: '2026-01-01', count: 50 }, 'Encounter/enc-t3-4609', /Discharged to home care/],
    ])('%s', (_label, name, input, key, text) => {
      expect(shows(name, input, key, text)).toBe(true);
    });
    // Ruling R20: the search filtered to each absence's window answers with one whole, empty page,
    // the absence the gap rests on.
    it.each([
      ['A1 no colonoscopy done', { resource_type: 'Procedure', patient: 'pt-0024', code: '73761001', date_ge: '2017-01-01' }],
      ['A2 no colonoscopy done', { resource_type: 'Procedure', patient: 'pt-0014', code: '73761001', date_ge: '2017-01-01' }],
      ['C1 no hospice care in 2026', { resource_type: 'EpisodeOfCare', patient: 'pt-0011', date_ge: '2026-01-01' }],
      ['D1 no FOBT or FIT collected in 2026', { resource_type: 'Observation', patient: 'pt-0022', code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', date_ge: '2026-01-01' }],
      ['D2 no sDNA-FIT collected in 2024-2026', { resource_type: 'Observation', patient: 'pt-0018', code: '77354-9,77353-1', date_ge: '2024-01-01' }],
    ])('%s: the window search is empty', (_label, input) => {
      const r = tool('fhir_search', input);
      expect(r.is_error).toBe(false);
      expect(r.content).toEqual({ total: 0, entries: [] });
    });
    // Ruling R31 (verifier-W1T-190-falsepass F3): every gap's other absences, by the searches of the
    // alternative minimal_complete_reviews, each one whole page: no procedure §3 or §4 counts, no
    // stool test, no advanced illness diagnosis for G2; B2's documents and G2's medications listed
    // whole, so nothing in them is hidden.
    const GAP_PATIENTS = ['pt-0024', 'pt-0014', 'pt-0036', 'pt-0011', 'pt-0022', 'pt-0018', 'pt-0019', 'pt-0035'];
    it.each([
      ...GAP_PATIENTS.map((p) => [`${p} no counted procedure`, { resource_type: 'Procedure', patient: p, code: '73761001,44441009,418714002,26390003', count: 50 }, 0] as const),
      ['G2 no advanced illness diagnosis', { resource_type: 'Condition', patient: 'pt-0019', code: '84114007,13645005,185086009,52448006,26929004,433146000,19943007,128462008,363418001', count: 50 }, 0],
      ['B2 every document', { resource_type: 'DocumentReference', patient: 'pt-0036', count: 50 }, null],
      ['G2 every medication order', { resource_type: 'MedicationRequest', patient: 'pt-0019', count: 50 }, null],
    ] as const)('%s: one whole page', (_label, input, total) => {
      const r = tool('fhir_search', input);
      expect(r.is_error).toBe(false);
      const page = r.content as { total: number; next_offset?: number };
      expect(page.next_offset).toBeUndefined();
      if (total !== null) expect(page.total).toBe(total);
    });
    it('every gap: the stool tests by every counted code, undated, are one whole page with none collected in its window', () => {
      for (const p of GAP_PATIENTS) {
        const page = tool('fhir_search', { resource_type: 'Observation', patient: p, code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9,77354-9,77353-1', count: 50 }).content as { entries: Array<{ code?: { coding?: Array<{ code?: string }> }; effectiveDateTime?: string }>; next_offset?: number };
        expect(page.next_offset, p).toBeUndefined();
        const late = page.entries.filter((e) => (e.code?.coding ?? []).some((c) => ['77354-9', '77353-1'].includes(c.code ?? '')) ? (e.effectiveDateTime ?? '') >= '2024' : (e.effectiveDateTime ?? '') >= '2026');
        expect(late, p).toEqual([]);
      }
    });
    // Ruling R27 (verifier-W1-probe-T3-clinical-2 N1, N2): the two other complete routes. A
    // clinic-wide window search is one whole page that names none of the absence gaps; D2's
    // Observations since 2024, paged ten at a time by next_offset, end and hold no sDNA-FIT.
    it.each([
      ['FOBT and FIT collected in 2026', { resource_type: 'Observation', code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', date_ge: '2026-01-01', count: 50 }, ['pt-0022']],
      ['sDNA-FIT collected in 2024-2026', { resource_type: 'Observation', code: '77354-9,77353-1', date_ge: '2024-01-01', count: 50 }, ['pt-0018']],
      ['care episodes in 2026', { resource_type: 'EpisodeOfCare', date_ge: '2026-01-01', count: 50 }, ['pt-0011']],
    ])('clinic-wide %s: one whole page without %s', (_label, input, gaps) => {
      const r = tool('fhir_search', input);
      expect(r.is_error).toBe(false);
      const page = r.content as { entries: Array<{ subject?: { reference?: string }; patient?: { reference?: string } }>; next_offset?: number };
      expect(page.next_offset).toBeUndefined();
      const shown = page.entries.map((e) => (e.subject ?? e.patient)?.reference);
      for (const p of gaps) expect(shown).not.toContain(`Patient/${p}`);
    });
    it("D2's Observations since 2024, paged by next_offset, reach the end within eight pages of ten and hold no sDNA-FIT", () => {
      const codes: string[] = [];
      let offset: number | undefined = 0;
      let pages = 0;
      while (offset !== undefined && pages < 8) {
        const page = tool('fhir_search', { resource_type: 'Observation', patient: 'pt-0018', date_ge: '2024-01-01', count: 10, offset }).content as { entries: Array<{ code?: { coding?: Array<{ code?: string }> } }>; next_offset?: number };
        expect(page.entries.length === 10 || page.next_offset === undefined).toBe(true);
        codes.push(...page.entries.flatMap((e) => (e.code?.coding ?? []).map((c) => c.code ?? '')));
        offset = page.next_offset;
        pages += 1;
      }
      expect(offset).toBeUndefined();
      expect(codes.filter((c) => ['77354-9', '77353-1'].includes(c))).toEqual([]);
    });
    it("B1's note is listed with her documents and found by the words it uses", () => {
      expect(tool('fhir_search', { resource_type: 'DocumentReference', patient: 'pt-0021', count: 50 }).referenced_ids).toContain(ref('DocumentReference/doc-t3-1856'));
      expect(tool('search_notes', { query: 'proctocolectomy' }).referenced_ids.concat(tool('search_notes', { query: 'proctocolectomy' }).exposed_ids)).toContain(ref('DocumentReference/doc-t3-1856'));
    });
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('crc-care-gap');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = expected.items.map((x) => x.family);
    const findings = lintWorld(all, [{ source: 'crc-care-gap', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-QM-02', text })) } } }]);
    expect(findings).toEqual([]);
  });

  // verifier-W1-probe-T3-clinical-5 F1 (coordinator re-ruling): tests/grader.ts filtersCover counts
  // a search start as covering a window when it is at or before midnight on the clinic's calendar,
  // because policy.ts counts a record by its clinic-local date. That reading holds only while every
  // stored time on T3's slots carries the clinic's offset for its instant (-05:00 in winter, -04:00
  // in summer): a time in Z or at another offset could fall in 2026 on the clinic's calendar but
  // before the instant the grader reads as the window start, or the reverse.
  describe("every stored time on T3's slots carries the clinic's offset", () => {
    const ZONE = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' });
    const zoneOffset = (ms: number) => ZONE.formatToParts(ms).find((p) => p.type === 'timeZoneName')!.value.replace(/^GMT/, '') || '+00:00';
    const TIMED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
    // Each string that holds a time, with where it sits, that lacks the clinic's offset at its instant.
    const offsetFaults = (resources: ReadonlyArray<{ resourceType: string; id?: string; [k: string]: unknown }>): string[] => {
      const out: string[] = [];
      const walk = (v: unknown, at: string) => {
        if (typeof v === 'string') {
          const m = TIMED.exec(v);
          if (m && (m[1] === undefined || m[1] !== zoneOffset(Date.parse(v)))) out.push(`${at} ${v}`);
        } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
        else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
      };
      for (const r of resources) walk(r, `${r.resourceType}/${r.id}`);
      return out;
    };
    const T3_SLOTS = new Set<string>(TASKS.T3.slots);
    const onT3 = all.filter((r) => (r.resourceType === 'Patient' && T3_SLOTS.has(r.id!)) || [...patientRefs(r)].some((p) => T3_SLOTS.has(p)));

    it('finds a time in Z, a time without an offset and a time at the other season\'s offset', () => {
      const bad = [
        { resourceType: 'Observation', id: 'x1', effectiveDateTime: '2026-01-01T02:00:00Z' },
        { resourceType: 'Observation', id: 'x2', effectiveDateTime: '2026-01-01T02:00:00' },
        { resourceType: 'Observation', id: 'x3', effectiveDateTime: '2026-01-01T02:00:00-04:00' },
        { resourceType: 'Observation', id: 'x4', effectivePeriod: { start: '2026-07-01T09:00:00-05:00' } },
      ];
      expect(offsetFaults(bad)).toHaveLength(4);
      expect(offsetFaults([{ resourceType: 'Observation', id: 'ok', effectiveDateTime: '2026-01-01T00:00:00-05:00', issued: '2026-07-01T09:00:00-04:00', meta: { tag: '2026-01-01' } }])).toEqual([]);
    });

    it('holds for every resource on the slots', () => {
      expect(onT3.length).toBeGreaterThan(1000);
      expect(offsetFaults(onT3)).toEqual([]);
    });
  });
});
