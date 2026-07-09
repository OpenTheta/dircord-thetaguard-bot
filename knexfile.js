// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {

  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILE || './db/ThetaGuard.db'
    },
    pool: {
      afterCreate: (conn, done) => {
        conn.run("PRAGMA foreign_key = ON", done);
      }
    },
    useNullAsDefault: true,
  },
};
