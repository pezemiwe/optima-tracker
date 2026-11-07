'use strict';
const express = require('express');
const { HttpError, wrap, v, validate } = require('../util');
const { tx, touch } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { projectAccess, taskAccess, isMember } = require('../access');
const { logActivity, notify, addWatcher } = require('../services');

/* One shape for a task everywhere in the API. $1 is the viewing user. */
const TASK_COLUMNS = `
  t.id, t.number, t.project_id AS "projectId", p.key AS "projectKey", t.title, t.status_id AS "statusId", t.priority,
  t.assignee_id AS "assigneeId", t.reporter_id AS "reporterId", t.parent_id AS "parentId",
  t.start_date AS "startDate", t.due_date AS "dueDate", t.due_time AS "dueTime",
  t.estimate_minutes AS "estimateMinutes", t.position, t.created_at AS "createdAt", t.updated_at AS "updatedAt", t.completed_at AS "completedAt",
  COALESCE((SELECT array_agg(tl.label_id) FROM task_labels tl WHERE tl.task_id = t.id), '{}') AS "labelIds",
  (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id)::int AS "subtaskCount",
  (SELECT count(*) FROM tasks c JOIN statuses cs ON cs.id = c.status_id WHERE c.parent_id = t.id AND cs.category = 'done')::int AS "subtaskDone",
  (SELECT count(*) FROM comments cm WHERE cm.task_id = t.id)::int AS "commentCount",
  (SELECT count(*) FROM links l WHERE l.task_id = t.id)::int AS "linkCount",
  EXISTS (SELECT 1 FROM task_watchers w WHERE w.task_id = t.id AND w.user_id = $1) AS watching`;
const TASK_FROM = 'FROM tasks t JOIN projects p ON p.id = t.project_id';

