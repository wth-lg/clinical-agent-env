# Result card: final-1

Model claude-opus-5-5, effort high. 120 valid trials over 6 tasks.
Summary: results/runs/final-1/summary.json. Classes: results/runs/final-1/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 5/20 | [0.11, 0.47] | In band | 0.25 | 0.01 | <0.01 | 0 | 0 | 0 (0) |
| crc-care-gap | 15/20 | [0.53, 0.89] | Above band | 0.75 | 0.40 | 0.19 | 0 | 0 | 0 (0) |
| discharge-medrec | 20/20 | [0.84, 1.00] | Saturated | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 (0) |
| message-queue | 20/20 | [0.84, 1.00] | Saturated | 1.00 | 1.00 | 1.00 | 0 | 0 | 0 (0) |
| renal-dose-review | 16/20 | [0.58, 0.92] | Above band | 0.80 | 0.49 | 0.28 | 0 | 0 | 0 (0) |
| results-inbox | 12/20 | [0.39, 0.78] | In band | 0.60 | 0.19 | 0.05 | 0 | 0 | 0 (0) |

## Superseded versions

A superseded version is a task as it was before it was changed (R42); its trials stay as recorded beside the current version and are not counted.

| version | task | k/n | Wilson 95% | verdict | world | directory |
|---|---|---|---|---|---|---|
| crc-care-gap v1 | crc-care-gap | 18/20 | [0.70, 0.97] | Above band | ba0b02069ab4 | final-1/superseded/crc-care-gap-v1 (crc-care-gap-v1) |

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 15 | 15 | 0 | 0 | 0 | 0 | audit.jsonl |
| crc-care-gap | 5 | 5 | 0 | 0 | 0 | 0 | audit.jsonl |
| discharge-medrec | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |
| message-queue | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |
| renal-dose-review | 4 | 4 | 0 | 0 | 0 | 0 | audit.jsonl |
| results-inbox | 8 | 8 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: 1.
- message-queue/10: FAIL at grader 22, PASS at grader 22

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
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 2/20 | 2/20 | 0.90 | [0.70, 0.97] | #6: fit_orders -> retrieval; #12: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 2/20 | 2/20 | 0.90 | [0.70, 0.97] | #11: fit_orders -> retrieval; #15: fit_orders -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 1/20 | 1/20 | 0.95 | [0.76, 0.99] | #5: fit_orders -> retrieval |
| outside_fit_reissued | 1 (Marisol Elena Quintero) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-b3 | Patient/pt-0073 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| crc-d2 | Patient/pt-0073 | D | no | 0 | 0/0 | n/a | n/a |  |

### discharge-medrec

20 valid trials. q (trials that saw every arrival): 20/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| potassium | 1 (kim-lisinopril) | 0/20 | 0/60 | 1.00 | [0.94, 1.00] |  |
|  | 2 (roberts-lisinopril) | 0/20 |  |  |  |  |
|  | 3 (whitcomb-lisinopril) | 0/20 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| brand | 1 (stark-carvedilol) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| fill_gap | 1 (stark-atorvastatin) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| fill_history | 1 (stark-glipizide) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| conditional | 1 (pruitt-metformin) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| kim-k1 | kim-lisinopril | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| kim-k2 | kim-furosemide | B | no | 0 | 0/0 | n/a | n/a |  |
| kim-d1 | kim-lisinopril | D | no | 0 | 0/0 | n/a | n/a |  |
| kim-d2 | kim-furosemide | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| kim-d4 | kim-omeprazole | D | no | 0 | 0/0 | n/a | n/a |  |
| stark-s1 | stark-carvedilol | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| stark-s2 | stark-atorvastatin | O | no | 0 | 0/0 | n/a | n/a |  |
| stark-d5 | stark-glipizide | D | no | 0 | 0/0 | n/a | n/a |  |
| roberts-r1 | roberts-lisinopril | A | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| whitcomb-a1 | whitcomb-lisinopril | A | no | 0 | 0/0 | n/a | n/a |  |
| whitcomb-a1-twin | whitcomb-lisinopril | A | no | 0 | 0/0 | n/a | n/a |  |

### message-queue

20 valid trials. q (trials that saw every arrival): 20/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| same_patient | 1 (m11) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| collection_date | 1 (m12) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| amended_or_error | 1 (m13) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-c1 | Task/task-00023 | C | no | 0 | 0/0 | n/a | n/a |  |
| webb-b2 | Task/task-00024 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-a1 | Task/task-00023 | A | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |

### renal-dose-review

