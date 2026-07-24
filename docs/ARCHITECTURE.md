# Architecture

MrMackey is two cooperating subsystems, both living in this repo.

## 1. Bot service (always-on, Railway)

- **discord.js v14** gateway client. Intents: `Guilds`, `GuildMessages`, `MessageContent`.
- **Feature-request board**: a Discord **Forum Channel** — one thread per request.
- **Postgres + Prisma**: `FeatureRequest` (id, discordThreadId, guildId, opUserId, status,
  summary, githubPrNumber, timestamps) and `FeatureRequestEvent` (audit log of OP/bot
  messages only — see [FEATURE_REQUEST_LIFECYCLE.md](./FEATURE_REQUEST_LIFECYCLE.md)).
- **Triage**: on every new OP message in a tracked thread, ask Claude for a structured
  `{ready, clarifyingQuestion?, summary?}` verdict. Once ready, the OP is asked to confirm the
  generated summary or request changes — each requested change produces a revised summary and
  asks again, looping until the OP explicitly confirms. Messages from anyone other than the OP
  or the configured approver are ignored entirely — not stored, not sent to Claude.
- **Approval**: once the OP confirms, a message containing `Approved` from
  `APPROVER_DISCORD_USER_ID` (matched by Discord user ID, never username) in a
  `pending_approval` thread triggers the dev pipeline. Any other approver message is treated as
  a change request instead — it revises the summary and sends the request back to the OP to
  reconfirm before `Approved` can trigger the pipeline again.
- **Kickoff**: the bot calls GitHub's `repository_dispatch` API with the request summary.
- **HTTP layer** (Fastify): `/health` for Railway, plus a webhook receiver so GitHub
  Actions/Railway can tell the bot to post status updates back into the originating thread.

## 2. Dev automation pipeline (GitHub Actions)

- **`feature-dev.yml`**: on `repository_dispatch`, runs `anthropics/claude-code-action`
  headless with the feature summary as the prompt (governed by [`CLAUDE.md`](../CLAUDE.md)),
  opens a PR linking back to the Discord thread. Scoped to branch+PR only, never `main`.
- **`pr-ai-review.yml`**: on PR open/sync, runs an AI review pass as a first gate.
- **Human gates**: a person comments `Approved` in Discord before any code is written, and a
  person merges the PR on GitHub after reading the AI review. These two human checkpoints are
  the actual security boundary — the AI steps are gates of convenience, not trust boundaries.
- **Deploy**: Railway's GitHub integration auto-builds/deploys on merge to `main`.

## Why this order

The MVP is the pipeline itself, not the bot's eventual feature set. Once this loop works,
future features (jokes/utility commands, karma, etc.) get added _through_ the pipeline rather
than hand-coded up front.

## Security notes

Any Discord user can open a feature-request thread, and that text eventually reaches a coding
agent — treat it as untrusted/prompt-injection surface (see `CLAUDE.md`). The two human gates
above are what actually prevents an attacker-authored request from landing in production.
