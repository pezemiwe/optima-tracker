import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { DateField, LabelSelect, PrioritySelect, StatusSelect } from './TaskBits.jsx';
import { Modal, Select, Spinner, StatusDot, UserSelect, useToast } from './ui.jsx';
import { parseDuration } from '../lib/dates.mjs';
import { useWorkspace } from '../state/workspace.jsx';

/*
 * Create a task anywhere in the app. Loads the chosen project's statuses and
 * labels itself so it works from the sidebar, the command palette or a view.
 */
export default function NewTaskModal({ defaults = {}, onClose, onCreated }) {
  const { projects, members, sync, workspace } = useWorkspace();
  const toast = useToast();
  const open = useMemo(() => projects.filter((p) => !p.archived), [projects]);
  const [projectId, setProjectId] = useState(defaults.projectId && open.some((p) => p.id === defaults.projectId) ? defaults.projectId : open[0]?.id);
  const [bundle, setBundle] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', statusId: defaults.statusId || null, priority: 'medium', assigneeId: defaults.assigneeId ?? null,
    dueDate: defaults.dueDate || null, dueTime: '', startDate: null, labelIds: [], estimate: '',
  });
  const [parent] = useState(defaults.parent || null);
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    setBundle(null);
    api.get(`/projects/${projectId}`).then((b) => {
      if (cancelled) return;
      setBundle(b);
      setForm((f) => ({
        ...f,
        statusId: b.statuses.some((s) => s.id === f.statusId) ? f.statusId : (b.statuses.find((s) => s.category === 'todo') || b.statuses[0]).id,
        labelIds: f.labelIds.filter((id) => b.labels.some((l) => l.id === id)),
      }));
    }).catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [projectId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(event) {
    event?.preventDefault();
    if (!form.title.trim() || !bundle || busy) return;
    setError('');
    let estimateMinutes = null;
    try { estimateMinutes = parseDuration(form.estimate); } catch (e) { setError(e.message); return; }
    setBusy(true);
    try {
      const body = {
        title: form.title, description: form.description, statusId: form.statusId, priority: form.priority, assigneeId: form.assigneeId,
        labelIds: form.labelIds, estimateMinutes, startDate: form.startDate, dueDate: form.dueDate,
        ...(form.dueDate && form.dueTime ? { dueTime: form.dueTime } : {}),
        ...(parent ? { parentId: parent.id } : {}),
      };
      const { task } = await api.post(`/projects/${projectId}/tasks`, body);
      await sync();
      try { localStorage.setItem('optima-last-project', projectId); } catch { /* optional */ }
      toast.success(`Created ${task.projectKey}-${task.number}`);
      onCreated?.(task, bundle.project);
      if (another) {
        set({ title: '', description: '', estimate: '' });
        titleRef.current?.focus();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const projectOptions = open.map((p) => ({ value: p.id, label: `${p.name} (${p.key})`, node: <StatusDot color={p.color} /> }));

  return (
    <Modal
      footer={(
        <>
          <label className="mr-auto inline-flex cursor-pointer items-center gap-2 text-sm muted"><input checked={another} className="size-4 accent-[#86bc25]" onChange={(e) => setAnother(e.target.checked)} type="checkbox" />Create another</label>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" disabled={!form.title.trim() || !bundle || busy} form="new-task-form" type="submit">{busy ? 'Creating…' : 'Create task'}</button>
        </>
      )}
      onClose={onClose}
      size="lg"
      title={parent ? `New subtask of ${parent.projectKey}-${parent.number}` : 'New task'}
    >
      {!open.length ? (
        <p className="muted text-sm">Create a project first, then you can add tasks to it.</p>
      ) : (
        <form
          id="new-task-form"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e); }}
          onSubmit={submit}
        >
          {!parent && open.length > 1 && (
            <div className="mb-4 max-w-xs">
              <span className="field-label">Project</span>
              <Select className="btn w-full justify-between" onChange={setProjectId} options={projectOptions} value={projectId} />
            </div>
          )}
          <input aria-label="Task title" autoFocus className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-slate-950 placeholder:text-slate-400 focus:outline-none dark:text-white" maxLength={300} onChange={(e) => set({ title: e.target.value })} placeholder="What needs to be done?" ref={titleRef} value={form.title} />
          <textarea aria-label="Description" className="mt-3 min-h-24 w-full resize-y border-0 bg-transparent p-0 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100" maxLength={20000} onChange={(e) => set({ description: e.target.value })} placeholder="Add a description, blockers or links…" value={form.description} />
          {!bundle ? (
            <div className="grid place-items-center py-6"><Spinner /></div>
          ) : (
            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <div><span className="field-label">Status</span><StatusSelect className="btn w-full justify-start" onChange={(statusId) => set({ statusId })} statuses={bundle.statuses} value={form.statusId} /></div>
              <div><span className="field-label">Priority</span><PrioritySelect className="btn w-full justify-start" onChange={(priority) => set({ priority })} value={form.priority} /></div>
              <div><span className="field-label">Assignee</span><UserSelect className="btn w-full justify-start" members={members} onChange={(assigneeId) => set({ assigneeId })} value={form.assigneeId} /></div>
              <div><span className="field-label">Labels</span><LabelSelect className="btn w-full justify-start" labels={bundle.labels} onChange={(labelIds) => set({ labelIds })} value={form.labelIds} /></div>
              <div><span className="field-label">Start date</span><DateField ariaLabel="Start date" className="w-full [&_input]:w-full" max={form.dueDate || undefined} onChange={(startDate) => set({ startDate })} value={form.startDate} /></div>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1"><span className="field-label">Due date</span><DateField ariaLabel="Due date" className="w-full [&_input]:w-full" min={form.startDate || undefined} onChange={(dueDate) => set({ dueDate, ...(dueDate ? {} : { dueTime: '' }) })} value={form.dueDate} /></div>
                <div className="w-28"><span className="field-label">Time</span><input aria-label="Due time" className="input h-8 text-xs" disabled={!form.dueDate} onChange={(e) => set({ dueTime: e.target.value })} type="time" value={form.dueTime} /></div>
              </div>
              <div><span className="field-label">Estimate</span><input aria-label="Estimate" className="input h-8 text-xs" onChange={(e) => set({ estimate: e.target.value })} placeholder="e.g. 1h 30m" value={form.estimate} /></div>
            </div>
          )}
          {error && <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert"><Icon className="size-4" name="warning" />{error}</p>}
          <p className="faint mt-3 text-xs">Press <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to create.</p>
        </form>
      )}
    </Modal>
  );
}
