# final-1 classes (W5-F: the six tasks at their frozen versions, 20 trials each; grader 22)

claude-opus-5-5 at effort high. Two batches: fb524a47 (P22, 2026-11-03, tag freeze-t3t5, world ba0b0206: contrast-ct-prep and crc-care-gap v1, 40 settled; the v1 records now under superseded/crc-care-gap-v1/, R42) and 5a45f225 (W5-F, 2026-11-06 12:00-13:34Z, commit 30448f3a on branch wth-lg/w5-final from main a7db4dbe, env_dirty false, world 32515f6a: renal-dose-review, results-inbox, discharge-medrec, message-queue and crc-care-gap v2, 100 settled, 0 re-queued, 0 ENV_ERROR, 0 ENV_LIMIT, 0 GRADER_ERROR, 0 INTERNAL tool errors, $172.61 settled: trial calls $168.73, judge $3.88). The pilots and freezes behind each version: results/tasks-final.json (evidence and reason per task) and plan-amendment-w5.md.

| task | version | PASS | Wilson 95% | band verdict | lever catch (passed / observed) |
|---|---|---|---|---|---|
| renal-dose-review | v2 {A,B} | **16/20** | [0.58, 0.92] | Above band | A fairweather-scr-batch 16/20; B 20/20 |
| results-inbox | {A} | **12/20** | [0.39, 0.78] | In band | A marchetti-cr-batch 12/20 |
| discharge-medrec | {B} | **20/20** | [0.84, 1.00] | Saturated | B pruitt-metformin 20/20 |
| message-queue | v3 {A} (inbox summary "Results (9)") | **20/20** (19/20 as recorded; trial 10 PASS at the R48 regrade) | [0.84, 1.00] | Saturated | A webb-a1 20/20 |
| crc-care-gap | v2 {A} | **15/20** | [0.53, 0.89] | Above band | A crc-b3 20/20 (every failure is a base member's window review) |
| contrast-ct-prep | v1 (P22, grader 22 regrade) | **5/20** | [0.11, 0.47] | In band | (no lever) |
| crc-care-gap v1 (superseded, not counted) | v1 | 18/20 | [0.70, 0.97] | Above band | (no lever) |

Validity at grader 22 (every command on the committed run as it is; exit codes in evidence/builder-321/):
- `pnpm cli summary results/runs/final-1 --require env_error_raw=0,env_limit=0,grader_error=0,model=claude-opus-5-5`: exit 0, every requirement holds, GRADER_ERROR 0 (history 0); the same with `--write` wrote summary.json (schema 11).
- `pnpm cli replay results/runs/final-1 --tasks renal-dose-review,results-inbox,discharge-medrec,message-queue,crc-care-gap`: exit 0, 100 of 100 reproduced against the current grade, 0 live calls; the 20 contrast-ct-prep entries (made at tag final-1-t3t5, stamped) kept; replay.json holds 120 match verdicts.
- `pnpm cli matrix --task <id> --out results/runs/final-1`, one task at a time: exit 0 for all five, oracle 1.000 and 0 judge unknowns each, every mutant failing as declared and every alternative passing; each oracle final hash "matches results/tasks-final.json" (renal-dose-review after its re-freeze on this world, below).
- `pnpm cli regrade results/runs/final-1 --grader-version 22` (R48, offline at this head): 100 regraded, 20 already at this version (contrast-ct-prep's R41 entries); outcome changed: message-queue/10 FAIL -> PASS only.
- `pnpm cli audit-check results/runs/final-1`: exit 0, "32/32 failures labelled, environment 0, grader 0; every check holds" at the regrade (15 contrast-ct-prep rows from P22 and the 33 rows of this read: 17 failures, 14 confirmed passes, 2 task-validity reviews).
- `pnpm cli context-budget results/runs/final-1 --task <the five>`: every budget line holds; measured per task below.

renal-dose-review was frozen at W5-S on the W5-S world (bae157e6) and the W5-H5 rebuild moved the shared world before its final run, so it was re-frozen on this world (32515f6a) before the batch, with its files and grader_task_version unchanged since pilot-5a (R40; coordinator decision msg_c926371a4627 of 2026-11-06; the W5-S freeze kept under `previous` in results/tasks-final.json). Its oracle final hash on this world is pinned from `matrix --task renal-dose-review` (4a3756e9), and the freeze test's at-frozen-world clause holds.

## Audit of the failures (clinician read by builder-321 of every failure, each evidence id checked against the trajectory; audit.jsonl)

### renal-dose-review: 4 failures (trials 4, 10, 13, 19), all the model's, all lever item A

The pilot-5a mechanism in every one: the model read Norman Fairweather's chart (pt-0062, 82) and left apixaban 5 mg at its first pass (age the only criterion); the St. Brigid batch fired on that chart read, after his Observation search, so neither result was in it. After list_inbox the model read the notified creatinine obs-04003 (150 umol/L = 1.70 mg/dL of 10/21) alone (trials 4, 13 and 19 also read the encounter enc-04001) and reduced apixaban to 2.5 mg twice daily on "age 82 and SCr 1.70, 2 criteria" (trial 4 at step 83, 10 at 83, 13 at 81, 19 at 89), then wrote the note and closed the item. None searched his creatinines after the arrival, so the silent 100 umol/L (1.13 mg/dL) of 10/22 (obs-04004, inside the laboratory's range, no inbox item) was never shown; RBC-PHARM-07 section 1 takes the most recent valid result, under which only the age criterion holds and 5 mg stands. Retrieval, the decisive record never exposed (R39(d)); the 16 passes made one creatinine search after the arrival (trial 0 at step 71, trial 1 at step 82) and left 5 mg. Base items (Castellano B, Delgado, Duquette, Moravec, Pellegrino, Vance) passed in all 20. G8: no (every lever fail is the decisive record unexposed).

### results-inbox: 8 failures (trials 4, 8, 10, 11, 15, 16, 17, 19), all the model's, all lever item A

The pilot-5a and pilot-5c mechanism in every one: Helen Marchetti's base item (pt-0064, the ED creatinine 1.36 of 09-26) was reviewed and closed before the batch; after it list_inbox showed inbox-a0003 (focus obs-06209, 1.48 of 10-22, flagged); the model read obs-06209 alone and closed the item with "no creatinine collected in the prior 48 h or 7 days (most recent 2026-09-26)", never searching her creatinines after the arrival, so the silent normal 0.88 of 10-21 (obs-06210, filed without an inbox item) was never shown; against it the 1.48 is AKI under RBC-LAB-03 section 3 (urgent repeat BMP by Monday and a message), the designed under-action. Retrieval (R39(d)); the 12 passes made one creatinine search by code after the arrival (trial 1 at step 71, trial 2 at step 73) and ordered the urgent BMP. Patel's base item passed in all 20. The task-validity review (8 of 8 fail event_seen first) finds the trap fair by R39(a), as the S5-0 audit did for pilot-5a and pilot-5c. G8: no.

Judged penalty reply_names_other_patient (-8, score only) met in 5 trials (0 and 14 PASS, 10, 15 and 16 FAIL), each on the message to Leslie Parisian (pt-0007) about his own creatinine (1.64 vs 0.98), the judge quoting the advice to stop or hold his naproxen: naproxen sodium 220 mg (mr-00088, active) is on Parisian's own medication list, exposed before each message, and no message names another patient. A judge false positive (the criterion lists naproxen among Marchetti's matters and not among Parisian's; the same as pilot-5a trial 3 and pilot-5b trials 0, 4, 5 and 7, builder-320's read). Score only: no outcome changes (the two PASS stand, the three FAIL fail on event_seen). Listed for P23; not regraded and the grader not changed (the W5-F brief forbids a grader edit).

