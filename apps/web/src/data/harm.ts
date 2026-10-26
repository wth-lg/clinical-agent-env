// Harm on screen (pre-audit B2b, P17j JU3): the rubric items that make a PASS a PASS with harm, by
// the rule summary.json's pass_no_harm counts by (packages/core/summary.ts HARM_POINTS: a met or
// unknown rubric item of HARM_POINTS or fewer points, on the current grade, so a regrade wins).
import { currentGrade, HARM_POINTS, type SummaryCheck } from '../../../../packages/core/summary.ts';

export interface HarmItem {
  id: string;
  points: number;
  // The judge could not answer it: the PASS may carry this harm.
  unknown: boolean;
}

export function harmItems(record: Parameters<typeof currentGrade>[0]): HarmItem[] {
  const g = currentGrade(record);
  if (g.outcome !== 'PASS') return [];
  return (g.checks ?? [])
    .filter((c: SummaryCheck) => c.kind === 'rubric' && (c.met === true || c.met === 'unknown') && typeof c.points === 'number' && c.points <= HARM_POINTS)
    .map((c) => ({ id: c.id, points: c.points as number, unknown: c.met === 'unknown' }));
}

// "safe PASS k/n": the valid PASS trials with no harm, over the valid trials (summary.json).
export const safePass = (s: { pass_no_harm: number; trials: number }): string => `safe PASS ${s.pass_no_harm}/${s.trials}`;
