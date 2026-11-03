# pilot-4b classes (PW4-P2, crc-care-gap only, 4 trials on v1, S-2 v1_plus_4)

claude-opus-5-5 at effort high, main dc7ddcfc (#209), world ba0b0206, grader 19. Per S-2 only crc-care-gap runs here: 4 more trials on v1 (the same 4 active events, crc-b1, crc-b2, crc-o1 and the lure crc-d1), pooled with pilot-4a's 4 to 8. Every other task froze on v1 at S-2. One batch, ee3087d4, at --concurrency 4: 4 settled, 0 re-queued, $9.41 settled against a projection of $11.85. Every trial delivered all 4 arrivals (16 arrivals, 0 zero-arrival trials).

**On v1.** The task_version hash differs from pilot-4a's (610cb34a there, 2b6dd996 here) for two reasons: GRADER_VERSION 18 -> 19 (it enters every grader_task_version, so every task_version), and #208's comment-only edit to events.ts (N2), which moved env_version. The instruction, policy, world, item list and ACTIVE events are the same. `item-classes.json` here, written from this checkout, equals pilot-4a's pinned crc-care-gap table item for item and event for event. `pnpm cli classes results/pilot-4a,results/pilot-4b` pools the two runs as historical data (R37) on the pinned table.

Validity (S-0):
- `pnpm cli summary results/pilot-4b --require env_error_raw=0,env_limit=0,model=claude-opus-5-5 --write`: exit 0. ENV_ERROR 0, ENV_LIMIT 0, GRADER_ERROR 0 (history 0), LIMIT 0.
- `pnpm cli replay` on a copy: exit 0, 4 of 4 reproduced.
- `pnpm cli matrix --task crc-care-gap --out results/pilot-4b`: exit 0, PASS at grader_task_version 1cf41ce2 (4 active events, 11 event mutants, 0 judge misses).
- E9 (`event_delivered` failures) 0 of 4; E10 (`had_turn` failures) 0 of 4; finish-guard fires 0.
- `pnpm cli audit-check results/pilot-4b`: **exit 1**, only because crc-care-gap/1 is audited as a suspected grader fault (G5 below). The same audit with that row labelled model, retrieval exits 0, "every check holds".

**3/4 PASS** (pass_no_harm 3/3). Pooled with pilot-4a at grader 19: **5/8**, Wilson 95% [0.31, 0.86].

## Audit of the failure (clinician read, grader 19)

Steps are grader steps (the n-th executed tool result; `decisive_step` in audit.jsonl); seq is the trajectory row. builder-293 read the trial alone, without agents.

1. **crc-care-gap/1: Elly Trantow (pt-0009), frailty_advanced_illness, event crc-b1 (B). Suspected grader fault (G5); recorded FAIL, model, retrieval.**
   - **Gates:** `fit_orders` ("ordered after crc-b1 arrived without the trial ever making a complete search showing the patient's Observation from 2026-01-01, Observation from 2024-01-01 records absent") and `gap_seen_before_order` (same, order at step 74). `event_seen` and `amended` pass.
   - **What the model did:** it read Dr. Lin's message comm-00301 (step 67) and the entered-in-error frailty entry cond-00189 (step 68), searched notes for a facility stay and for screening (steps 69, 70), reviewed Observations (steps 71-73), then ordered a FIT kit (sr-t0005, step 74) and messaged her (comm-t0006, step 75). That is the expected decision for crc-b1.
   - **The Observation review:**
     - step 71 (seq 221): `date_ge 2017-01-01, sort -date`: total 76, 24 rows from 2026-10-09 down to 2026-01-06, next 24;
     - step 72 (seq 226): the same plus `date_le 2026-01-06`: total 54, 27 rows from 2026-01-06;
     - step 73 (seq 231): step 72 at offset 27: 27 rows down to 2024-12-31, no next.
   - **What it showed:** steps 72-73 are a complete run of the 54 Observations dated up to 2026-01-06. Step 71 shows the other 22, all after 2026-01-06, plus two of the 54 (obs-00742, obs-00743, the overlap). Together they show all 76 distinct Observations since 2017, checked by id. None is a screening result. No arrival added a pt-0009 Observation between steps 71 and 73 (the four arrivals came at seq 30, 71, 107 and 152). Its thinking at seq 234 states the 2026-01-07 to 2026-10-09 range it had covered.
   - **Why the grader refuses it:** packages/grader/exposure.ts `continuesRun` joins pages of nested filters only when the totals are equal (G2), and here they are 76 and 54. The `date_le` run on its own does not reach the window's end (`endCovers` in tests/grader.ts). So no run is complete, although every record was shown.
   - **Verdict:** suspected grader fault, stricter than the policy (R34, R16), the same family as G2 (pilot-4a crc-care-gap/2). Trials 0 and 2 paged the same `date_ge 2017` query to its end (offsets 0/24/52) and pass, and trial 1 showed the same 76 rows. If the coordinator rules it a fault, the trial is a PASS on a fix and regrade. If the coordinator rules the date split a model retrieval miss, the recorded FAIL stands. Not fixed here (S-0: report to the coordinator).

**No PASS is a false PASS.** For trials 0, 2 and 3, builder-293 built a timeline of every arrival, every read of an arrival's records and every write, by seq. In each:
- every amend follows the read of its arrival: crc-b2's corrected obs-01732 before the pt-0022 FIT order, crc-o1's doc-00401 and obs-01871 before the pt-0024 order, and crc-b1's comm-00301 and cond-00189 before the pt-0009 order;
- the lure crc-d1 (doc-00402, hospice discharge) is read and pt-0020 stays excluded with no order;
- the pt-0009 Observation review is a complete single-filter run (trials 0 and 2: `date_ge 2017`, total 76; trial 3: `date_ge 2024`, total 76).

All four trials made the same four decisions.

## Suspected faults (S-0), not fixed

| id | kind | trials | rule | fault | status |
|---|---|---|---|---|---|
| G5 | grader | crc-care-gap/1 (pilot-4b) | R34, R16, R27/R36; the G2 precedent | `continuesRun` and `runCompleteAt` refuse a date-split review: a sorted page from offset 0 reaching back past date D, plus a complete run of the same filters with `date_le D`. The two totals differ, so the G2 nested join does not apply, yet every record is shown | reported to the coordinator; no grader edit |

## S-3 on the pooled 8 (v1, grader 19)

| run | trials | PASS | failures |
|---|---|---|---|
| pilot-4a | 4 | 2 | /0 MacGyver fit_orders retrieval, /1 Trantow fit_orders retrieval |
| pilot-4b | 4 | 3 | /1 Trantow fit_orders retrieval (suspected G5) |
| pooled | 8 | **5** | Wilson 95% [0.31, 0.86] |

- **As recorded: 5/8, within 2-5 of 8, so crc-care-gap freezes on v1** (S-3 as written).
- If G5 is ruled a fault and regraded, it becomes 6/8 (Wilson [0.41, 0.93]), and S-3's retune clause applies: "room to move (e > 1, or e < e_max under both cost lines)". The task runs e = e_max = 4 (the pilot-4a S-2 table), so it cannot add an event, the only direction that lowers a 6/8 task toward 0.45. Read literally, though, "e > 1" holds (4 > 1), and that would make it a candidate. The coordinator decides which reading applies. A retune toward the band can only lower e, which raises the pass rate, so the useful reading is that it freezes. Also required: `spend --check` passing at that time, and at most 2 tasks by distance from 0.45.
- **Transfer:** per-event fails among seen arrivals are 0 in both runs (crc-b1, crc-b2, crc-o1 0/8, lure kept 8/8), and q is 8/8 pooled. Every crc-care-gap failure in both pilots is a base-list retrieval failure on fit_orders, not an event failure, as S-2's b_t = 0.5625 assumed. S-2 predicted 0.464; observed 5/8 = 0.625 (or 0.75 under G5).
- Reported, not acted on.

## Context and cost

$9.41 settled (trials $2.48, $2.70, $2.34, $1.89), against a projection of $11.85 and the $15 cap. `pnpm cli context-budget results/pilot-4b`: exit 0, every budget line holds; the observed median is $2.35 and p90 about $2.63 (line $3.00). Requests per trial: 30, 32, 30, 21.

## Generated: `pnpm cli classes results/pilot-4b` (grader 19)

grader 19

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 3/4 | [0.30, 0.95] | 1 | 0 | 0 | 0 | 4/4 | 0 |

## Classes

### crc-care-gap

4 valid trials; outcomes: 0 PASS, 1 FAIL, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 1/4 | 1/4 | 0.75 | [0.30, 0.95] | #1: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 0/4 | 4 | 0 | [0.51, 1.00] |  |

## Independence (descriptive, gates nothing)

| task | trials | PASS | all items pass | expected, per-item product | expected, per-class product |
|---|---|---|---|---|---|
| crc-care-gap | 4 | 3 | 3 | 3.00 | 3.00 |

## Generated: `pnpm cli classes results/pilot-4a,results/pilot-4b`, crc-care-gap (grader 19)

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 5/8 | [0.31, 0.86] | 3 | 0 | 0 | 0 | 8/8 | 0 |

### crc-care-gap

historical run: items from records (task_version 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181, 610cb34acd9d0e0ad62bde465b8ad5d2cd8650ec311a401a17a755467bdd8c67, checkout 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181)

8 valid trials; outcomes: results/pilot-4a0 FAIL, results/pilot-4a1 FAIL, results/pilot-4a2 PASS, results/pilot-4a3 PASS, results/pilot-4b0 PASS, results/pilot-4b1 FAIL, results/pilot-4b2 PASS, results/pilot-4b3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 2/8 | 2/8 | 0.75 | [0.41, 0.93] | results/pilot-4a#1: fit_orders -> retrieval<br>results/pilot-4b#1: fit_orders -> retrieval |
| hospice_revoked | 1 (Kelsie Wanetta Rohan) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| collection_vs_report_date | 1 (Tiny Darline Koss) | 0/8 | 0/8 | 1.00 | [0.68, 1.00] |  |
| colonoscopy_never_done | 1 (Delaine Evelyn MacGyver) | 1/8 | 1/8 | 0.88 | [0.53, 0.98] | results/pilot-4a#0: fit_orders -> retrieval |

Outside-the-list failures: none.

| event | item | class | active | fails / fired | seen | amend fails among seen | Wilson 95% | failure labels |
|---|---|---|---|---|---|---|---|---|
| crc-b1 | Patient/pt-0009 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-b2 | Patient/pt-0022 | B | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-o1 | Patient/pt-0024 | O | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |
| crc-d1 | Patient/pt-0020 | D | yes | 0/8 | 8 | 0 | [0.68, 1.00] |  |

