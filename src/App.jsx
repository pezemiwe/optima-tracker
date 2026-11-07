import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, collectionApi } from './api.js';
import DashboardHeader from './components/DashboardHeader.jsx';
import Icon from './components/Icon.jsx';
import KanbanBoard from './components/KanbanBoard.jsx';
import Notifications from './components/Notifications.jsx';
import Overview from './components/Overview.jsx';
import Sidebar from './components/Sidebar.jsx';
import TaskDialog from './components/TaskDialog.jsx';
import TaskTable from './components/TaskTable.jsx';
import { isFinished, isOverdue, TEAM, toDateInput } from './utils.js';

const STATUS_OPTIONS = [['all', 'All statuses'], ['open', 'Not done'], ['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done'], ['merged', 'Merged'], ['closed', 'Closed']];

function storedValue(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function initialTheme() {
  const saved = storedValue('optima-theme', '');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [syncStatus, setSyncStatus] = useState('Connecting');
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState(initialTheme);
  const [date, setDate] = useState(() => storedValue('optima-day', toDateInput()));
  const [allDays, setAllDays] = useState(false);
  const [workstream, setWorkstream] = useState('all');
  const [owner, setOwner] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('default');
  const [sortDir, setSortDir] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState(() => storedValue('optima-view', 'list') === 'board' ? 'board' : 'list');
  const [selectedTask, setSelectedTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => storedValue('optima-sidebar', '') === 'collapsed');
  const revision = useRef(null);
  const syncing = useRef(false);
  const syncFailures = useRef(0);

  const refresh = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const suffix = revision.current === null ? '' : `?since=${revision.current}`;
      const result = await apiRequest(`/api/sync${suffix}`);
      syncFailures.current = 0;
      setSyncStatus('Live');
      if (!result.unchanged) {
        revision.current = result.rev;
        setTasks(result.tasks.map(({ id, data }) => ({ id, ...data, status: data.status === 'blocked' ? 'doing' : data.status })));
        setSubtasks(result.subtasks.map(({ id, data }) => ({ id, ...data })));
      }
    } catch (error) {
      syncFailures.current += 1;
      setSyncStatus('Reconnecting');
      if (syncFailures.current === 2) setNotice(error.message);
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, 4000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('optima-theme', theme); } catch { /* storage is optional */ }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('optima-day', date);
      localStorage.setItem('optima-view', view);
      localStorage.setItem('optima-sidebar', collapsed ? 'collapsed' : 'open');
    } catch { /* storage is optional */ }
  }, [date, view, collapsed]);

  const canWrite = true;
  const overdue = useMemo(() => tasks.filter((task) => isOverdue(task)), [tasks]);
  const visibleTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!allDays && task.day !== date) return false;
      if (workstream !== 'all' && task.ws !== workstream) return false;
      if (owner === '__none' ? Boolean(task.owner) : owner !== 'all' && task.owner !== owner) return false;
      if (statusFilter === 'open' && isFinished(task.status)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'open' && task.status !== statusFilter) return false;
      if (needle && ![task.title, task.owner, task.watcher, task.note, task.ws, String(task.n)].some((value) => String(value || '').toLowerCase().includes(needle))) return false;
      return true;
    }).sort((a, b) => {
      if (sortKey !== 'default') {
        const priority = { high: 0, med: 1, low: 2 };
        const status = { doing: 0, todo: 1, done: 2, merged: 3, closed: 4 };
        let comparison = 0;
        if (sortKey === 'n') comparison = (a.n || 0) - (b.n || 0);
        else if (sortKey === 'priority') comparison = (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1);
        else if (sortKey === 'status') comparison = (status[a.status] ?? 0) - (status[b.status] ?? 0);
        else if (sortKey === 'due') comparison = (a.due || '99:99').localeCompare(b.due || '99:99');
        else comparison = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''));
        return (comparison || (a.n || 0) - (b.n || 0)) * sortDir;
      }
      const unfinished = Number(isFinished(a.status)) - Number(isFinished(b.status));
      const priority = { high: 0, med: 1, low: 2 };
      return unfinished || (priority[a.priority] ?? 1) - (priority[b.priority] ?? 1) || (a.n || 0) - (b.n || 0);
    });
  }, [tasks, allDays, date, workstream, owner, statusFilter, search, sortKey, sortDir]);

  async function saveTask(values, { subtasks: extraSubtasks = [], keepOpen = false } = {}) {
    if (!canWrite) return;
    setSaving(true);
    try {
      if (selectedTask?.id) {
        const changes = { ...values, updatedAt: Date.now() };
        if (values.status !== selectedTask.status) changes.doneAt = isFinished(values.status) ? (selectedTask.doneAt || Date.now()) : null;
        await collectionApi('tasks').update(selectedTask.id, changes);
      } else {
        const now = Date.now();
        const created = await collectionApi('tasks').create({ ...values, createdAt: now, doneAt: isFinished(values.status) ? now : null });
        for (const title of extraSubtasks) {
          await collectionApi('subtasks').create({ parent: created.id, title, done: false, owner: '', createdAt: Date.now() });
        }
      }
      await refresh();
      if (!keepOpen) setSelectedTask(null);
      setNotice('');
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(task, changes) {
    if (!canWrite) return;
    const payload = { ...changes, updatedAt: Date.now() };
    if (changes.status && changes.status !== task.status) payload.doneAt = isFinished(changes.status) ? (task.doneAt || Date.now()) : null;
    await collectionApi('tasks').update(task.id, payload);
    await refresh();
  }

  async function deleteTask(task = selectedTask) {
    if (!task?.id || !window.confirm(`Delete "${task.title}" and all its subtasks?`)) return;
    try {
      await collectionApi('tasks').remove(task.id);
      await refresh();
      if (selectedTask?.id === task.id) setSelectedTask(null);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function addSubtask(title) {
    if (!selectedTask?.id || !canWrite) return;
    try {
      await collectionApi('subtasks').create({ parent: selectedTask.id, title, done: false, owner: '', createdAt: Date.now() });
      await refresh();
    } catch (error) {
      setNotice(error.message);
      throw error;
    }
  }

  async function updateSubtask(subtask, changes) {
    if (!canWrite) return;
    try {
      await collectionApi('subtasks').update(subtask.id, changes);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteSubtask(subtask) {
    if (!canWrite || !window.confirm(`Delete subtask "${subtask.title}"?`)) return;
    try {
      await collectionApi('subtasks').remove(subtask.id);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function changeStatus(task, status) {
    await patchTask(task, { status });
  }

  async function patchTask(task, changes) {
    try {
      await updateTask(task, changes);
    } catch (error) {
      setNotice(error.message);
    }
  }

  const unfinishedElsewhere = useMemo(() => tasks.filter((task) => task.day !== date && !isFinished(task.status)), [tasks, date]);

  async function bringUnfinished() {
    const count = unfinishedElsewhere.length;
    if (!canWrite || !count || !window.confirm(`Move ${count} unfinished ${count === 1 ? 'task' : 'tasks'} to ${date}?`)) return;
    try {
      await Promise.all(unfinishedElsewhere.map((task) => collectionApi('tasks').update(task.id, { day: date, updatedAt: Date.now() })));
      setAllDays(false);
    } catch (error) {
      setNotice(error.message);
    }
    await refresh();
  }

  function sortTasks(key) {
    if (sortKey === key) setSortDir((direction) => direction * -1);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  async function exportWorkbook() {
    if (!window.XLSX) {
      setNotice('The spreadsheet export library did not load. Reload the page and try again.');
      return;
    }
    const xlsx = window.XLSX;
    const workbook = xlsx.utils.book_new();
    const taskRows = tasks.map(({ id, ...task }) => ({
      ID: `T-${String(task.n || 0).padStart(3, '0')}`,
      Title: task.title,
      Workstream: task.ws,
      Owner: task.owner,
      Watcher: task.watcher,
      Date: task.day,
      Time: task.due,
      Priority: task.priority,
      Status: task.status,
      Notes: task.note,
    }));
    const summaryRows = [
      { Metric: 'Total tasks', Value: tasks.length },
      { Metric: 'To do', Value: tasks.filter((task) => task.status === 'todo').length },
      { Metric: 'In progress', Value: tasks.filter((task) => task.status === 'doing').length },
      { Metric: 'Completed', Value: tasks.filter((task) => isFinished(task.status)).length },
      { Metric: 'Overdue', Value: overdue.length },
    ];
    const subtaskRows = subtasks.map((subtask) => ({
      Task: tasks.find((task) => task.id === subtask.parent)?.title || subtask.parent,
      Subtask: subtask.title,
      Owner: subtask.owner,
      Done: subtask.done ? 'Yes' : 'No',
    }));
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(taskRows), 'Tasks');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(summaryRows), 'Summary');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(subtaskRows), 'Subtasks');
    xlsx.writeFile(workbook, 'optima-closeout.xlsx');
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key.toLowerCase() === 'n' && canWrite) {
        event.preventDefault();
        setSelectedTask({ status: 'todo' });
      } else if (event.key === '/') {
        event.preventDefault();
        document.querySelector('input[aria-label="Search tasks"]')?.focus();
      } else if (event.key === '[') {
        if (window.matchMedia?.('(min-width: 1024px)').matches) setCollapsed((value) => !value);
        else setMobileMenuOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canWrite]);

  const renderSidebar = (isCollapsed, onCollapse) => (
    <Sidebar
      collapsed={isCollapsed}
      onCollapse={onCollapse}
      onOwner={(value) => { setOwner(value); setMobileMenuOpen(false); }}
      onTheme={setTheme}
      onWorkstream={(value) => { setWorkstream(value); setMobileMenuOpen(false); }}
      owner={owner}
      tasks={tasks}
      theme={theme}
      workstream={workstream}
    />
  );
  const people = useMemo(() => [...new Set([...TEAM, ...tasks.map((task) => task.owner).filter(Boolean)])], [tasks]);
  const dayCount = new Set(tasks.map((task) => task.day).filter(Boolean)).size;

  return (
    <div className={`min-h-screen bg-[#f4f5f7] text-slate-900 dark:bg-[#0c0e11] dark:text-slate-100 lg:grid ${collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[330px_minmax(0,1fr)]'}`}>
      <div className="hidden h-screen lg:sticky lg:top-0 lg:block">{renderSidebar(collapsed, () => setCollapsed((value) => !value))}</div>
      {mobileMenuOpen && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)} type="button" /><div className="relative h-full w-[300px]">{renderSidebar(false)}</div></div>}
      <main className="min-w-0">
        <DashboardHeader
          allDays={allDays}
          canWrite={canWrite}
          day={date}
          onAllDays={() => setAllDays((current) => !current)}
          onCreate={() => setSelectedTask({ status: 'todo' })}
          onDayChange={(value) => { setDate(value); setAllDays(false); }}
          onExport={exportWorkbook}
          onMenu={() => setMobileMenuOpen(true)}
          onNotifications={() => setNotificationsOpen((open) => !open)}
          onToday={() => { setDate(toDateInput()); setAllDays(false); }}
          overdue={overdue}
          showNotifications={notificationsOpen}
        />
        <div className="grid gap-5 px-5 py-6 lg:px-8">
          {notice && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100" role="status"><Icon className="mt-0.5 size-4 shrink-0" name="warning" /><span className="flex-1">{notice}</span><button aria-label="Dismiss message" className="text-amber-700 dark:text-amber-300" onClick={() => setNotice('')} type="button"><Icon className="size-4" name="close" /></button></div>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 dark:border-[#242a33]">
            <div className="flex" role="tablist" aria-label="View">
              {[['list', 'List', 'list'], ['board', 'Board', 'board']].map(([key, label, icon]) => (
                <button aria-selected={view === key} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-base font-medium ${view === key ? 'border-[#86bc25] text-slate-950 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`} key={key} onClick={() => setView(key)} role="tab" type="button"><Icon className="size-4" name={icon} />{label}</button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3 pb-2">
              {canWrite && !allDays && unfinishedElsewhere.length > 0 && <button className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-200 dark:hover:bg-[#1b2028]" onClick={bringUnfinished} type="button">Bring {unfinishedElsewhere.length} unfinished here</button>}
              <label className="relative">
                <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" name="search" />
                <input aria-label="Search tasks" className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-800 placeholder:text-slate-400 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-100 sm:w-80" onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, owners, notes" value={search} />
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 px-1.5 text-xs text-slate-400 dark:border-[#343b47]">/</kbd>
              </label>
              <select aria-label="Filter by status" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-200" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <span className="whitespace-nowrap text-sm text-slate-400">{visibleTasks.length} of {tasks.length} shown</span>
            </div>
          </div>
          {(workstream !== 'all' || owner !== 'all') && (
            <div className="flex flex-wrap gap-2">
              {workstream !== 'all' && <button aria-label={`Clear workstream filter ${workstream}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-400" onClick={() => setWorkstream('all')} type="button">Workstream: <b className="font-semibold text-slate-900 dark:text-slate-100">{workstream}</b> <span aria-hidden="true">×</span></button>}
              {owner !== 'all' && <button aria-label="Clear owner filter" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 dark:border-[#343b47] dark:bg-[#14171c] dark:text-slate-400" onClick={() => setOwner('all')} type="button">Owner: <b className="font-semibold text-slate-900 dark:text-slate-100">{owner === '__none' ? 'Unassigned' : owner}</b> <span aria-hidden="true">×</span></button>}
            </div>
          )}
          <Overview tasks={visibleTasks} />
          {view === 'list'
            ? <TaskTable canWrite={canWrite} onDelete={deleteTask} onPatch={patchTask} showDate={allDays} onCreate={() => setSelectedTask({ status: 'todo' })} onOpen={setSelectedTask} onSort={sortTasks} onStatus={changeStatus} sortDir={sortDir} sortKey={sortKey} subtasks={subtasks} tasks={visibleTasks} />
            : <KanbanBoard canWrite={canWrite} onCreate={(status) => setSelectedTask({ status })} onOpen={setSelectedTask} onStatus={(taskOrId, status) => {
              const task = typeof taskOrId === 'string' ? tasks.find((item) => item.id === taskOrId) : taskOrId;
              if (task) changeStatus(task, status);
            }} subtasks={subtasks} tasks={visibleTasks} />}
          <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${syncStatus === 'Live' ? 'bg-[#86bc25]' : syncStatus === 'Disconnected' ? 'bg-red-500' : 'bg-amber-400'}`} />{syncStatus}</span>
            <span>Export covers all {tasks.length} tasks across {dayCount} {dayCount === 1 ? 'day' : 'days'}.</span>
            <span>Shortcuts: <b className="text-slate-700 dark:text-slate-200">N</b> new task, <b className="text-slate-700 dark:text-slate-200">/</b> search, <b className="text-slate-700 dark:text-slate-200">[</b> sidebar</span>
          </footer>
        </div>
      </main>
      {notificationsOpen && <div className="fixed right-5 top-[62px] z-30 lg:right-8"><Notifications canWrite={canWrite} onClose={() => setNotificationsOpen(false)} onOpen={(task) => { setSelectedTask(task); setNotificationsOpen(false); }} onPatch={patchTask} tasks={overdue} /></div>}
      {selectedTask && <TaskDialog
        canWrite={canWrite}
        people={people}
        onAddSubtask={addSubtask}
        onClose={() => setSelectedTask(null)}
        onDelete={deleteTask}
        onDeleteSubtask={deleteSubtask}
        onSave={saveTask}
        onUpdateSubtask={updateSubtask}
        saving={saving}
        subtasks={subtasks.filter((subtask) => subtask.parent === selectedTask.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))}
        task={selectedTask}
      />}
    </div>
  );
}
