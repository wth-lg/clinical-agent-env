# final-1 classes (P22, crc-care-gap and contrast-ct-prep, 20 trials each at the freeze-t3t5 versions)

claude-opus-5-5 at effort high, worktree at tag freeze-t3t5 (1b120e8b, env_dirty false), world ba0b0206, grader 21. One batch, fb524a47, at --concurrency 4: 40 settled, 0 re-queued, 0 ENV_ERROR, 0 ENV_LIMIT, 0 GRADER_ERROR, 0 INTERNAL tool errors. $76.33 settled (trial calls $74.56, judge $1.77) against a projection of $106.41 and the $140 cap. Every trial delivered all 4 arrivals of its task (160 arrivals, 0 zero-arrival trials). Every record is at its task's results/tasks-final.json versions.

Validity:
- `pnpm cli replay results/runs/final-1`: exit 0, 40 of 40 reproduced, 0 live calls (the canonical ledger's last row is the batch close).
- `pnpm cli summary results/runs/final-1 --write --tasks crc-care-gap,contrast-ct-prep --require valid=20,band=0.2-0.7,env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all`: **exit 0**. contrast-ct-prep 5/20, Wilson 95% [0.11, 0.47]; crc-care-gap 6/20, [0.15, 0.52]; both in band as recorded. GRADER_ERROR 0 (history 0). Both tasks are consistency-flagged (every failure fails the same check first), so audit.jsonl carries a task-validity review for each.
- `pnpm cli matrix --task <id> --out results/runs/final-1`: exit 0 for both. crc-care-gap at 385c668d: oracle 1.000, 16 alternatives pass, 31 mutants fail as declared, null fails, 0 judge misses. contrast-ct-prep at d4a70655: oracle 1.000, 25 alternatives, 38 mutants, null fails, 0 judge misses. Both oracle final hashes match results/tasks-final.json.
- `pnpm cli audit-check results/runs/final-1`: **exit 1**, "29/29 failures labelled, environment 0, grader 12; 36 violations", all of them the 12 crc-care-gap rows labelled GRADER_BUG (GR3: a grader-labelled failure blocks a committed run until a fix and a regrade). With those 12 rows labelled model instead, the same audit exits 0, "every check holds" (evidence/builder-303/12-audit-check-variant-g6g7-as-model.txt). `--final` also exits 1: no failure has an LLM auditor verdict yet.
- `pnpm donewhen`: clause (5) reads frozen 2/6 (contrast-ct-prep 5/20, crc-care-gap 6/20 at their frozen versions; the other four not frozen); clause (6) fails on the 12 grader labels.

**As recorded: contrast-ct-prep 5/20, crc-care-gap 6/20.** If the coordinator rules G6 a check defect and it is fixed and regraded offline, crc-care-gap reads 15/20 (above the band); with G7 too, 18/20. S-5 forbids a second final run either way; the card reports what happens.

## Audit of the failures (clinician read, grader 21)

Steps are the grader's step numbers (the n-th executed tool result; `decisive_step` in audit.jsonl), not trajectory `seq`. builder-303 read every trajectory alone, without agents, from three extracts checked against the records: every Observation search per trial with its filters, total, rows, date span and next offset (evidence/builder-303/crc-obs-searches.txt), a record-level sweep of fixtures/world.ndjson.gz for every unreviewed member (crc-world-check.txt: the patient's resulted laboratory Observations dated 2024-01-01 or later, and which a tool result exposed before the FIT order), and the contrast-ct-prep route per trial (t5-summary.txt). The passes were checked by a timeline of every arrival, the first read of each arrived record after its arrival, and the first order on its patient (crc-pass-timeline.txt, t5-pass-timeline.txt).

### contrast-ct-prep: 15 failures, all the model's

