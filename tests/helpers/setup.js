// Test bootstrap for the API contract tests.
//
// Must be required BEFORE any application module: it points DB_FILE at a
// fresh temp SQLite file so models/dbHelpers.js (which creates its knex
// instance at require time) never touches ./db/ThetaGuard.db, and it installs
// a fake discord.js client on global.client, which the routes read at
// request time.

const fs = require('fs');
const os = require('os');
const path = require('path');
const knex = require('knex');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thetaguard-test-'));
process.env.DB_FILE = path.join(tmpDir, 'ThetaGuard.db');
process.env.DISCORD_BOT_TOKEN = 'test-token';

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

module.exports = {
    migrate,
    createFakeClient,
    makeRolesArray,
    BOT_ROLE_POSITION,
    DISCORD_ROLES,
};
