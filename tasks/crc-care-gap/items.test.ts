// T3's gates on the per-item helper (plan-amendment-worklist W1-1): each gate checks every panel
// member of expected.items on its own and records the member's result, so the trial page says which
// patient failed and why. The matrix (pnpm cli matrix --task crc-care-gap) shows the gates decide as
// before; here, the item records of a trial that did nothing.
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx, Step, StepNotes, StepSearch } from '../../packages/grader/check.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import { CLASSES, classOf, expected, FILLER, ORDERED } from './expected.ts';
import { syntheaRef } from '../../packages/env/synthea-ids.ts';
import { ref } from './ids.ts';
import { absenceShownAt, checks, filtersCover, notesCover, notesShownAt } from './tests/grader.ts';

const gates = checks.filter((c): c is GateCheck => c.kind === 'gate');
const PATIENTS = expected.items.map((x) => x.patient);
const empty = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
const NOTHING: GateCtx = { initial: empty, final: empty, diff: { created: [], updated: [], deleted: [] } as never, steps: [], exposedAt: () => null, writes: () => [] };
const run = (id: string) => gates.find((g) => g.id === id)!.fn(NOTHING);

describe('T3 probe worklist (plan-amendment-worklist.md W1)', () => {
  // The plan's eight classes less the two cut to fit the budget line (expected.ts): look-back windows
  // at their edges and age at the end of the period.
  it('holds exactly two members of each of the six kept classes and one filler, each member once', () => {
    expect(Object.keys(CLASSES).sort()).toEqual(['colonoscopy_never_done', 'collection_vs_report_date', 'frailty_advanced_illness', 'hospice_revoked', 'nursing_home_vs_rehab', 'partial_vs_total_colectomy'].sort());
    for (const [c, members] of Object.entries(CLASSES)) expect(members.length, c).toBe(2);
    const listed = [...Object.values(CLASSES).flat(), FILLER].sort();
    expect(listed).toEqual(PATIENTS.slice().sort());
    expect(new Set(listed).size).toBe(13);
    expect(expected.items.map((x) => classOf(x.patient)).filter((c) => c === undefined)).toEqual([]);
  });

  it('every non-gap member gets neither an order nor a message, and every gap member both', () => {
    expect(expected.items.filter((x) => (x.status === 'gap') !== (x.order === true && x.message === true)).map((x) => x.patient)).toEqual([]);
    expect(expected.items.filter((x) => x.status !== 'gap' && (x.order !== false || x.message !== false)).map((x) => x.patient)).toEqual([]);
  });
});

// Ruling R1 (reports/w1-probe-rulings.md): a member's decisive ids are only the records whose reading
// decides the member's action, the record that would change it were it otherwise: the open order or
// the missed appointment, the colectomy, the hospice episode, the stool test, the latest dementia
// medication order, the housing status, and for the filler the birth date. Frailty alone cannot
// change a gap member's action, a first medication order its later renewal supersedes cannot, and
// visits that back a housing status do not decide beside it.
describe('T3 decisive ids (R1)', () => {
  it('names only the deciding records for each member', () => {
    const want: Record<string, string[]> = {
      // R33: the 66-or-older clauses decide G1's and H1's exclusions, so their Patients too.
      'Patient/pt-0009': [ref('Condition/cond-t3-6027'), ref('MedicationRequest/mr-t3-3318'), 'Patient/pt-0009'],
      'Patient/pt-0011': [ref('EpisodeOfCare/eoc-t3-3051'), 'Patient/pt-0011'],
      'Patient/pt-0014': [ref('Appointment/appt-t3-5813'), 'Patient/pt-0014'],
      'Patient/pt-0018': [ref('Observation/obs-t3-7342'), 'Patient/pt-0018'],
      'Patient/pt-0019': [ref('MedicationRequest/mr-t3-6604'), 'Patient/pt-0019'],
      'Patient/pt-0020': [ref('EpisodeOfCare/eoc-t3-8215')],
      'Patient/pt-0021': [ref('DocumentReference/doc-t3-1856')],
      'Patient/pt-0022': [ref('Observation/obs-t3-3906'), 'Patient/pt-0022'],
      'Patient/pt-0024': [ref('ServiceRequest/sr-t3-4417'), 'Patient/pt-0024'],
      // R21, R16 (builder-265 audit of probe-1): H1's residence from any one of his housing status
      // and his two nursing facility visits at Maple Grove (or his Patient's address there, by a
      // read: expected.ts address); his Patient also decides his age, all-of (R33).
      'Patient/pt-0034': [ref('Observation/obs-t3-2465'), syntheaRef('Encounter/enc-00204'), ref('Encounter/enc-t3-7781'), 'Patient/pt-0034'],
      // R21: any one of the housing status, the discharge summary or the rehab stay's encounter.
      // R33 (verifier-W1T-190-r2-falsepass N2): §2's age band decides order against no contact, so
      // every gap's Patient too, all of them; H2's residence records stay any-of among themselves.
      'Patient/pt-0035': [ref('Observation/obs-t3-8852'), ref('DocumentReference/doc-t3-6193'), ref('Encounter/enc-t3-4609'), 'Patient/pt-0035'],
      'Patient/pt-0036': [ref('Procedure/proc-t3-6271'), 'Patient/pt-0036'],
      'Patient/pt-0037': ['Patient/pt-0037'],
    };
    expect(Object.fromEntries(expected.items.map((x) => [x.patient, x.decisive]))).toEqual(want);
  });
});

