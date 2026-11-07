'use strict';
/* Recurring tasks: working out the next date, and creating the next copy when one is completed. */
const { addWatcher, logActivity } = require('./services');

const FREQS = ['daily', 'weekdays', 'weekly', 'monthly'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

function addDays(s, n) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }

/* Month arithmetic that clamps (31 Jan + 1 month = 28/29 Feb) instead of overflowing into March. */
function addMonths(s, n) {
  const d = parse(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
}

function step(s, rec) {
  const n = rec.interval || 1;
  if (rec.freq === 'daily') return addDays(s, n);
  if (rec.freq === 'weekly') return addDays(s, 7 * n);
  if (rec.freq === 'monthly') return addMonths(s, n);
  // weekdays: the next Monday-to-Friday day
  let next = addDays(s, 1);
  while ([0, 6].includes(parse(next).getUTCDay())) next = addDays(next, 1);
  return next;
}

/*
 * The next occurrence after `from` (the due date, or today when there is none).
 * If a task is finished late, the next copy is the first occurrence that is still in the future.
 */
function nextDate(from, rec, today) {
  let next = step(from, rec);
  for (let i = 0; next <= today && i < 2000; i++) next = step(next, rec);
  return next;
}

/* Copies a finished recurring task into a fresh open one. Returns the new task id, or null. */
async function spawnNext(c, { user, task, project, firstTodoId, today }) {
  if (!task.recurrence || task.recurrence_spawned) return null;
  const rec = task.recurrence;
  const base = task.due_date || today;
  const due = nextDate(base, rec, today);
  // Keep the same distance between start and due.
  let start = null;
  if (task.start_date && task.due_date) {
    const gap = Math.round((parse(task.due_date) - parse(task.start_date)) / 86400000);
    start = addDays(due, -gap);
  }
  const { rows: seq } = await c.query('UPDATE projects SET task_seq = task_seq + 1 WHERE id = $1 RETURNING task_seq', [project.id]);
  const { rows: pos } = await c.query('SELECT COALESCE(max(position), 0) + 1000 AS p FROM tasks WHERE project_id = $1 AND status_id = $2', [project.id, firstTodoId]);
  const { rows } = await c.query(
    `INSERT INTO tasks (project_id, number, title, description, status_id, priority, assignee_id, reporter_id, parent_id, start_date, due_date, due_time,
                        estimate_minutes, points, recurrence, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,$12,$13,$14,$15) RETURNING id, number`,
    [project.id, seq[0].task_seq, task.title, task.description, firstTodoId, task.priority, task.assignee_id, task.reporter_id, start, due, task.due_time,
      task.estimate_minutes, task.points, JSON.stringify(rec), Number(pos[0].p)],
  );
  const id = rows[0].id;
  await c.query('INSERT INTO task_labels (task_id, label_id) SELECT $1, label_id FROM task_labels WHERE task_id = $2', [id, task.id]);
  await c.query('INSERT INTO task_field_values (task_id, field_id, value) SELECT $1, field_id, value FROM task_field_values WHERE task_id = $2', [id, task.id]);
  await addWatcher(c, id, task.assignee_id);
  await addWatcher(c, id, task.reporter_id);
  await c.query('UPDATE tasks SET recurrence_spawned = true WHERE id = $1', [task.id]);
  const key = `${project.key}-${rows[0].number}`;
  await logActivity(c, { workspaceId: project.workspace_id, projectId: project.id, taskId: id, actorId: user.id, action: 'task.created', detail: { title: task.title, key, recurring: true } });
  await logActivity(c, { workspaceId: project.workspace_id, projectId: project.id, taskId: task.id, actorId: user.id, action: 'task.recurred', detail: { key, due } });
  return id;
}

function describeRecurrence(rec) {
  if (!rec) return 'does not repeat';
  const n = rec.interval || 1;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[rec.freq];
  if (rec.freq === 'weekdays') return 'every weekday';
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

module.exports = { FREQS, nextDate, addDays, addMonths, spawnNext, describeRecurrence };
