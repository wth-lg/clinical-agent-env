# pilot-5b: W5-P2, the three changed W5 tasks on their selected lever sets, 8 trials each

results-inbox {B}, discharge-medrec {B} and message-queue {A} (plan-amendment-w5.md W5-S selection, decisions.tsv 2026-11-05T20:54Z S5-2 and ruling R44; renal-dose-review froze on v2 {A,B} with no pilot-5b), claude-opus-5-5 at effort high, `pnpm cli run --task results-inbox,discharge-medrec,message-queue --model claude-opus-5-5 --effort high --trials 8 --concurrency 4 --out results/pilot-5b` once, on the world that holds W5-S and T3 v2 (main 2ce2ed71).

- Batch 0cb09a90-df5e-4110-bf9f-16539887acf3, 2026-11-06 08:15-08:38Z, 24 settled, 0 re-queued, $37.90 settled. PASS: results-inbox 7/8, discharge-medrec 8/8, message-queue 1/8.
- Lever items (passed/observed): T2 B 8/8; T4 B 8/8; T6 A 1/8 (the 7 fails are the panel report dr-00602 never exposed, retrieval, as in pilot-5a). results-inbox's one failure is its base item nodule_scheduled (the screening LDCT never read before the nodule order, as in pilot-5a batch 1); 4 of its 7 passes carry the judged penalty reply_names_other_patient on a message to Parisian about his own naproxen (judge false positives, listed for P23, not regraded; PASS stands, score 0).
- `pnpm cli lever-select results/pilot-5b` on the selected sets: results-inbox {B} 0.720 and discharge-medrec {B} 0.810 above the band (S5-2 reserve), message-queue {A} 0.180 below (S5-3); the coordinator applies S5-4 and S5-5.

Pinned to commit 2ce2ed71c50cc400f2b7cb433639dbf227b8ef0e (main after #232 W5-S and #233 T3 v2), the world in manifest.json world_hash, grader 22; the task, env and grader_task versions are in manifest.json, the item, event and lever tables at that commit in item-classes.json (R37; `lever` per cli/classes.ts F7).

Files: trials/ and trajectories/ (the records as the batch wrote them), manifest.json, matrix.json (the grader validation matrix per task at the commit, `matrix --task <id> --out results/pilot-5b`), summary.json (`summary --write`), audit.jsonl (builder-320's clinician read, one row per trial and a task-validity review for message-queue; `audit-check` reads it), classes.json and classes.md (`classes --json` and the markdown, lever-item rows included), result-card.md (`result-card --classes classes.json`).

## Reproduce

```sh
cp -R results/pilot-5b /tmp/pilot-5b    # replay and summary --write write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/pilot-5b
pnpm cli summary /tmp/pilot-5b --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check results/pilot-5b
pnpm cli classes results/pilot-5b --json
pnpm cli lever-select results/pilot-5b
```

The judge caches hold every answer the grades ask for (0 misses, no fill); judge calls made inside the trials are in each record's `judge.cache`.
