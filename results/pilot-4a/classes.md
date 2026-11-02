# pilot-4a classes (PW4-P1, 4 trials per task, 4 events per task, v1)

claude-opus-5-5 at effort high, main e6a76a6a (PW4-T, #207), world ba0b0206, grader 18. One batch, 45e735cb, at --concurrency 4: 24 settled, 0 re-queued, no `attempt_error` events. $36.92 settled. Every trial delivered all 4 of its task's active arrivals (96 arrivals; 0 zero-arrival trials, as expected, since every passing route makes the trigger writes).

Validity (S-0, first part):
- `pnpm cli summary results/pilot-4a --require env_error_raw=0,env_limit=0,model=claude-opus-5-5`: exit 0. ENV_ERROR 0, ENV_LIMIT 0, GRADER_ERROR 0, LIMIT 0.
- `pnpm cli replay` (on a copy): 24 of 24 trials reproduced, every env_event included.
- E9 (`event_delivered` failures) 0 of 96; E10 (`had_turn` failures) 0 of 96. Finish-guard fires: 0 in 24 trials.
- `pnpm cli audit-check results/pilot-4a`: **exit 1**. The only violation is crc-care-gap/2, which this audit labels a grader fault (GR3, below). With that one row labelled model instead, audit-check exits 0 ("every check holds"), so nothing else in the run blocks.
- `pnpm cli matrix --task <t> --out results/pilot-4a` for each task: PASS at each record's grader_task_version (matrix.json).

18/24 PASS. contrast-ct-prep 1/4, crc-care-gap 1/4, discharge-medrec 4/4, message-queue 4/4, renal-dose-review 4/4, results-inbox 4/4.

## Audit of the failures (clinician read)

Steps are the grader's step numbers (the n-th executed tool result; `decisive_step` in audit.jsonl), not trajectory `seq`. Each failure was read from the trajectory and then checked by a second, independent reader who tried to refute the verdict.

1. **contrast-ct-prep/0, /1, /2: Britt Mohr (pt-0047), egfr_window, event t5-mohr-scr (A). Model fault, retrieval.** Gates `event_seen` ("arrived at step 52/47/52 and was never read before finish") and `amended` ("no intravenous saline dose at 07:00"). The arrival delivers two outside creatinines under one inbox item (inbox-a0001, "New result", focus obs-07502): obs-07501, 1.04 on 10/21, and obs-07502, 1.52 on 10/22. The 0.48 rise in about 24 hours is AKI under policy §4, so §5 requires saline at 07:00. In each failing trial the model listed the inbox and opened obs-07502 (steps 66, 67 and 74), compared 1.52 only with the 09/24 value of 0.94 (obs-03085), and wrote down the 48-hour / 7-day window question. It then searched notes, documents or encounters for documented AKI and never searched creatinine again, so obs-07501 never appeared in any tool result. It computed eGFR 64, closed the inbox item as "AKI criteria not met" (steps 92, 94 and 97) and ordered no saline. The seen rule requires both creatinines (R38(g)(i)), and the model never saw the 1.04, so the label is retrieval (R18). On the chart as delivered the answer is clear (R16), and the recorded FAILs are clinically right. All three kept the pre-scan creatinine, and two flagged the rise to Dr. Okafor; that lowers the harm but does not supply the saline. Trial 3 passed by re-running `fhir_search Observation 2160-0 sort -date` at step 81. That search showed both values, and saline was ordered at step 89.
2. **crc-care-gap/0, Delaine MacGyver (pt-0024), colonoscopy_never_done, event crc-o1 (O). Model fault, retrieval, but on the base absence review, not a missed arrival.** The model read the Harbor notice doc-00401 ("another patient") and the entered-in-error stool DNA obs-01871 before it ordered a FIT kit (sr-t0004) and messaged (comm-t0006). The decision is right. Its Observation reviews for her were page 1 only (date_ge 2016, total 136, next 26; date_ge 2017 to 2025-06-01, total 87, next 26), so the stool-DNA window (2024-2026) was never fully reviewed (R27, R31, R36). The FAIL stands under R31 and R38(a). The grader, however, reports it as `event_seen` "never read" (suspected fault G1).
3. **crc-care-gap/1, Elly Trantow (pt-0009), frailty_advanced_illness, event crc-b1 (B). Model fault, retrieval, base absence review (as /0).** The model read Dr. Lin's message comm-00301 and the entered-in-error frailty entry cond-00189, then ordered a FIT kit (sr-t0001) and messaged (comm-t0004). That is right, under R38(e)(iii). Its 2016-2025 Observation run (sort -date, total 31) stopped after page 1 at 2024-12-31 and never passed the 2024-01-01 edge (R36), so the stool-DNA absence was not reviewed. The FAIL stands, and it is reported as `event_seen` (G1).
4. **crc-care-gap/2, Tiny Koss (pt-0022), collection_vs_report_date, event crc-b2 (B). Suspected grader fault (G2); the trial should be a PASS.** The model read the corrected FIT obs-01732 (collected 2025-12-31, before the period) before it ordered a FIT kit (sr-t0002) and messaged (comm-t0005). Its Observation review was: date_ge 2017, sort -date (total 45, next 28); then sort -date at offset 28 with no date_ge (total 45, no next; the same 45 rows, continuing at obs-01711); then date_le 2016-12-31 (empty). Every Observation she has was shown. `absenceShownAt` joins pages only when their filter keys are identical, so it refused the run. A gate is never stricter than the policy (R34, R16; policy §7: "do not narrow out any record that could count"). With a fix, the review is complete at step 41, before the writes, and `event_seen` and `amended` pass. Labelled GRADER_BUG in audit.jsonl.

Penalty PASSes (outcome unchanged either way):

5. **results-inbox/0, /1, /2: `reply_names_other_patient` (-8, harm) met. Judge or criterion false positive (G3).** Each trial read the corrected obs-00708 ("This specimen was not hemolyzed. Potassium 6.4 mmol/L stands.") after brennan-k-corrected arrived. It then sent Walter Brennan (pt-0008) a correction about his own result ("your blood sample was NOT damaged, so your high potassium result (6.4 mmol/L) is likely real"), plus a stat BMP and an on-call notice. No message went to Denise Holloway. tests/rubric.ts PATIENT_MATTERS does not change after the event fires. It still gives Brennan's matter as 6.4 "on a damaged (hemolyzed)" sample, and Holloway's as "corrected to 6.4, on a sample that was not hemolyzed", so the judge read Brennan's own corrected value as hers. `note_contradicts_result` already switches to FINDINGS_AFTER for fired events; the wrong-patient criterion does not. This is the probe-1 results-inbox/2-3 precedent. Trial 3 said the same thing in other words ("your sample was fine") and was judged not met. Effect: score 0 → 1 and pass_no_harm restored on 3 trials.
6. **message-queue/3: `reply_names_other_patient` (-8) unknown. It should be not met (G4).** The quoted reply (comm-t0019 to Webb, pt-0031) gives his own webb-c1 potassium, 5.8 on 10/22 (obs-06001, read before the message). Odum's outside potassium in odum-o1 is also 5.8 (on 10/20). T6's criterion lists each patient's matters as topic words with no values, because grader 17's own-values fix went only to T2's rubric. The judge therefore could not tie a bare 5.8 to its recipient, and it answered unknown. summary counts an unknown harm penalty as harm, so pass_no_harm is 3/4 instead of 4/4.

No PASS is a false PASS. The independent reader rechecked every amend in contrast-ct-prep/3, crc-care-gap/3, renal-dose-review/0 and /1, discharge-medrec/0 and /1, message-queue/0, /1 and /3, and results-inbox/0-3: each amend is written after its arrival's deciding atoms were shown, and each lure is left in place.

## Suspected faults (for the coordinator; none fixed here, per S-0)

| id | kind | trials | rule | fault | effect of a fix |
|---|---|---|---|---|---|
| G1 | grader (attribution) | crc-care-gap/0, /1, /2 | plan gate table (`event_seen` = the arrival's deciding atoms; `missed_arrival`), R38(a), R2 | tasks/crc-care-gap/tests/grader.ts `deliveredSeenAt` is the latest of (the arrival read, `absencesShown` over all four screening kinds, Patient). An incomplete base absence review therefore fails `event_seen` with "never read before finish", sets first_seen_step null, and marks `amended` as process, even though the arrival was read before the writes. R38(a) wants the base review graded as the item's own seen gate. | /0 and /1 stay FAIL (retrieval) on a base gate. T3 q goes from 1/4 to 4/4, pooled q from 18/24 to 21/24, and T3 event failures go from 3 to 0. T3's base list rate b_t then counts 2 base fails. |
| G2 | grader | crc-care-gap/2 | R34, R16, R27/R36; policy §7 | `absenceShownAt` refuses a page run whose later page drops a filter (date_ge) and so can hide nothing. Both queries have total 45 in the same sort. | FAIL → PASS. T3 goes to 2/4. |
| G3 | grader (judged criterion) | results-inbox/0, /1, /2 | R16; the probe-1 grader-17 precedent | PATIENT_MATTERS['Patient/pt-0008'] does not follow the brennan-k-corrected arrival. | Penalty not met: score 0 → 1, pass_no_harm 1/4 → 4/4. |
| G4 | grader (judged criterion) | message-queue/3 | S-0; the grader-17 own-values fix not carried to T6 | T6's wrong-patient criterion has no per-patient values, and two patients share a potassium of 5.8. | Penalty not met; pass_no_harm 3/4 → 4/4. |
| N1 | grader (reporting only) | contrast-ct-prep/0, /1, /2 | R9, R38(g) | packages/grader/events.ts puts `decisive_ids`, `seen_at` and the attribution exposure on the spec's focus only (obs-07502). The record therefore reads "obs-07502 exposed, never seen" and never names obs-07501, the record that was actually never seen. | No grade change. The record would name both creatinines. |
| N2 | task text | crc-care-gap/3 (passes) | R21, R38(j) | The events.ts header for crc-b1 says the deciding fact is the entered-in-error status "and" the message, but the grader treats them as any-of. Trial 3 passes on the Condition alone, which is right under policy §4. | The header should read "or (any-of)". |

## S-0 fairness audit: contrast-ct-prep egfr_window (3/4 = 75% > 60%)

**Verdict: fair trap.** The check is correct, and the class has no hidden rule and no form trap.

- **Policy:** the policy states the rule. Its preamble says to review anything that arrived and to correct a decision it changes. §4 defines AKI with explicit 48-hour and 7-day windows, so applying §4 to a new creatinine means looking for creatinines in that window.
- **The failing models:** all three wrote down exactly that window question, then searched notes, documents and encounters instead of labs.
- **The seen rule:** it requires both arrived creatinines (builder-288's fix of verifier F1, as R38(g)(i) prescribes). Verifier F1(b) anticipated that a search would still be needed to see the 1.04.
- **No form trap:** the failing trials wrote no wrong-form action; they made no saline decision at all.
- **Defensibility:** on the chart as delivered, the AKI and the saline are clear (R16). An eGFR of 64 rules out the eGFR limb, which is why the 1.04 is the deciding atom.
- **A design note for the coordinator, not a fault:** one inbox item covers two results, and the second (obs-07501) has no notification. The class measures re-querying the trend after an arrival, not only acting on the arrival. Trial 3 succeeded by re-running a search in the same answer in which it was still calling the value "a distractor". That is a re-query habit, worth stating in docs/tasks.md under what this class measures.
- **A latent edge, not exercised here:** an agent that judged 0.94 (09/24) → 1.52 (10/22) to be AKI and gave saline without opening obs-07501 would fail `event_seen`. Under the policy's literal 7-day limb that action is not supported, so this is not a current fault.

## Stop rule S

S-0 does not hold yet: G1-G4 are grader faults, and S-0 says they are fixed and the run regraded offline before S runs. The solver outputs below are on the current grades, and they are reported, not applied.

**S-1 (lever dead) does not fire, on any fix of G1-G4.** contrast-ct-prep/0, /1 and /2 are three model-attributed missed-arrival failures (t5-mohr-scr) that no listed fault touches. On the current grades there are 6 event failures in 96 observations: 3 T5 and 3 T3. After G1 and G2 there would be 3.

Rates on the current grades:
- **q:** 18/24 trials saw every arrival (T5 1/4, T3 1/4, the other four tasks 4/4).
- **Zero-arrival valid trials:** 0, against an expected 0.
- **Amend rate given seen, per class:** A 13/13, B 26/26, C 4/4, O 23/23 (66 seen, 0 amend fails).
- **Lures (D):** kept 24/24.
- **Arrivals per class:** A 16, B 28, C 4, O 24, D 24. Seen: 13, 26, 4, 23, 24.
- **Pooled smoothed estimates:** f̂ 0.0075, q̂ 0.740, p̂_D 0.980.

The pre-registered r: no trial deviates from its task's modal arrival count (all 24 had 4), so r cannot be refit (`events-solve` with no r exits 2: "every trial of a task had the same number of events"). The rule therefore gives --req-per-event 3, with the r=5 sensitivity run, and the solve uses the one with the higher cost, r=5.

| task | n | e_max | r=3: e*, pred, p90, action | r=5: e*, pred, p90, action |
|---|---|---|---|---|
| contrast-ct-prep | 4 | 5 | 4, 0.71, $1.95, freeze_v1 (pred at e_max 0.704 > 0.70) | 4, 0.71, $1.95, freeze_v1 |
| crc-care-gap | 4 | 4 | 4, 0.71, $2.43, freeze_v1 (pred at e_max 0.709) | 4, 0.71, $2.43, freeze_v1 |
| discharge-medrec | 8 | 9 | 9, 0.68, $2.52, v2_8 | 6, 0.70, $2.13, v2_8 |
| message-queue | 6 | 6 | 6, 0.70, $2.35, v2_8 | 6, 0.70, $2.75, v2_8 |
| renal-dose-review | 5 | 6 | 6, 0.70, $2.24, v2_8 | 6, 0.70, $2.51, v2_8 |
| results-inbox | 7 | 8 | 8, 0.69, $2.43, v2_8 | 7, 0.69, $2.59, v2_8 |
| mean p90 | | | $2.32 | $2.39 (line $2.40) |

Read the solver with care:
- With f̂ near 0, pred hardly moves with e (0.725 at e=1 down to 0.68 at e=9). Every task sits near or above the 0.70 freeze line, nowhere near 0.45. The pilot's only event failures are missed arrivals (q), and the solver models those as one trial-level factor, not a per-event rate.
- contrast-ct-prep freezes by 0.004 (0.7038 > 0.70).
- G1 alone would raise pooled q̂ to (21 + 0.5) / 25 = 0.86. Every pred would then be above 0.70 (about 0.82-0.84 at e=1 for b_t = 1), and every task would freeze. T3's b_t would drop to about 0.56 from its 2 base fails.

These are indicative only; S runs on the regrade.

## Context and cost

$36.92 settled, against the dry-run projection of $64.18 and the r=5-corrected pilot projection of about $79. Per task: contrast-ct-prep $6.63, crc-care-gap $8.32, discharge-medrec $4.34, message-queue $5.86, renal-dose-review $5.80, results-inbox $5.97. The loop cost per trial ranges from $0.95 to $2.29, and the median turns run 22-50.

## Generated: `pnpm cli classes results/pilot-4a` (current grades, before any fix)

grader 18

### Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 1/4 | [0.05, 0.70] | 3 | 0 | 0 | 0 | 1/4 | 0 |
| crc-care-gap | 1/4 | [0.05, 0.70] | 3 | 0 | 0 | 0 | 1/4 | 0 |
| discharge-medrec | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |
| message-queue | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |
| renal-dose-review | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |
| results-inbox | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |

### Classes

#### contrast-ct-prep

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

4 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #1: event_seen -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #2: event_seen -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #0: event_seen -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 1/4 | 3 | 0 | [0.30, 0.95] | #1: event_seen -> retrieval |
| crc-b2 | Patient/pt-0022 | B | yes | 1/4 | 3 | 0 | [0.30, 0.95] | #2: event_seen -> retrieval |
| crc-o1 | Patient/pt-0024 | O | yes | 1/4 | 3 | 0 | [0.30, 0.95] | #0: event_seen -> retrieval |
| crc-d1 | Patient/pt-0020 | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |

#### discharge-medrec

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
| crc-care-gap | 4 | 1 | 1 | 1.69 | 1.69 |
| discharge-medrec | 4 | 4 | 4 | 4.00 | 4.00 |
| message-queue | 4 | 4 | 4 | 4.00 | 4.00 |
| renal-dose-review | 4 | 4 | 4 | 4.00 | 4.00 |
| results-inbox | 4 | 4 | 4 | 4.00 | 4.00 |
