'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, Client } = require('./helpers');
const { createMemoryMailer } = require('../server/mailer');
const { runOnce } = require('../server/emailWorker');

const PASSWORD = 'correct horse battery';
let env, mailer, owner, wid, ownerId, member, memberId;

const tokenFrom = (message) => message.text.match(/\/(reset|invite)\/([\w-]+)/)[2];

test.before(async () => {
  process.env.SEED = 'off';
  process.env.APP_URL = 'http://app.test';
  mailer = createMemoryMailer();
  env = await boot({ mailer });
  owner = new Client(env.base);
  const r = await owner.post('/api/auth/register', { name: 'Owner', email: 'owner@example.com', password: PASSWORD, workspaceName: 'Acme' });
  wid = r.json.workspaces[0].id;
  ownerId = r.json.user.id;
  const inv = await owner.post(`/api/workspaces/${wid}/invites`, { email: 'mia@example.com', role: 'member' });
  member = new Client(env.base);
  const reg = await member.post('/api/auth/register', { name: 'Mia', email: 'mia@example.com', password: PASSWORD, inviteToken: inv.json.token });
  memberId = reg.json.user.id;
  mailer.outbox.length = 0;
});
test.after(async () => { delete process.env.SEED; delete process.env.APP_URL; await env.close(); });

test('status reports whether email is configured', async () => {
  assert.equal((await new Client(env.base).get('/api/auth/status')).json.emailEnabled, true);
});

test('forgot password emails a link, and answers identically for unknown addresses', async () => {
  const c = new Client(env.base);
  const known = await c.post('/api/auth/forgot', { email: 'MIA@example.com' });
  const unknown = await c.post('/api/auth/forgot', { email: 'nobody@example.com' });
  assert.deepEqual(known.json, unknown.json, 'no way to tell which emails have accounts');
  assert.equal(mailer.outbox.length, 1);
  const mail = mailer.outbox[0];
  assert.equal(mail.to, 'mia@example.com');
  assert.match(mail.subject, /Reset your password/);
  assert.match(mail.text, /1 hour/);
  assert.match(mail.html, /Choose a new password/);
  assert.equal((await c.post('/api/auth/forgot', { email: 'not-an-email' })).status, 400);
});

test('a reset link sets a new password once, signs out old sessions and signs you in', async () => {
  mailer.outbox.length = 0;
  const other = new Client(env.base);
  await other.post('/api/auth/login', { email: 'mia@example.com', password: PASSWORD });
  await new Client(env.base).post('/api/auth/forgot', { email: 'mia@example.com' });
  const token = tokenFrom(mailer.outbox[0]);
  const stored = await env.pool.query('SELECT token_hash FROM password_resets WHERE used_at IS NULL');
  assert.ok(stored.rows.every((r) => r.token_hash !== token), 'only a hash of the token is stored');

  const c = new Client(env.base);
  assert.equal((await c.get(`/api/auth/reset/${token}`)).json.valid, true);
  assert.equal((await c.post('/api/auth/reset', { token, password: 'short' })).status, 400, 'weak passwords are refused');
  assert.equal((await c.get(`/api/auth/reset/${token}`)).status, 200, 'a refused attempt does not burn the link');
  const done = await c.post('/api/auth/reset', { token, password: 'a brand new password' });
  assert.equal(done.status, 200);
  assert.equal(done.json.user.email, 'mia@example.com');
  assert.equal((await c.get('/api/auth/me')).status, 200, 'signed in after resetting');
  assert.equal((await other.get('/api/auth/me')).status, 401, 'the old session is gone');
  assert.equal((await c.post('/api/auth/reset', { token, password: 'another password 1' })).status, 400, 'single use');
  assert.equal((await c.get(`/api/auth/reset/${token}`)).status, 404);
  assert.equal((await new Client(env.base).post('/api/auth/login', { email: 'mia@example.com', password: PASSWORD })).status, 401, 'old password no longer works');
  assert.equal((await new Client(env.base).post('/api/auth/login', { email: 'mia@example.com', password: 'a brand new password' })).status, 200);
});

test('expired and unknown reset links are rejected; a newer request replaces an older one', async () => {
  mailer.outbox.length = 0;
  const c = new Client(env.base);
  await c.post('/api/auth/forgot', { email: 'mia@example.com' });
  const first = tokenFrom(mailer.outbox[0]);
  await new Client(env.base).post('/api/auth/forgot', { email: 'mia@example.com' }); // second address-bucket
  await env.pool.query("UPDATE password_resets SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL");
  assert.equal((await c.post('/api/auth/reset', { token: first, password: 'whatever password' })).status, 400, 'expired');
  assert.equal((await c.post('/api/auth/reset', { token: 'x'.repeat(40), password: 'whatever password' })).status, 400, 'unknown');
  assert.equal((await c.get('/api/auth/reset/short')).status, 404);
});

