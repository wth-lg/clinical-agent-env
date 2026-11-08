// The Live trial view's words (P25u slice S4): a stopped trial says the user stopped it (A1b),
// a dead runner says what happened and what to do (A2), the grade button and the score line
// read the same on the card and the Your runs row (A5), the launcher's cost line leads with the
// typical cost (A7), the over-cap sentence names the cap that fits (A7), the State pane lists
// writes in words (A9), the empty state's duration comes from the official run (J14), and Your
// runs shows the latest five runs (A15).
import { describe, expect, it } from 'vitest';
import {
  durationWords, gradeButtonLabel, infraWords, launcherStatus, overCapText, RUNNER_STOPPED, runsErrorLead, runsShown, scoreLine, STOPPED_LABEL, STOPPED_REASON, writeWords,
} from '../src/live/copy.ts';
import { costLine } from '../src/live/typical.ts';
import { neededCap, raiseTo } from '../src/spend/cap.ts';

// eval-p25u-2 S8: the launcher's status region announces each state the launcher is in; the
// trial card's own status line announces running, graded and stopped once a card is open.
describe('S8: the launcher status the live region announces', () => {
  const idle = { noKey: false, busy: false, started: null, refusal: null, runsError: null, down: false, task: 'Practice task', fits: true };
  it('names the no-key, ready, starting and started states', () => {
    expect(launcherStatus({ ...idle, noKey: true })).toBe('No API key yet. Add a key to run trials.');
    expect(launcherStatus(idle)).toBe('Ready to run Practice task.');
    expect(launcherStatus({ ...idle, task: null })).toBe('Pick a task to run.');
    expect(launcherStatus({ ...idle, fits: false })).toBe('No batch size fits the session cap. Raise the cap to run.');
    expect(launcherStatus({ ...idle, busy: true })).toBe('Starting the batch.');
    expect(launcherStatus({ ...idle, started: 1 })).toBe('Started 1 trial. Its status is in the trial card below.');
    expect(launcherStatus({ ...idle, started: 3 })).toBe('Started 3 trials. Their status is in the trial card below.');
  });

  it('errors come first: a dead runner, a refused batch, runs that did not load', () => {
    expect(launcherStatus({ ...idle, down: true, refusal: 'x' })).toBe(RUNNER_STOPPED);
    expect(launcherStatus({ ...idle, refusal: 'The session cap is reached.', started: 1 })).toBe('The batch did not start: The session cap is reached.');
    expect(launcherStatus({ ...idle, runsError: 'HTTP 500' })).toBe('Your runs did not load.');
  });
});

describe('A1b: a trial the user stopped', () => {
  it('says the user stopped it, that it is not counted, and that it says nothing about the model', () => {
    expect(STOPPED_REASON).toBe('You stopped this trial. It is not counted and says nothing about the model.');
    expect(STOPPED_LABEL).toBe('Stopped: not counted');
  });
});

// Gate P25U-S4 F1: "API problem" only when the API failed (copy rule C4); a harness defect says
// so; a spend refusal never advises "run again", since the same cap refuses it again.
describe('A1: the infra chip and status words agree with the outcome', () => {
  it('INFRA_API is an API problem, to run again', () => {
    expect(infraWords('INFRA_API', 'overloaded_error')).toEqual({ chip: 'API problem: not counted, run again', status: 'API problem, not counted' });
  });

  it('INFRA_HARNESS with an unpriced usage is an infrastructure problem', () => {
    expect(infraWords('INFRA_HARNESS', 'unpriced_usage')).toEqual({ chip: 'Infrastructure problem: not counted, run again', status: 'Infrastructure problem, not counted' });
  });

  it('INFRA_HARNESS with a client error is an infrastructure problem', () => {
    expect(infraWords('INFRA_HARNESS', 'client_error')).toEqual({ chip: 'Infrastructure problem: not counted, run again', status: 'Infrastructure problem, not counted' });
  });

  it('INFRA_HARNESS from a spend refusal (the ledger\'s codes) says so and does not advise running again', () => {
    for (const code of ['spend_refused_projected', 'spend_refused_actual', 'spend_refused_ceiling']) {
      expect(infraWords('INFRA_HARNESS', code), code).toEqual({ chip: 'Spend refused: not counted', status: 'Spend refused, not counted' });
    }
  });

  it('INVALID with model_mismatch says another model answered and that the batch stopped, with no "run again"', () => {
    expect(infraWords('INVALID', 'model_mismatch')).toEqual({ chip: 'Wrong model answered: not counted, the batch stopped', status: 'Wrong model answered, not counted' });
  });

  it('CANCELLED is the stopped trial', () => {
    expect(infraWords('CANCELLED', null)).toEqual({ chip: STOPPED_LABEL, status: STOPPED_LABEL });
  });

  it('a counted outcome has no infra words', () => {
    expect(infraWords('FAIL', null)).toBeNull();
    expect(infraWords('PASS', 'x')).toBeNull();
  });
});

describe('A2: the runner stopped', () => {
  it('names what happened, the next step with its command, and that the page reconnects', () => {
    expect(RUNNER_STOPPED).toBe('The local runner stopped. Start it again in your terminal (pnpm start); this page reconnects by itself.');
  });

  it('says the other pages still work only on the hosted site, where no runner serves them', () => {
    expect(runsErrorLead(true)).toBe('Your runs did not load. The other pages still work.');
    expect(runsErrorLead(false)).toBe('Your runs did not load.');
  });
});

