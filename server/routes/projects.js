'use strict';
const express = require('express');
const { HttpError, wrap, v, validate } = require('../util');
const { tx, touch } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { projectAccess, statusAccess, labelAccess, isMember } = require('../access');
const { createStatuses, logActivity } = require('../services');

const PALETTE = ['#65a30d', '#2563eb', '#d97706', '#7c3aed', '#0d9488', '#e11d48', '#475569', '#0891b2'];

function keyFromName(name) {
  const letters = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean);
  let key = letters.length > 1 ? letters.map((w) => w[0]).join('') : (letters[0] || 'PRJ').slice(0, 4);
  key = key.replace(/^[0-9]+/, '').slice(0, 6);
  return key.length >= 2 ? key : (key + 'PRJ').slice(0, 3);
}

async function loadProjectBundle(db, projectId) {
  const { rows: statuses } = await db.query('SELECT id, name, category, color, position FROM statuses WHERE project_id = $1 ORDER BY position, name', [projectId]);
  const { rows: labels } = await db.query('SELECT id, name, color FROM labels WHERE project_id = $1 ORDER BY lower(name)', [projectId]);
  return { statuses, labels };
}

const projectJson = (p) => ({
  id: p.id, workspaceId: p.workspace_id, key: p.key, name: p.name, description: p.description,
  color: p.color, leadId: p.lead_id, archived: p.archived, createdAt: p.created_at,
});

/* A project always needs somewhere for finished work and somewhere for open work. */
async function assertStatusMix(c, projectId) {
  const { rows } = await c.query(
    "SELECT count(*) FILTER (WHERE category = 'done')::int AS done, count(*) FILTER (WHERE category <> 'done')::int AS open FROM statuses WHERE project_id = $1",
    [projectId],
  );
  if (rows[0].done < 1 || rows[0].open < 1) {
    throw new HttpError(400, 'A project needs at least one open status and one done status.', 'status_mix');
  }
}

