const express = require('express');
const { applyMiddleware } = require('./middleware');
const { createUserRoutes } = require('./routes/user.routes');
const { createAdminRoutes } = require('./routes/admin.routes');
const { logger } = require('../logger');

// Express app factory. Everything the routes need is injected, so tests can
// build a fully working API with a fake Discord client and a temp database.
function createApp({ client, db, repos, requestStore, roleSync, corsOrigins, rateLimit }) {
    const app = express();
    applyMiddleware(app, { corsOrigins, rateLimit });

    // Registered before the routers: GET /:requestId is a root-level
    // catch-all and must not swallow the health probe.
    app.get('/healthz', async (req, res) => {
        try {
            await db.raw('select 1');
            const botReady = typeof client.isReady === 'function' ? client.isReady() : false;
            res.json({ status: 'ok', botReady });
        } catch (e) {
            logger.error({ err: e }, 'healthz database check failed');
            res.status(503).json({ status: 'error' });
        }
    });

    app.use(createAdminRoutes({ client, repos, requestStore, roleSync }));
    // mounted last: contains the root-level GET /:requestId catch-all
    app.use(createUserRoutes({ repos, requestStore, roleSync }));

    return app;
}

module.exports = { createApp };
