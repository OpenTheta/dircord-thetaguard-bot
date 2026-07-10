const knex = require('knex');
const knexConfig = require('../../knexfile');

// Single place that turns the knexfile into a live connection, selected by
// NODE_ENV (all environments currently share the same settings; the file
// path comes from DB_FILE).
function createDb() {
    const env = process.env.NODE_ENV || 'development';
    const config = knexConfig[env] || knexConfig.development;
    return knex(config);
}

module.exports = { createDb };
