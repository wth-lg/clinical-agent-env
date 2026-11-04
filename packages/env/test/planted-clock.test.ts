// plantedClock moves a planted record's times onto its chart's clock and rewrites the HH:MM its
// own text gives of a moved time. Only a time the record starts at can be in its text: an end the
// profile pass derives (a note's 15-minute context period) is not something the author wrote, so a
// text time equal to that end is another time (a booked slot) and stays (builder-230 item 1: a
// booking note at 09:45 had its "10:00 AM" slot rewritten to "10:09 AM").
import { describe, expect, it } from 'vitest';
import { plantedClock } from '../profile.ts';
import type { Resource } from '../store.ts';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const text = (r: Resource) => Buffer.from(((r as unknown as { content: Array<{ attachment: { data: string } }> }).content[0]!.attachment.data), 'base64').toString('utf8');

// A chart with Synthea visits that give it a clock (mm:ss other than :00:00), and one planted note.
const chart = (noteText: string): Resource[] => {
  const visits = [1, 2, 3, 4, 5, 6].map((d) => ({
    resourceType: 'Encounter', id: `enc-base-${d}`, status: 'finished', subject: { reference: 'Patient/pt-x' },
    period: { start: `2026-0${d}-1${d}T09:2${d}:1${d}-04:00`, end: `2026-0${d}-1${d}T09:5${d}:3${d}-04:00` },
  }));
  const note = {
    resourceType: 'DocumentReference', id: 'doc-planted', status: 'current', subject: { reference: 'Patient/pt-x' },
    date: '2026-10-07T09:45:00-04:00',
    context: { period: { start: '2026-10-07T09:45:00-04:00', end: '2026-10-07T10:00:00-04:00' } },
    content: [{ attachment: { contentType: 'text/plain', data: b64(noteText) } }],
  };
  return [{ resourceType: 'Patient', id: 'pt-x' }, ...visits, note] as unknown as Resource[];
};

describe('plantedClock text times (builder-230 item 1)', () => {
  const run = (t: string) => plantedClock(chart(t), new Set(['DocumentReference/doc-planted'])).find((r) => r.id === 'doc-planted')!;

  it('moves the note onto the chart clock', () => {
    const r = run('Booked for CT at 10:00 AM on 10/09.') as unknown as { date: string; context: { period: { start: string; end: string } } };
    expect(r.date).not.toBe('2026-10-07T09:45:00-04:00');
    expect(r.context.period.end).not.toBe('2026-10-07T10:00:00-04:00');
  });

  it('keeps a text time equal to the note\'s derived end (a booked slot)', () => {
    expect(text(run('Booked for CT at 10:00 AM on 10/09.'))).toBe('Booked for CT at 10:00 AM on 10/09.');
  });

  it('still rewrites a text time equal to the note\'s own start', () => {
    const r = run('Called at 09:45; booked for CT at 10:00 AM.');
    const date = (r as unknown as { date: string }).date;
    expect(text(r)).toBe(`Called at ${date.slice(11, 16)}; booked for CT at 10:00 AM.`);
  });
});

