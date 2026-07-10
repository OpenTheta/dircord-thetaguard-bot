const axios = require('axios');
const { logger } = require('../logger');

// Client for the OpenTheta API. All ownership lookups go through here:
// - request timeout so a hung upstream can't stall a sync pass
// - bounded retries with exponential backoff for transient failures
// - short-lived response cache: the full sync asks for the same contract once
//   per role per cycle, and the on-demand syncs pile on top of that
//
// fetchFn is injectable for tests; it defaults to axios.
function createOpenThetaApi({
    baseUrl,
    timeoutMs = 10000,
    retries = 2,
    retryDelayMs = 500,
    cacheTtlMs = 60000,
    fetchFn = null,
}) {
    const get =
        fetchFn ||
        ((url) =>
            axios.get(url, {
                headers: { 'User-Agent': 'OT ThetaGuard Bot' },
                timeout: timeoutMs,
            }));

    const cache = new Map(); // `${contract}:${includeForSale}` -> { owners, expiresAt }

    // Returns the owners array for a contract, or null when the request fails
    // or the response has an unexpected shape. Callers treat null as
    // "ownership unknown".
    async function fetchOwners(contract, includeForSale) {
        const key = `${contract}:${Boolean(includeForSale)}`;
        const cached = cache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.owners;
        }

        const url = `${baseUrl}contracts/${contract}/attributes?includeForSale=${Boolean(includeForSale)}`;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await get(url);
                if (!res || !res.data || !Array.isArray(res.data.owners)) {
                    // the server answered — a retry won't change the shape
                    logger.warn({ url }, '[openTheta] Invalid API response');
                    return null;
                }
                cache.set(key, { owners: res.data.owners, expiresAt: Date.now() + cacheTtlMs });
                return res.data.owners;
            } catch (e) {
                const lastAttempt = attempt === retries;
                logger[lastAttempt ? 'error' : 'warn'](
                    { url, attempt: attempt + 1, err: e.message ?? e },
                    '[openTheta] API request failed'
                );
                if (!lastAttempt) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** attempt));
                }
            }
        }
        return null;
    }

    return { fetchOwners };
}

module.exports = { createOpenThetaApi };
