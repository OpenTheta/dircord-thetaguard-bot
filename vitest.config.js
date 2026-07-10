const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        env: {
            LOG_LEVEL: 'silent',
        },
        // Each test file gets its own module graph (and therefore its own
        // temp SQLite database via tests/helpers/setup.js).
        isolate: true,
        testTimeout: 15000,
    },
});
