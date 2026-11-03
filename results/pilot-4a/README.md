# pilot-4a: PW4-P1 event probe (historical once the world or a task changes, ruling R37)

Six tasks x 4 trials on v1 (4 active mid-trial events per task: 3 amend + 1 lure), claude-opus-5-5 at effort high, batch 45e735cb, $36.92 settled. Recorded at grader 18 (18/24 PASS). The current grades are the grader 22 regrade (R41, builder-304; grader 20 (#210), 21 (P21, builder-297) and 22 change no pilot-4a grade): 19/24 PASS, the same as the grader 19 regrade (#208, the S-0 fixes). The audit, the suspected grader faults, the S-0 fairness audit and the events-solve output are in classes.md; the card is result-card.md (from summary.json and classes.json).

It is pinned to:

- world ba0b02069ab423eeb28c4671bc239c4aa1ec45c28911dbb9dd21948c77ca3a86
- the task_version, env_version and grader_task_version of each task in manifest.json
- the item and event table in item-classes.json (for `pnpm cli classes` once the checkout's lists differ)

A later commit that changes the world, a task's list or its ACTIVE events does not change these records. `classes`, `result-card`, `events-solve` and `context-budget --observed-items` still read them; `replay` and `regrade` stop with the named environment-changed or world-mismatch error that points here.

## Reproduce

Reproduce commit: e6a76a6a04e4078aeb3f92ccc90ab361da0d4fdd (main after PW4-T, #207).

```sh
git worktree add ../pilot-4a-at-e6a76a6a e6a76a6a04e4078aeb3f92ccc90ab361da0d4fdd
cd ../pilot-4a-at-e6a76a6a
pnpm install --frozen-lockfile --offline
cp -R <this checkout>/results/pilot-4a /tmp/pilot-4a    # replay writes replay.json; keep the committed copy clean
pnpm cli replay /tmp/pilot-4a
pnpm cli summary /tmp/pilot-4a --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli audit-check /tmp/pilot-4a
pnpm cli classes results/pilot-4a --json
pnpm cli events-solve results/pilot-4a --req-per-event 3   # and --req-per-event 5
```

Use a copy for `replay`, `regrade` and `summary --write`, which write into the run directory.

Replay after the grader 19 regrade: #208 also moved crc-care-gap's env_version (its events.ts header, an env file). A checkout at or after #208 replays the other five tasks (20 trials). It refuses crc-care-gap with the environment-changed error above. At e6a76a6a the crc-care-gap trajectories reach their recorded states, but grader 18 disagrees with the grader 19 current grade on the 7 records the regrade changed. Before the regrade, replay at e6a76a6a reproduced 24 of 24.

The current grades are reproduced on a checkout at or after the R41 fix (grader 22):

```sh
pnpm cli regrade <copy of results/pilot-4a, regrades[] removed> --grader-version 22   # --grader-version 21 at the P21 freeze
```

Each record's regrades[] keeps the grader 19 entry (#208) and the grader 21 entry (P21) under the grader 22 one; matrix.json carries every grader_task_version a regrade used.

The judge caches already hold the grader 19 answers. classes.md describes the fill.
