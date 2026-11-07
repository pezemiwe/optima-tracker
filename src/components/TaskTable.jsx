import Icon from './Icon.jsx';
import { formatDate, isFinished, isOverdue, STATUSES, taskNumber } from '../utils.js';

function StatusBadge({ status }) {
  const item = STATUSES.find((entry) => entry.value === status);
  const styles = {
    todo: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    doing: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    done: 'bg-lime-50 text-lime-800 dark:bg-lime-950/50 dark:text-lime-300',
    merged: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
    closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${styles[status] || styles.todo}`}>{item?.label || status}</span>;
}

export { StatusBadge };

const columns = [
  ['n', 'ID'], ['title', 'Task'], ['ws', 'Workstream'], ['owner', 'Owner'], ['watcher', 'Watcher'],
  ['due', 'Due'], ['priority', 'Priority'], ['status', 'Status'],
];
const dot = { todo: 'bg-slate-400', doing: 'bg-blue-500', done: 'bg-lime-600', merged: 'bg-violet-500', closed: 'bg-teal-600' };
const priorityText = { high: 'High', med: 'Medium', low: 'Low' };

export default function TaskTable({ tasks, subtasks, canWrite, onOpen, onStatus, onPatch, onDelete, onCreate, showDate, sortKey, sortDir, onSort }) {
  if (!tasks.length) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center dark:border-[#343b47] dark:bg-[#14171c]">
        <div><p className="font-medium text-slate-800 dark:text-slate-100">No tasks match these filters</p><p className="mt-1 text-sm text-slate-500">Try another date or clear the search.</p>
          {canWrite && <button className="mt-4 rounded-lg bg-[#86bc25] px-3 py-2 text-sm font-semibold text-slate-950" onClick={onCreate} type="button">Create a task</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#242a33] dark:bg-[#14171c]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            <tr>
              <th className="w-12 px-4 py-4" />
              {columns.map(([key, label]) => (
                <th aria-sort={sortKey === key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'} className="px-3 py-4" key={key}>
                  <button className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white" onClick={() => onSort(key)} type="button">{label}{sortKey === key && <span aria-hidden="true">{sortDir === 1 ? '↑' : '↓'}</span>}</button>
                </th>
              ))}
              <th className="w-24 px-3 py-4"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-[#242a33] dark:border-[#242a33]">
            {tasks.map((task) => {
              const children = subtasks.filter((subtask) => subtask.parent === task.id);
              const completed = children.filter((subtask) => subtask.done).length;
              const overdue = isOverdue(task);
              const finished = isFinished(task.status);
              const stop = (event) => event.stopPropagation();
              return (
                <tr className="cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-[#181c22]" key={task.id} onClick={() => onOpen(task)}>
                  <td className="px-4 py-3" onClick={stop}>
                    <input aria-label={`Mark ${task.title} ${finished ? 'not done' : 'done'}`} checked={finished} className="size-5 rounded accent-[#86bc25]" disabled={!canWrite} onChange={() => onStatus(task, finished ? 'todo' : 'done')} type="checkbox" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-500">{taskNumber(task)}</td>
                  <td className="max-w-[320px] px-3 py-3">
                    <p className={`truncate text-base font-semibold text-slate-900 dark:text-slate-100 ${finished ? 'line-through decoration-slate-300 dark:decoration-slate-600' : ''}`}>{task.title}</p>
                    {children.length > 0 && <p className="mt-0.5 text-xs text-slate-400">{completed}/{children.length} subtasks</p>}
                  </td>
                  <td className="px-3 py-3 text-base text-slate-800 dark:text-slate-200">{task.ws || '—'}</td>
                  <td className="px-3 py-3 text-base text-slate-800 dark:text-slate-200">{task.owner || <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-3 py-3 text-base text-slate-400">{task.watcher || 'No watcher'}</td>
                  <td className="px-3 py-3" onClick={stop}>
                    <span className="inline-flex items-center gap-2">
                      <input aria-label={`Due time for ${task.title}`} className={`w-[104px] bg-transparent text-base ${overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'} [&::-webkit-calendar-picker-indicator]:hidden`} disabled={!canWrite} onChange={(event) => onPatch(task, { due: event.target.value })} type="time" value={task.due || ''} />
                      <Icon className="size-4 text-slate-500" name="clock" />
                    </span>
                    {showDate && <p className="text-xs text-slate-400">{formatDate(task.day)}</p>}
                  </td>
                  <td className="px-3 py-3"><span className={`text-base ${task.priority === 'high' ? 'text-red-600 dark:text-red-400' : task.priority === 'med' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{priorityText[task.priority] || task.priority}</span></td>
                  <td className="px-3 py-3" onClick={stop}>
                    {canWrite
                      ? <label className="relative inline-flex items-center"><span className={`pointer-events-none absolute left-0 size-2.5 rounded-full ${dot[task.status] || dot.todo}`} /><select aria-label={`Status for ${task.title}`} className="cursor-pointer appearance-none bg-transparent py-1 pl-5 pr-2 text-base text-slate-800 dark:text-slate-200" onChange={(event) => onStatus(task, event.target.value)} value={task.status}>{STATUSES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
                      : <StatusBadge status={task.status} />}
                  </td>
                  <td className="px-3 py-3" onClick={stop}>
                    <span className="flex items-center justify-end gap-2 text-slate-400">
                      <button aria-label={`Open ${task.title}`} className="grid size-8 place-items-center rounded-md hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-[#242a33] dark:hover:text-white" onClick={() => onOpen(task)} type="button"><Icon name="notes" /></button>
                      {canWrite && <button aria-label={`Delete ${task.title}`} className="grid size-8 place-items-center rounded-md hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" onClick={() => onDelete(task)} type="button"><Icon name="trash" /></button>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
