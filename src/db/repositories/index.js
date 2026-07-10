const { createGuildsRepo } = require('./guilds');
const { createRolesRepo } = require('./roles');
const { createUsersRepo } = require('./users');
const { createWalletsRepo } = require('./wallets');
const { createPendingRequestsRepo } = require('./pendingRequests');

function createRepositories(db) {
    return {
        guilds: createGuildsRepo(db),
        roles: createRolesRepo(db),
        users: createUsersRepo(db),
        wallets: createWalletsRepo(db),
        pendingRequests: createPendingRequestsRepo(db),
    };
}

module.exports = { createRepositories };
