// A "user" row is one wallet connection of a Discord user to a guild.
// (userId, guildId, thetadrop) is unique: each user can connect one
// MetaMask-style wallet (thetadrop=0) and one ThetaDrop wallet (thetadrop=1)
// per guild.
function createUsersRepo(db) {
    return {
        upsert(user) {
            return db('users')
                .insert(user)
                .onConflict(['userId', 'guildId', 'thetadrop'])
                .merge();
        },
        getGuilds(userId) {
            return db('users').where({ userId });
        },
        getUserGuild(userId, guildId) {
            return db('users').where({ userId, guildId });
        },
        getInGuild(guildId) {
            return db('users').where({ guildId });
        },
        delete(userId, guildId, thetadrop) {
            return db('users').where({ userId, guildId, thetadrop }).del();
        },
    };
}

module.exports = { createUsersRepo };
