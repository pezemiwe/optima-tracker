'use strict';
/*
 * Optima close-out tracker server.
 * Serves the static page and a small JSON API backed by Postgres.
 * The API is public; anyone who can reach it can edit tracker data.
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

/* ---------- validation ---------- */
const STATUS = ['todo', 'doing', 'done', 'merged', 'closed'];
const PRIORITY = ['high', 'med', 'low'];
const str = (max) => (v) => typeof v === 'string' && v.length <= max;
const ms = (v) => Number.isFinite(v) && v >= 0;
const msOrNull = (v) => v === null || ms(v);
const SCHEMA = {
  tasks: {
    n: (v) => Number.isInteger(v) && v >= 0 && v < 1e6,
    title: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 300,
    ws: str(60), owner: str(80), watcher: str(80),
    priority: (v) => PRIORITY.includes(v),
    status: (v) => STATUS.includes(v),
    day: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
    due: (v) => typeof v === 'string' && /^(\d{2}:\d{2})?$/.test(v),
    note: str(5000),
    createdAt: ms, doneAt: msOrNull, escalatedAt: msOrNull, updatedAt: msOrNull,
    escalatedTo: (v) => v === null || str(80)(v),
  },
  subtasks: {
    parent: str(100),
    title: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 300,
    done: (v) => typeof v === 'boolean',
    owner: str(80),
    createdAt: ms,
  },
};
const OPTION_TYPES = {
  workstreams: { field: 'ws', maxLength: 60, label: 'workstream' },
  owners: { field: 'owner', maxLength: 80, label: 'team owner' },
};
const PLACEHOLDER_TASK_IDS = [
  't-print-paper-feedback',
  't-dams-feedback',
  't-opex-feedback',
  't-e2e-testing',
];
const REQUIRED = {
  tasks: ['title', 'day', 'status', 'priority'],
  subtasks: ['parent', 'title'],
};
function clean(coll, data, creating) {
  const sch = SCHEMA[coll];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Body must be an object.' };
  const out = {};
  for (const k of Object.keys(data)) {
    if (!sch[k]) return { error: 'Unknown field: ' + k };
    if (!sch[k](data[k])) return { error: 'Invalid value for ' + k };
    out[k] = data[k];
  }
  if (creating) for (const k of REQUIRED[coll]) if (!(k in out)) return { error: 'Missing field: ' + k };
  return { data: out };
}

