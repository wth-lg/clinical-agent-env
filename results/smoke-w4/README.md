# smoke-w4: PW4-T live smoke (not counted)

Two live trials of discharge-medrec (claude-opus-5-5, effort high) with its four active mid-trial events (kim-k1, kim-d2, stark-s1, roberts-r1). The smoke shows that arrivals reach a live model before pilot-4a spends. It is not a pilot and its trials count toward no pass rate.

Run at commit 45f63a4762d46d9a7b0b2c76d1b5ecca9c723335 (env_version 7e533371..., grader f6e2bc18...). Batch 24fc1d5a, $2.32 settled. Both trials PASS with score 1.000. Each trial saw all four arrivals in list_inbox, and every env_event agrees with replay.

## Reproduce

```sh
git worktree add ../smoke-w4-at-45f63a47 45f63a4762d46d9a7b0b2c76d1b5ecca9c723335
cd ../smoke-w4-at-45f63a47
pnpm install --frozen-lockfile --offline
cp -R <this checkout>/results/smoke-w4 /tmp/smoke-w4    # replay writes replay.json; keep the committed copy clean
pnpm cli replay /tmp/smoke-w4
pnpm cli summary /tmp/smoke-w4 --require env_error_raw=0,env_limit=0,model=claude-opus-5-5
```

A later world or task change makes this run historical (ruling R37): replay then stops with the named environment-changed error that points here.