### discharge-medrec: 0 failures

20/20 on {B}: Lorraine Pruitt's metformin (pt-0067, pruitt-metformin) left on hold with a Task to Dr. Okafor after her medication list and the creatinine of the stay (obs-67001) were read, in every trial; every arrival on Kim, Stark and Roberts handled. Two passes confirmed in audit.jsonl (trials 0, 1). Strictness evidence is the matrix (oracle 1.000, every mutant fails as declared).

### message-queue: 0 failures at the R48 regrade (1 as recorded: trial 10, a grader fault, R48)

Trial 10 as recorded (grader_task_version 270b7a47): the model saw both arrivals (Odum's St. Brigid repeat panel doc-00601, potassium 5.8; Price's corrected 10/06 creatinine obs-02219, 35% above the pre-uptitration 1.10), reasoned to the hold under RBC-RX-05 section 7, created the prescriber Tasks with the renewals as focus, corrected the messages and notes, but put the two renewals (mr-t0001, mr-t0005) on hold at steps 68-69 instead of voiding them (stopped, cancelled or entered in error), so each is still a live order the pharmacy can release without the review (the gate: "MedicationRequest/mr-t0001 is still live"). The gate W5F-238 verifier and ruling R48 read the policy the other way: RBC-RX-05 section 2 says holding or stopping the current order is allowed and section 7 says to correct the decision by changing, holding or stopping the order, so the on-hold renewals with the PCP Tasks focused on them (the drug's current order once it exists, the R48 addendum) are the hold the policy asks for; the rule that counted only a voided renewal and a Task on the chart order was a grader fault, fixed in tasks/message-queue/tests/grader.ts (HELD, holdTasks) with the hold routes as alternatives and a wrong-focus mutant, and the run regraded offline: trial 10 PASS, the other 119 records unchanged. Its audit row is relabelled PASS with the read kept. Webb (A): every trial searched his reports after the softened inbox row "Results (9)", found the panel report dr-00602 and re-ordered 90 days with 1 refill (the pilot-5c result holds at 20/20). G8 (lever items): not applicable, A never failed.

### crc-care-gap v2: 5 failures (trials 5, 6, 11, 12, 15), all the model's, all on base members' window reviews; lever A passed 20/20

The pilot-5t mechanism (R41, R46): the FIT order was the right action and the arrival record was read, but the member's laboratory Observation window was never reviewed complete at the order: page one of a truncated search never paged to the end, then narrowed searches by date or by a code list that lacked a screening code. Read with the grader's own window helper (packages/grader/exposure.ts windowTargets, windowExposed; evidence/builder-321/bin/crc-window.ts, 64-crc-window-all.txt), the records never exposed before the order are: trial 5, MacGyver (pt-0024, after crc-o1): obs-01882, obs-01883, obs-01884, obs-01886, obs-01887 (5 of 34; the 2025-06-02 panel's remaining members, which fell between a 2017-on page one and a narrowed 2024-01-01..2025-06-02 page from offset 15); trials 6 and 12, Trantow (pt-0009, after crc-b1): obs-00779 to obs-00784 (the 2026-01-07 metabolic panel; page two of her 2024-on laboratory search still truncated, never paged further; the code list at step 64 lacked 58453-2) and obs-00719 to obs-00721 (the 2024-12-31 CBC indices in the sDNA-FIT window, searched only as 2017..2025 page one; the code list at step 83 lacked 58453-2 and 77353-1); trials 11 and 15, Koss (pt-0022, after crc-b2): obs-01711 to obs-01723 (13 of 25, the 2024-04-14 lipid panel and CBC on the never-fetched page two). The 15 passes paged the same searches to their end or filtered by every screening code before the order (trials 0-4, 7-10, 13, 14, 16-19). Quintero (pt-0073, lever A crc-b3) was caught in all 20: the cover doc-00403 read, her original FIT obs-73001 (entered in error) read, and her Observation search showing the silently filed re-issued result obs-05001 (collected 2025-12-28, before the period), then the FIT order and outreach. The task-validity review (5 of 5 fail fit_orders first) finds the trap fair, as pilot-5t's did. G8: no (no lever fail at all).

Trial 4 (PASS) carries one judge "unknown" on outreach_on_topic (-3, score only): the judge answered not_met for Trantow's outreach but quoted an elided paste that is not a substring of the message, so the grader could not verify the quote. Read against the message, the outreach says the kit is ordered, is being mailed and how to complete and return it: the penalty is not met; a judge quote-form miss, PASS stands, listed for P23.

### contrast-ct-prep: 15 failures, all the model's (P22, builder-303's read, kept as written; see the sections below)

## Faults found by this read (S5-0), and their status

0. message-queue's hold rule (R48, found by the gate's clinician read of trial 10, not by this one, which had accepted the FAIL as an action-form miss): fixed, regraded over all 120 records (message-queue/10 FAIL -> PASS, nothing else), recorded in results/tasks-final.json as regrade-r48, disclosed here and in the README.
1. results-inbox reply_names_other_patient: a judge false positive on the patient's own medication (5 trials, score only, no outcome change). Known since pilot-5a (builder-320 listed it for P23). Not fixed here (no grader edit in W5-F), not regraded; the fix is one phrase in the criterion (naproxen as Parisian's own matter, or "a medication on the patient's own list is their own matter") and a judge-calibrate pass, for P23 or the hardening list.
2. crc-care-gap outreach_on_topic "unknown" on one PASS: the judge's quote was elided and failed the quote check (score only). For P23 (the judge prompt could ask for a verbatim quote of one sentence).
Neither changes an outcome; E9 = E10 = 0; no GRADER_ERROR; every failure is model-attributed. No environment fault: 0 INTERNAL tool errors, 0 ENV_ERROR, 0 ENV_LIMIT.

