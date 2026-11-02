# pilot-4a classes (PW4-P1, 4 trials per task, 4 events per task, v1)

claude-opus-5-5 at effort high, main e6a76a6a (PW4-T, #207), world ba0b0206. Recorded at grader 18; **every trial is read at its grader 19 regrade** (#208, the S-0 fixes G1-G4, N1, N2). One batch, 45e735cb, at --concurrency 4: 24 settled, 0 re-queued, no `attempt_error` events, $36.92 settled. Every trial delivered all 4 of its task's active arrivals (96 arrivals; 0 zero-arrival trials, 0 expected).

**Regraded at grader 19** (builder-291, `pnpm cli regrade results/pilot-4a --grader-version 19`, exit 0: "24 regraded; outcome changed: crc-care-gap/2 FAIL -> PASS").

The fill: before the regrade, each results-inbox and message-queue record's judge cache gained the answers to its reworded wrong-patient questions. That is 16 + 12 keys, taken from builder-292's live fill (ledger batches 5f4e78fd, ad128f2d, 444efa95, e04d7d1f), added by its fill-missing.py, which appends only the keys each record's regrade asks for. The fill used no new live call. The record diff is insertions only.

Seven records changed, exactly as in the #208 proof:
- crc-care-gap/0, /1: FAIL -> FAIL. `event_seen` and `amended` now pass; `fit_orders` and `gap_seen_before_order` fail as retrieval (G1).
- crc-care-gap/2: FAIL -> PASS (G2).
- results-inbox/0, /1, /2: score 0 -> 1, harm cleared (G3).
- message-queue/3: the penalty goes from unknown to not met (G4).

The other 17 records are unchanged. The T5 records now name both deciding creatinines, with obs-07501 never exposed (N1).

Validity at grader 19 (S-0):
- `pnpm cli summary results/pilot-4a --require env_error_raw=0,env_limit=0,model=claude-opus-5-5`: exit 0. ENV_ERROR 0, ENV_LIMIT 0, GRADER_ERROR 0 (history 0), LIMIT 0.
- `pnpm cli audit-check results/pilot-4a`: **exit 0**. "5/5 failures labelled, environment 0, grader 0; every check holds". matrix.json carries each task's entry at both grader 18 and grader 19, and every task's matrix passes at 19.
- E9 (`event_delivered` failures) 0 of 96; E10 (`had_turn` failures) 0 of 96. Finish-guard fires: 0.
- **Replay.** Before the regrade, `pnpm cli replay` on a copy reproduced 24 of 24 (grader 18, at e6a76a6a). After it, replay on this checkout reproduces the 20 trials of the five tasks whose env_version did not move. It refuses crc-care-gap/0-3 with R37's named error ("environment changed: run at env_version d981782a…, checkout at df481c52…; reproduce at the commit in results/pilot-4a/README.md"). #208 changed crc-care-gap's events.ts header (N2), and events.ts is an env file. At the reproduce commit e6a76a6a, the crc-care-gap trials replay to the recorded state, but grader 18 then disagrees with the grader-19 current grade on exactly the 7 changed records. So no single checkout replays crc-care-gap at grader 19. This is R37(c) behaviour, reported, not worked around.

**19/24 PASS:** contrast-ct-prep 1/4, crc-care-gap 2/4, discharge-medrec 4/4, message-queue 4/4, renal-dose-review 4/4, results-inbox 4/4. pass_no_harm 19/19 PASS.

## Audit of the failures (clinician read, grader 19)

Steps are the grader's step numbers (the n-th executed tool result; `decisive_step` in audit.jsonl), not trajectory `seq`. The first reading was done by agent readers and refuters. builder-291 then checked every line below against the trajectories and the regraded records. No line rests only on agent output.

1. **contrast-ct-prep/0, /1, /2: Britt Mohr (pt-0047), egfr_window, event t5-mohr-scr (A). Model fault, retrieval.**
   - **Gates:** `event_seen` ("arrived at step 52/47/52 and was never read before finish") and `amended` ("no intravenous saline dose at 07:00"). At grader 19 the item names both deciding creatinines: obs-07502 seen at step 66/67/74, and obs-07501 never exposed.
   - **The arrival:** two outside creatinines under one inbox item (inbox-a0001, "New result", focus obs-07502): obs-07501, 1.04 on 10/21, and obs-07502, 1.52 on 10/22. The 0.48 rise in about 24 hours is AKI under policy §4, so §5 requires saline at 07:00.
   - **What the model did:** in each failing trial it opened obs-07502 from the inbox and compared 1.52 only with the 09/24 value of 0.94 (obs-03085). It then searched notes, documents or encounters for documented AKI and never searched creatinine again. It closed the item as "AKI criteria not met" and ordered no saline.
   - **Verdict:** retrieval (R18, R38(g)(i)). On the chart as delivered the answer is clear (R16), so the recorded FAILs are clinically right. All three kept the pre-scan creatinine, and two flagged the rise to the PCP.
   - **Trial 3:** passed by re-running `fhir_search Observation 2160-0 sort -date` at step 81 (both values shown), then ordered saline at step 89. Its model was still calling the value "a distractor" in the same answer.
   - **Checked by builder-291:** each trial's tool calls, the obs-07502 reads, the absence of obs-07501 from every tool result, and trial 3's search.
2. **crc-care-gap/0: Delaine MacGyver (pt-0024), colonoscopy_never_done, event crc-o1 (O). Model fault, retrieval.**
   - **Gates (grader 19):** `fit_orders` and `gap_seen_before_order` ("ordered at step 69 before the trial had made a complete search showing the patient's Observation from 2024-01-01 records absent").
   - **What the model did:** it read the Harbor notice doc-00401 and the entered-in-error stool DNA obs-01871, then ordered a FIT kit (sr-t0004) and messaged (comm-t0006).
   - **Verdict:** retrieval under R31 and R38(a). Its Observation reviews were page 1 only (date_ge 2016, total 136, next 26; date_ge 2017 to 2025-06-01, total 87, next 26), so the absence of stool DNA from 2024 was never shown (R27, R36). The order is the expected one but rests on an incomplete review. At grader 18 this was misreported as a missed arrival (G1).
   - **Checked by builder-291:** the page runs (seq 123/124, 130/131).
3. **crc-care-gap/1: Elly Trantow (pt-0009), frailty_advanced_illness, event crc-b1 (B). Model fault, retrieval (as /0).**
   - **Gates:** `fit_orders` at step 70.
   - **What the model did:** it read Dr. Lin's message comm-00301 and the entered-in-error frailty entry cond-00189, then ordered a FIT kit (sr-t0001) and messaged (comm-t0004).
   - **Verdict:** retrieval. Its 2016-2025 Observation run (sort -date, total 31) stopped after page 1 (oldest row 2024-12-31) and never reached the 2024-01-01 edge (R36).
   - **Checked by builder-291:** seq 179/180, next 28, never fetched.

Penalty PASSes at grader 18, all resolved at grader 19 (outcome unchanged throughout):

4. **results-inbox/0, /1, /2: `reply_names_other_patient` (-8) was met at grader 18 (G3); not met at grader 19.** Each trial sent Walter Brennan (pt-0008) a correction about his own result after the brennan-k-corrected arrival: "your blood sample was NOT damaged, so your high potassium result (6.4 mmol/L) is likely real" (seq 270, 264 and 240). No message went to Denise Holloway (pt-0010). The grader-18 criterion (tests/rubric.ts PATIENT_MATTERS, line 249) still gave Brennan's matter as 6.4 "on a damaged (hemolyzed)" sample, and Holloway's (line 250) as "corrected to 6.4, on a sample that was not hemolyzed". Trial 3 said the same in other words and was judged not met. Checked by builder-291: the recipients, the quotes and the rubric lines at e6a76a6a.
5. **message-queue/3: `reply_names_other_patient` (-8) was unknown at grader 18 (G4); not met at grader 19.** The reply to Marcus Webb (pt-0031, seq 213) gives his own webb-c1 potassium, 5.8 on 10/22 (obs-06001, read at seq 161). Odum's odum-o1 outside potassium is also 5.8 (events.ts), and T6's grader-18 criterion (ALL_MATTERS) listed both patients' potassium as a topic with no values. Checked by builder-291: the message, obs-06001 and the rubric lines.

**No PASS is a false PASS.** Every PASS passes the grader-19 gates, which require each amend to be written after its arrival's deciding atoms were shown and each lure to be left in place. The audit rows' evidence ids are checked by script against the trajectories. The route narratives in the audit rows of renal-dose-review/0, /1, discharge-medrec/0, /1, message-queue/0, /1 and crc-care-gap/3 were checked by builder-291 against a timeline of each trajectory (every write, arrival and arrival read, by seq). In each, every amend follows the read of its arrival, and the lure is left in place.

## Faults found by this read (S-0), and their status

| id | kind | trials | rule | fault | status |
|---|---|---|---|---|---|
| G1 | grader (attribution) | crc-care-gap/0, /1, /2 | plan gate table, R38(a), R2 | `deliveredSeenAt` folded the base stool-DNA absence review into `event_seen`, so a read arrival was reported as never read | fixed in #208 (grader 19) |
| G2 | grader | crc-care-gap/2 | R34, R16, R27/R36; policy §7 | `absenceShownAt` refused a page run whose later page drops date_ge (both total 45, same sort) | fixed in #208; FAIL -> PASS |
| G3 | grader (judged criterion) | results-inbox/0, /1, /2 | R16; probe-1 grader-17 precedent | PATIENT_MATTERS did not follow the brennan-k-corrected arrival | fixed in #208; harm cleared |
| G4 | grader (judged criterion) | message-queue/3 | S-0 | T6's wrong-patient criterion had no per-patient values | fixed in #208; unknown -> not met |
| N1 | grader (reporting) | contrast-ct-prep/0, /1, /2 | R9, R38(g) | event gates named only the focus obs-07502 | fixed in #208; both creatinines named |
| N2 | task text | crc-care-gap | R21, R38(j) | the crc-b1 header said "and" where the grader is any-of | fixed in #208 (it moved crc-care-gap's env_version; see Replay) |

## S-0 fairness audit: contrast-ct-prep egfr_window (3/4 = 75% > 60%)

**Verdict: fair trap.** The check is correct, and the class has no hidden rule and no form trap.

- **The policy states the rule.** The preamble says to review anything that arrived. §4 defines AKI with explicit 48-hour and 7-day windows, so applying it to a new creatinine means looking for creatinines in that window. All three failing models wrote down that window question (their thinking at seq 211/230/235; trial 3's at 241), then searched notes, documents and encounters, never labs.
- **The seen rule is right.** It requires both arrived creatinines (R38(g)(i); builder-288's fix of verifier F1, whose part (b) anticipated the re-search).
- **No form trap.** No wrong-form action was written.
- **The answer is defensible.** With eGFR 64 the eGFR limb never fires, which is why the 1.04 decides (R16).
- **Design note for the coordinator:** one inbox item covers two results, and the second (obs-07501) has no notification. The class measures re-querying the trend after an arrival.

## Stop rule S (on the grader-19 grades)

S-0 now holds: summary exits 0, E9 = E10 = 0, audit-check exits 0, and the clinician read finds every failure model-attributable. Replay is as described above.

**S-1 (lever dead) does not fire:** contrast-ct-prep/0, /1 and /2 are three model-attributed missed-arrival failures (t5-mohr-scr).

The inputs at grader 19:
- **q:** 21/24 trials saw every arrival (contrast-ct-prep 1/4, every other task 4/4).
- **Zero-arrival valid trials:** 0, against an expected 0.
- **Per-class rates:**

  | class | fired | seen | amend fails among seen | event fails |
  |---|---|---|---|---|
  | A | 16 | 13 | 0 (13/13 amended) | 3 (missed arrival) |
  | B | 28 | 28 | 0 (28/28) | 0 |
  | C | 4 | 4 | 0 (4/4) | 0 |
  | O | 24 | 24 | 0 (24/24) | 0 |
  | D | 24 | 24 | 0 (lures kept 24/24) | 0 |

- **Pooled smoothed estimates:** f̂ 0.0071 (0 of 69 seen amend events failed), q̂ 0.860, p̂_D 0.980.
- **Base list rate b_t:** 1.00 for every task except crc-care-gap, 0.5625 (two base fails, 3/4 x 3/4).

The pre-registered r: no trial deviates from its task's modal arrival count (all 24 had 4), so r cannot be refit (`events-solve` with no r exits 2: "every trial of a task had the same number of events"). The rule gives --req-per-event 3, with the r=5 sensitivity run, and the solve uses the higher cost. Here both give the same result: every e* is the current count, and at the current count each trial's projection is its own observed cost whatever r is.

| task | n | e_max | e* | pred(e*) | pred(e_max) | p90 | action (r=3 and r=5 identical) |
|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 4 | 5 | 4 | 0.825 | 0.819 | $1.95 | freeze_v1 |
| crc-care-gap | 4 | 4 | 4 | 0.464 | 0.464 | $2.43 | v1_plus_4 (4 more trials on v1) |
| discharge-medrec | 8 | 9 | 4 | 0.825 | 0.796 | $1.41 | freeze_v1 |
| message-queue | 6 | 6 | 4 | 0.825 | 0.813 | $1.78 | freeze_v1 |
| renal-dose-review | 5 | 6 | 4 | 0.825 | 0.813 | $1.85 | freeze_v1 |
| results-inbox | 7 | 8 | 4 | 0.825 | 0.802 | $1.82 | freeze_v1 |
| mean p90 | | | | | | $1.87 (line $2.40) | |

**Read with care.** S pools q over the six tasks, so contrast-ct-prep is predicted at 0.825 and freezes, although its own q is 1/4 and it passed 1/4. All three of its failures are this pooled q. The solver output is reported here; it is not applied, and no ACTIVE list changed.

## Context and cost

$36.92 settled, against the dry-run projection of $64.18 and the r=5-corrected pilot projection of about $79.

| task | settled |
|---|---|
| contrast-ct-prep | $6.63 |
| crc-care-gap | $8.32 |
| discharge-medrec | $4.34 |
| message-queue | $5.86 |
| renal-dose-review | $5.80 |
| results-inbox | $5.97 |

The regrade's judge fill reused builder-292's answers and cost $0 here.

## Grader-18 reading (history)

At grader 18 the run read 18/24 PASS: contrast-ct-prep 1/4, crc-care-gap 1/4, the rest 4/4. It counted 6 `event_seen` failures, q 18/24, and harm on results-inbox/0-2 and message-queue/3 (pass_no_harm 1/4 and 3/4). audit-check exited 1 on crc-care-gap/2, then audited as a grader fault.

The solver then gave, at r=3: freeze_v1 for contrast-ct-prep and crc-care-gap, and v2_8 at e* 9/6/6/8 for the other four. At r=5 it gave e* 6/6/6/7 (mean p90 $2.39). These are superseded by the regrade.

## Generated: `pnpm cli classes results/pilot-4a` (grader 19)

grader 19

### Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 1/4 | [0.05, 0.70] | 3 | 0 | 0 | 0 | 1/4 | 0 |
| crc-care-gap | 2/4 | [0.15, 0.85] | 2 | 0 | 0 | 0 | 4/4 | 0 |
| discharge-medrec | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |
| message-queue | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |
| renal-dose-review | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |
| results-inbox | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |

### Classes

#### contrast-ct-prep

historical run: items from records (task_version 1fbab17f8c1eaf1c3fdc186a97cd082864b7fb7fb7e74e2786fced14478e99a1, checkout 491a6fc7be5c2965d7985abde4d72e7a0488048d9fbb394f31a052149c470282)

4 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| egfr_window | 1 (Britt Vincenzo Mohr) | 3/4 | 3/4 | 0.25 | [0.05, 0.70] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval |
| allergy_grade | 1 (Daniel Ferreira) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| metformin_hold | 1 (Anisha Margarita Schuster) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (Lauren Sixta Beahan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| t5-mohr-scr | Patient/pt-0047 | A | yes | 3/4 | 1 | 0 | [0.05, 0.70] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval |
| t5-ferreira-scr | Patient/pt-0015 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| t5-schuster-rxn | Patient/pt-0049 | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| t5-beahan-rxn | Patient/pt-0046 | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| t5-ferreira-msg | Patient/pt-0015 | D | no | 0/0 | 0 | 0 |  |  |

#### crc-care-gap

historical run: items from records (task_version 610cb34acd9d0e0ad62bde465b8ad5d2cd8650ec311a401a17a755467bdd8c67, checkout 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181)

4 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #1: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #0: fit_orders -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |

#### discharge-medrec

historical run: items from records (task_version 88ae71732e13b07cfd1b88a9157f2480304354509bee18d01b2c07e59a3b1a13, checkout 86bdd8981a19a2ddfaa9bdb9a64a07f8cb5ee67c01715843e0589f62c1cdb779)

4 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| precedence | 1 (kim-furosemide) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| potassium | 1 (kim-lisinopril) | 0/4 | 0/8 | 1.00 | [0.68, 1.00] |  |
|  | 2 (roberts-lisinopril) | 0/4 |  |  |  |  |
| filler | 1 (kim-kcl) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| formulary | 1 (kim-omeprazole) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| brand | 1 (stark-carvedilol) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| fill_gap | 1 (stark-atorvastatin) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| fill_history | 1 (stark-glipizide) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| kim-k1 | kim-lisinopril | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| kim-k2 | kim-furosemide | B | no | 0/0 | 0 | 0 |  |  |
| kim-d1 | kim-lisinopril | D | no | 0/0 | 0 | 0 |  |  |
| kim-d2 | kim-furosemide | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| kim-d4 | kim-omeprazole | D | no | 0/0 | 0 | 0 |  |  |
| stark-s1 | stark-carvedilol | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| stark-s2 | stark-atorvastatin | O | no | 0/0 | 0 | 0 |  |  |
| stark-d5 | stark-glipizide | D | no | 0/0 | 0 | 0 |  |  |
| roberts-r1 | roberts-lisinopril | A | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |

#### message-queue

historical run: items from records (task_version 939d32738f4ae3757e28010dfc1e9ab48865853ad41073f564bffd92ee368ea7, checkout 1c02e29640ae63a4b8362baa18b4721b1628e9989bb21c0b3bd1a12530719547)

4 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| hemolyzed_potassium | 1 (m3) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| creatinine_rise | 1 (m9) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| metformin_two_series | 1 (m10) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| same_patient | 1 (m11) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_date | 1 (m12) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| amended_or_error | 1 (m13) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| odum-o1 | Task/task-00014 | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| price-b1 | Task/task-00020 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| price-d1 | Task/task-00022 | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| price-b2 | Task/task-00021 | B | no | 0/0 | 0 | 0 |  |  |
| webb-c1 | Task/task-00023 | C | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| webb-b2 | Task/task-00024 | B | no | 0/0 | 0 | 0 |  |  |

#### renal-dose-review

historical run: items from records (task_version 5f5d871cae2fbcfb648064ddd1c1466e1c31800ad170220c51ad562bf65c1c98, checkout d03ebb3d7fa61f5f79e7eb1aa9116b14baa8a6aa8b5bf4bb5f6396791e0cccfd)

4 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| outside_scr_umol | 1 (Frank Delgado) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| pgp_cyp3a4_inhibitor | 1 (Raymond Duquette) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| cg_crcl_weight_rule | 1 (Eugene Moravec) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (Marjorie Pellegrino) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| apixaban_two_of_three | 1 (Harold Vance) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| pellegrino-scr-new | Patient/pt-0043 | A | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| delgado-scr-amended | Patient/pt-0003 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| vance-itraconazole | Patient/pt-0002 | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| moravec-weight-reported | Patient/pt-0038 | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| moravec-scr-new | Patient/pt-0038 | A | no | 0/0 | 0 | 0 |  |  |
| vance-clarithromycin | Patient/pt-0002 | D | no | 0/0 | 0 | 0 |  |  |

#### results-inbox

historical run: items from records (task_version cf1347806b9a053cfe7d089b54587ea6ce36c28400bd9ceb0db1a9ee0b29e90d, checkout 352e5eecdb2a84bfd2d36b92351229eb72d1e7145ac52671317873ea8d074023)

4 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| nodule_screening | 1 (nodule_scheduled) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| hemolyzed | 1 (hemolyzed_note) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| corrected | 1 (corrected_down) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| entered_in_error | 1 (eie_baseline) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| preliminary | 1 (prelim_negative) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| aki | 1 (aki_48h) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| filler | 1 (normal_tsh) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| patel-ldct-addendum | nodule_scheduled | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| brennan-k-corrected | hemolyzed_note | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| whitfield-cr-new | eie_baseline | A | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| parisian-cxr-prelim | prelim_negative | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| parisian-cta-corrected | prelim_negative | B | no | 0/0 | 0 | 0 |  |  |
| ondricka-k-new | corrected_down | A | no | 0/0 | 0 | 0 |  |  |
| brennan-k-hemolyzed | hemolyzed_note | D | no | 0/0 | 0 | 0 |  |  |
| whitfield-cr-outside | eie_baseline | D | no | 0/0 | 0 | 0 |  |  |

### Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| contrast-ct-prep | 4 | 1 | 1 | 1.00 | 1.00 |
| crc-care-gap | 4 | 2 | 2 | 2.25 | 2.25 |
| discharge-medrec | 4 | 4 | 4 | 4.00 | 4.00 |
| message-queue | 4 | 4 | 4 | 4.00 | 4.00 |
| renal-dose-review | 4 | 4 | 4 | 4.00 | 4.00 |
| results-inbox | 4 | 4 | 4 | 4.00 | 4.00 |
