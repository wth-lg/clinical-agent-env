// The rubric score card's texts and numbers, from a grade's checks (pre-audit M2, P17j JU4). It
// imports nothing: the e2e specs import it, and Playwright loads them with Node, which cannot load
// data/ (verifier-phase-P17i-JU4JU11-1 B1; test/e2e-imports.test.ts).
export interface RubricRow {
  kind?: string;
  points?: number | null;
  met: unknown;
}

export const metText = (met: unknown): string => (met === true ? 'met' : met === false ? 'not met' : String(met));
// A rubric row's met column: a penalty (negative points) that did not fire is "not triggered", so
// "not met" never reads as a loss; an item the judge could not answer is "judge unsure" (ui-polish 3.2).
export const rubricMetText = (c: RubricRow): string => ((c.points ?? 0) < 0 && c.met === false ? 'not triggered' : c.met === 'unknown' ? 'judge unsure' : metText(c.met));
// Whether a rubric row's result is good for the trial: a positive item met, a penalty not triggered.
// null when the judge was unsure.
export const rubricGood = (c: RubricRow): boolean | null => (c.met === 'unknown' ? null : (c.points ?? 0) < 0 ? c.met !== true : c.met === true);
// A rubric row's met mark. A penalty that fired (met, negative points) is "fired", so its icon is an
// alert and never the check of a met item (verifier-phase-P17i-UI-3-1 F3).
export type RubricMark = 'met' | 'not-met' | 'not-triggered' | 'fired' | 'unsure';
export const rubricMark = (c: RubricRow): RubricMark => {
  if (c.met === 'unknown') return 'unsure';
  const penalty = (c.points ?? 0) < 0;
  if (c.met === true) return penalty ? 'fired' : 'met';
  return penalty ? 'not-triggered' : 'not-met';
};

// packages/grader/grade.ts score(): met points over the positive points, unknown items left out,
// clipped to 0..1 (test/rubric.test.ts checks the two agree). `penalties`: what an unknown penalty
// counts as, the way judge.score_penalties_met/_not_met are computed.
export function rubricScore(rows: readonly RubricRow[], penalties?: boolean): number | null {
  let met = 0;
  let positive = 0;
  for (const r of rows) {
    const points = r.points ?? 0;
    const m = r.met === 'unknown' && points < 0 && penalties !== undefined ? penalties : r.met;
    if (r.kind !== 'rubric' || m === 'unknown') continue;
    if (points > 0) positive += points;
    if (m === true) met += points;
  }
  return positive === 0 ? null : Math.min(1, Math.max(0, met / positive));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The score tile's note, from the current grade's checks: unknown judge items are left out of the
// score, so it is no bound on them; for unknown penalties it gives the score each way.
export function scoreNote(checks: readonly RubricRow[]): string | undefined {
  const unknown = checks.filter((c) => c.met === 'unknown');
  if (unknown.length === 0) return undefined;
  const items = `${plural(unknown.length, 'judge item')} unknown and not counted`;
  const penalties = unknown.filter((c) => c.kind === 'rubric' && (c.points ?? 0) < 0).length;
  const fired = rubricScore(checks, true);
  const not = rubricScore(checks, false);
  if (penalties === 0 || fired === null || not === null) return items;
  return `${items}; ${fired.toFixed(2)} if the unknown ${penalties === 1 ? 'penalty' : 'penalties'} fired, ${not.toFixed(2)} if not`;
}

// The rubric total: the points of every met item (penalties included) against the points of the
// positive items the judge answered, the most the score counts.
export function rubricTotal(rows: readonly RubricRow[]): { earned: number; possible: number; unknown: number } {
  return {
    earned: rows.filter((c) => c.met === true).reduce((n, c) => n + (c.points ?? 0), 0),
    possible: rows.filter((c) => c.met !== 'unknown' && (c.points ?? 0) > 0).reduce((n, c) => n + (c.points ?? 0), 0),
    unknown: rows.filter((c) => c.met === 'unknown').length,
  };
}

export const totalText = ({ earned, possible, unknown }: ReturnType<typeof rubricTotal>): string =>
  `${earned} of ${possible} points` + (unknown > 0 ? ` (${plural(unknown, 'unknown item')} not counted)` : '') + (earned < 0 && possible > 0 ? ' (score clipped to 0)' : '');
