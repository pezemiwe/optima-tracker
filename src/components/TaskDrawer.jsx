import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, uploadFile } from '../api.js';
import Icon from './Icon.jsx';
import Markdown from './Markdown.jsx';
import MentionTextarea from './MentionTextarea.jsx';
import { Checkbox, DateField, LabelSelect, PrioritySelect, StatusSelect } from './TaskBits.jsx';
import { Avatar, LabelChip, Modal, Popover, Select, Spinner, UserSelect, useConfirm, useEscape, useToast } from './ui.jsx';
import { describeActivity, mentionedIds } from '../lib/activity.mjs';
import { toggleTaskLine } from '../lib/markdown.mjs';
import { REPEAT_OPTIONS, repeatKey } from '../lib/repeat.mjs';
import { describeRecurrence } from '../lib/recurrenceText.mjs';
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
  return <Markdown members={members} source={body} />;
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
  const [editingDesc, setEditingDesc] = useState(false);
  const [uploading, setUploading] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [relForm, setRelForm] = useState(null); // { kind, q, results }
  const [conflict, setConflict] = useState(null); // { field, mine, theirs }
  // What the text was when this person started editing. The panel refreshes itself from the server while open,
  // so the current value cannot be used as the base: it may already contain someone else's change.
  const baseRef = useRef({ title: null, description: null });
  const [estimate, setEstimate] = useState('');
  const [pointsText, setPointsText] = useState('');
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

  useEffect(() => { setDetail(null); setComment(''); setSubTitle(''); setTab('all'); setEditingDesc(false); setRelForm(null); }, [taskId]);
  useEffect(() => { load(); }, [load, rev]);
  useEffect(() => { panel.current?.focus(); }, [taskId]);

  // Keep editable fields in step with the server unless the user is mid-edit.
  const t = detail?.task;
  useEffect(() => { if (t) { setTitle(t.title); setEstimate(t.estimateMinutes == null ? '' : formatDuration(t.estimateMinutes)); setPointsText(t.points == null ? '' : String(t.points)); } }, [t?.id, t?.title, t?.estimateMinutes, t?.points]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (t && !descDirty) setDesc(t.description); }, [t?.id, t?.description, descDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(async (changes) => {
    try {
      await actions.update(taskId, changes);
      await load();
    } catch { /* toast shown by the action */ }
  }, [actions, taskId, load]);

  /* Saves title or description with the text we started from, so a clash with someone else's edit is caught. */
  async function saveField(field, value, { force = false } = {}) {
    try {
      const base = baseRef.current[field] ?? t[field];
      await api.patch(`/tasks/${taskId}`, { [field]: value, ...(force ? {} : { base: { [field]: base } }) });
      baseRef.current[field] = null;
      await pd.afterWrite();
      await load();
      return true;
    } catch (e) {
      if (e.code === 'conflict') { setConflict({ field, mine: value, theirs: e.data.current[field] }); return false; }
      toast.error(e.message);
      await load();
      return false;
    }
  }

  async function saveDescription() {
    if (!descDirty) return;
    if (await saveField('description', desc)) setDescDirty(false);
  }

  async function resolveConflict(choice) {
    const c = conflict;
    setConflict(null);
    baseRef.current[c.field] = null;
    if (choice === 'mine') {
      await saveField(c.field, c.mine, { force: true });
      if (c.field === 'description') setDescDirty(false);
    } else {
      if (c.field === 'description') { setDescDirty(false); setEditingDesc(false); } else setTitle(c.theirs);
      await load();
    }
  }

  async function savePoints() {
    const next = pointsText.trim() === '' ? null : Math.max(0, Math.min(1000, parseInt(pointsText, 10) || 0));
    if (next !== t.points) await update({ points: next });
    else setPointsText(t.points == null ? '' : String(t.points));
  }

  const setField = (id, value) => update({ fields: { [id]: value } });

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

  async function uploadFiles(fileList) {
    const files = [...fileList];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} is larger than 10 MB.`); continue; }
      if (file.size === 0) { toast.error(`${file.name} is empty.`); continue; }
      setUploading((u) => [...u, file.name]);
      try { await uploadFile(`/tasks/${taskId}/attachments`, file); } catch (e) { toast.error(`${file.name}: ${e.message}`); } finally { setUploading((u) => u.filter((n) => n !== file.name)); }
    }
    await pd.afterWrite();
    await load();
  }

  // Searching for a task to link: the workspace search already spans every project.
  useEffect(() => {
    if (!relForm || relForm.q.trim().length < 2) return undefined;
    const handle = setTimeout(() => {
      api.get(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(relForm.q.trim())}`)
        .then((r) => setRelForm((f) => (f ? { ...f, results: r.tasks.filter((x) => x.id !== taskId) } : f))).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [relForm?.q, workspace.id, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addRelation(other) {
    const kind = relForm.kind;
    const call = kind === 'blocked_by'
      ? api.post(`/tasks/${other.id}/relations`, { toTaskId: taskId, type: 'blocks' })
      : api.post(`/tasks/${taskId}/relations`, { toTaskId: other.id, type: { blocks: 'blocks', relates: 'relates', duplicates: 'duplicates' }[kind] });
    await guard(() => call);
    setRelForm(null);
  }

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
              <input aria-label="Title" onFocus={() => { baseRef.current.title = t.title; }} className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight hover:border-slate-200 focus:border-slate-300 focus:outline-none dark:hover:border-[#343b47] dark:focus:border-[#414957]" disabled={!canWrite} maxLength={300} onBlur={() => { const next = title.trim(); if (!next) setTitle(t.title); else if (next !== t.title) saveField('title', next); }} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} value={title} />

              <div className="mt-4">
                <div className="flex items-center px-2"><p className="field-label !mb-0">Description</p><span className="faint ml-2 text-[11px]">Markdown supported</span>
                  {canWrite && !editingDesc && desc.trim() && <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setEditingDesc(true)} type="button"><Icon className="size-3.5" name="edit" />Edit</button>}
                </div>
                {(editingDesc || !desc.trim()) && canWrite ? (
                  <>
                    <textarea aria-label="Description" autoFocus={editingDesc} className="input mt-1.5 min-h-32 resize-y font-mono text-[13px]" maxLength={20000} onBlur={async () => { await saveDescription(); if (desc.trim()) setEditingDesc(false); }} onChange={(e) => { if (!descDirty) baseRef.current.description = t.description; setDesc(e.target.value); setDescDirty(true); setEditingDesc(true); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveDescription().then(() => desc.trim() && setEditingDesc(false)); } }} placeholder="Add details, context or acceptance criteria. Use - [ ] for a checklist." value={desc} />
                    {descDirty && <p className="faint mt-1 px-1 text-xs">Unsaved changes. Click outside the box or press Ctrl+Enter to save.</p>}
                  </>
                ) : (
                  <div className="mt-1.5 rounded-lg border border-transparent px-2 py-1 hover:border-slate-200 dark:hover:border-[#343b47]" onDoubleClick={() => canWrite && setEditingDesc(true)}>
                    {desc.trim() ? <Markdown members={members} onToggleTask={canWrite ? (line) => update({ description: toggleTaskLine(t.description, line) }) : undefined} source={t.description} /> : <p className="faint text-sm">No description.</p>}
                  </div>
                )}
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
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
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

              <section aria-label="Attachments" className="mt-6" onDragLeave={() => setDragOver(false)} onDragOver={(e) => { if (canWrite && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }} onDrop={(e) => { if (!canWrite) return; e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" name="file" />Files<span className="faint font-normal">{detail.attachments.length || ''}</span>
                  {canWrite && <label className="btn btn-sm ml-auto cursor-pointer"><Icon className="size-3.5" name="upload" />Attach files<input aria-label="Attach files" className="sr-only" multiple onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} type="file" /></label>}
                </h3>
                <div className={`rounded-lg border border-dashed transition ${dragOver ? 'border-[#86bc25] bg-[#86bc25]/10' : 'border-transparent'}`}>
                  <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
                    {detail.attachments.map((a) => (
                      <li className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-[#181c22]" key={a.id}>
                        {a.mime.startsWith('image/') && a.mime !== 'image/svg+xml'
                          ? <a href={`/api/attachments/${a.id}?inline=1`} rel="noopener noreferrer" target="_blank"><img alt="" className="size-10 rounded-md border border-line object-cover" loading="lazy" src={`/api/attachments/${a.id}?inline=1`} /></a>
                          : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500 dark:bg-[#1b2028]"><Icon name="file" /></span>}
                        <div className="min-w-0 flex-1">
                          <a className="block truncate text-sm font-medium text-[#3d6208] hover:underline dark:text-[#a6d95a]" download={a.name} href={`/api/attachments/${a.id}`}>{a.name}</a>
                          <span className="faint text-xs">{a.size < 1024 * 1024 ? `${Math.max(1, Math.round(a.size / 1024))} KB` : `${(a.size / 1048576).toFixed(1)} MB`} · {a.createdByName || 'Unknown'} · {timeAgo(a.createdAt)}</span>
                        </div>
                        {canWrite && (a.createdByName === user.name || isAdmin) && <button aria-label={`Remove ${a.name}`} className="icon-btn size-7 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => guard(() => api.del(`/attachments/${a.id}`))} type="button"><Icon className="size-3.5" name="trash" /></button>}
                      </li>
                    ))}
                    {uploading.map((n) => <li className="flex items-center gap-3 px-2 py-1.5 text-sm muted" key={`up-${n}`}><Spinner className="size-4" />Uploading {n}…</li>)}
                    {!detail.attachments.length && !uploading.length && <li className="faint px-2 py-2 text-sm">{canWrite ? 'Drop files here, or use Attach files. Up to 10 MB each.' : 'No files.'}</li>}
                  </ul>
                </div>
              </section>

              <section aria-label="Dependencies" className="mt-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" name="lock" />Dependencies<span className="faint font-normal">{detail.relations.length || ''}</span>
                  {canWrite && <button className="btn btn-sm ml-auto" onClick={() => setRelForm(relForm ? null : { kind: 'blocked_by', q: '', results: [] })} type="button"><Icon className="size-3.5" name="add" />Add</button>}
                </h3>
                {relForm && (
                  <div className="surface mb-3 grid gap-2 p-3">
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Relationship">
                      {[['blocked_by', 'Blocked by'], ['blocks', 'Blocks'], ['relates', 'Related to'], ['duplicates', 'Duplicates']].map(([k, label]) => (
                        <button aria-checked={relForm.kind === k} className={`btn btn-sm ${relForm.kind === k ? '!border-[#86bc25]' : ''}`} key={k} onClick={() => setRelForm((f) => ({ ...f, kind: k }))} role="radio" type="button">{label}</button>
                      ))}
                    </div>
                    <input aria-label="Find a task to link" autoFocus className="input" onChange={(e) => setRelForm((f) => ({ ...f, q: e.target.value, results: [] }))} placeholder="Search by title or key (e.g. WEB-12)" value={relForm.q} />
                    {relForm.results.length > 0 && (
                      <ul className="max-h-48 overflow-y-auto rounded-lg border border-line">
                        {relForm.results.map((r) => <li key={r.id}><button className="menu-item" onClick={() => addRelation(r)} type="button"><span className="faint font-mono text-xs">{r.projectKey}-{r.number}</span><span className="min-w-0 flex-1 truncate">{r.title}</span><span className="chip">{r.statusName}</span></button></li>)}
                      </ul>
                    )}
                    {relForm.q.trim().length >= 2 && !relForm.results.length && <p className="faint text-xs">No matching tasks yet.</p>}
                  </div>
                )}
                {['Blocked by', 'Blocks', 'Related to', 'Duplicates', 'Duplicated by'].map((label) => {
                  const rows = detail.relations.filter((r) => ({ blocks: { out: 'Blocks', in: 'Blocked by' }, relates: { out: 'Related to', in: 'Related to' }, duplicates: { out: 'Duplicates', in: 'Duplicated by' } }[r.type][r.direction]) === label);
                  if (!rows.length) return null;
                  return (
                    <div className="mb-2" key={label}>
                      <p className="faint mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider">{label}</p>
                      <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
                        {rows.map((r) => (
                          <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-[#181c22]" key={r.id}>
                            <Icon className={`size-4 ${label === 'Blocked by' && !r.otherDone ? 'text-red-500' : 'text-slate-400'}`} name={label === 'Blocked by' || label === 'Blocks' ? 'lock' : 'link'} />
                            <button className={`min-w-0 flex-1 truncate text-left text-sm hover:underline ${r.otherDone ? 'faint line-through' : ''}`} onClick={() => (r.otherKey === t.projectKey ? goTo(r.otherNumber) : navigate(`/w/${workspace.slug}/p/${r.otherKey}/list?task=${r.otherNumber}`))} type="button"><span className="faint mr-2 font-mono text-xs">{r.otherKey}-{r.otherNumber}</span>{r.otherTitle}</button>
                            <span className="chip">{r.otherStatus}</span>
                            {canWrite && <button aria-label={`Remove link to ${r.otherKey}-${r.otherNumber}`} className="icon-btn size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => guard(() => api.del(`/relations/${r.id}`))} type="button"><Icon className="size-3.5" name="close" /></button>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {!detail.relations.length && !relForm && <p className="faint px-1 text-sm">No dependencies.</p>}
              </section>

              <section aria-label="Activity" className="mt-6">
                <div className="mb-3 flex items-center gap-1 border-b border-line" role="tablist">
                  {[['all', 'All'], ['comments', `Comments${detail.comments.length ? ` (${detail.comments.length})` : ''}`], ['history', 'History']].map(([k, label]) => (
                    <button aria-selected={tab === k} className="tab" key={k} onClick={() => setTab(k)} role="tab" type="button">{label}</button>
                  ))}
                </div>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-4">
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
              {!t.parentId && pd.sprints.some((x) => x.state !== 'completed' || x.id === t.sprintId) && (
                <Prop label="Sprint"><Select ariaLabel="Sprint" className="btn btn-sm w-full justify-between" disabled={!canWrite} onChange={(sprintId) => update({ sprintId })} options={[{ value: null, label: 'Backlog' }, ...pd.sprints.filter((x) => x.state !== 'completed' || x.id === t.sprintId).map((x) => ({ value: x.id, label: x.name }))]} value={t.sprintId || null} /></Prop>
              )}
              <Prop label="Story points"><input aria-label="Story points" className="input h-8 text-xs" disabled={!canWrite} inputMode="numeric" onBlur={savePoints} onChange={(e) => setPointsText(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="e.g. 3" value={pointsText} /></Prop>
              <Prop label="Repeat">
                <Select ariaLabel="Repeat" className="btn btn-sm w-full justify-between" disabled={!canWrite} onChange={(key) => update({ recurrence: REPEAT_OPTIONS.find((o) => o.key === key)?.value ?? null })} options={[...REPEAT_OPTIONS.map((o) => ({ value: o.key, label: o.label })), ...(repeatKey(t.recurrence).startsWith('custom') ? [{ value: repeatKey(t.recurrence), label: `Repeats ${describeRecurrence(t.recurrence)}` }] : [])]} value={repeatKey(t.recurrence)} />
              </Prop>
              {pd.fields.map((f) => {
                const val = t.fields?.[f.id];
                return (
                  <Prop key={f.id} label={f.name}>
                    {f.type === 'text' && <input aria-label={f.name} className="input h-8 text-xs" defaultValue={val ?? ''} disabled={!canWrite} key={`${f.id}-${val}`} maxLength={500} onBlur={(e) => { const next = e.target.value.trim(); if (next !== (val ?? '')) setField(f.id, next === '' ? null : next); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />}
                    {f.type === 'number' && <input aria-label={f.name} className="input h-8 text-xs" defaultValue={val ?? ''} disabled={!canWrite} key={`${f.id}-${val}`} onBlur={(e) => { const raw = e.target.value.trim(); const next = raw === '' ? null : Number(raw); if (raw !== '' && !Number.isFinite(next)) { toast.error(`${f.name} must be a number.`); return; } if (next !== (val ?? null)) setField(f.id, next); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} type="number" />}
                    {f.type === 'date' && <DateField ariaLabel={f.name} className="w-full [&_input]:w-full" disabled={!canWrite} onChange={(next) => setField(f.id, next)} value={val || null} />}
                    {f.type === 'checkbox' && <label className="flex h-8 items-center gap-2 text-sm"><input aria-label={f.name} checked={val === true} className="size-4 accent-[#86bc25]" disabled={!canWrite} onChange={(e) => setField(f.id, e.target.checked ? true : null)} type="checkbox" />{val === true ? 'Yes' : 'No'}</label>}
                    {f.type === 'select' && <Select ariaLabel={f.name} className="btn btn-sm w-full justify-between" disabled={!canWrite} onChange={(next) => setField(f.id, next)} options={[{ value: null, label: 'None' }, ...f.options.map((o) => ({ value: o, label: o }))]} value={val ?? null} />}
                  </Prop>
                );
              })}
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
      {conflict && (
        <Modal
          footer={(
            <>
              <button className="btn" onClick={() => setConflict(null)} type="button">Keep editing</button>
              <button className="btn" onClick={() => resolveConflict('theirs')} type="button">Use their version</button>
              <button className="btn btn-primary" onClick={() => resolveConflict('mine')} type="button">Overwrite with mine</button>
            </>
          )}
          onClose={() => setConflict(null)}
          title={`Someone else changed the ${conflict.field}`}
        >
          <p className="muted text-sm">While you were editing, another person saved a different {conflict.field}. Choose which one to keep.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><p className="field-label">Their version (saved)</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-slate-50 p-3 text-xs dark:bg-[#12151a]">{conflict.theirs || '(empty)'}</pre></div>
            <div><p className="field-label">Your version</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#86bc25]/50 bg-[#86bc25]/5 p-3 text-xs">{conflict.mine || '(empty)'}</pre></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
