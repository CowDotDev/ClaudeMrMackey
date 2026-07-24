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

Local main is in sync with PRs #1-#3, #5, and #6. `npm run build/lint/format:check/typecheck/test`
all pass as of the last commit on `main`.

## Next up (in order)

1. **Enable Actions PR creation before triggering `feature-dev.yml` for real.**
   `gh api repos/CowDotDev/ClaudeMrMackey/actions/permissions/workflow` currently returns
   `can_approve_pull_request_reviews: false` — this is the "Allow GitHub Actions to create and
   approve pull requests" checkbox under repo Settings → Actions → General → Workflow
   permissions, and it's a hard governor independent of the `permissions:` block a workflow
   declares. With it off, `feature-dev.yml`'s `gh pr create` step will fail even though the
   workflow itself requests `pull-requests: write`. This is a repo security setting, so it
   needs a human to flip it deliberately rather than an agent doing it automatically. (The
   same check also shows `default_workflow_permissions: read`, but that only matters for
   workflows that omit an explicit `permissions:` block — all three of ours declare one, so it
   doesn't need to change.)
2. **Verify the pipeline live end-to-end**: post a feature request in the Discord Forum
   Channel, get it to `pending_approval`, comment `Approved`, and confirm a `repository_dispatch`
   fires and `feature-dev.yml` runs and opens a PR. Fix whatever breaks — this has never run
   for real. `pr-ai-review.yml` won't fire during this (see below) — that's expected for now.
3. **Status webhook loop back into Discord (original task 8).** Add a POST route to the
   existing Fastify instance in `src/server.ts` that GitHub Actions / Railway can call to
   report PR-opened / merged / deployed events, and have it post back into the originating
   Discord thread (look up by `FeatureRequest.githubPrNumber` or the `featureRequestId`
   correlation ID already included in the dispatch payload — see PR #5 above).

## Known gaps / things to verify before going further

- `pr-ai-review.yml` is **manually disabled** (`gh workflow disable "PR AI Review"`, at the
  user's request) — the workflow file is unchanged and still in `.github/workflows/`, it's just
  turned off at the repo level for now. Re-enable with `gh workflow enable "PR AI Review"` (or
  Actions tab → PR AI Review → "Enable workflow") when it's wanted again. `feature-dev.yml` and
  `ci.yml` are unaffected and still active.
- The triage loop has not been exercised against a live Discord Forum Channel yet. Requires:
  a Forum Channel on the test server, its ID in `FEATURE_REQUEST_CHANNEL_ID`, and someone
  posting a thread while `npm run dev` is running.
- The GitHub Actions pipeline has never run against a real approved feature request — see step
  1 above (the PR-creation permission blocker) before attempting it.
- Local dev requires Docker Desktop running (`docker compose up -d`) before `npm run dev`
  will find a database.

## Environment / secrets status

Already set in the user's local `.env` (test Discord app, not production):
`DISCORD_BOT_TOKEN`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APPROVER_DISCORD_USER_ID`,
`FEATURE_REQUEST_CHANNEL_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`.

Set on GitHub (confirmed this session):

- `ANTHROPIC_API_KEY` GitHub Actions repo secret (Settings → Secrets and variables → Actions) —
  separate from the local `.env` value, this is what `feature-dev.yml` and `pr-ai-review.yml`
  use.
- Claude Code GitHub App installed on the repo.

Still needed:

- Flip "Allow GitHub Actions to create and approve pull requests" on (see "Next up" step 1) —
  confirmed still off as of this session.
- For production: the production Discord bot token (application ID `966793705124151356`) and a
  `DATABASE_URL` from Railway's Postgres add-on, both set directly in Railway's environment
  variables — never copied into this repo or a local `.env`.

Railway is already connected to this GitHub repo and auto-deploys `main`.