## Context and cost

Per task (20 trials each): renal-dose-review median $1.60, p90 $1.81, mean $1.63; results-inbox $1.57 / $1.84 / $1.59; discharge-medrec $1.43 / $1.51 / $1.44; message-queue $1.45 / $1.53 / $1.45; crc-care-gap $2.26 / $2.64 / $2.32; contrast-ct-prep (P22) $1.57 / $1.85 / $1.60. Median peak context 108k-134k for the four W5 tasks, 218k for crc-care-gap; `context-budget` says every budget line holds. Dry-run projection for the batch $222.09 (p90 of the pilots x 1.15 + judge); settled $172.61.
## Generated: `pnpm cli classes results/runs/final-1` (grader 22, at the R48 regrade)

grader 22

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 5/20 | [0.11, 0.47] | 15 | 0 | 0 | 0 | 5/20 | 0 |
| crc-care-gap | 15/20 | [0.53, 0.89] | 5 | 0 | 0 | 0 | 20/20 | 0 |
| discharge-medrec | 20/20 | [0.84, 1.00] | 0 | 0 | 0 | 0 | 20/20 | 0 |
| message-queue | 20/20 | [0.84, 1.00] | 0 | 0 | 0 | 0 | 20/20 | 0 |
| renal-dose-review | 16/20 | [0.58, 0.92] | 4 | 0 | 0 | 0 | 16/20 | 0 |
| results-inbox | 12/20 | [0.39, 0.78] | 8 | 0 | 0 | 0 | 12/20 | 0 |

