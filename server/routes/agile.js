'use strict';
/* Sprints (plan, run, complete, burndown) and per-project custom fields. */
const express = require('express');
const { HttpError, wrap, v, validate } = require('../util');
const { tx, touch } = require('../db');
const { requireAuth } = require('../auth');
const { projectAccess } = require('../access');
const { logActivity } = require('../services');

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dayOf = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/*
 * Burndown for a sprint. tasks: [{ points, completedAt }]. Uses story points when any task has them, otherwise counts tasks.
 * Days after `today` have remaining = null so a chart can stop the line there.
 */
function burndown(tasks, start, end, today) {
  const usePoints = tasks.some((t) => (t.points || 0) > 0);
  const weight = (t) => (usePoints ? (t.points || 0) : 1);
  const total = tasks.reduce((n, t) => n + weight(t), 0);
  const days = [];
  const span = Math.max(0, Math.round((dayOf(end) - dayOf(start)) / 86400000));
  for (let i = 0; i <= span; i++) {
    const date = isoDay(new Date(dayOf(start) + i * 86400000));
    const done = tasks.filter((t) => t.completedAt && String(t.completedAt).slice(0, 10) <= date).reduce((n, t) => n + weight(t), 0);
    days.push({ date, remaining: date <= today ? total - done : null, ideal: span === 0 ? 0 : Math.round(total * (1 - i / span) * 100) / 100 });
  }
  return { unit: usePoints ? 'points' : 'tasks', total, days };
}

function normaliseFieldValue(field, value) {
  if (value === null) return null;
  switch (field.type) {
    case 'text':
      if (typeof value !== 'string' || value.length > 500) throw new HttpError(400, `${field.name} must be text of at most 500 characters.`);
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new HttpError(400, `${field.name} must be a number.`);
      return value;
    case 'date':
      try { return v.date(value); } catch { throw new HttpError(400, `${field.name} must be a date (YYYY-MM-DD).`); }
    case 'checkbox':
      if (typeof value !== 'boolean') throw new HttpError(400, `${field.name} must be true or false.`);
      return value;
    case 'select':
      if (typeof value !== 'string' || !field.options.includes(value)) throw new HttpError(400, `${field.name} must be one of: ${field.options.join(', ')}.`);
      return value;
    default:
      throw new HttpError(400, 'Unknown field type.');
  }
}

async function sprintAccess(db, user, sprintId, min = 'member') {
  const { rows } = await db.query(
    `SELECT s.*, p.workspace_id, p.key AS project_key, p.archived AS project_archived, m.role FROM sprints s JOIN projects p ON p.id = s.project_id
       LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE s.id = $1`,
    [sprintId, user.id],
  );
  const s = rows[0];
  if (!s || !s.role) throw new HttpError(404, 'Not found.', 'not_found');
  const rank = { viewer: 1, member: 2, admin: 3, owner: 4 };
  if (rank[s.role] < rank[min]) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
  if (s.project_archived) throw new HttpError(409, 'This project is archived. Restore it to make changes.', 'archived');
  return s;
}

const SPRINT_SELECT = `
  s.id, s.project_id AS "projectId", s.name, s.goal, s.start_date AS "startDate", s.end_date AS "endDate", s.state, s.summary,
  s.created_at AS "createdAt", s.completed_at AS "completedAt",
  (SELECT count(*) FROM tasks t WHERE t.sprint_id = s.id AND t.parent_id IS NULL)::int AS "taskCount",
  (SELECT count(*) FROM tasks t JOIN statuses st ON st.id = t.status_id WHERE t.sprint_id = s.id AND t.parent_id IS NULL AND st.category = 'done')::int AS "doneCount",
  COALESCE((SELECT sum(t.points) FROM tasks t WHERE t.sprint_id = s.id AND t.parent_id IS NULL), 0)::int AS points,
  COALESCE((SELECT sum(t.points) FROM tasks t JOIN statuses st ON st.id = t.status_id WHERE t.sprint_id = s.id AND t.parent_id IS NULL AND st.category = 'done'), 0)::int AS "donePoints"`;

