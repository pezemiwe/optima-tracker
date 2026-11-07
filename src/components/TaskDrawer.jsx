import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import MentionTextarea from './MentionTextarea.jsx';
import { Checkbox, DateField, LabelSelect, PrioritySelect, StatusSelect } from './TaskBits.jsx';
import { Avatar, LabelChip, Popover, Spinner, UserSelect, useConfirm, useEscape, useToast } from './ui.jsx';
import { describeActivity, mentionedIds, splitMentions } from '../lib/activity.mjs';
import { formatDuration, formatDay, parseDuration, timeAgo } from '../lib/dates.mjs';
import { useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useWorkspace } from '../state/workspace.jsx';

function Prop({ label, children }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 py-1.5">
      <span className="muted text-xs font-medium">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CommentBody({ body, members }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 dark:text-slate-200">
      {splitMentions(body, members).map((p, i) => (p.mention
        ? <span className="rounded bg-[#86bc25]/20 px-0.5 font-medium text-[#3d6208] dark:text-[#a6d95a]" key={i}>{p.text}</span>
        : <span key={i}>{p.text}</span>))}
    </p>
  );
}

function Comment({ c, me, members, canAdmin, canWrite, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const mine = c.authorId === me.id;
  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await onEdit(c, text.trim()); setEditing(false); } finally { setBusy(false); }
  }
  return (
    <li className="flex gap-3" id={`comment-${c.id}`}>
      <Avatar size={30} user={{ name: c.authorName || 'Deleted user', color: c.authorColor }} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-2 text-sm"><span className="font-semibold">{c.authorName || 'Deleted user'}</span><span className="faint text-xs" title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}{c.editedAt ? ' · edited' : ''}</span></p>
        {editing ? (
          <div className="mt-1">
            <MentionTextarea members={members} onChange={setText} onSubmit={save} value={text} />
            <div className="mt-2 flex gap-2"><button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={save} type="button">Save</button><button className="btn btn-sm" onClick={() => { setEditing(false); setText(c.body); }} type="button">Cancel</button></div>
          </div>
        ) : <div className="mt-0.5"><CommentBody body={c.body} members={members} /></div>}
        {!editing && canWrite && (mine || canAdmin) && (
          <p className="mt-1 flex gap-3 text-xs">
            {mine && <button className="faint hover:text-slate-900 dark:hover:text-white" onClick={() => setEditing(true)} type="button">Edit</button>}
            <button className="faint hover:text-red-600" onClick={() => onDelete(c)} type="button">Delete</button>
          </p>
        )}
      </div>
    </li>
  );
}

