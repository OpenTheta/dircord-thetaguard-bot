const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/', 'db/', 'coverage/'],
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                // The discord.js client is (for now) shared as a global;
                // removed in the Phase 2 restructure.
                client: 'writable',
            },
        },
        rules: {
            // The legacy code has plenty of unused imports/vars; cleaned up in
            // Phase 1. Keep visible as warnings without failing CI.
            'no-unused-vars': 'warn',
        },
    },
    {
        files: ['tests/**/*.js', 'vitest.config.js'],
        languageOptions: {
            sourceType: 'module',
        },
    },
];
