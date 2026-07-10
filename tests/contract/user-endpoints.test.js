// Contract tests for the user-facing verification endpoints consumed by the
// fixed frontend (separate repo). These pin the CURRENT behavior — paths,
// response shapes, status codes, and exact error strings (including the
// inconsistent "does not exist" / "does not exists" spellings). Any change
// that makes these fail is a breaking change for the frontend.

// setup must be imported first: it points DB_FILE at a temp SQLite file and
// provides the fake discord client before any app module is loaded.
import { migrate, buildTestApp } from '../helpers/setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Wallet } from 'ethers';

const { app: server, db, requestStore } = buildTestApp();
const USER_REQUESTS = requestStore.userRequests;

const GUILD_ID = 'guild-100';
const USER_ID = 'user-100';
const WALLET_MM = '0x1111111111111111111111111111111111111111';
const WALLET_TD = 'tdrop-wallet-aaa';

function makeUserRequest(overrides = {}) {
    return {
        name: 'tester#1234',
        timestamp: Date.now(),
        interactionId: 'interaction-1',
        community: 'Test Community',
        guildId: GUILD_ID,
        userId: USER_ID,
        message: 'sign this test message',
        guildIcon: 'https://example.com/guild.png',
        userIcon: 'https://example.com/user.png',
        ...overrides,
    };
}

beforeAll(async () => {
    await migrate();
    await db('guilds').insert({
        guildId: GUILD_ID,
        verifyChannelId: 'verify-ch',
        configChannelId: 'config-ch',
    });
    await db('wallets').insert([
        { wallet: WALLET_MM, userId: USER_ID, thetadrop: 0 },
        { wallet: WALLET_TD, userId: USER_ID, thetadrop: 1 },
    ]);
    // WALLET_MM is already connected to the guild as the MetaMask wallet
    await db('users').insert({
        userId: USER_ID,
        guildId: GUILD_ID,
        thetadrop: 0,
        wallet: WALLET_MM,
    });
});

afterAll(async () => {
    await db.destroy();
});

describe('GET /:requestId', () => {
    it('returns the session with wallets, filtering out already-connected ones', async () => {
        USER_REQUESTS['user-req-1'] = makeUserRequest();

        const res = await request(server).get('/user-req-1');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body).toEqual({
            name: 'tester#1234',
            timestamp: expect.any(Number),
            interactionId: 'interaction-1',
            community: 'Test Community',
            guildId: GUILD_ID,
            userId: USER_ID,
            message: 'sign this test message',
            guildIcon: 'https://example.com/guild.png',
            userIcon: 'https://example.com/user.png',
            requestId: 'user-req-1',
            // WALLET_MM is connected to this guild -> reported via setWalletMM
            // and removed from the selectable wallets list
            wallets: [{ wallet: WALLET_TD, userId: USER_ID, thetadrop: 1 }],
            setWalletMM: WALLET_MM,
            setWalletTD: '',
        });
    });

    it('returns 404 with exact error body for an unknown requestId', async () => {
        const res = await request(server).get('/does-not-exist-id');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exist' });
    });

    it('expires sessions older than 20 minutes', async () => {
        USER_REQUESTS['user-req-expired'] = makeUserRequest({
            timestamp: Date.now() - 21 * 60 * 1000,
        });

        const res = await request(server).get('/user-req-expired');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exist' });
        expect(USER_REQUESTS['user-req-expired']).toBeUndefined();
    });
});

