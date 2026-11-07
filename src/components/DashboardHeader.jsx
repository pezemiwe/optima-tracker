import Icon from './Icon.jsx';
import { formatDate, shiftDate, toDateInput } from '../utils.js';

const outline = 'inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-200 dark:hover:bg-[#1b2028]';

export default function DashboardHeader({
  day, allDays, onDayChange, onAllDays, onCreate, onExport, canWrite, overdue,
  onNotifications, showNotifications, onMenu, onToday,
}) {
  const isToday = day === toDateInput();
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-[#f4f5f7]/95 px-5 py-4 backdrop-blur dark:border-[#242a33] dark:bg-[#0c0e11]/95 lg:px-8">
      <button aria-label="Open navigation" className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-300 lg:hidden" onClick={onMenu} type="button"><Icon name="menu" /></button>
      <nav aria-label="Breadcrumb" className="mr-auto flex min-w-0 items-center gap-2.5 text-base text-slate-500 dark:text-slate-400">
        <span className="hidden sm:inline">Zenith Optima</span><span className="hidden sm:inline text-slate-300 dark:text-slate-600">/</span>
        <span className="hidden sm:inline">Close-out</span><span className="hidden sm:inline text-slate-300 dark:text-slate-600">/</span>
        <span className="truncate font-semibold text-slate-900 dark:text-slate-100">Daily checklist</span>
      </nav>
      <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-white dark:border-[#343b47] dark:bg-[#14171c]">
        <button aria-label="Previous day" className="grid size-9 place-items-center text-slate-500 hover:text-slate-950 dark:hover:text-white" onClick={() => onDayChange(shiftDate(day, -1))} type="button"><Icon className="size-3.5" name="chevronLeft" /></button>
        <span className="min-w-[96px] whitespace-nowrap px-1 text-center text-sm font-medium text-slate-700 dark:text-slate-200">{allDays ? 'All days' : `${formatDate(day)}${isToday ? ' · Today' : ''}`}</span>
        <button aria-label="Next day" className="grid size-9 place-items-center text-slate-500 hover:text-slate-950 dark:hover:text-white" onClick={() => onDayChange(shiftDate(day, 1))} type="button"><Icon className="size-3.5" name="chevronRight" /></button>
      </div>
      <button className={outline} onClick={onToday} type="button">Today</button>
      <button aria-pressed={allDays} className={`${outline} ${allDays ? '!border-slate-900 !bg-slate-900 !text-white dark:!border-white dark:!bg-white dark:!text-slate-950' : ''}`} onClick={onAllDays} type="button">All days</button>
      <button className={outline} onClick={onExport} type="button"><Icon className="size-4" name="download" /><span className="hidden sm:inline">Export .xlsx</span></button>
      <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#86bc25] px-4 text-sm font-semibold text-slate-950 hover:bg-[#97cf2e] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canWrite} onClick={onCreate} type="button"><Icon className="size-4" name="add" /><span>Task</span></button>
      <button aria-expanded={showNotifications} aria-label={`${overdue.length} overdue tasks`} className="relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-300 dark:hover:bg-[#1b2028]" onClick={onNotifications} type="button">
        <Icon name="bell" />
        {overdue.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{overdue.length}</span>}
      </button>
    </header>
  );
}
