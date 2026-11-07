'use strict';
/*
 * Test harness: boots the real app against a real Postgres database.
 * Set TEST_DATABASE_URL (default: a local server on port 5433). The schema is dropped and recreated.
 */
const { makePool, migrate } = require('../server/db');
const { createApp } = require('../server/app');

const URL_ = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/optima_test';

async function boot() {
  const pool = makePool(URL_);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  const server = await new Promise((resolve) => { const s = createApp(pool).listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { pool, server, base, close: async () => { server.close(); await pool.end(); } };
}

/* A tiny HTTP client that keeps its own cookie jar, like a browser tab. */
class Client {
  constructor(base) { this.base = base; this.cookie = ''; }

  async req(method, path, body, headers = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const pair = c.split(';')[0];
      if (pair.endsWith('=')) this.cookie = '';
      else this.cookie = pair;
    }
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, json, headers: res.headers, setCookie: set };
  }

  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  patch(p, b) { return this.req('PATCH', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
}

module.exports = { boot, Client };
