const knex = require('knex');
const config = require("./../knexfile");
const db = knex(config.development);

module.exports = {
    addGuild,
    addWallet,
    addUser,
    getUserGuilds,
    getWalletGuilds,
    getWalletUser,
    getUserWallets,
    updateUserGuild,
    deleteUserGuild,
    getGuildRole,
    deleteGuild,
    getGuildRoles,
    addGuildRole,
    updateGuildRole,
    getUsersInGuild,
    getUserGuild,
    deleteGuildRole,
    getGuildRolesByContract,
    getUserInGuild,
    getGuilds,
}

// interact with projects table
// function addGuild(guild) {
//     return db('guilds').where({guildId: guild.guildId, verifyChannelId: guild.verifyChannelId, configChannelId: guild.configChannelId}).del().then(() => {
//         return db("guilds").insert(guild);
//     });
// }

function addGuild(guild) {
    return db("guilds").insert(guild).onConflict('guildId').merge();
}

// function addWallet(wallet) {
//     return db('wallets').where({wallet: wallet.wallet}).del().then(() => {
//         return db("wallets").insert(wallet);
//     });
// }

function addWallet(wallet) {
    return db("wallets").insert(wallet).onConflict('wallet').merge();
}

// function addUser(user) {
//     return db('users').where({userId: user.userId, guildId: user.guildId}).del().then(() => {
//         return db("users").insert(user);
//     });
// }

function addUser(user) {
    return db("users").insert(user).onConflict(['userId', 'guildId']).merge();
}


function getWalletGuilds(wallet, contract) {
    return db("users as u")
        .join("roles as r", "u.guildId", "r.guildId")
        .join("wallets as w", "u.wallet", "w.wallet")
        .select(
            "u.userId",
            "u.wallet",
            "w.thetadrop",
            "r.guildId",
            "r.roleId",
            "r.roleName",
            "r.contract",
            "r.min_amount",
            "r.max_amount",
            "r.trait_type",
            "r.trait_value",
            "r.include_market"
        ).where({
            wallet: wallet,
            contract: contract
        });
}

function getWalletUser(wallet) {
    return db("wallets").where({wallet})
}

function getUserWallets(userId) {
    return db("wallets").where({userId})
}

// function updateWallet(wallet) {
//     return db('wallets').where(wallet).update(wallet)
// }
//
// function deleteWallet(wallet) {
//     return db("wallets").where({wallet}).del()
// }

function getUserGuilds(userId) {
    return db("users as u").where({ userId });
}

function getUserGuild(userId, guildId) {
    return db("users").where({userId: userId, guildId: guildId})
}

function updateUserGuild(user) {
    // return db("users").where({userId: user.userId, guildId: user.guildId, thetadrop: user.thetadrop}).update(user)
    return db("users")
        .insert(user)
        .onConflict(["userId", "guildId", "thetadrop"])
        .merge();
}

function deleteUserGuild(userId, guildId, thetadrop) {
    return db("users").where({userId: userId, guildId: guildId, thetadrop: thetadrop}).del()
}

function getGuilds() {
    return db("guilds")
}

function getGuildRole(roleId) {
    return db("roles").where({roleId: roleId})
}

function updateGuildRole(role) {
    return db('roles').where({roleId: role.roleId}).update(role)
}

function addGuildRole(role) {
    return db("roles").where({roleId: role.roleId}).del().then(() => {
        return db("roles").insert(role);
    });
}

function deleteGuildRole(guildId, roleId) {
    return db("roles").where({guildId: guildId, roleId: roleId}).del()
}

function getGuildRoles(guildId) {
    return db("roles").where({guildId: guildId})
}

function getGuildRolesByContract(guildId, contract) {
    return db("roles").where({guildId: guildId, contract:contract})
}

function updateGuild(server) {
    return db("guilds").where({guildId: server.guildId, roleId: server.roleId, contract: server.contract}).update(server)
}

function deleteGuild(guildId) {
    return db("guilds").where({guildId}).del()
}

function getUsersInGuild(guildId) {
    return db("users").where({guildId: guildId})
}

function getUserInGuild(guildId, userId) {
    return db("users").where({guildId: guildId, userId: userId})
}