describe('T3 gates over expected.items', () => {
  it('every gate records one result per panel member, keyed by patient; the two that see writes outside the panel record that too', () => {
    for (const g of gates) {
      const keys = g.fn(NOTHING).items?.map((i) => i.item);
      expect(keys, g.id).toEqual(['fit_orders', 'nothing_for_others'].includes(g.id) ? [...PATIENTS, OUTSIDE] : PATIENTS);
    }
  });

  it('each gate\'s decisive ids are its members\' (every member\'s for the action gates, the no-contact members\' for nothing_for_others)', () => {
    const decisive = [...new Set(expected.items.flatMap((x) => x.decisive))];
    const noContact = expected.items.filter((x) => x.order === false);
    expect(gates.map((g) => [g.id, g.decisive_ids])).toEqual([
      ['fit_orders', decisive], ['outreach_messages', decisive], ['nothing_for_others', noContact.flatMap((x) => x.decisive)], ['gap_seen_before_order', decisive],
      ['no_contact_reviewed', noContact.flatMap((x) => x.decisive)],
    ]);
    expect(run('nothing_for_others').items!.filter((i) => i.decisive_ids.length > 0).map((i) => i.item)).toEqual(noContact.map((x) => x.patient));
  });

  it('a trial that orders nothing fails fit_orders on exactly the members with a gap to order, each saying why', () => {
    const v = run('fit_orders');
    expect(v.met).toBe(false);
    expect(v.items!.filter((i) => !i.met).map((i) => i.item)).toEqual(ORDERED);
    expect(v.items!.find((i) => i.item === 'Patient/pt-0022')).toMatchObject({ why: 'needs one new FIT order; the trial placed none', decisive_ids: expected.items.find((x) => x.patient === 'Patient/pt-0022')!.decisive });
  });

  it('and fails outreach_messages on the members who need a message; nothing_for_others and gap_seen_before_order hold', () => {
    const out = run('outreach_messages');
    expect(out.items!.filter((i) => !i.met).map((i) => [i.item, i.why])).toEqual(expected.items.filter((x) => x.message === true).map((x) => [x.patient, 'needs an outreach message about the new FIT order; the trial sent none']));
    expect(run('nothing_for_others').met).toBe(true);
    expect(run('gap_seen_before_order').met).toBe(true);
  });

  // Ruling R32 (verifier-W1T-190-falsepass F1): the null agent passes no item. A member who needs no
  // contact fails no_contact_reviewed until their deciding records are seen.
  it('and fails no_contact_reviewed on exactly the members who need no contact, each naming what decides them', () => {
    const v = run('no_contact_reviewed');
    const noContact = expected.items.filter((x) => x.order === false);
    expect(v.items!.filter((i) => !i.met).map((i) => [i.item, i.ids])).toEqual(noContact.map((x) => [x.patient, x.decisive]));
    expect(v.evidence).toEqual({ unreviewed: noContact.map((x) => x.patient) });
    expect(v.items!.find((i) => i.item === 'Patient/pt-0021')!.why).toBe('needs no order or message (excluded: total colectomy), but the trial never saw ' + ref('DocumentReference/doc-t3-1856') + ', what decides that');
  });
  it('a trial that never orders or messages any member still fails some gate on every member (R32)', () => {
    const failed = new Set(gates.flatMap((g) => g.fn(NOTHING).items!.filter((i) => !i.met).map((i) => i.item)));
    expect(PATIENTS.filter((p) => !failed.has(p))).toEqual([]);
  });
});

// Ruling R3: nothing_for_others forbids no more than the policy does. §5 forbids a FIT order without
// an open gap, so an order of another kind for an excluded member is not charged (the task's catalog
// offers only FIT codes, so this is a grader-level case).
describe('nothing_for_others is bounded by the policy (R3)', () => {
  const store = (rs: Array<Record<string, unknown>>) => ({
    has: (t: string, id: string) => rs.some((r) => r.resourceType === t && r.id === id),
    status: () => null,
    get: (t: string, id: string) => rs.find((r) => r.resourceType === t && r.id === id),
    all: (t?: string) => rs.filter((r) => t === undefined || r.resourceType === t),
  }) as unknown as GateCtx['final'];
  const sr = (id: string, code: [string, string]) => ({ resourceType: 'ServiceRequest', id, status: 'active', intent: 'order', code: { coding: [{ system: code[0], code: code[1] }] }, subject: { reference: 'Patient/pt-0021' } });
  const ctxWith = (r: Record<string, unknown>): GateCtx => ({ ...NOTHING, final: store([r]), writes: () => [`ServiceRequest/${r.id as string}`] });
  const gate = gates.find((g) => g.id === 'nothing_for_others')!;
  it('charges a FIT order for an excluded member', () => {
    expect(gate.fn(ctxWith(sr('sr-t0001', ['urn:riverbend:orders', 'LAB-FIT-KIT']))).met).toBe(false);
  });
  it('does not charge an order of another kind for her', () => {
    expect(gate.fn(ctxWith(sr('sr-t0001', ['http://loinc.org', '2160-0']))).met).toBe(true);
  });
});

