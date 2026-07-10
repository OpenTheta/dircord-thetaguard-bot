require("dotenv").config();
const database = require("../models/dbHelpers");
const {setRolesForUsers} = require("./discord-bot");

let rolesToCheck = {}

module.exports = {
    name: 'transaction tracking',
    description: 'Transaction events',
    interval: 300000,

    // Periodically reconcile every guild's roles against current on-chain
    // ownership. Skips a run while the previous one is still in flight.
    async backendTracking() {
        if (Object.keys(rolesToCheck).length > 0) return;
        console.log("Check All current Guilds, Roles and Users")
        let guilds = await database.getGuilds()
        for (let guild of guilds) {
            let roles = await database.getGuildRoles(guild.guildId);
            let users = await database.getUsersInGuild(guild.guildId);
            let formattedUsers = []
            users.forEach(user => {
                let existingUser = formattedUsers.find(u => u.userId === user.userId);

                if (existingUser) {
                    existingUser.wallets.push(user.wallet);
                } else {
                    formattedUsers.push({
                        id: user.id,
                        userId: user.userId,
                        guildId: user.guildId,
                        wallets: [user.wallet]
                    });
                }
            });
            for (let role of roles) {
                rolesToCheck[role.roleId] = role
                rolesToCheck[role.roleId].users = formattedUsers
            }
        }
        setRolesForUsers(rolesToCheck).then(() => {
            rolesToCheck = {}
        })
    }
}
