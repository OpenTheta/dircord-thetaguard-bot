function createGuildsRepo(db) {
    return {
        add(guild) {
            return db('guilds').insert(guild).onConflict('guildId').merge();
        },
        get(guildId) {
            return db('guilds').where({ guildId });
        },
        getAll() {
            return db('guilds');
        },
        delete(guildId) {
            return db('guilds').where({ guildId }).del();
        },
    };
}

module.exports = { createGuildsRepo };
