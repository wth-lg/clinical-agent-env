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
    const r = run('Called at 09:45; booked for CT at 10:00 AM.') as unknown as { date: string };
    expect(text(r)).toBe(`Called at ${r.date.slice(11, 16)}; booked for CT at 10:00 AM.`);
  });
});
