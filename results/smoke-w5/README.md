# smoke-w5: W5-T live smoke (not counted)

One live trial of each W5 lever task (renal-dose-review, results-inbox, discharge-medrec, message-queue; claude-opus-5-5, effort high) at LEVER {A, B}. The smoke shows that each A arrival reaches a live model with its sibling filed silently before pilot-5a spends. It is not a pilot and its trials count toward no pass rate.

Run at commit fc57d2fae3d7b72549113c56cd0a746ea894393a. Batch a1eb7156-c518-48e3-a9ad-da5cc3505184, $6.89 settled, 4 of 4 settled, 0 re-queued. Outcomes: renal-dose-review PASS 1.000; results-inbox, discharge-medrec and message-queue FAIL, each on its A item alone, `event_seen` as retrieval (the silent sibling never shown; results-inbox also lost the judged reply_names_other_patient penalty on its message to Raj Patel, a judge false positive: the message's 'not on your 2025 scan' cites the comparison LDCT of 2025-04-08 his screening report and the addendum both name). In every trial the A arrival fired (`env_event`) and its inbox Task was listed by a later list_inbox; the sibling never appeared in any list_inbox result; the renal-dose-review trial exposed the sibling by an Observation search by patient and date, and a replay of each trial to its final state lists the sibling under the search route the policy names (by code, and by date) while list_inbox does not. summary --require env_error_raw=0,env_limit=0,model=claude-opus-5-5 and replay (4 of 4 reproduced, so every env_event agrees with replay) exit 0.

## Reproduce

```sh
git worktree add ../smoke-w5-at-fc57d2fa fc57d2fae3d7b72549113c56cd0a746ea894393a
cd ../smoke-w5-at-fc57d2fa
pnpm install --frozen-lockfile --offline
cp -R <this checkout>/results/smoke-w5 /tmp/smoke-w5    # replay writes replay.json; keep the committed copy clean
pnpm cli replay /tmp/smoke-w5
pnpm cli summary /tmp/smoke-w5 --require env_error_raw=0,env_limit=0,model=claude-opus-5-5,replay=all
```

A later world or task change makes this run historical (ruling R37): replay then stops with the named environment-changed error that points here.
