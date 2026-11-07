import { useState } from 'react';
import { api } from '../api.js';
import { Modal, UserSelect, useToast } from './ui.jsx';
import { useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useWorkspace } from '../state/workspace.jsx';

export const PALETTE = ['#65a30d', '#2563eb', '#d97706', '#7c3aed', '#0d9488', '#e11d48', '#475569', '#0891b2', '#db2777', '#ea580c'];

export function ColorPicker({ value, onChange, label = 'Colour' }) {
  return (
    <div aria-label={label} className="flex flex-wrap gap-2" role="radiogroup">
      {PALETTE.map((c) => (
        <button aria-checked={value === c} aria-label={c} className={`size-7 rounded-full ring-offset-2 transition dark:ring-offset-[#14171c] ${value === c ? 'ring-2 ring-slate-900 dark:ring-white' : 'hover:scale-110'}`} key={c} onClick={() => onChange(c)} role="radio" style={{ background: c }} type="button" />
      ))}
    </div>
  );
}

function suggestKey(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().split(/\s+/).filter(Boolean);
  let key = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] || '').slice(0, 4);
  key = key.replace(/^[0-9]+/, '').slice(0, 6);
  return key;
}

export function NewProjectModal({ onClose }) {
  const { workspace, members, projects, sync } = useWorkspace();
  const { navigate } = useRoute();
  const toast = useToast();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PALETTE[projects.length % PALETTE.length]);
  const [leadId, setLeadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shownKey = keyTouched ? key : suggestKey(name);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { project } = await api.post(`/workspaces/${workspace.id}/projects`, {
        name, key: shownKey || undefined, description, color, ...(leadId ? { leadId } : {}),
      });
      await sync();
      toast.success(`Created project ${project.name}`);
      onClose();
      navigate(`/w/${workspace.slug}/p/${project.key}/list`);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal
      footer={(
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || busy} form="new-project-form" type="submit">{busy ? 'Creating…' : 'Create project'}</button>
        </>
      )}
      onClose={onClose}
      title="New project"
    >
      <form className="grid gap-4" id="new-project-form" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
          <div><label className="field-label" htmlFor="np-name">Project name</label><input autoFocus className="input" id="np-name" maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website redesign" value={name} /></div>
          <div><label className="field-label" htmlFor="np-key">Key</label><input className="input font-mono uppercase" id="np-key" maxLength={8} onChange={(e) => { setKey(e.target.value.toUpperCase()); setKeyTouched(true); }} placeholder="WEB" value={shownKey} /></div>
        </div>
        <div><label className="field-label" htmlFor="np-desc">Description <span className="faint">(optional)</span></label><textarea className="input" id="np-desc" maxLength={2000} onChange={(e) => setDescription(e.target.value)} value={description} /></div>
        <div><span className="field-label">Colour</span><ColorPicker onChange={setColor} value={color} /></div>
        <div><span className="field-label">Project lead <span className="faint">(optional)</span></span><UserSelect className="btn w-full justify-start" members={members} noneLabel="No lead" onChange={setLeadId} value={leadId} /></div>
        <p className="faint text-xs">Tasks will be numbered {shownKey || 'KEY'}-1, {shownKey || 'KEY'}-2 and so on. The key cannot be changed later.</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

export function NewWorkspaceModal({ onClose }) {
  const { addWorkspace } = useAuth();
  const { navigate } = useRoute();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { workspace } = await api.post('/workspaces', { name });
      addWorkspace(workspace);
      onClose();
      navigate(`/w/${workspace.slug}`);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal
      footer={(
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || busy} form="new-ws-form" type="submit">Create workspace</button>
        </>
      )}
      onClose={onClose}
      size="sm"
      title="New workspace"
    >
      <form id="new-ws-form" onSubmit={submit}>
        <label className="field-label" htmlFor="nw-name">Workspace name</label>
        <input autoFocus className="input" id="nw-name" maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance team" value={name} />
        <p className="faint mt-2 text-xs">A workspace has its own projects and members. You will be its owner.</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
