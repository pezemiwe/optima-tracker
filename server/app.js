'use strict';
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { HttpError } = require('./util');
const { authenticate, originCheck, requireJson } = require('./auth');
const { createMailer } = require('./mailer');

function createApp(pool, { mailer = createMailer() } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // JSON task lists compress about 10x, which matters most on slow connections.
  app.use(compression({ threshold: 1024 }));

  app.get('/healthz', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  app.use('/api', express.json({ limit: '256kb' }), originCheck, requireJson, authenticate(pool));
  app.use('/api', require('./routes/auth')(pool, { mailer }));
  app.use('/api', require('./routes/workspaces')(pool, { mailer }));
  app.use('/api', require('./routes/projects')(pool));
  app.use('/api', require('./routes/tasks')(pool));
  app.use('/api', require('./routes/collab')(pool));
  app.use('/api', require('./routes/files')(pool));
  app.use('/api', require('./routes/agile')(pool));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.', code: 'not_found' }));

  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist, {
    index: false,
    setHeaders: (res, p) => {
      if (/\.(woff2|js|css)$/.test(p) && /assets|fonts|vendor/.test(p)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    },
  }));
  // Single-page app: any other GET serves the shell so client-side routes work on refresh.
  app.get('*', (req, res, next) => {
    if (path.extname(req.path)) return next(); // a missing asset should 404, not return the app shell
    const index = path.join(dist, 'index.html');
    if (!fs.existsSync(index)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra || {}) });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.', code: 'invalid' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.', code: 'too_large' });
    // Postgres: bad id format, duplicate, missing reference, check violation.
    if (err.code === '22P02') return res.status(404).json({ error: 'Not found.', code: 'not_found' });
    if (err.code === '23505') return res.status(409).json({ error: 'That already exists.', code: 'conflict' });
    if (err.code === '23503') return res.status(400).json({ error: 'A referenced item does not exist.', code: 'invalid' });
    if (err.code === '23514') return res.status(400).json({ error: 'That value is not allowed.', code: 'invalid' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.', code: 'server_error' });
  });

  return app;
}

module.exports = { createApp };
