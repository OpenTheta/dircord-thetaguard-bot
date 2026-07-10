# ThetaGuard Bot — Restructure & Migration Plan

Status: complete — all phases (0 safety net, 1 hygiene, 2 restructure, 3 database layer, 4 reliability & security, 5 modernization) implemented
Last updated: 2026-07-10

This document describes the strategy and step-by-step implementation plan for
modernizing this repository. It is written around two hard constraints:

1. **The frontend is fixed** (lives in a separate repo). The HTTP API this bot
   exposes — paths, request bodies, response shapes, and status codes — must
   not change.
2. **The bot runs in production with live data.** The SQLite database
   (`db/ThetaGuard.db`, mounted as a Docker volume) must keep working. All
   schema changes must be additive and backward compatible; no destructive
   migrations, no data re-import.

Everything else (file layout, internals, tooling, dead code, dependencies) is
fair game.

---

## 1. Current state assessment

### 1.1 What the app does

A single Node.js process that runs two things side by side:

- **Express API** (`src/server.js`) consumed by the fixed frontend at
  `https://opentheta.io/thetaguard/`:

  | Method | Path                    | Purpose                                        |
  |--------|-------------------------|------------------------------------------------|
  | GET    | `/:requestId`           | Fetch a pending user verification session      |
  | POST   | `/signed`               | Verify a wallet signature, store the wallet    |
  | POST   | `/verifyserver`         | Link a verified wallet to a guild, sync roles  |
  | POST   | `/disconnect`           | Unlink a wallet from a guild, sync roles       |
  | GET    | `/myserver/:requestId`  | Fetch admin session + guild roles              |
  | POST   | `/newrole`              | Create/update a token-gated role rule          |
  | POST   | `/deleterole`           | Delete a role rule                             |

- **Discord bot** (`src/discord-bot.js`) using discord.js v14: creates
  `thetaguard-config` / `thetaguard-verify` channels on guild join, issues
  short-lived verification links via buttons, and assigns/removes Discord
  roles based on NFT ownership fetched from the OpenTheta API
  (`API_BASE_URL`, default `https://api.opentheta.io/v1/`).

- **Background sync** (`src/backend.js`): every 5 minutes re-checks every
  guild/role/user combination and reconciles Discord roles.

Shared state between the two halves:

- `USER_REQUESTS` / `ADMIN_REQUESTS`: in-memory maps of pending verification
  sessions (20-minute TTL), keyed by a random 12-char `requestId`.
- `global.client`: the discord.js client as a global variable, referenced
  directly from the Express routes.
- SQLite via knex (`models/dbHelpers.js`), 4 tables: `guilds`, `roles`,
  `wallets`, `users` (single migration from 2023).

### 1.2 Problems found (ranked)

**Correctness / bugs**

- `database.getGuildRole(roleId)` takes one argument, but `server.js`
  (`POST /newrole`) calls it as `getGuildRole(newRole.guildId, newRole.roleId)`
  — the second argument is silently ignored. Works only because `roleId` is
  globally unique.
- `setGuildRolesForUsersByContract` (backend of the by-contract sync) reads
  `owner.wallet` where the OpenTheta API returns `owner.address` — the
  function is currently dead code, which is the only reason this bug is
  invisible.
- `models/dbHelpers.js` defines `updateGuild` but never exports it.
- `GET /myserver/:requestId` and `POST /newrole` / `POST /deleterole` mutate
  the shared `ADMIN_REQUESTS[requestId]` object when attaching `setRoles` /
  `allRoles`, so session objects accumulate response payload state.
- `requestId` is generated with `Math.random()` — not cryptographically
  secure for what is effectively a bearer token to a verification session.
- `client.on('guildDelete')` deletes the guild row first; the roles cascade
  (`onDelete CASCADE`) already removes them, then the code loops and deletes
  roles again — harmless but confused, and it relies on
  `PRAGMA foreign_key = ON` which is misspelled in `knexfile.js`
  (must be `foreign_keys`), so **cascades are actually OFF in production**.
- Pending verification sessions live only in memory: any restart/redeploy
  invalidates every link users are mid-flow on.

**Operational / security**

- Node 18 base image (EOL since April 2025).
- `nodemon` is a production dependency and `npm start` uses it.
- No `helmet`, no rate limiting, CORS `*` on an API that mutates roles.
- No graceful shutdown (SIGTERM kills mid-write; Docker `restart` makes this
  routine).
- No health endpoint for the container/orchestrator.
- No automated migration on startup — schema changes require manual steps.
- No backups of the SQLite volume.
- `console.log` everywhere; no structured logs, no levels.
- `MessageContent` privileged intent is required only for the `!reload` text
  command.
