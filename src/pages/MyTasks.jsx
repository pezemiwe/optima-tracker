import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import Shell from '../components/Shell.jsx';
import { Checkbox, DueBadge } from '../components/TaskBits.jsx';
import { EmptyState, PriorityIcon, Spinner, useToast } from '../components/ui.jsx';
import { toISODate } from '../lib/dates.mjs';
import { useQueryParam, useRoute } from '../router.jsx';
import { useWorkspace } from '../state/workspace.jsx';

const SECTIONS = [
  ['overdue', 'Overdue', (t, today) => !t.done && t.dueDate && t.dueDate < today],
  ['today', 'Today', (t, today) => !t.done && t.dueDate === today],
  ['upcoming', 'Upcoming', (t, today) => !t.done && t.dueDate && t.dueDate > today],
  ['none', 'No due date', (t) => !t.done && !t.dueDate],
  ['done', 'Completed this week', (t) => t.done],
];

function MyTasksBody() {
  const { workspace, rev, sync } = useWorkspace();
  const { navigate } = useRoute();
  const toast = useToast();
  const [showAll] = useQueryParam('all');
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const bundles = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    api.get(`/workspaces/${workspace.id}/my-tasks${showAll ? '?all=1' : ''}`)
      .then((r) => { if (!cancelled) { setTasks(r.tasks.map((t) => ({ ...t, done: t.statusCategory === 'done' }))); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [workspace.id, rev, showAll]);

  const grouped = useMemo(() => {
    const today = toISODate();
    return SECTIONS.map(([id, label, test]) => ({ id, label, items: (tasks || []).filter((t) => test(t, today)) })).filter((g) => g.items.length);
  }, [tasks]);

  async function toggle(task) {
    try {
      if (!bundles.current.has(task.projectId)) bundles.current.set(task.projectId, (await api.get(`/projects/${task.projectId}`)).statuses);
      const statuses = bundles.current.get(task.projectId);
      const target = task.done ? statuses.find((s) => s.category === 'todo') || statuses[0] : statuses.find((s) => s.category === 'done');
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
      await api.patch(`/tasks/${task.id}`, { statusId: target.id });
      await sync();
    } catch (e) { toast.error(e.message); sync().catch(() => {}); }
  }

  if (error && !tasks) return <EmptyState icon="warning" title="Could not load your tasks">{error}</EmptyState>;
  if (!tasks) return <div className="grid place-items-center py-24"><Spinner className="size-7" /></div>;
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">My tasks</h1>
        <button aria-pressed={Boolean(showAll)} className="btn" onClick={() => navigate(`/w/${workspace.slug}/my-tasks${showAll ? '' : '?all=1'}`)} type="button">{showAll ? 'Hide old completed' : 'Show all completed'}</button>
      </div>
      <p className="muted mt-1 text-sm">Everything assigned to you, across all projects.</p>
      {!grouped.length ? (
        <div className="surface mt-6"><EmptyState icon="checkCircle" title="Nothing assigned to you">When someone assigns you a task, or you assign one to yourself, it shows up here.</EmptyState></div>
      ) : grouped.map((g) => (
        <section aria-label={g.label} className="mt-6" key={g.id}>
          <h2 className={`mb-2 text-sm font-semibold ${g.id === 'overdue' ? 'text-red-600 dark:text-red-400' : ''}`}>{g.label} <span className="faint font-normal">{g.items.length}</span></h2>
          <div className="surface divide-y divide-line overflow-hidden">
            {g.items.map((t) => (
              <div className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-[#181c22]" key={t.id} onClick={() => navigate(`/w/${workspace.slug}/p/${t.projectKey}/list?task=${t.number}`)} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/w/${workspace.slug}/p/${t.projectKey}/list?task=${t.number}`); }}>
                <Checkbox checked={t.done} label={t.done ? 'Mark as not done' : 'Mark as done'} onChange={() => toggle(t)} />
                <span className="faint hidden w-20 font-mono text-xs sm:block">{t.projectKey}-{t.number}</span>
                <span className={`min-w-0 flex-1 truncate font-medium ${t.done ? 'faint line-through' : ''}`}>{t.title}</span>
                <span className="hidden items-center gap-1.5 text-xs md:flex"><span className="size-2 rounded-sm" style={{ background: t.projectColor }} /><span className="muted max-w-32 truncate">{t.projectName}</span></span>
                <span className="hidden w-28 truncate text-xs muted lg:block">{t.statusName}</span>
                <DueBadge done={t.done} task={t} />
                <PriorityIcon value={t.priority} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function MyTasks() {
  return <Shell crumbs={[{ label: 'My tasks' }]}><MyTasksBody /></Shell>;
}
