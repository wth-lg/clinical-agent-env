// T3's gates on the per-item helper (plan-amendment-worklist W1-1): each gate checks every panel
// member of expected.items on its own and records the member's result, so the trial page says which
// patient failed and why. The matrix (pnpm cli matrix --task crc-care-gap) shows the gates decide as
// before; here, the item records of a trial that did nothing.
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx, Step, StepSearch } from '../../packages/grader/check.ts';
import { OUTSIDE } from '../../packages/grader/items.ts';
import { CLASSES, classOf, expected, FILLER, ORDERED } from './expected.ts';
import { ref } from './ids.ts';
import { absenceShownAt, checks, filtersCover } from './tests/grader.ts';

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
      'Patient/pt-0009': [ref('Condition/cond-t3-6027'), ref('MedicationRequest/mr-t3-3318')],
      'Patient/pt-0011': [ref('EpisodeOfCare/eoc-t3-3051')],
      'Patient/pt-0014': [ref('Appointment/appt-t3-5813')],
      'Patient/pt-0018': [ref('Observation/obs-t3-7342')],
      'Patient/pt-0019': [ref('MedicationRequest/mr-t3-6604')],
      'Patient/pt-0020': [ref('EpisodeOfCare/eoc-t3-8215')],
      'Patient/pt-0021': [ref('DocumentReference/doc-t3-1856')],
      'Patient/pt-0022': [ref('Observation/obs-t3-3906')],
      'Patient/pt-0024': [ref('ServiceRequest/sr-t3-4417')],
      'Patient/pt-0034': [ref('Observation/obs-t3-2465')],
      // R21: any one of the housing status, the discharge summary or the rehab stay's encounter.
      'Patient/pt-0035': [ref('Observation/obs-t3-8852'), ref('DocumentReference/doc-t3-6193'), ref('Encounter/enc-t3-4609')],
      'Patient/pt-0036': [ref('Procedure/proc-t3-6271')],
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
    ]);
    expect(run('nothing_for_others').items!.filter((i) => i.decisive_ids.length > 0).map((i) => i.item)).toEqual(noContact.map((x) => x.patient));
  });

  it('a trial that orders nothing fails fit_orders on exactly the members with a gap to order, each saying why', () => {
    const v = run('fit_orders');
    expect(v.met).toBe(false);
    expect(v.items!.filter((i) => !i.met).map((i) => i.item)).toEqual(ORDERED);
    expect(v.items!.find((i) => i.item === 'Patient/pt-0022')).toMatchObject({ why: 'needs one new FIT order; the trial placed none', decisive_ids: [expected.items.find((x) => x.patient === 'Patient/pt-0022')!.decisive[0]] });
  });

  it('and fails outreach_messages on the members who need a message; nothing_for_others and gap_seen_before_order hold', () => {
    const out = run('outreach_messages');
    expect(out.items!.filter((i) => !i.met).map((i) => [i.item, i.why])).toEqual(expected.items.filter((x) => x.message === true).map((x) => [x.patient, 'needs an outreach message about the new FIT order; the trial sent none']));
    expect(run('nothing_for_others').met).toBe(true);
    expect(run('gap_seen_before_order').met).toBe(true);
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

// Rulings R20 and R21 (verifier-W1-probe-T3-clinical-1 F1, F2). A gap that rests on an absence is
// reviewed by seeing its trap record or by a whole search that covers the window; a gap whose
// deciding fact may come from any of several records is reviewed by seeing one.
describe('absence items (R20) and any-of evidence (R21)', () => {
  const at = (p: string) => expected.items.find((x) => x.patient === `Patient/${p}`)!;
  it('marks the absence of the A, C1 and D gaps and the any-of evidence of H2, and nothing else', () => {
    expect(expected.items.filter((x) => x.absence !== null).map((x) => [x.patient, x.absence!.type, x.absence!.from])).toEqual([
      ['Patient/pt-0011', 'EpisodeOfCare', '2026-01-01'],
      ['Patient/pt-0014', 'Procedure', '2017-01-01'],
      ['Patient/pt-0018', 'Observation', '2024-01-01'],
      ['Patient/pt-0022', 'Observation', '2026-01-01'],
      ['Patient/pt-0024', 'Procedure', '2017-01-01'],
    ]);
    expect(expected.items.filter((x) => x.evidence === 'any').map((x) => x.patient)).toEqual(['Patient/pt-0035']);
  });

  // Ruling R27: what each absence counts, so a filter can be checked against it. Codes and
  // categories are 'system|code'; statuses are every status the policy counts.
  it('lists every code, category and status the policy counts for each absence', () => {
    const LOINC = (cs: string[]) => cs.map((c) => `http://loinc.org|${c}`);
    const LAB = ['http://terminology.hl7.org/CodeSystem/observation-category|laboratory'];
    const TESTS = ['final', 'amended', 'corrected'];
    expect(Object.fromEntries(expected.items.filter((x) => x.absence !== null).map((x) => [x.patient, x.absence]))).toEqual({
      'Patient/pt-0011': { type: 'EpisodeOfCare', from: '2026-01-01', codes: [], categories: [], statuses: ['planned', 'active', 'onhold', 'finished'] },
      'Patient/pt-0014': { type: 'Procedure', from: '2017-01-01', codes: ['http://snomed.info/sct|73761001'], categories: [], statuses: ['completed'] },
      'Patient/pt-0018': { type: 'Observation', from: '2024-01-01', codes: LOINC(['77354-9', '77353-1']), categories: LAB, statuses: TESTS },
      'Patient/pt-0022': { type: 'Observation', from: '2026-01-01', codes: LOINC(['2335-8', '29771-3', '57905-2', '58453-2', '80372-6', '27396-1', '12503-9']), categories: LAB, statuses: TESTS },
      'Patient/pt-0024': { type: 'Procedure', from: '2017-01-01', codes: ['http://snomed.info/sct|73761001'], categories: [], statuses: ['completed'] },
    });
  });

  const d1 = at('pt-0022');
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
    expect(filtersCover(apply(change), d1.patient, d1.absence!)).toBe(want);
  });
  it.each<[string, string, Change, boolean]>([
    // verifier-W1-probe-T3-clinical-3 F1: a hospice episode counts planned, active, on hold or finished.
    ['C1: planned, active, onhold and finished', 'pt-0011', { status: 'planned,active,onhold,finished' }, true],
    ['C1: every episode status but entered-in-error', 'pt-0011', { status: 'planned,waitlist,active,onhold,finished,cancelled' }, true],
    ['C1: every status but cancelled', 'pt-0011', { status: 'planned,waitlist,active,onhold,finished' }, true],
    ['C1: active, onhold and finished (no planned)', 'pt-0011', { status: 'active,onhold,finished' }, false],
    ['C1: active and finished only', 'pt-0011', { status: 'active,finished' }, false],
    ['C1: no status filter', 'pt-0011', {}, true],
    // verifier-W1-probe-T3-clinical-5 F1: every window starts at the clinic's local midnight.
    ['C1: from the clinic\'s local midnight (-05:00)', 'pt-0011', { date_ge: '2026-01-01T00:00:00-05:00' }, true],
    ['C1: from one minute after the clinic\'s local midnight', 'pt-0011', { date_ge: '2026-01-01T00:01:00-05:00' }, false],
    ['D2: from the clinic\'s local midnight (-05:00)', 'pt-0018', { code: '77354-9,77353-1', date_ge: '2024-01-01T00:00:00-05:00' }, true],
    ['D2: from 06:00Z on the window start', 'pt-0018', { code: '77354-9,77353-1', date_ge: '2024-01-01T06:00:00Z' }, false],
    ['A1: from the clinic\'s local midnight (05:00Z)', 'pt-0024', { code: '73761001', date_ge: '2017-01-01T05:00:00Z' }, true],
    ['A1: from one second after the clinic\'s local midnight', 'pt-0024', { code: '73761001', date_ge: '2017-01-01T05:00:01Z' }, false],
    ['A1: the colonoscopy code', 'pt-0024', { code: '73761001' }, true],
    ['A1: the colonoscopy code, status completed', 'pt-0024', { code: 'http://snomed.info/sct|73761001', status: 'completed' }, true],
    ['A1: any category', 'pt-0024', { category: 'surgical' }, false],
    ['D2: both sDNA codes', 'pt-0018', { code: '77354-9,77353-1' }, true],
    ['D2: one sDNA code', 'pt-0018', { code: '77354-9' }, false],
  ])('%s: filters cover %s', (_label, p, change, want) => {
    const x = at(p);
    const s: StepSearch = { type: x.absence!.type, patient: x.patient, date_ge: x.absence!.from, whole: true, ...change } as StepSearch;
    expect(filtersCover(s, x.patient, x.absence!)).toBe(want);
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
    expect(absenceShownAt(steps, d1.patient, d1.absence!)).toBe(want);
  });

  // A trial that searched or read, then ordered a FIT kit for one member a turn later.
  const orderFor = (p: string, before: Step[]): GateCtx => {
    const sr = { resourceType: 'ServiceRequest', id: 'sr-t0001', status: 'active', intent: 'order', code: { coding: [{ system: 'urn:riverbend:orders', code: 'LAB-FIT-KIT' }] }, subject: { reference: `Patient/${p}` }, occurrenceDateTime: '2026-10-26' };
    const final = { has: () => true, status: () => 'active', get: (t: string, id: string) => (t === 'ServiceRequest' && id === 'sr-t0001' ? sr : undefined), all: (t?: string) => (t === undefined || t === 'ServiceRequest' ? [sr] : []) } as unknown as GateCtx['final'];
    const steps = [...before, step(before.length + 1, 9, { tool: 'order_service', written_ids: ['ServiceRequest/sr-t0001'] })];
    return { ...NOTHING, final, steps, exposedAt: (id) => steps.find((s) => s.exposed_ids.includes(id))?.n ?? null, writes: () => ['ServiceRequest/sr-t0001'] };
  };
  const item = (gate: string, ctx: GateCtx, p: string) => gates.find((g) => g.id === gate)!.fn(ctx).items!.find((i) => i.item === `Patient/${p}`)!;
  it("counts D1's order as reviewed after a whole search of her stool tests from the window start that found nothing", () => {
    const ctx = orderFor('pt-0022', [step(1, 1, { search: base })]);
    expect(item('fit_orders', ctx, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', ctx, 'pt-0022').met).toBe(true);
  });
  it('but not after a search that leaves January out: retrieval, and the why names the search it needed', () => {
    const ctx = orderFor('pt-0022', [step(1, 1, { search: { ...base, date_ge: '2026-02-01' } })]);
    expect(item('fit_orders', ctx, 'pt-0022')).toMatchObject({ met: false, why: expect.stringContaining("or a complete search of the patient's Observation records from 2026-01-01") });
  });
  it('and a covering search in the same answer as the order is not seen before it (process)', () => {
    const ctx = orderFor('pt-0022', [step(1, 9, { search: base })]);
    expect(item('fit_orders', ctx, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', ctx, 'pt-0022').met).toBe(false);
  });
  it('counts D1\'s order as reviewed after a complete clinic-wide search of the window, and D2\'s after a run of pages to the end (R27)', () => {
    const clinic = orderFor('pt-0022', [step(1, 1, { search: apply({ patient: null }) })]);
    expect(item('fit_orders', clinic, 'pt-0022').met).toBe(true);
    expect(item('gap_seen_before_order', clinic, 'pt-0022').met).toBe(true);
    const all = (offset: number | undefined, next: number | undefined): StepSearch => apply({ patient: 'Patient/pt-0018', code: null, date_ge: '2024-01-01', offset: offset ?? null, next_offset: next ?? null, whole: false });
    const paged = orderFor('pt-0018', [step(1, 1, { search: all(undefined, 28) }), step(2, 2, { search: all(28, 56) }), step(3, 3, { search: all(56, undefined) })]);
    expect(item('fit_orders', paged, 'pt-0018').met).toBe(true);
    expect(item('gap_seen_before_order', paged, 'pt-0018').met).toBe(true);
    const stopped = orderFor('pt-0018', [step(1, 1, { search: all(undefined, 28) }), step(2, 2, { search: all(28, 56) })]);
    expect(item('fit_orders', stopped, 'pt-0018')).toMatchObject({ met: false });
  });
  it("counts H2's order as reviewed after any one of his three records", () => {
    const [obs, doc, enc] = at('pt-0035').decisive;
    for (const ctx of [
      orderFor('pt-0035', [step(1, 1, { exposed_ids: [enc!] })]),
      orderFor('pt-0035', [step(1, 1, { tool: 'fhir_read', exposed_ids: [doc!] })]),
      orderFor('pt-0035', [step(1, 1, { exposed_ids: [obs!] })]),
    ]) {
      expect(item('fit_orders', ctx, 'pt-0035').met).toBe(true);
      expect(item('gap_seen_before_order', ctx, 'pt-0035').met).toBe(true);
    }
    expect(item('fit_orders', orderFor('pt-0035', [step(1, 1, { referenced_ids: [doc!] })]), 'pt-0035')).toMatchObject({ met: false, why: expect.stringContaining('any of') });
  });
  // Ruling R29 (builder-252): a cut snippet of the discharge summary that shows its atoms stands
  // for reading it; one cut before them does not. tests/phrases.test.ts sweeps the real snippets.
  it("counts H2's discharge summary as seen from a snippet that shows 'discharged home', and not from one cut before it", () => {
    const [, doc] = at('pt-0035').decisive;
    const snip = (text: string) => [step(1, 1, { tool: 'search_notes', referenced_ids: [doc!], shown: { [doc!]: text } })];
    const shown = orderFor('pt-0035', snip('…Pain controlled with acetaminophen. Disposition: discharged home with daughter, who is staying…'));
    expect(item('fit_orders', shown, 'pt-0035').met).toBe(true);
    expect(item('gap_seen_before_order', shown, 'pt-0035').met).toBe(true);
    for (const text of ['…Admitted: 05/03/2026, from St. Brigid Regional Discharged: 05/24/2026 Level of care: skilled nursing facility…', '…patient discharged homebound…', '…Disposition: discharged…']) {
      expect(item('fit_orders', orderFor('pt-0035', snip(text)), 'pt-0035'), text).toMatchObject({ met: false, why: expect.stringContaining('any of') });
    }
  });
  it('declares the same rules to attribution (seen_at) on every gate over panel members, for every decisive id of a member with an absence, any-of evidence or atoms', () => {
    const ids = expected.items.filter((x) => x.absence !== null || x.evidence === 'any' || Object.keys(x.atoms).length > 0).flatMap((x) => x.decisive);
    for (const g of ['fit_orders', 'outreach_messages', 'gap_seen_before_order', 'nothing_for_others']) expect(Object.keys(gates.find((x) => x.id === g)!.seen_at ?? {}).sort(), g).toEqual([...ids].sort());
    expect(Object.keys(expected.items.find((x) => x.patient === 'Patient/pt-0021')!.atoms)).toEqual(expected.items.find((x) => x.patient === 'Patient/pt-0021')!.decisive);
  });
});
