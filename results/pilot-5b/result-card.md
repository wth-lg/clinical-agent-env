# Result card: pilot-5b

Model claude-opus-5-5, effort high. 24 valid trials over 3 tasks.
Summary: results/pilot-5b/summary.json. Classes: results/pilot-5b/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| discharge-medrec | 8/8 | [0.68, 1.00] | Above band | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 (0) |
| message-queue | 1/8 | [0.02, 0.47] | Below band | 0.13 | 0.00 | 0.00 | 0 | 0 | 0 (0) |
| results-inbox | 7/8 | [0.53, 0.98] | Above band | 0.88 | 0.63 | 0.38 | 0 | 0 | 0 (0) |

## Superseded versions

None.

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| discharge-medrec | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |
| message-queue | 7 | 7 | 0 | 0 | 0 | 0 | audit.jsonl |
| results-inbox | 1 | 1 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: none.

## Per class and per event

### discharge-medrec

8 valid trials. q (trials that saw every arrival): 8/8. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| potassium | 1 (kim-lisinopril) | 0/8 | 0/24 | 1.00 | [0.86, 1.00] |  |
|  | 2 (roberts-lisinopril) | 0/8 |  |  |  |  |
|  | 3 (whitcomb-lisinopril) | 0/8 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| brand | 1 (stark-carvedilol) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| fill_gap | 1 (stark-atorvastatin) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| fill_history | 1 (stark-glipizide) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| conditional | 1 (pruitt-metformin) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| kim-k1 | kim-lisinopril | O | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| kim-k2 | kim-furosemide | B | no | 0 | 0/0 | n/a | n/a |  |
| kim-d1 | kim-lisinopril | D | no | 0 | 0/0 | n/a | n/a |  |
| kim-d2 | kim-furosemide | D | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| kim-d4 | kim-omeprazole | D | no | 0 | 0/0 | n/a | n/a |  |
| stark-s1 | stark-carvedilol | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| stark-s2 | stark-atorvastatin | O | no | 0 | 0/0 | n/a | n/a |  |
| stark-d5 | stark-glipizide | D | no | 0 | 0/0 | n/a | n/a |  |
| roberts-r1 | roberts-lisinopril | A | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| whitcomb-a1 | whitcomb-lisinopril | A | no | 0 | 0/0 | n/a | n/a |  |
| whitcomb-a1-twin | whitcomb-lisinopril | A | no | 0 | 0/0 | n/a | n/a |  |

### message-queue

8 valid trials. q (trials that saw every arrival): 1/8. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| same_patient | 1 (m11) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_date | 1 (m12) | 7/8 | 7/8 | 0.13 | [0.02, 0.47] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #3: event_seen -> retrieval; #4: event_seen -> retrieval; #5: event_seen -> retrieval; #6: event_seen -> retrieval; #7: event_seen -> retrieval |
| amended_or_error | 1 (m13) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-c1 | Task/task-00023 | C | no | 0 | 0/0 | n/a | n/a |  |
| webb-b2 | Task/task-00024 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-a1 | Task/task-00023 | A | yes | 8 | 7/8 | 0.13 | [0.02, 0.47] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #3: event_seen -> retrieval; #4: event_seen -> retrieval; #5: event_seen -> retrieval; #6: event_seen -> retrieval; #7: event_seen -> retrieval |

### results-inbox

8 valid trials. q (trials that saw every arrival): 8/8. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 1/8 | 1/8 | 0.88 | [0.53, 0.98] | #1: decisive_seen -> retrieval |
| hemolyzed | 1 (hemolyzed_note) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| corrected | 1 (corrected_down) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| aki | 1 (aki_48h) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| filler | 1 (normal_tsh) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| misfiled | 1 (nowicki_fax) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

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
| marchetti-cr-batch | marchetti_cr_ed | A | no | 0 | 0/0 | n/a | n/a |  |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0 | 0/0 | n/a | n/a |  |

## Difficulty history

| task | pilot-5b |
|---|---|
| discharge-medrec | 8/8 Above band |
| message-queue | 1/8 Below band |
| results-inbox | 7/8 Above band |

## No failures

- discharge-medrec: No failures in 8 trials. Strictness evidence, matrix.json at grader_task_version 8f1468c535b9d939fb5187839afc9335c2764a8bd1acf9d2a2db636613134eeb: the oracle passes, 39 of 39 mutants fail as declared, 44 of 44 alternatives pass, the null agent fails.

