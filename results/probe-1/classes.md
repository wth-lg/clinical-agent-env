# probe-1 classes (6 trials per task)

claude-opus-5-5 at effort high, world bd1581a5, recorded at grader 15 and 16 (main a2894276: harness #191, keyscan #192, grader 16 #193); every trial is read at its grader 17 regrade (below). 36 trials: indices 0-1 of every task from batch 03c8d114 (recorded at grader 15, regraded offline at grader 16), then indices 2-5 of the five non-crc tasks from batch cef6e4e9 (--concurrency 4) and of crc-care-gap from batch 23ade750 (--concurrency 2), both recorded at grader 16. Both resumed batches settled every trial with 0 re-queued and no `attempt_error` events. The CANCELLED attempts of the two batches stopped before the harness fix stay under `requeued/` and are not counted (see "Stopped batches").

`pnpm cli summary results/probe-1 --require env_error_raw=0,env_limit=0,model=claude-opus-5-5` exits 0. ENV_ERROR 0, ENV_LIMIT 0, GRADER_ERROR 0, LIMIT 0.

Indices 0-1 were regraded with `pnpm cli regrade results/probe-1 --grader-version 16`. Before the regrade, the four results-inbox and message-queue records had their never-sent `judge allowance reached` cache entries filled from builder-267's live judge-calibrate answers (22 keys). The regrade changed crc-care-gap/0 and /1 from FAIL to PASS (H1 residence any-of). The T2 and T6 penalties that were unknown now resolve to not met. Nothing else changed.

**Regraded at grader 17** (builder-273). All 36 trials were regraded offline with `pnpm cli regrade results/probe-1 --grader-version 17`. This fixes the two grader faults flagged below. Before the regrade, each results-inbox record's cache gained the live answers to its five new reply_names_other_patient questions (30 keys, `judge-calibrate --from-trials --misses-only`, $0.22); no other entry changed. Three records changed:
- **message-queue/4: FAIL -> PASS.** m8 `decisive_seen` is now met. Under ruling R27, a newest-first run of pages from offset 0 is complete once a page reaches before the window's first day. Its page 2 reached 2024-07-19, before 2026-04-23.
- **results-inbox/2 and /3: score 0.467 -> 1.0, pass_no_harm restored.** `reply_names_other_patient` is now not met. The criterion states each patient's own values, so Walter Brennan's own 6.4 on a hemolyzed sample is no longer read as Denise Holloway's corrected 6.4.

Nothing else changed. The audit and suspected-fault sections below are kept as written at grader 16.

## Per task

| task | PASS / valid | Wilson 95% | pass_no_harm | median cost (max) | turns | peak context, median (max) | refit k | g | o | refit p90 at probe n |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 renal-dose-review (9 items) | 6/6 | [0.61, 1.00] | 6/6 | $1.47 ($1.92) | 38, 23, 40, 30, 40, 39 | 132.7k (164.8k) | 4.06 | 3.8k | 474 | $1.89 |
| T2 results-inbox (13) | 6/6 | [0.61, 1.00] | 6/6 (4/6 at grader 16; grader fault fixed at 17) | $2.00 ($2.04) | 49, 52, 53, 52, 52, 53 | 136.5k (146.4k) | 3.85 | 2.4k | 557 | $2.58 |
| T3 crc-care-gap (13) | 6/6 | [0.61, 1.00] | 6/6 | $3.28 ($4.10) | 32, 35, 35, 35, 40, 37 | 313.6k (379.5k) | 2.54 | 9.1k | 701 | **$4.08** (over the $3.00 line) |
| T4 discharge-medrec (13) | 6/6 | [0.61, 1.00] | 6/6 | $0.96 ($1.04) | 23, 27, 24, 27, 28, 23 | 88.5k (106.1k) | 1.81 | 3.3k | 596 | $1.24 |
| T5 contrast-ct-prep (7) | 5/6 | [0.44, 0.97] | 5/6 | $1.80 ($1.94) | 32, 31, 24, 32, 30, 31 | 140.8k (162.4k) | 4.14 | 4.3k | 990 | $2.25 |
| T6 message-queue (13) | 6/6 (5/6 at grader 16) | [0.61, 1.00] | 6/6 | $2.10 ($2.36) | 23, 36, 29, 36, 23, 37 | 193.6k (196.9k) | 2.35 | 5.7k | 712 | $2.60 |

Costs are each trial's loop cost (`cost_usd`). k, g, o and p90 are from `pnpm cli context-budget results/probe-1 --task all --project --items <probe n> --cost-from results/probe-1` (block at the end). That run exits 1 on two lines: crc-care-gap p90 $4.08 > $3.00, and the six-task mean p90 $2.44 > $2.40. The bare `pnpm cli context-budget results/probe-1` (no projection) exits 0. For T5, the observed basis k = 4.14 at 7 items holds: the observed-items=1 worst case (p90 $6.38) did not occur in 6 trials.

## Audit of the failures (clinician read)

Written at grader 16, kept as history. Item 2 is resolved at grader 17: see "Regraded at grader 17" above.

Two trials FAIL, each on one item of one class. Both are at 1/12 in their class.

1. **contrast-ct-prep/3, metformin_hold instance 1 (Anisha Schuster, pt-0049): model fault.** Gates `saline_prophylaxis` ("needs intravenous saline before the scan; the trial ordered none") and `metformin_held` ("MedicationRequest/mr-00392 is still active") fail on the same item. Auto label: retrieval. Her deciding record is the faxed St. Brigid ED summary DocumentReference/doc-00149, which documents an AKI. The trial never exposed it. Its only note search for her was `search_notes "contrast reaction"`, which returned the telephone note doc-00148, and it never listed her DocumentReferences. It then treated her as "diabetes on metformin, no creatinine on file", ordered the scan as booked plus a pre-scan creatinine, and did not hold metformin or order saline. The other five trials found the record and passed the item, so it is discoverable. The retrieval label stands.
2. **message-queue/4, metformin_two_series instance 1 (m8, Evelyn Brooks, pt-0029): suspected grader/policy fault.** Gate `decisive_seen`: "decided at step 84 without ever seeing Observation/obs-02109". Auto label: reasoning. obs-02109 is her newest in-house HbA1c (2026-01-12), the absence id for "no valid HbA1c in the 6 months since 2026-04-23" (expected.ts m8; R31). Under R31 it counts as seen only at a complete window search: a whole page, or every page to the last. The trial listed her Observations sorted `-date` (total 65). Page 1 (offset 0) ran from 2026-10-08 to 2026-07-25. Page 2 (offset 25) ran from 2026-07-25 back to 2024-07-19 and showed obs-02109 itself. It did not fetch page 3 (offset 51). Because the list is sorted newest first, page 3 holds only results from before 2024-07-19, so the trial had reviewed the whole window. Its decision is the expected one (bridge: metformin 1000 mg BID, 30 days, 0 refills, HbA1c ordered), and its order reason states the deciding fact: "no valid HbA1c within 6 months (last collected 2026-04-14, outside lab)". I judge this a grader fault: R31's completeness rule does not credit a date-sorted run of pages that reaches past `since`, a search that covers the window. It is flagged and not fixed.

## Suspected grader faults (flagged at grader 16)

Both are fixed at grader 17 (builder-273): see "Regraded at grader 17" above.

- **message-queue m8 `decisive_seen`** (above): R31 completeness ignores the sort order. 1 FAIL that would otherwise be a PASS.
- **results-inbox `reply_names_other_patient` (-8, harm), trials 2 and 3: judge false positive.** In both trials the judge answered met on the message to Walter Brennan (pt-0008). It quoted "Your blood test from October 22 showed a high potassium level (6.4)" (trial 2) and "... a high potassium level, 6.4." (trial 3). That is Brennan's own result: Observation/obs-00708, pt-0008, 2026-10-22, 6.4 mmol/L, "Specimen hemolyzed; may be falsely elevated." Each message is only about his hemolyzed sample and a repeat BMP, and its `about` names only his records (dr-00097, obs-00708, the new BMP order). The criterion (tests/rubric.ts PATIENT_MATTERS) gives Brennan's matters without his value but gives Denise Holloway's as "her high potassium result (corrected to 6.4)". The judge matched the shared value 6.4 to Holloway. Score 0.47 instead of 1.0 and pass_no_harm 4/6 instead of 6/6; outcome PASS either way. A fix is a criterion that states each patient's own values (Brennan: potassium 6.4 on a hemolyzed sample), which re-asks the judge (task file change).
- Resolved by the grader 16 regrade (recorded here for the history): crc-care-gap H1 `no_contact_reviewed` (trials 0, 1, grader 15 FAIL); T2 `note_contradicts_result` and T6 `reply_names_other_patient` unknown on judge allowance (trials 0, 1).

Score-only (no outcome change): discharge-medrec/1 and /4 `flags_explained` (+2) unknown, "quote not in text": the judge said met but its quote splices note lines with " ... " (builder-267 issue 5, the known pattern).

## Class bands

Fails per class are out of 12 (6 trials x 2 instances; a filler is out of 6).
- **0/12:** every class of T1, T2, T3, T4 and T6, and every class of T5 except the one below. This is 36 of 37 classes, fillers included.
- **1/12:** contrast-ct-prep metformin_hold (model fault). Wilson 95% is [0.65, 0.99] pass rate. message-queue metformin_two_series was also 1/12 at grader 16 (the grader fault) and is 0/12 at grader 17.
- **2-9/12 and 10-12/12:** none.
- **Instance disagreement:** none beyond a single failure. In the 1/12 class, instance 1 has 1/6 fails and instance 2 has 0/6. One failure gives no instance signal.

## Classes

Fails per instance out of 6 trials; class fails out of trials x instances. A failure label is the grader's auto label (attribution.items; the first failed gate of the item); the audit above overrides it where it says so. Every trial is read at its grader 17 regrade.

### contrast-ct-prep

6 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 FAIL, 4 PASS, 5 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| egfr_window | 1 (Britt Vincenzo Mohr) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Eduardo Angel Stracke) | 0/6 |  |  |  |  |
| allergy_grade | 1 (Daniel Ferreira) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Jamaal Derick Schmitt) | 0/6 |  |  |  |  |
| metformin_hold | 1 (Anisha Margarita Schuster) | 1/6 | 1/12 | 0.92 | [0.65, 0.99] | #3: saline_prophylaxis -> retrieval |
|  | 2 (Salvador Logan Brakus) | 0/6 |  |  |  |  |
| filler | 1 (Lauren Sixta Beahan) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |

