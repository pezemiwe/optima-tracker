import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { BlockedBadge, Checkbox, DueBadge, LabelList, StatusSelect, SubtaskProgress, TaskCounters } from '../components/TaskBits.jsx';
import { EmptyState, PriorityIcon, StatusDot, UserSelect } from '../components/ui.jsx';
import { groupTasks } from '../lib/filters.mjs';
import { useWorkspace } from '../state/workspace.jsx';

const GRID = 'grid items-center gap-3 px-3 grid-cols-[28px_28px_minmax(0,1fr)_32px] sm:grid-cols-[28px_28px_72px_minmax(0,1fr)_140px_150px_32px_100px_64px]';

function QuickAdd({ onAdd, placeholder = 'Add task…' }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onAdd(t); setTitle(''); } catch { /* error toast already shown */ } finally { setBusy(false); }
  }
  return (
    <form className="flex items-center gap-3 px-3 py-1.5" onSubmit={submit}>
      <span className="grid size-7 place-items-center text-slate-400"><Icon className="size-4" name="add" /></span>
      <input aria-label={placeholder} className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" disabled={busy} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} value={title} />
    </form>
  );
}

function Row({ task, pd, actions, canWrite, selected, selecting, onSelect, onOpen, active }) {
  const { members, memberById } = useWorkspace();
  const done = pd.statusById.get(task.statusId)?.category === 'done';
  const assignee = task.assigneeId ? memberById.get(task.assigneeId) : null;
  return (
    <div
      className={`${GRID} group cursor-pointer border-t border-line py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-[#181c22] ${selected ? 'bg-[#86bc25]/10' : ''} ${active ? 'bg-slate-50 dark:bg-[#181c22]' : ''}`}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(task); }}
      role="row"
      tabIndex={0}
    >
      <span className={`${selecting || selected ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'} grid place-items-center`} onClick={(e) => e.stopPropagation()}>
        <input aria-label={`Select ${task.projectKey}-${task.number}`} checked={selected} className="size-4 cursor-pointer accent-[#86bc25]" onChange={(e) => onSelect(task.id, e.target.checked)} type="checkbox" />
      </span>
      <Checkbox checked={done} disabled={!canWrite} label={done ? 'Mark as not done' : 'Mark as done'} onChange={() => actions.toggleDone(task).catch(() => {})} />
      <span className="faint hidden font-mono text-xs sm:block">{task.projectKey}-{task.number}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {task.parentId && <Icon className="size-3.5 shrink-0 text-slate-400" name="subtask" />}
          <span className={`truncate font-medium ${done ? 'faint line-through' : 'text-slate-900 dark:text-slate-100'}`}>{task.title}</span>
          <BlockedBadge task={task} />
          <SubtaskProgress task={task} />
          <TaskCounters task={task} />
        </div>
        <div className="mt-1 sm:hidden"><DueBadge done={done} task={task} /></div>
      </div>
      <div className="hidden items-center gap-1 sm:flex"><LabelList ids={task.labelIds} labelById={pd.labelById} max={2} /></div>
      <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
        {canWrite
          ? <StatusSelect className="btn btn-ghost btn-sm -ml-2 max-w-full" onChange={(statusId) => actions.update(task.id, { statusId }).catch(() => {})} statuses={pd.statuses} value={task.statusId} />
          : <span className="inline-flex items-center gap-2"><StatusDot color={pd.statusById.get(task.statusId)?.color} />{pd.statusById.get(task.statusId)?.name}</span>}
      </div>
      <span className="flex justify-center" onClick={(e) => e.stopPropagation()}>
        {canWrite
          ? <UserSelect className="rounded-full" members={members} onChange={(assigneeId) => actions.update(task.id, { assigneeId }).catch(() => {})} showName={false} value={task.assigneeId} />
          : <span title={assignee?.name || 'Unassigned'}>{assignee ? <span className="text-xs">{assignee.name.split(' ')[0]}</span> : <span className="faint">—</span>}</span>}
      </span>
      <span className="hidden sm:flex sm:justify-start"><DueBadge done={done} task={task} /></span>
      <span className="hidden justify-center sm:flex"><PriorityIcon value={task.priority} /></span>
    </div>
  );
}

export default function ListView({ tasks, pd, actions, filters, canWrite, selection, onSelect, onSelectAll, onOpen, activeNumber, quickDefaults = {}, emptyHint }) {
  const { members } = useWorkspace();
  const [collapsed, setCollapsed] = useState({});
  const groups = useMemo(() => groupTasks(tasks, filters.groupBy, { statuses: pd.statuses, members, labels: pd.labels }), [tasks, filters.groupBy, pd.statuses, pd.labels, members]);
  const selecting = selection.size > 0;

  if (!tasks.length && filters.groupBy !== 'status') {
    return <EmptyState icon="checkCircle" title="No tasks to show">{emptyHint || 'Try clearing a filter, or create a task to get started.'}</EmptyState>;
  }

  const quickAdd = (group) => (title) => {
    const body = { title, ...quickDefaults };
    if (filters.groupBy === 'status') body.statusId = group.id;
    else if (filters.groupBy === 'assignee' && group.id !== 'none') body.assigneeId = group.id;
    else if (filters.groupBy === 'priority') body.priority = group.id;
    else if (filters.groupBy === 'label' && group.id !== 'none') body.labelIds = [group.id];
    return actions.create(body);
  };

  return (
    <div className="surface overflow-hidden">
      <div className={`${GRID} faint py-2 text-[11px] font-semibold uppercase tracking-wider`} role="row">
        <span className="grid place-items-center"><input aria-label="Select all" checked={selecting && tasks.every((t) => selection.has(t.id))} className="size-4 cursor-pointer accent-[#86bc25]" onChange={(e) => onSelectAll(e.target.checked ? tasks.map((t) => t.id) : [])} type="checkbox" /></span>
        <span />
        <span className="hidden sm:block">Key</span>
        <span>Task</span>
        <span className="hidden sm:block">Labels</span>
        <span className="hidden sm:block">Status</span>
        <span className="text-center">Who</span>
        <span className="hidden sm:block">Due</span>
        <span className="hidden text-center sm:block">Priority</span>
      </div>
      {groups.map((group) => {
        const isCollapsed = collapsed[group.id];
        return (
          <section aria-label={group.label} key={group.id}>
            {filters.groupBy !== 'none' && (
              <div className="flex items-center gap-2 border-t border-line bg-slate-50/70 px-3 py-2 dark:bg-[#181c22]/70">
                <button aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.label}`} className="icon-btn size-6" onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))} type="button"><Icon className="size-4" name={isCollapsed ? 'chevronRight' : 'chevronDown'} /></button>
                {group.color && <StatusDot color={group.color} />}
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <span className="faint text-xs">{group.tasks.length}</span>
              </div>
            )}
            {!isCollapsed && (
              <>
                {group.tasks.map((task) => (
                  <Row actions={actions} active={task.number === activeNumber} canWrite={canWrite} key={task.id} onOpen={onOpen} onSelect={onSelect} pd={pd} selected={selection.has(task.id)} selecting={selecting} task={task} />
                ))}
                {!group.tasks.length && <p className="faint border-t border-line px-12 py-3 text-xs">No tasks here yet.</p>}
                {canWrite && !pd.project?.archived && <div className="border-t border-line"><QuickAdd onAdd={quickAdd(group)} /></div>}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
