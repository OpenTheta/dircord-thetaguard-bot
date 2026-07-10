const pino = require('pino');

// Structured JSON logging. Level via LOG_LEVEL (default info; tests run
// silent). Attach context as the first argument object:
//   logger.warn({ guildId, userId }, 'message')
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

module.exports = { logger };
