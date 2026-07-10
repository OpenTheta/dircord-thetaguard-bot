// Composition root: builds every component, wires the dependencies, and
// starts the HTTP API and the Discord bot.
const { loadConfig } = require('./config');
const { logger } = require('./logger');
const { createDb } = require('./db/knex');
const { migrateDb } = require('./db/migrate');
const { createRepositories } = require('./db/repositories');
const { createRequestStore } = require('./services/requestStore');
const { createOpenThetaApi } = require('./services/openTheta');
const { createRoleSync } = require('./services/roleSync');
const { createClient } = require('./bot/client');
const { createInteractionHandlers } = require('./bot/interactions');
const { registerBotEvents } = require('./bot/events');
const { createFullSync } = require('./jobs/fullSync');
const { createApp } = require('./api/app');

async function main() {
    const config = loadConfig();

    const db = createDb();
    // Schema changes ship as additive knex migrations and run here, before
    // anything can touch the database.
    await migrateDb(db);

    const repos = createRepositories(db);
    const requestStore = createRequestStore({ repo: repos.pendingRequests });
    // Restore verification sessions that were in flight during the restart.
    await requestStore.load();
    const openTheta = createOpenThetaApi({ baseUrl: config.apiBaseUrl });

    const client = createClient();
    const roleSync = createRoleSync({ client, repos, openTheta });
    const fullSync = createFullSync({ repos, roleSync });
    const interactions = createInteractionHandlers({
        requestStore,
        verifyBaseUrl: config.verifyBaseUrl,
    });

    const botEvents = registerBotEvents(client, {
        repos,
        requestStore,
        interactions,
        fullSync,
        syncIntervalMs: config.syncIntervalMs,
    });

    const app = createApp({
        client,
        db,
        repos,
        requestStore,
        roleSync,
        corsOrigins: config.corsOrigins,
        rateLimit: config.rateLimit,
    });
    const httpServer = app.listen(config.port, () => {
        logger.info({ port: config.port }, 'HTTP API listening');
    });

    let shuttingDown = false;
    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal }, 'Shutting down');
        // Hard exit if a component refuses to close.
        setTimeout(() => {
            logger.error('Forced exit after shutdown timeout');
            process.exit(1);
        }, 10000).unref();

        botEvents.stop();
        const closed = new Promise((resolve) => httpServer.close(resolve));
        httpServer.closeIdleConnections?.();
        await closed;
        await client.destroy();
        await db.destroy();
        logger.info('Shutdown complete');
        process.exit(0);
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // A failed login (bad token, Discord outage) exits cleanly; the
    // container restart policy takes care of retrying.
    client.login(config.discordBotToken).catch((e) => {
        logger.error({ err: e }, 'Discord login failed');
        process.exit(1);
    });
}

main().catch((e) => {
    logger.error({ err: e }, 'Fatal error during startup');
    process.exit(1);
});
