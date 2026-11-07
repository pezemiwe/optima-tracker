'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, Client } = require('./helpers');
const { nextDate, addMonths, describeRecurrence } = require('../server/recurrence');
const { burndown } = require('../server/routes/agile');

const PASSWORD = 'correct horse battery';
const today = () => new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('recurrence dates: daily, weekly, month-end clamping, weekdays, and late completion', () => {
  assert.equal(nextDate('2026-11-07', { freq: 'daily', interval: 1 }, '2026-11-01'), '2026-11-08');
  assert.equal(nextDate('2026-11-07', { freq: 'weekly', interval: 2 }, '2026-11-01'), '2026-11-21');
  assert.equal(nextDate('2026-01-31', { freq: 'monthly', interval: 1 }, '2026-01-01'), '2026-02-28', 'no overflow into March');
  assert.equal(nextDate('2028-01-31', { freq: 'monthly', interval: 1 }, '2028-01-01'), '2028-02-29', 'leap year');
  assert.equal(nextDate('2026-12-15', { freq: 'monthly', interval: 3 }, '2026-01-01'), '2027-03-15', 'crosses the year');
  assert.equal(nextDate('2026-11-06', { freq: 'weekdays', interval: 1 }, '2026-11-01'), '2026-11-09', 'Friday -> Monday');
  assert.equal(nextDate('2026-11-05', { freq: 'weekdays', interval: 1 }, '2026-11-01'), '2026-11-06');
  // Finished two weeks late: the next copy is in the future, not in the past.
  assert.equal(nextDate('2026-11-01', { freq: 'weekly', interval: 1 }, '2026-11-15'), '2026-11-22');
  assert.equal(nextDate('2026-11-01', { freq: 'daily', interval: 1 }, '2026-11-15'), '2026-11-16');
  assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
  assert.equal(describeRecurrence({ freq: 'weekly', interval: 1 }), 'every week');
  assert.equal(describeRecurrence({ freq: 'monthly', interval: 3 }), 'every 3 months');
  assert.equal(describeRecurrence({ freq: 'weekdays', interval: 1 }), 'every weekday');
});

test('burndown counts tasks or points, ideal line falls evenly, future days are null', () => {
  const tasks = [{ points: 3, completedAt: '2026-11-02T10:00:00Z' }, { points: 5, completedAt: '2026-11-04T10:00:00Z' }, { points: 2, completedAt: null }];
  const b = burndown(tasks, '2026-11-01', '2026-11-05', '2026-11-03');
  assert.equal(b.unit, 'points');
  assert.equal(b.total, 10);
  assert.deepEqual(b.days.map((d) => d.remaining), [10, 7, 7, null, null]);
  assert.deepEqual(b.days.map((d) => d.ideal), [10, 7.5, 5, 2.5, 0]);
  const plain = burndown([{ points: null, completedAt: '2026-11-01T00:00:00Z' }, { points: null, completedAt: null }], '2026-11-01', '2026-11-02', '2026-11-02');
  assert.equal(plain.unit, 'tasks');
  assert.deepEqual(plain.days.map((d) => d.remaining), [1, 1]);
  assert.equal(burndown([], '2026-11-01', '2026-11-01', '2026-11-01').days.length, 1, 'a one-day sprint works');
});

let env, owner, member, viewer, project, statuses, todo, done;
const mk = async (body, client = owner) => (await client.post(`/api/projects/${project.id}/tasks`, body)).json.task;

test.before(async () => {
  process.env.SEED = 'off';
  env = await boot();
  owner = new Client(env.base);
  const r = await owner.post('/api/auth/register', { name: 'Owner', email: 'owner@example.com', password: PASSWORD, workspaceName: 'Acme' });
  const wid = r.json.workspaces[0].id;
  const join = async (email, role, name) => {
    const inv = await owner.post(`/api/workspaces/${wid}/invites`, { email, role });
    const c = new Client(env.base);
    await c.post('/api/auth/register', { name, email, password: PASSWORD, inviteToken: inv.json.token });
    return c;
  };
  member = await join('m@example.com', 'member', 'Mia');
  viewer = await join('v@example.com', 'viewer', 'Vic');
  project = (await owner.post(`/api/workspaces/${wid}/projects`, { name: 'Agile' })).json.project;
  statuses = (await owner.get(`/api/projects/${project.id}`)).json.statuses;
  todo = statuses.find((s) => s.category === 'todo');
  done = statuses.find((s) => s.category === 'done');
});
test.after(async () => { delete process.env.SEED; await env.close(); });