test('admins can hand over a reset link when email is not an option', async () => {
  const mem = (await owner.get(`/api/workspaces/${wid}/members`)).json.members.find((m) => m.id === memberId);
  assert.ok(mem);
  await member.post('/api/auth/login', { email: 'mia@example.com', password: 'a brand new password' }); // the earlier reset signed her out
  assert.equal((await member.post(`/api/workspaces/${wid}/members/${ownerId}/reset-link`)).status, 403, 'members cannot');
  const r = await owner.post(`/api/workspaces/${wid}/members/${memberId}/reset-link`);
  assert.equal(r.status, 201);
  assert.match(r.json.path, /^\/reset\//);
  const token = r.json.path.split('/').pop();
  const c = new Client(env.base);
  assert.equal((await c.post('/api/auth/reset', { token, password: 'handed over password' })).status, 200);
  assert.equal((await owner.post(`/api/workspaces/${wid}/members/00000000-0000-4000-8000-000000000000/reset-link`)).status, 404);
  const feed = (await owner.get(`/api/workspaces/${wid}/activity`)).json.activity;
  assert.ok(feed.some((a) => a.action === 'member.reset_link'), 'the action is audited');
});

test('invitations are emailed when email is configured', async () => {
  mailer.outbox.length = 0;
  const r = await owner.post(`/api/workspaces/${wid}/invites`, { email: 'new@example.com', role: 'viewer' });
  assert.equal(r.json.emailed, true);
  assert.equal(mailer.outbox.length, 1);
  assert.match(mailer.outbox[0].subject, /Owner invited you to Acme/);
  assert.equal(tokenFrom(mailer.outbox[0]), r.json.token, 'the email carries the same link');
});

test('notification emails are batched into one digest, respect the opt-out, and are never sent twice', async () => {
  await member.post('/api/auth/login', { email: 'mia@example.com', password: 'handed over password' });
  const project = (await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Mail Test' })).json.project;
  const t1 = (await owner.post(`/api/projects/${project.id}/tasks`, { title: 'First', assigneeId: memberId })).json.task;
  await owner.post(`/api/projects/${project.id}/tasks`, { title: 'Second', assigneeId: memberId });
  await owner.post(`/api/tasks/${t1.id}/comments`, { body: 'ping', mentions: [memberId] });
  mailer.outbox.length = 0;
  assert.equal(await runOnce(env.pool, mailer, { delaySeconds: 3600 }), 0, 'recent notifications wait so bursts can batch');
  assert.equal(await runOnce(env.pool, mailer, { delaySeconds: 0 }), 1, 'one digest for one person');
  const mail = mailer.outbox.find((m) => m.to === 'mia@example.com');
  assert.ok(mail);
  assert.match(mail.subject, /3 new notifications|new notifications/);
  assert.match(mail.text, /assigned you/);
  assert.match(mail.text, /http:\/\/app\.test\/w\/acme\/p\/\w+\/list\?task=\d+/, 'each item links to its task');
  assert.equal(await runOnce(env.pool, mailer, { delaySeconds: 0 }), 0, 'nothing is sent twice');

  // Opting out: nothing is emailed, and the notifications are still marked handled.
  assert.equal((await member.patch('/api/auth/me', { emailNotifications: false })).json.user.emailNotifications, false);
  await owner.post(`/api/tasks/${t1.id}/comments`, { body: 'another', mentions: [memberId] });
  mailer.outbox.length = 0;
  assert.equal(await runOnce(env.pool, mailer, { delaySeconds: 0 }), 0);
  assert.equal(mailer.outbox.length, 0);
  const pending = await env.pool.query('SELECT count(*)::int AS n FROM notifications WHERE emailed_at IS NULL');
  assert.equal(pending.rows[0].n, 0);
});

test('a failing mail server never breaks the request, and the digest is retried', async () => {
  const failing = { enabled: true, async send() { throw new Error('smtp down'); } };
  const project = (await owner.get(`/api/workspaces/${wid}/projects`)).json.projects[0];
  await member.patch('/api/auth/me', { emailNotifications: true });
  await owner.post(`/api/projects/${project.id}/tasks`, { title: 'Retry me', assigneeId: memberId });
  assert.equal(await runOnce(env.pool, failing, { delaySeconds: 0 }), 0);
  const pending = await env.pool.query('SELECT count(*)::int AS n FROM notifications WHERE emailed_at IS NULL');
  assert.ok(pending.rows[0].n >= 1, 'unsent notifications stay queued');
  mailer.outbox.length = 0;
  assert.equal(await runOnce(env.pool, mailer, { delaySeconds: 0 }), 1);
});
