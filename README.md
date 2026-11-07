# Riverbend clinical agent environment

A synthetic clinic behind a set of typed tools, six clinical tasks with graders and reference solutions, and a runner that lets claude-opus-5-5 work them. This file holds what you need to run it. The writeup under Links has the findings.

## Quick start

No install: open https://wth-lg.github.io/clinical-agent-env/ and press Browse the results. The steps below run the environment on your computer.

Requires Node.js 22.18 or newer and pnpm. Install [Node.js](https://nodejs.org/en/download) and [pnpm](https://pnpm.io/installation). To see the installed versions, run `node -v` and `pnpm -v`.

1. Open a terminal.
2. Run `git clone https://github.com/wth-lg/clinical-agent-env && cd clinical-agent-env && pnpm start`.
3. Open the URL that the runner prints.

The command installs the dependencies, builds the UI, starts the local runner on 127.0.0.1 and prints its URL. On an older Node, the command stops first and tells you which version to install. On Windows, use PowerShell 7, Git Bash or WSL, because Windows PowerShell 5.1 does not run `&&`. To stop the runner, press Ctrl-C. It cancels the running trials, settles their cost and exits.

## Key handling

Paste an Anthropic API key into the UI and press **Validate**. The runner holds the key in memory and sends it only to api.anthropic.com. It writes the key to no file and to no log. Use a workspace key with a spend limit.

Every call is metered in a ledger at `~/.clinenv/spend.jsonl`.
<!-- docs-gen:begin caps -->
The ledger refuses a batch whose projection would take the total past $950, and it stops every call once settled spend reaches $1,000.
<!-- docs-gen:end caps -->
The runs that the UI starts are written under `~/.clinenv/runs`.

## Run from the CLI

Set `ANTHROPIC_API_KEY` in the environment, then run this command from the repository root:

```sh
pnpm cli run --task all --model claude-opus-5-5 --out results/runs/<run id>
```

Add `--dry-run` to print the projected cost and make no call. `pnpm cli spend --where` prints the ledger path.

## Links

- The writeup, with the instructions, the findings and the pass rates: [docs/writeup.html](docs/writeup.html).
- The hosted site, to browse the tasks, the results and the grading: https://wth-lg.github.io/clinical-agent-env/. Live trials there go through a relay that we host, and the key stays in your tab.