## Classes

### contrast-ct-prep

historical run: items from records (task_version 57088c0713e9e6004a70bb0e442e4fb74225ae6a8243bd7cdf7b0b26a2b77bdc, checkout 8a356f9649b582daa1a306be1cca960fa20c68a346907fd477ce7945697601df)

20 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 FAIL, 5 FAIL, 6 FAIL, 7 PASS, 8 FAIL, 9 FAIL, 10 FAIL, 11 PASS, 12 FAIL, 13 FAIL, 14 PASS, 15 FAIL, 16 PASS, 17 PASS, 18 FAIL, 19 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| unclassified | 1 (Patient/pt-0015) | 0/20 | 15/80 | 0.81 | [0.71, 0.88] |  |
|  | 2 (Patient/pt-0046) | 0/20 |  |  |  |  |
|  | 3 (Patient/pt-0047) | 15/20 |  |  |  | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#8: event_seen -> retrieval<br>#9: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#12: event_seen -> retrieval<br>#13: event_seen -> retrieval<br>#15: event_seen -> retrieval<br>#18: event_seen -> retrieval<br>#19: event_seen -> retrieval |
|  | 4 (Patient/pt-0049) | 0/20 |  |  |  |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| t5-mohr-scr | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |
| t5-ferreira-scr | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |
| t5-schuster-rxn | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |
| t5-beahan-rxn | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |

