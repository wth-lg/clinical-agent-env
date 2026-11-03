# final-1: P22 final run, crc-care-gap and contrast-ct-prep (20 trials each; the other four tasks join after W5)

The two tasks frozen in results/tasks-final.json at tag freeze-t3t5 (user decision 2026-11-03), claude-opus-5-5 at effort high, --concurrency 4, one batch fb524a47: 40 settled, 0 re-queued, 0 ENV_ERROR, 0 ENV_LIMIT, 0 GRADER_ERROR, $76.33 settled (trials $74.56, judge $1.77). As recorded at grader 21: **contrast-ct-prep 5/20** (Wilson 95% [0.11, 0.47]) and **crc-care-gap 6/20** ([0.15, 0.52]), both in the 0.2 to 0.7 band. The clinician read of every failure, the suspected grader faults G6 and G7 (reported, not fixed) and the generated tables are in classes.md; the card is result-card.md; the audit rows are audit.jsonl.

It is pinned to (manifest.json, equal to results/tasks-final.json):

- world ba0b02069ab423eeb28c4671bc239c4aa1ec45c28911dbb9dd21948c77ca3a86
- crc-care-gap task_version adb184d4b232bc2f4bd951af09c3300f1b8e499aef7667dee3cfc2f7fcd55535, env_version df481c520ddc09dbafb0011b40fa583187697768f255d3c80019200604dc38ee, grader_task_version 385c668dcaee778ebbfbf548d2354c8ba48a8bcbd37c6579d5486c291b5c7ba3
- contrast-ct-prep task_version 57088c0713e9e6004a70bb0e442e4fb74225ae6a8243bd7cdf7b0b26a2b77bdc, env_version dda55417a9303a23ee2e2da0cbcefc8ad82599a2c0da7aca7d29027e1567d6b1, grader_task_version d4a70655af9b69e03e246328ef5e686cacaf965a3d2cf2fede56af6d6dee98ca
- env_git_sha 1b120e8bbd380e48ba9f82094bf393b408c8efbf (tag freeze-t3t5) on every record and in the manifest, env_dirty false

## Reproduce

Reproduce commit for the records: 1b120e8bbd380e48ba9f82094bf393b408c8efbf (tag freeze-t3t5, the P21 merge). A later W5 world rebuild moves both tasks' current env_version on main (R40); the records stay valid at the versions above and are reproduced at that commit (R37).

```sh
git checkout freeze-t3t5
cp -R results/runs/final-1 /tmp/final-1    # replay, summary --write and audit-check write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/final-1
pnpm cli summary /tmp/final-1 --tasks crc-care-gap,contrast-ct-prep --require valid=20,band=0.2-0.7,env_error_raw=0,grader_error=0,model=claude-opus-5-5,replay=all
pnpm cli matrix --task crc-care-gap --out /tmp/final-1 && pnpm cli matrix --task contrast-ct-prep --out /tmp/final-1
pnpm cli audit-check /tmp/final-1          # exit 1 while the 12 crc-care-gap rows are labelled GRADER_BUG (G6, G7)
pnpm cli classes results/runs/final-1 --json
pnpm cli result-card results/runs/final-1 --classes results/runs/final-1/classes.json --history results/pilot-4a,results/pilot-4b
```

The run was made with `pnpm cli run --task crc-care-gap,contrast-ct-prep --model claude-opus-5-5 --effort high --trials 20 --concurrency 4 --cost-from results/pilot-4a,results/pilot-4b --out results/runs/final-1` after its --dry-run ($106.41) and `pnpm cli spend --check --final-reserve --cost-from results/pilot-4a,results/pilot-4b` (exit 0). The other four tasks add their 20 trials here after their W5 lever, pilots and freeze; results/official.json is written then.
