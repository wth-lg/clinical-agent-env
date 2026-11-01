# probe-1 classes (PARTIAL: 2 trials per task)

claude-opus-5-5 at effort high on main 84b1806d (W1 train, PR #190), world bd1581a5. Planned 6 trials per task; this holds the 12 trials of the first batch (03c8d114, indices 0 and 1 of every task). Two later batches stopped on the harness's per-trial spend bound and settled nothing (records under `requeued/`, CANCELLED, not counted; see "Stopped batches"). The run resumes to 6 per task after the harness fix, crc-care-gap alone. Every count below is out of 2 trials per instance, so per class out of 4 (filler 2), not 12.

`pnpm cli summary results/probe-1 --require env_error_raw=0,env_limit=0,model=claude-opus-5-5` exits 0 (on a copy). ENV_ERROR 0, ENV_LIMIT 0, GRADER_ERROR 0.

## Per task

| task | PASS / valid | Wilson 95% | median cost | turns | peak context (median) | refit k | g | o | refit p90 at probe n |
|---|---|---|---|---|---|---|---|---|---|
| T1 renal-dose-review (9 items) | 2/2 | [0.34, 1.00] | $1.52 | 38, 23 | 144.9k | 3.17 | 4.7k | 631 | $1.97 |
| T2 results-inbox (13) | 2/2 | [0.34, 1.00] | $1.93 | 49, 52 | 135.2k | 3.73 | 2.5k | 555 | $2.49 |
| T3 crc-care-gap (13) | 0/2 | [0.00, 0.66] | $3.16 | 32, 35 | 309.2k | 2.42 | 9.1k | 737 | **$3.91** (over the $3.00 line) |
| T4 discharge-medrec (13) | 2/2 | [0.34, 1.00] | $0.96 | 23, 27 | 89.2k | 1.77 | 3.2k | 593 | $1.25 |
| T5 contrast-ct-prep (7) | 2/2 | [0.34, 1.00] | $1.78 | 32, 31 | 134.9k | 4.21 | 4.0k | 984 | $2.20 |
| T6 message-queue (13) | 2/2 | [0.34, 1.00] | $2.10 | 23, 36 | 189.1k | 2.12 | 6.5k | 806 | $2.50 |

Median cost is the observed median loop cost of the two trials (from the refit). T5 at its observed basis: k 4.21 from 7 items, so the =1 worst case (p90 $6.38) did not occur; the refit p90 is $2.20.

## Audit of the failures (clinician read)

Both failures are crc-care-gap item H1 (nursing_home_vs_rehab instance 1, Rickey Sipes, pt-0034), gate `no_contact_reviewed`, auto label retrieval: the trial never exposed the housing-status Observation the gate names (obs-02463). Both trials made the right decision (no order, no message, listed as excluded) and gave the reason from records they did read: his Patient record's home address is "Maple Grove Care Center, 1420 Maple Grove Road, Room 214" (read at step 4 and step 5) and his chart holds nursing facility visits in February and July 2026. That establishes long-term nursing-home residence as well as the status Observation does. Ruling R21 (any-of evidence) already gives H2 three routes; H1's decisive set holds only the Observation and the Patient. Verdict: **grader fault, not model** (R16, R21). The fix is to make H1's residence any-of {housing status, Patient address, nursing facility encounters}. After that fix, both trials pass every item. These two failures are not counted as model failures.

Score-only findings (no outcome change):
- T6 message-queue, both trials: `reply_names_other_patient` (-8) is unknown with "judge allowance reached" (over_allowance 4). T2 results-inbox, both trials: `note_contradicts_result` (-5) is unknown in the same way (over_allowance 7). The per-trial judge call budget (grade.ts judgeCallBudget) does not cover a per-recipient or per-item judged penalty on a 13-item list, so pass_no_harm reads 0/2 for both tasks. This is a grader sizing defect for the attribution or grader lane.
- T4 discharge-medrec/1: `flags_explained` (+2) is unknown. The judge's verdict was met, but its quote splices lines with "..." (the known quote-splice pattern from pilot-3).

## Classes

Fails per instance out of 2 trials; class fails out of trials x instances. A failure label is the grader's auto label (attribution.items); the audit above overrides it where it says so.

### contrast-ct-prep

2 valid trials; outcomes: 0 PASS, 1 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| egfr_window | 1 (Britt Vincenzo Mohr) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Eduardo Angel Stracke) | 0/2 |  |  |  |  |
| allergy_grade | 1 (Daniel Ferreira) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Jamaal Derick Schmitt) | 0/2 |  |  |  |  |
| metformin_hold | 1 (Anisha Margarita Schuster) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Salvador Logan Brakus) | 0/2 |  |  |  |  |
| filler | 1 (Lauren Sixta Beahan) | 0/2 | 0/2 | 1.00 | [0.34, 1.00] |  |

