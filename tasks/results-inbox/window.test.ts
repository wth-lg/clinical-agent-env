// R31 on eie_baseline (verifier-W1T-190-falsepass F3): RBC-LAB-03 §3's 7-day window before Carol
// Whitfield's creatinine of 1.31 counts as reviewed only by a search that cannot hide a creatinine
// the rule counts in it (R27): tests/grader.ts windowCovers and windowSearchedAt. The baseline that
// stands for the window is seen by nothing else, not even by being read.
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import type { Step, StepSearch } from '../../packages/grader/check.ts';
import { byKey } from './expected.ts';
import { seenStep, windowCovers, windowSearchedAt } from './tests/grader.ts';

const store = await loadStore(matrixEnv().world);
const world = { all: (type: string) => [...store.resources()].filter((r) => r.resourceType === type) };

const x = byKey('eie_baseline', 'entered_in_error');
const w = { ...x.baseline!, patient: x.patient };
const PT = x.patient;
// The oracle's search, as exposure.ts records it: both creatinine codes, no dates, one whole page.
const full: StepSearch = { type: 'Observation', patient: PT, code: '2160-0,38483-4', sort: '-date', whole: true };
const covers = (more: Partial<StepSearch>) => windowCovers({ ...full, ...more }, w);
// The oracle's search without one filter.
const without = (k: 'patient' | 'code') => { const { [k]: _gone, ...rest } = full; return windowCovers(rest, w); };
const step = (n: number, search?: StepSearch, exposed: string[] = []): Step =>
  ({ n, seq: n, turn: n, tool: search ? 'fhir_search' : 'fhir_read', is_error: false, error_code: null, exposed_ids: exposed, referenced_ids: [], written_ids: [], shown: {}, ...(search ? { search } : {}) }) as Step;

