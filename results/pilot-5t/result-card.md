# Result card: pilot-5t

Model claude-opus-5-5, effort high. 8 valid trials over 1 tasks.
Summary: results/pilot-5t/summary.json. Classes: results/pilot-5t/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 3/8 | [0.14, 0.69] | In band | 0.38 | 0.02 | 0.00 | 0 | 0 | 0 (0) |

## Superseded versions

None.

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| crc-care-gap | 5 | 5 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: none.

## Per class and per event

### crc-care-gap

8 valid trials. q (trials that saw every arrival): 8/8. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 2/8 | 2/8 | 0.75 | [0.41, 0.93] | #0: fit_orders -> retrieval; #5: fit_orders -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 3/8 | 3/8 | 0.63 | [0.31, 0.86] | #1: nothing_for_others -> over_action; #2: fit_orders -> retrieval; #3: fit_orders -> retrieval |
| outside_fit_reissued | 1 (Marisol Elena Quintero) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 7 | 0/7 | 1.00 | [0.65, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| crc-b3 | Patient/pt-0073 | B | yes | 8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| crc-d2 | Patient/pt-0073 | D | no | 0 | 0/0 | n/a | n/a |  |

## Difficulty history

| task | pilot-5t |
|---|---|
| crc-care-gap | 3/8 In band |

## No failures

No task with valid trials passed every trial.

