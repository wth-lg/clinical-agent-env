// The graded live card's and Your runs row's score line and their link to the trial page of
// run=session (trace row N10): the rubric score as the Score card shows it (trial/rubric.ts
// scoreText over the record's current grade, summary.ts currentGrade, the one the Grading tab
// reads), so the graded result is visible without a click; the full grade (gate checks, rubric
// rows, attribution, trajectory) is one click away on the page. Pure.
import type { ExplainRecord } from '../../../../packages/core/explain.ts';
import { currentGrade } from '../../../../packages/core/summary.ts';
import { freshView } from '../shell/views.ts';
import { scoreText } from '../trial/rubric.ts';
import { SESSION_RUN } from '../trial/session.ts';

// The Score card's value for a record, or null without a record or a grade.
export const liveScore = (record: ExplainRecord | null): string | null => (record === null ? null : scoreText(currentGrade(record)));

// The URL patch that opens the trial page of run=session for a trial, with no other view state
// carried over (views.ts freshView).
export const sessionTrialPatch = (trialId: string): Record<string, string | null> => freshView('runs', { run: SESSION_RUN, trial: trialId });
