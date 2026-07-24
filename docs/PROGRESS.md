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
  **Only unit tested (mocked Octokit client)** at the time it was written — merged as PR
  [#5](https://github.com/CowDotDev/ClaudeMrMackey/pull/5).
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
- **PR #9 (branch `feature/status-webhook`, not yet opened)** — the status-webhook loop back
  into Discord (original task 8): `applyStatusUpdate()` in `src/featureRequests/service.ts` is
  a small state machine (`approved → dev_in_progress → pr_open → merged → deployed`, see
  `docs/FEATURE_REQUEST_LIFECYCLE.md`) that only accepts the one valid next status, updates the
  `FeatureRequest` row (recording `githubPrNumber` on `pr_open`), and logs a `bot`
  `FeatureRequestEvent`. `POST /webhooks/status` in `src/server.ts` is the new authenticated
  (`Authorization: Bearer <STATUS_WEBHOOK_SECRET>`) Fastify route GitHub Actions/Railway will
  call, which then uses `src/discord/notify.ts` (`createDiscordNotifier`, a thin wrapper around
  `client.channels.fetch` + `.send`) to post the update into the originating thread.
  `STATUS_WEBHOOK_SECRET` is now required config; a value was generated and added to the local
  `.env` this session (it's an arbitrary shared secret, not an external credential, so safe to
  generate locally rather than needing to come from the user).

  **What this PR does _not_ do**: nothing calls this endpoint yet. `feature-dev.yml` doesn't
  `curl` it after `gh pr create`, there's no workflow reporting `merged` on PR close, and
  Railway isn't configured to call it on deploy. Wiring those emitters is separate follow-up
  work (needs the bot's public Railway URL as a new `BOT_PUBLIC_URL`-style value plus
  `STATUS_WEBHOOK_SECRET` set as both a GitHub Actions secret and a Railway env var — neither
  is set anywhere outside the local `.env` yet).

Local main is in sync with PRs #1-#3, #5, and #6. `npm run build/lint/format:check/typecheck/test`
all pass as of the last commit on `main`.

## Next up (in order)

1. **Verify the pipeline live end-to-end**: post a feature request in the Discord Forum
   Channel, get it to `pending_approval`, comment `Approved`, and confirm a `repository_dispatch`
   fires and `feature-dev.yml` runs and opens a PR. Fix whatever breaks — this has never run
   for real. `pr-ai-review.yml` won't fire during this (it's disabled, see above) — expected.
2. **Wire something to actually call `POST /webhooks/status`** now that PR #9 exists: at
   minimum, have `feature-dev.yml` `curl` it with `status: pr_open` and the PR number right
   after `gh pr create` succeeds. Needs `STATUS_WEBHOOK_SECRET` as a GitHub Actions repo secret
   and the bot's public URL known to the workflow. `merged`/`deployed` reporting (a
   PR-closed-and-merged workflow, a Railway deploy webhook) can follow once `pr_open` works.

## Known gaps / things to verify before going further

- The triage loop has not been exercised against a live Discord Forum Channel yet. Requires:
  a Forum Channel on the test server, its ID in `FEATURE_REQUEST_CHANNEL_ID`, and someone
  posting a thread while `npm run dev` is running.
- The GitHub Actions pipeline has never run against a real approved feature request.
- Nothing calls `POST /webhooks/status` yet — see PR #9 above and "Next up" step 2.
- Local dev requires Docker Desktop running (`docker compose up -d`) before `npm run dev`
  will find a database.
- **An unrelated uncommitted change was found sitting in the working tree while landing PR #9**:
  `src/ai/triage.ts` had its model changed from `claude-opus-4-8` to
  `claude-haiku-4-5-20251001` outside of any tracked commit, which fails
  `triage.test.ts` (still asserts `claude-opus-4-8`). It was left as-is (not reverted, not
  committed) since it wasn't part of this session's work and may be intentional in-progress
  work — check `git diff main -- src/ai/triage.ts` locally and either commit it (updating the
  test) or discard it.

## Environment / secrets status

Already set in the user's local `.env` (test Discord app, not production):
`DISCORD_BOT_TOKEN`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APPROVER_DISCORD_USER_ID`,
`FEATURE_REQUEST_CHANNEL_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`, `STATUS_WEBHOOK_SECRET` (this last
one generated locally this session — see PR #9 above).

Set on GitHub (confirmed this session):

- `ANTHROPIC_API_KEY` GitHub Actions repo secret (Settings → Secrets and variables → Actions) —
  separate from the local `.env` value, this is what `feature-dev.yml` and `pr-ai-review.yml`
  use.
- Claude Code GitHub App installed on the repo.
- "Allow GitHub Actions to create and approve pull requests" is on.

Still needed:

- `STATUS_WEBHOOK_SECRET` as a GitHub Actions repo secret, and the bot's public URL known to
  `feature-dev.yml` — both required before any workflow can call `POST /webhooks/status`.
- For production: the production Discord bot token (application ID `966793705124151356`), a
  `DATABASE_URL` from Railway's Postgres add-on, and a production `STATUS_WEBHOOK_SECRET` — all
  set directly in Railway's environment variables, never copied into this repo or a local
  `.env`.

Railway is already connected to this GitHub repo and auto-deploys `main`.