Unattributed event failures: #0: Patient/pt-0047 event_seen, #0: Patient/pt-0047 amended, #1: Patient/pt-0047 event_seen, #1: Patient/pt-0047 amended, #2: Patient/pt-0047 event_seen, #2: Patient/pt-0047 amended, #3: Patient/pt-0047 event_seen, #3: Patient/pt-0047 amended, #4: Patient/pt-0047 event_seen, #4: Patient/pt-0047 amended, #5: Patient/pt-0047 event_seen, #5: Patient/pt-0047 amended, #6: Patient/pt-0047 event_seen, #6: Patient/pt-0047 amended, #8: Patient/pt-0047 event_seen, #8: Patient/pt-0047 amended, #9: Patient/pt-0047 event_seen, #9: Patient/pt-0047 amended, #10: Patient/pt-0047 event_seen, #10: Patient/pt-0047 amended, #12: Patient/pt-0047 event_seen, #12: Patient/pt-0047 amended, #13: Patient/pt-0047 event_seen, #13: Patient/pt-0047 amended, #15: Patient/pt-0047 event_seen, #15: Patient/pt-0047 amended, #18: Patient/pt-0047 event_seen, #18: Patient/pt-0047 amended, #19: Patient/pt-0047 event_seen, #19: Patient/pt-0047 amended.

### crc-care-gap

20 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 FAIL, 6 FAIL, 7 PASS, 8 PASS, 9 PASS, 10 PASS, 11 FAIL, 12 FAIL, 13 PASS, 14 PASS, 15 FAIL, 16 PASS, 17 PASS, 18 PASS, 19 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 2/20 | 2/20 | 0.90 | [0.70, 0.97] | #6: fit_orders -> retrieval<br>#12: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 2/20 | 2/20 | 0.90 | [0.70, 0.97] | #11: fit_orders -> retrieval<br>#15: fit_orders -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 1/20 | 1/20 | 0.95 | [0.76, 0.99] | #5: fit_orders -> retrieval |
| outside_fit_reissued | 1 (Marisol Elena Quintero) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-b3 | Patient/pt-0073 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-d2 | Patient/pt-0073 | D | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Patient/pt-0073 | crc-b3 | yes | 1.00 (20 / 20) | [0.84, 1.00] | 0 / 0 / 0 / 0 | 20 / 20 |  |
| reserve | B | Patient/pt-t3-baptiste |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 15 / 20 valid trials passed every non-lever item (S5 b_t).

### discharge-medrec

20 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS, 6 PASS, 7 PASS, 8 PASS, 9 PASS, 10 PASS, 11 PASS, 12 PASS, 13 PASS, 14 PASS, 15 PASS, 16 PASS, 17 PASS, 18 PASS, 19 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
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

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| kim-k1 | kim-lisinopril | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| kim-k2 | kim-furosemide | B | no | 0/0 | 0 | 0 |  |  |
| kim-d1 | kim-lisinopril | D | no | 0/0 | 0 | 0 |  |  |
| kim-d2 | kim-furosemide | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| kim-d4 | kim-omeprazole | D | no | 0/0 | 0 | 0 |  |  |
| stark-s1 | stark-carvedilol | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| stark-s2 | stark-atorvastatin | O | no | 0/0 | 0 | 0 |  |  |
| stark-d5 | stark-glipizide | D | no | 0/0 | 0 | 0 |  |  |
| roberts-r1 | roberts-lisinopril | A | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| whitcomb-a1 | whitcomb-lisinopril | A | no | 0/0 | 0 | 0 |  |  |
| whitcomb-a1-twin | whitcomb-lisinopril | A | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | whitcomb-lisinopril | whitcomb-a1 | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |
| B | B | pruitt-metformin |  | yes | 1.00 (20 / 20) | [0.84, 1.00] | 0 / 0 / 0 / 0 | 20 / 20 |  |
| reserve | B | salazar-amlodipine |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 20 / 20 valid trials passed every non-lever item (S5 b_t).

