# final-1: the official run, six tasks at their frozen versions, 20 trials each (grader 22)

**One grade changed by the R48 grader fix.** message-queue/10 was recorded FAIL (grader_task_version 270b7a47: its hold rule counted only a voided renewal and a PCP Task focused on the chart order) and is PASS at the R48 regrade (ruling R48 and its addendum, gate W5F-238 F1: an on-hold renewal with the PCP Task focused on it satisfies RBC-RX-05 sections 2 and 7), made offline over all 120 records at this head with no model call and no rerun: **message-queue 20/20** (Saturated; 19/20 as recorded). Every other record's grade is unchanged. Each record keeps its recorded grade and carries the grader-22 regrade as its one regrades[] entry; results/tasks-final.json holds the matching regrade entry for message-queue (regrade-r48). The task is not changed.

Two batches, one world each (R40; manifest.json `world_hashes` names each task's):

- **P22 (2026-11-03, batch fb524a47, tag freeze-t3t5, world ba0b0206)**: crc-care-gap v1 and contrast-ct-prep, 40 settled, $76.33 settled. Recorded at grader 21; regraded offline at grader 22 (PR #216, tag regrade-r41, ruling R41). crc-care-gap v1's 20 records were moved byte-identical to `superseded/crc-care-gap-v1/` at W5-F (R42, `pnpm cli supersede`; its README is there); they are summarized beside v2 and never counted.
- **W5-F (2026-11-06 12:00-13:34Z, batch 5a45f225, commit 30448f3a on wth-lg/w5-final from main a7db4dbe, env_dirty false, world 32515f6a)**: renal-dose-review v2 {A,B}, results-inbox {A}, discharge-medrec {B}, message-queue v3 {A} and crc-care-gap v2 {A}, each at the version results/tasks-final.json freezes (plan-amendment-w5 W5-F, S5-8): 100 settled, 0 re-queued, 0 ENV_ERROR, 0 ENV_LIMIT, 0 GRADER_ERROR, $172.61 settled (trial calls $168.73, judge $3.88), after the dry run ($222.09 projected from the pilots' p90 x 1.15) and `spend --check --final-reserve --cost-from results/pilot-5a,results/pilot-5b,results/pilot-5t,results/pilot-5c` (exit 0; the reserve is this run).

| task | version | PASS | Wilson 95% | band verdict | note |
|---|---|---|---|---|---|
| renal-dose-review | v2 {A,B} | **16/20** | [0.58, 0.92] | Above band | lever A (fairweather-scr-batch) 16/20, B 20/20; the 4 failures the silent creatinine never exposed |
| results-inbox | {A} | **12/20** | [0.39, 0.78] | In band | lever A (marchetti-cr-batch) 12/20; the 8 failures the silent creatinine never exposed |
| discharge-medrec | {B} | **20/20** | [0.84, 1.00] | Saturated | lever B 20/20 |
| message-queue | v3 {A} | **20/20** (19/20 as recorded) | [0.84, 1.00] | Saturated | lever A 20/20; trial 10 recorded FAIL on a hold written where the rule wanted a void, PASS at the R48 regrade |
| crc-care-gap | v2 {A} | **15/20** | [0.53, 0.89] | Above band | lever A (crc-b3) 20/20; the 5 failures base members' window reviews (R41, R46) |
| contrast-ct-prep | v1 | **5/20** | [0.11, 0.47] | In band | P22, grader 22 regrade; unchanged |
| crc-care-gap v1 (superseded) | v1 | 18/20 | [0.70, 0.97] | Above band | not counted; superseded/crc-care-gap-v1/ |

The clinician read of every failure (each evidence id checked against the trajectory), the task-validity reviews, two score-only judge faults listed for P23 and the generated tables are in classes.md; the card is result-card.md (`result-card --classes classes.json --history results/pilot-4a,results/pilot-4b,results/pilot-5c`); the audit rows are audit.jsonl (55 rows: 21 of P22, 33 of W5-F, and P23's renal-dose-review task-validity line); the item, event and lever tables at the run's commit are pinned in item-classes.json (R37). Four tasks are outside the 0.2-0.7 band (two above, two saturated): W5-F's on-fail rule sends each to the user with its card.

P23 (builder-323; plan P23, R14-31 to R14-33, JG5): the blinded LLM auditor's verdict for each of the 35 targets at the R48 grade (32 valid failures and the 3 PASSes with a met or unknown penalty) is auditor/<task>/<index>.json (`pnpm cli audit-llm`, prompt auditor-v2; every verdict equals the builder label, so every audited row's llm_auditor_agrees is true; $14.32 settled). double-labels.jsonl holds the blinded second label of 20 valid failures (seed 323, labeller verifier-p23-double-label, an independent verifier session; all model), and verifier-p23-adjudicator adjudicated every disagreement and unclear row (none of either) and wrote the renal-dose-review task-validity line. summary.json carries judge_agreement (results/judge-calibration/hand-labels.jsonl: 53 judge items labelled with the judge outputs hidden, 48 agree; the 5 disagreements are the reply_names_other_patient false positive on Parisian's own naproxen; no task of this run asks an extraction) and kappa (both the degenerate 1: one category on both sides). `audit-check --final` exits 0.

It is pinned to (manifest.json, equal to results/tasks-final.json):

- worlds: ba0b02069ab423eeb28c4671bc239c4aa1ec45c28911dbb9dd21948c77ca3a86 (contrast-ct-prep; crc-care-gap v1 under superseded) and 32515f6aa1d27ad3756ca33fb8c782a5d611c3d5bd42c9778d074c7590a73f2a (the five W5-F tasks)
- contrast-ct-prep task_version 57088c0713e9e6004a70bb0e442e4fb74225ae6a8243bd7cdf7b0b26a2b77bdc, env_version dda55417a9303a23ee2e2da0cbcefc8ad82599a2c0da7aca7d29027e1567d6b1, grader_task_version d4a70655af9b69e03e246328ef5e686cacaf965a3d2cf2fede56af6d6dee98ca as recorded; the grader 22 regrade at c964545f0f9e50e670036eb55dfc75d349c7d27ca51b48d1aba7d62a503d1528
- renal-dose-review task_version 4e4f06ca0dc8e6f987f74c8d22da6d2a9667935fa50d39aa6246c777c882d575, env_version 88c8dbe7f11d96f469dd8e132184fb175568d7ac7f69055e903641475d23d358, grader_task_version 3b7fa10adea1750cecbafcac64d7d479a9bb7c058aa5e34a97cb1e9323e2c16d (re-frozen on this world before the run, R40: its files unchanged since pilot-5a; the W5-S freeze under `previous`)
- results-inbox 3e403540df819f207d960041807fd7f94755612a42602feb6f0f23154e3cf3c2 / e69093009b4e9bc112a7c35ea4c292431ed741c3ddc6d2b4789db2fca6f433bf / ffee13db89e555206d518851f848a5641d43a7afa7499f0bec99e412f46ff00e
- discharge-medrec 59be9d3de447cf692da12366c085b18557bd2d98824bba511a9860983130a7e2 / 9c12d584af1d4fbeedea1699171020ab88c0a30c623a33cd89c08ca53870fdf5 / 8f1468c535b9d939fb5187839afc9335c2764a8bd1acf9d2a2db636613134eeb
- message-queue bacd9df602c4cbd6a63aaab114d0330825534ee9c5812c8c803c15c5f4f96010 / 3a0faaf31d0f279105d23f7925475d8676d150af732c546ce1052c647e980812 / 270b7a476985968576f9a47ce5314de6e3488745736f624c67e110cbafe3b631 as recorded; the R48 regrade at grader_task_version 09e775242cf6b557f8301824e3be6c073bf95f298c14fe4e5c38b03dea7fd7d4 (matrix.json carries both)
- crc-care-gap v2 ee4d9690b859f098323029e1486d839dc272362ea546f38a68f88b92a8955c00 / 33891901cd8dc4e64536b9aaac0b6eaf2037073b2baeeb8d2903536834049570 / fa1792d716e6c8049b75c9f9f95972b668a064e736b3c391ca325ccca180b04d (v1's versions in superseded/crc-care-gap-v1/README.md)
- env_git_sha 1b120e8bbd380e48ba9f82094bf393b408c8efbf (tag freeze-t3t5) on the P22 records and 30448f3a7abd17dfcda794ff6aecd2eb692ef1b7 on the W5-F records, env_dirty false on both

## Reproduce

The run holds tasks of two worlds, so it is replayed in two steps that merge into one replay.json (`pnpm cli replay --tasks`, cli/replay.ts header). contrast-ct-prep's records (and crc-care-gap v1's, under superseded/) are reproduced at tag `final-1-t3t5` (e8ef8c4d9bedce9e93d1a6d2031785c295e5caae, results/tasks-final.json replay_at: the commit that holds the P22 run, grader 22 and the frozen world ba0b0206; they were run at tag freeze-t3t5, grader 21, where a replay gives 28 of 40 because grader 21 contradicts the grader 22 current grade of the 12 regraded G6/G7 trials). The five W5-F tasks are reproduced at tag `final-1-w5` (results/tasks-final.json replay_at: the commit that holds this run, grader 22 and the world 32515f6a). A replay at a checkout whose world differs keeps the committed verdicts of a task's trials made where they could be replayed (never overwritten without `--overwrite`) and marks a trial with no such verdict `world_mismatch`, saying where to replay it.

```sh
# 1. contrast-ct-prep, at its replay commit, on a copy of the run as it was there.
git worktree add /tmp/final-1-t3t5 final-1-t3t5
cp -R /tmp/final-1-t3t5/results/runs/final-1 /tmp/final-1-step1
(cd /tmp/final-1-t3t5 && pnpm cli replay /tmp/final-1-step1)    # 40 of 40 trials reproduced (crc-care-gap v1 and contrast-ct-prep)
# 2. The five W5-F tasks at tag final-1-w5 (or any later checkout on the world 32515f6a), merged into a copy of the run as it is now (replay, summary --write and audit-check write into the run directory; keep the committed copy clean).
cp -R results/runs/final-1 /tmp/final-1
cp /tmp/final-1-step1/replay.json /tmp/final-1/replay.json
pnpm cli replay /tmp/final-1 --stamp e8ef8c4d9bedce9e93d1a6d2031785c295e5caae   # stamps step 1's entries of records at that freeze (contrast-ct-prep); v1's entries of crc-care-gap are no verdict of the v2 records of the same name and are refused (run the stamp on a copy that holds step 1's contrast-ct-prep entries only, or stamp before step 1's crc-care-gap entries are merged)
pnpm cli replay /tmp/final-1 --tasks renal-dose-review,results-inbox,discharge-medrec,message-queue,crc-care-gap   # 100 of 100 reproduced; the 20 contrast-ct-prep entries kept
pnpm cli summary /tmp/final-1 --require env_error_raw=0,env_limit=0,grader_error=0,model=claude-opus-5-5,replay=all   # exit 0; with band=0.2-0.7 it exits 1 (four tasks outside the band)
for t in renal-dose-review results-inbox discharge-medrec message-queue crc-care-gap; do pnpm cli matrix --task $t --out /tmp/final-1; done
pnpm cli audit-check /tmp/final-1
pnpm cli regrade <copy of results/runs/final-1, regrades[] removed> --grader-version 22   # at this head: message-queue/10 FAIL -> PASS, 0 of the other 119 change
pnpm cli classes results/runs/final-1 --json
pnpm cli result-card results/runs/final-1 --classes results/runs/final-1/classes.json --history results/pilot-4a,results/pilot-4b,results/pilot-5c
pnpm cli context-budget results/runs/final-1 --task renal-dose-review,results-inbox,discharge-medrec,message-queue,crc-care-gap
```

Gates at the W5-F head (evidence/builder-321/ in the run ledger): `summary --require env_error_raw=0,env_limit=0,grader_error=0,model=claude-opus-5-5` exit 0; `replay --tasks <the five>` 100 of 100, 20 kept; `matrix --task <id> --out` 5 x PASS with each oracle pin matching; `audit-check` exit 0 (32/32 failures labelled at the R48 regrade, environment 0, grader 0); `context-budget` every line holds; `pnpm donewhen` clause (5) FAIL on the band alone (frozen 6/6, every record at its frozen versions, replay_at named, every initial state a frozen world) and clause (6) FAIL on `audit-check --final` alone (no LLM auditor verdict yet: P23), its audit part 33/33 and GRADER_ERROR 0.

The W5-F batch was made with `pnpm cli run --task renal-dose-review,results-inbox,discharge-medrec,message-queue,crc-care-gap --model claude-opus-5-5 --effort high --trials 20 --cost-from results/pilot-5a,results/pilot-5b,results/pilot-5t,results/pilot-5c --out results/runs/final-1` (concurrency 4) after `pnpm cli supersede results/runs/final-1 --task crc-care-gap --version v1` moved v1 out (its trial records, trajectories, replay.json entries and audit.jsonl rows, byte-identical). The P22 batch: `pnpm cli run --task crc-care-gap,contrast-ct-prep ... --cost-from results/pilot-4a,results/pilot-4b --out results/runs/final-1` after its dry run ($106.41) and spend check. results/official.json names this run as the official one.