1. **contrast-ct-prep/0, /1, /2, /3, /4, /5, /6, /8, /9, /10, /12, /13, /15, /18, /19: Britt Mohr (pt-0047), egfr_window, event t5-mohr-scr (A). Model fault, retrieval.**
   - **Gates:** `event_seen` ("arrived at step N and was never read before finish"; the item names both creatinines, obs-07502 seen, obs-07501 never exposed) and `amended` ("no intravenous saline dose at 07:00, 1 hour before the scan").
   - **The arrival:** two outside creatinines under one inbox item (focus obs-07502): obs-07501, 1.04 on 10/21, and obs-07502, 1.52 on 10/22. The 0.48 rise in about 24 hours is AKI under policy §4, so §5 requires saline at 07:00.
   - **What the model did:** in every failing trial it placed the CT order (the trigger), later listed the inbox and opened obs-07502 (steps 63 to 80), compared 1.52 only with the 09/24 value of 0.94, made no pt-0047 Observation search after the arrival, closed the item as "not AKI by the policy definition" (steps 89 to 102), kept the pre-scan creatinine order and in 14 of 15 left a PCP follow-up task. No saline. In trial 12 the Ferreira correction arrived first and took inbox-a0001, so Mohr's item is inbox-a0002 there; the route is the same.
   - **Verdict:** retrieval (R18, R38(g)(i)). The S-0 fairness audit of pilot-4a (3 of 4) holds on these 15: the policy states the windows, the deciding atoms are the two arrived values, no wrong-form action was written, and on the chart as delivered the answer is clear (R16). The recorded FAILs are clinically right.
   - **The 5 passes (/7, /11, /14, /16, /17):** each re-ran a pt-0047 Observation search after reading obs-07502 (code 2160-0 or a date window), which showed obs-07501 beside it, called the rise AKI and ordered saline for 07:00 on 10/26 (steps 81 to 96), then closed the item.

### crc-care-gap: 14 failures, 2 the model's and 12 a suspected check defect

All 14 fail `fit_orders` and `gap_seen_before_order` on one sentence: "ordered ... without the trial ever making a complete search showing the patient's Observation from 2024-01-01 records absent", the sDNA absence of expected.ts SDNA_IN_WINDOW (R27, R31). No failure is an event failure: all four arrivals were read in every trial (q 20/20), every amend followed its arrival, and the lure crc-d1 (hospice discharge, pt-0020) was left in place 20/20. The FIT orders are the expected decisions in every trial; what differs is how each member's Observations were reviewed.

2. **crc-care-gap/3: Elly Trantow (pt-0009), frailty_advanced_illness, crc-b1 (B). Model fault, retrieval.**
   - Step 20 `date_ge 2026-01-01` stopped at page 1 (26 of 45, next 26 never fetched); steps 64 and 66 `laboratory date_ge 2017-01-01 sort -date` showed 49 of 55 down to 2024-12-31 (next 49 never fetched); step 65 `laboratory 2017-01-01 to 2025-12-31 sort -date` showed 28 of 31 down to 2024-12-31 (next 28 never fetched). No run passed the 2024-01-01 edge (R36) and none ran to its end (R27). World: three laboratory records dated 2024-12-31 (obs-00719, obs-00720, obs-00721) were never shown. FIT kit sr-t0001 at step 70.
3. **crc-care-gap/4: Tiny Koss (pt-0022), collection_vs_report_date, crc-b2 (B), and Delaine MacGyver (pt-0024), colonoscopy_never_done, crc-o1 (O). Model fault, retrieval.** (pt-0009 in the same trial would be G6.)
   - pt-0022: step 37 `laboratory sort -date` (total 29) and step 43 `date_ge 2017-01-01 sort -date` (total 45) each stopped at page 1 with the earliest row 2024-04-14, after the window opens, next page never fetched (R36); the code search at step 40 listed 77353-1 but not 77354-9 (R27). By luck every laboratory record since 2024 was on page 1 (the 4 unseen rows are from 2021), which the model could not know.
   - pt-0024: step 55 `date_ge 2017-01-01 sort -date` page 1 (26 of 136, down to 2025-06-02, next never fetched); step 56 `2024-01-01 to 2025-06-01` (whole, 2) and step 58 `2025-06-03 to 2026-12-31` (whole, 17) leave out 2025-06-02, and 16 laboratory records dated 2025-06-02 (obs-01882 to obs-01897) were never shown. Orders at steps 77 to 79.
