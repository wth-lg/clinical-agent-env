# Result card: pilot-5a

Model claude-opus-5-5, effort high. 16 valid trials over 4 tasks.
Summary: results/pilot-5a/summary.json. Classes: results/pilot-5a/classes.json.
Target band 20% to 70%. The verdict is bandVerdict (packages/core/summary.ts); its rule is on the glossary page, under "Band verdict".

## Tasks

| task | k/n | Wilson 95% | verdict | pass@1 | pass^3 | pass^5 | ENV_ERROR raw | ENV_LIMIT | GRADER_ERROR (earlier) |
|---|---|---|---|---|---|---|---|---|---|
| discharge-medrec | 0/4 | [0.00, 0.49] | Below band | 0.00 | 0.00 | n/a | 0 | 0 | 0 (0) |
| message-queue | 0/4 | [0.00, 0.49] | Below band | 0.00 | 0.00 | n/a | 0 | 0 | 0 (0) |
| renal-dose-review | 3/4 | [0.30, 0.95] | Above band | 0.75 | 0.25 | n/a | 0 | 0 | 0 (0) |
| results-inbox | 0/4 | [0.00, 0.49] | Below band | 0.00 | 0.00 | n/a | 0 | 0 | 0 (0) |

## Failures by fault

| task | failures | model | environment | grader | infra (cli classes) | re-queued infra attempts (summary infra_reruns) | source |
|---|---|---|---|---|---|---|---|
| discharge-medrec | 4 | 4 | 0 | 0 | 0 | 0 | audit.jsonl |
| message-queue | 4 | 4 | 0 | 0 | 0 | 0 | audit.jsonl |
| renal-dose-review | 1 | 1 | 0 | 0 | 0 | 0 | audit.jsonl |
| results-inbox | 4 | 4 | 0 | 0 | 0 | 0 | audit.jsonl |

## Grader faults found and fixed

GRADER_ERROR at the current grade: 0; in an earlier grade: 0. Records a later grader regraded to another outcome: none.

## Per class and per event

### discharge-medrec

4 valid trials. q (trials that saw every arrival): 0/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| potassium | 1 (kim-lisinopril) | 0/4 | 4/12 | 0.67 | [0.39, 0.86] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval |
|  | 2 (roberts-lisinopril) | 0/4 |  |  |  |  |
|  | 3 (whitcomb-lisinopril) | 4/4 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| brand | 1 (stark-carvedilol) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| fill_gap | 1 (stark-atorvastatin) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| fill_history | 1 (stark-glipizide) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| conditional | 1 (pruitt-metformin) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

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
| whitcomb-a1 | whitcomb-lisinopril | A | yes | 4 | 4/4 | 0.00 | [0.00, 0.49] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval |
| whitcomb-a1-twin | whitcomb-lisinopril | A | no | 0 | 0/0 | n/a | n/a |  |

### message-queue

4 valid trials. q (trials that saw every arrival): 0/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| same_patient | 1 (m11) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_date | 1 (m12) | 4/4 | 4/4 | 0.00 | [0.00, 0.49] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval |
| amended_or_error | 1 (m13) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| same_day_baseline | 1 (m14) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-c1 | Task/task-00023 | C | no | 0 | 0/0 | n/a | n/a |  |
| webb-b2 | Task/task-00024 | B | no | 0 | 0/0 | n/a | n/a |  |
| webb-a1 | Task/task-00023 | A | yes | 4 | 4/4 | 0.00 | [0.00, 0.49] | #0: event_seen -> retrieval; #1: event_seen -> retrieval; #2: event_seen -> retrieval; #3: event_seen -> retrieval |

### renal-dose-review

4 valid trials. q (trials that saw every arrival): 3/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| inhibitor_stopped | 1 (Irene Castellano) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| outside_scr_umol | 1 (Frank Delgado) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (Norman Fairweather) | 1/4 | 1/8 | 0.88 | [0.53, 0.98] | #0: event_seen -> retrieval |
|  | 2 (Marjorie Pellegrino) | 0/4 |  |  |  |  |
| cg_crcl_weight_rule | 1 (Eugene Moravec) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| apixaban_two_of_three | 1 (Harold Vance) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

| event | item | class | active | fired | fails / observations | pass rate | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| pellegrino-scr-new | Patient/pt-0043 | A | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| delgado-scr-amended | Patient/pt-0003 | B | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| vance-itraconazole | Patient/pt-0002 | O | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| moravec-weight-reported | Patient/pt-0038 | D | yes | 4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| moravec-scr-new | Patient/pt-0038 | A | no | 0 | 0/0 | n/a | n/a |  |
| vance-clarithromycin | Patient/pt-0002 | D | no | 0 | 0/0 | n/a | n/a |  |
| fairweather-scr-batch | Patient/pt-0062 | A | yes | 4 | 1/4 | 0.75 | [0.30, 0.95] | #0: event_seen -> retrieval |
| fairweather-scr-twin | Patient/pt-0062 | A | no | 0 | 0/0 | n/a | n/a |  |

### results-inbox

4 valid trials. q (trials that saw every arrival): 2/4. finish guard fires: 0.

| class | instance (item) | fails | class fails / observations | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 3/4 | 3/4 | 0.25 | [0.05, 0.70] | #0: seen_before_change -> process; #2: seen_before_change -> process; #3: seen_before_change -> process |
| hemolyzed | 1 (hemolyzed_note) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| corrected | 1 (corrected_down) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| aki | 1 (aki_48h) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (normal_tsh) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| creatinine_no_aki | 1 (marchetti_cr_ed) | 2/4 | 2/4 | 0.50 | [0.15, 0.85] | #0: event_seen -> retrieval; #1: event_seen -> retrieval |
| misfiled | 1 (nowicki_fax) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

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
| marchetti-cr-batch | marchetti_cr_ed | A | yes | 4 | 2/4 | 0.50 | [0.15, 0.85] | #0: event_seen -> retrieval; #1: event_seen -> retrieval |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0 | 0/0 | n/a | n/a |  |

## Difficulty history

| task | pilot-5a |
|---|---|
| discharge-medrec | 0/4 Below band |
| message-queue | 0/4 Below band |
| renal-dose-review | 3/4 Above band |
| results-inbox | 0/4 Below band |

## No failures

No task with valid trials passed every trial.

