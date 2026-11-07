'use strict';
/* Attachments (files stored in Postgres) and task relations (blocks / relates / duplicates). */
const express = require('express');
const { HttpError, wrap, v, validate, isUuid } = require('../util');
const { tx, touch } = require('../db');
const { requireAuth } = require('../auth');
const { taskAccess } = require('../access');
const { logActivity } = require('../services');

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PER_TASK = 25;
const workspaceLimit = () => (Number(process.env.ATTACHMENT_LIMIT_MB) || 500) * 1024 * 1024;
// Only these are ever rendered inline; everything else downloads. SVG is deliberately absent (it can carry script).
const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

function cleanName(raw) {
  const base = String(raw || 'file').split(/[\\/]/).pop();
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '_').trim().slice(0, 200);
  return cleaned || 'file';
}

function safeMime(raw) {
  const m = String(raw || '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) && m.length <= 100 ? m : 'application/octet-stream';
}

module.exports = function fileRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  /* Raw body upload: POST /tasks/:tid/attachments?name=report.pdf */
  router.post('/tasks/:tid/attachments', express.raw({ type: () => true, limit: MAX_BYTES }), wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'member');
    if (task.project_archived) throw new HttpError(409, 'This project is archived. Restore it to make changes.', 'archived');
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, 'Choose a file to upload.');
    const name = cleanName(req.query.name);
    const mime = safeMime(req.headers['content-type']);
    const attachment = await tx(pool, async (c) => {
      const { rows: count } = await c.query('SELECT count(*)::int AS n FROM attachments WHERE task_id = $1', [task.id]);
      if (count[0].n >= MAX_PER_TASK) throw new HttpError(400, `A task can have at most ${MAX_PER_TASK} attachments.`, 'too_many');
      const { rows: used } = await c.query(
        `SELECT COALESCE(sum(a.size), 0)::bigint AS bytes FROM attachments a JOIN tasks t ON t.id = a.task_id JOIN projects p ON p.id = t.project_id WHERE p.workspace_id = $1`,
        [task.workspace_id],
      );
      if (Number(used[0].bytes) + data.length > workspaceLimit()) throw new HttpError(413, 'This workspace has used all of its file storage.', 'quota');
      const { rows } = await c.query(
        'INSERT INTO attachments (task_id, filename, mime, size, data, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, filename AS name, mime, size, created_at AS "createdAt"',
        [task.id, name, mime, data.length, data, req.user.id],
      );
      await c.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [task.id]);
      await logActivity(c, { workspaceId: task.workspace_id, projectId: task.project_id, taskId: task.id, actorId: req.user.id, action: 'task.attachment', detail: { name } });
      await touch(c, task.workspace_id);
      return rows[0];
    });
    res.status(201).json({ attachment: { ...attachment, createdByName: req.user.name } });
  }));

  router.get('/attachments/:id', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.filename, a.mime, a.data, m.role FROM attachments a JOIN tasks t ON t.id = a.task_id JOIN projects p ON p.id = t.project_id
         LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE a.id = $1`,
      [req.params.id, req.user.id],
    );
    const file = rows[0];
    if (!file || !file.role) throw new HttpError(404, 'Not found.', 'not_found');
    const inline = req.query.inline === '1' && INLINE_TYPES.has(file.mime);
    res.setHeader('Content-Type', inline ? file.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${file.filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    // An attachment must never be able to run script in this origin.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Length', file.data.length);
    res.end(file.data);
  }));

  router.delete('/attachments/:id', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.filename, a.created_by, t.id AS task_id, t.project_id, p.workspace_id, m.role FROM attachments a JOIN tasks t ON t.id = a.task_id JOIN projects p ON p.id = t.project_id
         LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE a.id = $1`,
      [req.params.id, req.user.id],
    );
    const a = rows[0];
    if (!a || !a.role) throw new HttpError(404, 'Not found.', 'not_found');
    const isAdmin = a.role === 'admin' || a.role === 'owner';
    if (a.role === 'viewer' || (a.created_by !== req.user.id && !isAdmin)) throw new HttpError(403, 'You can only remove your own files.', 'forbidden');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM attachments WHERE id = $1', [a.id]);
      await logActivity(c, { workspaceId: a.workspace_id, projectId: a.project_id, taskId: a.task_id, actorId: req.user.id, action: 'task.attachment_removed', detail: { name: a.filename } });
      await touch(c, a.workspace_id);
    });
    res.json({ ok: true });
  }));

  /* ---------- relations ---------- */
  const TYPES = ['blocks', 'relates', 'duplicates'];

  router.post('/tasks/:tid/relations', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'member');
    const body = validate(req.body, { toTaskId: v.uuid, type: v.oneOf(TYPES) }, { required: ['toTaskId', 'type'] });
    if (body.toTaskId === task.id) throw new HttpError(400, 'A task cannot be related to itself.');
    const relation = await tx(pool, async (c) => {
      const { rows: target } = await c.query(
        'SELECT t.id, t.number, p.key FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1 AND p.workspace_id = $2',
        [body.toTaskId, task.workspace_id],
      );
      if (!target[0]) throw new HttpError(404, 'That task was not found in this workspace.', 'not_found');
      if (body.type === 'blocks') {
        // Reject a loop: if the target already (transitively) blocks this task, A blocks B blocks A would deadlock.
        const { rows: loop } = await c.query(
          `WITH RECURSIVE chain(id) AS (
             SELECT to_task FROM task_relations WHERE from_task = $1 AND type = 'blocks'
             UNION SELECT r.to_task FROM task_relations r JOIN chain c ON r.from_task = c.id WHERE r.type = 'blocks')
           SELECT 1 FROM chain WHERE id = $2 LIMIT 1`,
          [body.toTaskId, task.id],
        );
        if (loop.length) throw new HttpError(400, 'That would create a circular dependency.', 'cycle');
      }
      if (body.type === 'relates') {
        const { rows: rev } = await c.query("SELECT 1 FROM task_relations WHERE from_task = $1 AND to_task = $2 AND type = 'relates'", [body.toTaskId, task.id]);
        if (rev.length) throw new HttpError(409, 'Those tasks are already related.', 'conflict');
      }
      const { rows } = await c.query(
        'INSERT INTO task_relations (from_task, to_task, type, created_by) VALUES ($1,$2,$3,$4) RETURNING id',
        [task.id, body.toTaskId, body.type, req.user.id],
      ).catch((e) => { if (e.code === '23505') throw new HttpError(409, 'That relationship already exists.', 'conflict'); throw e; });
      await logActivity(c, {
        workspaceId: task.workspace_id, projectId: task.project_id, taskId: task.id, actorId: req.user.id,
        action: 'task.relation', detail: { type: body.type, other: `${target[0].key}-${target[0].number}` },
      });
      await touch(c, task.workspace_id);
      return rows[0];
    });
    res.status(201).json({ id: relation.id });
  }));

  router.delete('/relations/:id', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT from_task FROM task_relations WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Not found.', 'not_found');
    const { task } = await taskAccess(pool, req.user, rows[0].from_task, 'member');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM task_relations WHERE id = $1', [req.params.id]);
      await touch(c, task.workspace_id);
    });
    res.json({ ok: true });
  }));

  return router;
};

module.exports.isUuid = isUuid;
