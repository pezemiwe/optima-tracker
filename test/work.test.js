'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, Client } = require('./helpers');

const PASSWORD = 'correct horse battery';
let env, owner, member, viewer, wid, ownerId, memberId, viewerId, project, statuses, labels;

async function invite(email, role, name) {
  const inv = await owner.post(`/api/workspaces/${wid}/invites`, { email, role });
  const c = new Client(env.base);
  const r = await c.post('/api/auth/register', { name, email, password: PASSWORD, inviteToken: inv.json.token });
  assert.equal(r.status, 201);
  return { client: c, id: r.json.user.id };
}
const task = async (body, client = owner) => (await client.post(`/api/projects/${project.id}/tasks`, body));
const byName = (n) => statuses.find((s) => s.name === n);

test.before(async () => {
  process.env.SEED = 'off';
  env = await boot();
  owner = new Client(env.base);
  const r = await owner.post('/api/auth/register', { name: 'Owner One', email: 'owner@example.com', password: PASSWORD, workspaceName: 'Acme' });
  assert.equal(r.json.imported, 0, 'SEED=off and no legacy data means an empty workspace');
  wid = r.json.workspaces[0].id;
  ownerId = r.json.user.id;
  ({ client: member, id: memberId } = await invite('member@example.com', 'member', 'Mia Member'));
  ({ client: viewer, id: viewerId } = await invite('viewer@example.com', 'viewer', 'Vic Viewer'));
});
test.after(async () => { delete process.env.SEED; await env.close(); });

