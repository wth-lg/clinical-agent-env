# probe-1: historical data (ruling R37)

This run directory holds historical data. It is pinned to the world and the task versions it ran on:

- world bd1581a515a15fc85a46f0a8bb0c808a4705a9115be89f5288f1cc4053c79968
- the task_version, env_version and grader_task_version of each task in manifest.json

A later commit that rebuilds the world, or that changes a task's list, does not change these records. On such a checkout:

- `regrade` stops with `world mismatch: run at <hash>, checkout at <hash>; reproduce at the commit in results/probe-1/README.md`. `replay` stops first on the record's env_version: `environment changed: run at env_version <v>, checkout at <v>; reproduce at the commit in results/probe-1/README.md`. Neither grades the records on another world.
- `classes`, `result-card`, `events-solve` and `context-budget --observed-items` still read the records. `classes` tabulates the items the records graded and prints the note `historical run: items from records (task_version X, checkout Y)`. It takes the classes and labels from item-classes.json, the item table of each task at the reproduce commit.

## Reproduce

Reproduce commit: 1b3357eeb4d5b8f90bed7f1bf06119b21e797619 (main after #196, before any PW4-E3 world change). The world there hashes to bd1581a5. The records' current grades are their grader-17 regrades (#198).

```sh
git worktree add ../probe-1-at-1b3357ee 1b3357eeb4d5b8f90bed7f1bf06119b21e797619
cd ../probe-1-at-1b3357ee
pnpm install --frozen-lockfile --offline
cp -R <this checkout>/results/probe-1 /tmp/probe-1    # replay writes replay.json; keep the committed copy clean
pnpm cli replay /tmp/probe-1
pnpm cli summary /tmp/probe-1 --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
pnpm cli classes results/probe-1
```

Use a copy for `replay` and `summary --write`, which write into the run directory. Do not run them on the committed directory.
