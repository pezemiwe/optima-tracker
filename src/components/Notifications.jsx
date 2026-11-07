import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { Avatar, Popover, Spinner } from './ui.jsx';
import { timeAgo } from '../lib/dates.mjs';
import { useRoute } from '../router.jsx';
import { useWorkspace } from '../state/workspace.jsx';

const TYPE_ICON = { assigned: 'user', mentioned: 'comment', comment: 'comment', status: 'checkCircle', invite: 'users' };

export function notificationPath(ws, n) {
  return n.projectKey && n.taskNumber ? `/w/${ws.slug}/p/${n.projectKey}/list?task=${n.taskNumber}` : `/w/${ws.slug}/settings?tab=members`;
}

export function NotificationItem({ n, onOpen }) {
  const unread = !n.readAt;
  return (
    <button className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-[#1b2028] ${unread ? 'bg-[#86bc25]/5' : ''}`} onClick={() => onOpen(n)} type="button">
      <span className="relative mt-0.5">
        <Avatar size={28} user={n.actorName ? { name: n.actorName, color: n.actorColor } : { name: 'System', color: '#64748b' }} />
        <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-[#14171c] dark:ring-[#343b47]"><Icon className="size-2.5" name={TYPE_ICON[n.type] || 'bell'} /></span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${unread ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{n.body}</span>
        <span className="faint mt-0.5 block text-xs">{timeAgo(n.createdAt)}</span>
      </span>
      {unread && <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-[#86bc25]" />}
    </button>
  );
}

/* Shared by the bell menu and the Inbox page. */
export function useNotifications(limit = 50, active = true) {
  const { workspace, setUnread, rev } = useWorkspace();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/notifications?workspaceId=${workspace.id}&limit=${limit}`);
      setItems(r.notifications);
      setUnread(r.unread);
      setError('');
    } catch (e) { setError(e.message); }
  }, [workspace.id, limit, setUnread]);

  useEffect(() => { if (active) load(); }, [active, load, rev]);

  const markRead = useCallback(async (ids) => {
    setItems((list) => list && list.map((n) => (ids.includes(n.id) ? { ...n, readAt: n.readAt || new Date().toISOString() } : n)));
    try { await api.post('/notifications/read', { workspaceId: workspace.id, ids }); await load(); } catch { /* next poll corrects it */ }
  }, [workspace.id, load]);

  const markAll = useCallback(async () => {
    setItems((list) => list && list.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    try { await api.post('/notifications/read', { workspaceId: workspace.id, all: true }); await load(); } catch { /* next poll corrects it */ }
  }, [workspace.id, load]);

  return { items, error, markRead, markAll, reload: load };
}

function BellPanel({ close }) {
  const { workspace } = useWorkspace();
  const { navigate } = useRoute();
  const { items, error, markRead, markAll } = useNotifications(10);
  const open = (n) => { close(); if (!n.readAt) markRead([n.id]); navigate(notificationPath(workspace, n)); };
  return (
    <div className="-m-1 w-[22rem] max-w-[calc(100vw-1rem)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="font-semibold">Notifications</p>
        <button className="text-xs font-medium text-[#4a7a0a] hover:underline dark:text-[#a6d95a]" onClick={markAll} type="button">Mark all read</button>
      </div>
      <div className="max-h-96 divide-y divide-line overflow-y-auto">
        {!items && !error && <div className="grid place-items-center py-8"><Spinner /></div>}
        {error && <p className="px-4 py-6 text-sm text-red-600">{error}</p>}
        {items && !items.length && <p className="muted px-4 py-8 text-center text-sm">You are all caught up.</p>}
        {items && items.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} />)}
      </div>
      <button className="w-full border-t border-line px-4 py-2.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#1b2028]" onClick={() => { close(); navigate(`/w/${workspace.slug}/inbox`); }} type="button">Open inbox</button>
    </div>
  );
}

export function BellButton() {
  const { unread } = useWorkspace();
  return (
    <Popover align="right" className="!p-0" trigger={(p) => (
      <button {...p} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="icon-btn relative size-9 border border-slate-200 bg-white dark:border-[#343b47] dark:bg-[#14171c]" type="button">
        <Icon name="bell" />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
    )}
    >
      {(close) => <BellPanel close={close} />}
    </Popover>
  );
}
