# MrMackey

A Discord bot that builds itself: feature requests come in through a Discord forum channel,
Claude triages them for completeness, a human approves, a Claude coding agent implements the
change and opens a PR, an AI review runs as a first gate, and a human merges — which
auto-deploys the bot with the new feature.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/FEATURE_REQUEST_LIFECYCLE.md`](docs/FEATURE_REQUEST_LIFECYCLE.md) for the request state
machine. See [`CLAUDE.md`](CLAUDE.md) for conventions followed by both humans and the
automated dev pipeline.

## Requirements

- Node.js 24+
- A Discord application/bot token (use a **separate test application** and a private test
  server for local development — never point local dev at the production bot/server)
- Docker (for local Postgres, once the data layer lands)

## Setup

```bash
npm install
cp .env.example .env   # fill in DISCORD_BOT_TOKEN at minimum
npm run dev
```

## Scripts

| Command                                   | Purpose                                           |
| ----------------------------------------- | ------------------------------------------------- |
| `npm run dev`                             | Run the bot locally with hot reload (`tsx watch`) |
| `npm run build` / `npm start`             | Compile and run the production build              |
| `npm run lint` / `npm run lint:fix`       | ESLint                                            |
| `npm run format` / `npm run format:check` | Prettier                                          |
| `npm run typecheck`                       | `tsc --noEmit`                                    |
| `npm test` / `npm run test:watch`         | Vitest                                            |

## Status

Currently at the "basic bot connectivity" milestone (discord.js v14 client + Fastify health
check). The feature-request triage/approval/dev-automation pipeline described in the
architecture doc is in progress.
