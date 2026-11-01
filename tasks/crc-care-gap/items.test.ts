// T3's gates on the per-item helper (plan-amendment-worklist W1-1): each gate checks every panel
// member of expected.items on its own and records the member's result, so the trial page says which
// patient failed and why. The matrix (pnpm cli matrix --task crc-care-gap) shows the gates decide as
// before; here, the item records of a trial that did nothing, and the review rules of the open gaps
// the mid-trial events deliver (expected.ts DELIVERED; tests/grader.ts EVENTS).
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx, Step, StepNotes, StepSearch } from '../../packages/grader/check.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import { CLASSES, classOf, DELIVERED, expected, ORDERED, SCREENING, type Absence } from './expected.ts';
import { ref } from './ids.ts';
import { absenceShownAt, checks, filtersCover, notesCover, notesShownAt } from './tests/grader.ts';

const gates = checks.filter((c): c is GateCheck => c.kind === 'gate');
const BASE_GATES = ['fit_orders', 'outreach_messages', 'nothing_for_others', 'gap_seen_before_order', 'no_contact_reviewed'];
const PATIENTS = expected.items.map((x) => x.patient);
const empty = { has: () => false, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
const NOTHING: GateCtx = { initial: empty, final: empty, diff: { created: [], updated: [], deleted: [] } as never, steps: [], exposedAt: () => null, writes: () => [] };
const run = (id: string) => gates.find((g) => g.id === id)!.fn(NOTHING);

describe('T3 worklist after the PW4-E3 list cut', () => {
  // n = 4 cannot hold one member of each of the six probe classes and the filler (coordinator,
  // builder-283 design check); the four kept classes each keep one member.
  it('holds one member of each of four probe classes, each member once', () => {
    expect(Object.keys(CLASSES).sort()).toEqual(['collection_vs_report_date', 'colonoscopy_never_done', 'frailty_advanced_illness', 'hospice_revoked']);
    expect(Object.values(CLASSES).flat().sort()).toEqual(PATIENTS.slice().sort());
    expect(expected.items.map((x) => classOf(x.patient)).filter((c) => c === undefined)).toEqual([]);
  });

  it('no member needs an order or a message at base; every delivered member needs both', () => {
    expect(ORDERED).toEqual([]);
    expect(expected.items.filter((x) => x.order !== false || x.message !== false).map((x) => x.patient)).toEqual([]);
    for (const [spec, x] of Object.entries(DELIVERED)) expect([spec, x.status, x.order, x.message]).toEqual([spec, 'gap', true, true]);
  });
});

// Ruling R1 (reports/w1-probe-rulings.md): a member's decisive ids are only the records that decide
// the member's action: the frailty entry and dementia medication (and, R33, the Patient, since the
// frailty clause holds only at 66 or older), the hospice episode, and the stool test that is up to
// date.
describe('T3 decisive ids (R1)', () => {
  it('names only the deciding records for each member', () => {
    expect(Object.fromEntries(expected.items.map((x) => [x.patient, x.decisive]))).toEqual({
      'Patient/pt-0009': [ref('Condition/cond-t3-6027'), ref('MedicationRequest/mr-t3-3318'), 'Patient/pt-0009'],
      'Patient/pt-0020': [ref('EpisodeOfCare/eoc-t3-8215')],
      'Patient/pt-0022': [ref('Observation/obs-t3-3906')],
      'Patient/pt-0024': [ref('Observation/obs-t3-1279')],
    });
  });
});

describe('T3 gates over expected.items', () => {
  it('every base gate records one result per panel member, keyed by patient; the two that see writes outside the panel record that too', () => {
    for (const id of BASE_GATES) {
      const keys = run(id).items?.map((i) => i.item);
      expect(keys, id).toEqual(['fit_orders', 'nothing_for_others'].includes(id) ? [...PATIENTS, OUTSIDE] : PATIENTS);
    }
  });

  it('each base gate\'s decisive ids are its members\'', () => {
    const decisive = [...new Set(expected.items.flatMap((x) => x.decisive))];
    expect(gates.filter((g) => BASE_GATES.includes(g.id)).map((g) => [g.id, g.decisive_ids])).toEqual([
      ['fit_orders', decisive], ['outreach_messages', decisive], ['nothing_for_others', decisive], ['gap_seen_before_order', decisive], ['no_contact_reviewed', decisive],
    ]);
  });

  it('a trial that does nothing passes fit_orders, outreach_messages, nothing_for_others and gap_seen_before_order', () => {
    for (const id of ['fit_orders', 'outreach_messages', 'nothing_for_others', 'gap_seen_before_order']) expect(run(id).met, id).toBe(true);
  });

  // Ruling R32 (verifier-W1T-190-falsepass F1): the null agent passes no item. A member who needs no
  // contact fails no_contact_reviewed until their deciding records are seen.
  it('and fails no_contact_reviewed on every member, each naming what decides them', () => {
    const v = run('no_contact_reviewed');
    expect(v.items!.filter((i) => !i.met).map((i) => [i.item, i.ids])).toEqual(expected.items.map((x) => [x.patient, x.decisive]));
    expect(v.evidence).toEqual({ unreviewed: PATIENTS });
    expect(v.items!.find((i) => i.item === 'Patient/pt-0020')!.why).toBe(`needs no order or message (excluded: hospice), but the trial never saw ${ref('EpisodeOfCare/eoc-t3-8215')}, what decides that`);
  });
  it('a trial that never orders or messages any member still fails some gate on every member (R32)', () => {
    const failed = new Set(gates.flatMap((g) => g.fn(NOTHING).items?.filter((i) => !i.met).map((i) => i.item) ?? []));
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
  const sr = (id: string, code: [string, string]) => ({ resourceType: 'ServiceRequest', id, status: 'active', intent: 'order', code: { coding: [{ system: code[0], code: code[1] }] }, subject: { reference: 'Patient/pt-0020' } });
  const ctxWith = (r: Record<string, unknown>): GateCtx => ({ ...NOTHING, final: store([r]), writes: () => [`ServiceRequest/${r.id as string}`] });
  const gate = gates.find((g) => g.id === 'nothing_for_others')!;
  it('charges a FIT order for an excluded member', () => {
    expect(gate.fn(ctxWith(sr('sr-t0001', ['urn:riverbend:orders', 'LAB-FIT-KIT']))).met).toBe(false);
  });
  it('does not charge an order of another kind for her', () => {
    expect(gate.fn(ctxWith(sr('sr-t0001', ['http://loinc.org', '2160-0']))).met).toBe(true);
  });
});

// Rulings R20, R27, R31 and R36: an open gap rests on absences. Since the PW4-E3 cut every open gap is
// one an amend event delivers (expected.ts DELIVERED), reviewed by a complete search, covering its
// window, of every screening kind §3 counts, never by its trap record alone. The helpers below are
// what the event gates' review rule (tests/grader.ts deliveredSeenAt) reads.
describe('absence rules of a delivered gap (R20, R27, R31, R36)', () => {
  it('lists the four screening kinds, with every code, category and status the policy counts, for every delivered gap', () => {
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
    expect(SCREENING).toEqual(screening);
    for (const x of Object.values(DELIVERED)) expect(x.absences, x.patient).toEqual(screening);
    expect(expected.items.filter((x) => x.absences.length > 0)).toEqual([]);
  });

  const d1 = DELIVERED['crc-b2']!;
  const a1 = DELIVERED['crc-o1']!;
  const kindOf = (x: typeof d1, type: string, from: string | null) => x.absences.find((a) => a.type === type && a.from === from)!;
  const fobt = kindOf(d1, 'Observation', '2026-01-01');
  const FOBT = '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9';
  const base: StepSearch = { type: 'Observation', patient: 'Patient/pt-0022', code: FOBT, date_ge: '2026-01-01', whole: true };
  // A change sets each key it names; null removes the key.
  type Change = { [K in keyof StepSearch]?: StepSearch[K] | null };
  const apply = (change: Change, from: StepSearch = base): StepSearch => Object.fromEntries(Object.entries({ ...from, ...change }).filter(([, v]) => v !== null)) as unknown as StepSearch;
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
  // The kinds the cut took off the list (a hospice episode, a total colectomy coded or in a note, an
  // advanced illness diagnosis, a dementia medication) as the probe panel declared them: the filter
  // rules for a status, an undated kind and a code list stay tested on them.
  const HOSPICE: Absence = { type: 'EpisodeOfCare', from: '2026-01-01', codes: [], categories: [], statuses: ['planned', 'active', 'onhold', 'finished'] };
  const COLECTOMY_CODED: Absence = { type: 'Procedure', from: null, codes: ['http://snomed.info/sct|26390003'], categories: [], statuses: ['completed'] };
  const COLECTOMY_NOTE: Absence = { type: 'DocumentReference', from: null, codes: [], categories: [], statuses: ['current', 'superseded'], words: ['colectomy', 'proctocolectomy'] };
  const ADVANCED: Absence = { type: 'Condition', from: null, codes: ['84114007', '13645005', '185086009', '52448006', '26929004', '433146000', '19943007', '128462008', '363418001'].map((c) => `http://snomed.info/sct|${c}`), categories: [], statuses: [] };
  const DEMENTIA: Absence = { type: 'MedicationRequest', from: null, codes: [], categories: [], statuses: ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'] };
  const ANY = 'Patient/pt-0020';
  it.each<[string, string, Absence, Change, boolean]>([
    ['hospice: planned, active, onhold and finished', ANY, HOSPICE, { status: 'planned,active,onhold,finished' }, true],
    ['hospice: every episode status but entered-in-error', ANY, HOSPICE, { status: 'planned,waitlist,active,onhold,finished,cancelled' }, true],
    ['hospice: active, onhold and finished (no planned)', ANY, HOSPICE, { status: 'active,onhold,finished' }, false],
    ['hospice: no status filter', ANY, HOSPICE, {}, true],
    ['hospice: from the clinic\'s local midnight (-05:00)', ANY, HOSPICE, { date_ge: '2026-01-01T00:00:00-05:00' }, true],
    ['hospice: from one minute after the clinic\'s local midnight', ANY, HOSPICE, { date_ge: '2026-01-01T00:01:00-05:00' }, false],
    ['D1 sDNA: from the clinic\'s local midnight (-05:00)', d1.patient, kindOf(d1, 'Observation', '2024-01-01'), { code: '77354-9,77353-1', date_ge: '2024-01-01T00:00:00-05:00' }, true],
    ['D1 sDNA: from 06:00Z on the window start', d1.patient, kindOf(d1, 'Observation', '2024-01-01'), { code: '77354-9,77353-1', date_ge: '2024-01-01T06:00:00Z' }, false],
    ['D1 sDNA: both codes', d1.patient, kindOf(d1, 'Observation', '2024-01-01'), { code: '77354-9,77353-1' }, true],
    ['D1 sDNA: one code', d1.patient, kindOf(d1, 'Observation', '2024-01-01'), { code: '77354-9' }, false],
    ['A1: from the clinic\'s local midnight (05:00Z)', a1.patient, kindOf(a1, 'Procedure', '2017-01-01'), { code: '73761001', date_ge: '2017-01-01T05:00:00Z' }, true],
    ['A1: from one second after the clinic\'s local midnight', a1.patient, kindOf(a1, 'Procedure', '2017-01-01'), { code: '73761001', date_ge: '2017-01-01T05:00:01Z' }, false],
    ['A1: the colonoscopy code, status completed', a1.patient, kindOf(a1, 'Procedure', '2017-01-01'), { code: 'http://snomed.info/sct|73761001', status: 'completed' }, true],
    ['A1: any category', a1.patient, kindOf(a1, 'Procedure', '2017-01-01'), { category: 'surgical' }, false],
    ['A1: flexible sigmoidoscopy and CT colonography from 2022', a1.patient, kindOf(a1, 'Procedure', '2022-01-01'), { code: '44441009,418714002' }, true],
    ['A1: CT colonography only', a1.patient, kindOf(a1, 'Procedure', '2022-01-01'), { code: '418714002' }, false],
    ['A1: every procedure from 2017, for the 2022 window', a1.patient, kindOf(a1, 'Procedure', '2022-01-01'), { date_ge: '2017-01-01' }, true],
    ['A1: every procedure from 2023, for the 2022 window', a1.patient, kindOf(a1, 'Procedure', '2022-01-01'), { date_ge: '2023-01-01' }, false],
    // A kind with no window start takes no date filter at all.
    ['total colectomy, undated', ANY, COLECTOMY_CODED, { code: '26390003', date_ge: null }, true],
    ['total colectomy from 1900', ANY, COLECTOMY_CODED, { code: '26390003', date_ge: '1900-01-01' }, false],
    ['every document, undated', ANY, COLECTOMY_NOTE, { date_ge: null }, true],
    ['current documents only', ANY, COLECTOMY_NOTE, { date_ge: null, status: 'current' }, false],
    ['every advanced illness code', ANY, ADVANCED, { date_ge: null, code: ADVANCED.codes.map((c) => c.split('|')[1]).join(',') }, true],
    ['heart failure and COPD only', ANY, ADVANCED, { date_ge: null, code: '84114007,13645005' }, false],
    ['every medication order', ANY, DEMENTIA, { date_ge: null }, true],
    ['active medication orders only', ANY, DEMENTIA, { date_ge: null, status: 'active' }, false],
  ])('%s: filters cover %s', (_label, patient, a, change, want) => {
    const s = apply(change, { type: a.type, patient, ...(a.from === null ? {} : { date_ge: a.from }), whole: true } as StepSearch);
    expect(filtersCover(s, patient, a)).toBe(want);
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
    const ep = (n: number, offset: number | undefined, next: number | undefined, earliest: number): Step =>
      step(n, n, { search: { type: 'EpisodeOfCare', patient: ANY, sort: '-date', span: [earliest, NOW - 1], whole: false, ...(offset !== undefined ? { offset } : {}), ...(next !== undefined ? { next_offset: next } : {}) } });
    expect(absenceShownAt([ep(1, undefined, 1, OPENS - 1)], ANY, HOSPICE)).toBe(null);
    expect(absenceShownAt([ep(1, undefined, 1, OPENS - 1), ep(2, 1, undefined, OPENS - 2)], ANY, HOSPICE)).toBe(2);
  });
  // §7's notes search shows a note kind absent when its query holds one of the kind's words, it
  // covers the patient, and no type or date filter could hide a note.
  it.each<[string, Partial<StepNotes>, boolean]>([
    ["'colectomy' over her notes", { query: 'colectomy', patient: ANY }, true],
    ["'total colectomy' over every patient's notes", { query: 'total colectomy' }, true],
    ["'colon' only", { query: 'colon', patient: ANY }, false],
    ["'colectomies' (no stemming)", { query: 'colectomies', patient: ANY }, false],
    ["'colectomy' over another patient's notes", { query: 'colectomy', patient: 'Patient/pt-0021' }, false],
    ["'colectomy' from 2025", { query: 'colectomy', patient: ANY, date_ge: '2025-01-01' }, false],
    ["'colectomy' in one note type", { query: 'colectomy', patient: ANY, type: 'operative' }, false],
  ])('notes search %s: covers a note kind %s', (_label, notes, want) => {
    expect(notesCover({ query: '', whole: true, ...notes } as StepNotes, ANY, COLECTOMY_NOTE)).toBe(want);
  });
  it('a notes search counts only whole, or as a run of pages to the end, and never for a kind with no words', () => {
    const n = (k: number, more: Partial<StepNotes>): Step => step(k, k, { tool: 'search_notes', notes: { query: 'colectomy', whole: false, ...more } });
    expect(notesShownAt([n(1, { next_offset: 10 })], ANY, COLECTOMY_NOTE)).toBe(null);
    expect(notesShownAt([n(1, { next_offset: 10 }), n(2, { offset: 10 })], ANY, COLECTOMY_NOTE)).toBe(2);
    expect(notesShownAt([n(1, { next_offset: 10 }), n(2, { offset: 10, query: 'proctocolectomy' })], ANY, COLECTOMY_NOTE)).toBe(null);
    expect(notesShownAt([n(1, { whole: true })], ANY, COLECTOMY_CODED)).toBe(null);
  });
});

// The event gates' review of a delivered gap (tests/grader.ts deliveredSeenAt, amendExpectation):
// once an amend event arrived, its member is reviewed when the trial has read the arrival after it
// came (a read of any record it put; for the faxed notice also a snippet that shows its atoms, R29),
// has shown every screening kind absent by complete searches, and has seen the Patient (R33). Never
// reviewed is event_seen, retrieval; an order written before the review is amended, process.
describe('a delivered gap\'s review (event_seen, amended)', () => {
  const step = (n: number, turn: number, more: Partial<Step>): Step => ({ n, seq: n, turn, tool: 'fhir_search', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...more });
  const FIT = ref('Observation/obs-t3-3906');
  const SDNA = ref('Observation/obs-t3-1279');
  const FRAILTY = ref('Condition/cond-t3-6027');
  const NOTICE = 'DocumentReference/doc-e3-6804';
  const ARRIVAL = { 'crc-b2': [FIT, 'Task/inbox-a0001'], 'crc-o1': [NOTICE, SDNA, 'Task/inbox-a0001'], 'crc-b1': ['Communication/comm-e3-5521', FRAILTY, 'Task/inbox-a0001'] } as Record<string, string[]>;
  const TRIGGER = { 'crc-b2': FIT, 'crc-o1': SDNA, 'crc-b1': FRAILTY } as Record<string, string>;
  const STOOL = '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9,77354-9,77353-1';
  const procedures = (p: string): StepSearch => ({ type: 'Procedure', patient: `Patient/${p}`, date_ge: '2017-01-01', whole: true });
  const stool = (p: string): StepSearch => ({ type: 'Observation', patient: `Patient/${p}`, code: STOOL, date_ge: '2024-01-01', whole: true });
  // Step 1 exposes the trigger and brings the arrival; the review steps follow; then, in turn 9, the
  // FIT order and its outreach message.
  const trial = (spec: string, review: (n0: number) => Step[]): GateCtx => {
    const p = DELIVERED[spec]!.patient;
    const first = step(1, 1, { exposed_ids: [TRIGGER[spec]!], arrivals: [{ spec, keys: ARRIVAL[spec]! }] });
    const middle = review(2);
    const n = middle.length + 2;
    const sr = { resourceType: 'ServiceRequest', id: 'sr-t0001', status: 'active', intent: 'order', code: { coding: [{ system: 'urn:riverbend:orders', code: 'LAB-FIT-KIT' }] }, subject: { reference: p }, occurrenceDateTime: '2026-10-26' };
    const comm = { resourceType: 'Communication', id: 'comm-t0002', status: 'completed', subject: { reference: p }, recipient: [{ reference: p }], about: [{ reference: 'ServiceRequest/sr-t0001' }] };
    const rs = [sr, comm] as Array<Record<string, unknown>>;
    const final = { has: () => true, status: () => 'active', get: (t: string, id: string) => rs.find((r) => r.resourceType === t && r.id === id), all: (t?: string) => rs.filter((r) => t === undefined || r.resourceType === t) } as unknown as GateCtx['final'];
    const steps = [first, ...middle, step(n, 9, { tool: 'order_service', written_ids: ['ServiceRequest/sr-t0001'] }), step(n + 1, 9, { tool: 'send_message', written_ids: ['Communication/comm-t0002'] })];
    return { ...NOTHING, final, steps, exposedAt: (id) => steps.find((s) => s.exposed_ids.includes(id))?.n ?? null, writes: () => ['ServiceRequest/sr-t0001', 'Communication/comm-t0002'] };
  };
  const item = (gate: string, ctx: GateCtx, p: string) => gates.find((g) => g.id === gate)!.fn(ctx).items!.find((i) => i.item === p)!;
  const D1 = 'Patient/pt-0022';
  const screened = (n: number, turn = 2, p = 'pt-0022'): Step[] => [step(n, turn, { search: procedures(p) }), step(n + 1, turn, { search: stool(p) }), step(n + 2, turn, { tool: 'fhir_read', exposed_ids: [`Patient/${p}`] })];
  const readArrival = (n: number, id = FIT, turn = 3): Step => step(n, turn, { tool: 'fhir_read', exposed_ids: [id] });

  it('reviewed: the arrival read after it came, both screening searches whole, the Patient read; the order after all of them', () => {
    const ctx = trial('crc-b2', (n) => [...screened(n), readArrival(n + 3)]);
    expect(item('event_seen', ctx, D1).met).toBe(true);
    expect(item('amended', ctx, D1).met).toBe(true);
    // The base gates leave the delivered member to the event gates.
    for (const id of BASE_GATES) expect(item(id, ctx, D1).met, id).toBe(true);
  });
  it('the screening searches may come before the arrival; the arrival must be read after it', () => {
    const before = trial('crc-b2', (n) => [readArrival(n)]);
    const searched = { ...before, steps: [...screened(0, 0).map((s, i) => ({ ...s, n: -3 + i, seq: -3 + i })), ...before.steps] };
    expect(item('event_seen', searched, D1).met).toBe(true);
    expect(item('event_seen', trial('crc-b2', (n) => screened(n)), D1).met).toBe(false);
  });
  it('not without the Patient (R33); a search_patients row counts', () => {
    const noPatient = trial('crc-b2', (n) => [...screened(n).slice(0, 2), readArrival(n + 2)]);
    expect(item('event_seen', noPatient, D1)).toMatchObject({ met: false, event: 'crc-b2' });
    const row = trial('crc-b2', (n) => [...screened(n).slice(0, 2), step(n + 2, 2, { tool: 'search_patients', exposed_ids: [D1] }), readArrival(n + 3)]);
    expect(item('event_seen', row, D1).met).toBe(true);
  });
  it('not after the FOBT window alone, nor after a stool search that leaves January out (R31, R27)', () => {
    expect(item('event_seen', trial('crc-b2', (n) => [step(n, 2, { search: { ...stool('pt-0022'), code: '2335-8,29771-3,57905-2,58453-2,80372-6,27396-1,12503-9', date_ge: '2026-01-01' } }), step(n + 1, 2, { search: procedures('pt-0022') }), step(n + 2, 2, { tool: 'fhir_read', exposed_ids: [D1] }), readArrival(n + 3)]), D1).met).toBe(false);
    expect(item('event_seen', trial('crc-b2', (n) => [step(n, 2, { search: procedures('pt-0022') }), step(n + 1, 2, { search: { ...stool('pt-0022'), date_ge: '2026-02-01' } }), step(n + 2, 2, { tool: 'fhir_read', exposed_ids: [D1] }), readArrival(n + 3)]), D1).met).toBe(false);
  });
  it('complete clinic-wide searches review her too', () => {
    const clinic = trial('crc-b2', (n) => [step(n, 2, { search: { ...procedures('pt-0022'), patient: undefined } as unknown as StepSearch }), step(n + 1, 2, { search: { ...stool('pt-0022'), patient: undefined } as unknown as StepSearch }), step(n + 2, 2, { tool: 'fhir_read', exposed_ids: [D1] }), readArrival(n + 3)]);
    expect(item('event_seen', clinic, D1).met).toBe(true);
  });
  it('a review in the same answer as the order is not seen before it: amended, process', () => {
    const ctx = trial('crc-b2', (n) => [...screened(n), readArrival(n + 3, FIT, 9)]);
    expect(item('event_seen', ctx, D1).met).toBe(true);
    expect(item('amended', ctx, D1)).toMatchObject({ met: false, process: true, event: 'crc-b2' });
  });
  it('A1: the notice is seen by a read, by a read of the withdrawn result, or by a snippet that shows its atoms (R29), not by one that misses them', () => {
    const A1 = 'Patient/pt-0024';
    const snip = (text: string) => (n: number) => [...screened(n, 2, 'pt-0024'), step(n + 3, 3, { tool: 'search_notes', referenced_ids: [NOTICE], shown: { [NOTICE]: text } })];
    expect(item('event_seen', trial('crc-o1', (n) => [...screened(n, 2, 'pt-0024'), readArrival(n + 3, NOTICE)]), A1).met).toBe(true);
    expect(item('event_seen', trial('crc-o1', (n) => [...screened(n, 2, 'pt-0024'), readArrival(n + 3, SDNA)]), A1).met).toBe(true);
    expect(item('event_seen', trial('crc-o1', snip("…labelling error at our accessioning bench. The specimen reported under Ms. MacGyver's name belongs to another patient. The report…")), A1).met).toBe(true);
    expect(item('event_seen', trial('crc-o1', snip('…Notice of corrected report To: Maya Okafor, MD Patient: Delaine E. MacGyver…')), A1).met).toBe(false);
  });
  it('G1: the correction is seen by a read of the message or of the frailty entry now entered in error', () => {
    const G1 = 'Patient/pt-0009';
    const MR = ref('MedicationRequest/mr-t3-3318');
    for (const id of ['Communication/comm-e3-5521', FRAILTY]) expect(item('event_seen', trial('crc-b1', (n) => [...screened(n, 2, 'pt-0009'), step(n + 3, 2, { exposed_ids: [MR] }), readArrival(n + 4, id)]), G1).met, id).toBe(true);
  });
  // R38(a): a fired amend never excuses the base review. The delivered member is still reviewed by
  // her own base decisive records (G1: the frailty entry, the donepezil order and her Patient).
  it("R38: G1's review also needs her base decisive records: without the donepezil order, event_seen fails", () => {
    const G1 = 'Patient/pt-0009';
    const MR = ref('MedicationRequest/mr-t3-3318');
    const withMed = trial('crc-b1', (n) => [...screened(n, 2, 'pt-0009'), step(n + 3, 2, { exposed_ids: [MR] }), readArrival(n + 4, 'Communication/comm-e3-5521')]);
    const withoutMed = trial('crc-b1', (n) => [...screened(n, 2, 'pt-0009'), readArrival(n + 3, 'Communication/comm-e3-5521')]);
    expect(item('event_seen', withMed, G1).met).toBe(true);
    expect(item('event_seen', withoutMed, G1)).toMatchObject({ met: false, event: 'crc-b1' });
  });
  it('declares seen_at for each event focus on the event gates, and no gap rules on the base gates', () => {
    for (const g of BASE_GATES) {
      expect(gates.find((x) => x.id === g)!.decisive_phrases ?? {}, g).toEqual({});
      expect(gates.find((x) => x.id === g)!.seen_at ?? {}, g).toEqual({});
    }
    expect(Object.keys(gates.find((x) => x.id === 'event_seen')!.seen_at ?? {}).sort()).toEqual(['Communication/comm-e3-5521', 'DocumentReference/doc-e3-6804', 'DocumentReference/doc-e3-7390', FIT].sort());
  });
});