test('sprints: plan, assign work, one running at a time, complete with carry-over, immutable afterwards', async () => {
  const s1 = (await member.post(`/api/projects/${project.id}/sprints`, { name: 'Sprint 1', goal: 'Ship login' })).json.sprint;
  const s2 = (await owner.post(`/api/projects/${project.id}/sprints`, { name: 'Sprint 2' })).json.sprint;
  assert.equal(s1.state, 'planned');
  assert.equal((await viewer.post(`/api/projects/${project.id}/sprints`, { name: 'No' })).status, 403);
  assert.equal((await owner.post(`/api/projects/${project.id}/sprints`, { name: 'Bad', startDate: '2026-12-10', endDate: '2026-12-01' })).status, 400);

  const a = await mk({ title: 'Done by the end', points: 5, sprintId: s1.id });
  const b = await mk({ title: 'Carried over', points: 3 });
  const c = await mk({ title: 'Stays in backlog' });
  assert.equal(a.sprintId, s1.id);
  assert.equal(a.points, 5);
  assert.equal((await owner.patch(`/api/tasks/${b.id}`, { sprintId: s1.id })).status, 200);
  assert.equal((await owner.patch(`/api/tasks/${b.id}`, { sprintId: '00000000-0000-4000-8000-000000000000' })).status, 400, 'unknown sprint');
  assert.equal((await owner.patch(`/api/tasks/${a.id}`, { points: 5000 })).status, 400);
  const child = await mk({ title: 'Child', parentId: a.id });
  assert.equal((await owner.patch(`/api/tasks/${child.id}`, { sprintId: s1.id })).status, 400, 'subtasks follow their parent');

  let list = (await owner.get(`/api/projects/${project.id}/sprints`)).json.sprints.find((s) => s.id === s1.id);
  assert.deepEqual([list.taskCount, list.points, list.doneCount], [2, 8, 0]);
  const log = (await owner.get(`/api/tasks/${b.id}`)).json.activity;
  assert.ok(log.some((x) => x.action === 'task.sprint' && x.detail.to === 'Sprint 1'));

  const started = await owner.post(`/api/sprints/${s1.id}/start`);
  assert.equal(started.json.sprint.state, 'active');
  assert.ok(started.json.sprint.startDate && started.json.sprint.endDate, 'dates default when missing');
  assert.equal((await owner.post(`/api/sprints/${s2.id}/start`)).status, 409, 'only one running sprint');
  assert.equal((await owner.post(`/api/sprints/${s1.id}/start`)).status, 409, 'already started');
  assert.equal((await owner.del(`/api/sprints/${s1.id}`)).status, 409, 'cannot delete a running sprint');

  await owner.patch(`/api/tasks/${a.id}`, { statusId: done.id });
  const bd = (await owner.get(`/api/sprints/${s1.id}/burndown`)).json;
  assert.equal(bd.unit, 'points');
  assert.equal(bd.total, 8);
  assert.equal(bd.days[0].ideal, 8);
  assert.equal(bd.days.find((d) => d.date === today()).remaining, 3, 'finishing the 5-point task leaves 3');

  assert.equal((await owner.post(`/api/sprints/${s1.id}/complete`, { moveTo: s1.id })).status, 400, 'carry-over must go to a planned sprint');
  const finished = await owner.post(`/api/sprints/${s1.id}/complete`, { moveTo: s2.id });
  assert.equal(finished.status, 200);
  assert.equal(finished.json.moved, 1);
  assert.equal(finished.json.sprint.state, 'completed');
  assert.deepEqual(finished.json.sprint.summary.completed, { tasks: 1, points: 5 });
  assert.equal(finished.json.sprint.summary.movedTo, 'Sprint 2');
  const moved = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks;
  assert.equal(moved.find((t) => t.id === b.id).sprintId, s2.id, 'unfinished work moved on');
  assert.equal(moved.find((t) => t.id === a.id).sprintId, s1.id, 'finished work stays for the record');
  assert.equal(moved.find((t) => t.id === c.id).sprintId, null);
  assert.equal((await owner.get(`/api/sprints/${s1.id}/burndown`)).json.total, 8, 'the completed sprint keeps its original burndown');
  assert.equal((await owner.patch(`/api/sprints/${s1.id}`, { name: 'Edited' })).status, 409);
  assert.equal((await owner.patch(`/api/tasks/${c.id}`, { sprintId: s1.id })).status, 400, 'no new work in a completed sprint');
  assert.equal((await owner.post(`/api/sprints/${s1.id}/complete`)).status, 409);

  // Deleting a planned sprint puts its work back in the backlog.
  assert.equal((await member.del(`/api/sprints/${s2.id}`)).status, 200);
  assert.equal((await owner.get(`/api/tasks/${b.id}`)).json.task.sprintId, null);
});

