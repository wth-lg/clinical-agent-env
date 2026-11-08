// One plain line on how a run was graded, when it is not plainly today's grader on today's world:
// "Graded with grader 3 on an older world than today's; a regrade with grader 4 gives the same
// outcomes." Trials on their task's frozen world are said so, apart from an older world (R37),
// as a count out of the run's trials with their tasks, so the count never reads as the run's
// size (eval-p25u-2 S6: "(20 trials, ...)" sat beside a 120-trial list). Apart from results.ts,
// whose import.meta.glob the root typecheck cannot read, so apps/web/test reaches it.
import type { Grading } from './run-types.ts';

export function gradingLine(g: Grading): string | null {
  if (g.olderWorld === 0 && g.frozenWorld === 0 && g.regrade === null) return null;
  let graded = `Graded with grader ${g.graders.join(' and ')}${g.olderWorld > 0 ? ' on an older world than today\'s' : ''}`;
  if (g.frozenWorld > 0) {
    const rest = g.trials - g.frozenWorld;
    const tasks = g.frozenTasks.length > 0 ? ` (${g.frozenTasks.join(', ')})` : '';
    graded += `. ${g.frozenWorld} of the ${g.trials} trials${tasks} started from ${g.frozenWorld === 1 ? 'its' : 'their'} task's frozen world, not today's build (results/tasks-final.json)`;
    if (g.olderWorld === 0 && rest > 0) graded += `; the other ${rest} started from today's build`;
  }
  if (g.regrade === null) return `${graded}.`;
  const changed = g.regrade.changed;
  return `${graded}; a regrade with grader ${g.regrade.graders.join(' and ')} gives ${changed.length === 0 ? 'the same outcomes' : `a different outcome for ${changed.join(', ')}`}.`;
}
