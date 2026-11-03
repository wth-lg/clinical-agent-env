# final-1: P22 final run, crc-care-gap and contrast-ct-prep (20 trials each; the other four tasks join after W5)

**The grade changed by the R41 grader fix.** Recorded at grader 21 (crc-care-gap 6/20, contrast-ct-prep 5/20). The current grades are the grader 22 regrade (PR #216, tag regrade-r41, ruling R41: window completeness by exposure of the target set, not by search shape), made offline on the frozen world with no model call and no rerun: **crc-care-gap 18/20** (Wilson 95% [0.70, 0.97], **Above band**; the 12 G6/G7 trials FAIL -> PASS, trials 3 and 4 still FAIL) and **contrast-ct-prep 5/20** ([0.11, 0.47], In band, unchanged). Each record keeps its grader-21 grade as recorded and carries the grader-22 grade as its one regrades[] entry; results/tasks-final.json holds the matching regrades entry per task. The task is not changed (S-5: no second final run).

The two tasks frozen in results/tasks-final.json at tag freeze-t3t5 (user decision 2026-11-03), claude-opus-5-5 at effort high, --concurrency 4, one batch fb524a47: 40 settled, 0 re-queued, 0 ENV_ERROR, 0 ENV_LIMIT, 0 GRADER_ERROR, $76.33 settled (trials $74.56, judge $1.77). As recorded at grader 21: contrast-ct-prep 5/20 (Wilson 95% [0.11, 0.47]) and crc-care-gap 6/20 ([0.15, 0.52]), both in the 0.2 to 0.7 band; at the grader 22 regrade, above. The clinician read of every failure, the grader faults G6 and G7 (ruled R41, fixed in #216, regraded) and the generated tables are in classes.md; the card is result-card.md; the audit rows are audit.jsonl.

It is pinned to (manifest.json, equal to results/tasks-final.json):

- world ba0b02069ab423eeb28c4671bc239c4aa1ec45c28911dbb9dd21948c77ca3a86
- crc-care-gap task_version adb184d4b232bc2f4bd951af09c3300f1b8e499aef7667dee3cfc2f7fcd55535, env_version df481c520ddc09dbafb0011b40fa583187697768f255d3c80019200604dc38ee, grader_task_version 385c668dcaee778ebbfbf548d2354c8ba48a8bcbd37c6579d5486c291b5c7ba3 as recorded; the grader 22 regrade is at grader_task_version f9df3580b7b0dbcce3c78a74e8aad427c8936a13f577edd61907322fb7389740 (matrix.json carries both)
- contrast-ct-prep task_version 57088c0713e9e6004a70bb0e442e4fb74225ae6a8243bd7cdf7b0b26a2b77bdc, env_version dda55417a9303a23ee2e2da0cbcefc8ad82599a2c0da7aca7d29027e1567d6b1, grader_task_version d4a70655af9b69e03e246328ef5e686cacaf965a3d2cf2fede56af6d6dee98ca as recorded; the grader 22 regrade is at c964545f0f9e50e670036eb55dfc75d349c7d27ca51b48d1aba7d62a503d1528
- env_git_sha 1b120e8bbd380e48ba9f82094bf393b408c8efbf (tag freeze-t3t5) on every record and in the manifest, env_dirty false

## Reproduce

Reproduce commit for the records: 1b120e8bbd380e48ba9f82094bf393b408c8efbf (tag freeze-t3t5, the P21 merge). The regrade: a checkout at or after tag regrade-r41 (9e72939a73c38624896f9ef92286ed3c45572625, grader 22) whose world is still ba0b0206 (it was, at the regrade). A later W5 world rebuild moves both tasks' current env_version on main (R40); the records stay valid at the versions above and are reproduced at that commit (R37).

```sh
git checkout freeze-t3t5
cp -R results/runs/final-1 /tmp/final-1    # replay, summary --write and audit-check write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/final-1
pnpm cli summary /tmp/final-1 --tasks crc-care-gap,contrast-ct-prep --require valid=20,env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all   # with band=0.2-0.7 it exits 1: crc-care-gap 18/20 is above the band
pnpm cli matrix --task crc-care-gap --out /tmp/final-1 && pnpm cli matrix --task contrast-ct-prep --out /tmp/final-1
pnpm cli audit-check /tmp/final-1
pnpm cli regrade <copy of results/runs/final-1, regrades[] removed> --grader-version 22   # at or after regrade-r41: 12 crc-care-gap records FAIL -> PASS, 0 of 20 contrast-ct-prep change
pnpm cli classes results/runs/final-1 --json
pnpm cli result-card results/runs/final-1 --classes results/runs/final-1/classes.json --history results/pilot-4a,results/pilot-4b
```

The run was made with `pnpm cli run --task crc-care-gap,contrast-ct-prep --model claude-opus-5-5 --effort high --trials 20 --concurrency 4 --cost-from results/pilot-4a,results/pilot-4b --out results/runs/final-1` after its --dry-run ($106.41) and `pnpm cli spend --check --final-reserve --cost-from results/pilot-4a,results/pilot-4b` (exit 0). The other four tasks add their 20 trials here after their W5 lever, pilots and freeze; results/official.json is written then.
