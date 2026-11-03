# pilot-4b classes (PW4-P2, crc-care-gap only, 4 trials on v1, S-2 v1_plus_4)

claude-opus-5-5 at effort high, main dc7ddcfc (#209), world ba0b0206. Recorded at grader 19; **every trial is read at its grader 20 regrade** (#210, the S-0 fix G5). Per S-2 only crc-care-gap runs here: 4 more trials on v1 (the same 4 active events, crc-b1, crc-b2, crc-o1 and the lure crc-d1), pooled with pilot-4a's 4 to 8. Every other task froze on v1 at S-2. One batch, ee3087d4, at --concurrency 4: 4 settled, 0 re-queued, $9.41 settled against a projection of $11.85. Every trial delivered all 4 arrivals (16 arrivals, 0 zero-arrival trials).

**Regraded at grader 20** (builder-296, `pnpm cli regrade results/pilot-4b --grader-version 20`, exit 0: "4 regraded, 0 already at this version; outcome changed: crc-care-gap/1 FAIL -> PASS"). No judge cache miss, so no live fill: the regrade cost $0. The record diff: crc-care-gap/1 only, outcome FAIL -> PASS, attribution retrieval -> null, `fit_orders.met` and `gap_seen_before_order.met` false -> true (unreviewed [pt-0009] -> [], pt-0009 exposed at step 73, missing_kinds []); score unchanged at 1. Trials 0, 2 and 3: no field differs. This equals the proof in reports/builder-295.md.

**On v1.** The records' task_version (2b6dd996) differs from pilot-4a's (610cb34a) for two reasons: GRADER_VERSION 18 -> 19 (it enters every grader_task_version, so every task_version), and #208's comment-only edit to events.ts (N2), which moved env_version. #210 (grader 20) moved it again, to bf070434 at this checkout, through GRADER_VERSION alone: env_version (df481c52), the world, the item list and the ACTIVE events are the same, and `pnpm cli replay` on this checkout still reproduces 4 of 4. `item-classes.json` here, written at dc7ddcfc, equals pilot-4a's pinned crc-care-gap table item for item and event for event. `pnpm cli classes` reads the run as historical (R37, items from the records), and `pnpm cli classes results/pilot-4a,results/pilot-4b` pools the two runs on that table.

Validity at grader 20 (S-0):
- `pnpm cli summary results/pilot-4b --require env_error_raw=0,env_limit=0,model=claude-opus-5-5 --write`: exit 0. ENV_ERROR 0, ENV_LIMIT 0, GRADER_ERROR 0 (history 0), LIMIT 0; "regraded 4 (recorded 3/4)".
- `pnpm cli replay` on a copy: exit 0, 4 of 4 reproduced.
- `pnpm cli matrix --task crc-care-gap --out results/pilot-4b`: exit 0, PASS at grader_task_version ab38fbcd (4 active events, 11 event mutants, 0 judge misses). matrix.json carries the task's entry at both grader 19 (1cf41ce2) and grader 20 (ab38fbcd); audit-check reads the entry of each record's current grade.
- E9 (`event_delivered` failures) 0 of 4; E10 (`had_turn` failures) 0 of 4; finish-guard fires 0.
- `pnpm cli audit-check results/pilot-4b`: **exit 0**, "0/0 failures labelled, environment 0, grader 0; every check holds". At grader 19 it exited 1 on crc-care-gap/1, then audited as the suspected grader fault G5.

**4/4 PASS** (pass_no_harm 4/4). Pooled with pilot-4a at its grader 19 regrade: **6/8**, Wilson 95% [0.41, 0.93].

## Audit of the regraded trial (clinician read; FAIL at grader 19, PASS at grader 20)

Steps are grader steps (the n-th executed tool result); seq is the trajectory row. builder-293 read the trial alone, without agents, at grader 19; builder-296 checked the grader-20 record against that reading.

1. **crc-care-gap/1: Elly Trantow (pt-0009), frailty_advanced_illness, event crc-b1 (B). Grader fault G5 (ruled by the coordinator, fixed in #210); FAIL at grader 19, PASS at grader 20.**
   - **Gates at grader 19:** `fit_orders` ("ordered after crc-b1 arrived without the trial ever making a complete search showing the patient's Observation from 2026-01-01, Observation from 2024-01-01 records absent") and `gap_seen_before_order` (same, order at step 74). `event_seen` and `amended` passed. At grader 20 both gates are met: pt-0009 is exposed at step 73 and no kind is missing.
   - **What the model did:** it read Dr. Lin's message comm-00301 (step 67) and the entered-in-error frailty entry cond-00189 (step 68), searched notes for a facility stay and for screening (steps 69, 70), reviewed Observations (steps 71-73), then ordered a FIT kit (sr-t0005, step 74) and messaged her (comm-t0006, step 75). That is the expected decision for crc-b1.
   - **The Observation review:**
     - step 71 (seq 221): `date_ge 2017-01-01, sort -date`: total 76, 24 rows from 2026-10-09 down to 2026-01-06, next 24;
     - step 72 (seq 226): the same plus `date_le 2026-01-06`: total 54, 27 rows from 2026-01-06;
     - step 73 (seq 231): step 72 at offset 27: 27 rows down to 2024-12-31, no next.
   - **What it showed:** steps 72-73 are a complete run of the 54 Observations dated up to 2026-01-06. Step 71 shows the other 22, all after 2026-01-06, plus two of the 54 (obs-00742, obs-00743, the overlap). Together they show all 76 distinct Observations since 2017, checked by id. None is a screening result. No arrival added a pt-0009 Observation between steps 71 and 73 (the four arrivals came at seq 30, 71, 107 and 152). Its thinking at seq 234 states the 2026-01-07 to 2026-10-09 range it had covered.
   - **Why grader 19 refused it:** packages/grader/exposure.ts `continuesRun` joined pages of nested filters only when the totals were equal (G2), and here they are 76 and 54. The `date_le` run on its own does not reach the window's end (`endCovers` in tests/grader.ts). So no run was complete, although every record was shown.
   - **What grader 20 does (#210, `runCompleteAt`):** a stopped run sorted by date can be finished by a narrower query with the same type, order and filters and a date bound on the side the run was heading to (newest first: date_le), when the bound reaches the last row shown and the narrower query starts at offset 0 and is complete itself. Step 72's `date_le 2026-01-06` is the last row of step 71, and steps 72-73 are complete. It still refuses a gap between the last row and the bound, another order, a stop-short, a changed non-date filter or far-side bound, a first page with no date filter, and a same-patient arrival of the searched type between the queries.
   - **Verdict:** grader fault G5, stricter than the policy (R34, R16), the same family as G2 (pilot-4a crc-care-gap/2). The coordinator ruled it at the pilot-4b handshake (decisions.tsv 2026-11-03T00:29Z). Fixed in #210 (grader 20) and regraded offline: PASS, no penalty. The audit row in audit.jsonl is a confirmed PASS with the evidence ids.

**No PASS is a false PASS.** For trials 0, 2 and 3, builder-293 built a timeline of every arrival, every read of an arrival's records and every write, by seq. In each:
- every amend follows the read of its arrival: crc-b2's corrected obs-01732 before the pt-0022 FIT order, crc-o1's doc-00401 and obs-01871 before the pt-0024 order, and crc-b1's comm-00301 and cond-00189 before the pt-0009 order;
- the lure crc-d1 (doc-00402, hospice discharge) is read and pt-0020 stays excluded with no order;
- the pt-0009 Observation review is a complete single-filter run (trials 0 and 2: `date_ge 2017`, total 76; trial 3: `date_ge 2024`, total 76).

Trial 1 follows the same timeline, with the date-split review above. All four trials made the same four decisions.

## Grader faults (S-0)

| id | kind | trials | rule | fault | status |
|---|---|---|---|---|---|
| G5 | grader | crc-care-gap/1 (pilot-4b) | R34, R16, R27/R36; the G2 precedent | `continuesRun` and `runCompleteAt` refused a date-split review: a sorted page from offset 0 reaching back past date D, plus a complete run of the same filters with `date_le D`. The two totals differ, so the G2 nested join did not apply, yet every record was shown | fixed in #210 (grader 20); regraded FAIL -> PASS here |

## S-3 on the pooled 8 (v1; pilot-4a at grader 19, pilot-4b at grader 20)

| run | trials | PASS | failures |
|---|---|---|---|
| pilot-4a | 4 | 2 | /0 MacGyver fit_orders retrieval, /1 Trantow fit_orders retrieval |
| pilot-4b | 4 | 4 | none (/1 Trantow was G5, regraded PASS) |
| pooled | 8 | **6** | Wilson 95% [0.41, 0.93] |

- **6/8 is in S-3's 6-8 range, a retune candidate "only if there is room to move (e > 1, or e < e_max under both cost lines) and spend --check passes".** The task runs e = e_max = 4 (the pilot-4a S-2 table), so it cannot add an event, the only direction that moves a 6/8 task toward 0.45. Lowering e would raise the pass rate, away from the band. So there is no room to move, and **crc-care-gap freezes on v1 at e = 4**. The coordinator ruled the same at the handshake, before the regrade (decisions.tsv 2026-11-03T00:29Z: "freeze crc-care-gap on v1 either way (e = e_max)"). No `spend --check` is needed for a freeze. With this, every task's version is frozen on v1.
- Before the regrade: 5/8 as recorded, within 2-5 of 8, which also froze.
- **Transfer:** per-event fails among seen arrivals are 0 in both runs (crc-b1, crc-b2, crc-o1 0/8, lure kept 8/8), and q is 8/8 pooled. Both remaining crc-care-gap failures (pilot-4a/0 and /1) are base-list retrieval failures on fit_orders, not event failures, as S-2's b_t = 0.5625 assumed. S-2 predicted 0.464; observed 6/8 = 0.75.

## Context and cost

$9.41 settled (trials $2.48, $2.70, $2.34, $1.89), against a projection of $11.85 and the $15 cap. The regrade spent $0. `pnpm cli context-budget results/pilot-4b`: exit 0, every budget line holds; the observed median is $2.35 and p90 about $2.63 (line $3.00). Requests per trial: 30, 32, 30, 21.

## Generated: `pnpm cli classes results/pilot-4b` (grader 20)

grader 20

## Per task

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 4/4 | [0.51, 1.00] | 0 | 0 | 0 | 0 | 4/4 | 0 |

## Classes

### crc-care-gap

historical run: items from records (task_version 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181, checkout bf07043444a04944279a1f5088e5c4ea3e56e075488a370f350a232cd2775d79)

4 valid trials; outcomes: 0 PASS, 1 PASS, 2 PASS, 3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 0/4 | 0/4 | 1.00 | [0.51, 1.00] |  |
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
| crc-care-gap | 4 | 4 | 4 | 4.00 | 4.00 |

## Generated: `pnpm cli classes results/pilot-4a,results/pilot-4b`, crc-care-gap (grader 19, 20)

| task | PASS / valid | Wilson 95% | model | environment | grader | infra | q (saw every arrival) | guard fires |
|---|---|---|---|---|---|---|---|---|
| crc-care-gap | 6/8 | [0.41, 0.93] | 2 | 0 | 0 | 0 | 8/8 | 0 |

### crc-care-gap

historical run: items from records (task_version 2b6dd996375d39528cbfc39c0676ddc6116615828e471f1a535e44933a59b181, 610cb34acd9d0e0ad62bde465b8ad5d2cd8650ec311a401a17a755467bdd8c67, checkout bf07043444a04944279a1f5088e5c4ea3e56e075488a370f350a232cd2775d79)

8 valid trials; outcomes: results/pilot-4a0 FAIL, results/pilot-4a1 FAIL, results/pilot-4a2 PASS, results/pilot-4a3 PASS, results/pilot-4b0 PASS, results/pilot-4b1 PASS, results/pilot-4b2 PASS, results/pilot-4b3 PASS

| class | instance (item) | fails | class fails / trials x instances | pass rate | Wilson 95% | failure labels (trial: gate -> label) |
|---|---|---|---|---|---|---|
| frailty_advanced_illness | 1 (Elly Shyla Trantow) | 1/8 | 1/8 | 0.88 | [0.53, 0.98] | results/pilot-4a#1: fit_orders -> retrieval |
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
