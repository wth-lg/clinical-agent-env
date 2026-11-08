# Instructions

This section tells you how to start the environment, run a task and read the result. There are three ways in. The local app runs on your computer and is the main surface. The hosted site at https://wth-lg.github.io/clinical-agent-env/ shows the same UI and the committed results. The command line runs a batch of trials and writes a run directory.

## Start the local app

<!-- docs-gen:block prerequisites -->

1. Open a terminal.
2. Run the command above.
3. Open the URL that the runner prints.

The command clones the repository, installs the dependencies, builds the UI and starts the local runner. The runner listens on 127.0.0.1 only and prints its URL. On an older Node, the command stops first and tells you which version to install. On Windows, use PowerShell 7, Git Bash or WSL, because Windows PowerShell 5.1 does not run `&&`. To stop the runner, press Ctrl-C. It cancels the running trials, settles their cost in the ledger and exits.

## Enter the key

1. Paste an Anthropic API key into the field under **Add an API key**.
2. Set the session spend cap if you want a lower or higher one.
3. Press **Validate**.

The runner holds the key in memory and sends it only to the Anthropic API. It writes the key to no file and to no log. The key chip in the top bar shows the key's state, and **Forget key** drops it. To look at the tasks and the committed results with no key, press **Browse the results**.

## Run a task and watch it

1. Open **Tasks** in the rail.
2. Open a task card and read its prompt, policy, chart and rubric.
3. Press **Run trial**.
4. Press **Run ×1** on the Live trial view.

The Live trial view shows the trajectory as it streams. Each tool call takes one line, and the model's reasoning is summarised. Meters show the turn, the tokens and the cost. The sizes ×3, ×10 and ×20 run a batch of that many trials under the session cap. Each size shows its projected cost as an upper bound. To cancel a running trial, press **Stop**.

## Read a trial's grade and attribution

1. Open the trial from the Live trial view, or open **Runs** and pick a trial.
2. Read the header: the outcome, the fault label, the decisive check and the reason.
3. Open the **Grading** tab for the gate checks and the rubric items.
4. Open the **Attribution** tab for the criteria table.

A trial passes when every gate check is met. Rubric items change the score and never decide a pass. The Attribution tab lists each criterion of the trial's fault with the evidence it read. The **Glossary** page in the rail gives every definition. Those definitions are rendered from `packages/core/outcomes.ts`, the one place they are written.

## Replay a trial

1. Open the trial's **State diff** tab.
2. Press **Replay**.

Replay runs the trial's tool calls again on a fresh copy of today's world, in the tab. It needs no key and makes no API call. The tab shows the recorded initial hash, the final hash, the replayed final hash and the resources the trial wrote. A trial that started from an earlier frozen world, such as a contrast CT trial of the final run, does not reproduce on today's world. For such a trial, the tab names the tag and the commit that reproduce it.

## Browse the hosted site and run a live trial there

1. Open https://wth-lg.github.io/clinical-agent-env/ in a Chromium browser such as Chrome or Brave, or in Firefox.
2. Browse Overview, Tasks, Runs, Findings, Environment and Glossary with no key.
3. To run a live trial, paste a key and press **Validate**.
4. Open a task and press **Run trial**.

On the hosted site the key stays in the tab's memory. Each call goes through a relay that we host. The relay forwards the call to the Anthropic API and keeps no copy of the key. The trial runs in a Worker in the tab through the same `run()` code path as the CLI and the local runner. If the relay cannot be reached, the page shows a red message. The message names the browsers the page needs and points to the local start command under **Run it on your computer**.

## Run from the CLI

Set `ANTHROPIC_API_KEY` in the environment, then run one of these commands from the repository root. The command below runs the final sample of trials for every task and writes the run directory.

<!-- docs-gen:block cli-command -->

To project the cost first, add `--dry-run`. To run one task, name it after `--task`. To run one trial and print its record, use `pnpm cli run-one --task <id> --model claude-opus-5-5 --json`. Every call is metered in the ledger at `~/.clinenv/spend.jsonl`. `pnpm cli spend --where` prints the ledger path, and `pnpm cli spend --check` says what the caps allow. After a run, `pnpm cli summary <run dir>` prints the pass rates, `pnpm cli replay <run dir>` checks each trial reproduces, and `pnpm cli audit-check <run dir>` checks that every failure is labelled.
