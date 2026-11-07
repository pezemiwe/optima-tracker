'use strict';
/* Cross-route helpers: activity log, notifications, default project data. */

const USER_COLORS = ['#4a7a0a', '#2563eb', '#d97706', '#7c3aed', '#0d9488', '#db2777', '#475569', '#dc2626'];
const colorFor = (seed) => {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length];
};

const DEFAULT_STATUSES = [
  { name: 'To do', category: 'todo', color: '#94a3b8' },
  { name: 'In progress', category: 'active', color: '#3b82f6' },
  { name: 'In review', category: 'active', color: '#f59e0b' },
  { name: 'Done', category: 'done', color: '#65a30d' },
];

async function createStatuses(c, projectId, list = DEFAULT_STATUSES) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const { rows } = await c.query(
      'INSERT INTO statuses (project_id, name, category, color, position) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, category, color, position',
      [projectId, s.name, s.category, s.color, i],
    );
    out.push(rows[0]);
  }
  return out;
}

async function logActivity(c, { workspaceId, projectId = null, taskId = null, actorId = null, action, detail = {} }) {
  await c.query(
    'INSERT INTO activity (workspace_id, project_id, task_id, actor_id, action, detail) VALUES ($1,$2,$3,$4,$5,$6)',
    [workspaceId, projectId, taskId, actorId, action, JSON.stringify(detail)],
  );
}

/* Creates a notification for each user except the actor, de-duplicated. */
async function notify(c, { userIds, workspaceId, taskId = null, actorId = null, type, body = '' }) {
  const targets = [...new Set(userIds.filter((id) => id && id !== actorId))];
  for (const userId of targets) {
    await c.query(
      'INSERT INTO notifications (user_id, workspace_id, task_id, actor_id, type, body) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, workspaceId, taskId, actorId, type, String(body).slice(0, 300)],
    );
  }
}

async function addWatcher(c, taskId, userId) {
  if (!userId) return;
  await c.query('INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [taskId, userId]);
}

module.exports = { colorFor, DEFAULT_STATUSES, createStatuses, logActivity, notify, addWatcher };
