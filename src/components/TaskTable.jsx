import { formatDate, isOverdue, STATUSES, taskNumber } from '../utils.js';

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
  ['n', 'ID'], ['title', 'Task'], ['ws', 'Workstream'], ['owner', 'Owner'],
  ['due', 'Due'], ['priority', 'Priority'], ['status', 'Status'],
];

export default function TaskTable({ tasks, subtasks, canWrite, onOpen, onStatus, onCreate, onShowAllDates, otherDateTaskCount = 0, sortKey, sortDir, onSort }) {
  if (!tasks.length) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center dark:border-[#343b47] dark:bg-[#14171c]">
        <div>
          <p className="font-medium text-slate-800 dark:text-slate-100">{otherDateTaskCount ? 'No tasks scheduled for this date' : 'No tasks match these filters'}</p>
          <p className="mt-1 text-sm text-slate-500">
            {otherDateTaskCount
              ? `${otherDateTaskCount} matching ${otherDateTaskCount === 1 ? 'task is' : 'tasks are'} scheduled on other dates.`
              : 'Try another date or clear the search.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {otherDateTaskCount > 0 && <button className="rounded-lg bg-[#86bc25] px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-[#97cf2e]" onClick={onShowAllDates} type="button">Show all dates</button>}
            {canWrite && <button className="rounded-lg bg-[#86bc25] px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-[#97cf2e]" onClick={onCreate} type="button">Create a task</button>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#242a33] dark:bg-[#14171c]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-[#181c22] dark:text-slate-400">
            <tr>{columns.map(([key, label]) => (
              <th aria-sort={sortKey === key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none'} className="px-4 py-3" key={key}>
                <button className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white" onClick={() => onSort(key)} type="button">{label}{sortKey === key && <span aria-hidden="true">{sortDir === 1 ? '↑' : '↓'}</span>}</button>
              </th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#242a33]">
            {tasks.map((task) => {
              const children = subtasks.filter((subtask) => subtask.parent === task.id);
              const completed = children.filter((subtask) => subtask.done).length;
              const overdue = isOverdue(task);
              return (
                <tr className="cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-[#181c22]" key={task.id} onClick={() => onOpen(task)}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{taskNumber(task)}</td>
                  <td className="max-w-[360px] px-4 py-3">
                    <p className={`truncate text-sm font-medium text-slate-900 dark:text-slate-100 ${['done', 'merged', 'closed'].includes(task.status) ? 'line-through decoration-slate-300 dark:decoration-slate-600' : ''}`}>{task.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      {task.note && <span className="max-w-56 truncate">{task.note}</span>}
                      {children.length > 0 && <span>{completed}/{children.length} subtasks</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{task.ws || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{task.owner || <span className="text-slate-400">Unassigned</span>}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-xs ${overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>{task.due ? `${formatDate(task.day)} · ${task.due}` : formatDate(task.day)}</td>
                  <td className="px-4 py-3"><span className={`text-xs font-medium ${task.priority === 'high' ? 'text-red-600 dark:text-red-400' : task.priority === 'med' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{task.priority === 'med' ? 'Medium' : task.priority?.[0]?.toUpperCase() + task.priority?.slice(1)}</span></td>
                  <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                    {canWrite ? <select aria-label={`Status for ${task.title}`} className="max-w-32 rounded-md border border-slate-200 bg-transparent px-2 py-1 text-xs dark:border-[#343b47] dark:text-slate-200" onChange={(event) => onStatus(task, event.target.value)} value={task.status}>{STATUSES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select> : <StatusBadge status={task.status} />}
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
