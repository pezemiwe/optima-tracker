import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Popover, PriorityIcon } from '../components/ui.jsx';
import { formatMonth, monthGrid, shiftMonth, toISODate } from '../lib/dates.mjs';
import { priorityMeta } from '../lib/filters.mjs';
import { useShell } from '../components/shellContext.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Chip({ task, done, canWrite, onOpen, onDragStart, compact = false }) {
  const meta = priorityMeta(task.priority);
  return (
    <button
      className={`flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-[3px] bg-slate-100 px-1.5 py-0.5 text-left text-xs transition hover:bg-slate-200 dark:bg-[#1b2028] dark:hover:bg-[#242a33] ${done ? 'faint line-through' : 'text-slate-800 dark:text-slate-200'}`}
      draggable={canWrite}
      onClick={(e) => { e.stopPropagation(); onOpen(task); }}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task); }}
      style={{ borderLeftColor: meta.color }}
      title={`${task.projectKey}-${task.number}: ${task.title}`}
      type="button"
    >
      {task.dueTime && !compact && <span className="faint font-mono text-[10px]">{task.dueTime}</span>}
      <span className="truncate">{task.title}</span>
    </button>
  );
}

export default function CalendarView({ tasks, pd, actions, canWrite, onOpen }) {
  const { openNewTask } = useShell();
  const today = toISODate();
  const [anchor, setAnchor] = useState(today);
  const [dragged, setDragged] = useState(null);
  const [over, setOver] = useState(null);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate).push(t);
    }
    for (const list of map.values()) list.sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99') || a.number - b.number);
    return map;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.dueDate && pd.statusById.get(t.statusId)?.category !== 'done'), [tasks, pd.statusById]);
  const isDone = (t) => pd.statusById.get(t.statusId)?.category === 'done';

  function drop(date) {
    const task = dragged;
    setDragged(null);
    setOver(null);
    if (!task || !canWrite || task.dueDate === date) return;
    // Keep start <= due when moving a task earlier than its start date.
    const changes = { dueDate: date, ...(task.startDate && task.startDate > date ? { startDate: date } : {}) };
    actions.updateOptimistic(task.id, changes).catch(() => {});
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="surface overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="mr-auto text-base font-semibold">{formatMonth(anchor)}</h2>
          <button aria-label="Previous month" className="icon-btn" onClick={() => setAnchor((a) => shiftMonth(a, -1))} type="button"><Icon name="chevronLeft" /></button>
          <button className="btn btn-sm" onClick={() => setAnchor(today)} type="button">Today</button>
          <button aria-label="Next month" className="icon-btn" onClick={() => setAnchor((a) => shiftMonth(a, 1))} type="button"><Icon name="chevronRight" /></button>
        </div>
        <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold uppercase tracking-wider faint">
          {WEEKDAYS.map((d) => <div className="py-2" key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7" role="grid">
          {grid.map((cell) => {
            const list = byDay.get(cell.date) || [];
            const shown = list.slice(0, 3);
            const isToday = cell.date === today;
            return (
              <div
                aria-label={cell.date}
                className={`min-h-[104px] border-b border-r border-line p-1.5 transition last:border-r-0 sm:min-h-[120px] ${cell.inMonth ? '' : 'bg-slate-50/70 dark:bg-[#101317]'} ${over === cell.date ? 'bg-[#86bc25]/10' : ''} ${canWrite ? 'cursor-pointer' : ''}`}
                key={cell.date}
                onClick={() => { if (canWrite && !pd.project?.archived) openNewTask({ projectId: pd.summary.id, dueDate: cell.date }); }}
                onDragLeave={() => setOver((o) => (o === cell.date ? null : o))}
                onDragOver={(e) => { if (dragged && canWrite) { e.preventDefault(); setOver(cell.date); } }}
                onDrop={(e) => { e.preventDefault(); drop(cell.date); }}
                role="gridcell"
              >
                <div className="mb-1 flex justify-between">
                  <span className={`grid size-6 place-items-center rounded-full text-xs ${isToday ? 'bg-[#86bc25] font-semibold text-slate-950' : cell.inMonth ? 'text-slate-700 dark:text-slate-300' : 'faint'}`}>{cell.day}</span>
                </div>
                <div className="grid gap-1">
                  {shown.map((t) => <Chip canWrite={canWrite} done={isDone(t)} key={t.id} onDragStart={setDragged} onOpen={onOpen} task={t} />)}
                  {list.length > 3 && (
                    <Popover trigger={(p) => <button {...p} className="px-1 text-left text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white" type="button">+{list.length - 3} more</button>} width={260}>
                      {(close) => (
                        <div className="grid gap-1 p-1">
                          <p className="faint px-1 text-[11px] font-semibold uppercase tracking-wider">{cell.date}</p>
                          {list.map((t) => <Chip canWrite={canWrite} done={isDone(t)} key={t.id} onDragStart={setDragged} onOpen={(task) => { close(); onOpen(task); }} task={t} />)}
                        </div>
                      )}
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <aside aria-label="Tasks without a due date" className="surface h-fit p-3">
        <h3 className="px-1 text-sm font-semibold">No due date <span className="faint font-normal">{unscheduled.length}</span></h3>
        <p className="faint mb-2 mt-1 px-1 text-xs">{canWrite ? 'Drag a task onto a day to schedule it.' : 'These tasks are not scheduled yet.'}</p>
        <div className="grid max-h-[60vh] gap-1 overflow-y-auto">
          {unscheduled.map((t) => (
            <div className="flex items-center gap-1.5" key={t.id}>
              <Chip canWrite={canWrite} compact done={false} onDragStart={setDragged} onOpen={onOpen} task={t} />
              <PriorityIcon value={t.priority} />
            </div>
          ))}
          {!unscheduled.length && <p className="faint px-1 py-3 text-xs">Everything open has a date.</p>}
        </div>
      </aside>
    </div>
  );
}
