'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

const docs = [];
const audit = [];
const options = { workstreams: [], owners: [] };
let revision = 1;

async function query(sql, params = []) {
  if (sql.startsWith('SELECT v FROM meta')) return { rows: [{ v: revision }] };
  if (sql.startsWith('SELECT coll, id, data FROM docs')) return { rows: docs };
  if (sql.startsWith('SELECT name, value FROM app_settings')) {
    return { rows: Object.entries(options).map(([name, value]) => ({ name, value })) };
  }
  if (sql.startsWith('SELECT value FROM app_settings')) return { rows: [{ value: options[params[0]] }] };
  if (sql.startsWith('UPDATE app_settings')) {
    options[params[0]] = JSON.parse(params[1]);
    return { rows: [], rowCount: 1 };
  }
  if (sql.startsWith('UPDATE meta')) {
    revision++;
    return { rows: [{ v: revision }] };
  }
  if (sql.startsWith("SELECT id FROM docs WHERE coll='tasks'")) {
    const field = sql.includes("data->>'ws'") ? 'ws' : 'owner';
    const row = docs.find((doc) => doc.coll === 'tasks' && (doc.data[field] || '').toLowerCase() === params[0].toLowerCase());
    return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
  }
  if (sql.startsWith('SELECT COALESCE(MAX')) {
    return { rows: [{ n: docs.filter((doc) => doc.coll === 'tasks').length + 1 }] };
  }
  if (sql.startsWith('INSERT INTO docs')) {
    docs.push({ coll: params[0], id: params[1], data: params[2] });
  }
  if (sql.startsWith("DELETE FROM docs WHERE coll='subtasks'")) {
    const before = docs.length;
    for (let i = docs.length - 1; i >= 0; i--) {
      if (docs[i].coll === 'subtasks' && docs[i].data.parent === params[0]) docs.splice(i, 1);
    }
    return { rows: [], rowCount: before - docs.length };
  }
  if (sql.startsWith('DELETE FROM docs WHERE coll=$1')) {
    const index = docs.findIndex((doc) => doc.coll === params[0] && doc.id === params[1]);
    if (index >= 0) docs.splice(index, 1);
    return { rows: [], rowCount: index >= 0 ? 1 : 0 };
  }
  if (sql.startsWith('INSERT INTO audit')) audit.push(params);
  return { rows: [], rowCount: 1 };
}

const pool = {
  query,
  async connect() {
    return { query, release() {} };
  },
};

test('anonymous visitors can read and edit without session cookies', async (t) => {
  const server = createApp(pool).listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const read = await fetch(`${base}/api/sync`);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).tasks.length, 0);

  const write = await fetch(`${base}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { title: 'Anonymous task', day: '2026-11-05', status: 'todo', priority: 'med' },
    }),
  });
  assert.equal(write.status, 201);
  assert.equal(audit.at(-1)[0], 'Anonymous');

  const signIn = await fetch(`${base}/api/login`, { method: 'POST' });
  assert.equal(signIn.status, 404);

  const add = await fetch(`${base}/api/options/workstreams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Testing' }),
  });
  assert.equal(add.status, 201);
  assert.deepEqual((await (await fetch(`${base}/api/sync`)).json()).workstreams, ['Testing']);
  const duplicate = await fetch(`${base}/api/options/workstreams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ' testing ' }),
  });
  assert.equal(duplicate.status, 409);

  const remove = await fetch(`${base}/api/options/workstreams/Testing`, { method: 'DELETE' });
  assert.equal(remove.status, 200);
  assert.deepEqual((await (await fetch(`${base}/api/sync`)).json()).workstreams, []);
});