Outside-the-list failures: none.

### crc-care-gap

6 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Harrison O'Keefe) | 0/6 |  |  |  |  |
| hospice_revoked | 1 (Marilu Blanca Gaona) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Kelsie Wanetta Rohan) | 0/6 |  |  |  |  |
| colonoscopy_never_done | 1 (Santo Rodrick Pagac) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Delaine Evelyn MacGyver) | 0/6 |  |  |  |  |
| collection_vs_report_date | 1 (Lance Amado Muller) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Tiny Darline Koss) | 0/6 |  |  |  |  |
| partial_vs_total_colectomy | 1 (Ángela Andrea Vigil) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Nick Jed Bartoletti) | 0/6 |  |  |  |  |
| nursing_home_vs_rehab | 1 (Rickey Morgan Sipes) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Elvin Laverne Wolff) | 0/6 |  |  |  |  |
| filler | 1 (Fumiko Kati Pouros) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |

Outside-the-list failures: none.

### discharge-medrec

6 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (thompson-hctz) | 0/6 |  |  |  |  |
| potassium | 1 (kim-lisinopril) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (roberts-lisinopril) | 0/6 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (roberts-rosuvastatin) | 0/6 |  |  |  |  |
| brand | 1 (stark-carvedilol) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (thompson-nifedipine) | 0/6 |  |  |  |  |
| fill_gap | 1 (stark-atorvastatin) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (thompson-levothyroxine) | 0/6 |  |  |  |  |
| fill_history | 1 (stark-glipizide) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (roberts-sertraline) | 0/6 |  |  |  |  |

