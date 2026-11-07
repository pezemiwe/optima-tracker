'use strict';
/*
 * Measures how the task API behaves with a big project.
 *   TEST_DATABASE_URL=postgres://... npm run bench [taskCount]
 * The database's public schema is recreated, so use a throwaway database.
 */
const http = require('node:http');
const { makePool, migrate } = require('../server/db');
const { createApp } = require('../server/app');

const N = Number(process.argv[2]) || 20000;
const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/optima_test';

function request(base, path, { cookie, gzip = true, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const req = http.request(base + path, {
      method,
      headers: { ...(cookie ? { Cookie: cookie } : {}), 'Accept-Encoding': gzip ? 'gzip' : 'identity', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, bytes: Buffer.concat(chunks).length, status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
const fmt = (ms) => `${ms.toFixed(0)} ms`;
const kb = (b) => `${(b / 1024).toFixed(0)} KB`;

(async () => {
  const pool = makePool(DB);
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool);
  process.env.SEED = 'off';
  const server = await new Promise((r) => { const s = createApp(pool).listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const reg = await request(base, '/api/auth/register', { method: 'POST', body: { name: 'Bench', email: 'bench@example.com', password: 'correct horse battery', workspaceName: 'Bench' } });
  const cookie = reg.headers['set-cookie'][0].split(';')[0];
  const wid = JSON.parse(reg.body).workspaces[0].id;
  const proj = JSON.parse((await request(base, `/api/workspaces/${wid}/projects`, { cookie, method: 'POST', body: { name: 'Bench project' } })).body).project;
  const statuses = JSON.parse((await request(base, `/api/projects/${proj.id}`, { cookie })).body).statuses;

  const t0 = Date.now();
  const statusIds = statuses.map((s) => s.id);
  for (let from = 1; from <= N; from += 5000) {
    await pool.query(
      `INSERT INTO tasks (project_id, number, title, description, status_id, priority, due_date, position)
       SELECT $1, n, 'Task number ' || n || ' with a realistic length title', repeat('lorem ipsum ', 20),
              ($2::uuid[])[1 + n % 4], (ARRAY['low','medium','high','urgent'])[1 + n % 4], date '2026-11-01' + (n % 60), n * 1000
         FROM generate_series($3::int, $4::int) n`,
      [proj.id, statusIds, from, Math.min(from + 4999, N)],
    );
  }
  await pool.query('UPDATE projects SET task_seq = $2 WHERE id = $1', [proj.id, N]);
  await pool.query('ANALYZE tasks');
  console.log(`Seeded ${N.toLocaleString()} tasks in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

  const rows = [];
  const time = async (label, path, opts) => {
    const runs = [];
    let last;
    for (let i = 0; i < 5; i++) { last = await request(base, path, { cookie, ...opts }); runs.push(last.ms); }
    runs.sort((a, b) => a - b);
    rows.push([label, fmt(runs[2]), fmt(runs[4]), kb(last.bytes)]);
    return last;
  };
  await time('first page of tasks (500), gzip', `/api/projects/${proj.id}/tasks?limit=500`);
  await time('first page of tasks (500), raw', `/api/projects/${proj.id}/tasks?limit=500`, { gzip: false });
  await time('largest page (2,000 tasks), gzip', `/api/projects/${proj.id}/tasks?limit=2000`);
  await time('project overview (statuses + labels)', `/api/projects/${proj.id}`);
  await time('workspace overview (dashboard)', `/api/workspaces/${wid}/overview`);
  await time('search "number 1999"', `/api/workspaces/${wid}/search?q=${encodeURIComponent('number 1999')}`);
  await time('my tasks', `/api/workspaces/${wid}/my-tasks`);
  await time('revision poll (every 5 s per open tab)', `/api/workspaces/${wid}/rev`);

  // Everything a browser does to open the project: all pages in sequence.
  const start = process.hrtime.bigint();
  let after = ''; let pages = 0; let bytes = 0;
  for (;;) {
    const r = await request(base, `/api/projects/${proj.id}/tasks?limit=500${after}`, { cookie });
    pages += 1; bytes += r.bytes;
    const j = JSON.parse(require('node:zlib').gunzipSync(r.body));
    if (!j.next) break;
    after = `&after=${encodeURIComponent(j.next)}`;
  }
  const open = Number(process.hrtime.bigint() - start) / 1e6;

  const w = [Math.max(...rows.map((r) => r[0].length)), 9, 9, 9];
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(['request (median of 5)', 'median', 'worst', 'bytes']));
  for (const r of rows) console.log(line(r));
  console.log(`\nOpening the whole project the way the app does: ${pages} pages, ${kb(bytes)} on the wire, ${fmt(open)} total (first page usable after the first request above).`);

  server.close();
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
