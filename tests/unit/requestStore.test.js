// Tests for the persistent request store: sessions survive a "restart" (a
// fresh store instance loading from the same database), expired sessions are
// pruned, and guild cleanup reaches the database.

// setup must be imported first: it points DB_FILE at a temp SQLite file.
import { migrate, buildTestApp } from '../helpers/setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequestStore } from '../../src/services/requestStore.js';
import { createPendingRequestsRepo } from '../../src/db/repositories/pendingRequests.js';

let db;
let repo;

function makeSession(overrides = {}) {
    return {
        name: 'tester#1234',
        timestamp: Date.now(),
        interactionId: 'i1',
        community: 'Test',
        guildId: 'g1',
        userId: 'u1',
        message: 'sign me',
        guildIcon: 'g.png',
        userIcon: 'u.png',
        ...overrides,
    };
}

beforeAll(async () => {
    await migrate();
    ({ db } = buildTestApp());
    repo = createPendingRequestsRepo(db);
});

afterAll(async () => {
    await db.destroy();
});

describe('request store persistence', () => {
    it('restores user and admin sessions after a restart', async () => {
        const store = createRequestStore({ repo });
        const userSession = makeSession();
        const adminSession = makeSession({ userId: 'admin-1' });
        await store.addUserRequest('user-req', userSession);
        await store.addAdminRequest('admin-req', adminSession);

        // "restart": fresh store, same database
        const restored = createRequestStore({ repo });
        await restored.load();

        expect(restored.userRequests['user-req']).toEqual(userSession);
        expect(restored.adminRequests['admin-req']).toEqual(adminSession);
    });

    it('does not restore expired sessions and prunes them from the database', async () => {
        const store = createRequestStore({ repo });
        await store.addUserRequest(
            'expired-req',
            makeSession({ timestamp: Date.now() - 21 * 60 * 1000 })
        );

        const restored = createRequestStore({ repo });
        await restored.load();

        expect(restored.userRequests['expired-req']).toBeUndefined();
        expect(await db('pending_requests').where({ requestId: 'expired-req' })).toHaveLength(0);
    });

    it('removeExpired deletes the persisted session too', async () => {
        const store = createRequestStore({ repo });
        await store.addUserRequest(
            'expiring-req',
            makeSession({ timestamp: Date.now() - 21 * 60 * 1000 })
        );

        store.removeExpired('expiring-req');
        // deletion is fire-and-forget; give it a tick
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(store.userRequests['expiring-req']).toBeUndefined();
        expect(await db('pending_requests').where({ requestId: 'expiring-req' })).toHaveLength(0);
    });

    it('deleteByGuild removes memory and persisted sessions of that guild only', async () => {
        const store = createRequestStore({ repo });
        await store.addUserRequest('kicked-guild-req', makeSession({ guildId: 'kicked' }));
        await store.addAdminRequest('kicked-guild-admin', makeSession({ guildId: 'kicked' }));
        await store.addUserRequest('other-guild-req', makeSession({ guildId: 'other' }));

        await store.deleteByGuild('kicked');

        expect(store.userRequests['kicked-guild-req']).toBeUndefined();
        expect(store.adminRequests['kicked-guild-admin']).toBeUndefined();
        expect(store.userRequests['other-guild-req']).toBeDefined();
        expect(await db('pending_requests').where({ guildId: 'kicked' })).toHaveLength(0);
        expect(await db('pending_requests').where({ guildId: 'other' })).toHaveLength(1);
    });

    it('works purely in memory when no repo is provided', async () => {
        const store = createRequestStore();
        await store.addUserRequest('mem-req', makeSession());
        expect(store.userRequests['mem-req']).toBeDefined();
        await store.load(); // no-op
        await store.removeAllExpired();
        await store.deleteByGuild('g1');
        expect(store.userRequests['mem-req']).toBeUndefined();
    });
});
