# pilot-5a: W5-P1, the four W5 tasks on v2 (lever items A and B both active), two batches of 4 trials per task

renal-dose-review, results-inbox, discharge-medrec and message-queue, claude-opus-5-5 at effort high, `pnpm cli run --task renal-dose-review,results-inbox,discharge-medrec,message-queue --model claude-opus-5-5 --effort high --trials 4 --concurrency 4 --out results/pilot-5a` once per batch (plan-amendment-w5.md W5-P1; stop rule S5 pre-registered in decisions.tsv 2026-11-04T01:50Z, before the first trial).

- Batch 1: 8f1cf1b7-ab88-4248-bc40-9dfd4fe09ae0, 2026-11-05 19:44-20:02Z, 16 settled, 0 re-queued, $27.17 settled. PASS: renal-dose-review 3/4, results-inbox 0/4, discharge-medrec 0/4, message-queue 0/4.

Pinned to commit d318656535fbe75937333c42fda789be4343323f (main after #225, the T2 rubric fix), world 1709cfeea8818b738ec0f90e551be455ab8e96684245246c718d6f28e852e7c4, grader 22; the task, env and grader_task versions are in manifest.json, the item, event and lever tables at that commit in item-classes.json (R37; `lever` per cli/classes.ts F7).

Files: trials/ and trajectories/ (the records as the batches wrote them), manifest.json, matrix.json (the grader validation matrix per task at the commit, `matrix --task <id> --out results/pilot-5a`), summary.json (`summary --write`), audit.jsonl (builder-315's clinician read, one row per trial; `audit-check` reads it), classes.json and classes.md (`classes --json` and the markdown, lever-item rows included), result-card.md (`result-card --classes classes.json`).

## Reproduce

```sh
cp -R results/pilot-5a /tmp/pilot-5a    # replay and summary --write write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/pilot-5a
pnpm cli summary /tmp/pilot-5a --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check results/pilot-5a
pnpm cli classes results/pilot-5a --json
pnpm cli lever-select results/pilot-5a
```

The judge caches hold every answer the grades ask for (0 misses, no fill); judge calls made inside the trials are in each record's `judge.cache`.