module.exports = function agileRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  /* ---------- sprints ---------- */
  router.get('/projects/:pid/sprints', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'viewer');
    const { rows } = await pool.query(
      `SELECT ${SPRINT_SELECT} FROM sprints s WHERE s.project_id = $1
        ORDER BY CASE s.state WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, s.start_date NULLS LAST, s.created_at DESC`,
      [project.id],
    );
    res.json({ sprints: rows });
  }));

  const sprintSpec = { name: v.str(1, 80), goal: v.text(500), startDate: v.nullable(v.date), endDate: v.nullable(v.date) };

  router.post('/projects/:pid/sprints', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'member');
    if (project.archived) throw new HttpError(409, 'This project is archived. Restore it to make changes.', 'archived');
    const body = validate(req.body, sprintSpec, { required: ['name'] });
    if (body.startDate && body.endDate && body.startDate > body.endDate) throw new HttpError(400, 'The sprint cannot end before it starts.');
    const sprint = await tx(pool, async (c) => {
      const { rows } = await c.query(
        'INSERT INTO sprints (project_id, name, goal, start_date, end_date) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [project.id, body.name, body.goal || '', body.startDate || null, body.endDate || null],
      );
      await logActivity(c, { workspaceId: project.workspace_id, projectId: project.id, actorId: req.user.id, action: 'sprint.created', detail: { name: body.name } });
      await touch(c, project.workspace_id);
      const { rows: out } = await c.query(`SELECT ${SPRINT_SELECT} FROM sprints s WHERE s.id = $1`, [rows[0].id]);
      return out[0];
    });
    res.status(201).json({ sprint });
  }));

  router.patch('/sprints/:sid', wrap(async (req, res) => {
    const s = await sprintAccess(pool, req.user, req.params.sid, 'member');
    if (s.state === 'completed') throw new HttpError(409, 'A completed sprint cannot be edited.', 'completed');
    const body = validate(req.body, sprintSpec);
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    const start = 'startDate' in body ? body.startDate : s.start_date;
    const end = 'endDate' in body ? body.endDate : s.end_date;
    if (start && end && start > end) throw new HttpError(400, 'The sprint cannot end before it starts.');
    const cols = { name: 'name', goal: 'goal', startDate: 'start_date', endDate: 'end_date' };
    const keys = Object.keys(body);
    await tx(pool, async (c) => {
      await c.query(`UPDATE sprints SET ${keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(', ')} WHERE id = $1`, [s.id, ...keys.map((k) => body[k])]);
      await touch(c, s.workspace_id);
    });
    const { rows } = await pool.query(`SELECT ${SPRINT_SELECT} FROM sprints s WHERE s.id = $1`, [s.id]);
    res.json({ sprint: rows[0] });
  }));

  router.post('/sprints/:sid/start', wrap(async (req, res) => {
    const s = await sprintAccess(pool, req.user, req.params.sid, 'member');
    if (s.state !== 'planned') throw new HttpError(409, 'Only a planned sprint can be started.', 'state');
    await tx(pool, async (c) => {
      const today = isoDay(new Date());
      const start = s.start_date || today;
      const end = s.end_date || isoDay(new Date(dayOf(start) + 14 * 86400000));
      await c.query("UPDATE sprints SET state = 'active', start_date = $2, end_date = $3 WHERE id = $1", [s.id, start, end]).catch((e) => {
        if (e.code === '23505') throw new HttpError(409, 'Another sprint is already running. Complete it first.', 'already_active');
        throw e;
      });
      await logActivity(c, { workspaceId: s.workspace_id, projectId: s.project_id, actorId: req.user.id, action: 'sprint.started', detail: { name: s.name } });
      await touch(c, s.workspace_id);
    });
    const { rows } = await pool.query(`SELECT ${SPRINT_SELECT} FROM sprints s WHERE s.id = $1`, [s.id]);
    res.json({ sprint: rows[0] });
  }));

  /* Completing keeps a snapshot, then moves unfinished work to the backlog or to another planned sprint. */
  router.post('/sprints/:sid/complete', wrap(async (req, res) => {
    const s = await sprintAccess(pool, req.user, req.params.sid, 'member');
    if (s.state !== 'active') throw new HttpError(409, 'Only the running sprint can be completed.', 'state');
    const body = validate(req.body || {}, { moveTo: v.nullable(v.uuid) });
    const moved = await tx(pool, async (c) => {
      let target = null;
      if (body.moveTo) {
        const { rows } = await c.query("SELECT id, name FROM sprints WHERE id = $1 AND project_id = $2 AND state = 'planned'", [body.moveTo, s.project_id]);
        if (!rows[0]) throw new HttpError(400, 'Unfinished tasks can only move to a planned sprint of this project.');
        target = rows[0];
      }
      const { rows: tasks } = await c.query(
        `SELECT t.id, t.points, t.completed_at AS "completedAt", st.category FROM tasks t JOIN statuses st ON st.id = t.status_id WHERE t.sprint_id = $1 AND t.parent_id IS NULL`,
        [s.id],
      );
      const today = isoDay(new Date());
      const series = burndown(tasks.map((t) => ({ points: t.points, completedAt: t.completedAt && new Date(t.completedAt).toISOString() })), s.start_date, s.end_date > today ? today : s.end_date, today);
      const open = tasks.filter((t) => t.category !== 'done');
      const done = tasks.filter((t) => t.category === 'done');
      const pts = (list) => list.reduce((n, t) => n + (t.points || 0), 0);
      const summary = {
        committed: { tasks: tasks.length, points: pts(tasks) }, completed: { tasks: done.length, points: pts(done) },
        moved: open.length, movedTo: target ? target.name : 'Backlog', burndown: series,
      };
      if (open.length) await c.query('UPDATE tasks SET sprint_id = $2, updated_at = now() WHERE id = ANY($1::uuid[])', [open.map((t) => t.id), target ? target.id : null]);
      await c.query("UPDATE sprints SET state = 'completed', completed_at = now(), summary = $2 WHERE id = $1", [s.id, JSON.stringify(summary)]);
      await logActivity(c, { workspaceId: s.workspace_id, projectId: s.project_id, actorId: req.user.id, action: 'sprint.completed', detail: { name: s.name, done: done.length, moved: open.length } });
      await touch(c, s.workspace_id);
      return open.length;
    });
    const { rows } = await pool.query(`SELECT ${SPRINT_SELECT} FROM sprints s WHERE s.id = $1`, [s.id]);
    res.json({ sprint: rows[0], moved });
  }));

  router.delete('/sprints/:sid', wrap(async (req, res) => {
    const s = await sprintAccess(pool, req.user, req.params.sid, 'member');
    if (s.state === 'active') throw new HttpError(409, 'Complete the running sprint instead of deleting it.', 'state');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM sprints WHERE id = $1', [s.id]); // its tasks fall back to the backlog
      await logActivity(c, { workspaceId: s.workspace_id, projectId: s.project_id, actorId: req.user.id, action: 'sprint.deleted', detail: { name: s.name } });
      await touch(c, s.workspace_id);
    });
    res.json({ ok: true });
  }));

  router.get('/sprints/:sid/burndown', wrap(async (req, res) => {
    const { rows: head } = await pool.query(
      `SELECT s.*, m.role FROM sprints s JOIN projects p ON p.id = s.project_id LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE s.id = $1`,
      [req.params.sid, req.user.id],
    );
    const s = head[0];
    if (!s || !s.role) throw new HttpError(404, 'Not found.', 'not_found');
    if (s.state === 'completed' && s.summary && s.summary.burndown) return res.json(s.summary.burndown);
    if (!s.start_date || !s.end_date) return res.json({ unit: 'tasks', total: 0, days: [] });
    const { rows } = await pool.query(
      'SELECT points, completed_at AS "completedAt" FROM tasks WHERE sprint_id = $1 AND parent_id IS NULL', [s.id],
    );
    res.json(burndown(rows.map((t) => ({ points: t.points, completedAt: t.completedAt && new Date(t.completedAt).toISOString() })), s.start_date, s.end_date, isoDay(new Date())));
  }));

  /* ---------- custom fields ---------- */
  const fieldSpec = {
    name: v.str(1, 40),
    options: (x) => {
      if (!Array.isArray(x) || x.length > 30) throw new Error('must be a list of at most 30 choices');
      const clean = x.map((o) => { if (typeof o !== 'string' || !o.trim() || o.length > 40) throw new Error('choices must be short text'); return o.trim(); });
      if (new Set(clean.map((o) => o.toLowerCase())).size !== clean.length) throw new Error('choices must be different from each other');
      return clean;
    },
  };

  router.post('/projects/:pid/fields', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'admin');
    const body = validate(req.body, { ...fieldSpec, type: v.oneOf(['text', 'number', 'date', 'select', 'checkbox']) }, { required: ['name', 'type'] });
    if (body.type === 'select' && !(body.options && body.options.length)) throw new HttpError(400, 'A choice field needs at least one choice.');
    const field = await tx(pool, async (c) => {
      const { rows: pos } = await c.query('SELECT COALESCE(max(position), -1) + 1 AS p FROM custom_fields WHERE project_id = $1', [project.id]);
      const { rows } = await c.query(
        'INSERT INTO custom_fields (project_id, name, type, options, position) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, type, options, position',
        [project.id, body.name, body.type, JSON.stringify(body.type === 'select' ? body.options : []), pos[0].p],
      ).catch((e) => { if (e.code === '23505') throw new HttpError(409, 'A field with that name already exists.', 'conflict'); throw e; });
      await touch(c, project.workspace_id);
      return rows[0];
    });
    res.status(201).json({ field });
  }));

  async function fieldAccess(db, user, fieldId) {
    const { rows } = await db.query(
      `SELECT f.*, p.workspace_id, m.role FROM custom_fields f JOIN projects p ON p.id = f.project_id LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE f.id = $1`,
      [fieldId, user.id],
    );
    const f = rows[0];
    if (!f || !f.role) throw new HttpError(404, 'Not found.', 'not_found');
    if (f.role !== 'admin' && f.role !== 'owner') throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
    return f;
  }

  router.patch('/fields/:fid', wrap(async (req, res) => {
    const f = await fieldAccess(pool, req.user, req.params.fid);
    const body = validate(req.body, fieldSpec);
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    if ('options' in body && f.type !== 'select') throw new HttpError(400, 'Only choice fields have choices.');
    await tx(pool, async (c) => {
      if (body.options) {
        // Values that point at a removed choice are cleared, so nothing stays invalid.
        await c.query('DELETE FROM task_field_values WHERE field_id = $1 AND NOT (value #>> \'{}\' = ANY($2::text[]))', [f.id, body.options]);
      }
      const sets = [];
      const vals = [f.id];
      if (body.name) { vals.push(body.name); sets.push(`name = $${vals.length}`); }
      if (body.options) { vals.push(JSON.stringify(body.options)); sets.push(`options = $${vals.length}`); }
      await c.query(`UPDATE custom_fields SET ${sets.join(', ')} WHERE id = $1`, vals)
        .catch((e) => { if (e.code === '23505') throw new HttpError(409, 'A field with that name already exists.', 'conflict'); throw e; });
      await touch(c, f.workspace_id);
    });
    res.json({ ok: true });
  }));

  router.delete('/fields/:fid', wrap(async (req, res) => {
    const f = await fieldAccess(pool, req.user, req.params.fid);
    await tx(pool, async (c) => {
      await c.query('DELETE FROM custom_fields WHERE id = $1', [f.id]);
      await touch(c, f.workspace_id);
    });
    res.json({ ok: true });
  }));

  return router;
};

module.exports.burndown = burndown;
module.exports.normaliseFieldValue = normaliseFieldValue;