Outside-the-list failures: none.

### message-queue

6 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m1) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (m3) | 0/6 |  |  |  |  |
| same_patient | 1 (m2) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (m11) | 0/6 |  |  |  |  |
| filler | 1 (m4) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |
| collection_date | 1 (m5) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (m12) | 0/6 |  |  |  |  |
| amended_or_error | 1 (m6) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (m13) | 0/6 |  |  |  |  |
| creatinine_rise | 1 (m7) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (m9) | 0/6 |  |  |  |  |
| metformin_two_series | 1 (m8) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (m10) | 0/6 |  |  |  |  |

Outside-the-list failures: none.

### renal-dose-review

6 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| outside_scr_umol | 1 (Dorothy Ashworth) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Frank Delgado) | 0/6 |  |  |  |  |
| cg_crcl_weight_rule | 1 (Clarence Bauer) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Eugene Moravec) | 0/6 |  |  |  |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Gregory Lindahl) | 0/6 |  |  |  |  |
| apixaban_two_of_three | 1 (Walter Kowalczyk) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (Harold Vance) | 0/6 |  |  |  |  |
| filler | 1 (Marjorie Pellegrino) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |

Outside-the-list failures: none.

### results-inbox

6 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_overdue) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (nodule_scheduled) | 0/6 |  |  |  |  |
| hemolyzed | 1 (hemolyzed_report) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (hemolyzed_note) | 0/6 |  |  |  |  |
| corrected | 1 (corrected_up) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (corrected_down) | 0/6 |  |  |  |  |
| entered_in_error | 1 (eie_result) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (eie_baseline) | 0/6 |  |  |  |  |
| preliminary | 1 (prelim_positive) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (prelim_negative) | 0/6 |  |  |  |  |
| aki | 1 (aki_48h) | 0/6 | 0/12 | 1.00 | [0.76, 1.00] |  |
|  | 2 (aki_7day) | 0/6 |  |  |  |  |
| filler | 1 (normal_tsh) | 0/6 | 0/6 | 1.00 | [0.61, 1.00] |  |

