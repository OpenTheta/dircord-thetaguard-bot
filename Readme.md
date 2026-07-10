# ThetaGuard Discord Bot

Protects Discord servers and hands out roles based on ownership of digital
assets (NFTs) on the Theta blockchain, verified through the
[OpenTheta](https://opentheta.io) API.

A single Node.js process runs both the Discord bot (discord.js v14) and the
HTTP API consumed by the ThetaGuard frontend at `https://opentheta.io/thetaguard/`.
Data is stored in SQLite via knex (`db/ThetaGuard.db`).

> See [`docs/IMPROVEMENT_PLAN.md`](docs/IMPROVEMENT_PLAN.md) for the current
> restructuring and migration plan. **The HTTP API is a fixed contract with the
> frontend** — it is pinned by the tests in `tests/contract/`; do not change
> paths, response shapes, status codes, or error strings without coordinating
> a frontend release.

## Setup

```bash
npm install
cp .env.example .env   # then fill in DISCORD_BOT_TOKEN
npm run dev            # local development (nodemon, auto-restart)
```

Database migrations run automatically at startup (`npx knex migrate:latest`
also works manually). A database that predates migration tracking is
baselined automatically on first boot.

Environment variables are documented in [`.env.example`](.env.example).

## Scripts

| Command              | Purpose                                   |
|----------------------|-------------------------------------------|
| `npm test`           | Run contract + unit tests (vitest)        |
| `npm run test:watch` | Tests in watch mode                       |
| `npm run lint`       | ESLint                                    |
| `npm run format`     | Prettier check (`format:fix` to write)    |
| `npm run dev`        | Run with nodemon (development)            |
| `npm start`          | Run with node (production)                |

## Project structure

```
index.js               thin shim -> src/index.js
src/
  index.js             composition root: wires db, bot, api, jobs
  config.js            env parsing + validation (fails fast on boot)
  api/                 express app factory + routes (the frontend contract)
  bot/                 discord client, events, button interactions, embeds
  services/            roleSync (business rules), requestStore, openTheta
                       client, signature verification
  db/                  knex factory + per-table repositories
  jobs/                periodic full role sync
migrations/            knex migrations (additive only — see the plan doc)
tests/                 contract tests (API) + unit tests (role rules)
```

## Deployment (Docker)

```bash
./docker-run.sh
```

This backs up the database (see below), builds the image, and starts the
container with the `db/` directory mounted as a volume and `.env` passed as
the environment.

The container reports health via `GET /healthz` (200 + `botReady` flag when
the database answers, 503 otherwise); `docker ps` shows the status. The
process shuts down gracefully on SIGTERM (stops the sync loop, closes the
HTTP server, Discord client, and database). Logs are structured JSON (pino);
set `LOG_LEVEL` to adjust verbosity.

## Database backup & restore

The production data lives in a single SQLite file on the `db/` volume:
`db/ThetaGuard.db`.

The database runs in WAL mode: recent writes live in `ThetaGuard.db-wal`
until checkpointed, so the `-wal` file must always be copied together with
the `.db` file (both directions).

**Backup:** `docker-run.sh` automatically copies the file(s) to
`db/backups/ThetaGuard-<timestamp>.db[-wal]` before every deploy (the 20
most recent backups are kept). A manual backup at any time:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
cp db/ThetaGuard.db "db/backups/ThetaGuard-$STAMP.db"
[ -f db/ThetaGuard.db-wal ] && cp db/ThetaGuard.db-wal "db/backups/ThetaGuard-$STAMP.db-wal"
```

**Restore** (e.g. to roll back a bad deploy):

```bash
docker stop thetaguard-bot
cp db/backups/ThetaGuard-<timestamp>.db db/ThetaGuard.db
rm -f db/ThetaGuard.db-wal db/ThetaGuard.db-shm
[ -f db/backups/ThetaGuard-<timestamp>.db-wal ] && cp db/backups/ThetaGuard-<timestamp>.db-wal db/ThetaGuard.db-wal
docker start thetaguard-bot   # or re-run the previous image
```

Schema changes ship as additive knex migrations only (new tables / nullable
columns), so an older bot version can always run against a newer database —
rolling back the image never requires rolling back the schema, restoring the
file is only needed if data itself was damaged.

## Tests

- `tests/contract/` — characterization tests that pin the exact behavior of
  the 7 frontend-facing endpoints against a temp SQLite database and a fake
  Discord client. These are the definition of "the frontend keeps working".
- CI (GitHub Actions) runs lint + tests on every push and pull request.