describe('A5: the grade button and the score line', () => {
  it('a non-pass gets "See why it failed", a PASS "See the grade"', () => {
    expect(gradeButtonLabel('FAIL')).toBe('See why it failed');
    expect(gradeButtonLabel('LIMIT')).toBe('See why it failed');
    expect(gradeButtonLabel('PASS')).toBe('See the grade');
  });

  it('keeps the Score card title, says the score is out of 1, and that the gate checks decide pass', () => {
    expect(scoreLine('1.00')).toBe('Rubric score (does not decide pass) 1.00 of 1. Penalties can lower it; the pass or fail comes from the gate checks.');
    expect(scoreLine('0.80', false)).toBe('Rubric score (does not decide pass) 0.80 of 1');
  });
});

describe('A7: the cost beside each Run button', () => {
  // eval-p25u-2 S5: the typical cost says its basis (a pilot median), as the key gate's range
  // says its own (the final run's mean per task), so the two figures never read as one.
  it('leads with the typical cost of one trial and its basis, then what the batch holds', () => {
    expect(costLine(1.66, 7.9, true)).toBe('about $1.66 a trial (pilot median) · holds up to $7.90');
    expect(costLine(null, 7.9, true)).toBe('holds up to $7.90');
  });

  it('an amount priced from a pilot p90 is an estimate, not a hold', () => {
    expect(costLine(1.66, 7.9, false)).toBe('about $1.66 a trial (pilot median) · about $7.90 (pilot p90)');
    expect(costLine(null, 7.9, false)).toBe('about $7.90 (pilot p90)');
  });

  it('the cap a batch needs is the next whole dollar above its cost plus what is committed', () => {
    expect(neededCap(21.7, 0.19)).toBe(22);
    expect(neededCap(22.823, 0.011)).toBe(23);
    expect(neededCap(20, 0)).toBe(20);
    expect(neededCap(7.60768, 0.011)).toBe(8);
  });

  it('the cap to raise to is the next multiple of $5 at or above the need; none above the session maximum (gate F3)', () => {
    expect(raiseTo(22)).toBe(25);
    expect(raiseTo(20)).toBe(20);
    expect(raiseTo(140)).toBe(140);
    expect(raiseTo(950)).toBe(950);
    expect(raiseTo(951)).toBeNull();
    expect(raiseTo(10_000)).toBeNull();
  });

  it('a batch that needs more than the session maximum says so instead of asking for a cap the field refuses (gate F3)', () => {
    expect(overCapText([20], { 20: 999.5 }, 0.5)).toBe('Run ×20 needs $1000, more than the session maximum of $950.');
    expect(overCapText([10, 20], { 10: 960, 20: 1900 }, 0)).toBe('Run ×10 needs $960, more than the session maximum of $950; ×20 needs more still.');
    expect(overCapText([3, 20], { 3: 21.7, 20: 1900 }, 0.19)).toBe('Run ×3 needs a cap of $22 or more; ×20 needs more still.');
  });

  it('the over-cap sentence names the cap the smallest over size needs, and says the larger ones need more', () => {
    expect(overCapText([3], { 3: 21.7 }, 0.19)).toBe('Run ×3 needs a cap of $22 or more.');
    expect(overCapText([3, 10, 20], { 3: 21.7, 10: 70, 20: 139 }, 0.19)).toBe('Run ×3 needs a cap of $22 or more; ×10 and ×20 need more still.');
    expect(overCapText([1, 3, 10, 20], { 1: 7.61, 3: 22.82, 10: 76.08, 20: 152.15 }, 0.01)).toBe('Run ×1 needs a cap of $8 or more; ×3, ×10 and ×20 need more still.');
    expect(overCapText([10, 20], { 10: 70, 20: 139 }, 0)).toBe('Run ×10 needs a cap of $70 or more; ×20 needs more still.');
  });
});

describe('A9: writes in words', () => {
  it('names the kind of record before its id', () => {
    expect(writeWords('DocumentReference/doc-t0001')).toBe('Note');
    expect(writeWords('ServiceRequest/sr-9')).toBe('Order');
    expect(writeWords('MedicationRequest/mr-9')).toBe('Medication order');
    expect(writeWords('Communication/c-1')).toBe('Message');
    expect(writeWords('Provenance/prov-1')).toBe('Provenance record');
    expect(writeWords('Task/t-1')).toBe('Task');
  });

  it('an unknown type reads as its name with spaces', () => {
    expect(writeWords('AllergyIntolerance/a-1')).toBe('Allergy intolerance');
    expect(writeWords('no-slash')).toBe('Record');
  });
});

describe('J14: the duration in the empty state', () => {
  it('is the range of the tasks\' median durations, in whole minutes', () => {
    expect(durationWords([186, 288])).toBe('about 3 to 5 minutes');
    expect(durationWords([186, 200, 210])).toBe('about 3 to 4 minutes');
  });

  it('one minute reads as a single figure; under a minute as under a minute', () => {
    expect(durationWords([240, 250])).toBe('about 4 minutes');
    expect(durationWords([20])).toBe('under a minute');
    expect(durationWords([])).toBeNull();
  });
});

describe('A15: Your runs shows the latest five runs', () => {
  const runs = (n: number) => Array.from({ length: n }, (_, i) => ({ runId: `r${i}` }));
  it('with five or fewer runs, every run shows and nothing is hidden', () => {
    expect(runsShown(runs(5), false)).toEqual({ shown: runs(5).reverse(), hidden: 0 });
  });

  it('with more, the latest five show, newest first, and the rest are counted as hidden', () => {
    const { shown, hidden } = runsShown(runs(8), false);
    expect(shown.map((r) => r.runId)).toEqual(['r7', 'r6', 'r5', 'r4', 'r3']);
    expect(hidden).toBe(3);
    expect(runsShown(runs(8), true)).toEqual({ shown: runs(8).reverse(), hidden: 0 });
  });
});