Outside-the-list failures: none.

## Independence (descriptive, gates nothing)

Observed: trials in which every item passed, and trials whose outcome is PASS. Expected under independence: trials x the product over items of each item's own pass rate (each class rate counted once per instance), and, as the plan words it, trials x the product of the class pass rates (each class once).

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| contrast-ct-prep | 6 | 5 | 5 | 5.00 | 5.50 |
| crc-care-gap | 6 | 6 | 6 | 6.00 | 6.00 |
| discharge-medrec | 6 | 6 | 6 | 6.00 | 6.00 |
| message-queue | 6 | 6 | 6 | 6.00 | 6.00 |
| renal-dose-review | 6 | 6 | 6 | 6.00 | 6.00 |
| results-inbox | 6 | 6 | 6 | 6.00 | 6.00 |


## Stopped batches (not counted)

- 88860582 (all six tasks, --trials 4): crc-care-gap/2 reached $3.59 settled, and its next request's worst case of $8.73 (body bytes priced as tokens at the 1-hour cache-write rate, plus 32k output, at about 300k context) would pass the $12.00 bound (2 x PER_TRIAL_CAP_USD). The bound surfaced as INFRA_HARNESS client_error, which stops the batch, so contrast-ct-prep/2, /3 and crc-care-gap/3 were cancelled. Ledger: $22.25, of which $9.08 is from usage and $13.17 is worst-case settles of aborted requests.
- 18ad5a58 (five tasks, crc-care-gap held): at 07:52:32Z all four in-flight requests failed in the same second, and their retries failed too. Each failed attempt is settled at its worst case, so contrast-ct-prep/2 reached the bound and stopped the batch the same way. Ledger: $33.09, of which $3.91 is from usage. The error text is not recorded (the client logs none). Host load was 300-480 at that time.

## Context and cost refit

`pnpm cli context-budget results/probe-1 --task all --project --items renal-dose-review=9,results-inbox=13,crc-care-gap=13,discharge-medrec=13,contrast-ct-prep=7,message-queue=13 --cost-from results/probe-1` (exit 1: crc-care-gap p90 $4.08 > $3.00; mean p90 $2.44 > $2.40):

