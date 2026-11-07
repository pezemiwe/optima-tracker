'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { boot, Client } = require('./helpers');

const PASSWORD = 'correct horse battery';
let env, owner, other, project, statusId;

test.before(async () => {
  process.env.SEED = 'off';
  env = await boot();
  owner = new Client(env.base);
  const r = await owner.post('/api/auth/register', { name: 'Owner', email: 'owner@example.com', password: PASSWORD, workspaceName: 'Acme' });
  const wid = r.json.workspaces[0].id;
  project = (await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Big' })).json.project;
  statusId = (await owner.get(`/api/projects/${project.id}`)).json.statuses[0].id;
  const inv = await owner.post(`/api/workspaces/${wid}/invites`, { email: 'o@example.com', role: 'member' });
  other = new Client(env.base);
  await other.post('/api/auth/register', { name: 'Other', email: 'o@example.com', password: PASSWORD, inviteToken: inv.json.token });
  // 1,500 tasks, deliberately many with the same position so the cursor must break ties by number.
  await env.pool.query(
    `INSERT INTO tasks (project_id, number, title, description, status_id, position)
     SELECT $1, n, 'Bulk task ' || n, repeat('x', 200), $2, (n / 7)::int * 1000 FROM generate_series(1000, 2499) AS n`,
    [project.id, statusId],
  );
  await env.pool.query('UPDATE projects SET task_seq = 2499 WHERE id = $1', [project.id]);
});
test.after(async () => { delete process.env.SEED; await env.close(); });

test('pages cover every task exactly once, in order, even when positions tie', async () => {
  const seen = [];
  let after = '';
  let pages = 0;
  let total = null;
  for (;;) {
    const r = await owner.get(`/api/projects/${project.id}/tasks?limit=400${after}`);
    assert.equal(r.status, 200);
    if (r.json.total !== undefined) total = r.json.total;
    seen.push(...r.json.tasks);
    pages++;
    if (!r.json.next) break;
    after = `&after=${encodeURIComponent(r.json.next)}`;
    assert.ok(pages < 20, 'terminates');
  }
  assert.equal(total, 1500, 'the first page reports the total');
  assert.equal(pages, 4);
  assert.equal(seen.length, 1500);
  assert.equal(new Set(seen.map((t) => t.id)).size, 1500, 'no duplicates and none missing');
  const keys = seen.map((t) => [t.position, t.number]);
  assert.ok(keys.every((k, i) => i === 0 || k[0] > keys[i - 1][0] || (k[0] === keys[i - 1][0] && k[1] > keys[i - 1][1])), 'stable board order');
});

test('limits are clamped, cursors are validated, and the unpaged call still returns everything', async () => {
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks?limit=999999`)).json.tasks.length, 1500, 'limit is capped at 2000, so all 1500 fit');
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks?limit=0`)).json.tasks.length, 1, 'a limit of 0 becomes 1');
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks?limit=5&after=nonsense`)).status, 400);
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.length, 1500);
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks`)).json.next, undefined);
  const out = await owner.get(`/api/projects/${project.id}/tasks?limit=10&after=1e308:99999999`);
  assert.deepEqual(out.json.tasks, [], 'past the end is an empty page');
  assert.equal(out.json.next, null);
});

/* A raw request, so the bytes counted are the bytes on the wire (fetch would decompress them). */
function rawGet(url, headers) {
  const http = require('node:http');
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('large responses are gzipped and decompress to the same data', async () => {
  const url = `${env.base}/api/projects/${project.id}/tasks`;
  const gz = await rawGet(url, { Cookie: owner.cookie, 'Accept-Encoding': 'gzip' });
  const plain = await rawGet(url, { Cookie: owner.cookie, 'Accept-Encoding': 'identity' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.ok(gz.body.length < plain.body.length / 4, `compressed ${gz.body.length} bytes vs ${plain.body.length}`);
  assert.deepEqual(JSON.parse(zlib.gunzipSync(gz.body)), JSON.parse(plain.body.toString()), 'identical content');
});

test('editing the same field at the same time is detected; unrelated edits are not', async () => {
  const t = (await owner.post(`/api/projects/${project.id}/tasks`, { title: 'Original', description: 'first draft' })).json.task;
  // Both people open the task and start from the same text.
  const base = { title: 'Original', description: 'first draft' };
  const a = await owner.patch(`/api/tasks/${t.id}`, { description: 'Owner rewrote this', base });
  assert.equal(a.status, 200);

  const b = await other.patch(`/api/tasks/${t.id}`, { description: 'Other rewrote this too', base });
  assert.equal(b.status, 409);
  assert.equal(b.json.code, 'conflict');
  assert.deepEqual(b.json.conflicts, ['description']);
  assert.equal(b.json.current.description, 'Owner rewrote this', 'the response carries the winning text');

  // A different field from the same stale base is fine.
  const c = await other.patch(`/api/tasks/${t.id}`, { title: 'Renamed by other', base });
  assert.equal(c.status, 200);
  // Saving exactly what is already there is not a conflict.
  assert.equal((await other.patch(`/api/tasks/${t.id}`, { description: 'Owner rewrote this', base })).status, 200);
  // Choosing "keep mine" means sending without a base, which always wins.
  const keep = await other.patch(`/api/tasks/${t.id}`, { description: 'Other wins', base: undefined });
  assert.equal(keep.status, 200);
  assert.equal((await owner.get(`/api/tasks/${t.id}`)).json.task.description, 'Other wins');
  assert.equal((await owner.patch(`/api/tasks/${t.id}`, { description: 'x', base: { description: 5 } })).status, 400);
  assert.equal((await owner.patch(`/api/tasks/${t.id}`, { description: 'x', base: { priority: 'high' } })).status, 400, 'only title and description can be a base');
});
