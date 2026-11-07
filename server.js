'use strict';
/*
 * Optima Work Tracker server.
 * Express + Postgres JSON API with cookie sessions, serving the React app from dist/.
 */
const { makePool, migrate } = require('./server/db');
const { createApp } = require('./server/app');

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }
  const pool = makePool();
  pool.on('error', (e) => console.error('pg pool error', e.message));
  await migrate(pool);
  createApp(pool).listen(PORT, '0.0.0.0', () => console.log(`Optima Work Tracker listening on ${PORT}.`));
}

module.exports = { createApp, migrate, makePool };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
