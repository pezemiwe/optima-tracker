import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import Shell from '../components/Shell.jsx';
import TaskDrawer from '../components/TaskDrawer.jsx';
import { Avatar, EmptyState, Modal, MultiSelect, Popover, Select, Spinner, StatusDot, useConfirm, useLocalStorage, useToast } from '../components/ui.jsx';
import { PrioritySelect, StatusSelect } from '../components/TaskBits.jsx';
import { UserSelect } from '../components/ui.jsx';
import { formatDuration, toISODate } from '../lib/dates.mjs';
import { activeFilterCount, DEFAULT_FILTERS, DUE_OPTIONS, filterTasks, normaliseFilters, PRIORITIES, sortTasks } from '../lib/filters.mjs';
import { Link, useQueryParam, useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useProjectData, useTaskActions, useWorkspace } from '../state/workspace.jsx';
import BoardView from './BoardView.jsx';
import CalendarView from './CalendarView.jsx';
import DailyView from './DailyView.jsx';
import ListView from './ListView.jsx';

const VIEWS = [['list', 'List', 'list'], ['board', 'Board', 'board'], ['calendar', 'Calendar', 'calendar'], ['daily', 'Daily', 'checkCircle']];
const GROUPS = [['status', 'Status'], ['assignee', 'Assignee'], ['priority', 'Priority'], ['label', 'Label'], ['none', 'No grouping']];
const SORTS = [['manual', 'Manual order'], ['number', 'Key'], ['title', 'Title'], ['priority', 'Priority'], ['due', 'Due date'], ['status', 'Status'], ['created', 'Created'], ['updated', 'Last updated']];

function SaveViewModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const { canWrite } = useWorkspace();
  return (
    <Modal footer={<><button className="btn" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" disabled={!name.trim()} form="save-view" type="submit">Save view</button></>} onClose={onClose} size="sm" title="Save current view">
      <form id="save-view" onSubmit={(e) => { e.preventDefault(); onSave(name.trim(), shared); }}>
        <label className="field-label" htmlFor="sv-name">Name</label>
        <input autoFocus className="input" id="sv-name" maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. My open bugs" value={name} />
        {canWrite && <label className="mt-3 flex items-center gap-2 text-sm"><input checked={shared} className="size-4 accent-[#86bc25]" onChange={(e) => setShared(e.target.checked)} type="checkbox" />Share with everyone in the workspace</label>}
        <p className="faint mt-3 text-xs">Saves the current tab, filters, grouping and sort order.</p>
      </form>
    </Modal>
  );
}

function SavedViews({ pd, view, filters, onApply }) {
  const { user } = useAuth();
  const { isAdmin } = useWorkspace();
  const toast = useToast();
  const [views, setViews] = useState([]);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api.get(`/projects/${pd.summary.id}/views`).then((r) => setViews(r.views)).catch(() => {}), [pd.summary.id]);
  useEffect(() => { load(); }, [load]);

  async function save(name, shared) {
    try {
      await api.post(`/projects/${pd.summary.id}/views`, { name, view, shared, config: filters });
      toast.success('View saved');
      setSaving(false);
      load();
    } catch (e) { toast.error(e.message); }
  }
  async function remove(v) {
    try { await api.del(`/views/${v.id}`); load(); } catch (e) { toast.error(e.message); }
  }
  return (
    <>
      <Popover align="right" trigger={(p) => <button {...p} className="btn" type="button"><Icon className="size-4" name="save" />Views{views.length > 0 && <span className="faint">{views.length}</span>}</button>} width={280}>
        {(close) => (
          <div>
            {views.length === 0 && <p className="faint px-3 py-2 text-xs">No saved views yet.</p>}
            {views.map((v) => (
              <div className="flex items-center" key={v.id}>
                <button className="menu-item flex-1" onClick={() => { close(); onApply(v); }} type="button"><Icon className="size-4 text-slate-400" name={v.shared ? 'users' : 'user'} /><span className="min-w-0 flex-1 truncate">{v.name}</span><span className="chip capitalize">{v.view}</span></button>
                {(v.userId === user.id || isAdmin) && <button aria-label={`Delete view ${v.name}`} className="icon-btn size-7" onClick={() => remove(v)} type="button"><Icon className="size-3.5" name="trash" /></button>}
              </div>
            ))}
            <button className="menu-item mt-1 border-t border-line" onClick={() => { close(); setSaving(true); }} type="button"><Icon className="size-4" name="add" />Save current view…</button>
          </div>
        )}
      </Popover>
      {saving && <SaveViewModal onClose={() => setSaving(false)} onSave={save} />}
    </>
  );
}

