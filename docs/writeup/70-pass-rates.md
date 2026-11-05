# Pass rates

The definitions come first, then the numbers. Every number in this section is rendered from the final run's `summary.json` and from `packages/core`. `pnpm docs:check` fails when a number here differs from a fresh regeneration.

<!-- docs-gen:block pass-definition -->

## Pass rate per task

<!-- docs-gen:block pass-rates -->

A task's verdict is the band verdict above, read on its k of n. The pilot runs are not counted: the Difficulty history card on Findings shows how hard each task was before its final run. TODO-W5F: the four lever tasks join this table after their final run.

Five of the six tasks share one failure route: a result filed silently beside the one the inbox names. The record-integrity lever copied that device from the contrast CT task into four tasks. Every failure of the contrast CT task in the final run is that route. TODO-W5F: a per-task pass rate without the silent-sibling item is generated here once the lever tasks' final run is committed. It shows how much of each rate rests on that one device.

## What a pass certifies

A pass says that every gate check of the current grade is met. It does not say the trial was perfect. A pass can carry a rubric score below the maximum, and a pass with a harm item met is counted apart as a safe pass. A refusal counts as a failure inside the denominator, and the rate without refusals is given beside it. A trial that stopped at a cap with no loop found is an environment limit. A human reviews it before the run goes on, and every pilot and the final run require none.

A sensitivity line is planned and is not in this version. It is the pass rate when only the final state is graded against the reference solution's. Under it, a trial whose action was right but whose review was incomplete counts as a pass. The seen and process gates fail such trials today, and one grader fix of that family moved twelve trials of the colorectal task. The line is generated from the records once it is built. TODO-W5F: the strict points of the four lever tasks are listed here once their run is final.

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