/* ---------- database ---------- */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS docs (
  coll text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coll, id)
);
CREATE TABLE IF NOT EXISTS meta (k text PRIMARY KEY, v bigint NOT NULL);
INSERT INTO meta (k, v) VALUES ('rev', 1) ON CONFLICT (k) DO NOTHING;
CREATE TABLE IF NOT EXISTS audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  who text NOT NULL,
  action text NOT NULL,
  coll text NOT NULL,
  doc text NOT NULL,
  detail jsonb
);
CREATE TABLE IF NOT EXISTS app_settings (
  name text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO app_settings (name, value) VALUES
  ('workstreams', '[]'::jsonb),
  ('owners', '[]'::jsonb)
ON CONFLICT (name) DO NOTHING;`;

function makePool() {
  let host = '';
  try { host = new URL(DATABASE_URL).hostname; } catch (e) { /* leave empty */ }
  // Render's internal hostname has no dots and needs no TLS; the external one does.
  const plain = process.env.PGSSL === 'off' || host === 'localhost' || host === '127.0.0.1' || !host.includes('.');
  return new Pool({ connectionString: DATABASE_URL, max: 8, ssl: plain ? false : { rejectUnauthorized: false } });
}

async function migrate(pool) {
  await pool.query(SCHEMA_SQL);
}

async function removePlaceholderTasks(pool) {
  const { rows } = await pool.query(
    "SELECT id FROM docs WHERE coll='tasks' AND id = ANY($1::text[])",
    [PLACEHOLDER_TASK_IDS],
  );
  if (!rows.length) return 0;

  const { result } = await write(pool, async (c) => {
    const { rows: deleted } = await c.query(
      "DELETE FROM docs WHERE coll='tasks' AND id = ANY($1::text[]) RETURNING id",
      [PLACEHOLDER_TASK_IDS],
    );
    if (!deleted.length) return 0;
    await c.query(
      "DELETE FROM docs WHERE coll='subtasks' AND data->>'parent' = ANY($1::text[])",
      [deleted.map((row) => row.id)],
    );
    for (const row of deleted) {
      await c.query(
        'INSERT INTO audit (who, action, coll, doc, detail) VALUES ($1,$2,$3,$4,$5)',
        ['Anonymous', 'delete', 'tasks', row.id, { reason: 'Remove placeholder task' }],
      );
    }
    return deleted.length;
  });
  return result;
}

// Runs fn(client) inside a transaction holding the single revision row lock, so writes are serial.
async function write(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query("UPDATE meta SET v = v + 1 WHERE k='rev' RETURNING v");
    const result = await fn(c);
    await c.query('COMMIT');
    return { result, rev: Number(rows[0].v) };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

/* ---------- app ---------- */
function createApp(pool) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); }
    catch (e) { res.status(503).json({ ok: false }); }
  });

  const requireJson = (req, res, next) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '') && req.method !== 'DELETE') {
      return res.status(415).json({ error: 'JSON required.' });
    }
    next();
  };
  const collOk = (req, res, next) => {
    if (!SCHEMA[req.params.coll]) return res.status(404).json({ error: 'Unknown collection.' });
    next();
  };

  app.get('/api/sync', async (req, res) => {
    try {
      const { rows: m } = await pool.query("SELECT v FROM meta WHERE k='rev'");
      const rev = Number(m[0].v);
      if (req.query.since !== undefined && Number(req.query.since) === rev) return res.json({ rev, unchanged: true });
      const [{ rows }, { rows: settings }] = await Promise.all([
        pool.query('SELECT coll, id, data FROM docs ORDER BY created_at, id'),
        pool.query('SELECT name, value FROM app_settings'),
      ]);
      const out = { rev, tasks: [], subtasks: [], workstreams: [], owners: [] };
      for (const r of rows) if (out[r.coll]) out[r.coll].push({ id: r.id, data: r.data });
      for (const setting of settings) if (out[setting.name]) out[setting.name] = setting.value;
      res.json(out);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load.' }); }
  });

  app.post('/api/options/:kind', requireJson, async (req, res) => {
    const { kind } = req.params;
    const option = OPTION_TYPES[kind];
    if (!option) return res.status(404).json({ error: 'Unknown option list.' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > option.maxLength) {
      return res.status(400).json({ error: `Enter a name of 1-${option.maxLength} characters.` });
    }

    try {
      const { rev } = await write(pool, async (c) => {
        const { rows } = await c.query('SELECT value FROM app_settings WHERE name=$1 FOR UPDATE', [kind]);
        const values = rows[0]?.value;
        if (!Array.isArray(values)) throw new Error('Option list is not configured.');
        if (values.some((value) => value.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          const error = new Error(`That ${option.label} already exists.`);
          error.status = 409;
          throw error;
        }
        await c.query('UPDATE app_settings SET value=$2 WHERE name=$1', [kind, JSON.stringify([...values, name])]);
        await c.query(
          'INSERT INTO audit (who, action, coll, doc, detail) VALUES ($1,$2,$3,$4,$5)',
          ['Anonymous', 'create', 'settings', kind, { name }],
        );
      });
      res.status(201).json({ ok: true, rev });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: `Could not add ${option.label}.` });
    }
  });

  app.delete('/api/options/:kind/:name', async (req, res) => {
    const { kind } = req.params;
    const option = OPTION_TYPES[kind];
    if (!option) return res.status(404).json({ error: 'Unknown option list.' });
    const name = req.params.name.trim();
    if (!name) return res.status(400).json({ error: 'Option name is required.' });

    try {
      const { rev } = await write(pool, async (c) => {
        const { rows } = await c.query('SELECT value FROM app_settings WHERE name=$1 FOR UPDATE', [kind]);
        const values = rows[0]?.value;
        if (!Array.isArray(values)) throw new Error('Option list is not configured.');
        const existing = values.find((value) => value.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (!existing) {
          const error = new Error(`That ${option.label} was not found.`);
          error.status = 404;
          throw error;
        }
        const assigned = await c.query(
          `SELECT id FROM docs WHERE coll='tasks' AND lower(data->>'${option.field}')=lower($1) LIMIT 1`,
          [existing],
        );
        if (assigned.rowCount) {
          const error = new Error(`Reassign tasks before removing this ${option.label}.`);
          error.status = 409;
          throw error;
        }
        await c.query('UPDATE app_settings SET value=$2 WHERE name=$1', [
          kind,
          JSON.stringify(values.filter((value) => value !== existing)),
        ]);
        await c.query(
          'INSERT INTO audit (who, action, coll, doc, detail) VALUES ($1,$2,$3,$4,$5)',
          ['Anonymous', 'delete', 'settings', kind, { name: existing }],
        );
      });
      res.json({ ok: true, rev });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: `Could not remove ${option.label}.` });
    }
  });

  app.post('/api/:coll', collOk, requireJson, async (req, res) => {
    const { coll } = req.params;
    const v = clean(coll, req.body && req.body.data, true);
    if (v.error) return res.status(400).json({ error: v.error });
    const id = crypto.randomBytes(9).toString('base64url');
    try {
      const { result, rev } = await write(pool, async (c) => {
        const data = v.data;
        if (coll === 'tasks') {
          // The server numbers tasks so two people adding at once never share an ID.
          const { rows } = await c.query("SELECT COALESCE(MAX((data->>'n')::int),0)+1 AS n FROM docs WHERE coll='tasks'");
          data.n = rows[0].n;
        }
        data.createdAt = data.createdAt || Date.now();
        await c.query('INSERT INTO docs (coll, id, data) VALUES ($1,$2,$3)', [coll, id, data]);
        await c.query('INSERT INTO audit (who, action, coll, doc, detail) VALUES ($1,$2,$3,$4,$5)', ['Anonymous', 'create', coll, id, data]);
        return data;
      });
      res.status(201).json({ id, rev, n: result.n });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save.' }); }
  });

  app.patch('/api/:coll/:id', collOk, requireJson, async (req, res) => {
    const { coll, id } = req.params;
    const v = clean(coll, req.body && req.body.data, false);
    if (v.error) return res.status(400).json({ error: v.error });
    if ('n' in v.data) delete v.data.n; // numbers are assigned once, by the server
    if (!Object.keys(v.data).length) return res.status(400).json({ error: 'Nothing to change.' });
    try {
      const out = await write(pool, async (c) => {
        const r = await c.query("UPDATE docs SET data = data || $3::jsonb, updated_at = now() WHERE coll=$1 AND id=$2 RETURNING id", [coll, id, JSON.stringify(v.data)]);
        if (!r.rowCount) return null;
        await c.query('INSERT INTO audit (who, action, coll, doc, detail) VALUES ($1,$2,$3,$4,$5)', ['Anonymous', 'update', coll, id, v.data]);
        return true;
      });
      if (!out.result) return res.status(404).json({ error: 'That item no longer exists.' });
      res.json({ ok: true, rev: out.rev });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save.' }); }
  });

  app.delete('/api/:coll/:id', collOk, requireJson, async (req, res) => {
    const { coll, id } = req.params;
    try {
      const out = await write(pool, async (c) => {
        // Deleting a task takes its subtasks with it so none are left orphaned.
        let gone = 0;
        if (coll === 'tasks') {
          const s = await c.query("DELETE FROM docs WHERE coll='subtasks' AND data->>'parent' = $1", [id]);
          gone += s.rowCount;
        }
        const r = await c.query('DELETE FROM docs WHERE coll=$1 AND id=$2', [coll, id]);
        gone += r.rowCount;
        if (r.rowCount) await c.query('INSERT INTO audit (who, action, coll, doc) VALUES ($1,$2,$3,$4)', ['Anonymous', 'delete', coll, id]);
        return r.rowCount;
      });
      res.json({ ok: true, existed: !!out.result, rev: out.rev });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Could not delete.' }); }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  app.use(express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, p) => {
      if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (/\.(woff2|js)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=604800');
    },
  }));
  return app;
}

/* ---------- boot ---------- */
async function main() {
  if (!DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const pool = makePool();
  pool.on('error', (e) => console.error('pg pool error', e.message));
  await migrate(pool);
  const removed = await removePlaceholderTasks(pool);
  if (removed) console.log(`Removed ${removed} placeholder tasks.`);
  createApp(pool).listen(PORT, '0.0.0.0', () => console.log(`Optima tracker listening on ${PORT}.`));
}

module.exports = { createApp, migrate, removePlaceholderTasks };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