module.exports = function projectRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/workspaces/:wid/projects', wrap(async (req, res) => {
    await requireRole(pool, req.user, req.params.wid, 'viewer');
    const { rows } = await pool.query(
      `SELECT p.*, count(t.id) FILTER (WHERE t.parent_id IS NULL)::int AS task_count
         FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.workspace_id = $1 GROUP BY p.id ORDER BY p.archived, lower(p.name)`,
      [req.params.wid],
    );
    res.json({ projects: rows.map((p) => ({ ...projectJson(p), taskCount: p.task_count })) });
  }));

  router.post('/workspaces/:wid/projects', wrap(async (req, res) => {
    await requireRole(pool, req.user, req.params.wid, 'member');
    const body = validate(req.body, {
      name: v.str(1, 80), key: (x) => v.str(2, 8)(x).toUpperCase(), description: v.text(2000),
      color: v.color, leadId: v.nullable(v.uuid),
    }, { required: ['name'] });
    const key = body.key || keyFromName(body.name);
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(key)) throw new HttpError(400, 'key must be 2–8 letters or numbers and start with a letter.', 'invalid');
    const project = await tx(pool, async (c) => {
      if (body.leadId && !(await isMember(c, req.params.wid, body.leadId))) throw new HttpError(400, 'The project lead must be a workspace member.');
      const { rows: count } = await c.query('SELECT count(*)::int AS n FROM projects WHERE workspace_id = $1', [req.params.wid]);
      const { rows } = await c.query(
        `INSERT INTO projects (workspace_id, key, name, description, color, lead_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.wid, key, body.name, body.description || '', body.color || PALETTE[count[0].n % PALETTE.length], body.leadId || null, req.user.id],
      ).catch((e) => {
        if (e.code === '23505') throw new HttpError(409, `The key ${key} is already used by another project.`, 'key_taken');
        throw e;
      });
      await createStatuses(c, rows[0].id);
      await logActivity(c, { workspaceId: req.params.wid, projectId: rows[0].id, actorId: req.user.id, action: 'project.created', detail: { name: body.name } });
      await touch(c, req.params.wid);
      return rows[0];
    });
    res.status(201).json({ project: projectJson(project), ...(await loadProjectBundle(pool, project.id)) });
  }));

  router.get('/projects/:pid', wrap(async (req, res) => {
    const { project, role } = await projectAccess(pool, req.user, req.params.pid, 'viewer');
    res.json({ project: projectJson(project), role, ...(await loadProjectBundle(pool, project.id)) });
  }));

  router.patch('/projects/:pid', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'admin');
    const body = validate(req.body, {
      name: v.str(1, 80), description: v.text(2000), color: v.color, leadId: v.nullable(v.uuid), archived: v.bool,
    });
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    await tx(pool, async (c) => {
      if (body.leadId && !(await isMember(c, project.workspace_id, body.leadId))) throw new HttpError(400, 'The project lead must be a workspace member.');
      const cols = { name: 'name', description: 'description', color: 'color', leadId: 'lead_id', archived: 'archived' };
      const keys = Object.keys(body);
      await c.query(`UPDATE projects SET ${keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(', ')} WHERE id = $1`, [project.id, ...keys.map((k) => body[k])]);
      const action = 'archived' in body && Object.keys(body).length === 1 ? (body.archived ? 'project.archived' : 'project.restored') : 'project.updated';
      await logActivity(c, { workspaceId: project.workspace_id, projectId: project.id, actorId: req.user.id, action, detail: { name: body.name || project.name } });
      await touch(c, project.workspace_id);
    });
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [project.id]);
    res.json({ project: projectJson(rows[0]) });
  }));

  router.delete('/projects/:pid', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'admin');
    const body = validate(req.body || {}, { confirmName: v.str(1, 80) });
    if (body.confirmName !== project.name) throw new HttpError(400, 'Type the project name exactly to confirm deletion.');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM projects WHERE id = $1', [project.id]);
      await logActivity(c, { workspaceId: project.workspace_id, actorId: req.user.id, action: 'project.deleted', detail: { name: project.name } });
      await touch(c, project.workspace_id);
    });
    res.json({ ok: true });
  }));

  /* ---------- statuses ---------- */
  const statusSpec = { name: v.str(1, 40), category: v.oneOf(['todo', 'active', 'done']), color: v.color };

  router.post('/projects/:pid/statuses', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'admin');
    const body = validate(req.body, statusSpec, { required: ['name', 'category'] });
    const status = await tx(pool, async (c) => {
      const { rows: pos } = await c.query('SELECT COALESCE(max(position), -1) + 1 AS p FROM statuses WHERE project_id = $1', [project.id]);
      const { rows } = await c.query(
        'INSERT INTO statuses (project_id, name, category, color, position) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, category, color, position',
        [project.id, body.name, body.category, body.color || '#94a3b8', pos[0].p],
      );
      await touch(c, project.workspace_id);
      return rows[0];
    });
    res.status(201).json({ status });
  }));

  router.post('/projects/:pid/statuses/reorder', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'admin');
    const body = validate(req.body, { ids: v.uuidList(50) }, { required: ['ids'] });
    await tx(pool, async (c) => {
      const { rows } = await c.query('SELECT id FROM statuses WHERE project_id = $1', [project.id]);
      const existing = new Set(rows.map((r) => r.id));
      if (body.ids.length !== existing.size || !body.ids.every((id) => existing.has(id))) throw new HttpError(400, 'ids must list every status of the project exactly once.');
      for (let i = 0; i < body.ids.length; i++) await c.query('UPDATE statuses SET position = $2 WHERE id = $1', [body.ids[i], i]);
      await touch(c, project.workspace_id);
    });
    res.json({ ok: true });
  }));

  router.patch('/statuses/:sid', wrap(async (req, res) => {
    const status = await statusAccess(pool, req.user, req.params.sid, 'admin');
    const body = validate(req.body, statusSpec);
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    await tx(pool, async (c) => {
      const keys = Object.keys(body);
      await c.query(`UPDATE statuses SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [status.id, ...keys.map((k) => body[k])]);
      await assertStatusMix(c, status.project_id);
      if (body.category && body.category !== status.category) {
        // Keep completion timestamps truthful when a status changes meaning.
        if (body.category === 'done') await c.query('UPDATE tasks SET completed_at = COALESCE(completed_at, now()) WHERE status_id = $1', [status.id]);
        else if (status.category === 'done') await c.query('UPDATE tasks SET completed_at = NULL WHERE status_id = $1', [status.id]);
      }
      await touch(c, status.workspace_id);
    });
    res.json({ ok: true });
  }));

  router.delete('/statuses/:sid', wrap(async (req, res) => {
    const status = await statusAccess(pool, req.user, req.params.sid, 'admin');
    const moveTo = req.query.moveTo;
    await tx(pool, async (c) => {
      const { rows: used } = await c.query('SELECT count(*)::int AS n FROM tasks WHERE status_id = $1', [status.id]);
      if (used[0].n > 0) {
        if (!moveTo) throw new HttpError(400, `${used[0].n} task(s) use this status. Choose a status to move them to.`, 'status_in_use');
        const { rows: target } = await c.query('SELECT id, category FROM statuses WHERE id = $1 AND project_id = $2 AND id <> $3', [moveTo, status.project_id, status.id]);
        if (!target[0]) throw new HttpError(400, 'The status to move tasks to is not valid.');
        await c.query(
          `UPDATE tasks SET status_id = $2, completed_at = CASE WHEN $3 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END WHERE status_id = $1`,
          [status.id, target[0].id, target[0].category],
        );
      }
      await c.query('DELETE FROM statuses WHERE id = $1', [status.id]);
      await assertStatusMix(c, status.project_id);
      await touch(c, status.workspace_id);
    });
    res.json({ ok: true });
  }));

  /* ---------- labels ---------- */
  router.post('/projects/:pid/labels', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'member');
    const body = validate(req.body, { name: v.str(1, 40), color: v.color }, { required: ['name'] });
    const label = await tx(pool, async (c) => {
      const { rows } = await c.query('INSERT INTO labels (project_id, name, color) VALUES ($1,$2,$3) RETURNING id, name, color', [project.id, body.name, body.color || '#64748b'])
        .catch((e) => { if (e.code === '23505') throw new HttpError(409, 'A label with that name already exists.', 'conflict'); throw e; });
      await touch(c, project.workspace_id);
      return rows[0];
    });
    res.status(201).json({ label });
  }));

  router.patch('/labels/:lid', wrap(async (req, res) => {
    const label = await labelAccess(pool, req.user, req.params.lid, 'admin');
    const body = validate(req.body, { name: v.str(1, 40), color: v.color });
    if (!Object.keys(body).length) throw new HttpError(400, 'Nothing to change.');
    await tx(pool, async (c) => {
      const keys = Object.keys(body);
      await c.query(`UPDATE labels SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [label.id, ...keys.map((k) => body[k])])
        .catch((e) => { if (e.code === '23505') throw new HttpError(409, 'A label with that name already exists.', 'conflict'); throw e; });
      await touch(c, label.workspace_id);
    });
    res.json({ ok: true });
  }));

  router.delete('/labels/:lid', wrap(async (req, res) => {
    const label = await labelAccess(pool, req.user, req.params.lid, 'admin');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM labels WHERE id = $1', [label.id]);
      await touch(c, label.workspace_id);
    });
    res.json({ ok: true });
  }));

  return router;
};
