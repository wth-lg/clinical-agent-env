# final-1 classes (P22, crc-care-gap and contrast-ct-prep, 20 trials each at the freeze-t3t5 versions)

claude-opus-5-5 at effort high, worktree at tag freeze-t3t5 (1b120e8b, env_dirty false), world ba0b0206. Recorded at grader 21; **every trial is read at its grader 22 regrade** (#216, tag regrade-r41, ruling R41: the G6/G7 fix). One batch, fb524a47, at --concurrency 4: 40 settled, 0 re-queued, 0 ENV_ERROR, 0 ENV_LIMIT, 0 GRADER_ERROR, 0 INTERNAL tool errors. $76.33 settled (trial calls $74.56, judge $1.77) against a projection of $106.41 and the $140 cap. Every trial delivered all 4 arrivals of its task (160 arrivals, 0 zero-arrival trials). Every record is at its task's results/tasks-final.json versions as recorded, and its one regrades[] entry at the freeze's grader-22 entry.

**Regraded at grader 22** (`pnpm cli regrade results/runs/final-1 --grader-version 22` on the merged checkout 9e72939a, world state hash ba0b0206 unchanged, exit 0: "40 regraded, 0 already at this version; outcome changed: crc-care-gap/0, /1, /2, /5, /6, /7, /8, /12, /14, /17, /18, /19 FAIL -> PASS", the 12 G6/G7 trials exactly; trials 3 and 4 still FAIL, /4's failed items narrowed to MacGyver alone; contrast-ct-prep 0 of 20 changed). No judge cache miss, no live call, no rerun (S-5).

| task | recorded (grader 21) | current (grader 22) | Wilson 95% | band |
|---|---|---|---|---|
| contrast-ct-prep | 5/20 | **5/20** | [0.11, 0.47] | In band |
| crc-care-gap | 6/20 | **18/20** | [0.70, 0.97] | **Above band** (recorded as such; the task is not changed) |

Validity at grader 22:
- `pnpm cli replay results/runs/final-1`: exit 0, 40 of 40 reproduced against the current grade, 0 live calls.
- `pnpm cli summary results/runs/final-1 --write --tasks crc-care-gap,contrast-ct-prep --require valid=20,env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all`: **exit 0**, "regraded 20 (recorded 6/20)" for crc-care-gap. The same with `band=0.2-0.7`: exit 1, "crc-care-gap: 18/20 passes, outside the band 0.2-0.7". GRADER_ERROR 0 (history 0).
- `pnpm cli matrix --task <id> --out results/runs/final-1`: exit 0 for both at grader 22 (crc-care-gap f9df3580: oracle 1.000, 20 alternatives including the four final-1 review shapes, 33 mutants including the /3 and /4 shapes, 0 judge misses; contrast-ct-prep c964545f: oracle 1.000, 25 alternatives, 38 mutants). matrix.json also carries the grader-21 entries (385c668d, d4a70655) the records were graded at.
- `pnpm cli audit-check results/runs/final-1`: **exit 0**, "17/17 failures labelled, environment 0, grader 0; every check holds". At grader 21 it exited 1 on the 12 rows labelled GRADER_BUG (G6, G7), which now read PASS with their grader-21 read kept in the note. contrast-ct-prep keeps its task-validity review (fair-trap); crc-care-gap is no longer consistency-flagged and its review records the R41 history.
- `pnpm donewhen`: clause (5) reads frozen 2/6 and fails on crc-care-gap 18/20 above the band (the other four tasks not frozen); clause (6) passes its audit part.

## Audit of the failures (clinician read at grader 21, kept as written; the 12 G6/G7 trials are PASS at grader 22)

Steps are the grader's step numbers (the n-th executed tool result; `decisive_step` in audit.jsonl), not trajectory `seq`. builder-303 read every trajectory alone, without agents, from three extracts checked against the records: every Observation search per trial with its filters, total, rows, date span and next offset (evidence/builder-303/crc-obs-searches.txt), a record-level sweep of fixtures/world.ndjson.gz for every unreviewed member (crc-world-check.txt: the patient's resulted laboratory Observations dated 2024-01-01 or later, and which a tool result exposed before the FIT order), and the contrast-ct-prep route per trial (t5-summary.txt). The passes were checked by a timeline of every arrival, the first read of each arrived record after its arrival, and the first order on its patient (crc-pass-timeline.txt, t5-pass-timeline.txt).

### contrast-ct-prep: 15 failures, all the model's

1. **contrast-ct-prep/0, /1, /2, /3, /4, /5, /6, /8, /9, /10, /12, /13, /15, /18, /19: Britt Mohr (pt-0047), egfr_window, event t5-mohr-scr (A). Model fault, retrieval.**
   - **Gates:** `event_seen` ("arrived at step N and was never read before finish"; the item names both creatinines, obs-07502 seen, obs-07501 never exposed) and `amended` ("no intravenous saline dose at 07:00, 1 hour before the scan").
   - **The arrival:** two outside creatinines under one inbox item (focus obs-07502): obs-07501, 1.04 on 10/21, and obs-07502, 1.52 on 10/22. The 0.48 rise in about 24 hours is AKI under policy §4, so §5 requires saline at 07:00.
   - **What the model did:** in every failing trial it placed the CT order (the trigger), later listed the inbox and opened obs-07502 (steps 63 to 80), compared 1.52 only with the 09/24 value of 0.94, made no pt-0047 Observation search after the arrival, closed the item as "not AKI by the policy definition" (steps 89 to 102), kept the pre-scan creatinine order and in 14 of 15 left a PCP follow-up task. No saline. In trial 12 the Ferreira correction arrived first and took inbox-a0001, so Mohr's item is inbox-a0002 there; the route is the same.
   - **Verdict:** retrieval (R18, R38(g)(i)). The S-0 fairness audit of pilot-4a (3 of 4) holds on these 15: the policy states the windows, the deciding atoms are the two arrived values, no wrong-form action was written, and on the chart as delivered the answer is clear (R16). The recorded FAILs are clinically right.
   - **The 5 passes (/7, /11, /14, /16, /17):** each re-ran a pt-0047 Observation search after reading obs-07502 (code 2160-0 or a date window), which showed obs-07501 beside it, called the rise AKI and ordered saline for 07:00 on 10/26 (steps 81 to 96), then closed the item.

### crc-care-gap: 14 failures at grader 21, 2 the model's and 12 a check defect (R41; PASS at grader 22)

All 14 fail `fit_orders` and `gap_seen_before_order` on one sentence: "ordered ... without the trial ever making a complete search showing the patient's Observation from 2024-01-01 records absent", the sDNA absence of expected.ts SDNA_IN_WINDOW (R27, R31). No failure is an event failure: all four arrivals were read in every trial (q 20/20), every amend followed its arrival, and the lure crc-d1 (hospice discharge, pt-0020) was left in place 20/20. The FIT orders are the expected decisions in every trial; what differs is how each member's Observations were reviewed.

2. **crc-care-gap/3: Elly Trantow (pt-0009), frailty_advanced_illness, crc-b1 (B). Model fault, retrieval.**
   - Step 20 `date_ge 2026-01-01` stopped at page 1 (26 of 45, next 26 never fetched); steps 64 and 66 `laboratory date_ge 2017-01-01 sort -date` showed 49 of 55 down to 2024-12-31 (next 49 never fetched); step 65 `laboratory 2017-01-01 to 2025-12-31 sort -date` showed 28 of 31 down to 2024-12-31 (next 28 never fetched). No run passed the 2024-01-01 edge (R36) and none ran to its end (R27). World: three laboratory records dated 2024-12-31 (obs-00719, obs-00720, obs-00721) were never shown. FIT kit sr-t0001 at step 70.
3. **crc-care-gap/4: Tiny Koss (pt-0022), collection_vs_report_date, crc-b2 (B), and Delaine MacGyver (pt-0024), colonoscopy_never_done, crc-o1 (O). Model fault, retrieval.** (pt-0009 in the same trial would be G6.)
   - pt-0022: step 37 `laboratory sort -date` (total 29) and step 43 `date_ge 2017-01-01 sort -date` (total 45) each stopped at page 1 with the earliest row 2024-04-14, after the window opens, next page never fetched (R36); the code search at step 40 listed 77353-1 but not 77354-9 (R27). By luck every laboratory record since 2024 was on page 1 (the 4 unseen rows are from 2021), which the model could not know.
   - pt-0024: step 55 `date_ge 2017-01-01 sort -date` page 1 (26 of 136, down to 2025-06-02, next never fetched); step 56 `2024-01-01 to 2025-06-01` (whole, 2) and step 58 `2025-06-03 to 2026-12-31` (whole, 17) leave out 2025-06-02, and 16 laboratory records dated 2025-06-02 (obs-01882 to obs-01897) were never shown. Orders at steps 77 to 79.
4. **crc-care-gap/0, /1, /2, /5, /12, /14, /17, /18, /19: grader fault G6 (9 trials). Ruled a check defect (R41), fixed in #216 (grader 22), regraded PASS.**
   - **What the model did:** it reviewed the member's Observations in two complete searches whose date ranges are adjacent (or overlap) and together cover 2024-01-01 to today, each with filters that hide no counted record (category laboratory or none; no code or status filter), then ordered the FIT kit. Per trial (member; the two partitions; order step):
     - /0 pt-0009: steps 19 and 73, `laboratory date_ge 2026-01-01` (35, two pages to no next); step 72, `laboratory 2017-01-01 to 2025-12-31` (20, whole); order 75. /0 pt-0022: step 37, `date_ge 2026-01-01` (18, whole; the crc-b2 trigger page, which replaces obs-01732 in place); step 58, `laboratory 2024-01-01 to 2025-12-31` (16, whole); order 61.
     - /1 pt-0009: steps 20 and 68, `laboratory date_ge 2025-01-01` (44, two pages); step 69, `2016-01-01 to 2024-12-31 sort -date` (11, whole); order 77.
     - /2 pt-0022: step 35, `date_ge 2026-01-01` (18, whole); steps 36 and 38, `date_le 2025-12-31 sort -date` (28, two pages to no next); order 67.
     - /5 pt-0024: step 50, `date_ge 2025-06-03` (17, whole); steps 52, 53, 55, 56, `date_le 2025-06-02T23:59:59-04:00 sort -date` (119) at offsets 0, 25, 51, 77, the fourth page reaching 2023-06-13, before the window opens (R36); the bound is 03:59:59Z on 06-03, so the partitions overlap; crc-o1 on step 53 corrected obs-01871 in place, an id that page exposed, so the join holds; order 60.
     - /12 pt-0009: steps 19 and 21, `date_ge 2026-01-01` (45, two pages); steps 75 and 77, `2017-01-01 to 2025-12-31 sort -date` (31, two pages); order 78.
     - /14 pt-0022: step 35, `date_ge 2026-01-01` (18, whole); step 67, `laboratory 2017-01-01 to 2025-12-31` (20, whole); order 75.
     - /17 pt-0022: step 39, `date_ge 2026-01-01` (18, whole); step 62, `laboratory 2017-01-01 to 2025-12-31T23:59:59-05:00` (20, whole; the bound is 04:59:59Z on 2026-01-01, so the partitions overlap); order 66.
     - /18 pt-0022: step 38, `date_ge 2026-01-01` (18, whole); step 70, `laboratory 2024-01-01 to 2025-12-31` (16, whole); order 74.
     - /19 pt-0022: step 38, `date_ge 2026-01-01` (18, whole); step 60, `laboratory 2017-01-01 to 2025-12-31` (20, whole); order 64.
   - **Why the grader refused it:** packages/grader/exposure.ts `runCompleteAt` accepts one run of pages (R27), a sorted run that passes the window's edge (R36) or a stopped sorted run finished by a narrower query bounded at its last row shown (G5). It does not join two complete runs that partition the window, and tests/grader.ts `filtersCover` refuses each partition on its own: a `date_le` before today fails `endCovers`, a `date_ge` after 2024-01-01 fails `startCovers`.
   - **Why it looks like a check defect:** every record was shown, the principle the coordinator applied in G5 (R34, R16: a gate is never stricter than the policy). Checked against fixtures/world.ndjson.gz: in all nine trials every resulted laboratory Observation of the member dated 2024-01-01 or later was exposed before the order (crc-world-check.txt: 55 of 55 for pt-0009, 25 of 25 for pt-0022, 34 of 34 for pt-0024). Each partition is complete in R27's own sense (a whole page, a run to no next, or a sorted run past the edge), and a clinician reading "2026 onward, whole" and "2017 to 2025, whole" has reviewed 2024 onward.
5. **crc-care-gap/6, /7, /8: grader fault G7 (3 trials), a weaker form of G6: every record was shown, proven by the page totals or by the tool's documented default order (packages/env/tools/read/fhir.ts: "ordered by date (sort=date, the default, or -date)"), not by a structure the grader-21 rule accepted. Ruled with G6 (R41), fixed in #216, regraded PASS.**
   - /6 pt-0009: steps 69 and 70, `2024-01-01 to 2026-01-05` (31, two pages, complete); step 68, `date_ge 2026-01-07` (22, whole); the day between, 2026-01-06, is on step 19's page (`date_ge 2026-01-01`, 45, page 1 of 26 rows, oldest first, running from 2026-01-06 into 2026-01-07), and 23 + 22 = 45. Order 73.
   - /7 pt-0009: steps 64 and 65, `date_ge 2024-01-01` (76, oldest first) showed 54 rows up to 2026-01-06, next 54 not fetched; step 66, `date_ge 2026-01-07` (22, whole); 54 + 22 = 76. G5's rule refuses it because the run is not explicitly sorted and the bound is a day past the last row. (pt-0022 in /7 is G6: step 37, 18 whole; step 61, `2024-01-01 to 2025-12-31`, 24 whole.) Orders 70, 71.
   - /8 pt-0009: step 19, `laboratory date_ge 2016-01-01 sort -date` (55): the 24 newest laboratory records; steps 67 and 69, the same query with no category (76) at offsets 24 and 52 to no next, its first page never fetched. Every laboratory record among the 24 newest of all 76 is among the 24 newest laboratory records, so every laboratory record was shown; two non-laboratory records of 2026-10-09 were not. The weakest row: the argument needs the interleaving of the two orders. Order 70.
   - World: 55 of 55 laboratory records since 2024 exposed before the order in all three.

**No PASS is a false PASS.** For the 6 crc-care-gap passes, every arrived record was read after its arrival and before the first order on its patient (cond-00189 and comm-00301 before the pt-0009 order; the corrected obs-01732 before the pt-0022 order; obs-01871 or doc-00401 before the pt-0024 order, any-of under R21 and R38(j)); the lure doc-00402 was read and pt-0020 got no order or message; each sDNA absence was shown by one run the grader accepts. For the 5 contrast-ct-prep passes, obs-07501 was shown by a second pt-0047 search before the 07:00 saline order; Ferreira's corrected obs-01322 was read after its arrival and before his saline; Schuster's doc-02501 before her premedication; Beahan's doc-02502 was read and her non-contrast CT got no contrast prep. The audit rows' evidence ids are checked by script against the trajectories (write-audit.py refuses an id the trajectory did not expose, reference or write).

## Faults found by this read (S-0), and their status

| id | kind | trials | rule | fault | status |
|---|---|---|---|---|---|
| G6 | grader | crc-care-gap/0, /1, /2, /5, /12, /14, /17, /18, /19 | R34, R16, R27/R36; the G2 and G5 precedents; ruled R41 | `runCompleteAt` and `filtersCover` did not join two complete searches that partition the window (adjacent `date_le` and `date_ge`, filters that hide nothing), although every record was shown | fixed in #216 (grader 22: exposure.ts windowTargets/windowExposed); regraded FAIL -> PASS here |
| G7 | grader | crc-care-gap/6, /7, /8 | as G6; ruled R41 | every record shown, proven by page totals (54 + 22 = 76) or by the documented oldest-first default order, not by an accepted structure | fixed in #216; regraded FAIL -> PASS here |

Neither was a reason to rerun (S-0, S-5). The 2 model failures (/3, /4) and the 15 contrast-ct-prep failures stand at grader 22.

## Context and cost

$76.33 settled: crc-care-gap trial calls $42.46 (judge $1.37), contrast-ct-prep $32.10 (judge $0.40). Per-trial cost: crc-care-gap $1.86 to $2.34, contrast-ct-prep $1.42 to $1.96; the pilots' p90 lines ($2.70, $1.89) hold. Turns 26 to 32 per trial; 0 LIMIT, 0 api retries.

## Generated: `pnpm cli classes results/runs/final-1` (grader 22)

grader 22

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 5/20 | [0.11, 0.47] | 15 | 0 | 0 | 0 | 5/20 | 0 |
| crc-care-gap | 18/20 | [0.70, 0.97] | 2 | 0 | 0 | 0 | 20/20 | 0 |

## Classes

### contrast-ct-prep

historical run: items from records (task_version 57088c0713e9e6004a70bb0e442e4fb74225ae6a8243bd7cdf7b0b26a2b77bdc, checkout 0135336ab2fb98106279818ee0cec718ca0bb1b5819a6b605a5b65d2cf6007c7)

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

historical run: items from records (task_version adb184d4b232bc2f4bd951af09c3300f1b8e499aef7667dee3cfc2f7fcd55535, checkout edae9b9f4eefface2b44d8029cd1b582b2e875f11197181e83eec73c2a391993)

20 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 FAIL, 4 FAIL, 5 PASS, 6 PASS, 7 PASS, 8 PASS, 9 PASS, 10 PASS, 11 PASS, 12 PASS, 13 PASS, 14 PASS, 15 PASS, 16 PASS, 17 PASS, 18 PASS, 19 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| unclassified | 1 (Patient/pt-0009) | 1/20 | 2/80 | 0.97 | [0.91, 0.99] | #3: fit_orders -> retrieval |
|  | 2 (Patient/pt-0020) | 0/20 |  |  |  |  |
|  | 3 (Patient/pt-0022) | 0/20 |  |  |  |  |
|  | 4 (Patient/pt-0024) | 1/20 |  |  |  | #4: fit_orders -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |
| crc-d1 | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |
| crc-b2 | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |
| crc-o1 | (not in the checkout) |  | no | 0/20 | 0 | 0 | [0.84, 1.00] |  |

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| contrast-ct-prep | 20 | 5 | 5 | 5.00 | 16.25 |
| crc-care-gap | 20 | 18 | 18 | 18.05 | 19.50 |
