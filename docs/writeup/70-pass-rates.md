# Pass rates

The definitions come first, then the numbers. Every number in this section is rendered from the final run's `summary.json` and from `packages/core`. `pnpm docs:check` fails when a number here differs from a fresh regeneration.

<!-- docs-gen:block pass-definition -->

## Pass rate per task

<!-- docs-gen:block pass-rates -->

A task's verdict is the band verdict above, read on its k of n. The pilot runs are not counted: the Difficulty history card on Findings shows how hard each task was before its final run. TODO-W5F: the four lever tasks join this table after their final run.

## What a pass certifies

A pass says that every gate check of the current grade is met. It does not say the trial was perfect. A pass can carry a rubric score below the maximum, and a pass with a harm item met is counted apart as a safe pass. A refusal counts as a failure inside the denominator, and the rate without refusals is given beside it. A trial that stopped at a cap with no loop found is an environment limit. A human reviews it before the run goes on, and every pilot and the final run require none. TODO-W5F: the strict points of the four lever tasks are listed here once their run is final.

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
