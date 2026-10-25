# Relay

A stateless relay for the hosted site's live trials. The hosted page at
`https://wth-lg.github.io/clinical-agent-env/` sends each Messages call here, and the relay
forwards it, server to server, to the Anthropic Messages API. The browser never calls the API
directly, so a key whose organization refuses browser (CORS) access still works.

The relay holds no key of its own and has no environment variables. It reads the key from the
request's `x-api-key` header only to forward it in the same header, and it never logs, stores or
echoes the key. The source has no `console` call.

## Files

| Path | What it is |
| --- | --- |
| `src/relay.ts` | `handle(request, upstreamFetch, limiter, allowedOrigin)`: every rule below, pure |
| `src/upstream.ts` | `UPSTREAM_URL` and `upstreamFetch`: the only relay file that names the API host (lint: `no-direct-anthropic`) |
| `src/limiter.ts` | The per-client-IP token bucket |
| `api/messages.ts` | The Vercel function: `handle` with the real upstream, one limiter per instance and the origin `https://wth-lg.github.io`; any throw becomes the fixed 502 |
| `vercel.json` | Rewrites `/v1/messages` to the function; `maxDuration`; Git deployments off |
| `.vercelignore` | Uploads only `api/`, `src/`, `public/` and `vercel.json` (see Static files) |
| `public/README.md` | The static output directory; its one file is never published (see Static files) |
| `test/serve-local.ts` | Test only, never deployed: `handle` behind `node:http` on 127.0.0.1 with a stub upstream |

## Rules

In the order `handle` applies them:

1. Path: exactly `/v1/messages`, else 404. A query string, even an empty one, gets 400.
2. Rate limit: each request takes a token from its client IP's bucket, else 429 with
   `retry-after`.
3. `OPTIONS` (the CORS preflight): 204 for the origin `https://wth-lg.github.io`, with
   `Access-Control-Allow-Origin: https://wth-lg.github.io`, `Vary: Origin`,
   `Access-Control-Allow-Methods: POST, OPTIONS` and `Access-Control-Allow-Headers` set to the
   headers the hosted client sends (`content-type, x-api-key, anthropic-version,
   anthropic-dangerous-direct-browser-access`). Any other origin, or none, gets 403.
4. Method: `POST`, else 405.
5. Origin: exactly `https://wth-lg.github.io`, else 403 and no upstream call. That excludes a
   missing Origin, `http://`, a suffix such as `https://wth-lg.github.io.evil.example` and other
   `github.io` origins.
6. Body: at most 4,500,000 bytes (Vercel's function body limit), else 413. It must be JSON with
   `"model": "claude-opus-5-5"`, else 400. The relay forwards it byte for byte, so the spend
   ledger's byte-count reserve stays exact.
7. Forwarding: only `x-api-key`, `anthropic-version`, `content-type` and `anthropic-beta` (when
   sent) go upstream. `anthropic-dangerous-direct-browser-access` and every other header are
   dropped. Redirects are refused.
8. Response: the upstream status and body stream back unchanged. The relay passes on only
   `content-type`, `request-id`, `retry-after` and `anthropic-ratelimit-*`, plus the CORS headers.
   It never passes on `set-cookie`. A client abort aborts the upstream fetch.
9. Errors: if the upstream fetch fails, the client gets
   `{"type":"error","error":{"type":"relay_error"}}` with status 502. The body never includes an
   error message.

## Static files

The deployment serves the function and nothing else. Vercel's zero-config build (no framework, no
build command) serves every uploaded file outside `api/` as a static route when the project has no
`public/` directory, so `src/*.ts` would be served (Vercel CLI 64.2.0, `detectBuilders`). Two
things prevent that:

- `.vercelignore` uploads only `api/`, `src/`, `public/` and `vercel.json`. `test/` and this
  README stay local. `src/` must be uploaded, because the function imports it.
- `public/` makes the build serve only `public/`. Its one file is `README.md`, a name Vercel's
  static builder never publishes, so no file is served at all.

The function is also reachable at its own path, `/api/messages`. There `handle` answers 404,
because the path is not `/v1/messages`. `relay-check` requires a 404 for `/README.md`,
`/src/relay.ts`, `/test/serve-local.ts`, `/public/README.md`, `/vercel.json` and `/api/messages`.

## Rate limit

`src/limiter.ts` is a token bucket per client IP: 120 requests per minute by default, refilled
continuously, so the next request is allowed 0.5 s after a bucket empties. Each request on
`/v1/messages` takes a token, preflights and refused requests included. The key is the first
`x-forwarded-for` address, which Vercel sets to the client's address.

