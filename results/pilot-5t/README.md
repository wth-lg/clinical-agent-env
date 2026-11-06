# pilot-5t: T3 v2 (crc-care-gap with lever item A), 8 trials

crc-care-gap v2 (R42; plan-amendment-w5 S5 as a one-item task: no set selection, freeze if 2-5 of 8, else one retune), claude-opus-5-5 at effort high, `pnpm cli run --task crc-care-gap --model claude-opus-5-5 --effort high --trials 8 --concurrency 4 --out results/pilot-5t` once, on the world that holds W5-S and T3 v2 (main 2ce2ed71), in the same sitting as results/pilot-5b.

- Batch 4ce83e11-03e4-4f75-9da9-60ba3b562674, 2026-11-06 08:38-08:46Z, 8 settled, 0 re-queued, $19.54 settled with the judge. PASS 3/8 (trials 4, 6, 7).
- Lever item A (crc-b3, Marisol Quintero's re-issued Harbor FIT): caught 8/8. The five failures are base members whose amend event fired: Koss (crc-b2, trials 0 and 5) and MacGyver (crc-o1, trials 2 and 3) got the right FIT order after the arrival, but their 3-year Observation window was never reviewed complete at the order (page one of a truncated search never paged, then narrowed re-searches): fit_orders and gap_seen_before_order, retrieval; trial 1 never fetched page two of MacGyver's laboratory results, missed her valid 2024 sDNA-FIT and ordered an unneeded kit (nothing_for_others, over_action). The clinician read is in audit.jsonl with a task-validity review.
- `pnpm cli lever-select results/pilot-5t`: {A} 0.360 in band and PASS 3/8 is 3-5 of 8: S5-2 freeze; the coordinator applies T3 v2's pre-registered rule.

Pinned to commit 2ce2ed71c50cc400f2b7cb433639dbf227b8ef0e (main after #232 W5-S and #233 T3 v2), the world in manifest.json world_hash, grader 22; the task, env and grader_task versions are in manifest.json, the item, event and lever tables at that commit in item-classes.json (R37; `lever` per cli/classes.ts F7).

Files: trials/ and trajectories/ (the records as the batch wrote them), manifest.json, matrix.json (`matrix --task crc-care-gap --out results/pilot-5t`), summary.json (`summary --write`), audit.jsonl (builder-320's clinician read, one row per trial and a task-validity review; `audit-check` reads it), classes.json and classes.md (`classes --json` and the markdown, the lever-item row included), result-card.md (`result-card --classes classes.json`).

## Reproduce

```sh
cp -R results/pilot-5t /tmp/pilot-5t    # replay and summary --write write into the run directory; keep the committed copy clean
pnpm cli replay /tmp/pilot-5t
pnpm cli summary /tmp/pilot-5t --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check results/pilot-5t
pnpm cli classes results/pilot-5t --json
pnpm cli lever-select results/pilot-5t
```

The judge caches hold every answer the grades ask for (0 misses, no fill); judge calls made inside the trials are in each record's `judge.cache`.