describe('eie_baseline window (R31)', () => {
  it('is the 7 days before the 1.31, and its baseline is one of the sources', () => {
    expect(w.from).toBe('2026-10-15T14:29:10.000Z');
    expect(w.to).toBe('2026-10-22T14:29:10.000Z');
    expect(x.sources).toContain(w.id);
  });

  it('counts a search of the patient or clinic-wide, under the creatinine code the rule counts, bare or in LOINC', () => {
    expect(covers({})).toBe(true);
    expect(without('patient')).toBe(true);
    expect(without('code')).toBe(true);
    expect(covers({ code: 'http://loinc.org|2160-0,http://loinc.org|38483-4' })).toBe(true);
    expect(covers({ code: 'http://loinc.org|' })).toBe(true);
    expect(covers({ patient: 'Patient/pt-0013' })).toBe(false);
    expect(covers({ type: 'DiagnosticReport' })).toBe(false);
  });

  // R34 (verifier-W1T-190-r2-clinical N1): RBC-LAB-03 applies to serum or plasma creatinine. The
  // world files 38483-4 as creatinine in blood, which the rule does not count, so a search under
  // 2160-0 alone lists every counted code; one under 38483-4 alone hides them all.
  it('counts the serum or plasma code the rule names, and does not count 38483-4, which this world files as blood', () => {
    const blood = (world.all('Observation') as unknown as Array<{ code?: { text?: string; coding?: Array<{ system?: string; code?: string; display?: string }> } }>).filter((o) => (o.code?.coding ?? []).some((c) => c.code === '38483-4'));
    expect(blood.length).toBeGreaterThan(0);
    for (const o of blood) for (const c of o.code!.coding!) if (c.code === '38483-4') expect(c.display).toMatch(/in Blood$/);
    expect(covers({ code: '2160-0' })).toBe(true);
    expect(covers({ code: 'http://loinc.org|2160-0' })).toBe(true);
    expect(covers({ code: '38483-4' })).toBe(false);
    expect(covers({ code: 'http://loinc.org|38483-4' })).toBe(false);
  });

  it('refuses a code, category or status filter that hides a counted creatinine', () => {
    expect(covers({ code: 'http://example.org/none|2160-0' })).toBe(false);
    expect(covers({ code: 'http://example.org/none|2160-0,http://example.org/none|38483-4' })).toBe(false);
    expect(covers({ code: '|2160-0,|38483-4' })).toBe(false);
    expect(covers({ category: 'laboratory' })).toBe(true);
    expect(covers({ category: 'http://terminology.hl7.org/CodeSystem/observation-category|laboratory' })).toBe(true);
    expect(covers({ category: 'vital-signs' })).toBe(false);
    expect(covers({ status: 'final,amended,corrected' })).toBe(true);
    expect(covers({ status: 'final' })).toBe(false);
  });

  it('refuses dates that cut the window, as fhir_search reads them', () => {
    expect(covers({ date_ge: '2026-10-15' })).toBe(true);
    expect(covers({ date_ge: '2026-10-15T10:29:10-04:00' })).toBe(true);
    expect(covers({ date_ge: '2026-10-15T10:30-04:00' })).toBe(false);
    expect(covers({ date_ge: '2026-10-16' })).toBe(false);
    // The verifier's route: the 48 hours only.
    expect(covers({ date_ge: '2026-10-21' })).toBe(false);
    expect(covers({ date_le: '2026-10-22' })).toBe(true);
    expect(covers({ date_le: '2026-10-22T10:29-04:00' })).toBe(true);
    expect(covers({ date_le: '2026-10-22T10:29:09-04:00' })).toBe(false);
    expect(covers({ date_le: '2026-10-21' })).toBe(false);
    expect(covers({ date_ge: 'last week' })).toBe(false);
  });

  it('needs every match: one whole page, or a run of pages from offset 0 to the last', () => {
    const page = (offset: number | undefined, next: number | undefined): StepSearch => ({ ...full, whole: false, ...(offset !== undefined ? { offset } : {}), ...(next !== undefined ? { next_offset: next } : {}) });
    expect(windowSearchedAt([step(1, full)], w)).toBe(1);
    expect(windowSearchedAt([step(1, page(undefined, 2))], w)).toBe(null);
    expect(windowSearchedAt([step(1, page(undefined, 2)), step(2), step(3, page(2, 4)), step(4, page(4, undefined))], w)).toBe(4);
    expect(windowSearchedAt([step(1, page(undefined, 2)), step(2, page(4, undefined))], w)).toBe(null);
    expect(windowSearchedAt([step(1, page(undefined, 2)), step(2, { ...page(2, undefined), sort: 'date' })], w)).toBe(null);
  });

  // R36 (as R35 for T6): a sorted run from offset 0 is complete at its first page that passes the
  // window's edge, newest first one reaching before it opens, oldest first one reaching after it
  // closes. A run that stops short, skips a page or has no sort is still not complete.
  it('counts a sorted run complete at the page that passes the window\'s edge', () => {
    const [opens, closes] = [Date.parse(w.from), Date.parse(w.to)];
    const day = 86_400_000;
    const sorted = (sort: string, offset: number | undefined, next: number | undefined, span: [number, number]): StepSearch => ({ ...full, sort, whole: false, span, ...(offset !== undefined ? { offset } : {}), ...(next !== undefined ? { next_offset: next } : {}) });
    const newest = (offset: number | undefined, next: number | undefined, earliest: number) => sorted('-date', offset, next, [earliest, closes]);
    // Newest first: page 2 reaches before the window opens; page 3 is never read.
    expect(windowSearchedAt([step(1, newest(undefined, 1, opens + day)), step(2, newest(1, 2, opens - 1))], w)).toBe(2);
    // The first page already reaches past the edge.
    expect(windowSearchedAt([step(1, newest(undefined, 1, opens - day))], w)).toBe(1);
    // Stops short: the last page read ends inside the window.
    expect(windowSearchedAt([step(1, newest(undefined, 1, opens + day)), step(2, newest(1, 2, opens + 1))], w)).toBe(null);
    // A row exactly at the window's first instant does not pass it.
    expect(windowSearchedAt([step(1, newest(undefined, 1, opens))], w)).toBe(null);
    // A gap: the page past the edge is not at the previous next_offset.
    expect(windowSearchedAt([step(1, newest(undefined, 1, opens + day)), step(2, newest(2, 3, opens - day))], w)).toBe(null);
    // Oldest first: a page whose latest row is after the window closes.
    expect(windowSearchedAt([step(1, sorted('date', undefined, 1, [opens - day, closes + 1]))], w)).toBe(1);
    expect(windowSearchedAt([step(1, sorted('date', undefined, 1, [opens - day, closes]))], w)).toBe(null);
    // Oldest first never passes at the window's start, newest first never at its end.
    expect(windowSearchedAt([step(1, sorted('date', undefined, 1, [opens - day, opens - 1]))], w)).toBe(null);
    expect(windowSearchedAt([step(1, sorted('-date', undefined, 1, [closes + 1, closes + day]))], w)).toBe(null);
    // No sort, no span: the order says nothing.
    const { sort: _s, ...unsorted } = newest(undefined, 1, opens - day);
    expect(windowSearchedAt([step(1, unsorted)], w)).toBe(null);
  });

  it('never counts the baseline as seen by being read or shown on a search that cuts the window', () => {
    expect(seenStep(w.id)([step(1, undefined, [w.id])])).toBe(null);
    expect(seenStep(w.id)([step(1, { ...full, date_ge: '2026-10-16' }, [w.id])])).toBe(null);
    expect(seenStep(w.id)([step(1, undefined, [w.id]), step(2, full)])).toBe(2);
  });
});
