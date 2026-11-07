import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import Shell from '../components/Shell.jsx';
import { NotificationItem, notificationPath, useNotifications } from '../components/Notifications.jsx';
import { EmptyState, Spinner } from '../components/ui.jsx';
import { toISODate } from '../lib/dates.mjs';
import { DueBadge } from '../components/TaskBits.jsx';
import { Link, useRoute } from '../router.jsx';
import { useWorkspace } from '../state/workspace.jsx';

function InboxBody() {
  const { workspace, rev } = useWorkspace();
  const { navigate } = useRoute();
  const { items, error, markRead, markAll } = useNotifications(100);
  const [mine, setMine] = useState([]);

  // Reminders are computed from your tasks, so they are always current.
  useEffect(() => {
    api.get(`/workspaces/${workspace.id}/my-tasks`).then((r) => setMine(r.tasks.filter((t) => t.statusCategory !== 'done'))).catch(() => {});
  }, [workspace.id, rev]);
  const today = toISODate();
  const reminders = mine.filter((t) => t.dueDate && t.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const unread = items ? items.filter((n) => !n.readAt).length : 0;

  const open = (n) => { if (!n.readAt) markRead([n.id]); navigate(notificationPath(workspace, n)); };
  return (
    <div className="mx-auto max-w-[860px] px-4 py-8 lg:px-8">
      <div className="flex items-center gap-3">
        <h1 className="page-title mr-auto">Inbox</h1>
        <button className="btn" disabled={!unread} onClick={markAll} type="button"><Icon className="size-4" name="check" />Mark all read</button>
      </div>

      {reminders.length > 0 && (
        <section aria-label="Reminders" className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Needs attention <span className="faint font-normal">{reminders.length}</span></h2>
          <div className="surface divide-y divide-line overflow-hidden">
            {reminders.map((t) => (
              <Link className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-[#181c22]" key={t.id} to={`/w/${workspace.slug}/p/${t.projectKey}/list?task=${t.number}`}>
                <Icon className={`size-4 ${t.dueDate < today ? 'text-red-500' : 'text-amber-500'}`} name={t.dueDate < today ? 'warning' : 'clock'} />
                <span className="faint font-mono text-xs">{t.projectKey}-{t.number}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <DueBadge task={t} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Notifications" className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Notifications {unread > 0 && <span className="faint font-normal">{unread} unread</span>}</h2>
        <div className="surface divide-y divide-line overflow-hidden">
          {!items && !error && <div className="grid place-items-center py-10"><Spinner /></div>}
          {error && <p className="px-4 py-6 text-sm text-red-600">{error}</p>}
          {items && !items.length && <EmptyState icon="inbox" title="No notifications yet">You will be notified when you are assigned a task, mentioned, or when a task you watch changes.</EmptyState>}
          {items && items.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} />)}
        </div>
      </section>
    </div>
  );
}

export default function Inbox() {
  return <Shell crumbs={[{ label: 'Inbox' }]}><InboxBody /></Shell>;
}
