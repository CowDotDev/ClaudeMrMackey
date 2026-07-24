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
- **PR #5 (branch `feature/github-dispatch`, not yet opened)** — wires the actual GitHub
  `repository_dispatch` call: `src/github/dispatch.ts` (`dispatchFeatureRequest`, Octokit
  `repos.createDispatchEvent`, injectable-client pattern matching `triage.ts`), called from the
  approval branch of `handleFollowUp()` in `src/featureRequests/service.ts` _before_ the DB
  status flips to `approved` (so a failed dispatch leaves the request `pending_approval` and
  the approver can just re-comment `Approved` to retry). `GITHUB_TOKEN` / `GITHUB_REPO` are now
  required config in `src/config.ts`. The dispatch payload is
  `{ featureRequestId, discordThreadId, summary }` — `featureRequestId` is the correlation ID
  the future status-webhook (step 3 below) should use to find its way back to the right thread.
  **Only unit tested (mocked Octokit client)** — no real GitHub App/PAT with `repository_dispatch`
  permission has fired this against the actual repo yet, and there's no listener for the event
  until `feature-dev.yml` (step 2 below) exists, so nothing will visibly happen when it fires.

Local main is in sync with PRs #1-#3. `npm run build/lint/format:check/typecheck/test`
all pass as of the last commit on `main`; the same gates pass on `feature/github-dispatch`.

## Next up (in order)

1. **Open the PR for `feature/github-dispatch`** (this session's work, described above) and get
   it merged.
2. **GitHub Actions: `feature-dev.yml` + `pr-ai-review.yml`.** `feature-dev.yml` triggers on
   `repository_dispatch`, runs `anthropics/claude-code-action` headless against the request
   summary, opens a PR (branch + PR only — never `main`). `pr-ai-review.yml` runs an AI review
   pass on PR open/sync as the first gate. See `docs/ARCHITECTURE.md` → "Dev automation
   pipeline" for the design.
   - **Also add here:** a plain CI workflow (build/lint/typecheck/test on every PR) with a
     **Postgres service container** — `npm test` currently requires a reachable
     `DATABASE_URL` (the `src/db/client.test.ts` and `src/featureRequests/service.test.ts`
     integration tests hit a real DB) and there is no CI enforcing this yet. This was flagged
     as a known gap in PRs #2 and #3.
3. **Status webhook loop back into Discord (original task 8).** Add a POST route to the
   existing Fastify instance in `src/server.ts` that GitHub Actions / Railway can call to
   report PR-opened / merged / deployed events, and have it post back into the originating
   Discord thread (look up by `FeatureRequest.githubPrNumber` or the `featureRequestId`
   correlation ID already included in the dispatch payload — see PR #5 above).

## Known gaps / things to verify before going further

- The triage loop has not been exercised against a live Discord Forum Channel yet. Requires:
  a Forum Channel on the test server, its ID in `FEATURE_REQUEST_CHANNEL_ID`, and someone
  posting a thread while `npm run dev` is running.
- No CI Postgres service container yet (see step 2 above) — don't assume GitHub Actions can
  run `npm test` until that's added.
- Local dev requires Docker Desktop running (`docker compose up -d`) before `npm run dev`
  will find a database.

## Environment / secrets status

Already set in the user's local `.env` (test Discord app, not production):
`DISCORD_BOT_TOKEN`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APPROVER_DISCORD_USER_ID`,
`FEATURE_REQUEST_CHANNEL_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`.

Still needed for production: the production Discord bot token (application ID
`966793705124151356`) and a `DATABASE_URL` from Railway's Postgres add-on, both set directly
in Railway's environment variables — never copied into this repo or a local `.env`.

Railway is already connected to this GitHub repo and auto-deploys `main`.
