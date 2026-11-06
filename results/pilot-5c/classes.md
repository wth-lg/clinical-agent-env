$ node cli/index.ts classes results/pilot-5c
# classes: results/pilot-5c

grader 22

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| message-queue | 8/8 | [0.68, 1.00] | 0 | 0 | 0 | 0 | 8/8 | 0 |
| results-inbox | 4/8 | [0.22, 0.78] | 4 | 0 | 0 | 0 | 4/8 | 0 |

## Classes

### message-queue

8 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS, 6 PASS, 7 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| same_patient | 1 (m11) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_date | 1 (m12) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| amended_or_error | 1 (m13) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0/0 | 0 | 0 |  |  |
| webb-c1 | Task/task-00023 | C | no | 0/0 | 0 | 0 |  |  |
| webb-b2 | Task/task-00024 | B | no | 0/0 | 0 | 0 |  |  |
| webb-a1 | Task/task-00023 | A | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Task/task-00023 | webb-a1 | yes | 1.00 (8 / 8) | [0.68, 1.00] | 0 / 0 / 0 / 0 | 8 / 8 |  |
| B | B | Task/task-t6-m14 |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |
| reserve | A | Task/task-t6-m16 | mercer-b1 | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 8 / 8 valid trials passed every non-lever item (S5 b_t).

### results-inbox

8 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 FAIL, 4 FAIL, 5 PASS, 6 FAIL, 7 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| hemolyzed | 1 (hemolyzed_note) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| corrected | 1 (corrected_down) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| aki | 1 (aki_48h) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| filler | 1 (normal_tsh) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_no_aki | 1 (marchetti_cr_ed) | 4/8 | 4/8 | 0.50 | [0.22, 0.78] | #3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#7: event_seen -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| patel-ldct-addendum | nodule_scheduled | O | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| brennan-k-corrected | hemolyzed_note | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| whitfield-cr-new | eie_baseline | A | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| parisian-cxr-prelim | prelim_negative | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| parisian-cta-corrected | prelim_negative | B | no | 0/0 | 0 | 0 |  |  |
| ondricka-k-new | corrected_down | A | no | 0/0 | 0 | 0 |  |  |
| brennan-k-hemolyzed | hemolyzed_note | D | no | 0/0 | 0 | 0 |  |  |
| whitfield-cr-outside | eie_baseline | D | no | 0/0 | 0 | 0 |  |  |
| marchetti-cr-batch | marchetti_cr_ed | A | yes | 4/8 | 4 | 0 | [0.22, 0.78] | #3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#7: event_seen -> retrieval |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | marchetti_cr_ed | marchetti-cr-batch | yes | 0.50 (4 / 8) | [0.22, 0.78] | 4 / 0 / 0 / 0 | 4 / 8 | #3: event_seen, amended -> retrieval, no<br>#4: event_seen, amended -> retrieval, no<br>#6: event_seen, amended -> retrieval, no<br>#7: event_seen, amended -> retrieval, no |
| B | B | nowicki_fax |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |
| reserve | B | cipriani_k_exception |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 |  |  |

base_pass 8 / 8 valid trials passed every non-lever item (S5 b_t).

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| message-queue | 8 | 8 | 8 | 8.00 | 8.00 |
| results-inbox | 8 | 4 | 4 | 4.00 | 4.00 |
