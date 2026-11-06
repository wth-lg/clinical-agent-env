# Pass rates

The definitions come first, then the numbers. Every number in this section is rendered from the final run's `summary.json`, its `classes.json`, its trial records, the pilot runs and `packages/core`. `pnpm docs:check` fails when a number here differs from a fresh regeneration.

<!-- docs-gen:block pass-definition -->

## Pass rate per task

<!-- docs-gen:block pass-rates -->

A task's verdict is the band verdict above, read on its k of n. Where a grader fix regraded a task after its run, the table shows the count as recorded beside the current one, with the regrade's tag. The pilot runs are not counted: the Difficulty history card on Findings shows how hard each task was before its final run. The colorectal task ran its final sample twice. Its first version ran before the record-integrity lever and landed above the band. The user chose a second version with one lever item, and that version's sample is the one counted. The first is shown for the record.

Four tasks are outside the band. The user's decision after the final run was to accept the result as measured and to disclose it. The Findings section says why each task landed where it did. The tables below say how much of each rate rests on the lever and on the review gates.

## The lever items

Each lever task carries one or two record-integrity items. Item A is a result filed silently beside the one the inbox names. Item B is a chart record whose deciding line a shallow read misreads. The first table reads the final run. The second reads the first pilot, where both items were active in every task. It checks the two mechanism predictions made before any pilot trial. A is caught less often than B, and a missed A is a retrieval miss with the sibling never shown.

<!-- docs-gen:block lever-items -->

## Pass rate without the silent-sibling item

Five of the six tasks share one failure route: a result filed silently beside the one the inbox names. The record-integrity lever copied that device from the contrast CT task into four tasks. The table counts a trial as a pass when its only failed gates are on that item. It shows how much of each rate rests on the one device.

<!-- docs-gen:block without-lever -->

## What a pass certifies

A pass says that every gate check of the current grade is met. It does not say the trial was perfect. A pass can carry a rubric score below the maximum, and a pass with a harm item met is counted apart as a safe pass. A refusal counts as a failure inside the denominator, and the rate without refusals is given beside it. A trial that stopped at a cap with no loop found is an environment limit. A human reviews it before the run goes on, and every pilot and the final run require none.

The outcome-only sensitivity grades the chart the trial left and nothing else. Under it, a trial whose action was right but whose review was incomplete counts as a pass. The seen and process gates fail such trials in the grade above. One grader fix of that family moved twelve trials of the colorectal task's first version.

<!-- docs-gen:block outcome-only -->

## How difficulty was set

The five lever tasks were tuned on pilot data from the same model, under a rule written down before the first pilot trial. The Findings section describes the rule and every departure from it. The tables below hold its numbers: the priors, the predictions, each pilot's count and the final count.

<!-- docs-gen:block lever-rule -->

## The second item of the results inbox against safe passes

The results inbox task has a second lever item, a fax filed to the wrong chart. The selection rule turned it off before the final run. The table reports it in the pilots that ran it, against safe passes as well as passes. A message that repeats the fax's finding without citing it would be a harm that the gates cannot see. The safe-pass count is the stricter reading.

<!-- docs-gen:block inbox-item-b -->

## Judge agreement and harm penalties

The judge never gates. The audit phase samples judged items and extractions from the final run, labels them by hand with the judge's answers hidden, and reports the agreement. A blinded second labeller and an LLM auditor read the failure labels, and the two kappas are reported. The block fills from `summary.json` once that phase has written it.

<!-- docs-gen:block judge-agreement -->

Two judge false positives are known from the clinician read, both score only. In the results inbox task, the penalty for naming another patient's matter fires on a message about the recipient's own naproxen. The criterion lists that drug among another patient's matters, so the blind judge reads it as hers. In the colorectal task, one outreach penalty was left unknown because the judge's quote was an elided paste. Neither moves an outcome. The audit phase reports them beside the agreement rates, and the criterion fix waits for a recalibration.

## Resolution of the band

The band is a check on a point estimate. Twenty trials tell apart a task the model mostly passes from one it mostly fails, and little more. The table below says how often a task with a given true pass rate lands in the band.

<!-- docs-gen:block band-resolution -->

Infrastructure outcomes are excluded from the denominator and rerun, as tau2-bench excludes infrastructure-errored calls from its denominators. An environment or grader fault is never excluded that way. It blocks the run until the fault is fixed and the run is regraded, or the affected trials are rerun. The final run holds no such fault.

## pass^k

<!-- docs-gen:block pass-k -->

## Cost per trial

<!-- docs-gen:block cost -->

## Example trajectories

<!-- docs-gen:block exemplars -->

## Requirement trace

Each sentence of the assignment and each user modification has a row in `docs/requirements/trace.json`. The row names the code, the tests, the evidence and an expect that checks it. `pnpm cli trace-check` runs in CI.

<!-- docs-gen:block trace -->