The buckets live in the function's memory, so on Vercel the limit is best effort:

- Each warm instance keeps its own buckets. A client whose requests land on several instances gets
  up to 120 per minute from each.
- A cold start resets the buckets.
- It does not bound total use from many IPs. The account's spend management or usage alert
  covers that (see Deploy, step 5).

An optional Vercel Firewall rate-limit rule on `/v1/messages` can be added in the dashboard as an
extra layer. It is never the mechanism the tests check: they check `src/limiter.ts`.

## Test locally

```sh
pnpm vitest run apps/relay cli/test/relay-check cli/test/hosted-call
pnpm build && pnpm --filter web exec playwright test --project=xbrowser relay-browser
node scripts/relay-body-max.ts
```

`relay-browser` runs the relay test page (`apps/web/relay-probe.html?relay=<url>`) against
`test/serve-local.ts`, so the browser makes a real cross-origin preflight. `relay-body-max`
prints B, the largest request body in the pilot-0 trajectories, and the longest single Messages
call. It exits 1 if B x 1.1 is not below the body limit or the longest call is not below
`maxDuration`.

## Deploy

Run every command from the repo root, logged in to the Vercel account that will own the project
(`vercel whoami`). Every step is safe to run twice. Log `vercel --version`: the notes below come
from the Vercel CLI 64.2.0 source.

The relay is deployed from the CLI only and never has a Git connection, so no push can deploy over
it. `vercel link --yes` on a project that does not exist yet creates the project and connects the
repository's `origin` remote without asking. So the project is created first, and the link only
writes `apps/relay/.vercel/`.

1. Create the project. `vercel project create` sends only the name, and an existing project
   counts as success:

   ```sh
   vercel project create clinical-agent-env-relay
   ```

2. Link `apps/relay` to it:

   ```sh
   vercel link --yes --project clinical-agent-env-relay --cwd apps/relay
   ```

3. Check that no Git repository is connected. `vercel project inspect` does not print the Git
   connection, so read the project's `link` field instead. The command exits 1 when a repository
   is connected:

   ```sh
   vercel api /v9/projects/clinical-agent-env-relay --raw \
     | node -e 'const p = JSON.parse(require("node:fs").readFileSync(0, "utf8")); if (p.link) { console.error(`Git connected: ${p.link.type} ${p.link.org}/${p.link.repo}`); process.exit(1); } console.log("no Git connection (.link absent)");'
   vercel git disconnect --yes --cwd apps/relay
   ```

   With no connection, `vercel git disconnect` prints `No Git repository connected` and exits 1,
   which is the expected result. If it exits 0, it has just removed a connection: run the
   `vercel api` check again, which must now print `.link absent`. `vercel.json` also sets
   `"git": { "deploymentEnabled": false }`.

4. Deploy to production from the CLI:

   ```sh
   vercel deploy --prod --cwd apps/relay
   ```

5. In the dashboard, enable spend management with a cap where the account's plan offers it, or a
   usage notification where it does not. Record the threshold, or the fact that the account offers
   neither, in the run's records.

6. Confirm that the project has no environment variable:

   ```sh
   vercel env ls --cwd apps/relay
   ```

7. Check the deployed relay without a key. Then check the rate limit:

   ```sh
   pnpm cli relay-check --url <RELAY_URL>
   pnpm cli relay-check --url <RELAY_URL> --rate-limit
   RELAY_URL=<RELAY_URL> pnpm --filter web exec playwright test --project=xbrowser relay-browser
   ```

   `relay-check` sends a runtime-built sentinel key, never prints it, and writes it to a 0600 temp
   file whose path it prints. Its first request is a canary (`GET /v1/messages` with
   `x-relay-canary: <nonce>`) that appears in the function logs. It also prints which of its
   requests invoke the function. For deployed mode, the relay's origin must be in
   `apps/web/relay-probe.html`'s `connect-src` (and `RELAY_PROBE_ORIGIN` in
   `apps/web/src/probe/csp.ts`).

Check these on the first deploy. The tests cannot check them without Vercel:

- After the rewrite, `handle` must see the path `/v1/messages`, not `/api/messages`. If it sees
  `/api/messages`, every relay-check request answers 404.
- Vercel's Node builder must resolve the `.ts` import specifiers in `api/messages.ts` and `src/`.
- A client disconnect must abort the request's signal (`supportsCancellation` in `vercel.json`).

## Teardown

```sh
vercel remove <deployment URL> --yes
vercel project rm clinical-agent-env-relay
```
