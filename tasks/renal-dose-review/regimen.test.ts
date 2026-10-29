// builder-163 D5: timing events count per full clinic day, not averaged over the days they touch.
// builder-168: doses under 4 h apart are one administration time; mg still counts every dose.
import { describe, expect, it } from 'vitest';
import { eventDosesPerDay, eventsPerDay } from './tests/regimen.ts';

const DAYS = ['2026-10-29', '2026-10-30', '2026-10-31'];
const bid = (days: string[]) => days.flatMap((d) => [`${d}T08:00:00-04:00`, `${d}T20:00:00-04:00`]);
const at = (...times: string[]) => DAYS.flatMap((d) => times.map((t) => `${d}T${t}:00-04:00`));

describe('eventsPerDay', () => {
  it('reads 2 a day from a twice-daily list over three days', () => expect(eventsPerDay(bid(['2026-10-29', '2026-10-30', '2026-10-31']))).toBe(2));
  it('reads 2 a day when the list stops mid-morning on its last day', () =>
    expect(eventsPerDay(['2026-10-29T10:00:00-04:00', '2026-10-29T22:00:00-04:00', '2026-10-30T10:00:00-04:00', '2026-10-30T22:00:00-04:00', '2026-10-31T10:00:00-04:00'])).toBe(2));
  it('reads clinic days across the end of daylight saving time', () =>
    expect(eventsPerDay(['2026-10-31T21:00:00-04:00', '2026-11-01T09:00:00-05:00', '2026-11-01T21:00:00-05:00', '2026-11-02T09:00:00-05:00'])).toBe(2));
  it('reads UTC instants on their clinic day', () => expect(eventsPerDay(['2026-10-29T12:00:00Z', '2026-10-29T23:30:00Z', '2026-10-30T12:00:00Z', '2026-10-30T23:30:00Z', '2026-10-31T12:00:00Z'])).toBe(2));
  it('gives null for three doses one day and one the next', () => expect(eventsPerDay(['2026-10-29T08:00:00-04:00', '2026-10-29T14:00:00-04:00', '2026-10-29T20:00:00-04:00', '2026-10-30T08:00:00-04:00'])).toBeNull());
  it('gives null for a list of one day', () => expect(eventsPerDay(bid(['2026-10-29']))).toBeNull());
  it('gives null when a full day differs', () => expect(eventsPerDay([...bid(['2026-10-29']), '2026-10-30T08:00:00-04:00', ...bid(['2026-10-31'])])).toBeNull());
  it('gives null when a day in the middle has no dose', () => expect(eventsPerDay(bid(['2026-10-29', '2026-10-31']))).toBeNull());
  it('gives null when an edge day has more than the full days', () => expect(eventsPerDay(['2026-10-29T06:00:00-04:00', ...bid(['2026-10-29', '2026-10-30', '2026-10-31'])])).toBeNull());
  it('reads 1 a day from two doses at the same instant each day', () => expect(eventsPerDay(at('08:00', '08:00'))).toBe(1));
  it('reads 1 a day from two doses 30 minutes apart each day', () => expect(eventsPerDay(at('08:00', '08:30'))).toBe(1));
  it('reads 2 a day from doses 4 h apart each day', () => expect(eventsPerDay(at('08:00', '12:00'))).toBe(2));
  it('reads 2 a day from a twice-daily list given out of order', () => expect(eventsPerDay([...bid(DAYS)].reverse())).toBe(2));
  it('reads 2 a day when each time has two doses', () => expect(eventsPerDay(at('08:00', '08:00', '20:00', '20:00'))).toBe(2));
});

describe('eventDosesPerDay', () => {
  it('counts every dose of a twice-daily list', () => expect(eventDosesPerDay(bid(DAYS))).toBe(2));
  it('counts both doses given at the same instant', () => expect(eventDosesPerDay(at('08:00', '08:00'))).toBe(2));
  it('counts 4 a day when each of two times has two doses', () => expect(eventDosesPerDay(at('08:00', '08:00', '20:00', '20:00'))).toBe(4));
  it('gives null for a list of one day', () => expect(eventDosesPerDay(bid(['2026-10-29']))).toBeNull());
});
