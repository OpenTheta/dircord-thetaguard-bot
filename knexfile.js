const path = require('path');

// Shared SQLite settings. The pragmas run on every pooled connection:
// - foreign_keys: enables FK enforcement/cascades (a typo — "foreign_key" —
//   had left this OFF since 2023; migrations clean up the resulting orphans)
// - journal_mode WAL: crash safety + concurrent readers
// - busy_timeout: wait instead of failing on a locked database
const base = {
    client: 'sqlite3',
    connection: {
        filename: process.env.DB_FILE || './db/ThetaGuard.db',
    },
    pool: {
        afterCreate: (conn, done) => {
            conn.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) return done(err, conn);
                conn.run('PRAGMA journal_mode = WAL', (err2) => {
                    if (err2) return done(err2, conn);
                    conn.run('PRAGMA busy_timeout = 5000', (err3) => done(err3, conn));
                });
            });
        },
    },
    migrations: {
        directory: path.join(__dirname, 'migrations'),
    },
    useNullAsDefault: true,
};

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
    development: base,
    test: base,
    production: base,
};
