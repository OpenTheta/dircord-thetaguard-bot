// Startup migration runner with a one-time baseline guard.
//
// The production database was created when only the initial 2023 migration
// existed. If it was ever created by hand (schema present but no
// knex_migrations table), a plain `migrate.latest()` would try to re-create
// existing tables and crash. The guard detects that case and records the
// initial migration as already applied, so `migrate.latest()` only ever runs
// the new, additive migrations.

const { logger } = require('../logger');

const BASELINE_MIGRATION = '20230306124539_thetaguard-table.js';

async function baselineIfNeeded(db) {
    const hasSchema = await db.schema.hasTable('guilds');
    const hasMigrations = await db.schema.hasTable('knex_migrations');
    if (!hasSchema || hasMigrations) return;

    logger.info('[migrate] Existing schema without migration history detected — baselining');
    // Mirrors the table knex itself creates.
    await db.schema.createTable('knex_migrations', (table) => {
        table.increments();
        table.string('name');
        table.integer('batch');
        table.timestamp('migration_time');
    });
    await db('knex_migrations').insert({
        name: BASELINE_MIGRATION,
        batch: 1,
        migration_time: new Date(),
    });
}

async function migrateDb(db) {
    await baselineIfNeeded(db);
    const [, applied] = await db.migrate.latest();
    if (applied.length) {
        logger.info({ migrations: applied }, '[migrate] Applied pending migrations');
    } else {
        logger.info('[migrate] Database schema is up to date');
    }
}

module.exports = { migrateDb, baselineIfNeeded };