// An added chart (W5, builder-302: a Patient an overlay adds, every record of it planted) has no
// generated record to take a clock from. It gets one of its own, drawn from the patient's id: one
// minute-and-second for its starts, one for its ends, so its records share a clock as Synthea's
// charts do. A chart with generated records keeps taking its clock from them.
describe('plantedClock on an added chart (no generated record)', () => {
  const mmss = (t: string) => t.slice(14, 19);
  const LAB = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }];
  const added = (patient: string): Resource[] => {
    const subject = { reference: `Patient/${patient}` };
    return [
      { resourceType: 'Patient', id: patient },
      { resourceType: 'Encounter', id: `enc-${patient}-1`, status: 'finished', subject, period: { start: '2026-06-08T09:00:00-04:00', end: '2026-06-08T09:30:00-04:00' } },
      { resourceType: 'Encounter', id: `enc-${patient}-2`, status: 'finished', subject, period: { start: '2026-10-01T14:20:00-04:00', end: '2026-10-01T14:50:00-04:00' } },
      { resourceType: 'Observation', id: `obs-${patient}-1`, status: 'final', subject, category: LAB, code: { coding: [{ system: 'http://loinc.org', code: '4548-4' }] }, effectiveDateTime: '2026-06-08T09:10:00-04:00', issued: '2026-06-08T14:30:00-04:00', encounter: { reference: `Encounter/enc-${patient}-1` } },
      { resourceType: 'Observation', id: `obs-${patient}-2`, status: 'final', subject, category: LAB, code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, effectiveDateTime: '2026-09-30T08:30:00-04:00', issued: '2026-09-30T13:10:00-04:00' },
      { resourceType: 'MedicationRequest', id: `mr-${patient}-1`, status: 'active', intent: 'order', subject, authoredOn: '2025-10-27T09:15:00-04:00' },
      { resourceType: 'MedicationRequest', id: `mr-${patient}-2`, status: 'active', intent: 'order', subject, authoredOn: '2026-10-01T14:40:00-04:00', encounter: { reference: `Encounter/enc-${patient}-2` } },
    ] as unknown as Resource[];
  };
  const keys = (rs: Resource[]) => new Set(rs.filter((r) => r.resourceType !== 'Patient').map((r) => `${r.resourceType}/${r.id}`));
  const run = (patient: string) => plantedClock(added(patient), keys(added(patient)));
  const starts = (rs: Resource[]) => rs.flatMap((r) => { const j = r as unknown as { period?: { start: string }; effectiveDateTime?: string; authoredOn?: string }; return [j.period?.start, j.effectiveDateTime, j.authoredOn].filter((t): t is string => t !== undefined); });
  const ends = (rs: Resource[]) => rs.flatMap((r) => { const e = (r as unknown as { period?: { end: string } }).period?.end; return e ? [e] : []; });

  it('every start of the chart shares one minute-and-second, every end another, neither on the clinic grid', () => {
    const out = run('pt-0070');
    const s = new Set(starts(out).map(mmss));
    const e = new Set(ends(out).map(mmss));
    expect(s.size, [...s].join(' ')).toBe(1);
    expect(e.size, [...e].join(' ')).toBe(1);
    expect([...s][0]).not.toBe([...e][0]);
    for (const x of [...s, ...e]) expect(x.endsWith(':00'), x).toBe(false);
  });

  it('keeps each record in its hour and its order, and its issue time after its draw', () => {
    const out = run('pt-0070');
    const at = (id: string) => out.find((r) => r.id === id) as unknown as { effectiveDateTime: string; issued: string; period: { start: string; end: string } };
    expect(at('obs-pt-0070-1').effectiveDateTime.slice(0, 13)).toBe('2026-06-08T09');
    expect(Date.parse(at('obs-pt-0070-2').issued)).toBeGreaterThan(Date.parse(at('obs-pt-0070-2').effectiveDateTime));
    const enc = at('enc-pt-0070-2');
    expect(Date.parse(enc.period.end)).toBeGreaterThan(Date.parse(enc.period.start));
  });

  it("is drawn from the patient's id: the same chart under another id takes another clock, and the same id the same one", () => {
    const a = new Set(starts(run('pt-0070')).map(mmss));
    expect(new Set(starts(run('pt-0070')).map(mmss))).toEqual(a);
    expect(new Set(starts(run('pt-0071')).map(mmss))).not.toEqual(a);
  });

  it("its results' issue times share a minute-and-second of their own; a report's issue time is drawn, as the cohort's are (#221 round 2 F1)", () => {
    const subject = { reference: 'Patient/pt-0070' };
    const report = { resourceType: 'DiagnosticReport', id: 'dr-x', status: 'final', subject, category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }], code: { coding: [{ system: 'http://loinc.org', code: '24321-2' }] }, effectiveDateTime: '2026-09-30T08:30:00-04:00', issued: '2026-09-30T13:40:00-04:00', result: [{ reference: 'Observation/obs-pt-0070-2' }] } as unknown as Resource;
    const rs = [...added('pt-0070'), report];
    const out = plantedClock(rs, new Set([...keys(added('pt-0070')), 'DiagnosticReport/dr-x']));
    const issued = (t: string) => out.filter((r) => r.resourceType === t).flatMap((r) => { const i = (r as unknown as { issued?: string }).issued; return i ? [mmss(i)] : []; });
    expect(new Set(issued('Observation')).size, issued('Observation').join(' ')).toBe(1);
    expect(issued('DiagnosticReport')).toHaveLength(1);
    expect(issued('DiagnosticReport')[0]).not.toBe(issued('Observation')[0]);
  });

  it('an instant that is both a start and an end takes the start clock (#221 round 2 F1b)', () => {
    // The second visit starts the instant the first ends (in the next hour, so the instant is the
    // hour's first draw and the first visit's length needs no move): both fields hold one time and
    // keep it, and that time is a start.
    const subject = { reference: 'Patient/pt-0070' };
    const rs = [
      { resourceType: 'Patient', id: 'pt-0070' },
      { resourceType: 'Encounter', id: 'enc-a', status: 'finished', subject, period: { start: '2026-06-08T09:50:00-04:00', end: '2026-06-08T10:30:00-04:00' } },
      { resourceType: 'Encounter', id: 'enc-b', status: 'finished', subject, period: { start: '2026-06-08T10:30:00-04:00', end: '2026-06-08T11:10:00-04:00' } },
      { resourceType: 'Observation', id: 'obs-a', status: 'final', subject, category: LAB, code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, effectiveDateTime: '2026-09-30T08:30:00-04:00', issued: '2026-09-30T13:10:00-04:00' },
    ] as unknown as Resource[];
    const out = plantedClock(rs, new Set(['Encounter/enc-a', 'Encounter/enc-b', 'Observation/obs-a']));
    const at = (id: string) => out.find((r) => r.id === id) as unknown as { period?: { start: string; end: string }; effectiveDateTime?: string };
    expect(at('enc-b').period!.start).toBe(at('enc-a').period!.end);
    expect(mmss(at('enc-b').period!.start)).toBe(mmss(at('obs-a').effectiveDateTime!));
  });

  it('consecutive patient ids do not take consecutive minutes (#221 round 2 F2)', () => {
    const minute = (patient: string) => Number(starts(run(patient))[0]!.slice(14, 16));
    const ids = Array.from({ length: 30 }, (_, i) => `pt-${String(61 + i).padStart(4, '0')}`);
    const ms = ids.map(minute);
    const consecutive = ms.filter((m, i) => i > 0 && m === (ms[i - 1]! + 1) % 60).length;
    expect(consecutive, ms.join(' ')).toBeLessThanOrEqual(3);
  });

  it('a chart with generated records takes its clock from them, as before: the seeded clock never applies, and an instant that is both a start and an end keeps its merged draw there', () => {
    // A planted order authored as its planted visit ends, on a chart with a generated clock: the
    // instant draws from the starts' and the ends' pools together, as before this change.
    const subject = { reference: 'Patient/pt-x' };
    const withOrder = [
      ...chart('Follow-up.'),
      { resourceType: 'Encounter', id: 'enc-planted', status: 'finished', subject, period: { start: '2026-10-09T13:00:00-04:00', end: '2026-10-09T13:30:00-04:00' } },
      { resourceType: 'MedicationRequest', id: 'mr-planted', status: 'active', intent: 'order', subject, authoredOn: '2026-10-09T13:30:00-04:00' },
    ] as unknown as Resource[];
    const moved = plantedClock(withOrder, new Set(['DocumentReference/doc-planted', 'Encounter/enc-planted', 'MedicationRequest/mr-planted']));
    const order = moved.find((r) => r.id === 'mr-planted') as unknown as { authoredOn: string };
    const visitEnds = new Set(chart('Follow-up.').filter((r) => r.resourceType === 'Encounter').map((r) => mmss((r as unknown as { period: { end: string } }).period.end)));
    expect(visitEnds.has(mmss(order.authoredOn)), order.authoredOn).toBe(true);
    const out = plantedClock(chart('Follow-up.'), new Set(['DocumentReference/doc-planted']));
    const visits = new Set(out.filter((r) => r.resourceType === 'Encounter').map((r) => mmss((r as unknown as { period: { start: string } }).period.start)));
    const note = out.find((r) => r.id === 'doc-planted') as unknown as { date: string; context: { period: { start: string } } };
    expect(visits.has(mmss(note.context.period.start)), note.context.period.start).toBe(true);
    expect(out.filter((r) => r.resourceType === 'Encounter')).toEqual(chart('Follow-up.').filter((r) => r.resourceType === 'Encounter'));
  });
});

