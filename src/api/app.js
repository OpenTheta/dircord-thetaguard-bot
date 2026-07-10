const express = require('express');
const { applyMiddleware } = require('./middleware');
const { createUserRoutes } = require('./routes/user.routes');
const { createAdminRoutes } = require('./routes/admin.routes');

// Express app factory. Everything the routes need is injected, so tests can
// build a fully working API with a fake Discord client and a temp database.
function createApp({ client, repos, requestStore, roleSync }) {
    const app = express();
    applyMiddleware(app);

    app.use(createAdminRoutes({ client, repos, requestStore, roleSync }));
    // mounted last: contains the root-level GET /:requestId catch-all
    app.use(createUserRoutes({ repos, requestStore, roleSync }));

    return app;
}

module.exports = { createApp };
