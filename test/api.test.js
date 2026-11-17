'use strict';
// Runs against a real Postgres. Set TEST_DATABASE_URL, e.g. postgres://postgres@localhost:5432/optima_test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createApp, migrate, removePlaceholderTasks } = require('../server');

const URL_ = process.env.TEST_DATABASE_URL;
if (!URL_) { console.log('TEST_DATABASE_URL not set, skipping.'); process.exit(0); }

let server, base, pool;

async function api(method, path, { body } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await r.json(); } catch (e) { /* no body */ }
  return { status: r.status, json };
}
const task = (over = {}) => ({ title: 'T', ws: 'OPEX', owner: 'A', watcher: '', priority: 'med', status: 'todo', day: '2026-11-05', due: '', note: '', createdAt: 1, doneAt: null, ...over });

test.before(async () => {
  pool = new Pool({ connectionString: URL_ });
  await pool.query('DROP TABLE IF EXISTS docs, meta, audit, app_settings');
  await migrate(pool);
  const app = createApp(pool);
  await new Promise((res) => { server = app.listen(0, res); });
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server.close(); await pool.end(); });

test('tracker data and writes are available without signing in', async () => {
  assert.equal((await api('GET', '/healthz')).status, 200);
  assert.equal((await api('GET', '/api/sync')).status, 200);
  assert.equal((await api('POST', '/api/login', { body: {} })).status, 404);
});

test('a new tracker starts with empty workstreams, owners, and tasks', async () => {
  const { json } = await api('GET', '/api/sync');
  assert.deepEqual(json.workstreams, []);
  assert.deepEqual(json.owners, []);
  assert.deepEqual(json.tasks, []);
});

test('placeholder cleanup removes only shipped demo tasks and their subtasks', async () => {
  await pool.query(
    "INSERT INTO docs (coll, id, data) VALUES ('tasks', $1, $2), ('tasks', $3, $4), ('subtasks', $5, $6)",
    [
      't-print-paper-feedback', task({ title: 'Placeholder' }),
      'real-task', task({ title: 'Keep this task' }),
      'placeholder-subtask', { parent: 't-print-paper-feedback', title: 'Placeholder subtask', done: false },
    ],
  );
  assert.equal(await removePlaceholderTasks(pool), 1);
  const { rows } = await pool.query("SELECT coll, id FROM docs ORDER BY id");
  assert.deepEqual(rows, [{ coll: 'tasks', id: 'real-task' }]);
  await pool.query("DELETE FROM docs WHERE id='real-task'");
});

test('sync returns data and answers unchanged for the same revision', async () => {
  const a = await api('GET', '/api/sync');
  assert.equal(a.json.tasks.length, 0);
  const b = await api('GET', '/api/sync?since=' + a.json.rev);
  assert.equal(b.json.unchanged, true);
});

test('create, patch, delete with server-assigned numbers', async () => {
  const c = await api('POST', '/api/tasks', { body: { data: task({ n: 999, title: 'First new' }) } });
  assert.equal(c.status, 201);
  assert.equal(c.json.n, 1, 'client number is ignored');
  const p = await api('PATCH', '/api/tasks/' + c.json.id, { body: { data: { status: 'doing', n: 77, escalatedAt: 5, escalatedTo: 'Anonymous' } } });
  assert.equal(p.status, 200);
  const s = await api('GET', '/api/sync');
  const row = s.json.tasks.find((t) => t.id === c.json.id).data;
  assert.equal(row.status, 'doing');
  assert.equal(row.n, 1);
  assert.equal(row.title, 'First new');
  assert.equal(row.escalatedTo, 'Anonymous');
  assert.equal((await api('PATCH', '/api/tasks/nope', { body: { data: { status: 'done' } } })).status, 404);
  const d = await api('DELETE', '/api/tasks/' + c.json.id);
  assert.equal(d.status, 200);
  assert.equal((await api('GET', '/api/sync')).json.tasks.length, 0);
});

