// The chart as delivered (plan-amendment-w4 C1): the task's active mid-trial events (events.ts) and
// each member as the trial's steps leave it. An amend event that fired turns its member into the
// open gap expected.ts DELIVERED names; the gates (grader.ts) and the rubric (rubric.ts) read the
// member through memberNow, so neither grades the chart the agent never finished on.
import { activeSpecs, type EventSpec } from '../../../packages/env/events.ts';
import type { Step } from '../../../packages/grader/check.ts';
import { arrivalOf } from '../../../packages/grader/events.ts';
import * as events from '../events.ts';
import { DELIVERED, type Member } from '../expected.ts';

export const SPECS: readonly EventSpec[] = activeSpecs(events);
export const amendSpecOf = (patient: string): EventSpec | undefined => SPECS.find((s) => s.item === patient && s.class !== 'D');
// The member as the trial's chart delivered it: DELIVERED once its amend event fired, else itself.
export function memberNow(x: Member, steps: readonly Step[]): Member {
  const spec = amendSpecOf(x.patient);
  return spec !== undefined && arrivalOf(steps, spec.id) !== null ? DELIVERED[spec.id]! : x;
}
// Whether the member's amend event fired, so the event gates hold its answer.
export const handed = (x: Member, steps: readonly Step[]): boolean => memberNow(x, steps) !== x;
