'use strict';
/* The upgrade path: a database that still holds the original document-style tracker data. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, Client } = require('./helpers');

let env;
test.before(async () => {
  env = await boot();
  // Recreate the old schema and fill it the way the original app did.
  await env.pool.query(`CREATE TABLE docs (coll text NOT NULL, id text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (coll, id))`);
  const put = (coll, id, data) => env.pool.query('INSERT INTO docs (coll, id, data) VALUES ($1,$2,$3)', [coll, id, data]);
  const done = Date.UTC(2026, 10, 5, 9, 30);
  await put('tasks', 'a1', { n: 1, title: 'Update DAMS module', ws: 'DAMS', owner: 'Samuel Kolajo', watcher: 'Tosin Ilesanmi', priority: 'high', status: 'doing', day: '2026-11-04', due: '14:00', note: 'Waiting on IT Admin', createdAt: Date.UTC(2026, 10, 1) });
  await put('tasks', 'a2', { n: 2, title: 'Finish testing', ws: 'Testing', owner: '', watcher: '', priority: 'med', status: 'done', day: '2026-11-03', due: '', note: '', createdAt: Date.UTC(2026, 10, 2), doneAt: done });
  await put('tasks', 'a3', { n: 5, title: 'Old blocked item', ws: 'OPEX', owner: 'Samuel Kolajo', watcher: '', priority: 'low', status: 'blocked', day: '2026-11-06', due: '', note: '', createdAt: Date.UTC(2026, 10, 3) });
  await put('tasks', 'a4', { n: 6, title: 'Merged change', ws: '', owner: '', watcher: '', priority: 'med', status: 'merged', day: '2026-11-06', due: '', note: '', createdAt: Date.UTC(2026, 10, 3), doneAt: done });
  await put('subtasks', 's1', { parent: 'a1', title: 'Collect notes', done: true, owner: 'Samuel Kolajo', createdAt: Date.UTC(2026, 10, 1, 1) });
  await put('subtasks', 's2', { parent: 'a1', title: 'Send summary', done: false, owner: '', createdAt: Date.UTC(2026, 10, 1, 2) });
  await put('subtasks', 'orphan', { parent: 'missing', title: 'Orphan', done: false, owner: '', createdAt: 1 });
});
test.after(async () => { await env.close(); });

test('the first account imports legacy rows into a Close-out project, once', async () => {
  const c = new Client(env.base);
  const r = await c.post('/api/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' });
  assert.equal(r.status, 201);
  assert.equal(r.json.imported, 4);
  const wid = r.json.workspaces[0].id;
  const project = (await c.get(`/api/workspaces/${wid}/projects`)).json.projects.find((p) => p.key === 'CLO');
  assert.ok(project);
  const bundle = (await c.get(`/api/projects/${project.id}`)).json;
  assert.deepEqual(bundle.statuses.map((s) => s.name), ['To do', 'In progress', 'Done', 'Merged', 'Closed']);
  assert.deepEqual(bundle.labels.map((l) => l.name).sort(), ['DAMS', 'OPEX', 'Testing'], 'workstreams become labels');
  const statusName = (id) => bundle.statuses.find((s) => s.id === id).name;
  const tasks = (await c.get(`/api/projects/${project.id}/tasks`)).json.tasks;
  const byNumber = (n) => tasks.find((t) => t.number === n);

  const t1 = byNumber(1);
  assert.equal(t1.title, 'Update DAMS module');
  assert.equal(statusName(t1.statusId), 'In progress');
  assert.equal(t1.priority, 'high');
  assert.equal(t1.dueDate, '2026-11-04');
  assert.equal(t1.dueTime, '14:00');
  assert.equal(t1.labelIds.length, 1);
  assert.equal(t1.subtaskCount, 2);
  assert.equal(t1.subtaskDone, 1);
  assert.equal(t1.completedAt, null);
  assert.equal(new Date(t1.createdAt).toISOString().slice(0, 10), '2026-11-01', 'creation dates are preserved');

  assert.equal(statusName(byNumber(2).statusId), 'Done');
  assert.equal(byNumber(2).priority, 'medium');
  assert.equal(new Date(byNumber(2).completedAt).toISOString(), '2026-11-05T09:30:00.000Z', 'completion time is preserved');
  assert.equal(statusName(byNumber(5).statusId), 'In progress', 'the old blocked status folds into In progress');
  assert.equal(statusName(byNumber(6).statusId), 'Merged');
  assert.equal(byNumber(6).labelIds.length, 0);
  assert.equal(tasks.filter((t) => t.parentId).length, 2, 'orphaned subtasks are skipped');

  const detail = (await c.get(`/api/tasks/${t1.id}`)).json;
  assert.equal(detail.task.description, 'Waiting on IT Admin', 'notes become the description');
  assert.equal(detail.watchers.length, 1, 'the legacy watcher watches the task');

  // Task numbering continues after the imported numbers instead of colliding.
  const next = await c.post(`/api/projects/${project.id}/tasks`, { title: 'Brand new' });
  assert.ok(next.json.task.number > 6);

  // People became placeholder members, and the importer owns the workspace.
  const members = (await c.get(`/api/workspaces/${wid}/members`)).json.members;
  assert.deepEqual(members.filter((m) => m.isPlaceholder).map((m) => m.name).sort(), ['Samuel Kolajo', 'Tosin Ilesanmi']);
  assert.equal(t1.assigneeId, members.find((m) => m.name === 'Samuel Kolajo').id);

  // A second workspace never re-imports.
  const second = await c.post('/api/workspaces', { name: 'Another' });
  assert.equal(second.status, 201);
  const row = await env.pool.query('SELECT count(*)::int AS n FROM legacy_import');
  assert.equal(row.rows[0].n, 1);
  assert.equal((await env.pool.query("SELECT count(*)::int AS n FROM projects WHERE key = 'CLO'")).rows[0].n, 1);
});

test('missing static assets 404 instead of returning the app shell', async () => {
  const res = await fetch(`${env.base}/assets/does-not-exist.js`);
  assert.equal(res.status, 404);
});
