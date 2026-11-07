'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let dates, filters, activity;
test.before(async () => {
  dates = await import('../src/lib/dates.mjs');
  filters = await import('../src/lib/filters.mjs');
  activity = await import('../src/lib/activity.mjs');
});

test('date arithmetic works on plain strings across month and year ends', () => {
  assert.equal(dates.shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(dates.shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(dates.shiftMonth('2026-01-31', 1), '2026-02-01');
  assert.equal(dates.diffDays('2026-11-07', '2026-11-04'), 3);
  assert.equal(dates.toISODate(new Date(2026, 10, 4)), '2026-11-04');
});

test('due info labels overdue, today, soon and later', () => {
  const today = '2026-11-07';
  assert.equal(dates.dueInfo('2026-11-06', false, today).tone, 'overdue');
  assert.equal(dates.dueInfo('2026-11-06', true, today).tone, 'done', 'finished work is never overdue');
  assert.deepEqual(dates.dueInfo('2026-11-07', false, today), { text: 'Today', tone: 'today', days: 0 });
  assert.equal(dates.dueInfo('2026-11-08', false, today).text, 'Tomorrow');
  assert.equal(dates.dueInfo('2026-12-25', false, today).tone, 'later');
  assert.equal(dates.dueInfo(null, false, today), null);
});

test('month grid has 42 days starting on a Monday and flags the month', () => {
  const grid = dates.monthGrid('2026-11-15');
  assert.equal(grid.length, 42);
  assert.equal(dates.parseISO(grid[0].date).getDay(), 1);
  assert.equal(grid.filter((d) => d.inMonth).length, 30);
  assert.equal(grid.find((d) => d.date === '2026-11-01').inMonth, true);
});

test('durations round-trip and reject nonsense', () => {
  assert.equal(dates.parseDuration('1h 30m'), 90);
  assert.equal(dates.parseDuration('45m'), 45);
  assert.equal(dates.parseDuration('2h'), 120);
  assert.equal(dates.parseDuration('1.5h'), 90);
  assert.equal(dates.parseDuration('90'), 90);
  assert.equal(dates.parseDuration(''), null);
  assert.throws(() => dates.parseDuration('soon'));
  assert.equal(dates.formatDuration(90), '1h 30m');
  assert.equal(dates.formatDuration(120), '2h');
  assert.equal(dates.formatDuration(5), '5m');
});

const statuses = [
  { id: 's1', name: 'To do', category: 'todo', color: '#aaa' },
  { id: 's2', name: 'Doing', category: 'active', color: '#bbb' },
  { id: 's3', name: 'Done', category: 'done', color: '#ccc' },
];
const statusById = new Map(statuses.map((s) => [s.id, s]));
const mk = (n, over = {}) => ({
  id: `t${n}`, number: n, projectKey: 'WR', title: `Task ${n}`, statusId: 's1', priority: 'medium', assigneeId: null, parentId: null,
  dueDate: null, labelIds: [], position: n * 1000, createdAt: `2026-01-0${n}T00:00:00Z`, updatedAt: `2026-01-0${n}T00:00:00Z`, ...over,
});
const ctx = { statusById, meId: 'me', today: '2026-11-07' };

test('filters combine and "me" resolves to the viewer', () => {
  const tasks = [
    mk(1, { assigneeId: 'me', priority: 'high', dueDate: '2026-11-01' }),
    mk(2, { assigneeId: 'other', statusId: 's3', dueDate: '2026-11-01' }),
    mk(3, { labelIds: ['l1'], dueDate: '2026-11-07' }),
    mk(4, { dueDate: '2026-11-10' }),
    mk(5, { parentId: 't1', title: 'Hidden child' }),
  ];
  const f = (over) => filters.filterTasks(tasks, over, ctx).map((t) => t.number);
  assert.deepEqual(f({}), [1, 2, 3, 4], 'subtasks are hidden by default');
  assert.deepEqual(f({ showSubtasks: true }), [1, 2, 3, 4, 5]);
  assert.deepEqual(f({ assignee: ['me'] }), [1]);
  assert.deepEqual(f({ assignee: ['none'] }), [3, 4, 5]);
  assert.deepEqual(f({ priority: ['high'] }), [1]);
  assert.deepEqual(f({ labels: ['l1'] }), [3]);
  assert.deepEqual(f({ due: 'overdue' }), [1], 'a done task is not overdue');
  assert.deepEqual(f({ due: 'today' }), [3]);
  assert.deepEqual(f({ due: 'week' }), [3, 4]);
  assert.deepEqual(f({ due: 'none' }), [5], 'an active filter also surfaces subtasks');
  assert.deepEqual(f({ hideDone: true }), [1, 3, 4, 5]);
  assert.deepEqual(f({ q: 'hidden child' }), [5], 'searching reaches subtasks');
  assert.deepEqual(f({ q: 'wr-3' }), [3], 'search matches the task key');
  assert.deepEqual(f({ status: ['s3'] }), [2]);
  assert.equal(filters.activeFilterCount({ ...filters.DEFAULT_FILTERS, status: ['s1'], due: 'today', hideDone: true }), 3);
});

test('sorting by field and direction, stable on ties', () => {
  const tasks = [mk(1, { priority: 'low' }), mk(2, { priority: 'urgent' }), mk(3, { priority: 'urgent', dueDate: '2026-01-01' })];
  const order = (key, dir = 'asc') => filters.sortTasks(tasks, { sortKey: key, sortDir: dir }).map((t) => t.number);
  assert.deepEqual(order('priority'), [2, 3, 1]);
  assert.deepEqual(order('priority', 'desc'), [1, 3, 2]);
  assert.deepEqual(order('due'), [3, 1, 2]);
  assert.deepEqual(order('manual'), [1, 2, 3]);
});

test('grouping keeps empty status columns and drops empty other groups', () => {
  const tasks = [mk(1), mk(2, { statusId: 's3', assigneeId: 'u1' })];
  const members = [{ id: 'u1', name: 'Ann', color: '#111' }, { id: 'u2', name: 'Bob', color: '#222' }];
  const byStatus = filters.groupTasks(tasks, 'status', { statuses, members, labels: [] });
  assert.deepEqual(byStatus.map((g) => g.tasks.length), [1, 0, 1]);
  const byAssignee = filters.groupTasks(tasks, 'assignee', { statuses, members, labels: [] });
  assert.deepEqual(byAssignee.map((g) => g.label), ['Ann', 'Unassigned']);
  assert.equal(filters.groupTasks(tasks, 'none', { statuses, members, labels: [] })[0].tasks.length, 2);
});

test('drag position lands between neighbours', () => {
  assert.equal(filters.positionBetween(null, null), 1000);
  assert.equal(filters.positionBetween(null, 1000), 500);
  assert.equal(filters.positionBetween(1000, null), 2000);
  assert.equal(filters.positionBetween(1000, 2000), 1500);
});

test('activity sentences and mention parsing', () => {
  assert.equal(activity.describeActivity({ action: 'task.status', detail: { from: 'To do', to: 'Done' } }), 'moved this from To do to Done');
  assert.match(activity.describeActivity({ action: 'task.assignee', detail: { from: null, to: 'Ann' } }), /assigned this to Ann/);
  assert.match(activity.describeActivity({ action: 'task.labels', detail: { added: ['Bug'], removed: [] } }), /added Bug/);
  const members = [{ id: 'a', name: 'Tosin Ilesanmi' }, { id: 'b', name: 'Tosin' }];
  assert.deepEqual(activity.mentionedIds('hi @tosin ilesanmi and more', members), ['a'], 'a longer name does not also mention the shorter one');
  assert.deepEqual(activity.mentionedIds('@Tosin Ilesanmi and @Tosin', members).sort(), ['a', 'b']);
  const parts = activity.splitMentions('ping @Tosin Ilesanmi now', members);
  assert.deepEqual(parts, [{ text: 'ping ', mention: false }, { text: '@Tosin Ilesanmi', mention: true }, { text: ' now', mention: false }]);
  assert.deepEqual(activity.splitMentions('no mentions', members), [{ text: 'no mentions', mention: false }]);
});
