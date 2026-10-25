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
| `.gitignore` | `.vercel`, the link `vercel link` writes (see Deploy, step 2) |
| `.vercelignore` | Uploads only `api/`, `src/`, `public/` and `vercel.json` (see Static files) |
| `public/README.md` | The static output directory; its one file is never published (see Static files) |
| `test/serve-local.ts` | Test only, never deployed: `handle` behind `node:http` on 127.0.0.1 with a stub upstream |

## Rules

In the order `handle` applies them:

1. Path: exactly `/v1/messages`, else 404. A query string, even an empty one, gets 400.
2. Rate limit: each request takes a token from its client IP's bucket, else 429 with
   `retry-after`. The client IP is the one the platform sets (see Rate limit).
3. `OPTIONS` (the CORS preflight): 204 for the origin `https://wth-lg.github.io`, with
   `Access-Control-Allow-Origin: https://wth-lg.github.io`, `Vary: Origin`,
   `Access-Control-Allow-Methods: POST, OPTIONS` and `Access-Control-Allow-Headers` set to the
   headers the hosted client sends (`content-type, x-api-key, anthropic-version,
   anthropic-dangerous-direct-browser-access`). Any other origin, or none, gets 403.
4. Method: `POST`, else 405.
5. Origin: exactly `https://wth-lg.github.io`, else 403 and no upstream call. That excludes a
   missing Origin, `http://`, a suffix such as `https://wth-lg.github.io.evil.example` and other
   `github.io` origins. Only browsers are bound by it (see Who can use the relay).
6. Body: at most 4,500,000 bytes (Vercel's function body limit), else 413. It must arrive
   within 30 s, else 408, so a client that holds its body cannot keep the function running until
   `maxDuration`. It must be a JSON object with exactly one top-level `"model"` key, whose value
   is `"claude-opus-5-5"`, else 400. A second `"model"` key is refused, because the relay checks
   the last one (as `JSON.parse` does) and forwards the bytes unchanged. The relay forwards it byte for byte, so the spend
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

## Who can use the relay

The Origin lock (rule 5) only binds browsers: a browser sets `Origin` and a page cannot change it.
Any other client, such as `curl` or a script, can forge `Origin: https://wth-lg.github.io`. For
anyone outside a browser who supplies their own key, the relay is therefore an open Messages proxy.

That is acceptable, because the relay holds no key and adds no capability. A caller gets exactly
what the same key gets by calling the API directly, for one model, with the caller's own key
paying. What it can take from us is the function time and the egress of our Vercel account, and
three things bound that:

- the per-client rate limit (see Rate limit);
- the model lock: only `claude-opus-5-5` is forwarded;
- the account's spend management or usage alert (Deploy, step 5), which bounds total use.

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
`/v1/messages` takes a token, preflights and refused requests included.

The bucket key is the client address in `x-vercel-forwarded-for`, a header the platform sets. A
client cannot choose it:

- Vercel documents that it overwrites `x-forwarded-for` "to prevent IP spoofing", and that
  `x-vercel-forwarded-for` and `x-real-ip` carry the same address. Only `x-vercel-forwarded-for`
  is documented to survive a proxy in front of Vercel, so the relay reads that one
  (`CLIENT_ADDRESS_HEADER` in `src/relay.ts`).
- The relay never reads a client-sent `x-forwarded-for` or `x-real-ip`. If the platform appended
  to a client's value instead of replacing it, the relay takes the last entry, the one the
  platform added.
- Without the header (not on Vercel), every request shares one bucket.

The tests cannot show what Vercel does with a client's headers. The deployed check does:
`relay-check --rate-limit` sends a new random address in each of `x-forwarded-for`, `x-real-ip`
and `x-vercel-forwarded-for` on every request, and still requires a 429. If the platform let any
of them pick the bucket, every request would get a fresh bucket and the check would fail.

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

   The link writes `apps/relay/.vercel/`, which git ignores, and adds a `.vercel` line to
   `apps/relay/.gitignore` only if the line is missing. The committed file already has it, so
   `git status` stays clean.

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

Run both commands at an interactive terminal:

```sh
vercel remove <deployment URL> --yes
vercel project rm clinical-agent-env-relay
```

`vercel remove --yes` removes the deployment without asking. `vercel project rm` has no `--yes`:
it always asks "Are you sure?" and removes the project and every deployment under it only after a
yes. So the teardown cannot run unattended. A person at an interactive terminal runs it. Run again,
`vercel project rm` prints `No such project exists` and exits 1, which means the teardown is
complete.
