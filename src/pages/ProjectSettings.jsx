import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import Shell from '../components/Shell.jsx';
import { ColorPicker } from '../components/ProjectModals.jsx';
import { EmptyState, Modal, Select, Spinner, StatusDot, TypeToConfirm, UserSelect, useConfirm, useToast } from '../components/ui.jsx';
import { Link, useRoute } from '../router.jsx';
import { useProjectData, useWorkspace } from '../state/workspace.jsx';

const FIELD_TYPES = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Choice list' }, { value: 'checkbox', label: 'Checkbox' }];
const CATEGORIES = [{ value: 'todo', label: 'To do' }, { value: 'active', label: 'In progress' }, { value: 'done', label: 'Done' }];

function Section({ title, description, children, action }) {
  return (
    <section className="surface mb-6 p-5">
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2>{description && <p className="muted mt-1 text-sm">{description}</p>}</div>{action}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusRow({ s, index, total, onChange, onMove, onDelete }) {
  const [name, setName] = useState(s.name);
  useEffect(() => setName(s.name), [s.name]);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <div className="flex flex-col"><button aria-label={`Move ${s.name} up`} className="icon-btn size-5" disabled={index === 0} onClick={() => onMove(index, -1)} type="button"><Icon className="size-3.5" name="chevronUp" /></button><button aria-label={`Move ${s.name} down`} className="icon-btn size-5" disabled={index === total - 1} onClick={() => onMove(index, 1)} type="button"><Icon className="size-3.5" name="chevronDown" /></button></div>
      <input aria-label="Status colour" className="size-8 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-0.5 dark:border-[#343b47]" onChange={(e) => onChange(s, { color: e.target.value })} type="color" value={s.color} />
      <input aria-label={`Name of ${s.name}`} className="input w-44" maxLength={40} onBlur={() => { const n = name.trim(); if (!n) setName(s.name); else if (n !== s.name) onChange(s, { name: n }); }} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} value={name} />
      <Select ariaLabel={`Category of ${s.name}`} className="btn w-36 justify-between" onChange={(category) => onChange(s, { category })} options={CATEGORIES} value={s.category} />
      <button aria-label={`Delete ${s.name}`} className="icon-btn ml-auto" onClick={() => onDelete(s)} type="button"><Icon name="trash" /></button>
    </li>
  );
}

function LabelRow({ l, onChange, onDelete }) {
  const [name, setName] = useState(l.name);
  useEffect(() => setName(l.name), [l.name]);
  return (
    <li className="flex items-center gap-2 py-2.5">
      <input aria-label="Label colour" className="size-8 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-0.5 dark:border-[#343b47]" onChange={(e) => onChange(l, { color: e.target.value })} type="color" value={l.color} />
      <input aria-label={`Name of label ${l.name}`} className="input w-56" maxLength={40} onBlur={() => { const n = name.trim(); if (!n) setName(l.name); else if (n !== l.name) onChange(l, { name: n }); }} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} value={name} />
      <button aria-label={`Delete label ${l.name}`} className="icon-btn ml-auto" onClick={() => onDelete(l)} type="button"><Icon name="trash" /></button>
    </li>
  );
}

function FieldRow({ f, onRename, onChoices, onDelete }) {
  const [name, setName] = useState(f.name);
  const [choices, setChoices] = useState(f.options.join(', '));
  useEffect(() => { setName(f.name); setChoices(f.options.join(', ')); }, [f.name, f.options]);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <input aria-label={`Name of field ${f.name}`} className="input w-52" maxLength={40} onBlur={() => { const n = name.trim(); if (!n) setName(f.name); else if (n !== f.name) onRename(f, n); }} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} value={name} />
      <span className="chip">{FIELD_TYPES.find((t) => t.value === f.type)?.label}</span>
      {f.type === 'select' && <input aria-label={`Choices for ${f.name}`} className="input min-w-48 flex-1" onBlur={() => { const list = choices.split(',').map((c) => c.trim()).filter(Boolean); if (list.join('|') !== f.options.join('|')) onChoices(f, list); }} onChange={(e) => setChoices(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="Comma separated, e.g. Low, Medium, High" value={choices} />}
      <button aria-label={`Delete field ${f.name}`} className="icon-btn ml-auto" onClick={() => onDelete(f)} type="button"><Icon name="trash" /></button>
    </li>
  );
}