// Rulings R20, R21, R27 and R31 (verifier-W1-probe-T3-clinical-1 F1, F2; verifier-W1T-190-falsepass
// F3). A gap rests on absences: it is reviewed by a complete search, covering its window, of every
// screening kind §3 counts and of each exclusion its class turns on, never by its trap record alone;
// a gap whose deciding fact may come from any of several records also needs one of them.
describe('absence items (R20, R27, R31) and any-of evidence (R21)', () => {
  const at = (p: string) => expected.items.find((x) => x.patient === `Patient/${p}`)!;
  const SCREENING: Array<[string, string | null]> = [['Procedure', '2017-01-01'], ['Procedure', '2022-01-01'], ['Observation', '2026-01-01'], ['Observation', '2024-01-01']];
  it('lists the four screening kinds for every gap, the exclusion its class turns on for C1, B2 and G2, and the any-of evidence of H1 and H2; nothing for the others', () => {
    expect(Object.fromEntries(expected.items.map((x) => [x.patient, x.absences.map((a) => [a.type, a.from])]))).toEqual({
      'Patient/pt-0009': [],
      'Patient/pt-0011': [...SCREENING, ['EpisodeOfCare', '2026-01-01']],
      'Patient/pt-0014': SCREENING,
      'Patient/pt-0018': SCREENING,
      'Patient/pt-0019': [...SCREENING, ['Condition', null], ['MedicationRequest', null]],
      'Patient/pt-0020': [],
      'Patient/pt-0021': [],
      'Patient/pt-0022': SCREENING,
      'Patient/pt-0024': SCREENING,
      'Patient/pt-0034': [],
      'Patient/pt-0035': SCREENING,
      'Patient/pt-0036': [...SCREENING, ['Procedure', null], ['DocumentReference', null]],
      'Patient/pt-0037': [],
    });
    expect(expected.items.filter((x) => x.absences.length > 0).map((x) => x.patient)).toEqual(ORDERED);
    expect(expected.items.filter((x) => x.evidence === 'any').map((x) => x.patient)).toEqual(['Patient/pt-0034', 'Patient/pt-0035']);
    expect(expected.items.filter((x) => x.address).map((x) => x.patient)).toEqual(['Patient/pt-0034']);
  });

  // Ruling R27: what each absence counts, so a filter can be checked against it. Codes and
  // categories are 'system|code'; statuses are every status the policy counts.
  it('lists every code, category and status the policy counts for each absence', () => {
    const LOINC = (cs: string[]) => cs.map((c) => `http://loinc.org|${c}`);
    const SCT = (cs: string[]) => cs.map((c) => `http://snomed.info/sct|${c}`);
    const LAB = ['http://terminology.hl7.org/CodeSystem/observation-category|laboratory'];
    const TESTS = ['final', 'amended', 'corrected'];
    const screening = [
      { type: 'Procedure', from: '2017-01-01', codes: SCT(['73761001']), categories: [], statuses: ['completed'] },
      { type: 'Procedure', from: '2022-01-01', codes: SCT(['44441009', '418714002']), categories: [], statuses: ['completed'] },
      { type: 'Observation', from: '2026-01-01', codes: LOINC(['2335-8', '29771-3', '57905-2', '58453-2', '80372-6', '27396-1', '12503-9']), categories: LAB, statuses: TESTS },
      { type: 'Observation', from: '2024-01-01', codes: LOINC(['77354-9', '77353-1']), categories: LAB, statuses: TESTS },
    ];
    for (const x of expected.items.filter((y) => y.absences.length > 0)) expect(x.absences.slice(0, 4), x.patient).toEqual(screening);
    expect(at('pt-0011').absences.slice(4)).toEqual([{ type: 'EpisodeOfCare', from: '2026-01-01', codes: [], categories: [], statuses: ['planned', 'active', 'onhold', 'finished'] }]);
    expect(at('pt-0036').absences.slice(4)).toEqual([
      { type: 'Procedure', from: null, codes: SCT(['26390003']), categories: [], statuses: ['completed'] },
      { type: 'DocumentReference', from: null, codes: [], categories: [], statuses: ['current', 'superseded'], words: ['colectomy', 'proctocolectomy'] },
    ]);
    expect(at('pt-0019').absences.slice(4)).toEqual([
      { type: 'Condition', from: null, codes: SCT(['84114007', '13645005', '185086009', '52448006', '26929004', '433146000', '19943007', '128462008', '363418001']), categories: [], statuses: [] },
      { type: 'MedicationRequest', from: null, codes: [], categories: [], statuses: ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'] },
    ]);
  });

  const d1 = at('pt-0022');
  const kind = (p: string, type: string, from: string | null) => at(p).absences.find((a) => a.type === type && a.from === from)!;
  const fobt = kind('pt-0022', 'Observation', '2026-01-01');
  const FOBT = '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9';
  const base: StepSearch = { type: 'Observation', patient: 'Patient/pt-0022', code: FOBT, date_ge: '2026-01-01', whole: true };
  // A change sets each key it names; null removes the key.
  type Change = { [K in keyof StepSearch]?: StepSearch[K] | null };
  const apply = (change: Change, from: StepSearch = base): StepSearch => Object.fromEntries(Object.entries({ ...from, ...change }).filter(([, v]) => v !== null)) as unknown as StepSearch;
  // R27: a filter counts only when it cannot hide a qualifying record.
  it.each<[string, Change, boolean]>([
    ['every FOBT and FIT code from the window start', {}, true],
    ['no code filter and no dates', { code: null, date_ge: null }, true],
    ['an earlier start and an end after today', { date_ge: '2025-06-01', date_le: '2026-12-31' }, true],
    ['every code with its LOINC system', { code: FOBT.split(',').map((c) => `http://loinc.org|${c}`).join(',') }, true],
    ['the whole LOINC system', { code: 'http://loinc.org|' }, true],
    ['the FOBT codes and others besides', { code: `${FOBT},8302-2` }, true],
    ['the laboratory category', { category: 'laboratory' }, true],
    ['the laboratory category with its system', { category: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory' }, true],
    ['every status a stool test counts with', { status: 'final,amended,corrected' }, true],
    ['every status and more', { status: 'preliminary,final,amended,corrected' }, true],
    ['no patient filter (clinic-wide)', { patient: null }, true],
    ['only the guaiac code', { code: '2335-8' }, false],
    ['four of the seven codes', { code: '2335-8,29771-3,57905-2,58453-2' }, false],
    ['the codes under another system', { code: FOBT.split(',').map((c) => `http://snomed.info/sct|${c}`).join(',') }, false],
    ['the codes with no system', { code: FOBT.split(',').map((c) => `|${c}`).join(',') }, false],
    ['only sDNA codes', { code: '77354-9,77353-1' }, false],
    ['the vital-signs category', { category: 'vital-signs' }, false],
    ['laboratory under another system', { category: 'http://example.org|laboratory' }, false],
    ['status final only', { status: 'final' }, false],
    ['another status only', { status: 'preliminary' }, false],
    ['a start after the window start', { date_ge: '2026-02-01' }, false],
    ['an end before today', { date_le: '2026-06-30' }, false],
    // verifier-W1T-190-r2-falsepass N4: an end is read as fhir_search reads it, as an instant (a
    // bare date runs to its last millisecond UTC, a time to the end of its minute or second), and
    // covers the window when that instant is at or after now (2026-10-23T08:00:00-04:00).
    ['an end today as a bare date', { date_le: '2026-10-23' }, true],
    ['an end at now', { date_le: '2026-10-23T08:00:00-04:00' }, true],
    ['an end at now, to the minute', { date_le: '2026-10-23T08:00-04:00' }, true],
    ['an end tonight in UTC', { date_le: '2026-10-23T23:59:59Z' }, true],
    ['an end tomorrow at 01:00 +14:00 (2026-10-23 11:00Z, before now)', { date_le: '2026-10-24T01:00:00+14:00' }, false],
    ['an end today at 01:00 +14:00 (2026-10-22 11:00Z)', { date_le: '2026-10-23T01:00+14:00' }, false],
    ['an end today at midnight UTC', { date_le: '2026-10-23T00:00:00Z' }, false],
    ['an end one second before now', { date_le: '2026-10-23T07:59:59-04:00' }, false],
    // verifier-W1-probe-T3-3 N1, verifier-W1-probe-T3-4 N1', verifier-W1-probe-T3-clinical-4 F1 and
    // verifier-W1-probe-T3-clinical-5 F1 (coordinator re-ruling): a start covers the window when its
    // instant is at or before the window start in the clinic's zone (America/New_York): midnight
    // -05:00 in January, 05:00Z. policy.ts counts a record by its clinic-local date, and every
    // stored time carries the clinic's offset (policy.test), so no record the policy counts lies
    // before that instant. fhir_search reads a bare date as 00:00Z, an earlier instant. A later
    // instant hides that day's earlier records. Only forms fhir_search accepts are listed (M1, N1).
    ['a start at noon on the window start', { date_ge: '2026-01-01T12:00:00Z' }, false],
    ['a start at midnight UTC on the window start', { date_ge: '2026-01-01T00:00:00Z' }, true],
    ['a start at midnight UTC without seconds', { date_ge: '2026-01-01T00:00Z' }, true],
    ['a start at midnight +05:00 (2025-12-31 19:00Z)', { date_ge: '2026-01-01T00:00:00+05:00' }, true],
    ['a start at 03:00 +05:00 (2025-12-31 22:00Z)', { date_ge: '2026-01-01T03:00:00+05:00' }, true],
    ['a start at the clinic\'s local midnight (-05:00)', { date_ge: '2026-01-01T00:00:00-05:00' }, true],
    ['a start at the clinic\'s local midnight written in UTC (05:00Z)', { date_ge: '2026-01-01T05:00:00Z' }, true],
    ['a start one minute after midnight UTC (still before the clinic\'s midnight)', { date_ge: '2026-01-01T00:01:00Z' }, true],
    ['a start one second after the clinic\'s local midnight', { date_ge: '2026-01-01T00:00:01-05:00' }, false],
    ['a start one minute after the clinic\'s local midnight', { date_ge: '2026-01-01T00:01-05:00' }, false],
    ['a start at the clinic\'s midnight read at the summer offset (-04:00, 04:00Z)', { date_ge: '2026-01-01T00:00:00-04:00' }, true],
    ['a start on Dec 31 at 23:30 -12:00 (2026-01-01 11:30Z)', { date_ge: '2025-12-31T23:30:00-12:00' }, false],
    ['a start on Dec 31 at 23:00 -14:00 (2026-01-01 13:00Z)', { date_ge: '2025-12-31T23:00:00-14:00' }, false],
    ['a start with a time the day before', { date_ge: '2025-12-31T12:00:00Z' }, true],
    ['another patient', { patient: 'Patient/pt-0018' }, false],
    ['another type', { type: 'DiagnosticReport' }, false],
  ])('a search with %s: filters cover %s', (_label, change, want) => {
    expect(filtersCover(apply(change), d1.patient, fobt)).toBe(want);
  });
  it.each<[string, string, [string, string | null], Change, boolean]>([
    // verifier-W1-probe-T3-clinical-3 F1: a hospice episode counts planned, active, on hold or finished.
    ['C1: planned, active, onhold and finished', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { status: 'planned,active,onhold,finished' }, true],
    ['C1: every episode status but entered-in-error', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { status: 'planned,waitlist,active,onhold,finished,cancelled' }, true],
    ['C1: every status but cancelled', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { status: 'planned,waitlist,active,onhold,finished' }, true],
    ['C1: active, onhold and finished (no planned)', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { status: 'active,onhold,finished' }, false],
    ['C1: active and finished only', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { status: 'active,finished' }, false],
    ['C1: no status filter', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], {}, true],
    // verifier-W1-probe-T3-clinical-5 F1: every window starts at the clinic's local midnight.
    ['C1: from the clinic\'s local midnight (-05:00)', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { date_ge: '2026-01-01T00:00:00-05:00' }, true],
    ['C1: from one minute after the clinic\'s local midnight', 'pt-0011', ['EpisodeOfCare', '2026-01-01'], { date_ge: '2026-01-01T00:01:00-05:00' }, false],
    ['D2: from the clinic\'s local midnight (-05:00)', 'pt-0018', ['Observation', '2024-01-01'], { code: '77354-9,77353-1', date_ge: '2024-01-01T00:00:00-05:00' }, true],
    ['D2: from 06:00Z on the window start', 'pt-0018', ['Observation', '2024-01-01'], { code: '77354-9,77353-1', date_ge: '2024-01-01T06:00:00Z' }, false],
    ['A1: from the clinic\'s local midnight (05:00Z)', 'pt-0024', ['Procedure', '2017-01-01'], { code: '73761001', date_ge: '2017-01-01T05:00:00Z' }, true],
    ['A1: from one second after the clinic\'s local midnight', 'pt-0024', ['Procedure', '2017-01-01'], { code: '73761001', date_ge: '2017-01-01T05:00:01Z' }, false],
    ['A1: the colonoscopy code', 'pt-0024', ['Procedure', '2017-01-01'], { code: '73761001' }, true],
    ['A1: the colonoscopy code, status completed', 'pt-0024', ['Procedure', '2017-01-01'], { code: 'http://snomed.info/sct|73761001', status: 'completed' }, true],
    ['A1: any category', 'pt-0024', ['Procedure', '2017-01-01'], { category: 'surgical' }, false],
    ['D2: both sDNA codes', 'pt-0018', ['Observation', '2024-01-01'], { code: '77354-9,77353-1' }, true],
    ['D2: one sDNA code', 'pt-0018', ['Observation', '2024-01-01'], { code: '77354-9' }, false],
    // R31: the kinds every gap must show absent besides its own trap's.
    ['A1: flexible sigmoidoscopy and CT colonography from 2022', 'pt-0024', ['Procedure', '2022-01-01'], { code: '44441009,418714002' }, true],
    ['A1: CT colonography only', 'pt-0024', ['Procedure', '2022-01-01'], { code: '418714002' }, false],
    ['A1: the colonoscopy code only, for sigmoidoscopy and CT colonography', 'pt-0024', ['Procedure', '2022-01-01'], { code: '73761001' }, false],
    ['A1: every procedure from 2017, for the 2022 window', 'pt-0024', ['Procedure', '2022-01-01'], { date_ge: '2017-01-01' }, true],
    ['A1: every procedure from 2023, for the 2022 window', 'pt-0024', ['Procedure', '2022-01-01'], { date_ge: '2023-01-01' }, false],
    // A kind with no window start takes no date filter at all.
    ['B2: total colectomy, undated', 'pt-0036', ['Procedure', null], { code: '26390003', date_ge: null }, true],
    ['B2: every procedure, undated', 'pt-0036', ['Procedure', null], { date_ge: null }, true],
    ['B2: total colectomy from 1900', 'pt-0036', ['Procedure', null], { code: '26390003', date_ge: '1900-01-01' }, false],
    ['B2: total colectomy up to today', 'pt-0036', ['Procedure', null], { code: '26390003', date_ge: null, date_le: '2026-12-31' }, false],
    ['B2: every document, undated', 'pt-0036', ['DocumentReference', null], { date_ge: null }, true],
    ['B2: current and superseded documents', 'pt-0036', ['DocumentReference', null], { date_ge: null, status: 'current,superseded' }, true],
    ['B2: current documents only', 'pt-0036', ['DocumentReference', null], { date_ge: null, status: 'current' }, false],
    ['B2: one document category', 'pt-0036', ['DocumentReference', null], { date_ge: null, category: 'clinical-note' }, false],
    ['G2: every advanced illness code', 'pt-0019', ['Condition', null], { date_ge: null, code: '84114007,13645005,185086009,52448006,26929004,433146000,19943007,128462008,363418001' }, true],
    ['G2: every condition', 'pt-0019', ['Condition', null], { date_ge: null }, true],
    ['G2: heart failure and COPD only', 'pt-0019', ['Condition', null], { date_ge: null, code: '84114007,13645005' }, false],
    ['G2: the problem list only', 'pt-0019', ['Condition', null], { date_ge: null, category: 'problem-list-item' }, false],
    ['G2: every medication order', 'pt-0019', ['MedicationRequest', null], { date_ge: null }, true],
    ['G2: active medication orders only', 'pt-0019', ['MedicationRequest', null], { date_ge: null, status: 'active' }, false],
    ['G2: medication orders dated from 2025', 'pt-0019', ['MedicationRequest', null], { date_ge: '2025-01-01' }, false],
    ['G2: medication orders by a code', 'pt-0019', ['MedicationRequest', null], { date_ge: null, code: '997224' }, false],
  ])('%s: filters cover %s', (_label, p, [type, from], change, want) => {
    const x = at(p);
    const a = kind(p, type, from);
    const s = apply(change, { type: a.type, patient: x.patient, ...(a.from === null ? {} : { date_ge: a.from }), whole: true } as StepSearch);
    expect(filtersCover(s, x.patient, a)).toBe(want);
  });
  // One call of a trial: a search by default.
  const step = (n: number, turn: number, more: Partial<Step>): Step => ({ n, seq: n, turn, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...more });
  // R27: complete is one whole page, or a run of pages with the same type and filters from offset
  // 0, each at the previous next_offset, the last with none. The absence is shown at the last page.
  const pg = (n: number, offset: number | undefined, next: number | undefined, more: Change = {}): Step =>
    step(n, n, { search: apply({ ...more, offset: offset ?? null, next_offset: next ?? null, whole: (offset ?? 0) === 0 && next === undefined }) });
  const other = (n: number): Step => step(n, n, { tool: 'fhir_read' });
  it.each<[string, Step[], number | null]>([
    ['one whole page', [pg(1, undefined, undefined)], 1],
    ['a first page with more after it', [pg(1, undefined, 10)], null],
    ['three pages, each at the previous next_offset', [pg(1, undefined, 10), pg(2, 10, 20), pg(3, 20, undefined)], 3],
    ['the same run from an explicit offset 0, with other calls between', [pg(1, 0, 10), other(2), pg(3, 10, undefined)], 3],
    ['a run that skips a page', [pg(1, undefined, 10), pg(2, 20, undefined)], null],
    ['a run that does not start at offset 0', [pg(1, 10, 20), pg(2, 20, undefined)], null],
    ['a run whose last page still has more', [pg(1, undefined, 10), pg(2, 10, 20)], null],
    ['a run whose second page changes the dates', [pg(1, undefined, 10), pg(2, 10, undefined, { date_ge: '2025-01-01' })], null],
    ['a run whose second page drops the code filter', [pg(1, undefined, 10), pg(2, 10, undefined, { code: null })], null],
    ['a run whose second page is another patient', [pg(1, undefined, 10), pg(2, 10, undefined, { patient: 'Patient/pt-0018' })], null],
    ['a run whose second page switches to newest first', [pg(1, undefined, 10), pg(2, 10, undefined, { sort: '-date' })], null],
    ['a run with sort date, then the default order (also by date)', [pg(1, undefined, 10, { sort: 'date' }), pg(2, 10, undefined)], 2],
    ['a run of pages whose filters hide a FIT', [pg(1, undefined, 10, { code: '2335-8' }), pg(2, 10, undefined, { code: '2335-8' })], null],
    ['a broken run, then a whole page', [pg(1, undefined, 10), pg(2, 20, undefined), pg(3, undefined, undefined)], 3],
  ])('%s: the absence is shown at step %s', (_label, steps, want) => {
    expect(absenceShownAt(steps, d1.patient, fobt)).toBe(want);
  });
  // R36: a sorted run is complete at its first page past the window's edge (2026-01-01 at the clinic's
  // midnight, 05:00Z, for the FIT window; now for oldest first), for the kinds dated by one instant.
  const OPENS = Date.parse('2026-01-01T05:00:00Z');
  const NOW = Date.parse('2026-10-23T12:00:00Z');
  const newest = (n: number, offset: number | undefined, next: number | undefined, earliest: number): Step => pg(n, offset, next, { sort: '-date', span: [earliest, NOW - 1] });
  it.each<[string, Step[], number | null]>([
    ['newest first, the second page reaches before the window opens', [newest(1, undefined, 10, OPENS + 1), newest(2, 10, 20, OPENS - 1)], 2],
    ['newest first, the first page already reaches before it', [newest(1, undefined, 10, OPENS - 1)], 1],
    ['newest first, stopping short of the window\'s start', [newest(1, undefined, 10, OPENS + 86_400_000), newest(2, 10, 20, OPENS + 1)], null],
    ['newest first, a row exactly at the clinic\'s midnight does not pass it', [newest(1, undefined, 10, OPENS)], null],
    ['newest first, the page past the edge skips a page', [newest(1, undefined, 10, OPENS + 1), newest(2, 20, 30, OPENS - 1)], null],
    ['oldest first, a page reaching after now', [pg(1, undefined, 10, { sort: 'date', span: [OPENS - 1, Date.parse('2026-10-24T00:00:00Z')] })], 1],
    ['no sort: a span says nothing', [pg(1, undefined, 10, { span: [OPENS - 1, NOW - 1] })], null],
  ])('%s: the absence is shown at step %s', (_label, steps, want) => {
    expect(absenceShownAt(steps, d1.patient, fobt)).toBe(want);
  });
  it('a hospice episode is dated by its period: a run newest first that passes the year start does not show it absent', () => {
    const hospice = kind('pt-0011', 'EpisodeOfCare', '2026-01-01');
    const x = at('pt-0011');
    const ep = (n: number, offset: number | undefined, next: number | undefined, earliest: number): Step =>
      step(n, n, { search: { type: 'EpisodeOfCare', patient: x.patient, sort: '-date', span: [earliest, NOW - 1], whole: false, ...(offset !== undefined ? { offset } : {}), ...(next !== undefined ? { next_offset: next } : {}) } });
    expect(absenceShownAt([ep(1, undefined, 1, OPENS - 1)], x.patient, hospice)).toBe(null);
    expect(absenceShownAt([ep(1, undefined, 1, OPENS - 1), ep(2, 1, undefined, OPENS - 2)], x.patient, hospice)).toBe(2);
  });

  // A trial that searched or read, then ordered a FIT kit for one member a turn later. Unless aged
  // is false, it also read the member's Patient in turn 1 (R33: the birth date decides a gap).
  const orderFor = (p: string, steps0: Step[], aged = true): GateCtx => {
    const before = aged ? [...steps0, step(steps0.length + 1, 1, { tool: 'fhir_read', exposed_ids: [`Patient/${p}`] })] : steps0;
    const sr = { resourceType: 'ServiceRequest', id: 'sr-t0001', status: 'active', intent: 'order', code: { coding: [{ system: 'urn:riverbend:orders', code: 'LAB-FIT-KIT' }] }, subject: { reference: `Patient/${p}` }, occurrenceDateTime: '2026-10-26' };
    const final = { has: () => true, status: () => 'active', get: (t: string, id: string) => (t === 'ServiceRequest' && id === 'sr-t0001' ? sr : undefined), all: (t?: string) => (t === undefined || t === 'ServiceRequest' ? [sr] : []) } as unknown as GateCtx['final'];
    const steps = [...before, step(before.length + 1, 9, { tool: 'order_service', written_ids: ['ServiceRequest/sr-t0001'] })];
    return { ...NOTHING, final, steps, exposedAt: (id) => steps.find((s) => s.exposed_ids.includes(id))?.n ?? null, writes: () => ['ServiceRequest/sr-t0001'] };
  };
  const item = (gate: string, ctx: GateCtx, p: string) => gates.find((g) => g.id === gate)!.fn(ctx).items!.find((i) => i.item === `Patient/${p}`)!;
  // R31: the searches that show every screening kind absent for one member: all procedures since
  // 2017 and every stool code since 2024, each one whole page.
  const procedures = (p: string): StepSearch => ({ type: 'Procedure', patient: `Patient/${p}`, date_ge: '2017-01-01', whole: true });
  const stool = (p: string): StepSearch => ({ type: 'Observation', patient: `Patient/${p}`, code: `${FOBT},77354-9,77353-1`, date_ge: '2024-01-01', whole: true });
  const screened = (p: string, turn = 1): Step[] => [step(1, turn, { search: procedures(p) }), step(2, turn, { search: stool(p) })];
  it("counts D1's order as reviewed after whole searches of her procedures and stool tests that cover every screening window", () => {
    const ctx = orderFor('pt-0022', screened('pt-0022'));
    expect(item('fit_orders', ctx, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', ctx, 'pt-0022').met).toBe(true);
  });
  // Ruling R33 (verifier-W1T-190-r2-falsepass N2): §2's age band decides order against no contact,
  // so complete searches without the Patient do not review the gap; a search_patients row, which
  // shows the birth date, does.
  it("but not without her Patient: retrieval, naming the birth date; a search_patients row counts", () => {
    const ctx = orderFor('pt-0022', screened('pt-0022'), false);
    expect(item('fit_orders', ctx, 'pt-0022')).toMatchObject({ met: false, why: expect.stringContaining('and Patient/pt-0022, the birth date') });
    const row = orderFor('pt-0022', [...screened('pt-0022'), step(3, 1, { tool: 'search_patients', exposed_ids: ['Patient/pt-0022'] })], false);
    expect(item('fit_orders', row, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', row, 'pt-0022').met).toBe(true);
    const late = orderFor('pt-0022', [...screened('pt-0022'), step(3, 9, { tool: 'fhir_read', exposed_ids: ['Patient/pt-0022'] })], false);
    expect(item('gap_seen_before_order', late, 'pt-0022').met).toBe(false);
  });
  it("H2's Patient is all-of beside his any-of residence records: one record and no Patient fails", () => {
    const [obs] = at('pt-0035').decisive;
    expect(item('fit_orders', orderFor('pt-0035', [...screened('pt-0035'), step(3, 1, { exposed_ids: [obs!] })], false), 'pt-0035').met).toBe(false);
    expect(item('fit_orders', orderFor('pt-0035', [...screened('pt-0035'), step(3, 1, { exposed_ids: ['Patient/pt-0035'] })], false), 'pt-0035').met).toBe(false);
  });
  it('but not after her FOBT window alone, nor after seeing her trap record: retrieval, and the why names the searches it needed (R31)', () => {
    const [trap] = d1.decisive;
    for (const before of [[step(1, 1, { search: base })], [step(1, 1, { exposed_ids: [trap!] })], [step(1, 1, { search: procedures('pt-0022') }), step(2, 1, { search: base })]]) {
      expect(item('fit_orders', orderFor('pt-0022', before), 'pt-0022')).toMatchObject({ met: false, why: expect.stringContaining("a complete search of the patient's Procedure from 2017-01-01, Procedure from 2022-01-01, Observation from 2026-01-01, Observation from 2024-01-01 records") });
    }
  });
  it('nor after a stool search that leaves January out', () => {
    const ctx = orderFor('pt-0022', [step(1, 1, { search: procedures('pt-0022') }), step(2, 1, { search: { ...stool('pt-0022'), date_ge: '2026-02-01' } })]);
    expect(item('fit_orders', ctx, 'pt-0022').met).toBe(false);
  });
  it('and covering searches in the same answer as the order are not seen before it (process)', () => {
    const ctx = orderFor('pt-0022', screened('pt-0022', 9));
    expect(item('fit_orders', ctx, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', ctx, 'pt-0022').met).toBe(false);
  });
  it('counts the last of the searches: one in an earlier turn and one in the order\'s answer is process', () => {
    const ctx = orderFor('pt-0022', [step(1, 1, { search: procedures('pt-0022') }), step(2, 9, { search: stool('pt-0022') })]);
    expect(item('fit_orders', ctx, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', ctx, 'pt-0022').met).toBe(false);
  });
  it('counts D1\'s order as reviewed after complete clinic-wide searches, and D2\'s after a run of pages to the end (R27)', () => {
    const clinic = orderFor('pt-0022', [step(1, 1, { search: { ...procedures('pt-0022'), patient: undefined } as unknown as StepSearch }), step(2, 1, { search: apply({ patient: null, code: `${FOBT},77354-9,77353-1`, date_ge: '2024-01-01' }) })]);
    expect(item('fit_orders', clinic, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', clinic, 'pt-0022').met).toBe(true);
    const all = (offset: number | undefined, next: number | undefined): StepSearch => apply({ patient: 'Patient/pt-0018', code: null, date_ge: '2024-01-01', offset: offset ?? null, next_offset: next ?? null, whole: false });
    const proc = (n: number) => step(n, 1, { search: procedures('pt-0018') });
    const paged = orderFor('pt-0018', [step(1, 1, { search: all(undefined, 28) }), step(2, 2, { search: all(28, 56) }), step(3, 3, { search: all(56, undefined) }), proc(4)]);
    expect(item('fit_orders', paged, 'pt-0018').met).toBe(true);
    expect(item('gap_seen_before_order', paged, 'pt-0018').met).toBe(true);
    const stopped = orderFor('pt-0018', [step(1, 1, { search: all(undefined, 28) }), step(2, 2, { search: all(28, 56) }), proc(3)]);
    expect(item('fit_orders', stopped, 'pt-0018')).toMatchObject({ met: false });
  });
  it('needs C1\'s care episodes, B2\'s total colectomy and documents, and G2\'s conditions and medications besides the screening kinds (R31)', () => {
    const undated = (p: string, type: string, more: Partial<StepSearch> = {}): Step => step(3, 1, { search: { type, patient: `Patient/${p}`, whole: true, ...more } as StepSearch });
    const cases: Array<[string, Step[]]> = [
      ['pt-0011', [undated('pt-0011', 'EpisodeOfCare', { date_ge: '2026-01-01' })]],
      ['pt-0036', [undated('pt-0036', 'Procedure'), { ...undated('pt-0036', 'DocumentReference'), n: 4, seq: 4 }]],
      ['pt-0019', [undated('pt-0019', 'Condition'), { ...undated('pt-0019', 'MedicationRequest'), n: 4, seq: 4 }]],
    ];
    for (const [p, extra] of cases) {
      expect(item('fit_orders', orderFor(p, screened(p)), p).met, `${p} screening only`).toBe(false);
      expect(item('fit_orders', orderFor(p, [...screened(p), ...extra]), p).met, `${p} with its exclusion`).toBe(true);
      for (const [i] of extra.entries()) expect(item('fit_orders', orderFor(p, [...screened(p), ...extra.filter((_, j) => j !== i)]), p).met, `${p} without search ${i}`).toBe(false);
    }
  });
  // verifier-W1T-190-r2-clinical N2 (R3, R16, R34): §7's notes search shows B2's notes free of a
  // total colectomy when its query holds a colectomy word, it covers him (his or every patient's
  // notes), and no type or date filter could hide a note.
  it.each<[string, Partial<StepNotes>, boolean]>([
    ["'colectomy' over his notes", { query: 'colectomy', patient: 'Patient/pt-0036' }, true],
    ["'Proctocolectomy' over his notes", { query: 'Proctocolectomy', patient: 'Patient/pt-0036' }, true],
    ["'total colectomy' over every patient's notes", { query: 'total colectomy' }, true],
    ["'colon' only", { query: 'colon', patient: 'Patient/pt-0036' }, false],
    ["'colectomies' (no stemming)", { query: 'colectomies', patient: 'Patient/pt-0036' }, false],
    ["'diverticulitis'", { query: 'diverticulitis', patient: 'Patient/pt-0036' }, false],
    ["'colectomy' over another patient's notes", { query: 'colectomy', patient: 'Patient/pt-0021' }, false],
    ["'colectomy' from 2025", { query: 'colectomy', patient: 'Patient/pt-0036', date_ge: '2025-01-01' }, false],
    ["'colectomy' up to today", { query: 'colectomy', patient: 'Patient/pt-0036', date_le: '2026-10-23' }, false],
    ["'colectomy' in one note type", { query: 'colectomy', patient: 'Patient/pt-0036', type: 'operative' }, false],
  ])('B2 notes search %s: covers his total colectomy note kind %s', (_label, notes, want) => {
    const a = kind('pt-0036', 'DocumentReference', null);
    expect(notesCover({ query: '', whole: true, ...notes } as StepNotes, 'Patient/pt-0036', a)).toBe(want);
    const p = 'pt-0036';
    const procs = step(3, 1, { search: { type: 'Procedure', patient: `Patient/${p}`, whole: true } });
    expect(item('fit_orders', orderFor(p, [...screened(p), procs, step(4, 1, { tool: 'search_notes', notes: { query: '', whole: true, ...notes } as StepNotes })]), p).met).toBe(want);
  });
  it('a notes search counts only whole, or as a run of pages to the end, and never for a kind with no words', () => {
    const a = kind('pt-0036', 'DocumentReference', null);
    const n = (k: number, more: Partial<StepNotes>): Step => step(k, k, { tool: 'search_notes', notes: { query: 'colectomy', whole: false, ...more } });
    expect(notesShownAt([n(1, { next_offset: 10 })], 'Patient/pt-0036', a)).toBe(null);
    expect(notesShownAt([n(1, { next_offset: 10 }), n(2, { offset: 10 })], 'Patient/pt-0036', a)).toBe(2);
    expect(notesShownAt([n(1, { next_offset: 10 }), n(2, { offset: 10, query: 'proctocolectomy' })], 'Patient/pt-0036', a)).toBe(null);
    expect(notesShownAt([n(1, { whole: true })], 'Patient/pt-0036', kind('pt-0036', 'Procedure', null))).toBe(null);
  });
  it("counts H2's order as reviewed after the screening searches and any one of his three records, and not after the searches alone", () => {
    const [obs, doc, enc] = at('pt-0035').decisive;
    for (const seen of [step(3, 1, { exposed_ids: [enc!] }), step(3, 1, { tool: 'fhir_read', exposed_ids: [doc!] }), step(3, 1, { exposed_ids: [obs!] })]) {
      const ctx = orderFor('pt-0035', [...screened('pt-0035'), seen]);
      expect(item('fit_orders', ctx, 'pt-0035').met).toBe(true);
      expect(item('gap_seen_before_order', ctx, 'pt-0035').met).toBe(true);
      expect(item('fit_orders', orderFor('pt-0035', [seen]), 'pt-0035').met).toBe(false);
    }
    expect(item('fit_orders', orderFor('pt-0035', screened('pt-0035')), 'pt-0035').met).toBe(false);
    expect(item('fit_orders', orderFor('pt-0035', [...screened('pt-0035'), step(3, 1, { referenced_ids: [doc!] })]), 'pt-0035')).toMatchObject({ met: false, why: expect.stringContaining('any of') });
  });
  // Ruling R29 (builder-252): a cut snippet of the discharge summary that shows its atoms stands
  // for reading it; one cut before them does not. tests/phrases.test.ts sweeps the real snippets.
  it("counts H2's discharge summary as seen from a snippet that shows 'discharged home', and not from one cut before it", () => {
    const [, doc] = at('pt-0035').decisive;
    const snip = (text: string) => [...screened('pt-0035'), step(3, 1, { tool: 'search_notes', referenced_ids: [doc!], shown: { [doc!]: text } })];
    const shown = orderFor('pt-0035', snip('…Pain controlled with acetaminophen. Disposition: discharged home with daughter, who is staying…'));
    expect(item('fit_orders', shown, 'pt-0035').met).toBe(true);
    expect(item('gap_seen_before_order', shown, 'pt-0035').met).toBe(true);
    for (const text of ['…Admitted: 05/03/2026, from St. Brigid Regional Discharged: 05/24/2026 Level of care: skilled nursing facility…', '…patient discharged homebound…', '…Disposition: discharged…']) {
      expect(item('fit_orders', orderFor('pt-0035', snip(text)), 'pt-0035'), text).toMatchObject({ met: false, why: expect.stringContaining('any of') });
    }
  });
  // R32: a member who needs no contact is reviewed by seeing their decisive records, by the same
  // rules (B1's operative note by a read or a snippet showing its atoms); a gap member's item here
  // is always met.
  it("no_contact_reviewed: met for B1 after her operative note's snippet shows 'total proctocolectomy', not after one that misses it", () => {
    const [note] = at('pt-0021').decisive;
    const ctxOf = (text: string): GateCtx => ({ ...NOTHING, steps: [step(1, 1, { tool: 'search_notes', referenced_ids: [note!], shown: { [note!]: text } })] });
    expect(item('no_contact_reviewed', ctxOf('…Procedure: total proctocolectomy with end ileostomy…'), 'pt-0021').met).toBe(true);
    expect(item('no_contact_reviewed', ctxOf('…Operative report, scanned outside record…'), 'pt-0021').met).toBe(false);
    for (const p of ORDERED) expect(item('no_contact_reviewed', NOTHING, p.slice(8)).met, p).toBe(true);
  });
  // R21, R16 (builder-265 audit: probe-1 crc-care-gap/0 and /1 read H1's Patient and listed his
  // encounters, never his housing status): any one of his residence records reviews him, beside
  // his Patient for the age (R33). A read of his Patient shows his address at the care center; a
  // search_patients row shows his age only (R22), so with no other record it reviews nothing.
  it('no_contact_reviewed: H1 after any one of his housing status, a facility visit or a read of his Patient, each with his age', () => {
    const [obs, feb, jul, pt] = at('pt-0034').decisive;
    const row = step(9, 1, { tool: 'search_patients', exposed_ids: [pt!] });
    const ctxOf = (...steps: Step[]): GateCtx => ({ ...NOTHING, steps });
    for (const seen of [obs!, feb!, jul!]) expect(item('no_contact_reviewed', ctxOf(step(1, 1, { exposed_ids: [seen] }), row), 'pt-0034').met, seen).toBe(true);
    expect(item('no_contact_reviewed', ctxOf(step(1, 1, { tool: 'fhir_read', exposed_ids: [pt!] })), 'pt-0034').met).toBe(true);
    expect(item('no_contact_reviewed', ctxOf(step(1, 1, { search: { type: 'Patient', whole: true }, exposed_ids: [pt!] })), 'pt-0034').met).toBe(true);
    // His age only, from a row: no residence record.
    expect(item('no_contact_reviewed', ctxOf(row), 'pt-0034')).toMatchObject({ met: false, why: expect.stringContaining("Patient/pt-0034's address (a read)") });
    // A residence record without his age: retrieval (R33).
    expect(item('no_contact_reviewed', ctxOf(step(1, 1, { exposed_ids: [obs!] })), 'pt-0034').met).toBe(false);
    // Another patient's read is not his.
    expect(item('no_contact_reviewed', ctxOf(step(1, 1, { tool: 'fhir_read', exposed_ids: ['Patient/pt-0035'] }), row), 'pt-0034').met).toBe(false);
  });
  // R31: attribution counts a gap's decisive id as seen only by the gate's rule, not by exposure, so
  // a gap whose trap record was exposed and whose absences never shown is labelled retrieval.
  it('declares an empty decisive phrase for every gap decisive id on the gates that gate gaps, and none on the others', () => {
    const gapIds = expected.items.filter((x) => x.absences.length > 0).flatMap((x) => x.decisive);
    for (const g of ['fit_orders', 'outreach_messages', 'gap_seen_before_order']) expect(gates.find((x) => x.id === g)!.decisive_phrases, g).toEqual(Object.fromEntries(gapIds.map((d) => [d, ''])));
    for (const g of ['nothing_for_others', 'no_contact_reviewed']) expect(gates.find((x) => x.id === g)!.decisive_phrases, g).toBeUndefined();
  });
  it('declares the same rules to attribution (seen_at) on every gate over panel members, for every decisive id of a member with an absence, any-of evidence or atoms', () => {
    const ids = expected.items.filter((x) => x.absences.length > 0 || x.evidence === 'any' || Object.keys(x.atoms).length > 0).flatMap((x) => x.decisive);
    for (const g of ['fit_orders', 'outreach_messages', 'gap_seen_before_order', 'nothing_for_others', 'no_contact_reviewed']) expect(Object.keys(gates.find((x) => x.id === g)!.seen_at ?? {}).sort(), g).toEqual([...ids].sort());
    expect(Object.keys(expected.items.find((x) => x.patient === 'Patient/pt-0021')!.atoms)).toEqual(expected.items.find((x) => x.patient === 'Patient/pt-0021')!.decisive);
  });
});
