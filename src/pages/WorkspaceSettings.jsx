import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import Shell from '../components/Shell.jsx';
import { Avatar, Modal, Select, TypeToConfirm, useConfirm, useToast } from '../components/ui.jsx';
import { formatDay } from '../lib/dates.mjs';
import { useQueryParam, useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useWorkspace } from '../state/workspace.jsx';

const ROLES = [
  { value: 'owner', label: 'Owner', help: 'Everything, including deleting the workspace and managing owners.' },
  { value: 'admin', label: 'Admin', help: 'Manage members, projects, statuses and labels.' },
  { value: 'member', label: 'Member', help: 'Create and edit tasks, comment, and create projects.' },
  { value: 'viewer', label: 'Viewer', help: 'Read-only access.' },
];

function Section({ title, description, children }) {
  return (
    <section className="surface mb-6 p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="muted mt-1 text-sm">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function General() {
  const { workspace, isAdmin, isOwner, sync } = useWorkspace();
  const { renameWorkspace, removeWorkspace, workspaces, user } = useAuth();
  const { navigate } = useRoute();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(workspace.name);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function rename(e) {
    e.preventDefault();
    setBusy(true);
    try { await api.patch(`/workspaces/${workspace.id}`, { name }); renameWorkspace(workspace.id, name.trim()); await sync(); toast.success('Workspace renamed'); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function leave() {
    const ok = await confirm({ title: 'Leave this workspace?', message: 'Your tasks will be unassigned and you will lose access until someone invites you again.', confirmLabel: 'Leave', danger: true });
    if (!ok) return;
    try {
      await api.del(`/workspaces/${workspace.id}/members/${user.id}`);
      removeWorkspace(workspace.id);
      const next = workspaces.find((w) => w.id !== workspace.id);
      navigate(next ? `/w/${next.slug}` : '/welcome', { replace: true });
    } catch (err) { toast.error(err.message); }
  }
  async function destroy() {
    try {
      await api.del(`/workspaces/${workspace.id}`, { confirmName: workspace.name });
      removeWorkspace(workspace.id);
      const next = workspaces.find((w) => w.id !== workspace.id);
      navigate(next ? `/w/${next.slug}` : '/welcome', { replace: true });
    } catch (err) { toast.error(err.message); }
  }

  return (
    <>
      <Section title="Workspace name">
        <form className="flex max-w-md gap-2" onSubmit={rename}>
          <input aria-label="Workspace name" className="input" disabled={!isAdmin} maxLength={80} onChange={(e) => setName(e.target.value)} value={name} />
          {isAdmin && <button className="btn btn-primary" disabled={busy || !name.trim() || name.trim() === workspace.name} type="submit">Save</button>}
        </form>
      </Section>
      <Section description="Permissions are set by role." title="Roles">
        <dl className="grid gap-3 sm:grid-cols-2">{ROLES.map((r) => <div key={r.value}><dt className="text-sm font-semibold">{r.label}</dt><dd className="muted text-sm">{r.help}</dd></div>)}</dl>
      </Section>
      <Section title="Leave or delete">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-danger" onClick={leave} type="button"><Icon className="size-4" name="logout" />Leave workspace</button>
          {isOwner && <button className="btn btn-danger" onClick={() => setDeleting(true)} type="button"><Icon className="size-4" name="trash" />Delete workspace</button>}
        </div>
      </Section>
      {deleting && <TypeToConfirm name={workspace.name} noun="workspace" onClose={() => setDeleting(false)} onConfirm={destroy} />}
    </>
  );
}

function Members() {
  const { workspace, members, isAdmin, isOwner, sync } = useWorkspace();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [invites, setInvites] = useState([]);
  const [form, setForm] = useState({ email: '', role: 'member', placeholderUserId: null });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [resetLink, setResetLink] = useState(null);

  const loadInvites = useCallback(() => {
    if (isAdmin) api.get(`/workspaces/${workspace.id}/invites`).then((r) => setInvites(r.invites)).catch(() => {});
  }, [workspace.id, isAdmin]);
  useEffect(() => { loadInvites(); }, [loadInvites]);

  const placeholders = members.filter((m) => m.isPlaceholder);
  const roleOptions = ROLES.filter((r) => isOwner || r.value !== 'owner').map((r) => ({ value: r.value, label: r.label }));

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(`/workspaces/${workspace.id}/invites`, { email: form.email, role: form.role, ...(form.placeholderUserId ? { placeholderUserId: form.placeholderUserId } : {}) });
      setCreated({ email: form.email, link: `${window.location.origin}${r.path}`, emailed: r.emailed });
      setForm({ email: '', role: 'member', placeholderUserId: null });
      loadInvites();
      await sync();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function setRole(m, role) {
    try { await api.patch(`/workspaces/${workspace.id}/members/${m.id}`, { role }); await sync(); } catch (err) { toast.error(err.message); }
  }
  async function remove(m) {
    const ok = await confirm({ title: `Remove ${m.name}?`, message: 'Their tasks become unassigned. Their comments and history stay.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try { await api.del(`/workspaces/${workspace.id}/members/${m.id}`); await sync(); } catch (err) { toast.error(err.message); }
  }
  async function makeResetLink(m) {
    try {
      const r = await api.post(`/workspaces/${workspace.id}/members/${m.id}/reset-link`);
      setResetLink({ name: m.name, link: `${window.location.origin}${r.path}` });
    } catch (err) { toast.error(err.message); }
  }
  async function revoke(i) {
    try { await api.del(`/workspaces/${workspace.id}/invites/${i.id}`); loadInvites(); } catch (err) { toast.error(err.message); }
  }
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success('Link copied'); } catch { toast.error('Could not copy. Select the link and copy it manually.'); } };

  return (
    <>
      {isAdmin && (
        <Section description="Invitations are links. Send the link to your teammate; it works once, for that email address, for 14 days." title="Invite someone">
          <form className="grid gap-3 md:grid-cols-[minmax(0,2fr)_150px_minmax(0,1.5fr)_auto]" onSubmit={invite}>
            <input aria-label="Email address" className="input" onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@company.com" required type="email" value={form.email} />
            <Select ariaLabel="Role" className="btn justify-between" onChange={(role) => setForm((f) => ({ ...f, role }))} options={roleOptions.filter((r) => r.value !== 'owner')} value={form.role} />
            {placeholders.length > 0
              ? <Select ariaLabel="Claim an imported person" className="btn justify-between" onChange={(placeholderUserId) => setForm((f) => ({ ...f, placeholderUserId }))} options={[{ value: null, label: 'New person' }, ...placeholders.map((p) => ({ value: p.id, label: `Is ${p.name}`, node: <Avatar size={18} user={p} /> }))]} value={form.placeholderUserId} />
              : <span />}
            <button className="btn btn-primary" disabled={busy || !form.email} type="submit">Create invite</button>
          </form>
          {placeholders.length > 0 && <p className="faint mt-2 text-xs">Names imported from the close-out checklist can be claimed, so their existing tasks move to the real account.</p>}
          {created && (
            <div className="mt-4 rounded-lg border border-[#86bc25]/50 bg-[#86bc25]/10 p-3 text-sm" role="status">
              <p className="font-medium">{created.emailed ? `We emailed ${created.email}. ` : ''}Invite for {created.email} is ready. {created.emailed ? 'You can also share this link; it is shown only once.' : 'Copy the link now. It is shown only once.'}</p>
              <div className="mt-2 flex gap-2"><input aria-label="Invite link" className="input font-mono text-xs" onFocus={(e) => e.target.select()} readOnly value={created.link} /><button className="btn" onClick={() => copy(created.link)} type="button"><Icon className="size-4" name="copy" />Copy</button></div>
            </div>
          )}
          {invites.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Pending invitations</h3>
              <ul className="divide-y divide-line">
                {invites.map((i) => (
                  <li className="flex items-center gap-3 py-2 text-sm" key={i.id}>
                    <Icon className="size-4 text-slate-400" name="inbox" /><span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <span className="chip capitalize">{i.role}</span><span className="faint hidden text-xs sm:inline">expires {formatDay(i.expiresAt.slice(0, 10))}</span>
                    <button className="btn btn-sm btn-danger" onClick={() => revoke(i)} type="button">Revoke</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      <Section title={`Members (${members.length})`}>
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const self = m.id === user.id;
            const locked = !isAdmin || (m.role === 'owner' && !isOwner);
            return (
              <li className="flex flex-wrap items-center gap-3 py-3" key={m.id}>
                <Avatar size={34} user={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.name}{self && <span className="faint font-normal"> (you)</span>}</p>
                  <p className="muted truncate text-xs">{m.isPlaceholder ? 'Imported from the checklist. Has not signed up' : (m.email || 'Email hidden')}</p>
                </div>
                {locked
                  ? <span className="chip capitalize">{m.role}</span>
                  : <Select ariaLabel={`Role for ${m.name}`} className="btn btn-sm w-28 justify-between" onChange={(role) => setRole(m, role)} options={roleOptions} value={m.role} />}
                {isAdmin && !self && !m.isPlaceholder && !(m.role === 'owner' && !isOwner) && <button aria-label={`Create a password reset link for ${m.name}`} className="btn btn-sm" onClick={() => makeResetLink(m)} type="button">Reset link</button>}
                {isAdmin && !self && !(m.role === 'owner' && !isOwner) && <button aria-label={`Remove ${m.name}`} className="icon-btn" onClick={() => remove(m)} type="button"><Icon name="trash" /></button>}
              </li>
            );
          })}
        </ul>
      </Section>
      {resetLink && (
        <Modal footer={<button className="btn" onClick={() => setResetLink(null)} type="button">Done</button>} onClose={() => setResetLink(null)} size="sm" title={`Password reset for ${resetLink.name}`}>
          <p className="muted text-sm">Send this link to {resetLink.name}. It works once and expires in 24 hours. Anyone with the link can set the password, so share it privately.</p>
          <div className="mt-3 flex gap-2"><input aria-label="Reset link" className="input font-mono text-xs" onFocus={(e) => e.target.select()} readOnly value={resetLink.link} /><button className="btn" onClick={() => copy(resetLink.link)} type="button"><Icon className="size-4" name="copy" />Copy</button></div>
        </Modal>
      )}
    </>
  );
}

export default function WorkspaceSettings() {
  const { isAdmin } = useWorkspace();
  const [tab, setTab] = useQueryParam('tab');
  const active = tab === 'general' ? 'general' : 'members';
  return (
    <Shell crumbs={[{ label: isAdmin ? 'Workspace settings' : 'Members' }]}>
      <div className="mx-auto max-w-[900px] px-4 py-8 lg:px-8">
        <h1 className="page-title">{isAdmin ? 'Workspace settings' : 'Members'}</h1>
        <div className="mb-6 mt-5 flex border-b border-line" role="tablist">
          <button aria-selected={active === 'members'} className="tab" onClick={() => setTab('members', { replace: true })} role="tab" type="button"><Icon className="size-4" name="users" />Members</button>
          <button aria-selected={active === 'general'} className="tab" onClick={() => setTab('general', { replace: true })} role="tab" type="button"><Icon className="size-4" name="settings" />General</button>
        </div>
        {active === 'general' ? <General /> : <Members />}
      </div>
    </Shell>
  );
}