function ProjectSettingsBody({ projectKey }) {
  const { workspace, members, sync } = useWorkspace();
  const { navigate } = useRoute();
  const pd = useProjectData(projectKey);
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState(null);
  const [newStatus, setNewStatus] = useState({ name: '', category: 'active' });
  const [newLabel, setNewLabel] = useState('');
  const [newField, setNewField] = useState({ name: '', type: 'text', options: '' });
  const [moveFor, setMoveFor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (pd.project) setForm({ name: pd.project.name, description: pd.project.description, color: pd.project.color, leadId: pd.project.leadId }); }, [pd.project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pd.notFound && !pd.loading) return <EmptyState icon="folder" title="Project not found" />;
  if (!pd.ready || !form) return <div className="grid place-items-center py-24"><Spinner className="size-7" /></div>;

  const run = async (fn, ok) => {
    try { await fn(); await sync(); await pd.reload(); if (ok) toast.success(ok); } catch (e) { toast.error(e.message); }
  };
  const dirty = form.name !== pd.project.name || form.description !== pd.project.description || form.color !== pd.project.color || form.leadId !== pd.project.leadId;
  const taskCount = (statusId) => pd.tasks.filter((t) => t.statusId === statusId).length;

  async function saveGeneral(e) {
    e.preventDefault();
    setBusy(true);
    await run(() => api.patch(`/projects/${pd.project.id}`, { name: form.name, description: form.description, color: form.color, leadId: form.leadId }), 'Project updated');
    setBusy(false);
  }
  const moveStatus = (index, dir) => {
    const ids = pd.statuses.map((s) => s.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    run(() => api.post(`/projects/${pd.project.id}/statuses/reorder`, { ids }));
  };
  async function deleteStatus(s) {
    if (taskCount(s.id) > 0) { setMoveFor(s); return; }
    const ok = await confirm({ title: `Delete the “${s.name}” status?`, message: 'No tasks use it.', confirmLabel: 'Delete', danger: true });
    if (ok) run(() => api.del(`/statuses/${s.id}`));
  }
  async function deleteLabel(l) {
    const ok = await confirm({ title: `Delete the “${l.name}” label?`, message: 'It is removed from every task that has it.', confirmLabel: 'Delete', danger: true });
    if (ok) run(() => api.del(`/labels/${l.id}`));
  }
  async function toggleArchive() {
    if (!pd.project.archived) {
      const ok = await confirm({ title: 'Archive this project?', message: 'It becomes read-only and moves to the Archived list. You can restore it any time.', confirmLabel: 'Archive' });
      if (!ok) return;
    }
    run(() => api.patch(`/projects/${pd.project.id}`, { archived: !pd.project.archived }), pd.project.archived ? 'Project restored' : 'Project archived');
  }
  async function destroy() {
    try {
      await api.del(`/projects/${pd.project.id}`, { confirmName: pd.project.name });
      await sync();
      navigate(`/w/${workspace.slug}`, { replace: true });
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 lg:px-8">
      <Link className="muted mb-3 inline-flex items-center gap-1 text-sm hover:underline" to={`/w/${workspace.slug}/p/${projectKey}/list`}><Icon className="size-4" name="chevronLeft" />Back to {pd.project.name}</Link>
      <h1 className="page-title">Project settings</h1>

      <div className="mt-6">
        <Section title="General">
          <form className="grid gap-4" onSubmit={saveGeneral}>
            <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
              <div><label className="field-label" htmlFor="ps-name">Name</label><input className="input" id="ps-name" maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} value={form.name} /></div>
              <div><label className="field-label" htmlFor="ps-key">Key</label><input className="input font-mono" disabled id="ps-key" value={pd.project.key} /></div>
            </div>
            <div><label className="field-label" htmlFor="ps-desc">Description</label><textarea className="input" id="ps-desc" maxLength={2000} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} value={form.description} /></div>
            <div><span className="field-label">Colour</span><ColorPicker onChange={(color) => setForm((f) => ({ ...f, color }))} value={form.color} /></div>
            <div className="max-w-xs"><span className="field-label">Project lead</span><UserSelect className="btn w-full justify-start" members={members} noneLabel="No lead" onChange={(leadId) => setForm((f) => ({ ...f, leadId }))} value={form.leadId} /></div>
            <div><button className="btn btn-primary" disabled={!dirty || busy || !form.name.trim()} type="submit">Save changes</button></div>
          </form>
        </Section>

        <Section description="Statuses are the columns on your board. Each belongs to a category so reports know what counts as done." title="Statuses">
          <ul className="divide-y divide-line">
            {pd.statuses.map((s, i) => <StatusRow index={i} key={s.id} onChange={(st, changes) => run(() => api.patch(`/statuses/${st.id}`, changes))} onDelete={deleteStatus} onMove={moveStatus} s={s} total={pd.statuses.length} />)}
          </ul>
          <form className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/projects/${pd.project.id}/statuses`, newStatus), 'Status added').then(() => setNewStatus((n) => ({ ...n, name: '' }))); }}>
            <input aria-label="New status name" className="input w-52" maxLength={40} onChange={(e) => setNewStatus((n) => ({ ...n, name: e.target.value }))} placeholder="New status name" value={newStatus.name} />
            <Select ariaLabel="New status category" className="btn w-36 justify-between" onChange={(category) => setNewStatus((n) => ({ ...n, category }))} options={CATEGORIES} value={newStatus.category} />
            <button className="btn" disabled={!newStatus.name.trim()} type="submit"><Icon className="size-4" name="add" />Add status</button>
          </form>
        </Section>

        <Section description="Labels categorise tasks. Anyone who can edit tasks can add a label; only admins can rename or delete them." title="Labels">
          <ul className="divide-y divide-line">
            {pd.labels.map((l) => <LabelRow key={l.id} l={l} onChange={(label, changes) => run(() => api.patch(`/labels/${label.id}`, changes))} onDelete={deleteLabel} />)}
            {!pd.labels.length && <li className="faint py-2 text-sm">No labels yet.</li>}
          </ul>
          <form className="mt-3 flex gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/projects/${pd.project.id}/labels`, { name: newLabel }), 'Label added').then(() => setNewLabel('')); }}>
            <input aria-label="New label name" className="input w-52" maxLength={40} onChange={(e) => setNewLabel(e.target.value)} placeholder="New label name" value={newLabel} />
            <button className="btn" disabled={!newLabel.trim()} type="submit"><Icon className="size-4" name="add" />Add label</button>
          </form>
        </Section>

        <Section description="Extra information on every task, such as a customer, a budget or a region. Admins define the fields; anyone who can edit tasks fills them in." title="Custom fields">
          <ul className="divide-y divide-line">
            {pd.fields.map((f) => <FieldRow f={f} key={f.id} onChoices={(field, list) => run(() => api.patch(`/fields/${field.id}`, { options: list }))} onDelete={async (field) => { const ok = await confirm({ title: `Delete the “${field.name}” field?`, message: 'Its values are removed from every task.', confirmLabel: 'Delete field', danger: true }); if (ok) run(() => api.del(`/fields/${field.id}`)); }} onRename={(field, n) => run(() => api.patch(`/fields/${field.id}`, { name: n }))} />)}
            {!pd.fields.length && <li className="faint py-2 text-sm">No custom fields yet.</li>}
          </ul>
          <form className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); const options = newField.options.split(',').map((c) => c.trim()).filter(Boolean); run(() => api.post(`/projects/${pd.project.id}/fields`, { name: newField.name, type: newField.type, ...(newField.type === 'select' ? { options } : {}) }), 'Field added').then(() => setNewField((n) => ({ ...n, name: '', options: '' }))); }}>
            <input aria-label="New field name" className="input w-52" maxLength={40} onChange={(e) => setNewField((n) => ({ ...n, name: e.target.value }))} placeholder="New field name" value={newField.name} />
            <Select ariaLabel="New field type" className="btn w-40 justify-between" onChange={(type) => setNewField((n) => ({ ...n, type }))} options={FIELD_TYPES} value={newField.type} />
            {newField.type === 'select' && <input aria-label="New field choices" className="input min-w-48 flex-1" onChange={(e) => setNewField((n) => ({ ...n, options: e.target.value }))} placeholder="Choices, comma separated" value={newField.options} />}
            <button className="btn" disabled={!newField.name.trim() || (newField.type === 'select' && !newField.options.trim())} type="submit"><Icon className="size-4" name="add" />Add field</button>
          </form>
        </Section>

        <Section title="Archive or delete">
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={toggleArchive} type="button"><Icon className="size-4" name="archive" />{pd.project.archived ? 'Restore project' : 'Archive project'}</button>
            <button className="btn btn-danger" onClick={() => setDeleting(true)} type="button"><Icon className="size-4" name="trash" />Delete project</button>
          </div>
        </Section>
      </div>

      {moveFor && (
        <Modal footer={<button className="btn" onClick={() => setMoveFor(null)} type="button">Cancel</button>} onClose={() => setMoveFor(null)} size="sm" title={`Delete “${moveFor.name}”`}>
          <p className="muted text-sm">{taskCount(moveFor.id)} task(s) use this status. Choose where they should go.</p>
          <div className="mt-4 grid gap-1">
            {pd.statuses.filter((s) => s.id !== moveFor.id).map((s) => (
              <button className="menu-item border border-line" key={s.id} onClick={() => { const from = moveFor; setMoveFor(null); run(() => api.del(`/statuses/${from.id}?moveTo=${s.id}`), 'Status deleted'); }} type="button"><StatusDot color={s.color} />Move to {s.name}</button>
            ))}
          </div>
        </Modal>
      )}
      {deleting && <TypeToConfirm name={pd.project.name} noun="project" onClose={() => setDeleting(false)} onConfirm={destroy} />}
    </div>
  );
}

export default function ProjectSettings({ projectKey }) {
  const { isAdmin, workspace, projects } = useWorkspace();
  const project = projects.find((p) => p.key === projectKey);
  return (
    <Shell crumbs={[{ label: project?.name || projectKey, to: `/w/${workspace.slug}/p/${projectKey}/list` }, { label: 'Settings' }]}>
      {isAdmin
        ? <ProjectSettingsBody projectKey={projectKey} />
        : <EmptyState action={<Link className="btn" to={`/w/${workspace.slug}/p/${projectKey}/list`}>Back to project</Link>} icon="settings" title="Admins only">Only workspace admins can change project settings.</EmptyState>}
    </Shell>
  );
}
