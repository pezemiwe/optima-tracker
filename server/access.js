'use strict';
/* Resolve a resource to its workspace and enforce the caller's role. */
const { HttpError, ROLE_RANK } = require('./util');

function check(role, min) {
  // Same 404 for "does not exist" and "not yours" so ids cannot be probed.
  if (!role) throw new HttpError(404, 'Not found.', 'not_found');
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
}

async function projectAccess(db, user, projectId, min = 'viewer') {
  const { rows } = await db.query(
    `SELECT p.*, m.role FROM projects p LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE p.id = $1`,
    [projectId, user.id],
  );
  const project = rows[0];
  check(project && project.role, min);
  return { project, role: project.role };
}

async function taskAccess(db, user, taskId, min = 'viewer') {
  const { rows } = await db.query(
    `SELECT t.*, p.workspace_id, p.key AS project_key, p.archived AS project_archived, m.role
       FROM tasks t JOIN projects p ON p.id = t.project_id
       LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2
      WHERE t.id = $1`,
    [taskId, user.id],
  );
  const task = rows[0];
  check(task && task.role, min);
  return { task, role: task.role };
}

async function statusAccess(db, user, statusId, min = 'viewer') {
  const { rows } = await db.query(
    `SELECT s.*, p.workspace_id, m.role FROM statuses s JOIN projects p ON p.id = s.project_id
       LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE s.id = $1`,
    [statusId, user.id],
  );
  check(rows[0] && rows[0].role, min);
  return rows[0];
}

async function labelAccess(db, user, labelId, min = 'viewer') {
  const { rows } = await db.query(
    `SELECT l.*, p.workspace_id, m.role FROM labels l JOIN projects p ON p.id = l.project_id
       LEFT JOIN members m ON m.workspace_id = p.workspace_id AND m.user_id = $2 WHERE l.id = $1`,
    [labelId, user.id],
  );
  check(rows[0] && rows[0].role, min);
  return rows[0];
}

async function isMember(db, workspaceId, userId) {
  const { rows } = await db.query('SELECT 1 FROM members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  return rows.length > 0;
}

module.exports = { projectAccess, taskAccess, statusAccess, labelAccess, isMember };
