// GET /healthz is new in Phase 4 (not part of the frontend contract, but the
// Docker healthcheck depends on it). It must not be swallowed by the
// GET /:requestId catch-all.

import { migrate, buildTestApp } from '../helpers/setup.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

const { app, db } = buildTestApp();

beforeAll(async () => {
    await migrate();
});

afterAll(async () => {
    await db.destroy();
});

describe('GET /healthz', () => {
    it('reports ok with bot readiness when the database answers', async () => {
        const res = await request(app).get('/healthz');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok', botReady: true });
    });

    it('is rate-limit exempt and sets security headers', async () => {
        const res = await request(app).get('/healthz');
        expect(res.headers['ratelimit-limit']).toBeUndefined();
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
});
