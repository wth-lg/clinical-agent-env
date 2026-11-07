// The graded live card's score line and its link to the trial page of run=session (trace row
// N10): the rubric score under the Score card's own title (trial/rubric.ts SCORE_TITLE), from the
// record's current grade as the Grading tab reads it (summary.ts currentGrade), so the graded
// result is visible on the card without a click; the full grade (gate checks, rubric rows,
// attribution, trajectory) is one click away on the page. Pure.
import type { ExplainRecord } from '../../../../packages/core/explain.ts';
import { currentGrade } from '../../../../packages/core/summary.ts';
import { freshView } from '../shell/views.ts';
import { SCORE_TITLE } from '../trial/rubric.ts';
import { SESSION_RUN } from '../trial/session.ts';

export interface LiveGrade {
  title: string;
  value: string;
}

// The score line of a graded record, or null when the record has no grade (a cancelled or
// errored trial, or no checks) or no score.
export function liveGrade(record: ExplainRecord | null): LiveGrade | null {
  if (record === null) return null;
  const g = currentGrade(record);
  if ((g.checks ?? []).length === 0 || typeof g.score !== 'number') return null;
  return { title: SCORE_TITLE, value: g.score.toFixed(2) };
}

// The URL patch that opens the trial page of run=session for a trial, with no other view state
// carried over (views.ts freshView).
export const sessionTrialPatch = (trialId: string): Record<string, string | null> => freshView('runs', { run: SESSION_RUN, trial: trialId });
