// Tests for the OpenTheta API client: retries with backoff, response
// caching, and invalid-shape handling. Uses an injected fetchFn — no network.

import { describe, it, expect } from 'vitest';
import { createOpenThetaApi } from '../../src/services/openTheta.js';

const OWNERS = [{ address: '0xaaa', ownedAmount: 1, attributes: {} }];

function makeApi(fetchFn, overrides = {}) {
    return createOpenThetaApi({
        baseUrl: 'https://api.example/v1/',
        retryDelayMs: 1,
        cacheTtlMs: 60000,
        fetchFn,
        ...overrides,
    });
}

describe('openTheta.fetchOwners', () => {
    it('returns the owners array and builds the expected URL', async () => {
        const calls = [];
        const api = makeApi(async (url) => {
            calls.push(url);
            return { data: { owners: OWNERS } };
        });

        const owners = await api.fetchOwners('0xcontract', 1);
        expect(owners).toEqual(OWNERS);
        expect(calls).toEqual([
            'https://api.example/v1/contracts/0xcontract/attributes?includeForSale=true',
        ]);
    });

    it('serves repeated lookups from the cache within the TTL', async () => {
        let calls = 0;
        const api = makeApi(async () => {
            calls++;
            return { data: { owners: OWNERS } };
        });

        await api.fetchOwners('0xcontract', 0);
        await api.fetchOwners('0xcontract', 0);
        await api.fetchOwners('0xcontract', 0);
        expect(calls).toBe(1);

        // different includeForSale is a different cache entry
        await api.fetchOwners('0xcontract', 1);
        expect(calls).toBe(2);
    });

    it('does not cache after the TTL expired', async () => {
        let calls = 0;
        const api = makeApi(
            async () => {
                calls++;
                return { data: { owners: OWNERS } };
            },
            { cacheTtlMs: -1 }
        );

        await api.fetchOwners('0xcontract', 0);
        await api.fetchOwners('0xcontract', 0);
        expect(calls).toBe(2);
    });

    it('retries transient failures and succeeds', async () => {
        let calls = 0;
        const api = makeApi(async () => {
            calls++;
            if (calls < 3) throw new Error('ECONNRESET');
            return { data: { owners: OWNERS } };
        });

        const owners = await api.fetchOwners('0xcontract', 0);
        expect(owners).toEqual(OWNERS);
        expect(calls).toBe(3); // initial attempt + 2 retries
    });

    it('returns null after exhausting all retries', async () => {
        let calls = 0;
        const api = makeApi(async () => {
            calls++;
            throw new Error('timeout');
        });

        expect(await api.fetchOwners('0xcontract', 0)).toBeNull();
        expect(calls).toBe(3);
    });

    it('returns null for an unexpected response shape without retrying', async () => {
        let calls = 0;
        const api = makeApi(async () => {
            calls++;
            return { data: { somethingElse: true } };
        });

        expect(await api.fetchOwners('0xcontract', 0)).toBeNull();
        expect(calls).toBe(1);
    });

    it('does not cache failures', async () => {
        let calls = 0;
        const api = makeApi(async () => {
            calls++;
            if (calls <= 3) throw new Error('down');
            return { data: { owners: OWNERS } };
        });

        expect(await api.fetchOwners('0xcontract', 0)).toBeNull(); // 3 failed attempts
        expect(await api.fetchOwners('0xcontract', 0)).toEqual(OWNERS); // fresh try succeeds
    });
});