20 valid trials. q (trials that saw every arrival): 16/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| inhibitor_stopped | 1 (Irene Castellano) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| outside_scr_umol | 1 (Frank Delgado) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| filler | 1 (Norman Fairweather) | 4/20 | 4/40 | 0.90 | [0.77, 0.96] | #4: event_seen -> retrieval; #10: event_seen -> retrieval; #13: event_seen -> retrieval; #19: event_seen -> retrieval |
|  | 2 (Marjorie Pellegrino) | 0/20 |  |  |  |  |
| cg_crcl_weight_rule | 1 (Eugene Moravec) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| apixaban_two_of_three | 1 (Harold Vance) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| pellegrino-scr-new | Patient/pt-0043 | A | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| delgado-scr-amended | Patient/pt-0003 | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| vance-itraconazole | Patient/pt-0002 | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| moravec-weight-reported | Patient/pt-0038 | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| moravec-scr-new | Patient/pt-0038 | A | no | 0 | 0/0 | n/a | n/a |  |
| vance-clarithromycin | Patient/pt-0002 | D | no | 0 | 0/0 | n/a | n/a |  |
| fairweather-scr-batch | Patient/pt-0062 | A | yes | 20 | 4/20 | 0.80 | [0.58, 0.92] | #4: event_seen -> retrieval; #10: event_seen -> retrieval; #13: event_seen -> retrieval; #19: event_seen -> retrieval |
| fairweather-scr-twin | Patient/pt-0062 | A | no | 0 | 0/0 | n/a | n/a |  |

### results-inbox

20 valid trials. q (trials that saw every arrival): 12/20. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| hemolyzed | 1 (hemolyzed_note) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| corrected | 1 (corrected_down) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| aki | 1 (aki_48h) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| filler | 1 (normal_tsh) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| creatinine_no_aki | 1 (marchetti_cr_ed) | 8/20 | 8/20 | 0.60 | [0.39, 0.78] | #4: event_seen -> retrieval; #8: event_seen -> retrieval; #10: event_seen -> retrieval; #11: event_seen -> retrieval; #15: event_seen -> retrieval; #16: event_seen -> retrieval; #17: event_seen -> retrieval; #19: event_seen -> retrieval |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| patel-ldct-addendum | nodule_scheduled | O | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| brennan-k-corrected | hemolyzed_note | B | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| whitfield-cr-new | eie_baseline | A | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| parisian-cxr-prelim | prelim_negative | D | yes | 20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| parisian-cta-corrected | prelim_negative | B | no | 0 | 0/0 | n/a | n/a |  |
| ondricka-k-new | corrected_down | A | no | 0 | 0/0 | n/a | n/a |  |
| brennan-k-hemolyzed | hemolyzed_note | D | no | 0 | 0/0 | n/a | n/a |  |
| whitfield-cr-outside | eie_baseline | D | no | 0 | 0/0 | n/a | n/a |  |
| marchetti-cr-batch | marchetti_cr_ed | A | yes | 20 | 8/20 | 0.60 | [0.39, 0.78] | #4: event_seen -> retrieval; #8: event_seen -> retrieval; #10: event_seen -> retrieval; #11: event_seen -> retrieval; #15: event_seen -> retrieval; #16: event_seen -> retrieval; #17: event_seen -> retrieval; #19: event_seen -> retrieval |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0 | 0/0 | n/a | n/a |  |

## Difficulty history

| task | pilot-4a | pilot-4b | pilot-5c | crc-care-gap-v1 (crc-care-gap v1, superseded) | final-1 |
|---|---|---|---|---|---|
| contrast-ct-prep | 1/4 In band | none | none | none | 5/20 In band |
| crc-care-gap | 2/4 In band | 4/4 Above band | none | 18/20 Above band | 15/20 Above band |
| discharge-medrec | 4/4 Above band | none | none | none | 20/20 Saturated |
| message-queue | 4/4 Above band | none | 8/8 Above band | none | 20/20 Saturated |
| renal-dose-review | 4/4 Above band | none | none | none | 16/20 Above band |
| results-inbox | 4/4 Above band | none | 4/8 In band | none | 12/20 In band |

## No failures

- discharge-medrec: No failures in 20 trials. Strictness evidence, matrix.json at grader_task_version 8f1468c535b9d939fb5187839afc9335c2764a8bd1acf9d2a2db636613134eeb: the oracle passes, 39 of 39 mutants fail as declared, 44 of 44 alternatives pass, the null agent fails.
- message-queue: No failures in 20 trials. Strictness evidence, matrix.json at grader_task_version 09e775242cf6c5a229f60ebd1af34c5ac6d102bdbf83a81fe70a243acb677421: the oracle passes, 34 of 34 mutants fail as declared, 45 of 45 alternatives pass, the null agent fails.

