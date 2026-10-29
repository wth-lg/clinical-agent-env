// builder-163 D5: timing events count per full clinic day, not averaged over the days they touch.
import { describe, expect, it } from 'vitest';
import { eventsPerDay } from './tests/regimen.ts';

const bid = (days: string[]) => days.flatMap((d) => [`${d}T08:00:00-04:00`, `${d}T20:00:00-04:00`]);

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
});
