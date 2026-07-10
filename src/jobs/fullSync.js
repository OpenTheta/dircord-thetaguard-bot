// Periodic reconciliation: re-checks every guild's rules against current
// on-chain ownership for every connected user. Runs on an interval from the
// ready event; a run is skipped while the previous one is still in flight.
const { logger } = require('../logger');

function createFullSync({ repos, roleSync }) {
    let rolesToCheck = {};

    return {
        async run() {
            if (Object.keys(rolesToCheck).length > 0) return;
            logger.info('[fullSync] Reconciling all guilds, roles, and users');
            const guilds = await repos.guilds.getAll();
            for (const guild of guilds) {
                const roles = await repos.roles.getByGuild(guild.guildId);
                const users = await repos.users.getInGuild(guild.guildId);
                const formattedUsers = roleSync.groupUsersByWallets(users);
                for (const role of roles) {
                    rolesToCheck[role.roleId] = role;
                    rolesToCheck[role.roleId].users = formattedUsers;
                }
            }
            roleSync.setRolesForUsers(rolesToCheck).then(() => {
                rolesToCheck = {};
            });
        },
    };
}

module.exports = { createFullSync };
