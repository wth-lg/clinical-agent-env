# Result card: pilot-4b

Model claude-opus-5-5, effort high. 4 valid trials over 1 tasks.
Summary: results/pilot-4b/summary.json. Classes: results/pilot-4b/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 4/4 | [0.51, 1.00] | Above band | 1.00 | 1.00 | n/a | 0 | 0 | 0 (0) |

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| crc-care-gap | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: 1.
- crc-care-gap/1: FAIL at grader 19, PASS at grader 22

## Per class and per event

### crc-care-gap

4 valid trials. q (trials that saw every arrival): 4/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |

## Difficulty history

| task | pilot-4a | pilot-4b |
|---|---|---|
| contrast-ct-prep | 1/4 In band | none |
| crc-care-gap | 2/4 In band | 4/4 Above band |
| discharge-medrec | 4/4 Above band | none |
| message-queue | 4/4 Above band | none |
| renal-dose-review | 4/4 Above band | none |
| results-inbox | 4/4 Above band | none |

## No failures

- crc-care-gap: No failures in 4 trials. Strictness evidence, matrix.json at grader_task_version d0f6e5025c4d37d27f0b28f4ff0fcb3e0ea58978974c60bfbb147ee2c1574716: the oracle passes, 33 of 33 mutants fail as declared, 20 of 20 alternatives pass, the null agent fails.

