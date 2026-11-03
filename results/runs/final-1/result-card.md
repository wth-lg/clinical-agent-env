# Result card: final-1

Model claude-opus-5-5, effort high. 40 valid trials over 2 tasks.
Summary: results/runs/final-1/summary.json. Classes: results/runs/final-1/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 5/20 | [0.11, 0.47] | In band | 0.25 | 0.01 | <0.01 | 0 | 0 | 0 (0) |
| crc-care-gap | 6/20 | [0.15, 0.52] | In band | 0.30 | 0.02 | <0.01 | 0 | 0 | 0 (0) |

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 15 | 15 | 0 | 0 | 0 | 0 | cli classes |
| crc-care-gap | 14 | 14 | 0 | 0 | 0 | 0 | cli classes |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: none.

## Per class and per event

### contrast-ct-prep

20 valid trials. q (trials that saw every arrival): 5/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| egfr_window | 1 (Britt Vincenzo Mohr) | 15/20 | 15/20 | 0.25 | [0.11, 0.47] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval; #4: event_seen -> retrieval; #5: event_seen -> retrieval; #6: event_seen -> retrieval; #8: event_seen -> retrieval; #9: event_seen -> retrieval; #10: event_seen -> retrieval; #12: event_seen -> retrieval; #13: event_seen -> retrieval; #15: event_seen -> retrieval; #18: event_seen -> retrieval; #19: event_seen -> retrieval |
| allergy_grade | 1 (Daniel Ferreira) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| metformin_hold | 1 (Anisha Margarita Schuster) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| filler | 1 (Lauren Sixta Beahan) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| t5-mohr-scr | Patient/pt-0047 | A | yes | 20 | 15/20 | 0.25 | [0.11, 0.47] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval; #4: event_seen -> retrieval; #5: event_seen -> retrieval; #6: event_seen -> retrieval; #8: event_seen -> retrieval; #9: event_seen -> retrieval; #10: event_seen -> retrieval; #12: event_seen -> retrieval; #13: event_seen -> retrieval; #15: event_seen -> retrieval; #18: event_seen -> retrieval; #19: event_seen -> retrieval |
| t5-ferreira-scr | Patient/pt-0015 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| t5-schuster-rxn | Patient/pt-0049 | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| t5-beahan-rxn | Patient/pt-0046 | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| t5-ferreira-msg | Patient/pt-0015 | D | no | 0 | 0/0 | n/a | n/a |  |

### crc-care-gap

20 valid trials. q (trials that saw every arrival): 20/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 8/20 | 8/20 | 0.60 | [0.39, 0.78] | #0: fit_orders -> retrieval; #1: fit_orders -> retrieval; #3: fit_orders -> retrieval; #4: fit_orders -> retrieval; #6: fit_orders -> retrieval; #7: fit_orders -> retrieval; #8: fit_orders -> retrieval; #12: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 8/20 | 8/20 | 0.60 | [0.39, 0.78] | #0: fit_orders -> retrieval; #2: fit_orders -> retrieval; #4: fit_orders -> retrieval; #7: fit_orders -> retrieval; #14: fit_orders -> retrieval; #17: fit_orders -> retrieval; #18: fit_orders -> retrieval; #19: fit_orders -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 2/20 | 2/20 | 0.90 | [0.70, 0.97] | #4: fit_orders -> retrieval; #5: fit_orders -> retrieval |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |

## Difficulty history

| task | pilot-4a | pilot-4b | final-1 |
|---|---|---|---|
| contrast-ct-prep | 1/4 In band | none | 5/20 In band |
| crc-care-gap | 2/4 In band | 4/4 Above band | 6/20 In band |
| discharge-medrec | 4/4 Above band | none | none |
| message-queue | 4/4 Above band | none | none |
| renal-dose-review | 4/4 Above band | none | none |
| results-inbox | 4/4 Above band | none | none |

## No failures

No task with valid trials passed every trial.

