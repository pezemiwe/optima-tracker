import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { PRIORITIES, STATUSES, toDateInput, WORKSTREAMS } from '../utils.js';

const blankTask = (status = 'todo') => ({
  title: '', ws: WORKSTREAMS[0], owner: '', watcher: '', priority: 'med',
  status, day: toDateInput(), due: '', note: '',
});

const control = 'h-11 w-full max-w-md rounded-lg border border-slate-200 bg-transparent px-4 text-base text-slate-800 placeholder:text-slate-400 dark:border-[#343b47] dark:text-slate-100';
const pill = (active) => `rounded-lg border px-4 py-2.5 text-base font-medium transition ${active ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-[#343b47] dark:text-slate-200 dark:hover:bg-[#1b2028]'}`;
const priorityLabel = (value) => (value === 'med' ? 'Medium' : value[0].toUpperCase() + value.slice(1));

function Row({ label, children, hint }) {
  return (
    <div className="grid items-center gap-2 border-t border-slate-200 py-4 dark:border-[#242a33] sm:grid-cols-[236px_minmax(0,1fr)]">
      <span className="text-base font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <div className="min-w-0">{children}{hint}</div>
    </div>
  );
}

export default function TaskDialog({ task, subtasks, people = [], canWrite, onClose, onSave, onDelete, onAddSubtask, onUpdateSubtask, onDeleteSubtask, saving }) {
  const [form, setForm] = useState(() => task ? { ...blankTask(), ...task } : blankTask());
  const [pending, setPending] = useState([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [createAnother, setCreateAnother] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  const isNew = !task?.id;

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
    if (!form.title.trim()) return;
    setError('');
    try {
      const keepOpen = isNew && createAnother;
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
      }, { subtasks: pending, keepOpen });
      if (keepOpen) {
        setForm((current) => ({ ...blankTask(current.status), ws: current.ws, day: current.day, owner: current.owner, watcher: current.watcher }));
        setPending([]);
        setNewSubtask('');
        titleRef.current?.focus();
      }
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function addSubtask(event) {
    event.preventDefault();
    const title = newSubtask.trim();
    if (!title) return;
    if (isNew) {
      setPending((current) => [...current, title]);
      setNewSubtask('');
      return;
    }
    try {
      await onAddSubtask(title);
      setNewSubtask('');
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  const ready = Boolean(form.title.trim());

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form aria-labelledby="task-dialog-title" aria-modal="true" className="my-auto flex max-h-[min(94vh,900px)] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#343b47] dark:bg-[#14171c]" id="task-form" onSubmit={submit} role="dialog">
        <div className="grid gap-5 overflow-y-auto px-8 pb-2 pt-7">
          <div className="flex items-center justify-between">
            <p className="text-base font-medium text-slate-500 dark:text-slate-400" id="task-dialog-title">Optima Close-out <span className="mx-2 text-slate-300 dark:text-slate-600">/</span> {isNew ? 'New task' : `Task ${String(task.n || '').padStart(3, '0')}`}</p>
            <button aria-label="Close dialog" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242a33]" onClick={onClose} type="button"><Icon name="close" /></button>
          </div>
          <input aria-label="Task name" autoFocus className="w-full border-0 bg-transparent p-0 text-4xl font-semibold tracking-tight text-slate-950 placeholder:text-slate-400 focus:outline-none dark:text-white" disabled={!canWrite} maxLength={300} onChange={(event) => change('title', event.target.value)} placeholder="Task name" ref={titleRef} required value={form.title} />
          <textarea aria-label="Description" className="min-h-28 w-full resize-y border-0 bg-transparent p-0 text-xl text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100" disabled={!canWrite} maxLength={5000} onChange={(event) => change('note', event.target.value)} placeholder="Description, blockers, who you are waiting on" value={form.note} />

          {(isNew ? pending : subtasks).length > 0 && (
            <ul className="grid gap-2">
              {isNew
                ? pending.map((title, index) => (
                  <li className="flex items-center gap-3 text-base text-slate-700 dark:text-slate-300" key={`${title}-${index}`}>
                    <span className="size-4 rounded border border-slate-300 dark:border-[#343b47]" />
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                    <button aria-label={`Remove ${title}`} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" onClick={() => setPending((current) => current.filter((_, i) => i !== index))} type="button"><Icon className="size-3.5" name="trash" /></button>
                  </li>
                ))
                : subtasks.map((subtask) => (
                  <li className="flex items-center gap-3" key={subtask.id}>
                    <input aria-label={`Complete ${subtask.title}`} checked={subtask.done} className="size-4 accent-[#86bc25]" disabled={!canWrite} onChange={(event) => onUpdateSubtask(subtask, { done: event.target.checked })} type="checkbox" />
                    <input aria-label="Subtask title" className={`min-w-0 flex-1 border-b border-transparent bg-transparent py-1 text-base text-slate-700 focus:border-slate-300 focus:outline-none dark:text-slate-300 dark:focus:border-[#343b47] ${subtask.done ? 'text-slate-400 line-through' : ''}`} defaultValue={subtask.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== subtask.title) onUpdateSubtask(subtask, { title }); else if (!title) event.currentTarget.value = subtask.title; }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
                    <button aria-label={`Delete ${subtask.title}`} className="grid size-7 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40" disabled={!canWrite} onClick={() => onDeleteSubtask(subtask)} type="button"><Icon className="size-3.5" name="trash" /></button>
                  </li>
                ))}
            </ul>
          )}
          <div className="flex gap-3">
            <input aria-label="New subtask" className="h-12 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-4 text-base text-slate-800 placeholder:text-slate-400 dark:border-[#343b47] dark:text-slate-100" disabled={!canWrite} maxLength={300} onChange={(event) => setNewSubtask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(event); } }} placeholder="Add a subtask (optional), press Enter" value={newSubtask} />
            <button className="rounded-lg border border-slate-200 px-5 text-base font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40 dark:border-[#343b47] dark:text-slate-200 dark:hover:bg-[#1b2028]" disabled={!newSubtask.trim() || !canWrite} onClick={addSubtask} type="button">Add subtask</button>
          </div>

          <div>
            <Row label="Status">
              <div className="flex flex-wrap gap-3">{STATUSES.map(({ value, label }) => <button aria-pressed={form.status === value} className={pill(form.status === value)} disabled={!canWrite} key={value} onClick={() => change('status', value)} type="button">{label}</button>)}</div>
            </Row>
            <Row label="Priority">
              <div className="flex flex-wrap gap-3">{PRIORITIES.map((value) => <button aria-pressed={form.priority === value} className={pill(form.priority === value)} disabled={!canWrite} key={value} onClick={() => change('priority', value)} type="button">{priorityLabel(value)}</button>)}</div>
            </Row>
            <Row label="Workstream">
              <select aria-label="Workstream" className={control} disabled={!canWrite} onChange={(event) => change('ws', event.target.value)} value={form.ws}>{WORKSTREAMS.map((item) => <option key={item}>{item}</option>)}</select>
            </Row>
            <Row label="Owner">
              <input aria-label="Owner" className={control} disabled={!canWrite} list="task-people" maxLength={80} onChange={(event) => change('owner', event.target.value)} placeholder="Unassigned" value={form.owner} />
            </Row>
            <Row label="Watcher">
              <div className="grid gap-3">
                <input aria-label="Watcher" className={control} disabled={!canWrite} list="task-people" maxLength={80} onChange={(event) => change('watcher', event.target.value)} placeholder="Follows up on this" value={form.watcher} />
                {people.length > 0 && <div className="flex flex-wrap gap-2">{people.map((person) => <button className={`${pill(form.watcher === person)} !py-2`} disabled={!canWrite} key={person} onClick={() => change('watcher', form.watcher === person ? '' : person)} type="button">{person}</button>)}</div>}
              </div>
              <datalist id="task-people">{people.map((person) => <option key={person} value={person} />)}</datalist>
            </Row>
            <Row hint={<p className="mt-2 max-w-md text-sm text-slate-400 sm:hidden">Optional. Makes the task time bound for the chosen date.</p>} label="Due time">
              <div className="flex flex-wrap items-center gap-4">
                <input aria-label="Due time" className={`${control} !w-[260px]`} disabled={!canWrite} onChange={(event) => change('due', event.target.value)} type="time" value={form.due} />
                <span className="hidden max-w-sm text-base text-slate-400 sm:block">Optional. Makes the task time bound for the chosen date.</span>
              </div>
            </Row>
            <Row label="Date">
              <input aria-label="Date" className={control} disabled={!canWrite} onChange={(event) => change('day', event.target.value)} required type="date" value={form.day} />
            </Row>
            <div className="border-t border-slate-200 dark:border-[#242a33]" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>}
        </div>
        <footer className="flex items-center gap-3 bg-slate-50 px-8 py-5 dark:bg-[#181c22]">
          {isNew
            ? <label className="mr-auto inline-flex items-center gap-3 text-base text-slate-500 dark:text-slate-400"><input checked={createAnother} className="size-5 accent-[#86bc25]" onChange={(event) => setCreateAnother(event.target.checked)} type="checkbox" />Create another</label>
            : canWrite && <button className="mr-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-base text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40" onClick={() => onDelete(task)} type="button"><Icon className="size-4" name="trash" />Delete</button>}
          <button className="h-11 rounded-lg border border-slate-200 bg-white px-5 text-base font-medium text-slate-800 hover:bg-slate-50 dark:border-[#343b47] dark:bg-transparent dark:text-slate-200 dark:hover:bg-[#242a33]" onClick={onClose} type="button">Cancel</button>
          {canWrite && <button className="h-11 rounded-lg bg-[#86bc25] px-5 text-base font-semibold text-slate-950 hover:bg-[#97cf2e] disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || !ready} type="submit">{saving ? 'Saving…' : isNew ? 'Create task' : 'Save changes'}</button>}
        </footer>
      </form>
    </div>
  );
}