- Discriminators (`username#1234`) are deprecated by Discord; new users are
  `#0`.

**Code health**

- Roughly half of every file is commented-out dead code (old route versions,
  old sync loop, `id.json` event-cursor logic that is no longer used).
- `global.client` couples every module to a global.
- No tests, no linter, no CI, no `.env.example`, empty `Readme.md`.
- `knexfile.js` only has a `development` block that is used in production.
- Repeated copy-paste blocks (embed building, owner-merging across wallets,
  `allRoles` filtering) with drift between copies (e.g. `/myserver` filters
  by bot role position, `/newrole` and `/deleterole` do not).

---

## 2. Strategy

### 2.1 Guiding principles

1. **Pin the contract first, refactor second.** Before touching internals,
   write characterization tests that lock the exact JSON responses and status
   codes of all seven endpoints (using supertest against the Express app with
   a mocked discord.js client and a seeded temp SQLite file). These tests are
   the definition of "the frontend keeps working".
2. **The database file is the interface to production.** Keep SQLite + knex.
   Never edit the 2023 migration — it is history shared with production. All
   changes ship as new, additive migration files, run automatically at boot.
3. **Restructure by moving, not rewriting.** The role-sync logic encodes real
   business rules (trait matching, multi-wallet merging, market listings).
   Move it into modules verbatim first, then improve it under test.
4. **Ship in small, individually deployable phases.** Every phase ends with
   the characterization tests green and a deployable image. If a deploy goes
   wrong, rollback = previous image + restore the pre-deploy DB file copy.

### 2.2 Target architecture

Same single process, same deployment model (Docker + `db/` volume), but
modular and testable:

```
src/
  index.js               # composition root: wires db, bot, api, jobs; graceful shutdown
  config.js              # env parsing + validation in one place (fail fast on boot)
  api/
    app.js               # express app factory: createApp({ db, requestStore, roleSync, client })
    routes/
      user.routes.js     # GET /:requestId, POST /signed, /verifyserver, /disconnect
      admin.routes.js    # GET /myserver/:requestId, POST /newrole, /deleterole
    middleware.js         # cors, json, error handler, rate limit, request logging
  bot/
    client.js            # createClient(); no more global.client
    events/              # guildCreate, guildDelete, interactionCreate, ready
    interactions/        # letsGo + setupRoles button handlers, /reload slash command
    embeds.js            # shared embed/button builders (single copy)
  services/
    requestStore.js      # USER_REQUESTS / ADMIN_REQUESTS behind an interface (+ TTL)
    openTheta.js         # OpenTheta API client: base URL, UA header, timeout, retry
    roleSync.js          # setUserRole / setRolesForUser / setRoleForGuildUsers / full sync
    verification.js      # sign-message building + ethers signature check
  db/
    knex.js              # knex instance from knexfile by NODE_ENV
    repositories/        # guilds.js, roles.js, users.js, wallets.js (from dbHelpers)
  jobs/
    fullSync.js          # the 5-minute reconcile loop (interval configurable)
migrations/              # existing 2023 file untouched + new additive files
tests/
  contract/              # characterization tests for the 7 endpoints (the frontend contract)
  unit/                  # roleSync eligibility rules, requestStore TTL, verification
```

Key decisions:

- **Keep SQLite.** The data volume is tiny (guild/role/user rows), the write
  rate is low, and a single process is the natural fit. A Postgres move buys
  nothing today and adds a data-migration risk this plan is designed to
  avoid. Knex keeps the door open if that ever changes.
- **Keep the in-process Express + bot pairing.** The API needs the live
  Discord client (`/myserver` reads `guild.roles` from the gateway cache);
  splitting them into services would force an RPC layer for no gain.
- **Dependency injection instead of `global.client`**: the app factory and
  services take the client as a parameter. Contract tests then run with a
  fake client, no gateway connection needed.
- **Persist pending requests (additive DB table)** so restarts don't kill
  in-flight verifications. The in-memory map stays as a read-through cache;
  API behavior (404 on unknown/expired id) is unchanged.

### 2.3 Database migration & compatibility strategy

Production reality: `db/ThetaGuard.db` was created by the single 2023
migration, so a `knex_migrations` table should exist with exactly one row.
The plan handles both cases:

1. **Baseline guard (one-time, in code):** at boot, before `migrate:latest`,
   check whether the schema exists but `knex_migrations` does not (i.e. the
   DB was created by hand). If so, insert the baseline row for
   `20230306124539_thetaguard-table.js` so knex never tries to re-create
   existing tables. This makes startup migration safe on any copy of the
   production file.
