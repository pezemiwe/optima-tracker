'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, Client } = require('./helpers');

const PASSWORD = 'correct horse battery';
let env, owner, member, viewer, outsider, wid, project, tasks;

async function upload(client, taskId, name, body, type = 'application/octet-stream', extra = {}) {
  const res = await fetch(`${env.base}/api/tasks/${taskId}/attachments?name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { 'Content-Type': type, Cookie: client.cookie, ...extra }, body,
  });
  let json = null; try { json = await res.json(); } catch { /* none */ }
  return { status: res.status, json };
}
async function download(client, id, query = '') {
  const res = await fetch(`${env.base}/api/attachments/${id}${query}`, { headers: { Cookie: client.cookie } });
  return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
}
async function join(email, role, name) {
  const inv = await owner.post(`/api/workspaces/${wid}/invites`, { email, role });
  const c = new Client(env.base);
  await c.post('/api/auth/register', { name, email, password: PASSWORD, inviteToken: inv.json.token });
  return c;
}

test.before(async () => {
  process.env.SEED = 'off';
  env = await boot();
  owner = new Client(env.base);
  const r = await owner.post('/api/auth/register', { name: 'Owner', email: 'owner@example.com', password: PASSWORD, workspaceName: 'Acme' });
  wid = r.json.workspaces[0].id;
  member = await join('m@example.com', 'member', 'Mia');
  viewer = await join('v@example.com', 'viewer', 'Vic');
  outsider = new Client(env.base);
  await outsider.post('/api/auth/register', { name: 'Out', email: 'out@example.com', password: PASSWORD, inviteToken: (await (async () => {
    const w2 = (await owner.post('/api/workspaces', { name: 'Other' })).json.workspace;
    return (await owner.post(`/api/workspaces/${w2.id}/invites`, { email: 'out@example.com', role: 'member' })).json.token;
  })()) });
  project = (await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Files' })).json.project;
  tasks = [];
  for (let i = 0; i < 4; i++) tasks.push((await owner.post(`/api/projects/${project.id}/tasks`, { title: `T${i}` })).json.task);
});
test.after(async () => { delete process.env.SEED; delete process.env.ATTACHMENT_LIMIT_MB; await env.close(); });

test('files round-trip byte for byte and download as attachments with safe headers', async () => {
  const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 255, 10, 13]);
  const up = await upload(member, tasks[0].id, 'data.bin', bytes, 'application/octet-stream');
  assert.equal(up.status, 201);
  assert.equal(up.json.attachment.size, bytes.length);
  const dl = await download(owner, up.json.attachment.id);
  assert.deepEqual(dl.body, bytes);
  assert.match(dl.headers.get('content-disposition'), /^attachment;/);
  assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.match(dl.headers.get('content-security-policy'), /sandbox/);
  assert.equal(dl.headers.get('content-type'), 'application/octet-stream');
  const detail = (await owner.get(`/api/tasks/${tasks[0].id}`)).json;
  assert.equal(detail.attachments.length, 1);
  assert.equal(detail.attachments[0].createdByName, 'Mia');
  const list = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.find((t) => t.id === tasks[0].id);
  assert.equal(list.attachmentCount, 1);
});

test('only safe types render inline; script-capable types never do', async () => {
  const png = await upload(owner, tasks[0].id, 'pic.png', Buffer.from('89504e47', 'hex'), 'image/png');
  assert.equal((await download(owner, png.json.attachment.id, '?inline=1')).headers.get('content-type'), 'image/png');
  assert.match((await download(owner, png.json.attachment.id, '?inline=1')).headers.get('content-disposition'), /^inline;/);
  assert.match((await download(owner, png.json.attachment.id)).headers.get('content-disposition'), /^attachment;/, 'inline must be requested');
  for (const type of ['image/svg+xml', 'text/html', 'application/javascript']) {
    const f = await upload(owner, tasks[0].id, 'x', Buffer.from('<script>alert(1)</script>'), type);
    const dl = await download(owner, f.json.attachment.id, '?inline=1');
    assert.equal(dl.headers.get('content-type'), 'application/octet-stream', `${type} is forced to download`);
    assert.match(dl.headers.get('content-disposition'), /^attachment;/);
  }
});

test('file names are sanitised', async () => {
  const a = await upload(owner, tasks[1].id, '../../etc/pass"wd', Buffer.from('x'));
  assert.equal(a.json.attachment.name, 'pass_wd');
  const b = await upload(owner, tasks[1].id, 'Résumé final.pdf', Buffer.from('x'));
  const dl = await download(owner, b.json.attachment.id);
  assert.match(dl.headers.get('content-disposition'), /filename\*=UTF-8''R%C3%A9sum%C3%A9%20final\.pdf/);
  const blank = await upload(owner, tasks[1].id, '', Buffer.from('x'));
  assert.equal(blank.json.attachment.name, 'file');
});

test('permissions: viewers read, members write, outsiders see nothing, cross-site uploads are blocked', async () => {
  const up = await upload(owner, tasks[2].id, 'private.txt', Buffer.from('secret'));
  const id = up.json.attachment.id;
  assert.equal((await download(viewer, id)).status, 200, 'viewers can download');
  assert.equal((await upload(viewer, tasks[2].id, 'x.txt', Buffer.from('x'))).status, 403, 'viewers cannot upload');
  assert.equal((await download(outsider, id)).status, 404, 'other workspaces cannot see it');
  assert.equal((await upload(outsider, tasks[2].id, 'x.txt', Buffer.from('x'))).status, 404);
  assert.equal((await download(new Client(env.base), id)).status, 401);
  assert.equal((await upload(member, tasks[2].id, 'x.txt', Buffer.from('x'), 'text/plain', { Origin: 'https://evil.example' })).status, 403, 'CSRF origin check applies');
  assert.equal((await member.del(`/api/attachments/${id}`)).status, 403, 'members cannot remove others\' files');
  assert.equal((await viewer.del(`/api/attachments/${id}`)).status, 403);
  assert.equal((await owner.del(`/api/attachments/${id}`)).status, 200, 'admins can');
  assert.equal((await download(owner, id)).status, 404);
});

test('limits: empty files, files over 10 MB, and 25 per task', async () => {
  assert.equal((await upload(owner, tasks[3].id, 'empty', Buffer.alloc(0))).status, 400);
  assert.equal((await upload(owner, tasks[3].id, 'huge', Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
  const ok = await upload(owner, tasks[3].id, 'edge', Buffer.alloc(1024 * 1024));
  assert.equal(ok.status, 201);
  for (let i = 1; i < 25; i++) assert.equal((await upload(owner, tasks[3].id, `f${i}`, Buffer.from('x'))).status, 201);
  const over = await upload(owner, tasks[3].id, 'one-too-many', Buffer.from('x'));
  assert.equal(over.status, 400);
  assert.equal(over.json.code, 'too_many');
});

test('workspace storage quota is enforced', async () => {
  const t = (await owner.post(`/api/projects/${project.id}/tasks`, { title: 'Quota' })).json.task;
  const used = (await env.pool.query('SELECT COALESCE(sum(size),0)::bigint AS n FROM attachments')).rows[0].n;
  process.env.ATTACHMENT_LIMIT_MB = String(Math.ceil((Number(used) + 1024) / 1048576)); // room for just a little more
  const big = await upload(owner, t.id, 'big', Buffer.alloc(2 * 1024 * 1024));
  assert.equal(big.status, 413);
  assert.equal(big.json.code, 'quota');
  delete process.env.ATTACHMENT_LIMIT_MB;
});

test('deleting a task removes its files', async () => {
  const t = (await owner.post(`/api/projects/${project.id}/tasks`, { title: 'Temp' })).json.task;
  const f = await upload(owner, t.id, 'gone.txt', Buffer.from('bye'));
  assert.equal((await owner.del(`/api/tasks/${t.id}`)).status, 200);
  assert.equal((await download(owner, f.json.attachment.id)).status, 404);
});

test('relations: create, label direction, block counts, and clear when the blocker is done', async () => {
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(async (n) => (await owner.post(`/api/projects/${project.id}/tasks`, { title: `Rel ${n}` })).json.task));
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: b.id, type: 'blocks' })).status, 201);
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: b.id, type: 'blocks' })).status, 409, 'duplicates are refused');
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: a.id, type: 'blocks' })).status, 400, 'not itself');
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: c.id, type: 'friends' })).status, 400);
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: '00000000-0000-4000-8000-000000000000', type: 'relates' })).status, 404);
  assert.equal((await viewer.post(`/api/tasks/${a.id}/relations`, { toTaskId: c.id, type: 'relates' })).status, 403);

  const bDetail = (await owner.get(`/api/tasks/${b.id}`)).json;
  const rel = bDetail.relations[0];
  assert.equal(rel.type, 'blocks');
  assert.equal(rel.direction, 'in', 'seen from B, A blocks it');
  assert.equal(rel.otherId, a.id);
  const aDetail = (await owner.get(`/api/tasks/${a.id}`)).json;
  assert.equal(aDetail.relations[0].direction, 'out');

  const blocked = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.find((t) => t.id === b.id);
  assert.equal(blocked.blockedCount, 1);
  const statuses = (await owner.get(`/api/projects/${project.id}`)).json.statuses;
  await owner.patch(`/api/tasks/${a.id}`, { statusId: statuses.find((s) => s.category === 'done').id });
  const freed = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.find((t) => t.id === b.id);
  assert.equal(freed.blockedCount, 0, 'finishing the blocker unblocks the task');

  assert.equal((await owner.del(`/api/relations/${rel.id}`)).status, 200);
  assert.equal((await owner.get(`/api/tasks/${b.id}`)).json.relations.length, 0);
  assert.ok((await owner.get(`/api/tasks/${a.id}`)).json.activity.some((x) => x.action === 'task.relation'));
});

test('circular dependencies are rejected, however long the chain', async () => {
  const n = [];
  for (let i = 0; i < 4; i++) n.push((await owner.post(`/api/projects/${project.id}/tasks`, { title: `Chain ${i}` })).json.task);
  for (let i = 0; i < 3; i++) assert.equal((await owner.post(`/api/tasks/${n[i].id}/relations`, { toTaskId: n[i + 1].id, type: 'blocks' })).status, 201);
  const loop = await owner.post(`/api/tasks/${n[3].id}/relations`, { toTaskId: n[0].id, type: 'blocks' });
  assert.equal(loop.status, 400);
  assert.equal(loop.json.code, 'cycle');
  assert.equal((await owner.post(`/api/tasks/${n[3].id}/relations`, { toTaskId: n[0].id, type: 'relates' })).status, 201, 'non-blocking links may form loops');
  const edges = (await owner.get(`/api/projects/${project.id}/relations`)).json.relations;
  assert.ok(edges.filter((e) => e.type === 'blocks').length >= 3);
});

test('relates is symmetric and tasks in other workspaces cannot be linked', async () => {
  const [a, b] = await Promise.all(['X', 'Y'].map(async (n) => (await owner.post(`/api/projects/${project.id}/tasks`, { title: `Sym ${n}` })).json.task));
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: b.id, type: 'relates' })).status, 201);
  assert.equal((await owner.post(`/api/tasks/${b.id}/relations`, { toTaskId: a.id, type: 'relates' })).status, 409, 'the reverse is the same link');
  const other = (await owner.get('/api/auth/me')).json.workspaces.find((w) => w.name === 'Other');
  const p2 = (await owner.post(`/api/workspaces/${other.id}/projects`, { name: 'Elsewhere' })).json.project;
  const foreign = (await owner.post(`/api/projects/${p2.id}/tasks`, { title: 'Foreign' })).json.task;
  assert.equal((await owner.post(`/api/tasks/${a.id}/relations`, { toTaskId: foreign.id, type: 'relates' })).status, 404);
});
