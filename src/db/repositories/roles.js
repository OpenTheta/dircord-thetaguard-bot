function createRolesRepo(db) {
    return {
        // roleIds are Discord snowflakes and therefore globally unique.
        get(roleId) {
            return db('roles').where({ roleId });
        },
        getByGuild(guildId) {
            return db('roles').where({ guildId });
        },
        getByGuildAndContract(guildId, contract) {
            return db('roles').where({ guildId, contract });
        },
        add(role) {
            return db('roles').where({ roleId: role.roleId }).del().then(() => {
                return db('roles').insert(role);
            });
        },
        update(role) {
            return db('roles').where({ roleId: role.roleId }).update(role);
        },
        delete(guildId, roleId) {
            return db('roles').where({ guildId, roleId }).del();
        },
    };
}

module.exports = { createRolesRepo };
