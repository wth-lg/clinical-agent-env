// Harm on screen (pre-audit B2b, P17j JU3): the rubric items that make a PASS a PASS with harm, by
// the one rule summary.json's pass_no_harm counts by (packages/core/summary.ts isHarmItem: a met or
// unknown rubric item of HARM_POINTS or fewer points), on the current grade, so a regrade wins.
import { currentGrade, isHarmItem, type SummaryCheck } from '../../../../packages/core/summary.ts';

export interface HarmItem {
  id: string;
  // null for the "no checks recorded" item.
  points: number | null;
  // The judge could not answer it, or no checks were recorded: the PASS may carry harm.
  unknown: boolean;
  // The rubric item's question, when the page has loaded the task's checks.
  text?: string;
}

// Only a valid PASS has harm items (F2). A PASS whose current grade stored no checks may carry harm
// that nothing recorded, as pass_no_harm does not count it as harmless (F1).
export function harmItems(record: Parameters<typeof currentGrade>[0]): HarmItem[] {
  const g = currentGrade(record);
  if (!g.valid || g.outcome !== 'PASS') return [];
  if (g.checks === null) return [{ id: 'no checks recorded', points: null, unknown: true }];
  return g.checks.filter((c: SummaryCheck) => isHarmItem(c)).map((c) => ({ id: c.id, points: c.points as number, unknown: c.met === 'unknown' }));
}

// "safe PASS k/n": the valid PASS trials with no harm, over the valid trials (summary.json).
export const safePass = (s: { pass_no_harm: number; trials: number }): string => `safe PASS ${s.pass_no_harm}/${s.trials}`;
