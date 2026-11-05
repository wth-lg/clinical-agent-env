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

  // The chart's two seeded values: a lone start (a result's draw) and a lone end (a problem's
  // abatement, the one end path no visit-length rule touches), each the only instant of its hour.
  const seeds = (patient: string) => {
    const subject = { reference: `Patient/${patient}` };
    const rs = [
      { resourceType: 'Patient', id: patient },
      { resourceType: 'Observation', id: 'obs-s', status: 'final', subject, category: LAB, code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, effectiveDateTime: '2026-06-08T10:05:00-04:00', issued: '2026-06-08T15:10:00-04:00' },
      { resourceType: 'Condition', id: 'cond-e', clinicalStatus: { coding: [{ code: 'resolved' }] }, subject, onsetDateTime: '2020-01-14T10:00:00-05:00', abatementDateTime: '2026-06-09T10:20:00-04:00' },
    ] as unknown as Resource[];
    const out = plantedClock(rs, new Set(['Observation/obs-s', 'Condition/cond-e']));
    const at = (id: string) => out.find((r) => r.id === id) as unknown as { effectiveDateTime?: string; abatementDateTime?: string };
    return { start: mmss(at('obs-s').effectiveDateTime!), end: mmss(at('cond-e').abatementDateTime!) };
  };

  it('a shared instant whose start value the band already spent takes a fill second, never the end clock (#221 round 3 M1)', () => {
    // An id whose end value sorts after its start value, so a merged pool (the rule applied to no
    // chart) would hold the end value alone once the start value is spent, and land on it.
    const patient = Array.from({ length: 40 }, (_, i) => `pt-${String(70 + i).padStart(4, '0')}`).find((id) => seeds(id).end > seeds(id).start)!;
    const { start, end } = seeds(patient);
    const subject = { reference: `Patient/${patient}` };
    const rs = [
      { resourceType: 'Patient', id: patient },
      // A result at 10:05 spends the hour's start value; a zero-length visit at 10:20 (a participant
      // period's shape) is the instant the next visit starts.
      { resourceType: 'Observation', id: 'obs-first', status: 'final', subject, category: LAB, code: { coding: [{ system: 'http://loinc.org', code: '2160-0' }] }, effectiveDateTime: '2026-06-08T10:05:00-04:00', issued: '2026-06-08T15:10:00-04:00' },
      { resourceType: 'Encounter', id: 'enc-zero', status: 'finished', subject, period: { start: '2026-06-08T10:20:00-04:00', end: '2026-06-08T10:20:00-04:00' } },
      { resourceType: 'Encounter', id: 'enc-next', status: 'finished', subject, period: { start: '2026-06-08T10:20:00-04:00', end: '2026-06-08T11:40:00-04:00' } },
    ] as unknown as Resource[];
    const out = plantedClock(rs, new Set(['Observation/obs-first', 'Encounter/enc-zero', 'Encounter/enc-next']));
    const at = (id: string) => out.find((r) => r.id === id) as unknown as { period: { start: string; end: string }; effectiveDateTime: string };
    expect(mmss(at('obs-first').effectiveDateTime)).toBe(start);
    expect(at('enc-zero').period.start).toBe(at('enc-next').period.start);
    expect(mmss(at('enc-next').period.start), `end value ${end}`).not.toBe(end);
  });

  it('consecutive patient ids do not take consecutive minutes (#221 round 2 F2)', () => {
    const minute = (patient: string) => Number(starts(run(patient))[0]!.slice(14, 16));
    const ids = Array.from({ length: 30 }, (_, i) => `pt-${String(61 + i).padStart(4, '0')}`);
    const ms = ids.map(minute);
    const consecutive = ms.filter((m, i) => i > 0 && m === (ms[i - 1]! + 1) % 60).length;
    expect(consecutive, ms.join(' ')).toBeLessThanOrEqual(3);
  });

  it('a chart with generated records takes its clock from them, as before: the seeded clock never applies, and an instant that is both a start and an end keeps its merged draw there (#221 round 3 S1)', () => {
    // A planted order authored the instant a planted note's context period ends, on a chart with a
    // generated clock (an instant that is both a start and an end, as the cohort's pt-0034 has at
    // enc-00236 and mr-00318 to mr-00320; a note rather than a visit, so no visit-length rule decides
    // it and the band draw does). The merged pool of the chart's visit starts and ends lands on the
    // visit end 55:35 (an exact value: the draw is a hash of the chart and the instant); the
    // start-pool rule applied to this chart would land it on a visit start (26:16).
    // The exact pin is the point (#221 round 3 M2): any change to the band draw's hashing on
    // cohort charts fails this case, a harmless one included. Whoever changes the draw must
    // re-derive the value against a base world diff (the world built before and after the change,
    // the moved charts' clocks compared), not just update the literal to the new output.
    const subject = { reference: 'Patient/pt-x' };
    const withNote = [
      ...chart('Follow-up.'),
      { resourceType: 'DocumentReference', id: 'doc-ctx', status: 'current', subject, date: '2026-10-09T13:30:00-04:00', context: { period: { start: '2026-10-09T13:00:00-04:00', end: '2026-10-09T13:30:00-04:00' } }, content: [{ attachment: { contentType: 'text/plain', data: b64('Note.') } }] },
      { resourceType: 'MedicationRequest', id: 'mr-ctx', status: 'active', intent: 'order', subject, authoredOn: '2026-10-09T13:30:00-04:00' },
    ] as unknown as Resource[];
    const moved = plantedClock(withNote, new Set(['DocumentReference/doc-planted', 'DocumentReference/doc-ctx', 'MedicationRequest/mr-ctx']));
    const order = moved.find((r) => r.id === 'mr-ctx') as unknown as { authoredOn: string };
    const ctx = moved.find((r) => r.id === 'doc-ctx') as unknown as { context: { period: { end: string } } };
    expect(order.authoredOn).toBe(ctx.context.period.end);
    expect(order.authoredOn).toBe('2026-10-09T13:55:35-04:00');
    const out = plantedClock(chart('Follow-up.'), new Set(['DocumentReference/doc-planted']));
    const visits = new Set(out.filter((r) => r.resourceType === 'Encounter').map((r) => mmss((r as unknown as { period: { start: string } }).period.start)));
    const note = out.find((r) => r.id === 'doc-planted') as unknown as { date: string; context: { period: { start: string } } };
    expect(visits.has(mmss(note.context.period.start)), note.context.period.start).toBe(true);
    expect(out.filter((r) => r.resourceType === 'Encounter')).toEqual(chart('Follow-up.').filter((r) => r.resourceType === 'Encounter'));
  });
});

