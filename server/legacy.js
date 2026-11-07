'use strict';
/*
 * Imports the original close-out tracker data (the old `docs` table, or the
 * bundled seed file on a brand-new install) into a "Close-out" project.
 * Runs once, when the very first account is created.
 */
const fs = require('fs');
const path = require('path');
const { colorFor, createStatuses, logActivity } = require('./services');

const LEGACY_STATUSES = [
  { name: 'To do', category: 'todo', color: '#94a3b8' },
  { name: 'In progress', category: 'active', color: '#3b82f6' },
  { name: 'Done', category: 'done', color: '#65a30d' },
  { name: 'Merged', category: 'done', color: '#7c3aed' },
  { name: 'Closed', category: 'done', color: '#0d9488' },
];
const STATUS_INDEX = { todo: 0, doing: 1, blocked: 1, done: 2, merged: 3, closed: 4 };
const PRIORITY = { high: 'high', med: 'medium', low: 'low' };
const WS_COLORS = { OPEX: '#65a30d', DAMS: '#2563eb', 'Print-Paper': '#d97706', BRD: '#7c3aed', Environment: '#0d9488', Testing: '#e11d48', Other: '#64748b' };

async function loadLegacy(c) {
  const { rows } = await c.query("SELECT to_regclass('public.docs') AS t");
  if (rows[0].t) {
    const docs = await c.query('SELECT coll, id, data FROM docs ORDER BY created_at, id');
    if (docs.rows.length) {
      return {
        tasks: docs.rows.filter((d) => d.coll === 'tasks'),
        subtasks: docs.rows.filter((d) => d.coll === 'subtasks'),
        source: 'database',
      };
    }
  }
  if (process.env.SEED === 'off') return null;
  const file = path.join(__dirname, '..', 'seed', 'seed.json');
  if (!fs.existsSync(file)) return null;
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { tasks: seed.tasks || [], subtasks: seed.subtasks || [], source: 'seed' };
}

const dateOnly = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const timeOnly = (s) => (typeof s === 'string' && /^\d{2}:\d{2}$/.test(s) ? s : null);
const tsOrNull = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

/* Returns the number of tasks imported (0 when there was nothing to import). */
async function importLegacy(c, { workspaceId, ownerId }) {
  const already = await c.query('SELECT 1 FROM legacy_import LIMIT 1');
  if (already.rows.length) return 0;
  const legacy = await loadLegacy(c);
  if (!legacy || !legacy.tasks.length) return 0;

  const { rows: pr } = await c.query(
    `INSERT INTO projects (workspace_id, key, name, description, color, created_by)
     VALUES ($1,'CLO','Daily Close-out','Imported from the original Optima close-out checklist.','#65a30d',$2) RETURNING id`,
    [workspaceId, ownerId],
  );
  const projectId = pr[0].id;
  const statuses = await createStatuses(c, projectId, LEGACY_STATUSES);

  // Workstreams become labels.
  const labelIds = new Map();
  const wsNames = [...new Set(legacy.tasks.map((t) => t.data.ws).filter(Boolean))];
  for (const name of wsNames) {
    const { rows } = await c.query('INSERT INTO labels (project_id, name, color) VALUES ($1,$2,$3) RETURNING id', [projectId, name, WS_COLORS[name] || '#64748b']);
    labelIds.set(name, rows[0].id);
  }

  // Owner/watcher names become placeholder members an admin can invite later.
  const people = new Map();
  const names = new Set();
  for (const d of [...legacy.tasks, ...legacy.subtasks]) {
    if (d.data.owner) names.add(d.data.owner);
    if (d.data.watcher) names.add(d.data.watcher);
  }
  for (const name of names) {
    const { rows } = await c.query('INSERT INTO users (name, color, is_placeholder) VALUES ($1,$2,true) RETURNING id', [name, colorFor(name)]);
    people.set(name, rows[0].id);
    await c.query("INSERT INTO members (workspace_id, user_id, role) VALUES ($1,$2,'member')", [workspaceId, rows[0].id]);
  }

  const idMap = new Map();
  let maxNumber = 0;
  const ordered = [...legacy.tasks].sort((a, b) => (a.data.n || 0) - (b.data.n || 0));
  for (const t of ordered) {
    const d = t.data;
    const number = Number.isInteger(d.n) && d.n > 0 ? d.n : maxNumber + 1;
    maxNumber = Math.max(maxNumber, number);
    const status = statuses[STATUS_INDEX[d.status] ?? 0];
    const { rows } = await c.query(
      `INSERT INTO tasks (project_id, number, title, description, status_id, priority, assignee_id, due_date, due_time, position, created_at, updated_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, COALESCE($11::timestamptz, now()), COALESCE($11::timestamptz, now()), $12) RETURNING id`,
      [projectId, number, String(d.title || 'Untitled').slice(0, 300), String(d.note || ''), status.id, PRIORITY[d.priority] || 'medium',
        people.get(d.owner) || null, dateOnly(d.day), timeOnly(d.due), number * 1000, tsOrNull(d.createdAt),
        status.category === 'done' ? (tsOrNull(d.doneAt) || new Date().toISOString()) : null],
    );
    idMap.set(t.id, rows[0].id);
    if (d.ws && labelIds.has(d.ws)) await c.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2)', [rows[0].id, labelIds.get(d.ws)]);
    if (d.watcher && people.has(d.watcher)) await c.query('INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, people.get(d.watcher)]);
  }

  const todo = statuses[0];
  const done = statuses.find((s) => s.name === 'Done');
  for (const s of [...legacy.subtasks].sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0))) {
    const parentId = idMap.get(s.data.parent);
    if (!parentId) continue;
    maxNumber += 1;
    const status = s.data.done ? done : todo;
    await c.query(
      `INSERT INTO tasks (project_id, number, title, status_id, priority, assignee_id, parent_id, position, created_at, completed_at)
       VALUES ($1,$2,$3,$4,'none',$5,$6,$7, COALESCE($8::timestamptz, now()), $9)`,
      [projectId, maxNumber, String(s.data.title || 'Untitled').slice(0, 300), status.id, people.get(s.data.owner) || null, parentId, maxNumber * 1000,
        tsOrNull(s.data.createdAt), s.data.done ? new Date().toISOString() : null],
    );
  }
  await c.query('UPDATE projects SET task_seq = $2 WHERE id = $1', [projectId, maxNumber]);
  await logActivity(c, { workspaceId, projectId, actorId: ownerId, action: 'project.imported', detail: { tasks: legacy.tasks.length, source: legacy.source } });
  await c.query('INSERT INTO legacy_import (tasks) VALUES ($1)', [legacy.tasks.length]);
  return legacy.tasks.length;
}

module.exports = { importLegacy };
