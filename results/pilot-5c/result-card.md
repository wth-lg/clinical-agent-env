# Result card: pilot-5c

Model claude-opus-5-5, effort high. 16 valid trials over 2 tasks.
Summary: results/pilot-5c/summary.json. Classes: results/pilot-5c/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| message-queue | 8/8 | [0.68, 1.00] | Above band | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 (0) |
| results-inbox | 4/8 | [0.22, 0.78] | In band | 0.50 | 0.07 | 0.00 | 0 | 0 | 0 (0) |

## Superseded versions

None.

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| message-queue | 0 | 0 | 0 | 0 | 0 | 0 | cli classes |
| results-inbox | 4 | 4 | 0 | 0 | 0 | 0 | cli classes |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: none.

## Per class and per event

### message-queue

8 valid trials. q (trials that saw every arrival): 8/8. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| same_patient | 1 (m11) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_date | 1 (m12) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| amended_or_error | 1 (m13) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-c1 | Task/task-00023 | C | no | 0 | 0/0 | n/a | n/a |  |
| webb-b2 | Task/task-00024 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-a1 | Task/task-00023 | A | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |

### results-inbox

8 valid trials. q (trials that saw every arrival): 4/8. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| hemolyzed | 1 (hemolyzed_note) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| corrected | 1 (corrected_down) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| aki | 1 (aki_48h) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| filler | 1 (normal_tsh) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_no_aki | 1 (marchetti_cr_ed) | 4/8 | 4/8 | 0.50 | [0.22, 0.78] | #3: event_seen -> retrieval; #4: event_seen -> retrieval; #6: event_seen -> retrieval; #7: event_seen -> retrieval |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| patel-ldct-addendum | nodule_scheduled | O | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| brennan-k-corrected | hemolyzed_note | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| whitfield-cr-new | eie_baseline | A | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| parisian-cxr-prelim | prelim_negative | D | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| parisian-cta-corrected | prelim_negative | B | no | 0 | 0/0 | n/a | n/a |  |
| ondricka-k-new | corrected_down | A | no | 0 | 0/0 | n/a | n/a |  |
| brennan-k-hemolyzed | hemolyzed_note | D | no | 0 | 0/0 | n/a | n/a |  |
| whitfield-cr-outside | eie_baseline | D | no | 0 | 0/0 | n/a | n/a |  |
| marchetti-cr-batch | marchetti_cr_ed | A | yes | 8 | 4/8 | 0.50 | [0.22, 0.78] | #3: event_seen -> retrieval; #4: event_seen -> retrieval; #6: event_seen -> retrieval; #7: event_seen -> retrieval |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0 | 0/0 | n/a | n/a |  |

## Difficulty history

| task | pilot-5c |
|---|---|
| message-queue | 8/8 Above band |
| results-inbox | 4/8 In band |

## No failures

- message-queue: No failures in 8 trials. The run has no matrix.json; the evidence is `pnpm cli matrix --task message-queue` (the reference solution passes and every probe gives the verdict expected; the Tasks view runs the same probes).

