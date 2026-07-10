const knex = require('knex');
const config = require("./../knexfile");
const db = knex(config.development);

module.exports = {
    db,
    addGuild,
    addWallet,
    addUser,
    getUserGuilds,
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
    getGuild
}

function addGuild(guild) {
    return db("guilds").insert(guild).onConflict('guildId').merge();
}

function addWallet(wallet) {
    return db("wallets").insert(wallet).onConflict('wallet').merge();
}

function addUser(user) {
    return db("users").insert(user).onConflict(['userId', 'guildId']).merge();
}

function getWalletUser(wallet) {
    return db("wallets").where({wallet})
}

function getUserWallets(userId) {
    return db("wallets").where({userId})
}

function getUserGuilds(userId) {
    return db("users as u").where({ userId });
}

function getUserGuild(userId, guildId) {
    return db("users").where({userId: userId, guildId: guildId})
}

function updateUserGuild(user) {
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
    return db("roles").where({guildId: guildId, contract: contract})
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

function getGuild(guildId) {
    return db("guilds").where({guildId: guildId})
}
