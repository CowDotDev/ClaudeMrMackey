# MrMackey

A Discord bot that builds itself: feature requests come in through a Discord forum channel,
Claude triages them for completeness, a human approves, a Claude coding agent implements the
change and opens a PR, an AI review runs as a first gate, and a human merges — which
auto-deploys the bot with the new feature.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design,
[`docs/FEATURE_REQUEST_LIFECYCLE.md`](docs/FEATURE_REQUEST_LIFECYCLE.md) for the request state
machine, and [`docs/PROGRESS.md`](docs/PROGRESS.md) for what's built, what's next, and known
gaps — read that one first if you're picking this up in a new session. See
[`CLAUDE.md`](CLAUDE.md) for conventions followed by both humans and the automated dev
pipeline.

## Requirements

- Node.js 24+
- A Discord application/bot token (use a **separate test application** and a private test
  server for local development — never point local dev at the production bot/server)
- Docker (for local Postgres)

## Setup

```bash
npm install                # also runs `prisma generate` via postinstall
docker compose up -d       # starts local Postgres
cp .env.example .env       # fill in DISCORD_BOT_TOKEN, ANTHROPIC_API_KEY, FEATURE_REQUEST_CHANNEL_ID,
                            # and APPROVER_DISCORD_USER_ID; DATABASE_URL default matches docker-compose
npm run db:migrate         # applies prisma/migrations to your local Postgres
npm run dev
```

`FEATURE_REQUEST_CHANNEL_ID` must be a **Forum Channel** on your test server - one thread per
feature request. The bot only reacts to threads under that channel.

## Scripts

| Command                                   | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `npm run dev`                             | Run the bot locally with hot reload (`tsx watch`)      |
| `npm run build` / `npm start`             | Compile and run the production build                   |
| `npm run lint` / `npm run lint:fix`       | ESLint                                                 |
| `npm run format` / `npm run format:check` | Prettier                                               |
| `npm run typecheck`                       | `tsc --noEmit`                                         |
| `npm test` / `npm run test:watch`         | Vitest                                                 |
| `npm run db:migrate`                      | Create/apply a Prisma migration against `DATABASE_URL` |
| `npm run db:studio`                       | Open Prisma Studio to inspect local data               |

## Status

See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the current build status and next steps.