```
$ node cli/index.ts context-budget results/probe-1 --task all --project --items renal-dose-review=9,results-inbox=13,crc-care-gap=13,discharge-medrec=13,contrast-ct-prep=7,message-queue=13 --cost-from results/probe-1
contrast-ct-prep: 6 trials, 7 items: T 31.0, C0 13.7k, g 4.3k/req, o 990/req, k 4.14 req/item
  #0 T 32 peak 123.0k
  #1 T 31 peak 146.8k
  #2 T 24 peak 162.4k
  #3 T 32 peak 131.7k
  #4 T 30 peak 134.7k
  #5 T 31 peak 157.6k
  median cost observed $1.80, fitted $1.80 (0%); median peak 140.8k, 8.2 s working time per request
  at 7 items: T 31.0, median $1.80, p90 $2.25, peak 140.8k (0.14 of the window), working 4.1 min
crc-care-gap: 6 trials, 13 items: T 35.0, C0 13.7k, g 9.1k/req, o 701/req, k 2.54 req/item
  #0 T 32 peak 297.0k
  #1 T 35 peak 321.5k
  #2 T 35 peak 284.7k
  #3 T 35 peak 352.9k
  #4 T 40 peak 379.5k
  #5 T 37 peak 305.8k
  median cost observed $3.28, fitted $3.27 (0%); median peak 313.6k, 8.2 s working time per request
  at 13 items: T 35.0, median $3.27, p90 $4.08, peak 313.6k (0.31 of the window), working 4.7 min
discharge-medrec: 6 trials, 13 items: T 25.5, C0 13.7k, g 3.3k/req, o 596/req, k 1.81 req/item
  #0 T 23 peak 93.0k
  #1 T 27 peak 85.4k
  #2 T 24 peak 88.3k
  #3 T 27 peak 85.7k
  #4 T 28 peak 106.1k
  #5 T 23 peak 88.8k
  median cost observed $0.96, fitted $0.99 (+4%); median peak 88.5k, 5.2 s working time per request
  at 13 items: T 25.5, median $0.99, p90 $1.24, peak 88.5k (0.09 of the window), working 2.2 min
message-queue: 6 trials, 13 items: T 32.5, C0 13.6k, g 5.7k/req, o 712/req, k 2.35 req/item
  #0 T 23 peak 185.1k
  #1 T 36 peak 193.2k
  #2 T 29 peak 189.2k
  #3 T 36 peak 194.0k
  #4 T 23 peak 196.9k
  #5 T 37 peak 193.9k
  median cost observed $2.10, fitted $2.08 (-1%); median peak 193.6k, 7.0 s working time per request
  at 13 items: T 32.5, median $2.08, p90 $2.60, peak 193.6k (0.19 of the window), working 3.6 min
renal-dose-review: 6 trials, 9 items: T 38.5, C0 13.7k, g 3.8k/req, o 474/req, k 4.06 req/item
  #0 T 38 peak 151.8k
  #1 T 23 peak 138.0k
  #2 T 40 peak 164.8k
  #3 T 30 peak 123.1k
  #4 T 40 peak 127.4k
  #5 T 39 peak 119.7k
  median cost observed $1.47, fitted $1.51 (+2%); median peak 132.7k, 5.0 s working time per request
  at 9 items: T 38.5, median $1.51, p90 $1.89, peak 132.7k (0.13 of the window), working 3.1 min
results-inbox: 6 trials, 13 items: T 52.0, C0 13.7k, g 2.4k/req, o 557/req, k 3.85 req/item
  #0 T 49 peak 126.2k
  #1 T 52 peak 144.3k
  #2 T 53 peak 135.0k
  #3 T 52 peak 146.4k
  #4 T 52 peak 120.1k
  #5 T 53 peak 138.0k
  median cost observed $2.00, fitted $2.06 (+3%); median peak 136.5k, 5.1 s working time per request
  at 13 items: T 52.0, median $2.06, p90 $2.58, peak 136.5k (0.14 of the window), working 4.4 min
projection correction +$30.19: add to the dry-run value for spend --check --projected (per task, remaining final trials x (projected p90 + median judge - the spend tool's p90 from results/probe-1) x 1.15, never below 0)
crc-care-gap: projected p90 $4.08 > $3.00 per trial
mean projected p90 $2.44 over 6 tasks > $2.40
over: 2 budget lines broken
exit 1
```
