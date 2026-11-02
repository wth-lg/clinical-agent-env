# Result card: pilot-4a

Model claude-opus-5-5, effort high. 24 valid trials over 6 tasks.
Summary: results/pilot-4a/summary.json. Classes: results/pilot-4a/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 1/4 | [0.05, 0.70] | In band | 0.25 | 0.00 | n/a | 0 | 0 | 0 (0) |
| crc-care-gap | 2/4 | [0.15, 0.85] | In band | 0.50 | 0.00 | n/a | 0 | 0 | 0 (0) |
| discharge-medrec | 4/4 | [0.51, 1.00] | Above band | 1.00 | 1.00 | n/a | 0 | 0 | 0 (0) |
| message-queue | 4/4 | [0.51, 1.00] | Above band | 1.00 | 1.00 | n/a | 0 | 0 | 0 (0) |
| renal-dose-review | 4/4 | [0.51, 1.00] | Above band | 1.00 | 1.00 | n/a | 0 | 0 | 0 (0) |
| results-inbox | 4/4 | [0.51, 1.00] | Above band | 1.00 | 1.00 | n/a | 0 | 0 | 0 (0) |

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 3 | 3 | 0 | 0 | 0 | 0 | audit.jsonl |
| crc-care-gap | 2 | 2 | 0 | 0 | 0 | 0 | audit.jsonl |
| discharge-medrec | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |
| message-queue | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |
| renal-dose-review | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |
| results-inbox | 0 | 0 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: 1.
- crc-care-gap/2: FAIL at grader 18, PASS at grader 19

## Per class and per event

### contrast-ct-prep

4 valid trials. q (trials that saw every arrival): 1/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| egfr_window | 1 (Britt Vincenzo Mohr) | 3/4 | 3/4 | 0.25 | [0.05, 0.70] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval |
| allergy_grade | 1 (Daniel Ferreira) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| metformin_hold | 1 (Anisha Margarita Schuster) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (Lauren Sixta Beahan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| t5-mohr-scr | Patient/pt-0047 | A | yes | 4 | 3/4 | 0.25 | [0.05, 0.70] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval |
| t5-ferreira-scr | Patient/pt-0015 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| t5-schuster-rxn | Patient/pt-0049 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| t5-beahan-rxn | Patient/pt-0046 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| t5-ferreira-msg | Patient/pt-0015 | D | no | 0 | 0/0 | n/a | n/a |  |

### crc-care-gap

4 valid trials. q (trials that saw every arrival): 4/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #1: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #0: fit_orders -> retrieval |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |

### discharge-medrec

4 valid trials. q (trials that saw every arrival): 4/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| potassium | 1 (kim-lisinopril) | 0/4 | 0/8 | 1.00 | [0.68, 1.00] |  |
|  | 2 (roberts-lisinopril) | 0/4 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| brand | 1 (stark-carvedilol) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| fill_gap | 1 (stark-atorvastatin) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| fill_history | 1 (stark-glipizide) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| kim-k1 | kim-lisinopril | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| kim-k2 | kim-furosemide | B | no | 0 | 0/0 | n/a | n/a |  |
| kim-d1 | kim-lisinopril | D | no | 0 | 0/0 | n/a | n/a |  |
| kim-d2 | kim-furosemide | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| kim-d4 | kim-omeprazole | D | no | 0 | 0/0 | n/a | n/a |  |
| stark-s1 | stark-carvedilol | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| stark-s2 | stark-atorvastatin | O | no | 0 | 0/0 | n/a | n/a |  |
| stark-d5 | stark-glipizide | D | no | 0 | 0/0 | n/a | n/a |  |
| roberts-r1 | roberts-lisinopril | A | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |

### message-queue

4 valid trials. q (trials that saw every arrival): 4/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| same_patient | 1 (m11) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_date | 1 (m12) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| amended_or_error | 1 (m13) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-c1 | Task/task-00023 | C | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| webb-b2 | Task/task-00024 | B | no | 0 | 0/0 | n/a | n/a |  |

### renal-dose-review

4 valid trials. q (trials that saw every arrival): 4/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| outside_scr_umol | 1 (Frank Delgado) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| cg_crcl_weight_rule | 1 (Eugene Moravec) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (Marjorie Pellegrino) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| apixaban_two_of_three | 1 (Harold Vance) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| pellegrino-scr-new | Patient/pt-0043 | A | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| delgado-scr-amended | Patient/pt-0003 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| vance-itraconazole | Patient/pt-0002 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| moravec-weight-reported | Patient/pt-0038 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| moravec-scr-new | Patient/pt-0038 | A | no | 0 | 0/0 | n/a | n/a |  |
| vance-clarithromycin | Patient/pt-0002 | D | no | 0 | 0/0 | n/a | n/a |  |

### results-inbox

4 valid trials. q (trials that saw every arrival): 4/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| hemolyzed | 1 (hemolyzed_note) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| corrected | 1 (corrected_down) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| aki | 1 (aki_48h) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (normal_tsh) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| patel-ldct-addendum | nodule_scheduled | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| brennan-k-corrected | hemolyzed_note | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| whitfield-cr-new | eie_baseline | A | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| parisian-cxr-prelim | prelim_negative | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| parisian-cta-corrected | prelim_negative | B | no | 0 | 0/0 | n/a | n/a |  |
| ondricka-k-new | corrected_down | A | no | 0 | 0/0 | n/a | n/a |  |
| brennan-k-hemolyzed | hemolyzed_note | D | no | 0 | 0/0 | n/a | n/a |  |
| whitfield-cr-outside | eie_baseline | D | no | 0 | 0/0 | n/a | n/a |  |

## Difficulty history

| task | pilot-4a |
|---|---|
| contrast-ct-prep | 1/4 In band |
| crc-care-gap | 2/4 In band |
| discharge-medrec | 4/4 Above band |
| message-queue | 4/4 Above band |
| renal-dose-review | 4/4 Above band |
| results-inbox | 4/4 Above band |

## No failures

- discharge-medrec: No failures in 4 trials. Strictness evidence, matrix.json at grader_task_version aac34617ccad6393f64fe894e7c4882fef9a3cfa110a967dca34a468e3e148f6: the oracle passes, 33 of 33 mutants fail as declared, 39 of 39 alternatives pass, the null agent fails.
- message-queue: No failures in 4 trials. Strictness evidence, matrix.json at grader_task_version 8f6e7214146d4943578fc9801f5f161f38d4f7bac4c889ee7ecbce6a05f073d2: the oracle passes, 41 of 41 mutants fail as declared, 34 of 34 alternatives pass, the null agent fails.
- renal-dose-review: No failures in 4 trials. Strictness evidence, matrix.json at grader_task_version 1dba013b0bb5739a5e047005d6d7f13c1bf913612bb09841400a7806dc9dc289: the oracle passes, 33 of 33 mutants fail as declared, 19 of 19 alternatives pass, the null agent fails.
- results-inbox: No failures in 4 trials. Strictness evidence, matrix.json at grader_task_version 822ecf9f3bea7c68ba5215077d73527c730ce5fff0b3722e97af85461dfd695e: the oracle passes, 40 of 40 mutants fail as declared, 29 of 29 alternatives pass, the null agent fails.

