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

## Grade at later heads

The records are graded at results-inbox grader_task_version b8cf3e9e... (the commit above); no regrades[] entry is committed. At main's head after #224 (a60a6f25...) a regrade changes nothing (verifier-phase-P17i-W5T-224-1 M1).

At the T2 rubric fix with R43 (PR #225, builder-318) the trial's judge questions changed: its two note texts are headed by exposure, and every patient-message question reads against the matters the arrivals delivered, so six of its seven judge questions are not in its record's cache, and `pnpm cli regrade` on a copy exits 1 on the first miss (key 51253a50..., the message to Walter Brennan) and writes no record. The six were asked live, three passes of `pnpm cli judge-calibrate --task results-inbox --from-trials results/smoke-w5 --misses-only` (18 calls, $0.17 settled; the coordinator's authorization of 2026-11-05), and every one was not_met in all three passes: the four messages (Walter Brennan, Leslie Parisian, Raj Patel, Carol Whitfield) name no other patient's care, and the notes contradict nothing. With those majorities in a copy's record cache, `pnpm cli regrade <copy> --grader-version 22` (grader_task_version 47bbba41...) gives results-inbox/0 FAIL, score 1.000, on `event_seen` and `amended` for the A item alone, as run: the -8 on the message to Raj Patel (seq 396) lifts, and `note_contradicts_result` is not met, because the trial first showed every arrival at turn 38, so Walter Brennan's hemolyzed-plan note (turn 26) and Raj Patel's April-2027 note (turn 33) are "written before" and their correction notes (turns 43 and 52) "written after", the shape of the oracle's own notes. Under the heading by firing turn that #225 first proposed, both stale notes would have been "after" and the trial would most likely have taken the -5 (verifier-phase-P17i-T2RUB-225-1 B1); R43 removes that. The committed record stays as run (no regrades[] entry: the live answers live in the run ledger's evidence/builder-318/smoke-fill/, not in this record's cache); a pilot graded at that head sees the fix; this smoke counts toward no rate.
