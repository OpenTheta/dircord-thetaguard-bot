// Data cleanup: foreign-key enforcement was unintentionally disabled since
// 2023 (a "foreign_key" pragma typo), so rows whose parent was deleted may
// have survived. Now that the pragma is fixed and cascades work, remove any
// orphans so the data matches what the schema promises. Logs what it deletes
// and is a no-op on a clean database.

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
    // roles rows whose guild row no longer exists
    const orphanedRoles = await knex('roles')
        .whereNotIn('guildId', knex('guilds').select('guildId'));
    if (orphanedRoles.length) {
        console.log(
            `[migration] Removing ${orphanedRoles.length} orphaned roles row(s) whose guild no longer exists:`,
            orphanedRoles.map((r) => `${r.roleId} (guild ${r.guildId})`).join(', ')
        );
        await knex('roles')
            .whereNotIn('guildId', knex('guilds').select('guildId'))
            .del();
    } else {
        console.log('[migration] No orphaned roles rows found');
    }

    // users rows whose wallet row no longer exists
    const orphanedUsers = await knex('users')
        .whereNotNull('wallet')
        .whereNotIn('wallet', knex('wallets').select('wallet'));
    if (orphanedUsers.length) {
        console.log(
            `[migration] Removing ${orphanedUsers.length} orphaned users row(s) whose wallet no longer exists:`,
            orphanedUsers.map((u) => `${u.userId}/${u.guildId} (wallet ${u.wallet})`).join(', ')
        );
        await knex('users')
            .whereNotNull('wallet')
            .whereNotIn('wallet', knex('wallets').select('wallet'))
            .del();
    } else {
        console.log('[migration] No orphaned users rows found');
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function () {
    // Deleting orphaned rows cannot be reversed.
};