async function fetchTask(db, userId, taskId) {
  const { rows } = await db.query(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = $2`, [userId, taskId]);
  return rows[0];
}

const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
const taskSpec = {
  title: v.str(1, 300),
  description: v.text(20000),
  statusId: v.uuid,
  priority: v.oneOf(PRIORITIES),
  assigneeId: v.nullable(v.uuid),
  startDate: v.nullable(v.date),
  dueDate: v.nullable(v.date),
  dueTime: v.nullable(v.time),
  estimateMinutes: v.nullable(v.int(0, 100000)),
  labelIds: v.uuidList(50),
  position: v.num,
};

function assertWritable(project) {
  if (project.archived) throw new HttpError(409, 'This project is archived. Restore it to make changes.', 'archived');
}

async function projectStatuses(c, projectId) {
  const { rows } = await c.query('SELECT id, name, category FROM statuses WHERE project_id = $1', [projectId]);
  return new Map(rows.map((s) => [s.id, s]));
}

async function assertLabels(c, projectId, labelIds) {
  if (!labelIds.length) return;
  const { rows } = await c.query('SELECT id FROM labels WHERE project_id = $1 AND id = ANY($2::uuid[])', [projectId, labelIds]);
  if (rows.length !== labelIds.length) throw new HttpError(400, 'One or more labels do not belong to this project.');
}

async function nextPosition(c, projectId, statusId) {
  const { rows } = await c.query('SELECT COALESCE(max(position), 0) + 1000 AS p FROM tasks WHERE project_id = $1 AND status_id = $2', [projectId, statusId]);
  return Number(rows[0].p);
}

async function userName(c, id) {
  if (!id) return null;
  const { rows } = await c.query('SELECT name FROM users WHERE id = $1', [id]);
  return rows[0] ? rows[0].name : null;
}

/*
 * Applies validated changes to one task: validation against the project, the
 * update itself, label diff, activity entries and notifications.
 */
async function applyChanges(c, { user, task, project, changes }) {
  const statuses = await projectStatuses(c, project.id);
  const oldStatus = statuses.get(task.status_id);
  let newStatus = oldStatus;
  const set = {};
  const log = [];

  if ('statusId' in changes) {
    newStatus = statuses.get(changes.statusId);
    if (!newStatus) throw new HttpError(400, 'That status does not belong to this project.');
  }
  const statusChanged = newStatus.id !== task.status_id;
  if (statusChanged) {
    set.status_id = newStatus.id;
    set.completed_at = newStatus.category === 'done' ? (task.completed_at || new Date()) : null;
    log.push({ field: 'status', from: oldStatus.name, to: newStatus.name });
    if (!('position' in changes)) set.position = await nextPosition(c, project.id, newStatus.id);
  }
  if ('position' in changes) set.position = changes.position;

  if ('title' in changes && changes.title !== task.title) { set.title = changes.title; log.push({ field: 'title', from: task.title, to: changes.title }); }
  if ('description' in changes && changes.description !== task.description) { set.description = changes.description; log.push({ field: 'description' }); }
  if ('priority' in changes && changes.priority !== task.priority) { set.priority = changes.priority; log.push({ field: 'priority', from: task.priority, to: changes.priority }); }
  if ('estimateMinutes' in changes && changes.estimateMinutes !== task.estimate_minutes) {
    set.estimate_minutes = changes.estimateMinutes;
    log.push({ field: 'estimate', from: task.estimate_minutes, to: changes.estimateMinutes });
  }

  let newAssignee = task.assignee_id;
  if ('assigneeId' in changes && changes.assigneeId !== task.assignee_id) {
    if (changes.assigneeId && !(await isMember(c, project.workspace_id, changes.assigneeId))) throw new HttpError(400, 'The assignee must be a workspace member.');
    set.assignee_id = changes.assigneeId;
    newAssignee = changes.assigneeId;
    log.push({ field: 'assignee', from: await userName(c, task.assignee_id), to: await userName(c, changes.assigneeId) });
  }

  // Dates: due time only makes sense with a due date; start must not follow due.
  const start = 'startDate' in changes ? changes.startDate : task.start_date;
  const due = 'dueDate' in changes ? changes.dueDate : task.due_date;
  if (start && due && start > due) throw new HttpError(400, 'The start date cannot be after the due date.', 'invalid');
  if ('startDate' in changes && changes.startDate !== task.start_date) { set.start_date = changes.startDate; log.push({ field: 'startDate', from: task.start_date, to: changes.startDate }); }
  if ('dueDate' in changes && changes.dueDate !== task.due_date) { set.due_date = changes.dueDate; log.push({ field: 'dueDate', from: task.due_date, to: changes.dueDate }); }
  if (!due) {
    if (task.due_time) set.due_time = null;
  } else if ('dueTime' in changes && changes.dueTime !== task.due_time) {
    set.due_time = changes.dueTime;
    log.push({ field: 'dueTime', from: task.due_time, to: changes.dueTime });
  }

  let labelDiff = null;
  if ('labelIds' in changes) {
    await assertLabels(c, project.id, changes.labelIds);
    const { rows } = await c.query('SELECT l.id, l.name FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = $1', [task.id]);
    const have = new Map(rows.map((r) => [r.id, r.name]));
    const want = new Set(changes.labelIds);
    const added = changes.labelIds.filter((id) => !have.has(id));
    const removed = [...have.keys()].filter((id) => !want.has(id));
    if (added.length || removed.length) {
      labelDiff = { added, removed };
      const { rows: names } = await c.query('SELECT id, name FROM labels WHERE id = ANY($1::uuid[])', [added]);
      log.push({ field: 'labels', added: names.map((n) => n.name), removed: removed.map((id) => have.get(id)) });
    }
  }

  const keys = Object.keys(set);
  if (keys.length || labelDiff) {
    if (keys.length) {
      await c.query(
        `UPDATE tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [task.id, ...keys.map((k) => set[k])],
      );
    } else {
      await c.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [task.id]);
    }
    if (labelDiff) {
      for (const id of labelDiff.removed) await c.query('DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2', [task.id, id]);
      for (const id of labelDiff.added) await c.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [task.id, id]);
    }
  }

  const base = { workspaceId: project.workspace_id, projectId: project.id, taskId: task.id, actorId: user.id };
  const label = `${project.key}-${task.number}`;
  for (const entry of log) await logActivity(c, { ...base, action: `task.${entry.field}`, detail: entry });

  const assigneeChanged = Boolean(newAssignee) && newAssignee !== task.assignee_id;
  if (assigneeChanged) {
    await addWatcher(c, task.id, newAssignee);
    await notify(c, { userIds: [newAssignee], workspaceId: project.workspace_id, taskId: task.id, actorId: user.id, type: 'assigned', body: `${user.name} assigned you ${label}: ${task.title}` });
  }
  if (statusChanged) {
    const { rows: watchers } = await c.query('SELECT user_id FROM task_watchers WHERE task_id = $1', [task.id]);
    await notify(c, {
      // Someone just assigned in the same edit already got an "assigned" notification.
      userIds: watchers.map((w) => w.user_id).filter((id) => !(assigneeChanged && id === newAssignee)),
      workspaceId: project.workspace_id, taskId: task.id, actorId: user.id, type: 'status',
      body: `${user.name} moved ${label} to ${newStatus.name}`,
    });
  }
  return log.length > 0;
}

