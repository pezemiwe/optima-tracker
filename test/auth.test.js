'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, Client } = require('./helpers');

let env;
let owner;
const PASSWORD = 'correct horse battery';

test.before(async () => { env = await boot(); owner = new Client(env.base); });
test.after(async () => { await env.close(); });

test('a fresh install asks for setup and refuses data without sign-in', async () => {
  const anon = new Client(env.base);
  assert.equal((await anon.get('/healthz')).status, 200);
  assert.equal((await anon.get('/api/auth/status')).json.needsSetup, true);
  assert.equal((await anon.get('/api/auth/me')).status, 401);
  assert.equal((await anon.get('/api/workspaces/00000000-0000-0000-0000-000000000000/projects')).status, 401);
});

test('first registration bootstraps the workspace and imports the close-out data', async () => {
  const r = await owner.post('/api/auth/register', { name: 'Ada Owner', email: 'Ada@Example.com', password: PASSWORD, workspaceName: 'Zenith Optima' });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.email, 'ada@example.com', 'email is normalised');
  assert.equal(r.json.workspaces.length, 1);
  assert.equal(r.json.workspaces[0].role, 'owner');
  assert.equal(r.json.workspaces[0].slug, 'zenith-optima');
  assert.equal(r.json.imported, 4);
  assert.match(r.setCookie.join(';'), /HttpOnly/);
  assert.match(r.setCookie.join(';'), /SameSite=Lax/);
  assert.equal((await new Client(env.base).get('/api/auth/status')).json.needsSetup, false);

  const wid = r.json.workspaces[0].id;
  const projects = (await owner.get(`/api/workspaces/${wid}/projects`)).json.projects;
  assert.equal(projects.length, 1);
  assert.equal(projects[0].key, 'CLO');
  assert.equal(projects[0].taskCount, 4);
  const tasks = (await owner.get(`/api/projects/${projects[0].id}/tasks`)).json.tasks;
  assert.deepEqual(tasks.map((t) => t.number).sort((a, b) => a - b), [1, 2, 3, 4], 'legacy task numbers are kept');
  assert.ok(tasks.every((t) => t.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)), 'dates are plain strings');
  const members = (await owner.get(`/api/workspaces/${wid}/members`)).json.members;
  assert.ok(members.some((m) => m.isPlaceholder), 'legacy owners become placeholder members');
});

test('sign-up is closed once a workspace exists', async () => {
  const r = await new Client(env.base).post('/api/auth/register', { name: 'Eve', email: 'eve@example.com', password: PASSWORD });
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'invite_required');
});

test('validation: weak passwords, bad emails and unknown fields are rejected', async () => {
  const c = new Client(env.base);
  assert.equal((await c.post('/api/auth/register', { name: 'X', email: 'nope', password: PASSWORD })).status, 400);
  assert.equal((await c.post('/api/auth/login', { email: 'ada@example.com', password: 'x', extra: 1 })).status, 400);
  const r = await c.post('/api/auth/login', { email: 'ada@example.com', password: 'wrong password' });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'Incorrect email or password.');
  assert.equal((await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'wrong password' })).json.error, 'Incorrect email or password.', 'same message for unknown email');
});

