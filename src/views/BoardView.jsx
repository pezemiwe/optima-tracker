import { useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { DueBadge, LabelList, SubtaskProgress, TaskCounters } from '../components/TaskBits.jsx';
import { Avatar, PriorityIcon, StatusDot } from '../components/ui.jsx';
import { positionBetween } from '../lib/filters.mjs';
import { useWorkspace } from '../state/workspace.jsx';

function Card({ task, pd, canWrite, dragging, onOpen, onDragStart, onDragEnd, active }) {
  const { memberById } = useWorkspace();
  const done = pd.statusById.get(task.statusId)?.category === 'done';
  const assignee = task.assigneeId ? memberById.get(task.assigneeId) : null;
  return (
    <article
      aria-label={`${task.projectKey}-${task.number} ${task.title}`}
      className={`cursor-pointer rounded-lg border bg-white p-3 text-sm shadow-sm transition hover:border-slate-300 dark:bg-[#181c22] dark:hover:border-[#414957] ${active ? 'border-[#86bc25]' : 'border-slate-200 dark:border-[#2b313b]'} ${dragging ? 'opacity-40' : ''}`}
      data-task-id={task.id}
      draggable={canWrite}
      onClick={() => onOpen(task)}
      onDragEnd={onDragEnd}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task); }}
      tabIndex={0}
    >
      <div className="flex items-center gap-2">
        <span className="faint font-mono text-[11px]">{task.projectKey}-{task.number}</span>
        <span className="ml-auto"><PriorityIcon value={task.priority} /></span>
      </div>
      <p className={`mt-1.5 font-medium leading-snug ${done ? 'faint line-through' : 'text-slate-900 dark:text-slate-100'}`}>{task.title}</p>
      {task.labelIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1"><LabelList ids={task.labelIds} labelById={pd.labelById} max={3} /></div>}
      <div className="mt-3 flex items-center gap-3">
        <DueBadge done={done} showTime={false} task={task} />
        <SubtaskProgress task={task} />
        <TaskCounters task={task} />
        <span className="ml-auto"><Avatar size={22} user={assignee} /></span>
      </div>
    </article>
  );
}

export default function BoardView({ tasks, pd, actions, canWrite, onOpen, activeNumber, quickDefaults = {} }) {
  const [dragId, setDragId] = useState(null);
  const [target, setTarget] = useState(null); // { statusId, beforeId }
  const [adding, setAdding] = useState(null); // statusId whose quick-add is open
  const [title, setTitle] = useState('');
  const dragged = useRef(null);

  const columns = useMemo(() => pd.statuses.map((s) => ({
    ...s, tasks: tasks.filter((t) => t.statusId === s.id).sort((a, b) => a.position - b.position || a.number - b.number),
  })), [pd.statuses, tasks]);

  const clear = () => { setDragId(null); setTarget(null); dragged.current = null; };

  /* While hovering a column, find which card the pointer is above to place the drop marker. */
  function onDragOverColumn(e, column) {
    if (!canWrite || !dragged.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cards = [...e.currentTarget.querySelectorAll('[data-task-id]')].filter((el) => el.dataset.taskId !== dragged.current.id);
    let beforeId = null;
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { beforeId = el.dataset.taskId; break; }
    }
    setTarget((t) => (t && t.statusId === column.id && t.beforeId === beforeId ? t : { statusId: column.id, beforeId }));
  }

  function onDrop(e, column) {
    e.preventDefault();
    const task = dragged.current;
    const t = target;
    clear();
    if (!task || !canWrite || !t) return;
    const others = column.tasks.filter((x) => x.id !== task.id);
    const idx = t.beforeId ? others.findIndex((x) => x.id === t.beforeId) : others.length;
    const position = positionBetween(others[idx - 1]?.position, others[idx]?.position);
    if (task.statusId === column.id && position === task.position) return;
    actions.updateOptimistic(task.id, { statusId: column.id, position }).catch(() => {});
  }

  async function add(e, column) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    try {
      await actions.create({ title: t, statusId: column.id, ...quickDefaults });
      setTitle('');
    } catch { /* toast shown */ }
  }

  return (
    <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4">
      {columns.map((column) => (
        <section
          aria-label={`${column.name} column`}
          className={`flex w-[300px] shrink-0 flex-col rounded-xl border border-line bg-slate-100/70 p-2.5 dark:bg-[#12151a] ${target?.statusId === column.id ? 'ring-2 ring-[#86bc25]/60' : ''}`}
          key={column.id}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setTarget((t) => (t?.statusId === column.id ? null : t)); }}
          onDragOver={(e) => onDragOverColumn(e, column)}
          onDrop={(e) => onDrop(e, column)}
        >
          <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
            <StatusDot color={column.color} />
            <h3 className="text-sm font-semibold">{column.name}</h3>
            <span className="faint text-xs">{column.tasks.length}</span>
            {column.category === 'done' && <Icon className="size-3.5 text-lime-600" name="check" />}
            {canWrite && !pd.project?.archived && <button aria-label={`Add task to ${column.name}`} className="icon-btn ml-auto size-7" onClick={() => { setAdding(adding === column.id ? null : column.id); setTitle(''); }} type="button"><Icon name="add" /></button>}
          </header>
          <div className="grid min-h-12 flex-1 content-start gap-2">
            {column.tasks.map((task) => (
              <div key={task.id}>
                {target?.statusId === column.id && target.beforeId === task.id && <div aria-hidden="true" className="mb-2 h-1 rounded bg-[#86bc25]" />}
                <Card active={task.number === activeNumber} canWrite={canWrite} dragging={dragId === task.id} onDragEnd={clear} onDragStart={(t) => { dragged.current = t; setDragId(t.id); }} onOpen={onOpen} pd={pd} task={task} />
              </div>
            ))}
            {target?.statusId === column.id && !target.beforeId && column.tasks.some((t) => t.id !== dragId) && <div aria-hidden="true" className="h-1 rounded bg-[#86bc25]" />}
            {!column.tasks.length && (
              <p className={`grid h-16 place-items-center rounded-lg border border-dashed text-xs text-slate-400 ${target?.statusId === column.id ? 'border-[#86bc25]' : 'border-slate-300 dark:border-[#2b313b]'}`}>{canWrite ? 'Drop a task here' : 'No tasks'}</p>
            )}
          </div>
          {adding === column.id && (
            <form className="mt-2" onSubmit={(e) => add(e, column)}>
              <input aria-label={`New task in ${column.name}`} autoFocus className="input" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setAdding(null); }} placeholder="Task title, then Enter" value={title} />
            </form>
          )}
          {canWrite && !pd.project?.archived && adding !== column.id && (
            <button className="mt-2 flex h-8 items-center gap-2 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-200/60 dark:hover:bg-[#1b2028]" onClick={() => { setAdding(column.id); setTitle(''); }} type="button"><Icon className="size-3.5" name="add" />Add task</button>
          )}
        </section>
      ))}
    </div>
  );
}
