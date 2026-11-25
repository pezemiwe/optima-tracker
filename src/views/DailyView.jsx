import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import { StatusDot, useConfirm, useLocalStorage, useToast } from '../components/ui.jsx';
import { formatShort, shiftDate, toISODate } from '../lib/dates.mjs';
import ListView from './ListView.jsx';

export default function DailyView({ tasks, pd, actions, filters, canWrite, selection, onSelect, onSelectAll, onOpen, activeNumber }) {
  const today = toISODate();
  const [day, setDay] = useLocalStorage(`cortex-day-${pd.summary.id}`, today);
  const confirm = useConfirm();
  const toast = useToast();
  const dayTasks = useMemo(() => tasks.filter((t) => t.dueDate === day && !t.parentId), [tasks, day]);
  const doneCount = dayTasks.filter((t) => pd.statusById.get(t.statusId)?.category === 'done').length;
  const percent = dayTasks.length ? Math.round((doneCount / dayTasks.length) * 100) : 0;
  const carry = useMemo(
    () => pd.tasks.filter((t) => !t.parentId && t.dueDate && t.dueDate < day && pd.statusById.get(t.statusId)?.category !== 'done'),
    [pd.tasks, pd.statusById, day],
  );

  async function bring() {
    const ok = await confirm({
      title: `Move ${carry.length} unfinished ${carry.length === 1 ? 'task' : 'tasks'} here?`,
      message: `Their due date will change to ${formatShort(day)}. You can see the change in each task's activity.`,
      confirmLabel: 'Move here',
    });
    if (!ok) return;
    try {
      await actions.bulk(carry.map((t) => t.id), { dueDate: day });
      toast.success(`Moved ${carry.length} ${carry.length === 1 ? 'task' : 'tasks'} to ${formatShort(day)}`);
    } catch { /* toast shown */ }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white dark:border-[#343b47] dark:bg-[#14171c]">
          <button aria-label="Previous day" className="icon-btn" onClick={() => setDay(shiftDate(day, -1))} type="button"><Icon className="size-3.5" name="chevronLeft" /></button>
          <span className="min-w-[8.5rem] px-1 text-center text-sm font-medium">{formatShort(day)}{day === today ? ' · Today' : ''}</span>
          <button aria-label="Next day" className="icon-btn" onClick={() => setDay(shiftDate(day, 1))} type="button"><Icon className="size-3.5" name="chevronRight" /></button>
        </div>
        <button className="btn" onClick={() => setDay(today)} type="button">Today</button>
        <input aria-label="Pick a date" className="input w-40" onChange={(e) => e.target.value && setDay(e.target.value)} type="date" value={day} />
        {canWrite && carry.length > 0 && !pd.project?.archived && <button className="btn ml-auto" onClick={bring} type="button"><Icon className="size-4" name="download" />Bring {carry.length} unfinished here</button>}
      </div>

      <section aria-label="Day summary" className="surface overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line md:grid-cols-[1.2fr_repeat(var(--n),1fr)]" style={{ '--n': pd.statuses.length }}>
          <div className="col-span-2 px-5 py-4 md:col-span-1">
            <p className="muted text-sm font-medium">Completed</p>
            <p className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight">{doneCount} / {dayTasks.length}</span><span className="faint text-sm">{percent}%</span></p>
          </div>
          {pd.statuses.map((s) => (
            <div className="px-5 py-4" key={s.id}>
              <p className="muted flex items-center gap-2 text-sm font-medium"><StatusDot color={s.color} />{s.name}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{dayTasks.filter((t) => t.statusId === s.id).length}</p>
            </div>
          ))}
        </div>
        <div aria-label="Tasks completed today" aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="h-1.5 bg-slate-200 dark:bg-[#242a33]" role="progressbar"><div className="h-full bg-[#86bc25] transition-all" style={{ width: `${percent}%` }} /></div>
      </section>

      <ListView
        actions={actions}
        activeNumber={activeNumber}
        canWrite={canWrite}
        emptyHint="Nothing is due on this day."
        filters={{ ...filters, groupBy: 'status' }}
        onOpen={onOpen}
        onSelect={onSelect}
        onSelectAll={onSelectAll}
        pd={pd}
        quickDefaults={{ dueDate: day }}
        selection={selection}
        tasks={dayTasks}
      />
    </div>
  );
}