Outside-the-list failures: none.

### crc-care-gap

2 valid trials; outcomes: 0 FAIL, 1 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Harrison O'Keefe) | 0/2 |  |  |  |  |
| hospice_revoked | 1 (Marilu Blanca Gaona) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Kelsie Wanetta Rohan) | 0/2 |  |  |  |  |
| colonoscopy_never_done | 1 (Santo Rodrick Pagac) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Delaine Evelyn MacGyver) | 0/2 |  |  |  |  |
| collection_vs_report_date | 1 (Lance Amado Muller) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Tiny Darline Koss) | 0/2 |  |  |  |  |
| partial_vs_total_colectomy | 1 (Ángela Andrea Vigil) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Nick Jed Bartoletti) | 0/2 |  |  |  |  |
| nursing_home_vs_rehab | 1 (Rickey Morgan Sipes) | 2/2 | 2/4 | 0.50 | [0.15, 0.85] | #0: no_contact_reviewed -> retrieval<br>#1: no_contact_reviewed -> retrieval |
|  | 2 (Elvin Laverne Wolff) | 0/2 |  |  |  |  |
| filler | 1 (Fumiko Kati Pouros) | 0/2 | 0/2 | 1.00 | [0.34, 1.00] |  |

Outside-the-list failures: none.

### discharge-medrec

2 valid trials; outcomes: 0 PASS, 1 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (thompson-hctz) | 0/2 |  |  |  |  |
| potassium | 1 (kim-lisinopril) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (roberts-lisinopril) | 0/2 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/2 | 0/2 | 1.00 | [0.34, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (roberts-rosuvastatin) | 0/2 |  |  |  |  |
| brand | 1 (stark-carvedilol) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (thompson-nifedipine) | 0/2 |  |  |  |  |
| fill_gap | 1 (stark-atorvastatin) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (thompson-levothyroxine) | 0/2 |  |  |  |  |
| fill_history | 1 (stark-glipizide) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (roberts-sertraline) | 0/2 |  |  |  |  |

Outside-the-list failures: none.

### message-queue

2 valid trials; outcomes: 0 PASS, 1 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m1) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (m3) | 0/2 |  |  |  |  |
| same_patient | 1 (m2) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (m11) | 0/2 |  |  |  |  |
| filler | 1 (m4) | 0/2 | 0/2 | 1.00 | [0.34, 1.00] |  |
| collection_date | 1 (m5) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (m12) | 0/2 |  |  |  |  |
| amended_or_error | 1 (m6) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (m13) | 0/2 |  |  |  |  |
| creatinine_rise | 1 (m7) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (m9) | 0/2 |  |  |  |  |
| metformin_two_series | 1 (m8) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (m10) | 0/2 |  |  |  |  |

Outside-the-list failures: none.

### renal-dose-review

2 valid trials; outcomes: 0 PASS, 1 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| outside_scr_umol | 1 (Dorothy Ashworth) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Frank Delgado) | 0/2 |  |  |  |  |
| cg_crcl_weight_rule | 1 (Clarence Bauer) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Eugene Moravec) | 0/2 |  |  |  |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Gregory Lindahl) | 0/2 |  |  |  |  |
| apixaban_two_of_three | 1 (Walter Kowalczyk) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (Harold Vance) | 0/2 |  |  |  |  |
| filler | 1 (Marjorie Pellegrino) | 0/2 | 0/2 | 1.00 | [0.34, 1.00] |  |

Outside-the-list failures: none.

### results-inbox

2 valid trials; outcomes: 0 PASS, 1 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_overdue) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (nodule_scheduled) | 0/2 |  |  |  |  |
| hemolyzed | 1 (hemolyzed_report) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (hemolyzed_note) | 0/2 |  |  |  |  |
| corrected | 1 (corrected_up) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (corrected_down) | 0/2 |  |  |  |  |
| entered_in_error | 1 (eie_result) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (eie_baseline) | 0/2 |  |  |  |  |
| preliminary | 1 (prelim_positive) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (prelim_negative) | 0/2 |  |  |  |  |
| aki | 1 (aki_48h) | 0/2 | 0/4 | 1.00 | [0.51, 1.00] |  |
|  | 2 (aki_7day) | 0/2 |  |  |  |  |
| filler | 1 (normal_tsh) | 0/2 | 0/2 | 1.00 | [0.34, 1.00] |  |

Outside-the-list failures: none.

## Independence (descriptive, gates nothing)

Observed: trials in which every item passed, and trials whose outcome is PASS. Expected under independence: trials x the product over items of each item's own pass rate (each class rate counted once per instance), and, as the plan words it, trials x the product of the class pass rates (each class once).

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| contrast-ct-prep | 2 | 2 | 2 | 2.00 | 2.00 |
| crc-care-gap | 2 | 0 | 0 | 0.00 | 1.00 |
| discharge-medrec | 2 | 2 | 2 | 2.00 | 2.00 |
| message-queue | 2 | 2 | 2 | 2.00 | 2.00 |
| renal-dose-review | 2 | 2 | 2 | 2.00 | 2.00 |
| results-inbox | 2 | 2 | 2 | 2.00 | 2.00 |


