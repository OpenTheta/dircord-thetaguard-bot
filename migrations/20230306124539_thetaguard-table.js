/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('guilds', function(table) {
        table.string('guildId').notNullable().unique();
        table.primary(['guildId']);
        table.string('verifyChannelId').notNullable();
        table.string('configChannelId').notNullable();
    }).createTable('roles', function(table) {
        table.string('roleId').notNullable().unique();
        table.primary(['roleId']);
        table.string('roleName').notNullable();
        table.string('contract').notNullable();
        table.integer('min_amount').notNullable();
        table.integer('max_amount');
        table.string('trait_type');
        table.string('trait_value');
        table.boolean('include_market').notNullable();
        table.string('guildId').references('guildId').inTable('guilds')
            .onDelete('CASCADE').onUpdate('CASCADE')
    }).createTable('wallets', function(table) {
        table.string('wallet').notNullable().unique();
        table.primary(['wallet']);
        table.string('userId').notNullable();
        table.integer('thetadrop').notNullable().defaultTo(false);
    }).createTable('users', function(table) {
        table.increments();
        table.string('userId').notNullable();
        table.string('guildId').notNullable().index();
        table.integer('thetadrop').notNullable().defaultTo(false);
        table.string('wallet').references('wallet').inTable('wallets')
            .onDelete('CASCADE').onUpdate('CASCADE').index()
        table.unique(['userId', 'guildId', 'thetadrop']);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTableIfExists('guilds').dropTableIfExists("wallets").dropTableIfExists("users").dropTableIfExists("roles");
};