function BulkBar({ count, pd, onClear, onApply, onDelete, canDelete }) {
  const { members } = useWorkspace();
  return (
    <div className="surface animate-pop fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap items-center gap-2 px-3 py-2 shadow-xl" role="toolbar" aria-label="Bulk actions">
      <span className="px-2 text-sm font-semibold">{count} selected</span>
      <StatusSelect className="btn btn-sm" onChange={(statusId) => onApply({ statusId })} statuses={pd.statuses} value={null} />
      <PrioritySelect className="btn btn-sm" onChange={(priority) => onApply({ priority })} showLabel value="none" />
      <UserSelect className="btn btn-sm" members={members} onChange={(assigneeId) => onApply({ assigneeId })} value={null} />
      <input aria-label="Set due date for selected" className="input h-8 w-36 text-xs" onChange={(e) => e.target.value && onApply({ dueDate: e.target.value })} type="date" />
      {canDelete && <button className="btn btn-sm btn-danger" onClick={onDelete} type="button"><Icon className="size-3.5" name="trash" />Delete</button>}
      <button aria-label="Clear selection" className="icon-btn" onClick={onClear} type="button"><Icon name="close" /></button>
    </div>
  );
}

export function exportProject(pd, members) {
  const xlsx = window.XLSX;
  if (!xlsx) throw new Error('The spreadsheet export library did not load. Reload the page and try again.');
  const person = (id) => members.find((m) => m.id === id)?.name || '';
  const rows = pd.tasks.map((t) => ({
    Key: `${t.projectKey}-${t.number}`,
    Title: t.title,
    Parent: t.parentId ? `${t.projectKey}-${pd.taskById.get(t.parentId)?.number}` : '',
    Status: pd.statusById.get(t.statusId)?.name || '',
    Priority: t.priority,
    Assignee: person(t.assigneeId),
    Reporter: person(t.reporterId),
    Labels: t.labelIds.map((id) => pd.labelById.get(id)?.name).filter(Boolean).join(', '),
    Start: t.startDate || '',
    Due: t.dueDate || '',
    'Due time': t.dueTime || '',
    Estimate: t.estimateMinutes == null ? '' : formatDuration(t.estimateMinutes),
    Created: t.createdAt.slice(0, 10),
    Completed: t.completedAt ? t.completedAt.slice(0, 10) : '',
  }));
  const top = pd.tasks.filter((t) => !t.parentId);
  const summary = [
    { Metric: 'Project', Value: pd.project.name },
    { Metric: 'Tasks (excluding subtasks)', Value: top.length },
    ...pd.statuses.map((s) => ({ Metric: s.name, Value: top.filter((t) => t.statusId === s.id).length })),
    { Metric: 'Overdue', Value: top.filter((t) => t.dueDate && t.dueDate < toISODate() && pd.statusById.get(t.statusId)?.category !== 'done').length },
  ];
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Tasks');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(summary), 'Summary');
  xlsx.writeFile(wb, `${pd.project.key}-tasks-${toISODate()}.xlsx`);
}

