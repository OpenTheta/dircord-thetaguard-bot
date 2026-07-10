function createPendingRequestsRepo(db) {
    return {
        upsert(row) {
            return db('pending_requests').insert(row).onConflict('requestId').merge();
        },
        getUnexpired(now) {
            return db('pending_requests').where('expiresAt', '>', now);
        },
        deleteExpired(now) {
            return db('pending_requests').where('expiresAt', '<=', now).del();
        },
        delete(requestId) {
            return db('pending_requests').where({ requestId }).del();
        },
        deleteByGuild(guildId) {
            return db('pending_requests').where({ guildId }).del();
        },
    };
}

module.exports = { createPendingRequestsRepo };
