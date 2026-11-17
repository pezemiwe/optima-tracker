import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { PRIORITIES, STATUSES, toDateInput } from '../utils.js';

const blankTask = (status = 'todo', day = toDateInput()) => ({
  title: '', ws: '', owner: '', watcher: '', priority: 'med',
  status, day, due: '', note: '',
});

export default function TaskDialog({ task, subtasks, workstreams, owners, canWrite, defaultDay, onClose, onSave, onDelete, onAddSubtask, onUpdateSubtask, onDeleteSubtask, saving }) {
  const [form, setForm] = useState(() => task ? { ...blankTask(task.status, defaultDay), ...task } : blankTask('todo', defaultDay));
  const [newSubtask, setNewSubtask] = useState('');
  const [error, setError] = useState('');
  const isNew = !task?.id;
  const workstreamOptions = form.ws && !workstreams.includes(form.ws) ? [form.ws, ...workstreams] : workstreams;
  const ownerOptions = form.owner && !owners.includes(form.owner) ? [form.owner, ...owners] : owners;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        document.getElementById('task-form')?.requestSubmit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onSave({
        title: form.title.trim(),
        ws: form.ws,
        owner: form.owner.trim(),
        watcher: form.watcher.trim(),
        priority: form.priority,
        status: form.status,
        day: form.day,
        due: form.due,
        note: form.note.trim(),
      });
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function addSubtask(event) {
    event.preventDefault();
    const title = newSubtask.trim();
    if (!title) return;
    try {
      await onAddSubtask(title);
      setNewSubtask('');
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form aria-labelledby="task-dialog-title" aria-modal="true" className="my-auto flex max-h-[min(90vh,850px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#343b47] dark:bg-[#14171c]" id="task-form" onSubmit={submit} role="dialog">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-[#242a33]">
          <div><p className="text-xs text-slate-400">{isNew ? 'Optima Close-out / New task' : `Task ${String(task.n || '').padStart(3, '0')}`}</p><h2 className="mt-1 font-semibold text-slate-900 dark:text-white" id="task-dialog-title">{isNew ? 'Create task' : 'Task details'}</h2></div>
          <button aria-label="Close dialog" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242a33]" onClick={onClose} type="button"><Icon name="close" /></button>
        </div>
        <div className="grid gap-5 overflow-y-auto p-5">
          <label className="block text-xs font-medium text-slate-500">Task name
            <input autoFocus className="mt-2 w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-xl font-semibold text-slate-950 placeholder:text-slate-300 dark:border-[#343b47] dark:text-white dark:placeholder:text-slate-600" disabled={!canWrite} maxLength={300} onChange={(event) => change('title', event.target.value)} placeholder="What needs to be done?" required value={form.title} />
          </label>
          <label className="block text-xs font-medium text-slate-500">Description / notes
            <textarea className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-transparent p-3 text-sm text-slate-800 placeholder:text-slate-400 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} maxLength={5000} onChange={(event) => change('note', event.target.value)} placeholder="Description, blockers, or who you are waiting on" value={form.note} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">Status<select className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} onChange={(event) => change('status', event.target.value)} value={form.status}>{STATUSES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">Priority<select className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} onChange={(event) => change('priority', event.target.value)} value={form.priority}>{PRIORITIES.map((value) => <option key={value} value={value}>{value === 'med' ? 'Medium' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">Workstream<select className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} onChange={(event) => change('ws', event.target.value)} value={form.ws}><option value="">No workstream</option>{workstreamOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">Due date<input className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} onChange={(event) => change('day', event.target.value)} required type="date" value={form.day} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">Owner<select className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} onChange={(event) => change('owner', event.target.value)} value={form.owner}><option value="">Unassigned</option>{ownerOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">Due time<input className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} onChange={(event) => change('due', event.target.value)} type="time" value={form.due} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-slate-500 sm:col-span-2">Watcher<input className="h-10 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} maxLength={80} onChange={(event) => change('watcher', event.target.value)} placeholder="Optional" value={form.watcher} /></label>
          </div>
          {!isNew && (
            <section className="border-t border-slate-100 pt-4 dark:border-[#242a33]">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Subtasks <span className="font-normal text-slate-400">{subtasks.filter((item) => item.done).length}/{subtasks.length}</span></h3>
              <div className="grid gap-2">
                {subtasks.map((subtask) => (
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex" key={subtask.id}>
                    <input aria-label={`Complete ${subtask.title}`} checked={subtask.done} className="size-4 accent-[#86bc25]" disabled={!canWrite} onChange={(event) => onUpdateSubtask(subtask, { done: event.target.checked })} type="checkbox" />
                    <input aria-label="Subtask title" className={`min-w-0 flex-1 border-b border-transparent bg-transparent py-1 text-sm text-slate-700 focus:border-slate-300 dark:text-slate-300 dark:focus:border-[#343b47] ${subtask.done ? 'text-slate-400 line-through' : ''}`} defaultValue={subtask.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== subtask.title) onUpdateSubtask(subtask, { title }); else if (!title) event.currentTarget.value = subtask.title; }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                    <select aria-label={`Owner for ${subtask.title}`} className="col-start-2 col-end-4 w-full rounded-md border border-slate-200 bg-transparent px-2 py-1 text-xs text-slate-600 dark:border-[#343b47] dark:text-slate-300 sm:max-w-28 sm:w-auto" disabled={!canWrite} onChange={(event) => onUpdateSubtask(subtask, { owner: event.target.value })} value={subtask.owner || ''}>
                      <option value="">Unassigned</option>
                      {(subtask.owner && !owners.includes(subtask.owner) ? [subtask.owner, ...owners] : owners).map((owner) => <option key={owner}>{owner}</option>)}
                    </select>
                    <button aria-label={`Delete ${subtask.title}`} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40" disabled={!canWrite} onClick={() => onDeleteSubtask(subtask)} type="button"><Icon className="size-3.5" name="trash" /></button>
                  </div>
                ))}
                <div className="mt-1 flex gap-2">
                  <input aria-label="New subtask" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-3 text-sm dark:border-[#343b47] dark:text-slate-100" maxLength={300} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(event); } }} placeholder="Add a subtask" value={newSubtask} />
                  <button className="rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-[#343b47] dark:text-slate-200" disabled={!newSubtask.trim() || !canWrite} onClick={addSubtask} type="button">Add</button>
                </div>
              </div>
            </section>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>}
        </div>
        <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-[#242a33] dark:bg-[#181c22]">
          {!isNew && canWrite && <button className="mr-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" onClick={onDelete} type="button"><Icon className="size-4" name="trash" />Delete</button>}
          {isNew && <span className="mr-auto text-xs text-slate-400">Ctrl/⌘ + Enter to save</span>}
          <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white dark:border-[#343b47] dark:text-slate-200 dark:hover:bg-[#242a33]" onClick={onClose} type="button">Cancel</button>
          {canWrite && <button className="rounded-lg bg-[#86bc25] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#97cf2e] disabled:opacity-50" disabled={saving} type="submit">{saving ? 'Saving…' : isNew ? 'Create task' : 'Save changes'}</button>}
        </footer>
      </form>
    </div>
  );
}
