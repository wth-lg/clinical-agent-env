// builder-163 D5: timing events count per full clinic day, not averaged over the days they touch.
// builder-168: doses under 4 h apart are one administration time; mg still counts every dose.
// builder-171: only doses within 1 h of a time's first dose are that time; times under 4 h apart have no
// regular frequency (verifier-phase-P17i-P17j-T1same-1 B1, O3, O4).
import { describe, expect, it } from 'vitest';
import { eventDosesPerDay, eventsPerDay, mgPerTime } from './tests/regimen.ts';

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
  it('reads 1 a day from two doses 1 h apart each day', () => expect(eventsPerDay(at('08:00', '09:00'))).toBe(1));
  it('gives null for two doses 3.5 h apart each day', () => expect(eventsPerDay(at('08:00', '11:30'))).toBeNull());
  it('gives null for three doses 3.5 h apart each day', () => expect(eventsPerDay(at('08:00', '11:30', '15:00'))).toBeNull());
  it('gives null for four doses 3 h apart each day', () => expect(eventsPerDay(at('08:00', '11:00', '14:00', '17:00'))).toBeNull());
  it('gives null for six doses 2 h apart each day', () => expect(eventsPerDay(at('08:00', '10:00', '12:00', '14:00', '16:00', '18:00'))).toBeNull());
  it('gives null for 08:00, 11:59 and 20:00 each day', () => expect(eventsPerDay(at('08:00', '11:59', '20:00'))).toBeNull());
  it('gives null when a time\'s second dose is under 4 h before the next time', () => expect(eventsPerDay(at('08:00', '08:45', '12:30'))).toBeNull());
  it('gives null for doses 3 h apart across midnight', () => expect(eventsPerDay(['2026-10-29T22:00:00-04:00', '2026-10-30T01:00:00-04:00', '2026-10-30T22:00:00-04:00', '2026-10-31T01:00:00-04:00', '2026-10-31T22:00:00-04:00', '2026-11-01T01:00:00-04:00'])).toBeNull());
  it('reads 2 a day from two doses at 08:00 and one at 20:00 (unequal, an edge)', () => expect(eventsPerDay(at('08:00', '08:00', '20:00'))).toBe(2));
  it('reads 3 a day from an every-8-h list', () => expect(eventsPerDay(at('06:00', '14:00', '22:00'))).toBe(3));
});

describe('eventDosesPerDay', () => {
  it('counts every dose of a twice-daily list', () => expect(eventDosesPerDay(bid(DAYS))).toBe(2));
  it('counts both doses given at the same instant', () => expect(eventDosesPerDay(at('08:00', '08:00'))).toBe(2));
  it('counts 4 a day when each of two times has two doses', () => expect(eventDosesPerDay(at('08:00', '08:00', '20:00', '20:00'))).toBe(4));
  it('gives null for a list of one day', () => expect(eventDosesPerDay(bid(['2026-10-29']))).toBeNull());
});

describe('mgPerTime', () => {
  const mr = (value: number, timing: object) => ({ dosageInstruction: [{ timing, doseAndRate: [{ doseQuantity: { value, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' } }] }] }) as never;
  it('reads 1000 mg from 1000 mg twice daily', () => expect(mgPerTime(mr(1000, { repeat: { frequency: 2, period: 1, periodUnit: 'd' } }))).toBe(1000));
  it('reads 1000 mg from two 500 mg doses at each of two times', () => expect(mgPerTime(mr(500, { event: at('08:00', '08:00', '20:00', '20:00') }))).toBe(1000));
  it('reads 500 mg from one 500 mg dose at each time', () => expect(mgPerTime(mr(500, { event: at('08:00', '20:00') }))).toBe(500));
  it('gives null when the times have different dose counts', () => expect(mgPerTime(mr(500, { event: at('08:00', '08:00', '20:00') }))).toBeNull());
  it('gives null when the list has no regular frequency', () => expect(mgPerTime(mr(500, { event: at('08:00', '11:30') }))).toBeNull());
});
