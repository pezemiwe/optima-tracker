'use strict';
const express = require('express');
const { HttpError, wrap, v, validate, ROLE_RANK } = require('../util');
const { tx, touch } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { projectAccess, taskAccess } = require('../access');
const { logActivity, notify, addWatcher } = require('../services');

async function commentAccess(db, user, commentId, min = 'viewer') {
  const { rows } = await db.query(
    `SELECT c.*, t.project_id, t.number, t.title AS task_title, p.workspace_id, p.key AS project_key, m.role
       FROM comments c JOIN tasks t ON t.id = c.task_id JOIN projects p ON p.id = t.project_id
       LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2
      WHERE c.id = $1`,
    [commentId, user.id],
  );
  const row = rows[0];
  if (!row || !row.role) throw new HttpError(404, 'Not found.', 'not_found');
  if (ROLE_RANK[row.role] < ROLE_RANK[min]) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
  return row;
}

const commentJson = async (db, id) => {
  const { rows } = await db.query(
    `SELECT c.id, c.body, c.created_at AS "createdAt", c.edited_at AS "editedAt", u.id AS "authorId", u.name AS "authorName", u.color AS "authorColor"
       FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1`,
    [id],
  );
  return rows[0];
};

module.exports = function collabRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  /* ---------- comments ---------- */
  router.post('/tasks/:tid/comments', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'member');
    if (task.project_archived) throw new HttpError(409, 'This project is archived. Restore it to make changes.', 'archived');
    const body = validate(req.body, { body: v.str(1, 10000), mentions: v.uuidList(20) }, { required: ['body'] });
    const id = await tx(pool, async (c) => {
      let mentions = body.mentions || [];
      if (mentions.length) {
        const { rows } = await c.query('SELECT user_id FROM members WHERE workspace_id = $1 AND user_id = ANY($2::uuid[])', [task.workspace_id, mentions]);
        mentions = rows.map((r) => r.user_id);
      }
      const { rows } = await c.query('INSERT INTO comments (task_id, author_id, body) VALUES ($1,$2,$3) RETURNING id', [task.id, req.user.id, body.body]);
      await c.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [task.id]);
      await addWatcher(c, task.id, req.user.id);
      const key = `${task.project_key}-${task.number}`;
      const snippet = body.body.replace(/\s+/g, ' ').slice(0, 140);
      await notify(c, { userIds: mentions, workspaceId: task.workspace_id, taskId: task.id, actorId: req.user.id, type: 'mentioned', body: `${req.user.name} mentioned you on ${key}: ${snippet}` });
      for (const id2 of mentions) await addWatcher(c, task.id, id2);
      const { rows: watchers } = await c.query('SELECT user_id FROM task_watchers WHERE task_id = $1', [task.id]);
      await notify(c, {
        userIds: watchers.map((w) => w.user_id).filter((u) => !mentions.includes(u)),
        workspaceId: task.workspace_id, taskId: task.id, actorId: req.user.id, type: 'comment', body: `${req.user.name} commented on ${key}: ${snippet}`,
      });
      await logActivity(c, { workspaceId: task.workspace_id, projectId: task.project_id, taskId: task.id, actorId: req.user.id, action: 'task.commented', detail: { snippet } });
      await touch(c, task.workspace_id);
      return rows[0].id;
    });
    res.status(201).json({ comment: await commentJson(pool, id) });
  }));

  router.patch('/comments/:cid', wrap(async (req, res) => {
    const comment = await commentAccess(pool, req.user, req.params.cid, 'member');
    if (comment.author_id !== req.user.id) throw new HttpError(403, 'You can only edit your own comments.', 'forbidden');
    const body = validate(req.body, { body: v.str(1, 10000) }, { required: ['body'] });
    await tx(pool, async (c) => {
      await c.query('UPDATE comments SET body = $2, edited_at = now() WHERE id = $1', [comment.id, body.body]);
      await touch(c, comment.workspace_id);
    });
    res.json({ comment: await commentJson(pool, comment.id) });
  }));

  router.delete('/comments/:cid', wrap(async (req, res) => {
    const comment = await commentAccess(pool, req.user, req.params.cid, 'member');
    if (comment.author_id !== req.user.id && ROLE_RANK[comment.role] < ROLE_RANK.admin) throw new HttpError(403, 'You can only delete your own comments.', 'forbidden');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM comments WHERE id = $1', [comment.id]);
      await touch(c, comment.workspace_id);
    });
    res.json({ ok: true });
  }));

  /* ---------- links (attachments by reference) ---------- */
  router.post('/tasks/:tid/links', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'member');
    const body = validate(req.body, { url: v.url, name: v.str(1, 120) }, { required: ['url'] });
    const name = body.name || new URL(body.url).hostname;
    const link = await tx(pool, async (c) => {
      const { rows } = await c.query('INSERT INTO links (task_id, name, url, created_by) VALUES ($1,$2,$3,$4) RETURNING id, name, url, created_at AS "createdAt"', [task.id, name, body.url, req.user.id]);
      await logActivity(c, { workspaceId: task.workspace_id, projectId: task.project_id, taskId: task.id, actorId: req.user.id, action: 'task.link', detail: { name } });
      await touch(c, task.workspace_id);
      return rows[0];
    });
    res.status(201).json({ link: { ...link, createdByName: req.user.name } });
  }));

  router.delete('/links/:lid', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT l.id, l.created_by, t.id AS task_id, p.workspace_id, m.role FROM links l JOIN tasks t ON t.id = l.task_id JOIN projects p ON p.id = t.project_id
         LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE l.id = $1`,
      [req.params.lid, req.user.id],
    );
    const link = rows[0];
    if (!link || !link.role) throw new HttpError(404, 'Not found.', 'not_found');
    if (ROLE_RANK[link.role] < ROLE_RANK.member) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
    await tx(pool, async (c) => {
      await c.query('DELETE FROM links WHERE id = $1', [link.id]);
      await touch(c, link.workspace_id);
    });
    res.json({ ok: true });
  }));

  /* ---------- watching ---------- */
  router.put('/tasks/:tid/watch', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'viewer');
    await addWatcher(pool, task.id, req.user.id);
    res.json({ watching: true });
  }));
  router.delete('/tasks/:tid/watch', wrap(async (req, res) => {
    const { task } = await taskAccess(pool, req.user, req.params.tid, 'viewer');
    await pool.query('DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2', [task.id, req.user.id]);
    res.json({ watching: false });
  }));

  /* ---------- project activity ---------- */
  router.get('/projects/:pid/activity', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'viewer');
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.detail, a.created_at AS "createdAt", a.task_id AS "taskId", u.id AS "actorId", u.name AS "actorName", u.color AS "actorColor",
              t.number AS "taskNumber", t.title AS "taskTitle"
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN tasks t ON t.id = a.task_id
        WHERE a.project_id = $1 ORDER BY a.id DESC LIMIT $2`,
      [project.id, limit],
    );
    res.json({ activity: rows, projectKey: project.key });
  }));

  /* ---------- notifications ---------- */
  router.get('/notifications', wrap(async (req, res) => {
    const workspaceId = req.query.workspaceId;
    await requireRole(pool, req.user, workspaceId, 'viewer');
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const { rows } = await pool.query(
      `SELECT n.id, n.type, n.body, n.created_at AS "createdAt", n.read_at AS "readAt", n.task_id AS "taskId",
              u.name AS "actorName", u.color AS "actorColor", t.number AS "taskNumber", p.key AS "projectKey", p.id AS "projectId"
         FROM notifications n LEFT JOIN users u ON u.id = n.actor_id LEFT JOIN tasks t ON t.id = n.task_id LEFT JOIN projects p ON p.id = t.project_id
        WHERE n.user_id = $1 AND n.workspace_id = $2 ${req.query.unread ? 'AND n.read_at IS NULL' : ''}
        ORDER BY n.id DESC LIMIT $3`,
      [req.user.id, workspaceId, limit],
    );
    const { rows: c } = await pool.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL', [req.user.id, workspaceId]);
    res.json({ notifications: rows, unread: c[0].n });
  }));

  router.post('/notifications/read', wrap(async (req, res) => {
    const body = validate(req.body, {
      workspaceId: v.uuid, all: v.bool,
      // bigint ids come back from Postgres as strings, so accept either form.
      ids: (x) => {
        if (!Array.isArray(x) || x.length > 200 || !x.every((i) => (Number.isInteger(i) && i > 0) || (typeof i === 'string' && /^\d{1,18}$/.test(i)))) throw new Error('must be a list of ids');
        return x.map(String);
      },
    }, { required: ['workspaceId'] });
    await requireRole(pool, req.user, body.workspaceId, 'viewer');
    if (body.all) {
      await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL', [req.user.id, body.workspaceId]);
    } else if (body.ids && body.ids.length) {
      await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL AND id = ANY($3::bigint[])', [req.user.id, body.workspaceId, body.ids]);
    } else {
      throw new HttpError(400, 'Nothing to mark as read.');
    }
    res.json({ ok: true });
  }));

  /* ---------- saved views ---------- */
  const configSpec = (x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('must be an object');
    if (JSON.stringify(x).length > 4000) throw new Error('is too large');
    return x;
  };

  router.get('/projects/:pid/views', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'viewer');
    const { rows } = await pool.query(
      `SELECT sv.id, sv.name, sv.view, sv.config, sv.shared, sv.user_id AS "userId", u.name AS "ownerName"
         FROM saved_views sv JOIN users u ON u.id = sv.user_id
        WHERE sv.project_id = $1 AND (sv.shared OR sv.user_id = $2) ORDER BY sv.shared DESC, lower(sv.name)`,
      [project.id, req.user.id],
    );
    res.json({ views: rows });
  }));

  router.post('/projects/:pid/views', wrap(async (req, res) => {
    const { project } = await projectAccess(pool, req.user, req.params.pid, 'member');
    const body = validate(req.body, { name: v.str(1, 60), view: v.oneOf(['list', 'board', 'calendar', 'daily']), config: configSpec, shared: v.bool }, { required: ['name', 'view'] });
    const { rows } = await pool.query(
      'INSERT INTO saved_views (workspace_id, project_id, user_id, name, view, config, shared) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, view, config, shared, user_id AS "userId"',
      [project.workspace_id, project.id, req.user.id, body.name, body.view, JSON.stringify(body.config || {}), Boolean(body.shared)],
    );
    res.status(201).json({ view: { ...rows[0], ownerName: req.user.name } });
  }));

  router.delete('/views/:id', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT sv.id, sv.user_id, m.role FROM saved_views sv LEFT JOIN members m ON m.workspace_id = sv.workspace_id AND m.user_id = $2 WHERE sv.id = $1`,
      [req.params.id, req.user.id],
    );
    const view = rows[0];
    if (!view || !view.role) throw new HttpError(404, 'Not found.', 'not_found');
    if (view.user_id !== req.user.id && ROLE_RANK[view.role] < ROLE_RANK.admin) throw new HttpError(403, 'You can only delete your own views.', 'forbidden');
    await pool.query('DELETE FROM saved_views WHERE id = $1', [view.id]);
    res.json({ ok: true });
  }));

  return router;
};
