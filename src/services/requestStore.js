// In-memory store for pending verification sessions, keyed by requestId.
// Sessions expire 20 minutes after creation. (Persistence across restarts is
// planned for Phase 3 — see docs/IMPROVEMENT_PLAN.md.)

const EXPIRATION_MS = 20 * 60 * 1000;

function createRequestStore({ expirationMs = EXPIRATION_MS } = {}) {
    const userRequests = {};
    const adminRequests = {};

    function isExpired(request) {
        return Date.now() - request.timestamp > expirationMs;
    }

    function removeExpired(requestId) {
        if (userRequests[requestId] && isExpired(userRequests[requestId])) {
            delete userRequests[requestId];
        }
        if (adminRequests[requestId] && isExpired(adminRequests[requestId])) {
            delete adminRequests[requestId];
        }
    }

    function removeAllExpired() {
        for (const requestId of Object.keys(userRequests)) {
            if (isExpired(userRequests[requestId])) delete userRequests[requestId];
        }
        for (const requestId of Object.keys(adminRequests)) {
            if (isExpired(adminRequests[requestId])) delete adminRequests[requestId];
        }
    }

    // Drop all pending sessions of a guild (used when the bot is kicked).
    function deleteByGuild(guildId) {
        for (const requestId of Object.keys(userRequests)) {
            if (userRequests[requestId].guildId === guildId) delete userRequests[requestId];
        }
        for (const requestId of Object.keys(adminRequests)) {
            if (adminRequests[requestId].guildId === guildId) delete adminRequests[requestId];
        }
    }

    return { userRequests, adminRequests, removeExpired, removeAllExpired, deleteByGuild };
}

module.exports = { createRequestStore };
