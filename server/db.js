'use strict';
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Return dates and times as plain strings so no timezone conversion can shift a due date.
types.setTypeParser(1082, (s) => s); // date  -> 'YYYY-MM-DD'
types.setTypeParser(1083, (s) => s.slice(0, 5)); // time  -> 'HH:MM'

function makePool(url = process.env.DATABASE_URL) {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* leave empty */ }
  // Render's internal hostname has no dots and needs no TLS; the external one does.
  const plain = process.env.PGSSL === 'off' || host === 'localhost' || host === '127.0.0.1' || !host.includes('.');
  return new Pool({ connectionString: url, max: 10, ssl: plain ? false : { rejectUnauthorized: false } });
}

/* Applies server/migrations/*.sql in order, each once, under an advisory lock. */
async function migrate(pool) {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727001)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await c.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${e.message}`);
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    c.release();
  }
}

/* Runs fn(client) in a transaction. */
async function tx(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/* Bumps the workspace revision so polling clients know to refetch. */
async function touch(c, workspaceId) {
  const { rows } = await c.query('UPDATE workspaces SET rev = rev + 1 WHERE id = $1 RETURNING rev', [workspaceId]);
  return rows[0] ? Number(rows[0].rev) : null;
}

module.exports = { makePool, migrate, tx, touch };