test('projects: create with generated key, defaults, duplicate keys and permissions', async () => {
  const r = await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Website Redesign' });
  assert.equal(r.status, 201);
  project = r.json.project;
  statuses = r.json.statuses;
  assert.equal(project.key, 'WR');
  assert.deepEqual(statuses.map((s) => s.name), ['To do', 'In progress', 'In review', 'Done']);
  assert.deepEqual(statuses.map((s) => s.category), ['todo', 'active', 'active', 'done']);

  const dup = await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Other', key: 'wr' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.code, 'key_taken');
  assert.equal((await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Bad', key: '1X' })).status, 400);
  assert.equal((await viewer.post(`/api/workspaces/${wid}/projects`, { name: 'Nope' })).status, 403);
  assert.equal((await member.post(`/api/workspaces/${wid}/projects`, { name: 'Members may create' })).status, 201);
  assert.equal((await member.patch(`/api/projects/${project.id}`, { name: 'Hijack' })).status, 403, 'only admins edit project settings');
  assert.equal((await owner.patch(`/api/projects/${project.id}`, { description: 'New site', leadId: memberId })).status, 200);
  assert.equal((await owner.patch(`/api/projects/${project.id}`, { leadId: '00000000-0000-4000-8000-000000000000' })).status, 400, 'lead must be a member');
});

test('labels: create, duplicate names, attach to tasks', async () => {
  const a = await member.post(`/api/projects/${project.id}/labels`, { name: 'Bug', color: '#dc2626' });
  const b = await member.post(`/api/projects/${project.id}/labels`, { name: 'Design' });
  assert.equal(a.status, 201);
  assert.equal((await member.post(`/api/projects/${project.id}/labels`, { name: 'bug' })).status, 409, 'case-insensitive duplicate');
  assert.equal((await viewer.post(`/api/projects/${project.id}/labels`, { name: 'Nope' })).status, 403);
  labels = [a.json.label, b.json.label];
  assert.equal((await member.patch(`/api/labels/${labels[0].id}`, { color: '#000000' })).status, 403, 'only admins edit labels');
  assert.equal((await owner.patch(`/api/labels/${labels[1].id}`, { name: 'UX' })).status, 200);
  labels[1].name = 'UX';
});

test('tasks: numbering, defaults, validation and field changes', async () => {
  const t1 = await task({ title: '  Draft homepage  ', labelIds: [labels[0].id], dueDate: '2026-12-01', dueTime: '09:30', estimateMinutes: 120 }, member);
  assert.equal(t1.status, 201);
  const a = t1.json.task;
  assert.equal(a.number, 1);
  assert.equal(a.title, 'Draft homepage', 'titles are trimmed');
  assert.equal(a.statusId, byName('To do').id, 'defaults to the first to-do status');
  assert.equal(a.priority, 'medium');
  assert.equal(a.dueDate, '2026-12-01');
  assert.equal(a.dueTime, '09:30');
  assert.deepEqual(a.labelIds, [labels[0].id]);
  assert.equal(a.watching, true, 'creators watch their tasks');
  assert.equal(a.projectKey, 'WR');

  assert.equal((await task({ title: 'Second' })).json.task.number, 2);
  assert.equal((await task({ title: '' })).status, 400);
  assert.equal((await task({ title: 'x', priority: 'asap' })).status, 400);
  assert.equal((await task({ title: 'x', dueDate: '2026-02-30' })).status, 400, 'impossible dates are rejected');
  assert.equal((await task({ title: 'x', startDate: '2026-05-02', dueDate: '2026-05-01' })).status, 400, 'start after due');
  assert.equal((await task({ title: 'x', bogus: 1 })).status, 400);
  assert.equal((await task({ title: 'x', assigneeId: '00000000-0000-4000-8000-000000000000' })).status, 400);
  assert.equal((await task({ title: 'x', labelIds: ['00000000-0000-4000-8000-000000000000'] })).status, 400);
  assert.equal((await task({ title: 'x' }, viewer)).status, 403);

  const patched = await member.patch(`/api/tasks/${a.id}`, { priority: 'urgent', description: 'Hero + nav', dueDate: null });
  assert.equal(patched.json.task.priority, 'urgent');
  assert.equal(patched.json.task.dueDate, null);
  assert.equal(patched.json.task.dueTime, null, 'clearing the due date clears the time');
  assert.equal((await member.patch(`/api/tasks/${a.id}`, { startDate: '2026-12-05' })).status, 200);
  assert.equal((await member.patch(`/api/tasks/${a.id}`, { dueDate: '2026-12-01' })).status, 400, 'due before existing start');
  assert.equal((await member.patch(`/api/tasks/${a.id}`, {})).status, 400);
  assert.equal((await member.patch('/api/tasks/not-an-id', { title: 'x' })).status, 404);
});

test('status changes set completion, log activity and notify watchers and assignees', async () => {
  const t = (await task({ title: 'Ship it', assigneeId: memberId })).json.task;
  const assigned = (await member.get(`/api/notifications?workspaceId=${wid}`)).json;
  assert.ok(assigned.notifications.some((n) => n.type === 'assigned' && n.taskId === t.id), 'assignee is notified');
  assert.ok(assigned.unread >= 1);
  assert.ok(!(await owner.get(`/api/notifications?workspaceId=${wid}`)).json.notifications.some((n) => n.taskId === t.id), 'actors are not notified of their own actions');

  const done = await member.patch(`/api/tasks/${t.id}`, { statusId: byName('Done').id });
  assert.ok(done.json.task.completedAt, 'completedAt is set');
  const reopened = await member.patch(`/api/tasks/${t.id}`, { statusId: byName('In progress').id });
  assert.equal(reopened.json.task.completedAt, null, 'reopening clears completedAt');
  assert.equal((await member.patch(`/api/tasks/${t.id}`, { statusId: '00000000-0000-4000-8000-000000000000' })).status, 400);

  const detail = (await owner.get(`/api/tasks/${t.id}`)).json;
  const actions = detail.activity.map((a) => a.action);
  assert.ok(actions.includes('task.created') && actions.includes('task.status'));
  const change = detail.activity.find((a) => a.action === 'task.status');
  assert.ok(change.detail.from && change.detail.to);
  const ownerNotes = (await owner.get(`/api/notifications?workspaceId=${wid}`)).json.notifications;
  assert.ok(ownerNotes.some((n) => n.type === 'status' && n.taskId === t.id), 'watchers hear about status changes');
});

test('subtasks: one level only, progress counts, cascade on delete', async () => {
  const parent = (await task({ title: 'Parent' })).json.task;
  const c1 = await task({ title: 'Child 1', parentId: parent.id });
  const c2 = await task({ title: 'Child 2', parentId: parent.id });
  assert.equal(c1.status, 201);
  assert.equal((await task({ title: 'Grandchild', parentId: c1.json.task.id })).status, 400, 'no nested subtasks');
  assert.equal((await task({ title: 'x', parentId: '00000000-0000-4000-8000-000000000000' })).status, 400);
  await owner.patch(`/api/tasks/${c1.json.task.id}`, { statusId: byName('Done').id });
  const list = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.find((t) => t.id === parent.id);
  assert.equal(list.subtaskCount, 2);
  assert.equal(list.subtaskDone, 1);
  const detail = (await owner.get(`/api/tasks/${parent.id}`)).json;
  assert.equal(detail.subtasks.length, 2);
  assert.equal((await owner.del(`/api/tasks/${parent.id}`)).status, 200);
  assert.equal((await owner.get(`/api/tasks/${c2.json.task.id}`)).status, 404, 'subtasks go with the parent');
});

test('comments: mentions notify, editing is author-only, deleting allows admins', async () => {
  const t = (await task({ title: 'Discuss' })).json.task;
  await member.put(`/api/tasks/${t.id}/watch`);
  const c = await owner.post(`/api/tasks/${t.id}/comments`, { body: 'Hey @Vic can you check?', mentions: [viewerId, 'f0000000-0000-4000-8000-000000000000'] });
  assert.equal(c.status, 201);
  assert.equal(c.json.comment.authorName, 'Owner One');
  const viewerNotes = (await viewer.get(`/api/notifications?workspaceId=${wid}`)).json.notifications;
  assert.ok(viewerNotes.some((n) => n.type === 'mentioned' && n.taskId === t.id), 'mentioned member is notified');
  const memberNotes = (await member.get(`/api/notifications?workspaceId=${wid}`)).json.notifications;
  assert.ok(memberNotes.some((n) => n.type === 'comment' && n.taskId === t.id), 'watchers are notified');
  assert.equal((await viewer.post(`/api/tasks/${t.id}/comments`, { body: 'hi' })).status, 403, 'viewers cannot comment');
  assert.equal((await owner.post(`/api/tasks/${t.id}/comments`, { body: '   ' })).status, 400);

  assert.equal((await member.patch(`/api/comments/${c.json.comment.id}`, { body: 'edit' })).status, 403);
  const edited = await owner.patch(`/api/comments/${c.json.comment.id}`, { body: 'Updated text' });
  assert.ok(edited.json.comment.editedAt);
  const m2 = await member.post(`/api/tasks/${t.id}/comments`, { body: 'Mine' });
  assert.equal((await viewer.del(`/api/comments/${m2.json.comment.id}`)).status, 403);
  assert.equal((await owner.del(`/api/comments/${m2.json.comment.id}`)).status, 200, 'admins may delete any comment');
  assert.equal((await owner.get(`/api/tasks/${t.id}`)).json.comments.length, 1);
});

test('links accept only web addresses', async () => {
  const t = (await task({ title: 'Links' })).json.task;
  const ok = await member.post(`/api/tasks/${t.id}/links`, { url: 'https://example.com/spec' });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.link.name, 'example.com');
  assert.equal((await member.post(`/api/tasks/${t.id}/links`, { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await member.post(`/api/tasks/${t.id}/links`, { url: 'not a url' })).status, 400);
  assert.equal((await viewer.post(`/api/tasks/${t.id}/links`, { url: 'https://example.com' })).status, 403);
  assert.equal((await member.del(`/api/links/${ok.json.link.id}`)).status, 200);
});

test('deleting: members only delete what they created; admins delete anything', async () => {
  const mine = (await task({ title: 'Mine' }, member)).json.task;
  const theirs = (await task({ title: 'Theirs' }, owner)).json.task;
  assert.equal((await member.del(`/api/tasks/${theirs.id}`)).status, 403);
  assert.equal((await viewer.del(`/api/tasks/${mine.id}`)).status, 403);
  assert.equal((await member.del(`/api/tasks/${mine.id}`)).status, 200);
  assert.equal((await owner.del(`/api/tasks/${theirs.id}`)).status, 200);
});

test('board ordering: moving between columns keeps positions', async () => {
  const a = (await task({ title: 'A' })).json.task;
  const b = (await task({ title: 'B' })).json.task;
  assert.ok(b.position > a.position, 'new tasks go to the end');
  const moved = await owner.patch(`/api/tasks/${b.id}`, { statusId: byName('In review').id, position: 500 });
  assert.equal(moved.json.task.position, 500);
  const auto = await owner.patch(`/api/tasks/${a.id}`, { statusId: byName('In review').id });
  assert.ok(auto.json.task.position > 500, 'moving without a position appends to the column');
});

test('bulk edit: move many, label additions, "bring unfinished here", bulk delete', async () => {
  const ts = [];
  for (let i = 0; i < 3; i++) ts.push((await task({ title: `Bulk ${i}`, dueDate: '2026-11-01' })).json.task);
  const ids = ts.map((t) => t.id);
  const r = await owner.post(`/api/projects/${project.id}/tasks/bulk`, { ids, changes: { dueDate: '2026-11-07', priority: 'high' } });
  assert.deepEqual(r.json, { ok: true, count: 3 });
  const list = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.filter((t) => ids.includes(t.id));
  assert.ok(list.every((t) => t.dueDate === '2026-11-07' && t.priority === 'high'));
  await owner.patch(`/api/tasks/${ids[0]}`, { labelIds: [labels[0].id] });
  await owner.post(`/api/projects/${project.id}/tasks/bulk`, { ids, changes: { labelIds: [labels[1].id] } });
  const first = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.find((t) => t.id === ids[0]);
  assert.equal(first.labelIds.length, 2, 'bulk labels add rather than replace');
  assert.equal((await owner.post(`/api/projects/${project.id}/tasks/bulk`, { ids: [], changes: { priority: 'low' } })).status, 400);
  assert.equal((await owner.post(`/api/projects/${project.id}/tasks/bulk`, { ids, changes: {} })).status, 400);
  assert.equal((await viewer.post(`/api/projects/${project.id}/tasks/bulk`, { ids, changes: { priority: 'low' } })).status, 403);
  assert.equal((await owner.post(`/api/projects/${project.id}/tasks/bulk`, { ids: [...ids, '00000000-0000-4000-8000-000000000000'], changes: { priority: 'low' } })).status, 404, 'all-or-nothing');
  assert.deepEqual((await owner.post(`/api/projects/${project.id}/tasks/bulk`, { ids, delete: true })).json, { ok: true, count: 3 });
});

test('statuses: reorder, recategorise, protect the open/done mix, delete with move', async () => {
  const added = await owner.post(`/api/projects/${project.id}/statuses`, { name: 'Blocked', category: 'active', color: '#ef4444' });
  assert.equal(added.status, 201);
  const blocked = added.json.status;
  const t = (await task({ title: 'Stuck', statusId: blocked.id })).json.task;
  const del = await owner.del(`/api/statuses/${blocked.id}`);
  assert.equal(del.json.code, 'status_in_use', 'cannot orphan tasks');
  assert.equal((await owner.del(`/api/statuses/${blocked.id}?moveTo=${blocked.id}`)).status, 400, 'cannot move into itself');
  assert.equal((await owner.del(`/api/statuses/${blocked.id}?moveTo=${byName('Done').id}`)).status, 200);
  const moved = (await owner.get(`/api/tasks/${t.id}`)).json.task;
  assert.equal(moved.statusId, byName('Done').id);
  assert.ok(moved.completedAt, 'moving into a done status completes the task');

  assert.equal((await member.post(`/api/projects/${project.id}/statuses`, { name: 'X', category: 'todo' })).status, 403);
  const order = [...statuses].reverse().map((s) => s.id);
  assert.equal((await owner.post(`/api/projects/${project.id}/statuses/reorder`, { ids: order })).status, 200);
  assert.equal((await owner.post(`/api/projects/${project.id}/statuses/reorder`, { ids: order.slice(1) })).status, 400, 'must list every status');
  const reread = (await owner.get(`/api/projects/${project.id}`)).json.statuses;
  assert.deepEqual(reread.map((s) => s.id), order);

  // The only done status cannot be turned into an open one.
  assert.equal((await owner.patch(`/api/statuses/${byName('Done').id}`, { category: 'active' })).json.code, 'status_mix');
});

test('saved views are private unless shared', async () => {
  const mine = await member.post(`/api/projects/${project.id}/views`, { name: 'My open bugs', view: 'list', config: { status: 'open', label: labels[0].id } });
  assert.equal(mine.status, 201);
  const shared = await owner.post(`/api/projects/${project.id}/views`, { name: 'Team board', view: 'board', config: {}, shared: true });
  assert.equal(shared.status, 201);
  const forOwner = (await owner.get(`/api/projects/${project.id}/views`)).json.views.map((x) => x.name);
  assert.deepEqual(forOwner, ['Team board'], 'private views of others are hidden');
  const forMember = (await member.get(`/api/projects/${project.id}/views`)).json.views.map((x) => x.name).sort();
  assert.deepEqual(forMember, ['My open bugs', 'Team board']);
  assert.equal((await member.post(`/api/projects/${project.id}/views`, { name: 'x', view: 'gantt' })).status, 400);
  assert.equal((await member.del(`/api/views/${shared.json.view.id}`)).status, 403);
  assert.equal((await owner.del(`/api/views/${mine.json.view.id}`)).status, 200, 'admins can remove any view');
});

test('my tasks, overview, search, activity feed and revision polling', async () => {
  await task({ title: 'Searchable needle', assigneeId: ownerId, dueDate: '2000-01-01' });
  const mine = (await owner.get(`/api/workspaces/${wid}/my-tasks`)).json.tasks;
  assert.ok(mine.length >= 1 && mine.every((t) => t.assigneeId === ownerId));
  assert.ok(mine[0].projectName && mine[0].statusName);

  const ov = (await owner.get(`/api/workspaces/${wid}/overview`)).json;
  assert.ok(ov.projects.find((p) => p.key === 'WR').total > 0);
  assert.ok(ov.mine.overdue >= 1);
  assert.ok(ov.workload.length >= 3);

  const found = (await owner.get(`/api/workspaces/${wid}/search?q=needle`)).json.tasks;
  assert.equal(found.length, 1);
  assert.equal((await owner.get(`/api/workspaces/${wid}/search?q=WR-1`)).json.tasks[0].number, 1);
  assert.deepEqual((await owner.get(`/api/workspaces/${wid}/search?q=%25`)).json.tasks, [], 'wildcards are escaped');
  assert.deepEqual((await owner.get(`/api/workspaces/${wid}/search?q=n`)).json.tasks, []);

  const feed = (await owner.get(`/api/workspaces/${wid}/activity`)).json.activity;
  assert.ok(feed.length > 5 && feed[0].actorName);
  assert.ok((await owner.get(`/api/projects/${project.id}/activity`)).json.activity.length > 5);

  const r1 = (await owner.get(`/api/workspaces/${wid}/rev`)).json.rev;
  await task({ title: 'Bump' });
  assert.ok((await owner.get(`/api/workspaces/${wid}/rev`)).json.rev > r1, 'writes advance the revision');
});

test('notifications can be marked read', async () => {
  const before = (await member.get(`/api/notifications?workspaceId=${wid}`)).json;
  assert.ok(before.unread > 0);
  const first = before.notifications[0].id;
  assert.equal((await member.post('/api/notifications/read', { workspaceId: wid, ids: [first] })).status, 200);
  assert.equal((await member.get(`/api/notifications?workspaceId=${wid}`)).json.unread, before.unread - 1);
  assert.equal((await member.post('/api/notifications/read', { workspaceId: wid })).status, 400);
  assert.equal((await member.post('/api/notifications/read', { workspaceId: wid, all: true })).status, 200);
  assert.equal((await member.get(`/api/notifications?workspaceId=${wid}&unread=1`)).json.notifications.length, 0);
  assert.equal((await owner.get(`/api/notifications?workspaceId=${wid}`)).status, 200);
});

test('archived projects are read-only; deleting a project needs the exact name', async () => {
  const p = (await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Old Stuff', key: 'OLD' })).json.project;
  const t = (await owner.post(`/api/projects/${p.id}/tasks`, { title: 'Legacy' })).json.task;
  assert.equal((await owner.patch(`/api/projects/${p.id}`, { archived: true })).status, 200);
  assert.equal((await owner.post(`/api/projects/${p.id}/tasks`, { title: 'New' })).status, 409);
  assert.equal((await owner.patch(`/api/tasks/${t.id}`, { title: 'Edit' })).status, 409);
  assert.equal((await owner.get(`/api/projects/${p.id}/tasks`)).status, 200, 'still readable');
  assert.equal((await owner.patch(`/api/projects/${p.id}`, { archived: false })).status, 200);
  assert.equal((await owner.del(`/api/projects/${p.id}`, { confirmName: 'wrong' })).status, 400);
  assert.equal((await owner.del(`/api/projects/${p.id}`, { confirmName: 'Old Stuff' })).status, 200);
  assert.equal((await owner.get(`/api/projects/${p.id}`)).status, 404);
});

test('removing a member unassigns their tasks but keeps the work', async () => {
  const t = (await task({ title: 'Orphan check', assigneeId: viewerId })).json.task;
  assert.equal((await owner.del(`/api/workspaces/${wid}/members/${viewerId}`)).status, 200);
  const after = (await owner.get(`/api/tasks/${t.id}`)).json.task;
  assert.equal(after.assigneeId, null);
  assert.equal((await viewer.get(`/api/projects/${project.id}/tasks`)).status, 404);
});