test('login, session, profile update and logout', async () => {
  const c = new Client(env.base);
  const login = await c.post('/api/auth/login', { email: 'ADA@example.com', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal((await c.get('/api/auth/me')).json.user.name, 'Ada Owner');
  const patch = await c.patch('/api/auth/me', { name: 'Ada L.', theme: 'dark' });
  assert.equal(patch.json.user.theme, 'dark');
  assert.equal((await c.patch('/api/auth/me', { theme: 'neon' })).status, 400);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('changing the password signs out other devices', async () => {
  const a = new Client(env.base);
  const b = new Client(env.base);
  await a.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
  await b.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
  assert.equal((await a.post('/api/auth/password', { current: 'wrong', next: 'new password 123' })).status, 400);
  assert.equal((await a.post('/api/auth/password', { current: PASSWORD, next: 'short' })).status, 400);
  assert.equal((await a.post('/api/auth/password', { current: PASSWORD, next: 'new password 123' })).status, 200);
  assert.equal((await a.get('/api/auth/me')).status, 200, 'this device stays signed in');
  assert.equal((await b.get('/api/auth/me')).status, 401, 'other device is signed out');
  assert.equal((await a.post('/api/auth/password', { current: 'new password 123', next: PASSWORD })).status, 200);
  assert.equal((await owner.get('/api/auth/me')).status, 401, 'the long-lived owner session was one of the "other devices"');
  await owner.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
});

test('login is rate limited per email and address', async () => {
  const c = new Client(env.base);
  let last;
  for (let i = 0; i < 12; i++) last = await c.post('/api/auth/login', { email: 'limit@example.com', password: 'bad password' });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('retry-after'));
});

test('writes from another origin are blocked and JSON is required', async () => {
  const c = new Client(env.base);
  await c.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
  const cross = await c.req('POST', '/api/workspaces', { name: 'Evil' }, { Origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
  assert.equal(cross.json.code, 'csrf');
  const same = await c.req('POST', '/api/workspaces', { name: 'Side Project' }, { Origin: env.base });
  assert.equal(same.status, 201);
  const res = await fetch(`${env.base}/api/workspaces`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: c.cookie }, body: '{"name":"x"}' });
  assert.equal(res.status, 415);
});

test('invites: create, preview, register, role enforcement and placeholder claim', async () => {
  const wid = (await owner.get('/api/auth/me')).json.workspaces[0].id;
  assert.equal((await owner.get('/api/auth/me')).status, 200);
  const members = (await owner.get(`/api/workspaces/${wid}/members`)).json.members;
  const placeholder = members.find((m) => m.isPlaceholder);

  const inv = await owner.post(`/api/workspaces/${wid}/invites`, { email: 'Pat@Example.com', role: 'viewer', placeholderUserId: placeholder.id });
  assert.equal(inv.status, 201);
  assert.ok(inv.json.token.length >= 40);
  const stored = await env.pool.query('SELECT token_hash FROM invites');
  assert.ok(stored.rows.every((r) => r.token_hash !== inv.json.token), 'only the hash is stored');

  const preview = await new Client(env.base).get(`/api/invites/${inv.json.token}`);
  assert.deepEqual({ email: preview.json.email, role: preview.json.role, hasAccount: preview.json.hasAccount }, { email: 'pat@example.com', role: 'viewer', hasAccount: false });
  assert.equal((await new Client(env.base).get('/api/invites/not-a-real-token-not-a-real-token')).status, 404);

  const pat = new Client(env.base);
  const reg = await pat.post('/api/auth/register', { name: placeholder.name, email: 'ignored@example.com', password: PASSWORD, inviteToken: inv.json.token });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.user.email, 'pat@example.com', 'the invited email wins over the form');
  assert.equal(reg.json.workspaces.find((w) => w.id === wid).role, 'viewer');
  const after = (await owner.get(`/api/workspaces/${wid}/members`)).json.members;
  assert.equal(after.filter((m) => m.name === placeholder.name).length, 1, 'placeholder was claimed, not duplicated');
  assert.equal(after.find((m) => m.id === placeholder.id).isPlaceholder, false);
  assert.equal((await new Client(env.base).post('/api/auth/register', { name: 'Again', email: 'again@example.com', password: PASSWORD, inviteToken: inv.json.token })).status, 400, 'invite is single-use');

  // A viewer can read but not manage or write.
  assert.equal((await pat.get(`/api/workspaces/${wid}/projects`)).status, 200);
  assert.equal((await pat.post(`/api/workspaces/${wid}/projects`, { name: 'Nope' })).status, 403);
  assert.equal((await pat.post(`/api/workspaces/${wid}/invites`, { email: 'x@example.com' })).status, 403);
  assert.equal((await pat.get(`/api/workspaces/${wid}/invites`)).status, 403);
  const patMembers = (await pat.get(`/api/workspaces/${wid}/members`)).json.members;
  assert.ok(patMembers.filter((m) => m.id !== reg.json.user.id).every((m) => m.email === null), 'viewers do not see other emails');
});

test('invites to an existing account are accepted in-app, only by the matching email', async () => {
  const side = (await owner.get('/api/auth/me')).json.workspaces.find((w) => w.name === 'Side Project');
  const c2 = new Client(env.base);
  await c2.post('/api/auth/login', { email: 'pat@example.com', password: PASSWORD });
  const inv = await owner.post(`/api/workspaces/${side.id}/invites`, { email: 'pat@example.com', role: 'member' });
  const me = await c2.get('/api/auth/me');
  assert.equal(me.json.pendingInvites.length, 1);
  const wrong = new Client(env.base);
  await wrong.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD });
  assert.equal((await wrong.post(`/api/invites/${inv.json.token}/accept`)).status, 403, 'a different account cannot use the link');
  assert.equal((await c2.post(`/api/invites/${inv.json.token}/accept`)).status, 200);
  assert.equal((await c2.get('/api/auth/me')).json.workspaces.length, 2);
  const notes = (await owner.get(`/api/notifications?workspaceId=${side.id}`)).json.notifications;
  assert.ok(notes.some((n) => n.type === 'invite'), 'inviter is told when the invite is accepted');
});