module.exports = function taskRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/projects/:pid/tasks', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'viewer');
    const { rows } = await pool.query(
      `SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.project_id = $2 ORDER BY t.position, t.number LIMIT 10000`,
      [req.user.id, project.id],
    );
    res.json({ tasks: rows });
  }));

  router.post('/projects/:pid/tasks', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'member');
    assertWritable(project);
    const body = validate(req.body, { ...taskSpec, parentId: v.nullable(v.uuid) }, { required: ['title'] });
    const created = await tx(pool, async (c) => {
      const statuses = await projectStatuses(c, project.id);
      let status = body.statusId ? statuses.get(body.statusId) : null;
      if (body.statusId && !status) throw new HttpError(400, 'That status does not belong to this project.');
      if (!status) {
        const { rows } = await c.query("SELECT id FROM statuses WHERE project_id = $1 ORDER BY (category = 'todo') DESC, position LIMIT 1", [project.id]);
        status = statuses.get(rows[0].id);
      }
      if (body.assigneeId && !(await isMember(c, project.workspace_id, body.assigneeId))) throw new HttpError(400, 'The assignee must be a workspace member.');
      if (body.parentId) {
        const { rows } = await c.query('SELECT parent_id FROM tasks WHERE id = $1 AND project_id = $2', [body.parentId, project.id]);
        if (!rows[0]) throw new HttpError(400, 'The parent task does not exist in this project.');
        if (rows[0].parent_id) throw new HttpError(400, 'Subtasks cannot have their own subtasks.');
      }
      await assertLabels(c, project.id, body.labelIds || []);
      if (body.startDate && body.dueDate && body.startDate > body.dueDate) throw new HttpError(400, 'The start date cannot be after the due date.', 'invalid');

      const { rows: seq } = await c.query('UPDATE projects SET task_seq = task_seq + 1 WHERE id = $1 RETURNING task_seq', [project.id]);
      const position = 'position' in body ? body.position : await nextPosition(c, project.id, status.id);
      const { rows } = await c.query(
        `INSERT INTO tasks (project_id, number, title, description, status_id, priority, assignee_id, reporter_id, parent_id,
                            start_date, due_date, due_time, estimate_minutes, position, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id, number`,
        [project.id, seq[0].task_seq, body.title, body.description || '', status.id, body.priority || 'medium', body.assigneeId || null, req.user.id,
          body.parentId || null, body.startDate || null, body.dueDate || null, body.dueDate ? (body.dueTime || null) : null,
          body.estimateMinutes ?? null, position, status.category === 'done' ? new Date() : null],
      );
      const taskId = rows[0].id;
      for (const labelId of body.labelIds || []) await c.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2)', [taskId, labelId]);
      await addWatcher(c, taskId, req.user.id);
      await addWatcher(c, taskId, body.assigneeId);
      const key = `${project.key}-${rows[0].number}`;
      await logActivity(c, { workspaceId: project.workspace_id, projectId: project.id, taskId, actorId: req.user.id, action: 'task.created', detail: { title: body.title, key } });
      if (body.assigneeId) {
        await notify(c, { userIds: [body.assigneeId], workspaceId: project.workspace_id, taskId, actorId: req.user.id, type: 'assigned', body: `${req.user.name} assigned you ${key}: ${body.title}` });
      }
      await touch(c, project.workspace_id);
      return taskId;
    });
    res.status(201).json({ task: await fetchTask(pool, req.user.id, created) });
  }));

  router.get('/tasks/:tid', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'viewer');
    const full = await fetchTask(pool, req.user.id, task.id);
    const [{ rows: desc }, { rows: reporter }, { rows: links }, { rows: comments }, { rows: activity }, { rows: watchers }, { rows: subtasks }] = await Promise.all([
      pool.query('SELECT description FROM tasks WHERE id = $1', [task.id]),
      pool.query('SELECT id, name, color FROM users WHERE id = $1', [task.reporter_id]),
      pool.query('SELECT l.id, l.name, l.url, l.created_at AS "createdAt", u.name AS "createdByName" FROM links l LEFT JOIN users u ON u.id = l.created_by WHERE l.task_id = $1 ORDER BY l.created_at', [task.id]),
      pool.query(
        `SELECT c.id, c.body, c.created_at AS "createdAt", c.edited_at AS "editedAt", u.id AS "authorId", u.name AS "authorName", u.color AS "authorColor"
           FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = $1 ORDER BY c.created_at`,
        [task.id],
      ),
      pool.query(
        `SELECT a.id, a.action, a.detail, a.created_at AS "createdAt", u.id AS "actorId", u.name AS "actorName", u.color AS "actorColor"
           FROM activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.task_id = $1 ORDER BY a.id DESC LIMIT 100`,
        [task.id],
      ),
      pool.query('SELECT user_id AS "userId" FROM task_watchers WHERE task_id = $1', [task.id]),
      pool.query(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.parent_id = $2 ORDER BY t.position, t.number`, [req.user.id, task.id]),
    ]);
    res.json({
      task: { ...full, description: desc[0].description },
      reporter: reporter[0] || null, links, comments, activity, watchers: watchers.map((w) => w.userId), subtasks,
    });
  }));

  router.patch('/tasks/:tid', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'member');
    const body = validate(req.body, taskSpec);
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [task.project_id]);
    const project = rows[0];
    assertWritable(project);
    await tx(pool, async (c) => {
      // Re-read inside the transaction so concurrent edits diff against fresh values.
      const { rows: fresh } = await c.query('SELECT * FROM tasks WHERE id = $1 FOR UPDATE', [task.id]);
      if (!fresh[0]) throw new HttpError(404, 'Not found.', 'not_found');
      await applyChanges(c, { user: req.user, task: fresh[0], project, changes: body });
      await touch(c, project.workspace_id);
    });
    res.json({ task: await fetchTask(pool, req.user.id, task.id) });
  }));

  router.delete('/tasks/:tid', wrap(async (req, res) => {
    const { task, role } = await taskAccess(pool, req.user, req.params.tid, 'member');
    if (role === 'member' && task.reporter_id !== req.user.id) throw new HttpError(403, 'Members can only delete tasks they created. Ask an admin.', 'forbidden');
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [task.project_id]);
    assertWritable(rows[0]);
    await tx(pool, async (c) => {
      await c.query('DELETE FROM tasks WHERE id = $1', [task.id]);
      await logActivity(c, {
        workspaceId: task.workspace_id, projectId: task.project_id, actorId: req.user.id, action: 'task.deleted',
        detail: { title: task.title, key: `${task.project_key}-${task.number}` },
      });
      await touch(c, task.workspace_id);
    });
    res.json({ ok: true });
  }));

  /* Change or delete many tasks at once (multi-select, "bring unfinished here"). */
  router.post('/projects/:pid/tasks/bulk', wrap(async (req, res) => {
    const { project, role } = await projectAccess(pool, req.user, req.params.pid, 'member');
    assertWritable(project);
    const body = validate(req.body, {
      ids: v.uuidList(200),
      delete: v.bool,
      changes: (x) => validate(x, { statusId: taskSpec.statusId, priority: taskSpec.priority, assigneeId: taskSpec.assigneeId, dueDate: taskSpec.dueDate, startDate: taskSpec.startDate, labelIds: taskSpec.labelIds }),
    }, { required: ['ids'] });
    if (!body.ids.length) throw new HttpError(400, 'Select at least one task.');
    if (!body.delete && (!body.changes || !Object.keys(body.changes).length)) throw new HttpError(400, 'Nothing to change.');
    const count = await tx(pool, async (c) => {
      const { rows } = await c.query('SELECT * FROM tasks WHERE project_id = $1 AND id = ANY($2::uuid[]) ORDER BY number FOR UPDATE', [project.id, body.ids]);
      if (rows.length !== body.ids.length) throw new HttpError(404, 'Some of those tasks no longer exist.', 'not_found');
      if (body.delete) {
        if (role === 'member' && rows.some((t) => t.reporter_id !== req.user.id)) throw new HttpError(403, 'Members can only delete tasks they created.', 'forbidden');
        await c.query('DELETE FROM tasks WHERE id = ANY($1::uuid[])', [body.ids]);
        await logActivity(c, { workspaceId: project.workspace_id, projectId: project.id, actorId: req.user.id, action: 'task.bulk_deleted', detail: { count: rows.length } });
      } else {
        for (const task of rows) {
          let changes = body.changes;
          if (changes.labelIds) {
            // Bulk label changes add to what is already there rather than replacing it.
            const { rows: have } = await c.query('SELECT label_id FROM task_labels WHERE task_id = $1', [task.id]);
            changes = { ...changes, labelIds: [...new Set([...have.map((h) => h.label_id), ...changes.labelIds])] };
          }
          await applyChanges(c, { user: req.user, task, project, changes });
        }
      }
      await touch(c, project.workspace_id);
      return rows.length;
    });
    res.json({ ok: true, count });
  }));

  /* Everything assigned to the signed-in user, across projects. */
  router.get('/workspaces/:wid/my-tasks', wrap(async (req, res) => {
    await requireRole(pool, req.user, req.params.wid, 'viewer');
    const { rows } = await pool.query(
      `SELECT ${TASK_COLUMNS}, p.name AS "projectName", p.color AS "projectColor", s.name AS "statusName", s.category AS "statusCategory", s.color AS "statusColor"
         ${TASK_FROM} JOIN statuses s ON s.id = t.status_id
        WHERE p.workspace_id = $2 AND p.archived = false AND t.assignee_id = $1
          ${req.query.all ? '' : "AND (s.category <> 'done' OR t.completed_at > now() - interval '7 days')"}
        ORDER BY (s.category = 'done'), t.due_date NULLS LAST, t.number LIMIT 1000`,
      [req.user.id, req.params.wid],
    );
    res.json({ tasks: rows });
  }));

  return router;
};

module.exports.applyChanges = applyChanges;