describe('POST /signed', () => {
    it('stores the wallet and returns all user wallets on a valid signature', async () => {
        const signer = Wallet.createRandom();
        const message = 'please sign me';
        USER_REQUESTS['signed-req-1'] = makeUserRequest({ message });
        const signature = await signer.signMessage(message);

        const res = await request(server).post('/signed').send({
            requestId: 'signed-req-1',
            signature,
            address: signer.address,
            thetadrop: 0,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.arrayContaining([
                { wallet: WALLET_MM, userId: USER_ID, thetadrop: 0 },
                { wallet: WALLET_TD, userId: USER_ID, thetadrop: 1 },
                { wallet: signer.address, userId: USER_ID, thetadrop: 0 },
            ])
        );
        expect(res.body).toHaveLength(3);

        const stored = await db('wallets').where({ wallet: signer.address });
        expect(stored).toHaveLength(1);

        // clean up the extra wallet so later assertions stay simple
        await db('wallets').where({ wallet: signer.address }).del();
    });

    it('returns 400 with plain-text body when the signature is from another wallet', async () => {
        const signer = Wallet.createRandom();
        const other = Wallet.createRandom();
        const message = 'please sign me';
        USER_REQUESTS['signed-req-2'] = makeUserRequest({ message });
        const signature = await other.signMessage(message);

        const res = await request(server).post('/signed').send({
            requestId: 'signed-req-2',
            signature,
            address: signer.address,
            thetadrop: 0,
        });

        expect(res.status).toBe(400);
        expect(res.text).toBe('Wrong signature');
    });

    it('returns 500 with the verification error body for an unknown requestId', async () => {
        const res = await request(server).post('/signed').send({
            requestId: 'never-registered',
            signature: '0x00',
            address: '0x0000000000000000000000000000000000000000',
            thetadrop: 0,
        });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Error verifying signature' });
    });
});

describe('POST /verifyserver', () => {
    it('links an owned wallet to the guild and echoes the user object', async () => {
        USER_REQUESTS['verify-req-1'] = makeUserRequest();

        const res = await request(server).post('/verifyserver').send({
            requestId: 'verify-req-1',
            userId: USER_ID,
            wallet: WALLET_TD,
            thetadrop: 1,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            userId: USER_ID,
            guildId: GUILD_ID,
            wallet: WALLET_TD,
            thetadrop: 1,
        });

        const rows = await db('users').where({
            userId: USER_ID,
            guildId: GUILD_ID,
            thetadrop: 1,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].wallet).toBe(WALLET_TD);
    });

    it('returns 404 for a wallet the user does not own', async () => {
        USER_REQUESTS['verify-req-2'] = makeUserRequest();

        const res = await request(server).post('/verifyserver').send({
            requestId: 'verify-req-2',
            userId: USER_ID,
            wallet: '0x9999999999999999999999999999999999999999',
            thetadrop: 0,
        });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'invalid wallet' });
    });

    it('returns 404 with exact error body for an unknown requestId', async () => {
        const res = await request(server).post('/verifyserver').send({
            requestId: 'never-registered',
            userId: USER_ID,
            wallet: WALLET_MM,
            thetadrop: 0,
        });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exists' });
    });
});

describe('POST /disconnect', () => {
    it('removes the wallet-guild link and confirms', async () => {
        USER_REQUESTS['disc-req-1'] = makeUserRequest();

        const res = await request(server).post('/disconnect').send({
            requestId: 'disc-req-1',
            userId: USER_ID,
            guildId: GUILD_ID,
            wallet: WALLET_TD,
            thetadrop: 1,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: 'disconnected wallet' });

        const rows = await db('users').where({
            userId: USER_ID,
            guildId: GUILD_ID,
            thetadrop: 1,
        });
        expect(rows).toHaveLength(0);
    });

    it('returns 404 for a wallet that is not connected to the guild', async () => {
        USER_REQUESTS['disc-req-2'] = makeUserRequest();

        const res = await request(server).post('/disconnect').send({
            requestId: 'disc-req-2',
            userId: USER_ID,
            guildId: GUILD_ID,
            wallet: '0x9999999999999999999999999999999999999999',
            thetadrop: 0,
        });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Invalid wallet' });
    });

    it('returns 404 when the userId does not match the session', async () => {
        USER_REQUESTS['disc-req-3'] = makeUserRequest();

        const res = await request(server).post('/disconnect').send({
            requestId: 'disc-req-3',
            userId: 'someone-else',
            guildId: GUILD_ID,
            wallet: WALLET_MM,
            thetadrop: 0,
        });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Invalid userId' });
    });

    it('returns 404 with exact error body for an unknown requestId', async () => {
        const res = await request(server).post('/disconnect').send({
            requestId: 'never-registered',
            userId: USER_ID,
            guildId: GUILD_ID,
            wallet: WALLET_MM,
            thetadrop: 0,
        });

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'requestId does not exists' });
    });
});
