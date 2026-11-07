// The Plain terms card of the Glossary (P25u J7b, copy rules C1 and C6): one sentence per term a
// reader meets on the other pages, in the order they meet them, each under an anchor the other
// pages link to (a GlossaryLink whose anchor is the term's id). The numbers come from packages/core, never
// typed here (copy rule C7). No JSX, so apps/web/test and the e2e specs can import the list.
import { FINAL_PASS_BAND, FINAL_TRIALS_PER_TASK } from '../../../../packages/core/cost.ts';

export interface PlainTerm {
  // The anchor id, term-<slug>.
  id: string;
  term: string;
  // One sentence.
  text: string;
}

const N = FINAL_TRIALS_PER_TASK;
const BAND = `${FINAL_PASS_BAND[0] * 100}% to ${FINAL_PASS_BAND[1] * 100}%`;

export const PLAIN_TERMS: readonly PlainTerm[] = [
  { id: 'term-trial', term: 'trial', text: `One attempt by the model at one task, from a fresh copy of the world to its finish: the official run has ${N} trials per task.` },
  { id: 'term-gate-check', term: 'gate check', text: 'A yes-or-no check on what the trial left in the record, and a trial passes only when every gate check is met.' },
  { id: 'term-rubric-item', term: 'rubric item', text: 'A point of care quality a judge scores on the trial, counted as extra credit: the rubric score does not decide pass.' },
  { id: 'term-counted', term: 'counted trial', text: 'A trial that ended in a pass, a fail, a refusal or a stop at a limit: a trial broken by the infrastructure, the environment or the grader is not counted.' },
  { id: 'term-pass-rate', term: 'pass rate', text: 'The passes out of a task\'s counted trials, shown as passes of trials beside its interval and its verdict.' },
  { id: 'term-wilson', term: 'Wilson 95% interval', text: `The range of true pass rates that the counted trials make plausible, and it is wide because ${N} trials is a small sample.` },
  { id: 'term-band', term: 'band', text: `The target range for a task's pass rate, ${BAND}: a task was tuned until the model failed often enough to study and passed often enough to show the task can be done.` },
  { id: 'term-band-verdict', term: 'band verdict', text: 'Where a task\'s pass rate landed against the band: In band, Below band, Above band, or Saturated when the whole interval sits above it.' },
  { id: 'term-pass-k', term: 'pass^k', text: 'The chance that k trials of a task, drawn at random from its counted trials, all pass: pass^3 and pass^5 say how reliable a pass is, not only how often.' },
  { id: 'term-safe-pass', term: 'safe PASS', text: 'A passing trial in which no harm item was met, counted over the task\'s counted trials.' },
  { id: 'term-harm-item', term: 'harm item', text: 'A rubric item that marks something harmful the model did, such as an unsafe order, so a pass that meets one is a PASS with harm.' },
  { id: 'term-kind', term: 'kind of failure', text: 'The nearest cause of a model failure, such as retrieval (a needed record was never read) or reasoning (every record was read and the decision was still wrong).' },
  { id: 'term-fault', term: 'fault', text: 'Whose failure a non-pass trial is: the model\'s, the environment\'s, the grader\'s or the infrastructure\'s, and only the model\'s fault counts against the model.' },
  { id: 'term-m1-m5', term: 'M1–M5', text: 'Five checks that a model fault was a fair test: the records were reachable (M1), no tool broke (M2), the world matched (M3), the reference solution passes the grader (M4) and a human audit agrees (M5).' },
  { id: 'term-fhir-r4', term: 'FHIR R4', text: 'The standard format for electronic health records: the world is a set of FHIR R4 resources such as Patient, Observation and MedicationRequest.' },
  { id: 'term-world-hash', term: 'world hash', text: 'A fingerprint of every record in the world, so two worlds with one hash hold the same data and a trial\'s hash says which world it started from.' },
  { id: 'term-frozen-world', term: 'frozen world', text: 'The world a task was pinned to when its design was final: every official trial of that task starts from it, even after the build world moves on.' },
  { id: 'term-todays-build', term: "today's build", text: 'The world this build of the site holds, which Live trial and Try a read tool run on, and it may differ from a task\'s frozen world.' },
  { id: 'term-official-run', term: 'official run', text: `The run whose numbers are the result: ${N} trials per task, each on that task's frozen world.` },
  { id: 'term-pilot', term: 'pilot', text: 'A small run made before the official run to set each task\'s difficulty and to test the pipeline, and its numbers are not counted.' },
  { id: 'term-superseded', term: 'superseded version', text: 'An earlier version of a task that was replaced before the result, kept for the record and not counted.' },
  { id: 'term-effort', term: 'effort', text: 'The model\'s reasoning-effort setting, and the official run used one setting for every trial.' },
];
