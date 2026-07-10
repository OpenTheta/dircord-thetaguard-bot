const express = require('express');

// Shared middleware for the frontend-facing API. CORS stays permissive (*)
// because the frontend is served from a different origin; narrowing it to an
// allow-list is planned for Phase 4.
function applyMiddleware(app) {
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(function (req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header(
            'Access-Control-Allow-Headers',
            'Origin, X-Requested-With, Content-Type, Accept'
        );
        next();
    });
}

// Uniform 500 handler. The body shape (and the default message) is part of
// the frontend contract.
function handleErrors(res, error, message) {
    console.log('Error:', error);
    res.status(500).json({ error: message || 'Internal server error' });
}

module.exports = { applyMiddleware, handleErrors };
