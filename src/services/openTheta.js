const axios = require('axios');

// Client for the OpenTheta API. All ownership lookups go through here so the
// base URL, headers, and (in a later phase) timeouts/retries/caching live in
// one place.
function createOpenThetaApi({ baseUrl }) {
    return {
        // Returns the owners array for a contract, or null when the request
        // fails or the response has an unexpected shape. Callers treat null
        // as "ownership unknown".
        async fetchOwners(contract, includeForSale) {
            const url = `${baseUrl}contracts/${contract}/attributes?includeForSale=${Boolean(includeForSale)}`;
            try {
                const res = await axios.get(url, {
                    headers: { 'User-Agent': 'OT ThetaGuard Bot' },
                });
                if (!res || !res.data || !Array.isArray(res.data.owners)) {
                    console.warn(`[openTheta] Invalid API response: url=${url}`);
                    return null;
                }
                return res.data.owners;
            } catch (e) {
                console.error(`[openTheta] API error: url=${url}`, e.message ?? e);
                return null;
            }
        },
    };
}

module.exports = { createOpenThetaApi };