export default function TaskDrawer({ pd, actions, number, onClose, canWrite: canWriteProp }) {
  const { user } = useAuth();
  const { members, memberById, isAdmin, rev, workspace } = useWorkspace();
  const { navigate, path } = useRoute();
  const toast = useToast();
  const confirm = useConfirm();
  const base = useMemo(() => pd.taskByNumber.get(number), [pd.taskByNumber, number]);
  const taskId = base?.id;
  const canWrite = canWriteProp && !pd.project?.archived;

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [descDirty, setDescDirty] = useState(false);
  const [estimate, setEstimate] = useState('');
  const [tab, setTab] = useState('all');
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [link, setLink] = useState({ url: '', name: '' });
  const [linkOpen, setLinkOpen] = useState(false);
  const panel = useRef(null);
  const seq = useRef(0);

  // Escape closes the panel, unless a dialog (e.g. a confirmation) is open on top of it.
  useEscape(useCallback(() => { if (!document.querySelector('[role="dialog"]')) onClose(); }, [onClose]));

  const load = useCallback(async () => {
    if (!taskId) return;
    const mine = ++seq.current;
    try {
      const d = await api.get(`/tasks/${taskId}`);
      if (mine !== seq.current) return;
      setDetail(d);
      setError('');
    } catch (e) { if (mine === seq.current) setError(e.message); }
  }, [taskId]);

  useEffect(() => { setDetail(null); setComment(''); setSubTitle(''); setTab('all'); }, [taskId]);
  useEffect(() => { load(); }, [load, rev]);
  useEffect(() => { panel.current?.focus(); }, [taskId]);

  // Keep editable fields in step with the server unless the user is mid-edit.
  const t = detail?.task;
  useEffect(() => { if (t) { setTitle(t.title); setEstimate(t.estimateMinutes == null ? '' : formatDuration(t.estimateMinutes)); } }, [t?.id, t?.title, t?.estimateMinutes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (t && !descDirty) setDesc(t.description); }, [t?.id, t?.description, descDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(async (changes) => {
    try {
      await actions.update(taskId, changes);
      await load();
    } catch { /* toast shown by the action */ }
  }, [actions, taskId, load]);

  async function saveDescription() {
    if (!descDirty) return;
    await update({ description: desc });
    setDescDirty(false);
  }

  async function saveEstimate() {
    let minutes;
    try { minutes = parseDuration(estimate); } catch (e) { toast.error(e.message); setEstimate(t.estimateMinutes == null ? '' : formatDuration(t.estimateMinutes)); return; }
    if (minutes !== t.estimateMinutes) await update({ estimateMinutes: minutes });
  }

  async function postComment() {
    const body = comment.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await api.post(`/tasks/${taskId}/comments`, { body, mentions: mentionedIds(body, members) });
      setComment('');
      await pd.afterWrite();
      await load();
    } catch (e) { toast.error(e.message); } finally { setPosting(false); }
  }

  const guard = async (fn) => { try { await fn(); await pd.afterWrite(); await load(); } catch (e) { toast.error(e.message); } };

  async function remove() {
    const ok = await confirm({
      title: `Delete ${t.projectKey}-${t.number}?`,
      message: t.subtaskCount ? `This also deletes its ${t.subtaskCount} subtask${t.subtaskCount > 1 ? 's' : ''}, comments and history. This cannot be undone.` : 'This also deletes its comments and history. This cannot be undone.',
      confirmLabel: 'Delete task', danger: true,
    });
    if (!ok) return;
    try { await actions.remove(taskId); onClose(); } catch { /* toast shown */ }
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}?task=${number}`); toast.success('Link copied'); } catch { toast.error('Could not copy the link.'); }
  };

  const feed = useMemo(() => {
    if (!detail) return [];
    const comments = detail.comments.map((c) => ({ kind: 'comment', at: c.createdAt, c }));
    const history = detail.activity.filter((a) => a.action !== 'task.commented').map((a) => ({ kind: 'activity', at: a.createdAt, a }));
    if (tab === 'comments') return comments;
    if (tab === 'history') return history.sort((x, y) => new Date(y.at) - new Date(x.at));
    return [...comments, ...history].sort((x, y) => new Date(x.at) - new Date(y.at));
  }, [detail, tab]);

  const status = t ? pd.statusById.get(t.statusId) : null;
  const done = status?.category === 'done';
  const parent = t?.parentId ? pd.taskById.get(t.parentId) : null;
  const goTo = (n) => navigate(`${path}?task=${n}`);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close task" className="absolute inset-0 bg-slate-950/40" onClick={onClose} type="button" />
      <aside aria-label={base ? `Task ${base.projectKey}-${base.number}` : 'Task'} className="animate-slide-in relative flex h-full w-full max-w-[920px] flex-col bg-white shadow-2xl outline-none dark:bg-[#14171c]" ref={panel} tabIndex={-1}>
        <header className="flex items-center gap-2 border-b border-line px-5 py-3">
          <span className="chip font-mono">{base ? `${base.projectKey}-${base.number}` : '…'}</span>
          {parent && <button className="muted flex min-w-0 items-center gap-1 text-xs hover:underline" onClick={() => goTo(parent.number)} type="button"><Icon className="size-3.5" name="subtask" /><span className="truncate">of {parent.projectKey}-{parent.number} {parent.title}</span></button>}
          <span className="ml-auto" />
          {detail && (
            <button aria-pressed={t.watching} className="btn btn-sm" onClick={() => guard(() => (t.watching ? api.del(`/tasks/${taskId}/watch`) : api.put(`/tasks/${taskId}/watch`)))} title="Get notified about changes to this task" type="button"><Icon className="size-3.5" name="eye" />{t.watching ? 'Watching' : 'Watch'}</button>
          )}
          <button aria-label="Copy link" className="icon-btn" onClick={copyLink} type="button"><Icon name="link" /></button>
          {detail && canWrite && (
            <Popover align="right" trigger={(p) => <button {...p} aria-label="More actions" className="icon-btn" type="button"><Icon name="more" /></button>}>
              {(close) => <button className="menu-item text-red-600" onClick={() => { close(); remove(); }} type="button"><Icon name="trash" />Delete task</button>}
            </Popover>
          )}
          <button aria-label="Close" className="icon-btn" onClick={onClose} type="button"><Icon name="close" /></button>
        </header>

        {!base && <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="font-semibold">Task not found</p><p className="muted mt-1 text-sm">It may have been deleted or moved to another project.</p><button className="btn mt-4" onClick={onClose} type="button">Close</button></div></div>}
        {base && !detail && !error && <div className="grid flex-1 place-items-center"><Spinner className="size-7" /></div>}
        {error && !detail && <div className="p-8 text-sm text-red-600" role="alert">{error}</div>}

        {detail && (
          <div className="grid flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 p-5 md:overflow-y-auto md:p-6">
              <input aria-label="Title" className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight hover:border-slate-200 focus:border-slate-300 focus:outline-none dark:hover:border-[#343b47] dark:focus:border-[#414957]" disabled={!canWrite} maxLength={300} onBlur={() => { const next = title.trim(); if (!next) setTitle(t.title); else if (next !== t.title) update({ title: next }); }} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} value={title} />

              <div className="mt-4">
                <p className="field-label px-2">Description</p>
                <textarea aria-label="Description" className="input min-h-28 resize-y" disabled={!canWrite} maxLength={20000} onBlur={saveDescription} onChange={(e) => { setDesc(e.target.value); setDescDirty(true); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveDescription(); } }} placeholder={canWrite ? 'Add details, context or acceptance criteria…' : 'No description.'} value={desc} />
                {descDirty && <p className="faint mt-1 px-1 text-xs">Unsaved changes. Click outside the box or press Ctrl+Enter to save.</p>}
              </div>

              {!t.parentId && (
                <section aria-label="Subtasks" className="mt-6">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" name="subtask" />Subtasks{detail.subtasks.length > 0 && <span className="faint font-normal">{detail.subtasks.filter((s) => pd.statusById.get(s.statusId)?.category === 'done').length}/{detail.subtasks.length}</span>}</h3>
                  {detail.subtasks.length > 0 && (
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#242a33]"><div className="h-full bg-[#86bc25] transition-all" style={{ width: `${(detail.subtasks.filter((s) => pd.statusById.get(s.statusId)?.category === 'done').length / detail.subtasks.length) * 100}%` }} /></div>
                  )}
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {detail.subtasks.map((s) => {
                      const sDone = pd.statusById.get(s.statusId)?.category === 'done';
                      return (
                        <li className="group flex items-center gap-3 px-3 py-2" key={s.id}>
                          <Checkbox checked={sDone} disabled={!canWrite} label={`Mark ${s.title} ${sDone ? 'not done' : 'done'}`} onChange={() => guard(() => actions.toggleDone(s))} />
                          <button className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${sDone ? 'faint line-through' : ''}`} onClick={() => goTo(s.number)} type="button">{s.title}</button>
                          <span className="faint font-mono text-[11px]">{s.projectKey}-{s.number}</span>
                          <Avatar size={20} user={s.assigneeId ? memberById.get(s.assigneeId) : null} />
                        </li>
                      );
                    })}
                    {!detail.subtasks.length && <li className="faint px-3 py-3 text-sm">No subtasks yet.</li>}
                  </ul>
                  {canWrite && (
                    <form className="mt-2" onSubmit={(e) => { e.preventDefault(); const v = subTitle.trim(); if (v) guard(async () => { await actions.create({ title: v, parentId: taskId }); setSubTitle(''); }); }}>
                      <input aria-label="Add a subtask" className="input" maxLength={300} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add a subtask and press Enter" value={subTitle} />
                    </form>
                  )}
                </section>
              )}

              <section aria-label="Links" className="mt-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" name="paperclip" />Links<span className="faint font-normal">{detail.links.length || ''}</span>
                  {canWrite && <button className="btn btn-sm ml-auto" onClick={() => setLinkOpen((o) => !o)} type="button"><Icon className="size-3.5" name="add" />Add link</button>}
                </h3>
                {linkOpen && (
                  <form className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); guard(async () => { await api.post(`/tasks/${taskId}/links`, { url: link.url, ...(link.name.trim() ? { name: link.name } : {}) }); setLink({ url: '', name: '' }); setLinkOpen(false); }); }}>
                    <input aria-label="Link address" autoFocus className="input" onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} placeholder="https://…" type="url" value={link.url} />
                    <input aria-label="Link name" className="input" maxLength={120} onChange={(e) => setLink((l) => ({ ...l, name: e.target.value }))} placeholder="Name (optional)" value={link.name} />
                    <button className="btn btn-primary" disabled={!link.url.trim()} type="submit">Add</button>
                  </form>
                )}
                <ul className="grid gap-1">
                  {detail.links.map((l) => (
                    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-[#181c22]" key={l.id}>
                      <Icon className="size-4 shrink-0 text-slate-400" name="link" />
                      <a className="min-w-0 flex-1 truncate text-sm text-[#3d6208] hover:underline dark:text-[#a6d95a]" href={l.url} rel="noopener noreferrer" target="_blank" title={l.url}>{l.name}</a>
                      <span className="faint hidden text-xs sm:inline">{l.createdByName}</span>
                      {canWrite && <button aria-label={`Remove ${l.name}`} className="icon-btn size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => guard(() => api.del(`/links/${l.id}`))} type="button"><Icon className="size-3.5" name="close" /></button>}
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Activity" className="mt-6">
                <div className="mb-3 flex items-center gap-1 border-b border-line" role="tablist">
                  {[['all', 'All'], ['comments', `Comments${detail.comments.length ? ` (${detail.comments.length})` : ''}`], ['history', 'History']].map(([k, label]) => (
                    <button aria-selected={tab === k} className="tab" key={k} onClick={() => setTab(k)} role="tab" type="button">{label}</button>
                  ))}
                </div>
                <ul className="grid gap-4">
                  {feed.map((item) => (item.kind === 'comment'
                    ? <Comment c={item.c} canAdmin={isAdmin} canWrite={canWrite} key={`c-${item.c.id}`} me={user} members={members} onDelete={(c) => guard(() => api.del(`/comments/${c.id}`))} onEdit={(c, body) => guard(() => api.patch(`/comments/${c.id}`, { body }))} />
                    : (
                      <li className="flex items-start gap-3" key={`a-${item.a.id}`}>
                        <span className="grid size-[30px] shrink-0 place-items-center"><span className="size-2 rounded-full bg-slate-300 dark:bg-slate-600" /></span>
                        <p className="muted min-w-0 flex-1 pt-0.5 text-sm"><b className="font-medium text-slate-800 dark:text-slate-200">{item.a.actorName || 'Someone'}</b> {describeActivity(item.a)} <span className="faint text-xs" title={new Date(item.a.createdAt).toLocaleString()}>· {timeAgo(item.a.createdAt)}</span></p>
                      </li>
                    )))}
                  {!feed.length && <li className="faint text-sm">Nothing here yet.</li>}
                </ul>
                {canWrite && tab !== 'history' && (
                  <div className="mt-5 flex gap-3">
                    <Avatar size={30} user={user} />
                    <div className="min-w-0 flex-1">
                      <MentionTextarea members={members} onChange={setComment} onSubmit={postComment} placeholder="Write a comment. Type @ to mention a teammate." value={comment} />
                      <div className="mt-2 flex items-center justify-between"><span className="faint text-xs">Ctrl+Enter to send</span><button className="btn btn-primary btn-sm" disabled={!comment.trim() || posting} onClick={postComment} type="button">{posting ? 'Sending…' : 'Comment'}</button></div>
                    </div>
                  </div>
                )}
                {!canWrite && <p className="faint mt-4 text-sm">{pd.project?.archived ? 'This project is archived, so the task is read-only.' : 'You have view-only access, so you cannot comment.'}</p>}
              </section>
            </div>

            <aside aria-label="Details" className="border-t border-line bg-slate-50/60 p-5 dark:bg-[#12151a] md:border-l md:border-t-0 md:overflow-y-auto">
              <Prop label="Status"><StatusSelect className="btn btn-sm w-full justify-start" disabled={!canWrite} onChange={(statusId) => update({ statusId })} statuses={pd.statuses} value={t.statusId} /></Prop>
              <Prop label="Priority"><PrioritySelect className="btn btn-sm w-full justify-start" disabled={!canWrite} onChange={(priority) => update({ priority })} value={t.priority} /></Prop>
              <Prop label="Assignee"><UserSelect className="btn btn-sm w-full justify-start" disabled={!canWrite} members={members} onChange={(assigneeId) => update({ assigneeId })} value={t.assigneeId} /></Prop>
              <Prop label="Labels">
                <div className="flex flex-wrap items-center gap-1">
                  {t.labelIds.map((id) => pd.labelById.get(id)).filter(Boolean).map((l) => <LabelChip key={l.id} label={l} />)}
                  {canWrite && <LabelSelect className="btn btn-sm" labels={pd.labels} onChange={(labelIds) => update({ labelIds })} value={t.labelIds} />}
                  {!canWrite && !t.labelIds.length && <span className="faint text-sm">None</span>}
                </div>
              </Prop>
              <Prop label="Start date"><DateField ariaLabel="Start date" className="w-full [&_input]:w-full" disabled={!canWrite} max={t.dueDate || undefined} onChange={(startDate) => update({ startDate })} value={t.startDate} /></Prop>
              <Prop label="Due date"><DateField ariaLabel="Due date" className="w-full [&_input]:w-full" disabled={!canWrite} min={t.startDate || undefined} onChange={(dueDate) => update({ dueDate })} value={t.dueDate} /></Prop>
              <Prop label="Due time"><input aria-label="Due time" className="input h-8 text-xs" disabled={!canWrite || !t.dueDate} onChange={(e) => update({ dueTime: e.target.value || null })} type="time" value={t.dueTime || ''} /></Prop>
              <Prop label="Estimate"><input aria-label="Estimate" className="input h-8 text-xs" disabled={!canWrite} onBlur={saveEstimate} onChange={(e) => setEstimate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="e.g. 1h 30m" value={estimate} /></Prop>
              <div className="mt-4 grid gap-1.5 border-t border-line pt-4 text-xs muted">
                <p className="flex justify-between"><span>Reporter</span><span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300"><Avatar size={16} user={detail.reporter} />{detail.reporter?.name || 'Unknown'}</span></p>
                <p className="flex justify-between"><span>Created</span><span title={new Date(t.createdAt).toLocaleString()}>{formatDay(t.createdAt.slice(0, 10), true)}</span></p>
                <p className="flex justify-between"><span>Updated</span><span>{timeAgo(t.updatedAt)}</span></p>
                {t.completedAt && <p className="flex justify-between"><span>Completed</span><span>{formatDay(t.completedAt.slice(0, 10), true)}</span></p>}
                <p className="flex justify-between"><span>Watchers</span><span>{detail.watchers.length}</span></p>
              </div>
              {canWrite && !done && pd.firstDone && <button className="btn btn-primary mt-5 w-full" onClick={() => update({ statusId: pd.firstDone.id })} type="button"><Icon className="size-4" name="check" />Mark as {pd.firstDone.name.toLowerCase()}</button>}
              <p className="faint mt-4 text-[11px]">Workspace: {workspace.name}</p>
            </aside>
          </div>
        )}
      </aside>
    </div>
  );
}
