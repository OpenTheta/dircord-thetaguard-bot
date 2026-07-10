// Composition root: builds every component, wires the dependencies, and
// starts the HTTP API and the Discord bot.
const { loadConfig } = require('./config');
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

    registerBotEvents(client, {
        repos,
        requestStore,
        interactions,
        fullSync,
        syncIntervalMs: config.syncIntervalMs,
    });

    const app = createApp({ client, repos, requestStore, roleSync });
    app.listen(config.port, () => {
        console.log('server is running on port ' + config.port);
    });

    client.login(config.discordBotToken);
}

main().catch((e) => {
    console.error('Fatal error during startup', e);
    process.exit(1);
});
