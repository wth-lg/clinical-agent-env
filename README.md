# Riverbend clinical agent environment

## Quick start

Requires Node.js 22.18 or newer and pnpm.
Install [Node.js](https://nodejs.org/en/download) and [pnpm](https://pnpm.io/installation).
To see the installed versions, run `node -v` and `pnpm -v`.

Then run this one command:

`git clone https://github.com/wth-lg/clinical-agent-env && cd clinical-agent-env && pnpm start`

It installs the dependencies, builds the UI and starts the local runner, which prints the URL
of the UI (`http://127.0.0.1:<port>/clinical-agent-env/`). Open that URL and paste an Anthropic
API key. On an older Node, the command stops first and tells you which version to install.
