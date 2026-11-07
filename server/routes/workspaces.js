'use strict';
const express = require('express');
const { HttpError, wrap, v, validate, slugify, ROLE_RANK } = require('../util');
const { tx, touch } = require('../db');
const { requireAuth, requireRole, sha256, newToken } = require('../auth');
const { logActivity, notify } = require('../services');

const INVITE_DAYS = 14;

async function uniqueSlug(c, name) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const { rows } = await c.query('SELECT 1 FROM workspaces WHERE slug = $1', [slug]);
    if (!rows.length) return slug;
    slug = `${base}-${i}`;
  }
}

async function ownerCount(c, workspaceId) {
  const { rows } = await c.query("SELECT count(*)::int AS n FROM members WHERE workspace_id = $1 AND role = 'owner'", [workspaceId]);
  return rows[0].n;
}

module.exports = function workspaceRoutes(pool) {
  const router = express.Router();
  router.use(requireAuth);

  /* Resolve :wid (id or slug) to a workspace the caller belongs to. */
  router.param('wid', (req, res, next, wid) => {
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wid);
    pool.query(
      `SELECT w.id, w.name, w.slug, w.rev, m.role FROM workspaces w JOIN members m ON m.workspace_id = w.id AND m.user_id = $1
        WHERE ${isId ? 'w.id = $2::uuid' : 'w.slug = $2'}`,
      [req.user.id, wid],
    ).then(({ rows }) => {
      if (!rows[0]) return next(new HttpError(404, 'Workspace not found.', 'not_found'));
      req.workspace = rows[0];
      next();
    }).catch(next);
  });
  const need = (min) => (req, res, next) => {
    if (ROLE_RANK[req.workspace.role] < ROLE_RANK[min]) return next(new HttpError(403, 'You do not have permission to do that.', 'forbidden'));
    next();
  };

  router.post('/workspaces', wrap(async (req, res) => {
    const body = validate(req.body, { name: v.str(1, 80) }, { required: ['name'] });
    const ws = await tx(pool, async (c) => {
      const { rows } = await c.query('INSERT INTO workspaces (name, slug, created_by) VALUES ($1,$2,$3) RETURNING id, name, slug', [body.name, await uniqueSlug(c, body.name), req.user.id]);
      await c.query("INSERT INTO members (workspace_id, user_id, role) VALUES ($1,$2,'owner')", [rows[0].id, req.user.id]);
      await logActivity(c, { workspaceId: rows[0].id, actorId: req.user.id, action: 'workspace.created', detail: { name: body.name } });
      return rows[0];
    });
    res.status(201).json({ workspace: { ...ws, role: 'owner' } });
  }));

  router.get('/workspaces/:wid', wrap(async (req, res) => {
    const w = req.workspace;
    res.json({ workspace: { id: w.id, name: w.name, slug: w.slug, role: w.role, rev: Number(w.rev) } });
  }));

  router.patch('/workspaces/:wid', need('admin'), wrap(async (req, res) => {
    const body = validate(req.body, { name: v.str(1, 80) }, { required: ['name'] });
    await tx(pool, async (c) => {
      await c.query('UPDATE workspaces SET name = $2 WHERE id = $1', [req.workspace.id, body.name]);
      await touch(c, req.workspace.id);
    });
    res.json({ ok: true });
  }));

  router.delete('/workspaces/:wid', need('owner'), wrap(async (req, res) => {
    const body = validate(req.body || {}, { confirmName: v.str(1, 80) });
    if (body.confirmName !== req.workspace.name) throw new HttpError(400, 'Type the workspace name exactly to confirm deletion.');
    await pool.query('DELETE FROM workspaces WHERE id = $1', [req.workspace.id]);
    res.json({ ok: true });
  }));

  /* Lightweight poll target: clients refetch when this number changes. */
  router.get('/workspaces/:wid/rev', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT rev FROM workspaces WHERE id = $1', [req.workspace.id]);
    const { rows: n } = await pool.query('SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL', [req.user.id, req.workspace.id]);
    res.json({ rev: Number(rows[0].rev), unread: n[0].unread });
  }));

  /* ---------- members ---------- */
  router.get('/workspaces/:wid/members', wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.color, u.is_placeholder AS "isPlaceholder", m.role, m.joined_at AS "joinedAt"
         FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 ORDER BY lower(u.name)`,
      [req.workspace.id],
    );
    // Only admins see email addresses.
    const showEmail = ROLE_RANK[req.workspace.role] >= ROLE_RANK.admin;
    res.json({ members: rows.map((m) => ({ ...m, email: showEmail || m.id === req.user.id ? m.email : null })) });
  }));

  router.patch('/workspaces/:wid/members/:uid', need('admin'), wrap(async (req, res) => {
    const body = validate(req.body, { role: v.oneOf(['owner', 'admin', 'member', 'viewer']) }, { required: ['role'] });
    const targetId = req.params.uid;
    await tx(pool, async (c) => {
      const { rows } = await c.query('SELECT role FROM members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE', [req.workspace.id, targetId]);
      if (!rows[0]) throw new HttpError(404, 'Member not found.', 'not_found');
      const current = rows[0].role;
      if ((body.role === 'owner' || current === 'owner') && req.workspace.role !== 'owner') throw new HttpError(403, 'Only an owner can change owner roles.', 'forbidden');
      if (current === 'owner' && body.role !== 'owner' && (await ownerCount(c, req.workspace.id)) <= 1) {
        throw new HttpError(400, 'A workspace needs at least one owner. Make someone else an owner first.', 'last_owner');
      }
      await c.query('UPDATE members SET role = $3 WHERE workspace_id = $1 AND user_id = $2', [req.workspace.id, targetId, body.role]);
      const { rows: u } = await c.query('SELECT name FROM users WHERE id = $1', [targetId]);
      await logActivity(c, { workspaceId: req.workspace.id, actorId: req.user.id, action: 'member.role', detail: { name: u[0].name, from: current, to: body.role } });
      await touch(c, req.workspace.id);
    });
    res.json({ ok: true });
  }));

  router.delete('/workspaces/:wid/members/:uid', wrap(async (req, res) => {
    const targetId = req.params.uid;
    const self = targetId === req.user.id;
    if (!self && ROLE_RANK[req.workspace.role] < ROLE_RANK.admin) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
    await tx(pool, async (c) => {
      const { rows } = await c.query('SELECT role FROM members WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE', [req.workspace.id, targetId]);
      if (!rows[0]) throw new HttpError(404, 'Member not found.', 'not_found');
      if (rows[0].role === 'owner') {
        if (!self && req.workspace.role !== 'owner') throw new HttpError(403, 'Only an owner can remove an owner.', 'forbidden');
        if ((await ownerCount(c, req.workspace.id)) <= 1) throw new HttpError(400, 'A workspace needs at least one owner.', 'last_owner');
      }
      // Their work stays; it just becomes unassigned.
      await c.query(
        `UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $2
           AND project_id IN (SELECT id FROM projects WHERE workspace_id = $1)`,
        [req.workspace.id, targetId],
      );
      await c.query(
        `DELETE FROM task_watchers WHERE user_id = $2
           AND task_id IN (SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.workspace_id = $1)`,
        [req.workspace.id, targetId],
      );
      await c.query('DELETE FROM members WHERE workspace_id = $1 AND user_id = $2', [req.workspace.id, targetId]);
      const { rows: u } = await c.query('SELECT name FROM users WHERE id = $1', [targetId]);
      await logActivity(c, { workspaceId: req.workspace.id, actorId: req.user.id, action: self ? 'member.left' : 'member.removed', detail: { name: u[0] && u[0].name } });
      await touch(c, req.workspace.id);
    });
    res.json({ ok: true });
  }));

  /* ---------- invites ---------- */
  router.get('/workspaces/:wid/invites', need('admin'), wrap(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT i.id, i.email, i.role, i.created_at AS "createdAt", i.expires_at AS "expiresAt", i.placeholder_user_id AS "placeholderUserId", u.name AS "invitedByName"
         FROM invites i LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.workspace_id = $1 AND i.accepted_at IS NULL AND i.expires_at > now() ORDER BY i.created_at DESC`,
      [req.workspace.id],
    );
    res.json({ invites: rows });
  }));

  router.post('/workspaces/:wid/invites', need('admin'), wrap(async (req, res) => {
    const body = validate(req.body, { email: v.email, role: v.oneOf(['admin', 'member', 'viewer']), placeholderUserId: v.nullable(v.uuid) }, { required: ['email'] });
    const role = body.role || 'member';
    const token = newToken();
    const out = await tx(pool, async (c) => {
      const { rows: existing } = await c.query(
        `SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND lower(u.email) = $2`,
        [req.workspace.id, body.email],
      );
      if (existing.length) throw new HttpError(409, 'That person is already a member of this workspace.', 'already_member');
      if (body.placeholderUserId) {
        const { rows } = await c.query(
          `SELECT 1 FROM users u JOIN members m ON m.user_id = u.id AND m.workspace_id = $2 WHERE u.id = $1 AND u.is_placeholder`,
          [body.placeholderUserId, req.workspace.id],
        );
        if (!rows.length) throw new HttpError(400, 'That placeholder member does not exist.');
      }
      await c.query('DELETE FROM invites WHERE workspace_id = $1 AND lower(email) = $2 AND accepted_at IS NULL', [req.workspace.id, body.email]);
      const { rows } = await c.query(
        `INSERT INTO invites (workspace_id, email, role, token_hash, placeholder_user_id, invited_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval) RETURNING id, email, role, expires_at AS "expiresAt"`,
        [req.workspace.id, body.email, role, sha256(token), body.placeholderUserId || null, req.user.id, String(INVITE_DAYS)],
      );
      // If the person already has an account, tell them in-app too.
      const { rows: known } = await c.query('SELECT id FROM users WHERE lower(email) = $1 AND password_hash IS NOT NULL', [body.email]);
      await notify(c, { userIds: known.map((k) => k.id), workspaceId: req.workspace.id, actorId: req.user.id, type: 'invite', body: `${req.user.name} invited you to ${req.workspace.name}` });
      await logActivity(c, { workspaceId: req.workspace.id, actorId: req.user.id, action: 'member.invited', detail: { email: body.email, role } });
      return rows[0];
    });
    // The raw token is shown once; only its hash is stored.
    res.status(201).json({ invite: out, token, path: `/invite/${token}` });
  }));

  router.delete('/workspaces/:wid/invites/:id', need('admin'), wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM invites WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL', [req.params.id, req.workspace.id]);
    if (!rowCount) throw new HttpError(404, 'Invitation not found.', 'not_found');
    res.json({ ok: true });
  }));

  /* ---------- workspace-wide reads ---------- */
  router.get('/workspaces/:wid/activity', wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const { rows } = await pool.query(
      `SELECT a.id, a.action, a.detail, a.created_at AS "createdAt", a.task_id AS "taskId", a.project_id AS "projectId",
              u.id AS "actorId", u.name AS "actorName", u.color AS "actorColor", p.key AS "projectKey", t.number AS "taskNumber", t.title AS "taskTitle"
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN projects p ON p.id = a.project_id LEFT JOIN tasks t ON t.id = a.task_id
        WHERE a.workspace_id = $1 ORDER BY a.id DESC LIMIT $2`,
      [req.workspace.id, limit],
    );
    res.json({ activity: rows });
  }));

  /* Dashboard numbers, computed in SQL so large workspaces stay fast. */
  router.get('/workspaces/:wid/overview', wrap(async (req, res) => {
    const wid = req.workspace.id;
    const { rows: projects } = await pool.query(
      `SELECT p.id, p.key, p.name, p.color, p.archived,
              count(t.id) FILTER (WHERE t.parent_id IS NULL)::int AS total,
              count(t.id) FILTER (WHERE t.parent_id IS NULL AND s.category = 'done')::int AS done,
              count(t.id) FILTER (WHERE t.parent_id IS NULL AND s.category = 'active')::int AS active,
              count(t.id) FILTER (WHERE t.parent_id IS NULL AND s.category <> 'done' AND t.due_date < current_date)::int AS overdue
         FROM projects p LEFT JOIN tasks t ON t.project_id = p.id LEFT JOIN statuses s ON s.id = t.status_id
        WHERE p.workspace_id = $1 GROUP BY p.id ORDER BY p.archived, lower(p.name)`,
      [wid],
    );
    const { rows: mine } = await pool.query(
      `SELECT count(*) FILTER (WHERE s.category <> 'done')::int AS open,
              count(*) FILTER (WHERE s.category <> 'done' AND t.due_date < current_date)::int AS overdue,
              count(*) FILTER (WHERE s.category <> 'done' AND t.due_date = current_date)::int AS "dueToday",
              count(*) FILTER (WHERE s.category = 'done' AND t.completed_at > now() - interval '7 days')::int AS "doneThisWeek"
         FROM tasks t JOIN statuses s ON s.id = t.status_id JOIN projects p ON p.id = t.project_id
        WHERE p.workspace_id = $1 AND p.archived = false AND t.assignee_id = $2`,
      [wid, req.user.id],
    );
    const { rows: workload } = await pool.query(
      `SELECT u.id, u.name, u.color, count(t.id)::int AS open
         FROM members m JOIN users u ON u.id = m.user_id
         LEFT JOIN tasks t ON t.assignee_id = u.id AND t.parent_id IS NULL
              AND t.project_id IN (SELECT id FROM projects WHERE workspace_id = $1 AND archived = false)
              AND t.status_id IN (SELECT id FROM statuses WHERE category <> 'done')
        WHERE m.workspace_id = $1 GROUP BY u.id ORDER BY open DESC, lower(u.name) LIMIT 12`,
      [wid],
    );
    res.json({ projects, mine: mine[0], workload });
  }));

  /* Command-palette search across every project in the workspace. */
  router.get('/workspaces/:wid/search', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ tasks: [] });
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const { rows } = await pool.query(
      `SELECT t.id, t.number, t.title, p.key AS "projectKey", p.id AS "projectId", s.name AS "statusName", s.category
         FROM tasks t JOIN projects p ON p.id = t.project_id JOIN statuses s ON s.id = t.status_id
        WHERE p.workspace_id = $1 AND p.archived = false
          AND (t.title ILIKE $2 OR t.description ILIKE $2 OR (p.key || '-' || t.number) ILIKE $3)
        ORDER BY (s.category = 'done'), t.updated_at DESC LIMIT 20`,
      [req.workspace.id, like, q],
    );
    res.json({ tasks: rows });
  }));

  return router;
};
