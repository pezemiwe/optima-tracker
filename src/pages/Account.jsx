import { useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { ColorPicker } from '../components/ProjectModals.jsx';
import { Avatar, useToast } from '../components/ui.jsx';
import { Link } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';

export default function Account() {
  const { user, updateUser, theme, setTheme, workspaces, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.color);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const back = workspaces[0] ? `/w/${workspaces[0].slug}` : '/welcome';

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    try { const r = await api.patch('/auth/me', { name, color }); updateUser(r.user); toast.success('Profile updated'); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  async function changePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pw.next !== pw.again) { setPwError('The new passwords do not match.'); return; }
    setPwBusy(true);
    try { await api.post('/auth/password', { current: pw.current, next: pw.next }); setPw({ current: '', next: '', again: '' }); toast.success('Password changed. Other devices were signed out.'); } catch (err) { setPwError(err.message); } finally { setPwBusy(false); }
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900 dark:bg-[#0c0e11] dark:text-slate-100">
      <div className="mx-auto max-w-[720px] px-4 py-10">
        <Link className="muted mb-4 inline-flex items-center gap-1 text-sm hover:underline" to={back}><Icon className="size-4" name="chevronLeft" />Back to workspace</Link>
        <h1 className="page-title">Your account</h1>

        <section className="surface mt-6 p-5">
          <h2 className="font-semibold">Profile</h2>
          <form className="mt-4 grid gap-4" onSubmit={saveProfile}>
            <div className="flex items-center gap-4"><Avatar size={56} user={{ name, color }} /><div className="min-w-0"><p className="truncate font-medium">{user.email}</p><p className="faint text-xs">Your email is your sign-in and cannot be changed here.</p></div></div>
            <div><label className="field-label" htmlFor="acc-name">Display name</label><input className="input" id="acc-name" maxLength={80} onChange={(e) => setName(e.target.value)} value={name} /></div>
            <div><span className="field-label">Avatar colour</span><ColorPicker onChange={setColor} value={color} /></div>
            <div><button className="btn btn-primary" disabled={busy || !name.trim() || (name === user.name && color === user.color)} type="submit">Save profile</button></div>
          </form>
        </section>

        <section className="surface mt-6 p-5">
          <h2 className="font-semibold">Appearance</h2>
          <div className="mt-4 grid max-w-sm grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {[['system', 'Match device', 'layers'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([v, label, icon]) => (
              <button aria-checked={theme === v} className={`btn flex-col !h-16 gap-1 ${theme === v ? '!border-[#86bc25]' : ''}`} key={v} onClick={() => setTheme(v)} role="radio" type="button"><Icon name={icon} />{label}</button>
            ))}
          </div>
        </section>

        <section className="surface mt-6 p-5">
          <h2 className="font-semibold">Change password</h2>
          <form className="mt-4 grid max-w-sm gap-4" onSubmit={changePassword}>
            <div><label className="field-label" htmlFor="pw-cur">Current password</label><input autoComplete="current-password" className="input" id="pw-cur" onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} type="password" value={pw.current} /></div>
            <div><label className="field-label" htmlFor="pw-new">New password</label><input autoComplete="new-password" className="input" id="pw-new" onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder="At least 8 characters" type="password" value={pw.next} /></div>
            <div><label className="field-label" htmlFor="pw-again">Repeat new password</label><input autoComplete="new-password" className="input" id="pw-again" onChange={(e) => setPw((p) => ({ ...p, again: e.target.value }))} type="password" value={pw.again} /></div>
            {pwError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">{pwError}</p>}
            <div><button className="btn btn-primary" disabled={pwBusy || !pw.current || pw.next.length < 8} type="submit">Change password</button></div>
            <p className="faint text-xs">Changing your password signs you out of every other device.</p>
          </form>
        </section>

        <div className="mt-6"><button className="btn" onClick={signOut} type="button"><Icon className="size-4" name="logout" />Sign out</button></div>
      </div>
    </div>
  );
}
