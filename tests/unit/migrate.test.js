// Tests for the startup migration runner: fresh databases, the baseline
// guard for a pre-existing production schema without migration history, and
// the orphan-cleanup migration.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import knexFactory from 'knex';
import { fileURLToPath } from 'node:url';
import { migrateDb } from '../../src/db/migrate.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thetaguard-migrate-test-'));
const openDbs = [];

function makeDb(name) {
    const db = knexFactory({
        client: 'sqlite3',
        connection: { filename: path.join(tmpDir, name) },
        migrations: { directory: MIGRATIONS_DIR },
        useNullAsDefault: true,
    });
    openDbs.push(db);
    return db;
}

afterAll(async () => {
    for (const db of openDbs) await db.destroy();
});

describe('migrateDb', () => {
    it('migrates a fresh database from scratch', async () => {
        const db = makeDb('fresh.db');
        await migrateDb(db);

        for (const table of ['guilds', 'roles', 'wallets', 'users', 'pending_requests']) {
            expect(await db.schema.hasTable(table), table).toBe(true);
        }
        const applied = await db('knex_migrations');
        expect(applied.length).toBe(3);
    });

    it('is idempotent on an up-to-date database', async () => {
        const db = makeDb('idempotent.db');
        await migrateDb(db);
        await migrateDb(db);
        expect((await db('knex_migrations')).length).toBe(3);
    });

    it('baselines a production-like schema without migration history, keeping data', async () => {
        const db = makeDb('baseline.db');
        // Simulate the production database: the 2023 schema exists (applied
        // here via the real initial migration) and contains live data, but
        // there is no knex_migrations table.
        await db.migrate.up(); // applies only the initial migration
        await db('guilds').insert({
            guildId: 'g1',
            verifyChannelId: 'v1',
            configChannelId: 'c1',
        });
        await db('wallets').insert({ wallet: '0xAAA', userId: 'u1', thetadrop: 0 });
        await db('users').insert({ userId: 'u1', guildId: 'g1', thetadrop: 0, wallet: '0xAAA' });
        await db.schema.dropTable('knex_migrations');

        await migrateDb(db);

        // baseline row + the two new migrations, initial one never re-run
        const applied = await db('knex_migrations');
        expect(applied.length).toBe(3);
        expect(applied[0].name).toBe('20230306124539_thetaguard-table.js');

        // production data untouched, new table available
        expect(await db('guilds')).toHaveLength(1);
        expect(await db('users')).toHaveLength(1);
        expect(await db.schema.hasTable('pending_requests')).toBe(true);
    });

    it('cleans up orphaned rows left behind by the disabled foreign keys', async () => {
        const db = makeDb('orphans.db');
        await db.migrate.up(); // initial schema only, FKs not enforced here
        await db('guilds').insert({
            guildId: 'g1',
            verifyChannelId: 'v1',
            configChannelId: 'c1',
        });
        await db('roles').insert({
            roleId: 'valid-role', roleName: 'Holder', contract: '0x1',
            min_amount: 1, include_market: 0, guildId: 'g1',
        });
        await db('roles').insert({
            roleId: 'orphan-role', roleName: 'Ghost', contract: '0x1',
            min_amount: 1, include_market: 0, guildId: 'deleted-guild',
        });
        await db('wallets').insert({ wallet: '0xAAA', userId: 'u1', thetadrop: 0 });
        await db('users').insert({ userId: 'u1', guildId: 'g1', thetadrop: 0, wallet: '0xAAA' });
        await db('users').insert({ userId: 'u2', guildId: 'g1', thetadrop: 0, wallet: '0xGONE' });

        await migrateDb(db);

        const roles = await db('roles');
        expect(roles.map((r) => r.roleId)).toEqual(['valid-role']);
        const users = await db('users');
        expect(users.map((u) => u.userId)).toEqual(['u1']);
    });
});