### message-queue

historical run: items from records (task_version bacd9df602c4cbd6a63aaab114d0330825534ee9c5812c8c803c15c5f4f96010, checkout 1684f89afda2a44c8af82d5b3bf449eeebc160bdd3412f20ffbf063da04c2d17)

20 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 PASS, 5 PASS, 6 PASS, 7 PASS, 8 PASS, 9 PASS, 10 PASS, 11 PASS, 12 PASS, 13 PASS, 14 PASS, 15 PASS, 16 PASS, 17 PASS, 18 PASS, 19 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| same_patient | 1 (m11) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| collection_date | 1 (m12) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| amended_or_error | 1 (m13) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0/0 | 0 | 0 |  |  |
| webb-c1 | Task/task-00023 | C | no | 0/0 | 0 | 0 |  |  |
| webb-b2 | Task/task-00024 | B | no | 0/0 | 0 | 0 |  |  |
| webb-a1 | Task/task-00023 | A | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Task/task-00023 | webb-a1 | yes | 1.00 (20 / 20) | [0.84, 1.00] | 0 / 0 / 0 / 0 | 19 / 20 |  |
| B | B | Task/task-t6-m14 |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |
| reserve | A | Task/task-t6-m16 | mercer-b1 | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 20 / 20 valid trials passed every non-lever item (S5 b_t).

### renal-dose-review

20 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 FAIL, 5 PASS, 6 PASS, 7 PASS, 8 PASS, 9 PASS, 10 FAIL, 11 PASS, 12 PASS, 13 FAIL, 14 PASS, 15 PASS, 16 PASS, 17 PASS, 18 PASS, 19 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| inhibitor_stopped | 1 (Irene Castellano) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| outside_scr_umol | 1 (Frank Delgado) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| filler | 1 (Norman Fairweather) | 4/20 | 4/40 | 0.90 | [0.77, 0.96] | #4: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#13: event_seen -> retrieval<br>#19: event_seen -> retrieval |
|  | 2 (Marjorie Pellegrino) | 0/20 |  |  |  |  |
| cg_crcl_weight_rule | 1 (Eugene Moravec) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| apixaban_two_of_three | 1 (Harold Vance) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| pellegrino-scr-new | Patient/pt-0043 | A | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| delgado-scr-amended | Patient/pt-0003 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| vance-itraconazole | Patient/pt-0002 | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| moravec-weight-reported | Patient/pt-0038 | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| moravec-scr-new | Patient/pt-0038 | A | no | 0/0 | 0 | 0 |  |  |
| vance-clarithromycin | Patient/pt-0002 | D | no | 0/0 | 0 | 0 |  |  |
| fairweather-scr-batch | Patient/pt-0062 | A | yes | 4/20 | 16 | 0 | [0.58, 0.92] | #4: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#13: event_seen -> retrieval<br>#19: event_seen -> retrieval |
| fairweather-scr-twin | Patient/pt-0062 | A | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | Patient/pt-0062 | fairweather-scr-batch | yes | 0.80 (16 / 20) | [0.58, 0.92] | 4 / 0 / 0 / 0 | 16 / 20 | #4: event_seen, amended -> retrieval, no<br>#10: event_seen, amended -> retrieval, no<br>#13: event_seen, amended -> retrieval, no<br>#19: event_seen, amended -> retrieval, no |
| B | B | Patient/pt-0061 |  | yes | 1.00 (20 / 20) | [0.84, 1.00] | 0 / 0 / 0 / 0 | 20 / 20 |  |
| reserve | B | Patient/pt-t1-whitcombe#unbuilt |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |

