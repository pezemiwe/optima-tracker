/* Pure filtering, sorting and grouping for task views. */
import { toISODate, shiftDate } from './dates.mjs';

export const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', rank: 0, color: '#dc2626' },
  { value: 'high', label: 'High', rank: 1, color: '#ea580c' },
  { value: 'medium', label: 'Medium', rank: 2, color: '#d97706' },
  { value: 'low', label: 'Low', rank: 3, color: '#2563eb' },
  { value: 'none', label: 'None', rank: 4, color: '#94a3b8' },
];
export const priorityMeta = (value) => PRIORITIES.find((p) => p.value === value) || PRIORITIES[2];

export const DEFAULT_FILTERS = {
  q: '', status: [], assignee: [], priority: [], labels: [], due: 'any', hideDone: false, showSubtasks: false,
  groupBy: 'status', sortKey: 'manual', sortDir: 'asc',
};

export const DUE_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'none', label: 'No due date' },
];

export function activeFilterCount(f) {
  return (f.status.length ? 1 : 0) + (f.assignee.length ? 1 : 0) + (f.priority.length ? 1 : 0)
    + (f.labels.length ? 1 : 0) + (f.due !== 'any' ? 1 : 0) + (f.hideDone ? 1 : 0);
}

/* Fills in any missing keys so old saved views keep working. */
export const normaliseFilters = (cfg) => ({ ...DEFAULT_FILTERS, ...(cfg || {}) });

/*
 * ctx: { statusById: Map(id -> {category}), meId, today }
 * Subtasks are hidden unless showSubtasks is on or a filter/search is active
 * (so a search can find a matching subtask).
 */
export function filterTasks(tasks, rawFilters, ctx) {
  const f = normaliseFilters(rawFilters);
  const today = ctx.today || toISODate();
  const weekEnd = shiftDate(today, 7);
  const needle = f.q.trim().toLowerCase();
  const searching = Boolean(needle) || activeFilterCount(f) > 0;
  return tasks.filter((t) => {
    if (t.parentId && !f.showSubtasks && !searching) return false;
    const done = ctx.statusById.get(t.statusId)?.category === 'done';
    if (f.hideDone && done) return false;
    if (f.status.length && !f.status.includes(t.statusId)) return false;
    if (f.priority.length && !f.priority.includes(t.priority)) return false;
    if (f.assignee.length) {
      const wanted = f.assignee.map((a) => (a === 'me' ? ctx.meId : a));
      const matchNone = wanted.includes('none') && !t.assigneeId;
      if (!matchNone && !wanted.includes(t.assigneeId)) return false;
    }
    if (f.labels.length && !f.labels.some((id) => t.labelIds.includes(id))) return false;
    if (f.due === 'overdue' && !(t.dueDate && t.dueDate < today && !done)) return false;
    if (f.due === 'today' && t.dueDate !== today) return false;
    if (f.due === 'week' && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
    if (f.due === 'none' && t.dueDate) return false;
    if (needle) {
      const hay = `${t.projectKey}-${t.number} ${t.number} ${t.title}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function sortTasks(tasks, rawFilters, ctx = {}) {
  const f = normaliseFilters(rawFilters);
  const dir = f.sortDir === 'desc' ? -1 : 1;
  const statusRank = ctx.statusRank || new Map();
  const cmp = {
    manual: (a, b) => a.position - b.position || a.number - b.number,
    number: (a, b) => a.number - b.number,
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    priority: (a, b) => priorityMeta(a.priority).rank - priorityMeta(b.priority).rank,
    due: (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
    status: (a, b) => (statusRank.get(a.statusId) ?? 0) - (statusRank.get(b.statusId) ?? 0),
    created: (a, b) => a.createdAt.localeCompare(b.createdAt),
    updated: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
  }[f.sortKey] || (() => 0);
  return [...tasks].sort((a, b) => (cmp(a, b) || a.number - b.number) * dir);
}

/*
 * Returns [{ id, label, color, tasks }]. Empty groups are kept for status
 * grouping so every column is visible.
 */
export function groupTasks(tasks, groupBy, { statuses, members, labels }) {
  if (groupBy === 'none') return [{ id: 'all', label: 'All tasks', color: null, tasks }];
  if (groupBy === 'assignee') {
    const groups = members.map((m) => ({ id: m.id, label: m.name, color: m.color, tasks: tasks.filter((t) => t.assigneeId === m.id) }));
    groups.push({ id: 'none', label: 'Unassigned', color: '#94a3b8', tasks: tasks.filter((t) => !t.assigneeId) });
    return groups.filter((g) => g.tasks.length);
  }
  if (groupBy === 'priority') {
    return PRIORITIES.map((p) => ({ id: p.value, label: p.label, color: p.color, tasks: tasks.filter((t) => t.priority === p.value) })).filter((g) => g.tasks.length);
  }
  if (groupBy === 'label') {
    const groups = labels.map((l) => ({ id: l.id, label: l.name, color: l.color, tasks: tasks.filter((t) => t.labelIds.includes(l.id)) }));
    groups.push({ id: 'none', label: 'No label', color: '#94a3b8', tasks: tasks.filter((t) => !t.labelIds.length) });
    return groups.filter((g) => g.tasks.length);
  }
  return statuses.map((s) => ({ id: s.id, label: s.name, color: s.color, category: s.category, tasks: tasks.filter((t) => t.statusId === s.id) }));
}

/* Where to put a dragged task so it lands between its new neighbours. */
export function positionBetween(before, after) {
  if (before == null && after == null) return 1000;
  if (before == null) return after / 2;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}