export default function ProjectPage({ projectKey, view }) {
  const { workspace, members, canWrite, isAdmin } = useWorkspace();
  const { user } = useAuth();
  const { navigate } = useRoute();
  const pd = useProjectData(projectKey);
  const actions = useTaskActions(pd);
  const toast = useToast();
  const confirm = useConfirm();
  const [taskParam, setTaskParam] = useQueryParam('task');
  const [stored, setStored] = useLocalStorage(`optima-filters-${pd.summary?.id || 'none'}`, DEFAULT_FILTERS);
  const filters = normaliseFilters(stored);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const base = `/w/${workspace.slug}/p/${projectKey}`;

  useEffect(() => { setSelection(new Set()); }, [view, projectKey]);
  useEffect(() => { try { localStorage.setItem('optima-last-ws', workspace.slug); } catch { /* optional */ } }, [workspace.slug]);

  const setFilter = (patch) => setStored({ ...filters, ...patch });
  const ctx = useMemo(() => ({ statusById: pd.statusById, meId: user.id, today: toISODate() }), [pd.statusById, user.id]);
  const visible = useMemo(() => sortTasks(filterTasks(pd.tasks, filters, ctx), filters, { statusRank: pd.statusRank }), [pd.tasks, filters, ctx, pd.statusRank]);

  const crumbs = [{ label: pd.project?.name || projectKey, to: `${base}/${view}` }];

  if (pd.notFound && !pd.loading) {
    return (
      <Shell crumbs={[{ label: 'Project not found' }]}>
        <EmptyState icon="folder" title="Project not found" action={<Link className="btn btn-primary" to={`/w/${workspace.slug}`}>Back to home</Link>}>It may have been deleted, or you may not have access to it.</EmptyState>
      </Shell>
    );
  }
  if (pd.error && !pd.ready) {
    return <Shell crumbs={crumbs}><EmptyState icon="warning" title="Could not load this project" action={<button className="btn btn-primary" onClick={pd.reload} type="button">Try again</button>}>{pd.error.message}</EmptyState></Shell>;
  }
  if (!pd.ready) return <Shell crumbs={crumbs}><div className="grid place-items-center py-24"><Spinner className="size-7" /></div></Shell>;

  const writable = canWrite && !pd.project.archived;
  const count = activeFilterCount(filters);
  const select = (id, on) => setSelection((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const openTask = (task) => setTaskParam(String(task.number));
  const activeNumber = taskParam ? Number(taskParam) : null;

  const applyView = (v) => {
    setStored(normaliseFilters(v.config));
    navigate(`${base}/${v.view}`);
  };

  async function bulkApply(changes) {
    const ids = [...selection];
    try { await actions.bulk(ids, changes); toast.success(`Updated ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}`); setSelection(new Set()); } catch { /* toast shown */ }
  }
  async function bulkDelete() {
    const ids = [...selection];
    const ok = await confirm({ title: `Delete ${ids.length} ${ids.length === 1 ? 'task' : 'tasks'}?`, message: 'Their subtasks, comments and history are deleted too. This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await actions.bulkDelete(ids); toast.success('Deleted'); setSelection(new Set()); } catch { /* toast shown */ }
  }

  const common = { tasks: visible, pd, actions, filters, canWrite: writable, selection, onSelect: select, onSelectAll: (ids) => setSelection(new Set(ids)), onOpen: openTask, activeNumber };
  const memberOptions = [{ value: 'me', label: 'Me', node: <Avatar size={20} user={user} /> }, { value: 'none', label: 'Unassigned', node: <Avatar size={20} /> }, ...members.filter((m) => m.id !== user.id).map((m) => ({ value: m.id, label: m.name, node: <Avatar size={20} user={m} /> }))];

  return (
    <Shell crumbs={crumbs}>
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: pd.project.color }}>{pd.project.key.slice(0, 3)}</span>
          <div className="min-w-0 flex-1">
            <h1 className="page-title break-words">{pd.project.name}</h1>
            {pd.project.description && <p className="muted mt-1 max-w-3xl text-sm">{pd.project.description}</p>}
          </div>
          {isAdmin && <Link aria-label="Project settings" className="btn" to={`${base}/settings`}><Icon className="size-4" name="settings" /><span className="hidden sm:inline">Project settings</span></Link>}
        </div>

        {pd.project.archived && <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" role="status"><Icon className="size-4" name="archive" />This project is archived and read-only.{isAdmin && <Link className="font-medium underline" to={`${base}/settings`}>Restore it in settings</Link>}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line">
          <div className="flex" role="tablist" aria-label="View">
            {VIEWS.map(([key, label, icon]) => <Link aria-selected={view === key} className="tab" key={key} role="tab" to={`${base}/${key}${window.location.search}`}><Icon className="size-4" name={icon} />{label}</Link>)}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 pb-2">
            <label className="relative">
              <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" name="search" />
              <input aria-label="Search tasks" className="input w-44 pl-9 pr-8 sm:w-60" data-search onChange={(e) => setFilter({ q: e.target.value })} placeholder="Search tasks" value={filters.q} />
              <span className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</span>
            </label>
            <button aria-expanded={filtersOpen} className={`btn ${count ? 'border-[#86bc25] dark:border-[#86bc25]' : ''}`} onClick={() => setFiltersOpen((o) => !o)} type="button"><Icon className="size-4" name="filter" />Filter{count > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#86bc25] px-1 text-[11px] font-semibold text-slate-950">{count}</span>}</button>
            {view === 'list' && (
              <>
                <Select ariaLabel="Group by" className="btn" onChange={(groupBy) => setFilter({ groupBy })} options={GROUPS.map(([value, label]) => ({ value, label }))} value={filters.groupBy}>{(cur) => <><Icon className="size-4" name="group" />Group: {cur?.label}</>}</Select>
                <Popover align="right" trigger={(p) => <button {...p} className="btn" type="button"><Icon className="size-4" name="sort" />Sort</button>} width={220}>
                  {(close) => (
                    <div>
                      {SORTS.map(([value, label]) => <button aria-selected={filters.sortKey === value} className="menu-item" key={value} onClick={() => { setFilter({ sortKey: value }); close(); }} type="button"><span className="flex-1">{label}</span>{filters.sortKey === value && <Icon className="size-4" name="check" />}</button>)}
                      <button className="menu-item mt-1 border-t border-line" onClick={() => { setFilter({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' }); close(); }} type="button"><Icon className="size-4" name="sort" />{filters.sortDir === 'asc' ? 'Ascending' : 'Descending'}</button>
                    </div>
                  )}
                </Popover>
              </>
            )}
            <SavedViews filters={filters} onApply={applyView} pd={pd} view={view} />
            <button aria-label="Export to Excel" className="btn" onClick={() => { try { exportProject(pd, members); } catch (e) { toast.error(e.message); } }} title="Export all tasks to Excel" type="button"><Icon className="size-4" name="download" /><span className="hidden lg:inline">Export</span></button>
          </div>
        </div>

        {filtersOpen && (
          <div className="surface animate-pop mt-3 flex flex-wrap items-center gap-2 p-3">
            <MultiSelect label="Status" onChange={(status) => setFilter({ status })} options={pd.statuses.map((s) => ({ value: s.id, label: s.name, node: <StatusDot color={s.color} /> }))} values={filters.status} />
            <MultiSelect label="Assignee" onChange={(assignee) => setFilter({ assignee })} options={memberOptions} searchable values={filters.assignee} />
            <MultiSelect label="Priority" onChange={(priority) => setFilter({ priority })} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label, node: <Icon className="size-3.5" name="flag" style={{ color: p.color }} /> }))} values={filters.priority} />
            <MultiSelect label="Label" onChange={(labels) => setFilter({ labels })} options={pd.labels.map((l) => ({ value: l.id, label: l.name, node: <StatusDot color={l.color} /> }))} values={filters.labels} />
            <Select ariaLabel="Due" className={`btn ${filters.due !== 'any' ? 'border-[#86bc25] dark:border-[#86bc25]' : ''}`} onChange={(due) => setFilter({ due })} options={DUE_OPTIONS} value={filters.due}>{(cur) => <><Icon className="size-4" name="calendar" />{cur?.label}<Icon className="size-3.5 text-slate-400" name="chevronDown" /></>}</Select>
            <label className="flex items-center gap-2 px-2 text-sm"><input checked={filters.hideDone} className="size-4 accent-[#86bc25]" onChange={(e) => setFilter({ hideDone: e.target.checked })} type="checkbox" />Hide done</label>
            <label className="flex items-center gap-2 px-2 text-sm"><input checked={filters.showSubtasks} className="size-4 accent-[#86bc25]" onChange={(e) => setFilter({ showSubtasks: e.target.checked })} type="checkbox" />Show subtasks</label>
            {(count > 0 || filters.q) && <button className="btn btn-ghost ml-auto" onClick={() => setStored({ ...DEFAULT_FILTERS, groupBy: filters.groupBy, sortKey: filters.sortKey, sortDir: filters.sortDir })} type="button">Clear all</button>}
          </div>
        )}

        <p aria-live="polite" className="faint mb-3 mt-3 text-xs">
          Showing {visible.length} of {filters.showSubtasks || count || filters.q ? pd.tasks.length : pd.tasks.filter((t) => !t.parentId).length} tasks
        </p>

        {!pd.tasks.length ? (
          <div className="surface"><EmptyState action={writable ? <button className="btn btn-primary" onClick={() => actions.create({ title: 'My first task' }).then((t) => openTask(t)).catch(() => {})} type="button"><Icon className="size-4" name="add" />Create the first task</button> : null} icon="checkCircle" title="No tasks in this project yet">Add a task to start planning. You can drag cards on the board and track work across views.</EmptyState></div>
        ) : (
          <>
            {view === 'list' && <ListView {...common} />}
            {view === 'board' && <BoardView {...common} />}
            {view === 'calendar' && <CalendarView {...common} />}
            {view === 'daily' && <DailyView {...common} />}
          </>
        )}
      </div>
      {selection.size > 0 && writable && <BulkBar canDelete count={selection.size} onApply={bulkApply} onClear={() => setSelection(new Set())} onDelete={bulkDelete} pd={pd} />}
      {activeNumber && <TaskDrawer actions={actions} canWrite={canWrite} number={activeNumber} onClose={() => setTaskParam(null)} pd={pd} />}
    </Shell>
  );
}