test('workstreams and team owners can be managed and in-use options are protected', async () => {
  assert.equal((await api('POST', '/api/options/workstreams', { body: { name: 'Pilot' } })).status, 201);
  assert.equal((await api('POST', '/api/options/owners', { body: { name: 'Alex' } })).status, 201);
  assert.equal((await api('POST', '/api/options/workstreams', { body: { name: ' pilot ' } })).status, 409);

  const created = await api('POST', '/api/tasks', { body: { data: task({ ws: 'Pilot', owner: 'Alex' }) } });
  assert.equal(created.status, 201);
  assert.equal((await api('DELETE', '/api/options/workstreams/Pilot')).status, 409);
  assert.equal((await api('DELETE', '/api/options/owners/Alex')).status, 409);

  const sync = (await api('GET', '/api/sync')).json;
  assert.deepEqual(sync.workstreams, ['Pilot']);
  assert.deepEqual(sync.owners, ['Alex']);
  await api('DELETE', '/api/tasks/' + created.json.id);
  assert.equal((await api('DELETE', '/api/options/workstreams/Pilot')).status, 200);
  assert.equal((await api('DELETE', '/api/options/owners/Alex')).status, 200);
  const empty = (await api('GET', '/api/sync')).json;
  assert.deepEqual(empty.workstreams, []);
  assert.deepEqual(empty.owners, []);
});

test('twenty anonymous writers get twenty different task numbers', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => api('POST', '/api/tasks', { body: { data: task({ title: 'Burst ' + i }) } })));
  assert.ok(rs.every((r) => r.status === 201));
  const ns = rs.map((r) => r.json.n).sort((a, b) => a - b);
  assert.equal(new Set(ns).size, 20);
  assert.equal(ns[19] - ns[0], 19);
});

test('capacity: 100 tasks and 300 subtasks load in one sync', async () => {
  const before = (await api('GET', '/api/sync')).json.tasks.length;
  for (let i = 0; i < Math.max(0, 100 - before); i++) await api('POST', '/api/tasks', { body: { data: task({ title: 'Cap ' + i }) } });
  const parent = (await api('GET', '/api/sync')).json.tasks[0].id;
  for (let start = 0; start < 300; start += 25) {
    await Promise.all(Array.from({ length: 25 }, (_, offset) => {
      const i = start + offset;
      return api('POST', '/api/subtasks', { body: { data: { parent, title: 'Sub ' + i, done: false, owner: '', createdAt: i } } });
    }));
  }
  const s = (await api('GET', '/api/sync')).json;
  assert.ok(s.tasks.length >= 100);
  assert.equal(s.subtasks.length, 300);
});

test('validation rejects bad input', async () => {
  const bad = async (data) => (await api('POST', '/api/tasks', { body: { data } })).status;
  assert.equal(await bad(task({ status: 'blocked' })), 400);
  assert.equal(await bad(task({ priority: 'urgent' })), 400);
  assert.equal(await bad(task({ day: '5 Nov' })), 400);
  assert.equal(await bad(task({ due: '9am' })), 400);
  assert.equal(await bad(task({ title: '   ' })), 400);
  assert.equal(await bad({ ...task(), extra: 1 }), 400);
  assert.equal(await bad({ title: 'x' }), 400);
  assert.equal((await api('POST', '/api/other', { body: { data: {} } })).status, 404);
  assert.equal((await api('POST', '/api/subtasks', { body: { data: { parent: 'x' } } })).status, 400);
});

test('deleting a task removes its subtasks', async () => {
  const t = (await api('POST', '/api/tasks', { body: { data: task({ title: 'With subs' }) } })).json.id;
  for (let i = 0; i < 3; i++) await api('POST', '/api/subtasks', { body: { data: { parent: t, title: 'S' + i, done: false, owner: '', createdAt: i } } });
  await api('DELETE', '/api/tasks/' + t);
  const s = (await api('GET', '/api/sync')).json;
  assert.equal(s.subtasks.filter((x) => x.data.parent === t).length, 0);
});

test('writes are recorded anonymously in the audit table', async () => {
  const { rows } = await pool.query("SELECT who, action FROM audit WHERE action='create' ORDER BY id DESC LIMIT 1");
  assert.equal(rows[0].who, 'Anonymous');
  const n = await pool.query('SELECT count(*)::int AS c FROM audit');
  assert.ok(n.rows[0].c > 20);
});