2. **Automatic migrations at boot:** `await knex.migrate.latest()` in
   `index.js` before the server listens. Deploys become atomic: new image =
   new schema.
3. **Additive-only rules for every new migration:**
   - new tables and new nullable/defaulted columns only;
   - never rename or drop columns/tables while any deployed version reads
     them;
   - never edit an already-shipped migration file.
4. **Planned new migrations** (each independently optional):
   - `pending_requests` table (`requestId` PK, `type` user/admin, `payload`
     JSON, `expiresAt`) — restart-safe verification sessions;
   - `createdAt`/`updatedAt` on `users` and `wallets` (nullable, no
     backfill required) — debuggability;
   - fix the `PRAGMA foreign_keys` typo in `knexfile.js` (config change, not
     schema) and verify no orphaned rows exist first, since cascades have
     been off: ship a data-cleanup migration that deletes orphaned `roles` /
     `users` rows *only after logging counts*, guarded to be a no-op when
     clean.
5. **Backups:** `docker-run.sh` (and any deploy script) copies
   `db/ThetaGuard.db` to `db/backups/ThetaGuard-<timestamp>.db` before
   starting the new container. SQLite also gets `PRAGMA journal_mode = WAL`
   and `busy_timeout` for crash safety under concurrent reads.
6. **Rollback:** previous image + restore the pre-deploy copy. Because all
   migrations are additive, an old binary can also run against a newer schema
   (it just ignores new columns/tables), which makes partial rollbacks safe.

### 2.4 API compatibility strategy

- Contract tests assert, for each endpoint: happy-path JSON shape (exact
  keys), the specific error bodies (`{"error": "requestId does not exist"}`
  vs `"requestId does not exists"` — yes, both spellings exist and **must be
  preserved verbatim**, the frontend may match on them), and status codes
  (including the current use of 404 for validation failures and 400 for
  wrong signatures).
- CORS stays permissive (`*`) since the frontend origin is a different host;
  hardening narrows it to the known frontend origins via env var, defaulting
  to current behavior.
