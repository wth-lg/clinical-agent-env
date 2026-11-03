# Result card: final-1

Model claude-opus-5-5, effort high. 40 valid trials over 2 tasks.
Summary: results/runs/final-1/summary.json. Classes: results/runs/final-1/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 5/20 | [0.11, 0.47] | In band | 0.25 | 0.01 | <0.01 | 0 | 0 | 0 (0) |
| crc-care-gap | 18/20 | [0.70, 0.97] | Above band | 0.90 | 0.72 | 0.55 | 0 | 0 | 0 (0) |

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 15 | 15 | 0 | 0 | 0 | 0 | audit.jsonl |
| crc-care-gap | 2 | 2 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: 12.
- crc-care-gap/0: FAIL at grader 21, PASS at grader 22
- crc-care-gap/12: FAIL at grader 21, PASS at grader 22
- crc-care-gap/14: FAIL at grader 21, PASS at grader 22
- crc-care-gap/17: FAIL at grader 21, PASS at grader 22
- crc-care-gap/18: FAIL at grader 21, PASS at grader 22
- crc-care-gap/19: FAIL at grader 21, PASS at grader 22
- crc-care-gap/1: FAIL at grader 21, PASS at grader 22
- crc-care-gap/2: FAIL at grader 21, PASS at grader 22
- crc-care-gap/5: FAIL at grader 21, PASS at grader 22
- crc-care-gap/6: FAIL at grader 21, PASS at grader 22
- crc-care-gap/7: FAIL at grader 21, PASS at grader 22
- crc-care-gap/8: FAIL at grader 21, PASS at grader 22

## Per class and per event

### contrast-ct-prep

20 valid trials. q (trials that saw every arrival): 5/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| unclassified | 1 (Patient/pt-0015) | 0/20 | 15/80 | 0.81 | [0.71, 0.88] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval; #4: event_seen -> retrieval; #5: event_seen -> retrieval; #6: event_seen -> retrieval; #8: event_seen -> retrieval; #9: event_seen -> retrieval; #10: event_seen -> retrieval; #12: event_seen -> retrieval; #13: event_seen -> retrieval; #15: event_seen -> retrieval; #18: event_seen -> retrieval; #19: event_seen -> retrieval |
|  | 2 (Patient/pt-0046) | 0/20 |  |  |  |  |
|  | 3 (Patient/pt-0047) | 15/20 |  |  |  |  |
|  | 4 (Patient/pt-0049) | 0/20 |  |  |  |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| t5-mohr-scr |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| t5-ferreira-scr |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| t5-schuster-rxn |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| t5-beahan-rxn |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |

### crc-care-gap

20 valid trials. q (trials that saw every arrival): 20/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| unclassified | 1 (Patient/pt-0009) | 1/20 | 2/80 | 0.97 | [0.91, 0.99] | #3: fit_orders -> retrieval; #4: fit_orders -> retrieval |
|  | 2 (Patient/pt-0020) | 0/20 |  |  |  |  |
|  | 3 (Patient/pt-0022) | 0/20 |  |  |  |  |
|  | 4 (Patient/pt-0024) | 1/20 |  |  |  |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-d1 |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-b2 |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-o1 |  |  | no | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |

## Difficulty history

| task | pilot-4a | pilot-4b | final-1 |
|---|---|---|---|
| contrast-ct-prep | 1/4 In band | none | 5/20 In band |
| crc-care-gap | 2/4 In band | 4/4 Above band | 18/20 Above band |
| discharge-medrec | 4/4 Above band | none | none |
| message-queue | 4/4 Above band | none | none |
| renal-dose-review | 4/4 Above band | none | none |
| results-inbox | 4/4 Above band | none | none |

## No failures

No task with valid trials passed every trial.

