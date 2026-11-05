$ node cli/index.ts classes results/pilot-5a
# classes: results/pilot-5a

grader 22

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| discharge-medrec | 0/8 | [0.00, 0.32] | 8 | 0 | 0 | 0 | 0/8 | 0 |
| message-queue | 2/8 | [0.07, 0.59] | 6 | 0 | 0 | 0 | 2/8 | 0 |
| renal-dose-review | 6/8 | [0.41, 0.93] | 2 | 0 | 0 | 0 | 6/8 | 0 |
| results-inbox | 2/8 | [0.07, 0.59] | 6 | 0 | 0 | 0 | 4/8 | 0 |

## Classes

### discharge-medrec

8 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 FAIL, 5 FAIL, 6 FAIL, 7 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| potassium | 1 (kim-lisinopril) | 0/8 | 8/24 | 0.67 | [0.47, 0.82] |  |
|  | 2 (roberts-lisinopril) | 0/8 |  |  |  |  |
|  | 3 (whitcomb-lisinopril) | 8/8 |  |  |  | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#7: event_seen -> retrieval |
| filler | 1 (kim-kcl) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| brand | 1 (stark-carvedilol) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| fill_gap | 1 (stark-atorvastatin) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| fill_history | 1 (stark-glipizide) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| conditional | 1 (pruitt-metformin) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| kim-k1 | kim-lisinopril | O | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| kim-k2 | kim-furosemide | B | no | 0/0 | 0 | 0 |  |  |
| kim-d1 | kim-lisinopril | D | no | 0/0 | 0 | 0 |  |  |
| kim-d2 | kim-furosemide | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| kim-d4 | kim-omeprazole | D | no | 0/0 | 0 | 0 |  |  |
| stark-s1 | stark-carvedilol | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| stark-s2 | stark-atorvastatin | O | no | 0/0 | 0 | 0 |  |  |
| stark-d5 | stark-glipizide | D | no | 0/0 | 0 | 0 |  |  |
| roberts-r1 | roberts-lisinopril | A | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| whitcomb-a1 | whitcomb-lisinopril | A | yes | 8/8 | 0 | 0 | [0.00, 0.32] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#7: event_seen -> retrieval |
| whitcomb-a1-twin | whitcomb-lisinopril | A | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | whitcomb-lisinopril | whitcomb-a1 | yes | 0.00 (0 / 8) | [0.00, 0.32] | 8 / 0 / 0 / 0 | 0 / 8 | #0: event_seen, amended -> retrieval, no<br>#1: event_seen, amended -> retrieval, no<br>#2: event_seen, amended -> retrieval, no<br>#3: event_seen, amended -> retrieval, no<br>#4: event_seen, amended -> retrieval, no<br>#5: event_seen, amended -> retrieval, no<br>#6: event_seen, amended -> retrieval, no<br>#7: event_seen, amended -> retrieval, no |
| B | B | pruitt-metformin |  | yes | 1.00 (8 / 8) | [0.68, 1.00] | 0 / 0 / 0 / 0 | 8 / 8 |  |
| reserve | B | salazar-amlodipine |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 8 / 8 valid trials passed every non-lever item (S5 b_t).

### message-queue

8 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 PASS, 5 FAIL, 6 FAIL, 7 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| same_patient | 1 (m11) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_date | 1 (m12) | 6/8 | 6/8 | 0.25 | [0.07, 0.59] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval |
| amended_or_error | 1 (m13) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| same_day_baseline | 1 (m14) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0/0 | 0 | 0 |  |  |
| webb-c1 | Task/task-00023 | C | no | 0/0 | 0 | 0 |  |  |
| webb-b2 | Task/task-00024 | B | no | 0/0 | 0 | 0 |  |  |
| webb-a1 | Task/task-00023 | A | yes | 6/8 | 2 | 0 | [0.07, 0.59] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Task/task-00023 | webb-a1 | yes | 0.25 (2 / 8) | [0.07, 0.59] | 6 / 0 / 0 / 0 | 2 / 8 | #0: event_seen, amended -> retrieval, no<br>#1: event_seen, amended -> retrieval, no<br>#2: event_seen, amended -> retrieval, no<br>#3: event_seen, amended -> retrieval, no<br>#5: event_seen, amended -> retrieval, no<br>#6: event_seen, amended -> retrieval, no |
| B | B | Task/task-70001 |  | yes | 1.00 (8 / 8) | [0.68, 1.00] | 0 / 0 / 0 / 0 | 8 / 8 |  |
| reserve | A | Task/task-t6-m16 | mercer-b1 | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 8 / 8 valid trials passed every non-lever item (S5 b_t).