test('sprints of archived projects are read-only', async () => {
  const p = (await owner.post(`/api/workspaces/${(await owner.get('/api/auth/me')).json.workspaces[0].id}/projects`, { name: 'Old' })).json.project;
  const sp = (await owner.post(`/api/projects/${p.id}/sprints`, { name: 'S' })).json.sprint;
  await owner.patch(`/api/projects/${p.id}`, { archived: true });
  assert.equal((await owner.post(`/api/projects/${p.id}/sprints`, { name: 'T' })).status, 409);
  assert.equal((await owner.post(`/api/sprints/${sp.id}/start`)).status, 409);
});

test('custom fields: define, validate every type, clear, and keep choices consistent', async () => {
  const f = async (body, client = owner) => client.post(`/api/projects/${project.id}/fields`, body);
  const text = (await f({ name: 'Customer', type: 'text' })).json.field;
  const num = (await f({ name: 'Budget', type: 'number' })).json.field;
  const date = (await f({ name: 'Review date', type: 'date' })).json.field;
  const box = (await f({ name: 'Approved', type: 'checkbox' })).json.field;
  const pick = (await f({ name: 'Region', type: 'select', options: ['EMEA', 'APAC', 'AMER'] })).json.field;
  assert.equal((await f({ name: 'customer', type: 'text' })).status, 409, 'names are unique, ignoring case');
  assert.equal((await f({ name: 'Empty choice', type: 'select', options: [] })).status, 400);
  assert.equal((await f({ name: 'Dup', type: 'select', options: ['a', 'A'] })).status, 400);
  assert.equal((await f({ name: 'Nope', type: 'text' }, member)).status, 403, 'only admins define fields');
  assert.equal((await owner.get(`/api/projects/${project.id}`)).json.fields.length, 5);

  const t = await mk({ title: 'Fielded' });
  const set = (fields, client = member) => client.patch(`/api/tasks/${t.id}`, { fields });
  const ok = await set({ [text.id]: 'Acme', [num.id]: 1250.5, [date.id]: '2026-12-01', [box.id]: true, [pick.id]: 'APAC' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.task.fields, { [text.id]: 'Acme', [num.id]: 1250.5, [date.id]: '2026-12-01', [box.id]: true, [pick.id]: 'APAC' });
  assert.equal((await set({ [num.id]: 'lots' })).status, 400);
  assert.equal((await set({ [date.id]: '2026-02-30' })).status, 400);
  assert.equal((await set({ [box.id]: 'yes' })).status, 400);
  assert.equal((await set({ [pick.id]: 'LATAM' })).status, 400, 'must be one of the defined choices');
  assert.equal((await set({ [text.id]: 'x'.repeat(501) })).status, 400);
  assert.equal((await set({ '00000000-0000-4000-8000-000000000000': 'x' })).status, 400, 'a field from nowhere');
  assert.equal((await set({ [text.id]: 'Nope' }, viewer)).status, 403);
  const logged = (await owner.get(`/api/tasks/${t.id}`)).json.activity.find((x) => x.action === 'task.custom' && x.detail.name === 'Customer');
  assert.equal(logged.detail.to, 'Acme');

  assert.equal((await set({ [text.id]: null })).json.task.fields[text.id], undefined, 'null clears a value');
  assert.equal((await owner.patch(`/api/fields/${pick.id}`, { options: ['EMEA', 'AMER'] })).status, 200);
  assert.equal((await owner.get(`/api/tasks/${t.id}`)).json.task.fields[pick.id], undefined, 'removing a choice clears values that used it');
  assert.equal((await owner.patch(`/api/fields/${num.id}`, { options: ['x'] })).status, 400, 'only choice fields have choices');
  assert.equal((await owner.patch(`/api/fields/${num.id}`, { name: 'Budget (USD)' })).status, 200);
  assert.equal((await owner.del(`/api/fields/${box.id}`)).status, 200);
  assert.equal((await owner.get(`/api/tasks/${t.id}`)).json.task.fields[box.id], undefined, 'deleting a field removes its values');
  const created = await mk({ title: 'With fields at creation', fields: { [text.id]: 'Initech' } });
  assert.equal(created.fields[text.id], 'Initech');
});

test('recurring tasks spawn exactly one next copy, carrying details forward', async () => {
  const label = (await owner.post(`/api/projects/${project.id}/labels`, { name: 'Routine' })).json.label;
  const field = (await owner.get(`/api/projects/${project.id}`)).json.fields.find((x) => x.name === 'Customer');
  const t = await mk({
    title: 'Weekly report', description: 'Send to finance', priority: 'high', dueDate: today(), dueTime: '09:00', points: 2,
    labelIds: [label.id], recurrence: { freq: 'weekly', interval: 1 }, fields: { [field.id]: 'Finance' },
  });
  assert.deepEqual(t.recurrence, { freq: 'weekly', interval: 1 });
  assert.equal((await owner.patch(`/api/tasks/${t.id}`, { recurrence: { freq: 'hourly' } })).status, 400);
  assert.equal((await owner.patch(`/api/tasks/${t.id}`, { recurrence: { freq: 'daily', interval: 0 } })).status, 400);

  const before = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.length;
  await owner.patch(`/api/tasks/${t.id}`, { statusId: done.id });
  const after = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks;
  assert.equal(after.length, before + 1);
  const next = after.find((x) => x.title === 'Weekly report' && x.id !== t.id);
  assert.equal(next.dueDate, plus(7), 'a week after the old due date');
  assert.equal(next.dueTime, '09:00');
  assert.equal(next.statusId, todo.id, 'starts open');
  assert.equal(next.priority, 'high');
  assert.equal(next.points, 2);
  assert.deepEqual(next.labelIds, [label.id]);
  assert.equal(next.fields[field.id], 'Finance');
  assert.deepEqual(next.recurrence, { freq: 'weekly', interval: 1 }, 'and it repeats too');
  assert.equal((await owner.get(`/api/tasks/${t.id}`)).json.task.description, 'Send to finance');
  const log = (await owner.get(`/api/tasks/${t.id}`)).json.activity;
  assert.ok(log.some((x) => x.action === 'task.recurred'));

  // Reopening and finishing the original again must not create a duplicate.
  await owner.patch(`/api/tasks/${t.id}`, { statusId: todo.id });
  await owner.patch(`/api/tasks/${t.id}`, { statusId: done.id });
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.length, before + 1);

  // The copy keeps the chain going.
  await owner.patch(`/api/tasks/${next.id}`, { statusId: done.id });
  const third = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.filter((x) => x.title === 'Weekly report');
  assert.equal(third.length, 3);
  // Finishing a non-recurring task never spawns anything.
  const plain = await mk({ title: 'One-off', dueDate: today() });
  const n = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.length;
  await owner.patch(`/api/tasks/${plain.id}`, { statusId: done.id });
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.length, n);
});

test('recurring tasks without a due date repeat from today, and stopping the repeat works', async () => {
  const t = await mk({ title: 'Daily standup notes', recurrence: { freq: 'daily', interval: 1 } });
  await owner.patch(`/api/tasks/${t.id}`, { statusId: done.id });
  const copies = (await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.filter((x) => x.title === 'Daily standup notes');
  assert.equal(copies.length, 2);
  assert.equal(copies.find((x) => x.id !== t.id).dueDate, plus(1), 'tomorrow');
  const stop = copies.find((x) => x.id !== t.id);
  assert.equal((await owner.patch(`/api/tasks/${stop.id}`, { recurrence: null })).json.task.recurrence, null);
  await owner.patch(`/api/tasks/${stop.id}`, { statusId: done.id });
  assert.equal((await owner.get(`/api/projects/${project.id}/tasks`)).json.tasks.filter((x) => x.title === 'Daily standup notes').length, 2, 'no more copies once stopped');
});
