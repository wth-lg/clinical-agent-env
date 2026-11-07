// Trial durations on screen: the Grading tab's Duration card and Overview's median duration per
// task (design section 7, P25c), both from a record's started and ended.

// "51 s" under a minute, else "2 min 50 s".
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

// A record's duration in seconds, or null when its times cannot be read.
export function durationSeconds(r: { started?: string | undefined; ended?: string | undefined }): number | null {
  if (!r.started || !r.ended) return null;
  const s = (Date.parse(r.ended) - Date.parse(r.started)) / 1000;
  return Number.isFinite(s) && s >= 0 ? s : null;
}

// The median over the records whose times can be read; null with none.
export function medianSeconds(records: ReadonlyArray<{ started?: string | undefined; ended?: string | undefined }>): number | null {
  const v = records.map(durationSeconds).filter((s): s is number => s !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}
