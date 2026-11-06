# pilot-5c: W5-H5, the two retuned W5 tasks, 8 trials each

results-inbox {A} and message-queue v3 ({A} with the pre-declared inbox softening "Results (9)"; plan-amendment-w5 S5-5 and S5-3, rulings R45 and R47), claude-opus-5-5 at effort high, `pnpm cli run --task results-inbox,message-queue --model claude-opus-5-5 --effort high --trials 8 --concurrency 4 --out results/pilot-5c` once, on main 40d31865 (#235, the retune, merged; tag freeze-w5h5).

- Batch 7042d5cb-7072-48d7-911e-a473b1e639c2, 2026-11-06 10:48-11:04Z, 16 settled, 0 re-queued, $25.51 settled. PASS: results-inbox 4/8, message-queue 8/8.
- Lever items (passed/observed): T2 A 4/8 (each failure the silent creatinine obs-06210 never exposed after the arrival, retrieval, as in pilot-5a; each pass one creatinine search after it and the urgent repeat BMP); T6 A 8/8 (every trial searched the panel report dr-00602 after the softened inbox row and re-ordered 90 days with 1 refill). No judged penalty met in any trial.
- `pnpm cli lever-select results/pilot-5c`: results-inbox {A} 0.450 in band and 4/8 inside 3-5 of 8 (S5-2 freeze); message-queue {A} 0.810 above the band. R45: each retuned version freezes on this result whatever it is (one round only); both freezes are in results/tasks-final.json (tag freeze-t2t6).

Pinned to commit 40d31865eaf521a3279ff88306d2c552619e7bee, the world in manifest.json world_hash (32515f6a), grader 22; the task, env and grader_task versions are in manifest.json, the item, event and lever tables at that commit in item-classes.json (R37; `lever` per cli/classes.ts F7).

Files: trials/ and trajectories/ (the records as the batch wrote them), manifest.json, matrix.json (`matrix --task <id> --out results/pilot-5c`), summary.json (`summary --write`), audit.jsonl (builder-320's clinician read, one row per trial; `audit-check` reads it), classes.json and classes.md (`classes --json` and the markdown, lever-item rows included), result-card.md (`result-card --classes classes.json`).

## Reproduce

```sh
cp -R results/pilot-5c /tmp/pilot-5c    # replay and summary --write write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/pilot-5c
pnpm cli summary /tmp/pilot-5c --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check results/pilot-5c
pnpm cli classes results/pilot-5c --json
pnpm cli lever-select results/pilot-5c
```

The judge caches hold every answer the grades ask for (0 misses, no fill); judge calls made inside the trials are in each record's `judge.cache`.
