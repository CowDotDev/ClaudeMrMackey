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
- **PR #12 (branch `feature/report-status-webhook-calls`, not yet opened)** —
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
- **PR #13 (branch `fix/prod-migrate-deploy`, not yet opened)** — the Railway deploy went
  green and the bot came online, but it couldn't handle any messages: `ECONNREFUSED` connecting
  to Postgres (see "Next up" below for the full diagnosis and fix — this PR is only the
  code-side half of it). Changed `npm start` from `node dist/index.js` to
  `prisma migrate deploy && node dist/index.js`, since nothing was applying migrations against
  the production database (`postinstall` only runs `prisma generate`) — even after Railway's
  `DATABASE_URL` is fixed, the schema wouldn't exist without this.

Local main is in sync with PRs #1-#3, #5, #6, and #9-#12. `npm run build/lint/format:check/typecheck/test`
all pass as of the last commit on `main`.

## Next up (in order)

1. **Fix Railway's `DATABASE_URL`.** The Railway app deploy went green and the bot shows
   online, but every message handler call fails: `ECONNREFUSED` on
   `prisma.featureRequest.create()` — the app can't reach a Postgres server at all (TCP
   connection refused, not a missing-table/auth error). Add a Postgres service in the Railway
   project (**+ New → Database → Add PostgreSQL**) if one doesn't exist yet, then set the app
   service's `DATABASE_URL` variable to reference it (Railway's "Add Reference" picker, e.g.
   `${{Postgres.DATABASE_URL}}`) rather than a hardcoded value — it was very likely still the
   `.env.example` local-docker-compose default (`localhost:5432`, meaningless inside Railway's
   container). PR #13 (below) makes `npm start` run `prisma migrate deploy` first, so once
   connectivity is fixed the schema should apply automatically on next deploy — no separate
   migration step needed.
2. **Get the bot's Railway public URL** once it's actually working end-to-end (DB connected,
   confirm by posting in the Forum Channel and getting a reply). Needed for step 3.
3. **Set `BOT_PUBLIC_URL` as a GitHub Actions repo _variable_** (Settings → Secrets and
   variables → Actions → Variables tab, not Secrets — it's not sensitive) to the URL from step
   2, **and** `STATUS_WEBHOOK_SECRET` as a GitHub Actions repo _secret_ matching whatever value
   Railway has for it. This turns on the `dev_in_progress`/`pr_open` reporting already wired in
   `feature-dev.yml` (PR #12).
4. **Verify live**: approve a feature request, confirm the thread gets a "Development has
   started..." message and then a PR link, matching `applyStatusUpdate()`'s messages in
   `src/featureRequests/service.ts`.
5. **Wire `merged`/`deployed` reporting**: a new workflow (or an addition to `pr-ai-review.yml`
   if it gets re-enabled) triggered on `pull_request: closed` with `merged == true` to report
   `status: merged`; a Railway deploy webhook (or a small polling/webhook mechanism) to report
   `status: deployed`. Neither exists yet.

## Known gaps / things to verify before going further

- The triage loop has not been exercised against a live Discord Forum Channel yet in the sense
  of `gathering_info` → clarifying questions — the one live run so far went straight through
  from an already-complete request. Worth confirming the clarifying-question loop separately.
- Nothing calls `POST /webhooks/status` in production yet — blocked on the Railway `DATABASE_URL`
  fix, see "Next up" steps 1-4.
- The Railway deployment is currently broken (see "Next up" step 1) — the bot connects to
  Discord fine but can't reach Postgres, so it silently fails every message it tries to handle
  (errors only visible in Railway's logs, nothing surfaces back to Discord since
  `registerFeatureRequestHandlers()` in `src/discord/featureRequests.ts` only `console.error`s
  on failure by design — a thrown DB error shouldn't become a confusing reply to the user).
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
- Claude Code GitHub App installed on the repo.
- "Allow GitHub Actions to create and approve pull requests" is on.

Still needed (see "Next up" above):

- The bot deployed to Railway with a public URL — nothing has been deployed there yet as far as
  this session could tell.
- `BOT_PUBLIC_URL` as a GitHub Actions repo **variable** (not secret) and `STATUS_WEBHOOK_SECRET`
  as a GitHub Actions repo **secret**, once the URL exists.
- For production: the production Discord bot token (application ID `966793705124151356`), a
  `DATABASE_URL` from Railway's Postgres add-on, and a production `STATUS_WEBHOOK_SECRET` — all
  set directly in Railway's environment variables, never copied into this repo or a local
  `.env`. The Railway `STATUS_WEBHOOK_SECRET` value and the GitHub Actions secret of the same
  name (above) must match — that's how `feature-dev.yml` authenticates to the deployed bot.

Railway is already connected to this GitHub repo and auto-deploys `main`.