## Stopped batches (not counted)

- 88860582 (all six tasks, --trials 4): crc-care-gap/2 reached $3.59 settled, and its next request's worst case of $8.73 (body bytes priced as tokens at the 1-hour cache-write rate, plus 32k output, at about 300k context) would pass the $12.00 bound (2 x PER_TRIAL_CAP_USD). The bound surfaced as INFRA_HARNESS client_error, which stops the batch, so contrast-ct-prep/2, /3 and crc-care-gap/3 were cancelled. Ledger: $22.25, of which $9.08 is from usage and $13.17 is worst-case settles of aborted requests.
- 18ad5a58 (five tasks, crc-care-gap held): at 07:52:32Z all four in-flight requests failed in the same second, and their retries failed too. Each failed attempt is settled at its worst case, so contrast-ct-prep/2 reached the bound and stopped the batch the same way. Ledger: $33.09, of which $3.91 is from usage. The error text is not recorded (the client logs none). Host load was 300-480 at that time.

## Context and cost refit

`pnpm cli context-budget results/probe-1 --task all --project --items renal-dose-review=9,results-inbox=13,crc-care-gap=13,discharge-medrec=13,contrast-ct-prep=7,message-queue=13 --cost-from results/probe-1` (exit 1: crc-care-gap p90 $3.91 > $3.00):

```
contrast-ct-prep: 2 trials, 7 items: T 31.5, C0 13.7k, g 4.0k/req, o 984/req, k 4.21 req/item
  #0 T 32 peak 123.0k
  #1 T 31 peak 146.8k
  median cost observed $1.78, fitted $1.76 (-1%); median peak 134.9k, 8.2 s working time per request
  at 7 items: T 31.5, median $1.76, p90 $2.20, peak 134.9k (0.13 of the window), working 4.3 min
crc-care-gap: 2 trials, 13 items: T 33.5, C0 13.7k, g 9.1k/req, o 737/req, k 2.42 req/item
  #0 T 32 peak 297.0k
  #1 T 35 peak 321.5k
  median cost observed $3.16, fitted $3.12 (-1%); median peak 309.2k, 8.7 s working time per request
  at 13 items: T 33.5, median $3.12, p90 $3.91, peak 309.2k (0.31 of the window), working 4.9 min
discharge-medrec: 2 trials, 13 items: T 25.0, C0 13.7k, g 3.2k/req, o 593/req, k 1.77 req/item
  #0 T 23 peak 93.0k
  #1 T 27 peak 85.4k
  median cost observed $0.96, fitted $1.00 (+4%); median peak 89.2k, 5.5 s working time per request
  at 13 items: T 25.0, median $1.00, p90 $1.25, peak 89.2k (0.09 of the window), working 2.3 min
message-queue: 2 trials, 13 items: T 29.5, C0 13.6k, g 6.5k/req, o 806/req, k 2.12 req/item
  #0 T 23 peak 185.1k
  #1 T 36 peak 193.2k
  median cost observed $2.10, fitted $2.00 (-5%); median peak 189.1k, 7.7 s working time per request
  at 13 items: T 29.5, median $2.00, p90 $2.50, peak 189.1k (0.19 of the window), working 3.7 min
renal-dose-review: 2 trials, 9 items: T 30.5, C0 13.7k, g 4.7k/req, o 631/req, k 3.17 req/item
  #0 T 38 peak 151.8k
  #1 T 23 peak 138.0k
  median cost observed $1.52, fitted $1.57 (+4%); median peak 144.9k, 6.3 s working time per request
  at 9 items: T 30.5, median $1.57, p90 $1.97, peak 144.9k (0.14 of the window), working 3.1 min
results-inbox: 2 trials, 13 items: T 50.5, C0 13.7k, g 2.5k/req, o 555/req, k 3.73 req/item
  #0 T 49 peak 126.2k
  #1 T 52 peak 144.3k
  median cost observed $1.93, fitted $1.99 (+3%); median peak 135.2k, 5.0 s working time per request
  at 13 items: T 50.5, median $1.99, p90 $2.49, peak 135.2k (0.14 of the window), working 4.2 min
projection correction +$41.42: add to the dry-run value for spend --check --projected (per task, remaining final trials x (projected p90 + median judge - the spend tool's p90 from results/probe-1) x 1.15, never below 0)
crc-care-gap: projected p90 $3.91 > $3.00 per trial
over: 1 budget line broken
[ELIFECYCLE] Command failed with exit code 1.
exit 1
```