test('roles: last owner is protected and members can be removed', async () => {
  const wid = (await owner.get('/api/auth/me')).json.workspaces[0].id;
  const me = (await owner.get('/api/auth/me')).json.user;
  const demote = await owner.patch(`/api/workspaces/${wid}/members/${me.id}`, { role: 'admin' });
  assert.equal(demote.status, 400);
  assert.equal(demote.json.code, 'last_owner');
  assert.equal((await owner.del(`/api/workspaces/${wid}/members/${me.id}`)).json.code, 'last_owner');
  const members = (await owner.get(`/api/workspaces/${wid}/members`)).json.members;
  const pat = members.find((m) => m.email === 'pat@example.com');
  assert.equal((await owner.patch(`/api/workspaces/${wid}/members/${pat.id}`, { role: 'admin' })).status, 200);
  const patClient = new Client(env.base);
  await patClient.post('/api/auth/login', { email: 'pat@example.com', password: PASSWORD });
  assert.equal((await patClient.patch(`/api/workspaces/${wid}/members/${me.id}`, { role: 'member' })).status, 403, 'admins cannot touch owners');
  assert.equal((await patClient.patch(`/api/workspaces/${wid}/members/${pat.id}`, { role: 'owner' })).status, 403, 'admins cannot grant owner');
  assert.equal((await owner.del(`/api/workspaces/${wid}/members/${pat.id}`)).status, 200);
  assert.equal((await patClient.get(`/api/workspaces/${wid}/projects`)).status, 404, 'removed members lose access');
});

test('workspaces are isolated from each other', async () => {
  const outsider = new Client(env.base);
  await outsider.post('/api/auth/login', { email: 'pat@example.com', password: PASSWORD });
  const wid = (await owner.get('/api/auth/me')).json.workspaces[0].id;
  const pid = (await owner.get(`/api/workspaces/${wid}/projects`)).json.projects[0].id;
  assert.equal((await outsider.get(`/api/projects/${pid}`)).status, 404);
  assert.equal((await outsider.get(`/api/projects/${pid}/tasks`)).status, 404);
  assert.equal((await outsider.get(`/api/workspaces/${wid}/members`)).status, 404);
  assert.equal((await outsider.get('/api/projects/not-a-uuid')).status, 404);
});
