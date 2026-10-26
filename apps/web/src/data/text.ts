// Small text helpers for display (pre-audit U10).

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// An ISO time as "Fri 23 Oct 2026, 08:00 (UTC−4)", in the time's own offset, never the viewer's
// zone (the pinned clock is the world's). A value it cannot read is returned as it is.
export function formatClock(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (m === null) return iso;
  const [, y, mo, d, hh, mm, off] = m as unknown as [string, string, string, string, string, string, string];
  // A date or time that does not exist (month 13, 30 February, hour 24) is not read.
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d) || Number(hh) > 23 || Number(mm) > 59) return iso;
  const day = DAYS[date.getUTCDay()];
  const zero = off === 'Z' || /^[+-]00:00$/.test(off);
  const zone = zero ? 'UTC' : `UTC${off[0] === '-' ? '−' : '+'}${Number(off.slice(1, 3))}${off.slice(4) === '00' ? '' : `:${off.slice(4)}`}`;
  return `${day} ${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}, ${hh}:${mm} (${zone})`;
}

// The text up to its first sentence end: a full stop followed by a space or the end, not one that
// closes an abbreviation such as "e.g.". The whole text when it has no such stop.
const ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs']);
export function firstSentence(text: string): string {
  for (const m of text.matchAll(/\.(?=\s|$)/g)) {
    const before = text.slice(0, m.index).split(/\s/).at(-1) ?? '';
    if (!ABBREVIATIONS.has(before.toLowerCase())) return text.slice(0, m.index + 1);
  }
  return text;
}