### renal-dose-review

8 valid trials; outcomes: 0 FAIL, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 FAIL, 6 PASS, 7 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| inhibitor_stopped | 1 (Irene Castellano) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| outside_scr_umol | 1 (Frank Delgado) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| filler | 1 (Norman Fairweather) | 2/8 | 2/16 | 0.88 | [0.64, 0.97] | #0: event_seen -> retrieval<br>#5: event_seen -> retrieval |
|  | 2 (Marjorie Pellegrino) | 0/8 |  |  |  |  |
| cg_crcl_weight_rule | 1 (Eugene Moravec) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| apixaban_two_of_three | 1 (Harold Vance) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| pellegrino-scr-new | Patient/pt-0043 | A | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| delgado-scr-amended | Patient/pt-0003 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| vance-itraconazole | Patient/pt-0002 | O | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| moravec-weight-reported | Patient/pt-0038 | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| moravec-scr-new | Patient/pt-0038 | A | no | 0/0 | 0 | 0 |  |  |
| vance-clarithromycin | Patient/pt-0002 | D | no | 0/0 | 0 | 0 |  |  |
| fairweather-scr-batch | Patient/pt-0062 | A | yes | 2/8 | 6 | 0 | [0.41, 0.93] | #0: event_seen -> retrieval<br>#5: event_seen -> retrieval |
| fairweather-scr-twin | Patient/pt-0062 | A | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Patient/pt-0062 | fairweather-scr-batch | yes | 0.75 (6 / 8) | [0.41, 0.93] | 2 / 0 / 0 / 0 | 6 / 8 | #0: event_seen, amended -> retrieval, no<br>#5: event_seen, amended -> retrieval, no |
| B | B | Patient/pt-0061 |  | yes | 1.00 (8 / 8) | [0.68, 1.00] | 0 / 0 / 0 / 0 | 8 / 8 |  |
| reserve | B | Patient/pt-t1-whitcombe#unbuilt |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 8 / 8 valid trials passed every non-lever item (S5 b_t).

### results-inbox

8 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 PASS, 5 FAIL, 6 FAIL, 7 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 3/8 | 3/8 | 0.63 | [0.31, 0.86] | #0: seen_before_change -> process<br>#2: seen_before_change -> process<br>#3: seen_before_change -> process |
| hemolyzed | 1 (hemolyzed_note) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| corrected | 1 (corrected_down) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| aki | 1 (aki_48h) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| filler | 1 (normal_tsh) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| creatinine_no_aki | 1 (marchetti_cr_ed) | 4/8 | 4/8 | 0.50 | [0.22, 0.78] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval |
| misfiled | 1 (nowicki_fax) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |

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
| marchetti-cr-batch | marchetti_cr_ed | A | yes | 4/8 | 4 | 0 | [0.22, 0.78] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | marchetti_cr_ed | marchetti-cr-batch | yes | 0.50 (4 / 8) | [0.22, 0.78] | 4 / 0 / 0 / 0 | 4 / 8 | #0: event_seen, amended -> retrieval, no<br>#1: event_seen, amended -> retrieval, no<br>#5: event_seen, amended -> retrieval, no<br>#6: event_seen, amended -> retrieval, no |
| B | B | nowicki_fax |  | yes | 1.00 (8 / 8) | [0.68, 1.00] | 0 / 0 / 0 / 0 | 8 / 8 |  |
| reserve | B | cipriani_k_exception |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 |  |  |

base_pass 5 / 8 valid trials passed every non-lever item (S5 b_t).

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| discharge-medrec | 8 | 0 | 0 | 0.00 | 5.33 |
| message-queue | 8 | 2 | 2 | 2.00 | 2.00 |
| renal-dose-review | 8 | 6 | 6 | 6.00 | 7.00 |
| results-inbox | 8 | 2 | 2 | 2.50 | 2.50 |
