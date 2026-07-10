// Contract tests for the admin (role-setup) endpoints consumed by the fixed
// frontend. These pin the CURRENT behavior, including the different allRoles
// filtering between GET /myserver (bot-position-aware) and POST /newrole /
// POST /deleterole (name/tags only) — the frontend relies on the shapes, so
// any refactor must keep these green.

import {
    migrate,
    buildTestApp,
    BOT_ROLE_POSITION,
    DISCORD_ROLES,
} from '../helpers/setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const { app: server, db, requestStore } = buildTestApp();
const ADMIN_REQUESTS = requestStore.adminRequests;

const GUILD_ID = 'guild-200';
const ROLE_ID = 'discord-role-1';

// The assignable roles every admin endpoint returns: roles below the bot's
// highest role, excluding @everyone and bot-managed (tagged) roles. (Since
// the Phase 2 restructure /newrole and /deleterole use the same
// position-aware filter as GET /myserver — previously they also returned
// roles the bot cannot assign.)
const MYSERVER_ALL_ROLES = DISCORD_ROLES.filter(
    (r) => r.position < BOT_ROLE_POSITION && r.name !== '@everyone' && !r.tags
);
const MUTATION_ALL_ROLES = MYSERVER_ALL_ROLES;

function makeAdminRequest(overrides = {}) {
    return {
        name: 'admin#0001',
        timestamp: Date.now(),
        interactionId: 'admin-interaction-1',
        community: 'Test Community',
        guildId: GUILD_ID,
        userId: 'admin-user-1',
        guildIcon: 'https://example.com/guild.png',
        userIcon: 'https://example.com/user.png',
        ...overrides,
    };
}

const newRolePayload = {
    roleId: ROLE_ID,
    roleName: 'Holder',
    contract: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca',
    min_amount: 1,
    max_amount: null,
    trait_type: null,
    trait_value: null,
    include_market: 0,
};

// The role row as it comes back from SQLite (booleans stored as integers,
// guildId taken from the admin session, not the payload).
const storedRole = { ...newRolePayload, guildId: GUILD_ID };

beforeAll(async () => {
    await migrate();
    await db('guilds').insert({
        guildId: GUILD_ID,
        verifyChannelId: 'verify-ch',
        configChannelId: 'config-ch',
    });
});

afterAll(async () => {
    await db.destroy();
});

describe('GET /myserver/:requestId', () => {
    it('returns the admin session with configured and assignable roles', async () => {
        ADMIN_REQUESTS['admin-req-1'] = makeAdminRequest();

        const res = await request(server).get('/myserver/admin-req-1');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({
            name: 'admin#0001',
            timestamp: expect.any(Number),
            interactionId: 'admin-interaction-1',
            community: 'Test Community',
            guildId: GUILD_ID,
            userId: 'admin-user-1',
            guildIcon: 'https://example.com/guild.png',
            userIcon: 'https://example.com/user.png',
            setRoles: [],
            allRoles: MYSERVER_ALL_ROLES,
        });
    });

    it('expires admin sessions older than 20 minutes', async () => {
        ADMIN_REQUESTS['admin-req-expired'] = makeAdminRequest({
            timestamp: Date.now() - 21 * 60 * 1000,
        });

        const res = await request(server).get('/myserver/admin-req-expired');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exists' });
        expect(ADMIN_REQUESTS['admin-req-expired']).toBeUndefined();
    });

    it('returns 404 with exact error body for an unknown requestId', async () => {
        const res = await request(server).get('/myserver/never-registered');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exists' });
    });
});

describe('POST /newrole', () => {
    it('creates a role rule and returns the session with setRoles and allRoles', async () => {
        ADMIN_REQUESTS['newrole-req-1'] = makeAdminRequest();

        const res = await request(server)
            .post('/newrole')
            .send({ requestId: 'newrole-req-1', ...newRolePayload });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            guildId: GUILD_ID,
            setRoles: [storedRole],
            allRoles: MUTATION_ALL_ROLES,
        });

        const rows = await db('roles').where({ roleId: ROLE_ID });
        expect(rows).toEqual([storedRole]);
    });

    it('updates the rule when the same roleId is posted again', async () => {
        ADMIN_REQUESTS['newrole-req-2'] = makeAdminRequest();

        const res = await request(server)
            .post('/newrole')
            .send({
                requestId: 'newrole-req-2',
                ...newRolePayload,
                min_amount: 5,
                max_amount: 10,
            });

        expect(res.status).toBe(200);
        expect(res.body.setRoles).toEqual([
            { ...storedRole, min_amount: 5, max_amount: 10 },
        ]);

        const rows = await db('roles').where({ roleId: ROLE_ID });
        expect(rows).toHaveLength(1);
        expect(rows[0].min_amount).toBe(5);
        expect(rows[0].max_amount).toBe(10);
    });

    it('returns 404 with exact error body for an unknown requestId', async () => {
        const res = await request(server)
            .post('/newrole')
            .send({ requestId: 'never-registered', ...newRolePayload });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exists' });
    });
});

describe('POST /deleterole', () => {
    it('deletes the role rule and returns the remaining configuration', async () => {
        ADMIN_REQUESTS['delrole-req-1'] = makeAdminRequest();

        const res = await request(server).post('/deleterole').send({
            requestId: 'delrole-req-1',
            guildId: GUILD_ID,
            roleId: ROLE_ID,
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            guildId: GUILD_ID,
            setRoles: [],
            allRoles: MUTATION_ALL_ROLES,
        });

        const rows = await db('roles').where({ roleId: ROLE_ID });
        expect(rows).toHaveLength(0);
    });

    it('still succeeds when the role rule does not exist in the database', async () => {
        ADMIN_REQUESTS['delrole-req-2'] = makeAdminRequest();

        const res = await request(server).post('/deleterole').send({
            requestId: 'delrole-req-2',
            guildId: GUILD_ID,
            roleId: 'unknown-role',
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            setRoles: [],
            allRoles: MUTATION_ALL_ROLES,
        });
    });

    it('returns 404 with exact error body for an unknown requestId', async () => {
        const res = await request(server).post('/deleterole').send({
            requestId: 'never-registered',
            guildId: GUILD_ID,
            roleId: ROLE_ID,
        });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exists' });
    });
});
