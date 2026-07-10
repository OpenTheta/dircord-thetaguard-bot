const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { logger } = require('../logger');

// Without an allow-list this reproduces the historic wildcard behavior; with
// CORS_ORIGINS set, only listed origins are echoed back.
function corsMiddleware(allowedOrigins) {
    return function (req, res, next) {
        if (!allowedOrigins || allowedOrigins.length === 0) {
            res.header('Access-Control-Allow-Origin', '*');
        } else {
            const origin = req.headers.origin;
            if (origin && allowedOrigins.includes(origin)) {
                res.header('Access-Control-Allow-Origin', origin);
                res.header('Vary', 'Origin');
            }
        }
        res.header(
            'Access-Control-Allow-Headers',
            'Origin, X-Requested-With, Content-Type, Accept'
        );
        next();
    };
}

function applyMiddleware(app, { corsOrigins = [], rateLimit: rateLimitConfig = {} } = {}) {
    // one reverse-proxy hop (TLS termination) in front of the container
    app.set('trust proxy', 1);
    app.use(helmet());
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(corsMiddleware(corsOrigins));
    app.use(
        rateLimit({
            windowMs: rateLimitConfig.windowMs || 60000,
            // generous: the verify flow needs a dozen requests per user
            limit: rateLimitConfig.limit || 300,
            standardHeaders: true,
            legacyHeaders: false,
            skip: (req) => req.path === '/healthz',
        })
    );
}

// Uniform 500 handler. The body shape (and the default message) is part of
// the frontend contract.
function handleErrors(res, error, message) {
    logger.error({ err: error }, 'API request failed');
    res.status(500).json({ error: message || 'Internal server error' });
}

module.exports = { applyMiddleware, handleErrors };