4. **crc-care-gap/0, /1, /2, /5, /12, /14, /17, /18, /19: suspected grader fault G6 (9 trials). Labelled GRADER_BUG in audit.jsonl; reported for the coordinator's ruling, not fixed (S-0).**
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
5. **crc-care-gap/6, /7, /8: suspected grader fault G7 (3 trials), a weaker form of G6: every record was shown, proven by the page totals or by the tool's documented default order (packages/env/tools/read/fhir.ts: "ordered by date (sort=date, the default, or -date)"), not by a structure the grader accepts. Labelled GRADER_BUG; the coordinator rules whether this counts as a complete review.**
   - /6 pt-0009: steps 69 and 70, `2024-01-01 to 2026-01-05` (31, two pages, complete); step 68, `date_ge 2026-01-07` (22, whole); the day between, 2026-01-06, is on step 19's page (`date_ge 2026-01-01`, 45, page 1 of 26 rows, oldest first, running from 2026-01-06 into 2026-01-07), and 23 + 22 = 45. Order 73.
   - /7 pt-0009: steps 64 and 65, `date_ge 2024-01-01` (76, oldest first) showed 54 rows up to 2026-01-06, next 54 not fetched; step 66, `date_ge 2026-01-07` (22, whole); 54 + 22 = 76. G5's rule refuses it because the run is not explicitly sorted and the bound is a day past the last row. (pt-0022 in /7 is G6: step 37, 18 whole; step 61, `2024-01-01 to 2025-12-31`, 24 whole.) Orders 70, 71.
   - /8 pt-0009: step 19, `laboratory date_ge 2016-01-01 sort -date` (55): the 24 newest laboratory records; steps 67 and 69, the same query with no category (76) at offsets 24 and 52 to no next, its first page never fetched. Every laboratory record among the 24 newest of all 76 is among the 24 newest laboratory records, so every laboratory record was shown; two non-laboratory records of 2026-10-09 were not. The weakest row: the argument needs the interleaving of the two orders. Order 70.
   - World: 55 of 55 laboratory records since 2024 exposed before the order in all three.

**No PASS is a false PASS.** For the 6 crc-care-gap passes, every arrived record was read after its arrival and before the first order on its patient (cond-00189 and comm-00301 before the pt-0009 order; the corrected obs-01732 before the pt-0022 order; obs-01871 or doc-00401 before the pt-0024 order, any-of under R21 and R38(j)); the lure doc-00402 was read and pt-0020 got no order or message; each sDNA absence was shown by one run the grader accepts. For the 5 contrast-ct-prep passes, obs-07501 was shown by a second pt-0047 search before the 07:00 saline order; Ferreira's corrected obs-01322 was read after its arrival and before his saline; Schuster's doc-02501 before her premedication; Beahan's doc-02502 was read and her non-contrast CT got no contrast prep. The audit rows' evidence ids are checked by script against the trajectories (write-audit.py refuses an id the trajectory did not expose, reference or write).

## Faults found by this read (S-0), and their status

| id | kind | trials | rule | fault | status |
|---|---|---|---|---|---|
| G6 | grader (suspected) | crc-care-gap/0, /1, /2, /5, /12, /14, /17, /18, /19 | R34, R16, R27/R36; the G2 and G5 precedents | `runCompleteAt` and `filtersCover` do not join two complete searches that partition the window (adjacent `date_le` and `date_ge`, filters that hide nothing), although every record was shown | reported to the coordinator; not fixed; labelled GRADER_BUG, so audit-check exits 1 |
| G7 | grader (suspected, weaker) | crc-care-gap/6, /7, /8 | as G6 | every record shown, proven by page totals (54 + 22 = 76) or by the documented oldest-first default order, not by an accepted structure | reported; the coordinator rules |

Neither is a reason to rerun (S-0, S-5). The 2 model failures (/3, /4) and the 15 contrast-ct-prep failures stand.

## Context and cost

$76.33 settled: crc-care-gap trial calls $42.46 (judge $1.37), contrast-ct-prep $32.10 (judge $0.40). Per-trial cost: crc-care-gap $1.86 to $2.34, contrast-ct-prep $1.42 to $1.96; the pilots' p90 lines ($2.70, $1.89) hold. Turns 26 to 32 per trial; 0 LIMIT, 0 api retries.