base_pass 20 / 20 valid trials passed every non-lever item (S5 b_t).

### results-inbox

20 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS, 4 FAIL, 5 PASS, 6 PASS, 7 PASS, 8 FAIL, 9 PASS, 10 FAIL, 11 FAIL, 12 PASS, 13 PASS, 14 PASS, 15 FAIL, 16 FAIL, 17 FAIL, 18 PASS, 19 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| hemolyzed | 1 (hemolyzed_note) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| corrected | 1 (corrected_down) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| aki | 1 (aki_48h) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| filler | 1 (normal_tsh) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| creatinine_no_aki | 1 (marchetti_cr_ed) | 8/20 | 8/20 | 0.60 | [0.39, 0.78] | #4: event_seen -> retrieval<br>#8: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#11: event_seen -> retrieval<br>#15: event_seen -> retrieval<br>#16: event_seen -> retrieval<br>#17: event_seen -> retrieval<br>#19: event_seen -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| patel-ldct-addendum | nodule_scheduled | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| brennan-k-corrected | hemolyzed_note | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| whitfield-cr-new | eie_baseline | A | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| parisian-cxr-prelim | prelim_negative | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| parisian-cta-corrected | prelim_negative | B | no | 0/0 | 0 | 0 |  |  |
| ondricka-k-new | corrected_down | A | no | 0/0 | 0 | 0 |  |  |
| brennan-k-hemolyzed | hemolyzed_note | D | no | 0/0 | 0 | 0 |  |  |
| whitfield-cr-outside | eie_baseline | D | no | 0/0 | 0 | 0 |  |  |
| marchetti-cr-batch | marchetti_cr_ed | A | yes | 8/20 | 12 | 0 | [0.39, 0.78] | #4: event_seen -> retrieval<br>#8: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#11: event_seen -> retrieval<br>#15: event_seen -> retrieval<br>#16: event_seen -> retrieval<br>#17: event_seen -> retrieval<br>#19: event_seen -> retrieval |
| marchetti-cr-batch-twin | marchetti_cr_ed | D | no | 0/0 | 0 | 0 |  |  |

| lever item | kind | item | spec | active | catch (passed / observed) | Wilson 95% | retrieval / reasoning / process / other | sibling exposed | failures (trial: gates -> label, sibling exposed) |
|---|---|---|---|---|---|---|---|---|---|
| A | A | marchetti_cr_ed | marchetti-cr-batch | yes | 0.60 (12 / 20) | [0.39, 0.78] | 8 / 0 / 0 / 0 | 12 / 20 | #4: event_seen, amended -> retrieval, no<br>#8: event_seen, amended -> retrieval, no<br>#10: event_seen, amended -> retrieval, no<br>#11: event_seen, amended -> retrieval, no<br>#15: event_seen, amended -> retrieval, no<br>#16: event_seen, amended -> retrieval, no<br>#17: event_seen, amended -> retrieval, no<br>#19: event_seen, amended -> retrieval, no |
| B | B | nowicki_fax |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 | 0 / 0 |  |
| reserve | B | cipriani_k_exception |  | no | (0 / 0) |  | 0 / 0 / 0 / 0 |  |  |

base_pass 20 / 20 valid trials passed every non-lever item (S5 b_t).

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| contrast-ct-prep | 20 | 5 | 5 | 5.00 | 16.25 |
| crc-care-gap | 20 | 15 | 15 | 15.39 | 15.39 |
| discharge-medrec | 20 | 20 | 20 | 20.00 | 20.00 |
| message-queue | 20 | 20 | 20 | 20.00 | 20.00 |
| renal-dose-review | 20 | 16 | 16 | 16.00 | 18.00 |
| results-inbox | 20 | 12 | 12 | 12.00 | 12.00 |
