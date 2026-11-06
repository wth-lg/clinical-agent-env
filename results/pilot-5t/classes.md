$ node cli/index.ts classes results/pilot-5t
# classes: results/pilot-5t

grader 22

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 3/8 | [0.14, 0.69] | 5 | 0 | 0 | 0 | 8/8 | 0 |

## Classes

### crc-care-gap

8 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 PASS, 5 FAIL, 6 PASS, 7 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 2/8 | 2/8 | 0.75 | [0.41, 0.93] | #0: fit_orders -> retrieval<br>#5: fit_orders -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 3/8 | 3/8 | 0.63 | [0.31, 0.86] | #1: nothing_for_others -> over_action<br>#2: fit_orders -> retrieval<br>#3: fit_orders -> retrieval |
| outside_fit_reissued | 1 (Marisol Elena Quintero) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 0/7 | 7 | 0 | [0.65, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-b3 | Patient/pt-0073 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-d2 | Patient/pt-0073 | D | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Patient/pt-0073 | crc-b3 | yes | 1.00 (8 / 8) | [0.68, 1.00] | 0 / 0 / 0 / 0 | 8 / 8 |  |
| reserve | B | Patient/pt-t3-baptiste |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 3 / 8 valid trials passed every non-lever item (S5 b_t).

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| crc-care-gap | 8 | 3 | 3 | 3.75 | 3.75 |
