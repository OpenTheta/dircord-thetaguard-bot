// Test bootstrap for the API contract tests.
//
// Must be imported BEFORE any application module: it points DB_FILE at a
// fresh temp SQLite file so the knexfile (read at require time) never touches
// ./db/ThetaGuard.db.

const fs = require('fs');
const os = require('os');
const path = require('path');
const knex = require('knex');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thetaguard-test-'));
process.env.DB_FILE = path.join(tmpDir, 'ThetaGuard.db');

const config = require('../../knexfile');

// Discord role fixtures returned by the fake guild's roles.fetch().
// Plain objects serialize through res.json() the same way discord.js
// Collections do (Collection#toJSON() returns an array of values).
const BOT_ROLE_POSITION = 10;
const DISCORD_ROLES = [
    { id: 'discord-role-1', name: 'Holder', position: 1, tags: null },
    { id: 'discord-role-2', name: 'Whale', position: 2, tags: null },
    { id: 'everyone', name: '@everyone', position: 0, tags: null },
    { id: 'bot-managed', name: 'SomeBot', position: 3, tags: { botId: 'x' } },
    { id: 'above-bot', name: 'Admin', position: 99, tags: null },
];

function makeRolesArray() {
    // Deep copy so tests can't cross-contaminate fixtures.
    return JSON.parse(JSON.stringify(DISCORD_ROLES));
}

function createFakeClient() {
    const guild = {
        roles: {
            fetch: async () => makeRolesArray(),
            // Used by the fire-and-forget role sync; returning undefined makes
            // setRoleForGuildUsers exit early without touching the network.
            cache: { get: () => undefined },
        },
        members: {
            // With an id this returns the bot member (for the role-position
            // filter); without an id it's the bulk fetch done by role sync.
            fetch: async (id) =>
                id ? { roles: { highest: { position: BOT_ROLE_POSITION } } } : undefined,
        },
    };
    return {
        user: { id: 'fake-bot-user' },
        guilds: { cache: { get: () => guild } },
    };
}

async function migrate() {
    const setupDb = knex(config.development);
    await setupDb.migrate.latest();
    await setupDb.destroy();
}

// Wire a fully working API instance against the temp database and a fake
// Discord client — the same wiring as src/index.js, minus the real client
// and the sync job.
function buildTestApp() {
    const { createApp } = require('../../src/api/app');
    const { createRepositories } = require('../../src/db/repositories');
    const { createRequestStore } = require('../../src/services/requestStore');
    const { createRoleSync } = require('../../src/services/roleSync');
    const { createOpenThetaApi } = require('../../src/services/openTheta');
    const { createDb } = require('../../src/db/knex');

    const db = createDb();
    const repos = createRepositories(db);
    const requestStore = createRequestStore();
    const client = createFakeClient();
    // Unroutable base URL: contract tests must never reach the network. The
    // fake client makes role sync exit before any ownership lookup.
    const openTheta = createOpenThetaApi({ baseUrl: 'http://127.0.0.1:1/' });
    const roleSync = createRoleSync({ client, repos, openTheta });
    const app = createApp({ client, repos, requestStore, roleSync });

    return { app, db, repos, requestStore };
}

module.exports = {
    migrate,
    buildTestApp,
    createFakeClient,
    makeRolesArray,
    BOT_ROLE_POSITION,
    DISCORD_ROLES,
};
