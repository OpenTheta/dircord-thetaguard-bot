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
npx knex migrate:latest
npm run dev            # local development (nodemon)
```

Environment variables are documented in [`.env.example`](.env.example).

## Scripts

| Command              | Purpose                                   |
|----------------------|-------------------------------------------|
| `npm test`           | Run contract + unit tests (vitest)        |
| `npm run test:watch` | Tests in watch mode                       |
| `npm run lint`       | ESLint                                    |
| `npm run format`     | Prettier check (`format:fix` to write)    |
| `npm start`          | Run with nodemon (development)            |
| `npm run start:prod` | Run with node (production)                |

## Deployment (Docker)

```bash
./docker-run.sh
```

This backs up the database (see below), builds the image, and starts the
container with the `db/` directory mounted as a volume and `.env` passed as
the environment.

## Database backup & restore

The production data lives in a single SQLite file on the `db/` volume:
`db/ThetaGuard.db`.

**Backup:** `docker-run.sh` automatically copies the file to
`db/backups/ThetaGuard-<timestamp>.db` before every deploy (the 20 most
recent backups are kept). A manual backup at any time:

```bash
cp db/ThetaGuard.db "db/backups/ThetaGuard-$(date +%Y%m%d-%H%M%S).db"
```

**Restore** (e.g. to roll back a bad deploy):

```bash
docker stop thetaguard-bot
cp db/backups/ThetaGuard-<timestamp>.db db/ThetaGuard.db
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
