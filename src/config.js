require('dotenv').config();

function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

// Central place for all environment configuration. Fails fast at boot when a
// required variable is missing instead of dying later at client.login().
function loadConfig() {
    return {
        discordBotToken: required('DISCORD_BOT_TOKEN'),
        port: Number(process.env.PORT) || 5001,
        apiBaseUrl: process.env.API_BASE_URL || 'https://api.opentheta.io/v1/',
        verifyBaseUrl: process.env.VERIFY_BASE_URL || 'https://opentheta.io/thetaguard/',
        syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS) || 300000,
        // Comma-separated CORS origin allow-list; empty keeps the historic
        // wildcard so the deployed frontend keeps working without new config.
        corsOrigins: (process.env.CORS_ORIGINS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        rateLimit: {
            windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
            limit: Number(process.env.RATE_LIMIT_MAX) || 300,
        },
    };
}

module.exports = { loadConfig };
