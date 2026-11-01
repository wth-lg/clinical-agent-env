// The fixed clock (design section 2, "Clock"). Every trial, overlay and fixture lint reads
// time from here; packages/env never reads the wall clock (eslint-rules/determinism.js).
//
// NOW is a Friday in US Eastern Daylight Time. US DST ends 2026-11-01, so the -04:00 offset
// holds for every write a trial stamps; the fixture lint rejects a task time window that
// crosses a transition. eastern() still follows the transitions, so a date read from an instant
// outside that window (a measurement period end, a birth date) is the clinic's local date.

export const NOW = '2026-10-23T08:00:00-04:00';
export const NOW_MS = Date.parse(NOW);
export const TIME_ZONE = 'America/New_York';
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// The clinic's wall clock, h23 so midnight is 00 rather than 24.
const WALL = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// ISO 8601 on the clinic's wall clock, to the second, with the offset in force at that instant:
// -04:00 under EDT, -05:00 under EST.
export function eastern(ms: number): string {
  const p = Object.fromEntries(WALL.formatToParts(ms).map((x) => [x.type, x.value]));
  const local = `${p.year!.padStart(4, '0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  const offset = Math.round((Date.parse(`${local}Z`) - Math.floor(ms / 1000) * 1000) / 60_000);
  const abs = Math.abs(offset);
  return `${local}${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// NOW's calendar date and HH:MM on the clinic's wall clock.
export const NOW_DATE = eastern(NOW_MS).slice(0, 10);
export const NOW_TIME = eastern(NOW_MS).slice(11, 16);

// The line the system prompt states (design section 4, "Shared rules"); the fixture lint
// checks every other date a prompt names against NOW too.
export const NOW_PROMPT = `Current time: ${WEEKDAYS[new Date(`${NOW_DATE}T12:00:00Z`).getUTCDay()]} ${NOW_DATE} ${NOW_TIME} ${TIME_ZONE}.`;

export interface Clock {
  readonly now: string;
  readonly nowMs: number;
  // The timestamp of a trial's n-th write (1-based): NOW + n seconds.
  stamp(writeSeq: number): string;
  // The timestamp of a trial's k-th mid-trial arrival (1-based, packages/env/events.ts), which
  // came after its afterWriteSeq-th write (0: before any write): NOW + afterWriteSeq seconds + k
  // milliseconds, so it lies strictly after that write's stamp (or NOW) and strictly before the
  // next write's, and later arrivals stamp later. Arrivals never take a write sequence number.
  arrivalStamp(afterWriteSeq: number, k: number): string;
}

// ISO 8601 with milliseconds on the clinic's wall clock (eastern() keeps whole seconds).
function easternMs(ms: number): string {
  const s = eastern(ms);
  return `${s.slice(0, 19)}.${String(((ms % 1000) + 1000) % 1000).padStart(3, '0')}${s.slice(19)}`;
}

export const clock: Clock = {
  now: NOW,
  nowMs: NOW_MS,
  stamp(writeSeq) {
    if (!Number.isInteger(writeSeq) || writeSeq < 1) throw new Error(`clock: write sequence ${writeSeq} is not a positive integer`);
    return eastern(NOW_MS + writeSeq * 1000);
  },
  arrivalStamp(afterWriteSeq, k) {
    if (!Number.isInteger(afterWriteSeq) || afterWriteSeq < 0) throw new Error(`clock: write sequence ${afterWriteSeq} is not a whole number`);
    if (!Number.isInteger(k) || k < 1 || k > 999) throw new Error(`clock: arrival sequence ${k} is not in 1-999`);
    return easternMs(NOW_MS + afterWriteSeq * 1000 + k);
  },
};