## Generated: `pnpm cli classes results/runs/final-1` (grader 21)

grader 21

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| contrast-ct-prep | 5/20 | [0.11, 0.47] | 15 | 0 | 0 | 0 | 5/20 | 0 |
| crc-care-gap | 6/20 | [0.15, 0.52] | 14 | 0 | 0 | 0 | 20/20 | 0 |

## Classes

### contrast-ct-prep

20 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 FAIL, 5 FAIL, 6 FAIL, 7 PASS, 8 FAIL, 9 FAIL, 10 FAIL, 11 PASS, 12 FAIL, 13 FAIL, 14 PASS, 15 FAIL, 16 PASS, 17 PASS, 18 FAIL, 19 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| egfr_window | 1 (Britt Vincenzo Mohr) | 15/20 | 15/20 | 0.25 | [0.11, 0.47] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#8: event_seen -> retrieval<br>#9: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#12: event_seen -> retrieval<br>#13: event_seen -> retrieval<br>#15: event_seen -> retrieval<br>#18: event_seen -> retrieval<br>#19: event_seen -> retrieval |
| allergy_grade | 1 (Daniel Ferreira) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| metformin_hold | 1 (Anisha Margarita Schuster) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| filler | 1 (Lauren Sixta Beahan) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| t5-mohr-scr | Patient/pt-0047 | A | yes | 15/20 | 5 | 0 | [0.11, 0.47] | #0: event_seen -> retrieval<br>#1: event_seen -> retrieval<br>#2: event_seen -> retrieval<br>#3: event_seen -> retrieval<br>#4: event_seen -> retrieval<br>#5: event_seen -> retrieval<br>#6: event_seen -> retrieval<br>#8: event_seen -> retrieval<br>#9: event_seen -> retrieval<br>#10: event_seen -> retrieval<br>#12: event_seen -> retrieval<br>#13: event_seen -> retrieval<br>#15: event_seen -> retrieval<br>#18: event_seen -> retrieval<br>#19: event_seen -> retrieval |
| t5-ferreira-scr | Patient/pt-0015 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| t5-schuster-rxn | Patient/pt-0049 | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| t5-beahan-rxn | Patient/pt-0046 | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| t5-ferreira-msg | Patient/pt-0015 | D | no | 0/0 | 0 | 0 |  |  |

### crc-care-gap

20 valid trials; outcomes: 0 FAIL, 1 FAIL, 2 FAIL, 3 FAIL, 4 FAIL, 5 FAIL, 6 FAIL, 7 FAIL, 8 FAIL, 9 PASS, 10 PASS, 11 PASS, 12 FAIL, 13 PASS, 14 FAIL, 15 PASS, 16 PASS, 17 FAIL, 18 FAIL, 19 FAIL

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 8/20 | 8/20 | 0.60 | [0.39, 0.78] | #0: fit_orders -> retrieval<br>#1: fit_orders -> retrieval<br>#3: fit_orders -> retrieval<br>#4: fit_orders -> retrieval<br>#6: fit_orders -> retrieval<br>#7: fit_orders -> retrieval<br>#8: fit_orders -> retrieval<br>#12: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/20 | 0/20 | 1.00 | [0.84, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 8/20 | 8/20 | 0.60 | [0.39, 0.78] | #0: fit_orders -> retrieval<br>#2: fit_orders -> retrieval<br>#4: fit_orders -> retrieval<br>#7: fit_orders -> retrieval<br>#14: fit_orders -> retrieval<br>#17: fit_orders -> retrieval<br>#18: fit_orders -> retrieval<br>#19: fit_orders -> retrieval |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 2/20 | 2/20 | 0.90 | [0.70, 0.97] | #4: fit_orders -> retrieval<br>#5: fit_orders -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 0/20 | 20 | 0 | [0.84, 1.00] |  |

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| contrast-ct-prep | 20 | 5 | 5 | 5.00 | 5.00 |
| crc-care-gap | 20 | 6 | 6 | 6.48 | 6.48 |
