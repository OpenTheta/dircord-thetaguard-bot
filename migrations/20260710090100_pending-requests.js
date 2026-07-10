// Persistent verification sessions: the requestIds handed to users/admins
// used to live only in memory, so every restart or redeploy invalidated all
// links currently in flight. The request store now writes sessions through to
// this table and restores the unexpired ones at boot.

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.createTable('pending_requests', function (table) {
        table.string('requestId').notNullable().unique();
        table.primary(['requestId']);
        table.string('type').notNullable(); // 'user' | 'admin'
        table.string('guildId').index(); // for cleanup when the bot is kicked
        table.text('payload').notNullable(); // JSON-serialized session
        table.bigInteger('expiresAt').notNullable().index();
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.dropTableIfExists('pending_requests');
};