- New endpoints are allowed (they don't break a fixed frontend): a
  `GET /healthz` route registered *before* the `GET /:requestId` catch-all.
  (Route order matters: `/:requestId` is a root-level catch-all; all fixed
  paths must be registered before it, which is already how `/myserver/:id`
  survives today.)

---

## 3. Implementation plan

Phases are ordered; each is a separate PR and a separate deploy. Effort is a
rough guide (S ≤ half day, M ≈ 1 day, L ≈ 2–3 days).

### Phase 0 — Safety net (L) *— do this before touching anything else*

1. Add dev tooling: `vitest` (or jest) + `supertest`, `eslint` + `prettier`,
   `.editorconfig`, `.env.example` documenting `DISCORD_BOT_TOKEN`, `PORT`,
   `API_BASE_URL`.
2. Write **contract tests** for all 7 endpoints against the current
   `server.js`, with a stubbed `global.client` and a temp SQLite DB seeded
   through the existing migration. Snapshot exact bodies/status codes.
3. Add GitHub Actions CI: install, lint, test on every PR.
4. Add DB backup step to `docker-run.sh` + document the restore procedure in
   the Readme.
5. Deliverable: no production code changed; red/green harness exists.

### Phase 1 — Hygiene & low-risk fixes (M)

1. Delete all commented-out dead code (`index.js`, `server.js`,
   `discord-bot.js`, `backend.js`), delete unused `id.json` and the unused
   `fs`/`ethers` imports; delete `setGuildRolesForUsersByContract` (dead and
   buggy) or fix `owner.wallet → owner.address` if it's kept for the future.
2. Move `nodemon` to devDependencies; `npm start` = node, `npm run dev` =
   nodemon.
3. Upgrade base image to `node:22-alpine`; bump discord.js/knex/express to
   current minor/patch versions (majors handled in Phase 4).
4. Replace `Math.random()` requestId with `crypto.randomBytes`.
5. Fix the `getGuildRole` call-signature mismatch and stop mutating
   `ADMIN_REQUESTS` session objects when building responses (build response
   copies instead) — contract tests prove responses are unchanged.
6. Write a real `Readme.md` (setup, env vars, deploy, backup/restore).
7. Deploy. Rollback risk: minimal, contract tests + same DB file.

### Phase 2 — Restructure (L)

1. Introduce the target layout from §2.2 by **moving code**: split
   `server.js` into route modules + app factory, split `discord-bot.js` into
   events/interactions/embeds/roleSync, split `dbHelpers.js` into
   repositories. Behavior-preserving; contract tests unchanged.
2. Kill `global.client`: `createApp({ client, db, ... })`,
   `createBot({ db, ... })`, wired in `index.js`.
3. Centralize env handling in `config.js` with validation (fail fast if
   `DISCORD_BOT_TOKEN` missing); move `VERIFY_BASE_URL` to env with the
   current value as default.
4. Consolidate the duplicated embed builders and the duplicated
   owner-merging logic into single functions; make `/newrole`/`/deleterole`
   use the same bot-position-aware `allRoles` filter as `/myserver` (visible
   frontend data becomes *more* correct, shape unchanged).
5. Add unit tests for `roleSync` eligibility rules (min/max, traits,
   multi-wallet merge) — these rules are currently untested and are the
   heart of the product.
6. Deploy. Same DB, same API.

### Phase 3 — Database layer (M)

1. Fix `knexfile.js`: `production` + `development` + `test` environments
   selected by `NODE_ENV` (same file path in production), correct
   `PRAGMA foreign_keys = ON`, add WAL + `busy_timeout`.
2. Implement the boot sequence: baseline guard → `migrate.latest()` → start
   bot → start HTTP listener (§2.3.1–2).
3. Orphan audit/cleanup migration (§2.3.4c), logged and no-op-safe.
4. Ship `pending_requests` migration + `requestStore` service backed by it
   (memory cache in front). Restart mid-verification now works; API
   responses identical.
5. Simplify `guildDelete` handler to rely on now-working cascades.
6. Deploy: **take a manual DB backup first** (this is the first schema-touching
   deploy), verify `knex_migrations` rows afterwards.

### Phase 4 — Reliability & security (M)

1. `helmet`, rate limiting on the API (generous limits — the frontend polls),
   CORS origin allow-list via env (default `*` to stay compatible).
2. Structured logging with `pino` (levels, guildId/userId context) replacing
   `console.log`.
3. OpenTheta API client: timeouts, bounded retries with backoff, and a small
   in-memory cache for `contracts/:contract/attributes` responses — the
   full-sync loop currently fetches the same contract once per role per
   cycle.
4. Role-sync queue: serialize Discord role mutations with modest concurrency
   and honor rate-limit headers (discord.js does this, but the full sync
   fires unbounded parallel loops today); add jitter so the 5-minute loop
   (`SYNC_INTERVAL_MS` env) doesn't stampede.
5. Graceful shutdown: SIGTERM → stop interval, close HTTP server, destroy
   Discord client, close knex.
6. `GET /healthz` (before the catch-all) returning bot-ready + DB-ok, wired
   into Docker `HEALTHCHECK`.
7. Deploy.

### Phase 5 — Modernization & features (M, optional but recommended)

1. Replace the `!reload` message command with a `/reload` slash command
   (admin-permission-gated) and **drop the `MessageContent` intent**.
2. Handle the discriminator deprecation: display `username` when
   discriminator is `0`; keep the signed-message format working for both.
   (The message text is user-visible in the frontend signing flow — verify
   with the frontend owner that changing the displayed username format is
   acceptable; the API shape is unaffected.)
3. Guild-join hardening: handle missing channel-create permissions with a DM
   to the inviter instead of a silent `catch()`.
4. Optional: `docker-compose.yml` (bot + volume + healthcheck) replacing
   `docker-run.sh`; image build/push via GitHub Actions on tag.
5. Optional follow-ups (explicitly out of scope for this plan): TypeScript
   migration, Postgres, multi-process split, admin dashboard.

---

## 4. Rollout & risk summary

| Risk | Mitigation |
|---|---|
| Frontend breaks on a response change | Contract tests snapshot exact bodies/status codes incl. typo'd error strings; CI gates every PR |
| Schema migration corrupts prod data | Additive-only migrations, baseline guard, automatic pre-deploy file backup, WAL, tested restore procedure |
| Enabling `foreign_keys` surfaces latent orphans | Audit/cleanup migration logs counts and is a no-op when clean; run against a backup copy first |
| Refactor changes role-assignment behavior | Role-eligibility unit tests added *before* logic is touched (Phase 2.5) |
| Restart kills in-flight verifications (existing risk, worse during frequent deploys) | `pending_requests` table in Phase 3 |
| Discord library major upgrade breaks interactions | Majors isolated in Phase 4/5, tested against a staging guild before prod |

**Staging:** keep a second Discord application/bot token invited to a private
test guild; every phase is smoke-tested there (join flow, verify flow, role
setup, disconnect) against a copy of the production DB file before the prod
deploy.

**Definition of done per phase:** CI green (lint + contract + unit tests),
staging smoke test passed, prod deployed with pre-deploy DB backup taken,
`/healthz` (from Phase 4 on) reporting OK.
