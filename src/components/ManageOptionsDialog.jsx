import { useState } from 'react';
import Icon from './Icon.jsx';

function OptionList({ label, kind, options, onAdd, onRemove, initialAdding = false }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(initialAdding);

  async function add(event) {
    event.preventDefault();
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      await onAdd(kind, value);
      setName('');
      setAdding(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(value) {
    setBusy(true);
    setError('');
    try {
      await onRemove(kind, value);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleAdding() {
    setAdding((current) => !current);
    setName('');
    setError('');
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {kind === 'owners' ? 'Task owners available in the Team filter.' : 'Categories available on tasks and in the sidebar.'}
          </p>
        </div>
        <button
          aria-expanded={adding}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#86bc25] px-3 text-xs font-semibold text-slate-950"
          onClick={toggleAdding}
          type="button"
        >
          <Icon className="size-3.5" name={adding ? 'close' : 'add'} />
          {adding ? 'Cancel' : 'Add'}
        </button>
      </div>
      {adding && (
        <form className="flex gap-2" onSubmit={add}>
          <input
            aria-label={`New ${kind === 'owners' ? 'team owner' : 'workstream'}`}
            autoFocus
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-3 text-sm text-slate-800 dark:border-[#343b47] dark:text-slate-100"
            maxLength={kind === 'owners' ? 80 : 60}
            onChange={(event) => setName(event.target.value)}
            placeholder={`Enter ${kind === 'owners' ? 'team owner' : 'workstream'} name`}
            value={name}
          />
          <button
            className="rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-[#343b47] dark:text-slate-200"
            disabled={!name.trim() || busy}
            type="submit"
          >
            Save
          </button>
        </form>
      )}
      <ul className="grid gap-1">
        {options.map((option) => (
          <li className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-[#242a33]" key={option}>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{option}</span>
            <button
              aria-label={`Remove ${option}`}
              className="grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
              disabled={busy}
              onClick={() => remove(option)}
              type="button"
            >
              <Icon className="size-4" name="trash" />
            </button>
          </li>
        ))}
        {!options.length && <li className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-[#343b47]">No {label.toLowerCase()} added yet.</li>}
      </ul>
      {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </section>
  );
}

export default function ManageOptionsDialog({ workstreams, owners, onAdd, onRemove, onClose, initialAddKind }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        aria-labelledby="manage-options-title"
        aria-modal="true"
        className="my-auto grid max-h-[min(90vh,850px)] w-full max-w-xl gap-5 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#343b47] dark:bg-[#14171c]"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">Optima Close-out / Settings</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white" id="manage-options-title">Manage workstreams and team owners</h2>
          </div>
          <button aria-label="Close settings" className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#242a33]" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </header>
        <OptionList initialAdding={initialAddKind === 'workstreams'} kind="workstreams" label="Workstreams" onAdd={onAdd} onRemove={onRemove} options={workstreams} />
        <div className="border-t border-slate-100 pt-5 dark:border-[#242a33]">
          <OptionList initialAdding={initialAddKind === 'owners'} kind="owners" label="Team owners" onAdd={onAdd} onRemove={onRemove} options={owners} />
        </div>
      </section>
    </div>
  );
}
