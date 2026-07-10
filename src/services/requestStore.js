// Store for pending verification sessions, keyed by requestId. Sessions
// expire 20 minutes after creation.
//
// Reads are always served synchronously from memory (the routes depend on
// that). When a pendingRequests repo is provided, writes go through to the
// database and unexpired sessions are restored at boot, so restarts and
// redeploys no longer invalidate links that users are mid-flow on.

const EXPIRATION_MS = 20 * 60 * 1000;

function createRequestStore({ expirationMs = EXPIRATION_MS, repo = null } = {}) {
    const userRequests = {};
    const adminRequests = {};

    function isExpired(request) {
        return Date.now() - request.timestamp > expirationMs;
    }

    function persist(requestId, type, session) {
        if (!repo) return Promise.resolve();
        return repo
            .upsert({
                requestId,
                type,
                guildId: session.guildId ?? null,
                payload: JSON.stringify(session),
                expiresAt: session.timestamp + expirationMs,
            })
            .catch((e) => console.error('[requestStore] Failed to persist session', e));
    }

    function forget(requestId) {
        if (!repo) return Promise.resolve();
        return repo
            .delete(requestId)
            .catch((e) => console.error('[requestStore] Failed to delete session', e));
    }

    // Restore unexpired sessions from the database (called once at boot,
    // before the HTTP listener starts).
    async function load() {
        if (!repo) return;
        await repo.deleteExpired(Date.now());
        const rows = await repo.getUnexpired(Date.now());
        for (const row of rows) {
            const target = row.type === 'admin' ? adminRequests : userRequests;
            target[row.requestId] = JSON.parse(row.payload);
        }
        if (rows.length) {
            console.log(`[requestStore] Restored ${rows.length} pending verification session(s)`);
        }
    }

    function addUserRequest(requestId, session) {
        userRequests[requestId] = session;
        return persist(requestId, 'user', session);
    }

    function addAdminRequest(requestId, session) {
        adminRequests[requestId] = session;
        return persist(requestId, 'admin', session);
    }

    function removeExpired(requestId) {
        let removed = false;
        if (userRequests[requestId] && isExpired(userRequests[requestId])) {
            delete userRequests[requestId];
            removed = true;
        }
        if (adminRequests[requestId] && isExpired(adminRequests[requestId])) {
            delete adminRequests[requestId];
            removed = true;
        }
        if (removed) forget(requestId);
    }

    function removeAllExpired() {
        for (const requestId of Object.keys(userRequests)) {
            if (isExpired(userRequests[requestId])) delete userRequests[requestId];
        }
        for (const requestId of Object.keys(adminRequests)) {
            if (isExpired(adminRequests[requestId])) delete adminRequests[requestId];
        }
        if (repo) {
            return repo
                .deleteExpired(Date.now())
                .catch((e) => console.error('[requestStore] Failed to prune sessions', e));
        }
        return Promise.resolve();
    }

    // Drop all pending sessions of a guild (used when the bot is kicked).
    function deleteByGuild(guildId) {
        for (const requestId of Object.keys(userRequests)) {
            if (userRequests[requestId].guildId === guildId) delete userRequests[requestId];
        }
        for (const requestId of Object.keys(adminRequests)) {
            if (adminRequests[requestId].guildId === guildId) delete adminRequests[requestId];
        }
        if (repo) {
            return repo
                .deleteByGuild(guildId)
                .catch((e) => console.error('[requestStore] Failed to delete guild sessions', e));
        }
        return Promise.resolve();
    }

    return {
        userRequests,
        adminRequests,
        load,
        addUserRequest,
        addAdminRequest,
        removeExpired,
        removeAllExpired,
        deleteByGuild,
    };
}

module.exports = { createRequestStore };
