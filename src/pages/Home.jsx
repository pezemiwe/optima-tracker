import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import Shell from '../components/Shell.jsx';
import { Avatar, EmptyState, KeyBadge, Spinner } from '../components/ui.jsx';
import { useShell } from '../components/shellContext.js';
import { describeActivity } from '../lib/activity.mjs';
import { timeAgo } from '../lib/dates.mjs';
import { Link } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useWorkspace } from '../state/workspace.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Stat({ label, value, tone, to, icon }) {
  return (
    <Link className="surface group block p-4 transition hover:border-slate-300 dark:hover:border-[#414957]" to={to}>
      <div className="flex items-center justify-between"><span className="muted text-sm font-medium">{label}</span><Icon className={`size-4 ${tone}`} name={icon} /></div>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </Link>
  );
}

function HomeBody() {
  const { workspace, rev, canWrite } = useWorkspace();
  const { user } = useAuth();
  const { openNewProject } = useShell();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/workspaces/${workspace.id}/overview`), api.get(`/workspaces/${workspace.id}/activity?limit=15`)])
      .then(([o, a]) => { if (!cancelled) { setData(o); setActivity(a.activity); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [workspace.id, rev]);

  const base = `/w/${workspace.slug}`;
  if (error && !data) return <EmptyState icon="warning" title="Could not load the overview">{error}</EmptyState>;
  if (!data) return <div className="grid place-items-center py-24"><Spinner className="size-7" /></div>;

  const live = data.projects.filter((p) => !p.archived);
  const maxLoad = Math.max(1, ...data.workload.map((w) => w.open));
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-8 lg:px-8">
      <h1 className="page-title">{greeting()}, {user.name.split(' ')[0]}</h1>
      <p className="muted mt-1 text-sm">Here is where things stand in {workspace.name}.</p>

      <section aria-label="My work" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="checkCircle" label="My open tasks" to={`${base}/my-tasks`} tone="text-slate-400" value={data.mine.open} />
        <Stat icon="calendar" label="Due today" to={`${base}/my-tasks`} tone="text-amber-500" value={data.mine.dueToday} />
        <Stat icon="warning" label="Overdue" to={`${base}/my-tasks`} tone="text-red-500" value={data.mine.overdue} />
        <Stat icon="check" label="Done this week" to={`${base}/my-tasks?all=1`} tone="text-lime-600" value={data.mine.doneThisWeek} />
      </section>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
          <section aria-label="Projects">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Projects</h2>{canWrite && <button className="btn btn-sm" onClick={openNewProject} type="button"><Icon className="size-3.5" name="add" />New project</button>}</div>
            {!live.length ? (
              <div className="surface"><EmptyState action={canWrite ? <button className="btn btn-primary" onClick={openNewProject} type="button"><Icon className="size-4" name="add" />Create a project</button> : null} icon="folder" title="No projects yet">{canWrite ? 'Projects hold your tasks. Create one to get started.' : 'Ask an admin or member to create a project.'}</EmptyState></div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {live.map((p) => {
                  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                  return (
                    <Link className="surface block p-4 transition hover:border-slate-300 dark:hover:border-[#414957]" key={p.id} to={`${base}/p/${p.key}/list`}>
                      <div className="flex items-center gap-3"><KeyBadge className="!rounded-lg" project={p} size={36} /><div className="min-w-0"><p className="truncate font-semibold">{p.name}</p><p className="faint font-mono text-xs">{p.key}</p></div><span className="ml-auto text-sm font-semibold">{pct}%</span></div>
                      <div aria-label={`${pct}% complete`} className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#242a33]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-[#86bc25]" style={{ width: `${pct}%` }} /></div>
                      <p className="muted mt-3 flex gap-4 text-xs"><span>{p.total} tasks</span><span>{p.active} in progress</span><span className={p.overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>{p.overdue} overdue</span></p>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
          <section aria-label="Team workload">
            <h2 className="mb-3 text-base font-semibold">Team workload</h2>
            <div className="surface divide-y divide-line">
              {data.workload.map((w) => (
                <div className="flex items-center gap-3 px-4 py-2.5" key={w.id}>
                  <Avatar size={26} user={w} /><span className="w-28 shrink-0 truncate text-sm sm:w-40">{w.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-[#242a33]"><div className="h-full rounded-full" style={{ width: `${(w.open / maxLoad) * 100}%`, background: w.color }} /></div>
                  <span className="w-14 shrink-0 text-right text-xs muted sm:w-16">{w.open} open</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section aria-label="Recent activity">
          <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
          <div className="surface divide-y divide-line">
            {activity.map((a) => (
              <div className="flex gap-3 px-4 py-3 text-sm" key={a.id}>
                <Avatar size={26} user={a.actorName ? { name: a.actorName, color: a.actorColor } : null} />
                <div className="min-w-0">
                  <p className="muted"><b className="font-medium text-slate-800 dark:text-slate-200">{a.actorName || 'Someone'}</b> {describeActivity(a)}</p>
                  {a.taskNumber && a.projectKey && <Link className="mt-0.5 block truncate text-xs text-[#3d6208] hover:underline dark:text-[#a6d95a]" to={`${base}/p/${a.projectKey}/list?task=${a.taskNumber}`}>{a.projectKey}-{a.taskNumber} {a.taskTitle}</Link>}
                  <p className="faint mt-0.5 text-xs">{timeAgo(a.createdAt)}</p>
                </div>
              </div>
            ))}
            {!activity.length && <p className="faint px-4 py-8 text-center text-sm">Activity appears here as your team works.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return <Shell crumbs={[{ label: 'Home' }]}><HomeBody /></Shell>;
}
