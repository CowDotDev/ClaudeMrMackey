# Progress / Where to pick back up

This file is the handoff point for a new session (human or Claude) that wasn't part of the
conversation that built this. Read this + [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) +
[`docs/FEATURE_REQUEST_LIFECYCLE.md`](FEATURE_REQUEST_LIFECYCLE.md) + [`CLAUDE.md`](../CLAUDE.md)
and you should have everything needed to continue without re-deriving context.

## Done (merged)

- **PR [#1](https://github.com/CowDotDev/ClaudeMrMackey/pull/1)** — repo scaffold (TypeScript/Node
  24, ESLint/Prettier/Husky/Vitest) + basic discord.js v14 connectivity + Fastify `/health`.
  Verified live: bot logs in, health endpoint responds.
- **PR [#2](https://github.com/CowDotDev/ClaudeMrMackey/pull/2)** — Prisma/Postgres data model
  (`FeatureRequest`, `FeatureRequestEvent`), Prisma 7's driver-adapter config, local
  docker-compose Postgres. Verified with an integration test against the real local DB.
- **PR [#3](https://github.com/CowDotDev/ClaudeMrMackey/pull/3)** — Claude-based triage loop:
  `src/ai/triage.ts` (structured-output completeness check), `src/featureRequests/service.ts`
  (the DB-backed state machine, discord.js-free and directly testable), `src/discord/featureRequests.ts`
  (the thin Discord adapter). Handles `gathering_info → pending_approval → approved`.
  **Not yet verified against a real Discord Forum Channel/thread** — only unit/integration
  tested. Do that live check before trusting the loop end-to-end.
- **PR [#5](https://github.com/CowDotDev/ClaudeMrMackey/pull/5)** — wires the actual GitHub
  `repository_dispatch` call: `src/github/dispatch.ts` (`dispatchFeatureRequest`, Octokit
  `repos.createDispatchEvent`, injectable-client pattern matching `triage.ts`), called from the
  approval branch of `handleFollowUp()` in `src/featureRequests/service.ts` _before_ the DB
  status flips to `approved` (so a failed dispatch leaves the request `pending_approval` and
  the approver can just re-comment `Approved` to retry). `GITHUB_TOKEN` / `GITHUB_REPO` are now
  required config in `src/config.ts`. The dispatch payload is
  `{ featureRequestId, discordThreadId, summary }` — `featureRequestId` is the correlation ID
  the status-webhook (PR #9, below) uses to find its way back to the right thread.
- **PR [#6](https://github.com/CowDotDev/ClaudeMrMackey/pull/6)** — the three GitHub Actions
  workflows this repo's whole pipeline depends on, all under `.github/workflows/`:
  - `feature-dev.yml` — triggers on the `feature-request-approved` `repository_dispatch` event
    fired by `dispatchFeatureRequest()`. Checks out `main`, creates a deterministic
    `feature-request/<featureRequestId>` branch, then runs `anthropics/claude-code-action@v1`
    with the request summary as the prompt (Bash tool scoped to
    `git`/`npm`/`npx`/`gh pr create` only). The prompt tells Claude to read `CLAUDE.md`, treat
    the summary as untrusted, run the four CI gates itself, then `gh pr create --base main` —
    never push to `main` directly. Includes its own Postgres service container so `npm test`
    works inside the job.
  - `pr-ai-review.yml` — on PR opened/synchronize/reopened, runs Claude read-only
    (`Read`/`Glob`/`Grep`/`git diff`/`git log` only, no write access beyond posting a PR
    comment) to flag correctness/security/scope issues per CLAUDE.md, as the first gate before
    a human merges.
  - `ci.yml` — plain `build && lint && format:check && typecheck && test` on every PR and on
    push to `main`, with a Postgres service container — this is the "known gap" flagged in
    PRs #2, #3, and #5 (`npm test` needs a reachable `DATABASE_URL` and nothing enforced that
    in CI until now).

  Two things got fixed live against the real repo while landing this PR:
  - `pr-ai-review.yml` was missing `id-token: write` in its `permissions:` block —
    `claude-code-action` needs it for the Claude Code GitHub App's token exchange regardless of
    which workflow calls it. `feature-dev.yml` already had it; ported the fix over (small
    follow-up commit on the same PR, not a separate one).
  - The [Claude Code GitHub App](https://github.com/apps/claude) had to be installed on the
    repo — the action doesn't work from workflow YAML alone. **Done**, confirmed by
    `pr-ai-review.yml` passing on PR #6 after install.

- **"Allow GitHub Actions to create and approve pull requests"** is now **on** (was the
  blocker above). `pr-ai-review.yml` is currently **manually disabled**
  (`gh workflow disable "PR AI Review"`, at the user's request) — the workflow file is
  unchanged, just turned off at the repo level. Re-enable with
  `gh workflow enable "PR AI Review"` when it's wanted again. `feature-dev.yml` and `ci.yml`
  are unaffected.
- **The pipeline has run live end-to-end for the first time**: a real Discord approval (via the
  local `npm run dev` bot) fired `repository_dispatch`, and `feature-dev.yml` implemented and
  opened **PR [#11](https://github.com/CowDotDev/ClaudeMrMackey/pull/11) "Add /roll dice
  command"** (`src/commands/roll.ts` + `src/discord/commands.ts`, 13 new tests) — merged. No
  Discord thread update happened when the PR was opened — expected at the time, since nothing
  called `POST /webhooks/status` yet (see below). Separately, a small manual commit landed
  directly on `main` (`67f02d3`, "Quick manual additions"): `package.json`'s `allowScripts` for
  the Prisma/esbuild install-script warning, and dropped `effort: 'low'` from
  `triage.ts`'s `output_config` (unsupported alongside `claude-haiku-4-5`, presumably).
- **PR [#9](https://github.com/CowDotDev/ClaudeMrMackey/pull/9)** — the status-webhook loop
  back into Discord (original task 8): `applyStatusUpdate()` in
  `src/featureRequests/service.ts` is a small state machine
  (`approved → dev_in_progress → pr_open → merged → deployed`, see
  `docs/FEATURE_REQUEST_LIFECYCLE.md`) that only accepts the one valid next status, updates the
  `FeatureRequest` row (recording `githubPrNumber` on `pr_open`), and logs a `bot`
  `FeatureRequestEvent`. `POST /webhooks/status` in `src/server.ts` is the authenticated
  (`Authorization: Bearer <STATUS_WEBHOOK_SECRET>`) Fastify route GitHub Actions/Railway call,
  which then uses `src/discord/notify.ts` (`createDiscordNotifier`) to post into the
  originating thread. `STATUS_WEBHOOK_SECRET` is now required config; a value was generated and
  added to the local `.env` this session (it's an arbitrary shared secret, not an external
  credential, so safe to generate locally).
- **PR [#10](https://github.com/CowDotDev/ClaudeMrMackey/pull/10)** — kept an unrelated
  uncommitted change found in the working tree while landing PR #9 (switched
  `triageFeatureRequest()`'s model from `claude-opus-4-8` to `claude-haiku-4-5-20251001`, per
  instruction) and updated `triage.test.ts` to match, on its own branch since it was unrelated
  to PR #9.
- **PR [#12](https://github.com/CowDotDev/ClaudeMrMackey/pull/12)** —
  `feature-dev.yml` now calls `POST /webhooks/status`: a "Report dev_in_progress status" step
  right after the branch is created, and a "Look up the opened PR" + "Report pr_open status"
  pair right after Claude's step, using `gh pr list --head <branch>` to find the PR number
  rather than trusting Claude to report it. Both report steps are gated on
  `vars.BOT_PUBLIC_URL != ''` and use `continue-on-error: true`, so until that repo variable is
  set they're a no-op (not a failure), and even once set, a webhook hiccup won't fail an
  otherwise-successful run. Deliberately **not** given to Claude as a `curl` tool — the
  PR-creation step runs with content derived from an untrusted Discord request, and handing it
  a general-purpose HTTP tool alongside `STATUS_WEBHOOK_SECRET` would be a
  prompt-injection/exfiltration risk per CLAUDE.md's untrusted-input rule. `merged`/`deployed`
  reporting (a PR-closed-and-merged workflow, a Railway deploy webhook) is still unwired.
- **PR [#13](https://github.com/CowDotDev/ClaudeMrMackey/pull/13)** — the Railway deploy went
  green and the bot came online, but it couldn't handle any messages: `ECONNREFUSED` connecting
  to Postgres. That half was a Railway dashboard fix (below), but this PR fixed the related
  code gap: changed `npm start` from `node dist/index.js` to
  `prisma migrate deploy && node dist/index.js`, since nothing was applying migrations against
  the production database (`postinstall` only runs `prisma generate`).
- **The full pipeline is now confirmed working live, end to end, including the status
  webhook.** After PR #13 merged and the Railway `DATABASE_URL` was fixed (pointed at a real
  provisioned Postgres service instead of the `.env.example` local-docker-compose default), the
  remaining bug was `BOT_PUBLIC_URL` (a GitHub Actions repo variable): it was set to
  `claudemrmackey-production.up.railway.app:8080` — missing the `https://` scheme _and_
  carrying an internal container port that has no meaning on Railway's public `*.up.railway.app`
  domain (that domain is served via Railway's edge proxy on standard 443 and maps to the
  container's port automatically; the port must never appear in the public URL). Corrected to
  `https://claudemrmackey-production.up.railway.app` via `gh variable set`. Verified live: a
  direct `curl` to `POST /webhooks/status` for the PR #14 feature request correctly rejected an
  out-of-order `pr_open` call with 409 (`dev_in_progress` hadn't landed yet, since its report
  also failed on the same bad URL), then succeeded once sent in the right order — and the
  Discord thread received both status messages. `feature-dev.yml`'s own report steps should now
  work unattended on every future run.

Local main is in sync with PRs #1-#3, #5, #6, and #9-#13. `npm run build/lint/format:check/typecheck/test`
all pass as of the last commit on `main`.

## Next up (in order)

1. **Wire `merged`/`deployed` reporting** — the only unimplemented part of the status-webhook
   loop. Needs: a new workflow (or an addition to `pr-ai-review.yml` if it gets re-enabled)
   triggered on `pull_request: closed` with `merged == true` that looks up the `FeatureRequest`
   by `githubPrNumber` (or thread through `featureRequestId` some other way — PR bodies don't
   currently embed it, worth adding) and calls `POST /webhooks/status` with `status: merged`;
   separately, a Railway deploy webhook (or small polling mechanism) to report
   `status: deployed`. Neither exists yet.
2. **Verify the `gathering_info` clarifying-question loop live** — every live run so far
   (`/roll`, this session) went straight to `pending_approval` from an already-complete
   request. The triage loop's back-and-forth (Claude asks a follow-up, OP replies, re-triages)
   has only been unit/integration tested, never exercised against a real Discord thread.
3. **Decide on `pr-ai-review.yml`** — still manually disabled at the user's request (see
   below). Re-enable with `gh workflow enable "PR AI Review"` whenever it's wanted.

## Known gaps / things to verify before going further

- **Possible duplicate bot instance risk**: unconfirmed whether Railway's `DISCORD_BOT_TOKEN`
  is the same token as local `npm run dev` — see "Environment / secrets status" below. If so,
  running both at once double-processes every message in the test server.
- `pr-ai-review.yml` is still manually disabled (`gh workflow disable`, user's request from
  earlier in this project) — `feature-dev.yml` and `ci.yml` are unaffected.
- `merged`/`deployed` status reporting doesn't exist yet — see "Next up" step 1.
- The clarifying-question half of the triage loop is unverified live — see "Next up" step 2.
- Local dev requires Docker Desktop running (`docker compose up -d`) before `npm run dev`
  will find a database.

## Environment / secrets status

Already set in the user's local `.env` (test Discord app, not production):
`DISCORD_BOT_TOKEN`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APPROVER_DISCORD_USER_ID`,
`FEATURE_REQUEST_CHANNEL_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`, `STATUS_WEBHOOK_SECRET` (this last
one generated locally this session — see PR #9 above).

Set on GitHub (confirmed this session):

- `ANTHROPIC_API_KEY` GitHub Actions repo secret (Settings → Secrets and variables → Actions) —
  separate from the local `.env` value, this is what `feature-dev.yml` and `pr-ai-review.yml`
  use.
- `STATUS_WEBHOOK_SECRET` GitHub Actions repo secret — confirmed matching whatever value
  Railway has (a direct authenticated call to the deployed bot succeeded with it).
- `BOT_PUBLIC_URL` GitHub Actions repo **variable**, correctly set to
  `https://claudemrmackey-production.up.railway.app` (no port, `https://` scheme — see PR #13
  entry above for what was wrong with it before).
- Claude Code GitHub App installed on the repo.
- "Allow GitHub Actions to create and approve pull requests" is on.

Railway (confirmed working this session): app service deployed, `DATABASE_URL` pointed at a
real provisioned Postgres service, `STATUS_WEBHOOK_SECRET` set and matching the GitHub Actions
secret above. **Open question, not yet confirmed either way**: whether Railway's
`DISCORD_BOT_TOKEN` is the same test-application token used by local `npm run dev`, or the
separate production Discord application (app ID `966793705124151356`) mentioned in earlier
sessions. If it's the _same_ token, running local dev and the Railway deployment
simultaneously means two client sessions handling every message in the test server, which
would double-process everything (duplicate DB rows, duplicate Discord replies) — worth
confirming before relying on both being up at once.

Railway is already connected to this GitHub repo and auto-deploys `main`.
