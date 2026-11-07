import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Spinner, useToast } from '../components/ui.jsx';
import { Link, useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';

export function defaultWorkspacePath(workspaces) {
  let last = null;
  try { last = localStorage.getItem('optima-last-ws'); } catch { /* optional */ }
  const ws = workspaces.find((w) => w.slug === last) || workspaces[0];
  return ws ? `/w/${ws.slug}` : '/welcome';
}

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-[#f4f5f7] text-slate-900 dark:bg-[#0c0e11] dark:text-slate-100 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[#0b0d10] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative grid size-9 place-items-center rounded-lg bg-[#86bc25] after:absolute after:size-2.5 after:rounded-full after:bg-black" />
          <span className="text-lg font-semibold tracking-tight">Optima Work Tracker</span>
        </div>
        <div>
          <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Plan the work. Track it to done.</h2>
          <ul className="mt-8 grid max-w-md gap-4 text-slate-300">
            {[['board', 'Lists, boards and calendars for every project'], ['users', 'Assign work, mention teammates and follow progress'], ['bell', 'Notifications and a full activity trail on every task']].map(([icon, text]) => (
              <li className="flex items-center gap-3" key={text}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-[#a6d95a]"><Icon name={icon} /></span>{text}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-slate-400">Zenith Optima · Close-out programme</p>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[#86bc25]/10 blur-3xl" />
      </aside>
      <main className="grid place-items-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="relative grid size-9 place-items-center rounded-lg bg-[#86bc25] after:absolute after:size-2.5 after:rounded-full after:bg-black" />
            <span className="text-lg font-semibold tracking-tight">Optima Work Tracker</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="muted mt-1.5 text-sm">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="muted mt-6 text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

function Field({ label, id, error, children }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}{error && <p className="mt-1 text-xs text-red-600">{error}</p>}</div>;
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input autoComplete={autoComplete} className="input h-10 pr-10" id={id} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={shown ? 'text' : 'password'} value={value} />
      <button aria-label={shown ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={() => setShown((s) => !s)} type="button"><Icon className="size-4" name="eye" /></button>
    </div>
  );
}

const FormError = ({ message }) => (message ? <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert"><Icon className="mt-0.5 size-4 shrink-0" name="warning" />{message}</p> : null);

export function LoginPage({ inviteEmail, onDone, subtitle }) {
  const { signedIn, needsSetup } = useAuth();
  const { navigate } = useRoute();
  const [email, setEmail] = useState(inviteEmail || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = await api.post('/auth/login', { email, password });
      signedIn(payload);
      if (onDone) await onDone(payload);
      else if (window.location.pathname === '/' || window.location.pathname === '/login') navigate(defaultWorkspacePath(payload.workspaces), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const form = (
    <form className="grid gap-4" onSubmit={submit}>
      <Field id="email" label="Email"><input autoComplete="email" autoFocus={!inviteEmail} className="input h-10" disabled={Boolean(inviteEmail)} id="email" onChange={(e) => setEmail(e.target.value)} type="email" value={email} /></Field>
      <Field id="password" label="Password"><PasswordInput autoComplete="current-password" id="password" onChange={setPassword} value={password} /></Field>
      <FormError message={error} />
      <button className="btn btn-primary h-10" disabled={busy || !email || !password} type="submit">{busy ? <Spinner className="size-4" /> : 'Sign in'}</button>
      {!inviteEmail && <Link className="text-center text-sm font-medium text-[#4a7a0a] hover:underline dark:text-[#a6d95a]" to="/forgot">Forgot your password?</Link>}
    </form>
  );
  if (onDone) return form;
  return (
    <AuthLayout footer={needsSetup ? <>First time here? <Link className="font-medium text-[#4a7a0a] hover:underline dark:text-[#a6d95a]" to="/setup">Set up the workspace</Link>.</> : <>Sign-up is by invitation. Ask a workspace admin for an invite link.</>} subtitle={subtitle || 'Welcome back. Sign in to continue.'} title="Sign in">
      {form}
    </AuthLayout>
  );
}

export function SetupPage() {
  const { signedIn, needsSetup } = useAuth();
  const { navigate } = useRoute();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', workspaceName: 'Zenith Optima' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  if (!needsSetup) {
    return (
      <AuthLayout subtitle="This workspace is already set up." title="Already set up">
        <Link className="btn btn-primary w-full" to="/login">Go to sign in</Link>
      </AuthLayout>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = await api.post('/auth/register', form);
      signedIn(payload);
      if (payload.imported) toast.success(`Imported ${payload.imported} tasks from the original close-out checklist.`);
      navigate(defaultWorkspacePath(payload.workspaces), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout subtitle="Create the owner account. Your existing close-out data is imported automatically." title="Set up your workspace">
      <form className="grid gap-4" onSubmit={submit}>
        <Field id="ws" label="Workspace name"><input className="input h-10" id="ws" maxLength={80} onChange={(e) => set('workspaceName')(e.target.value)} value={form.workspaceName} /></Field>
        <Field id="name" label="Your name"><input autoComplete="name" autoFocus className="input h-10" id="name" maxLength={80} onChange={(e) => set('name')(e.target.value)} value={form.name} /></Field>
        <Field id="email" label="Work email"><input autoComplete="email" className="input h-10" id="email" onChange={(e) => set('email')(e.target.value)} type="email" value={form.email} /></Field>
        <Field id="password" label="Password"><PasswordInput autoComplete="new-password" id="password" onChange={set('password')} placeholder="At least 8 characters" value={form.password} /></Field>
        <FormError message={error} />
        <button className="btn btn-primary h-10" disabled={busy || !form.name.trim() || !form.email || form.password.length < 8 || !form.workspaceName.trim()} type="submit">{busy ? <Spinner className="size-4" /> : 'Create workspace'}</button>
      </form>
    </AuthLayout>
  );
}

export function InvitePage({ token }) {
  const { user, signedIn, signOut } = useAuth();
  const { navigate } = useRoute();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', password: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/invites/${encodeURIComponent(token)}`).then(setInvite).catch((e) => setError(e.message));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = await api.post(`/invites/${encodeURIComponent(token)}/accept`);
      signedIn(payload);
      const ws = payload.workspaces.find((w) => w.name === invite.workspaceName) || payload.workspaces[0];
      navigate(ws ? `/w/${ws.slug}` : '/', { replace: true });
    } catch (e) { setError(e.message); setBusy(false); }
  };

  async function register(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = await api.post('/auth/register', { name: form.name, email: invite.email, password: form.password, inviteToken: token });
      signedIn(payload);
      const ws = payload.workspaces.find((w) => w.name === invite.workspaceName) || payload.workspaces[0];
      navigate(ws ? `/w/${ws.slug}` : '/', { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  if (error && !invite) {
    return <AuthLayout subtitle={error} title="Invitation unavailable"><Link className="btn w-full" to="/">Back to sign in</Link></AuthLayout>;
  }
  if (!invite) return <AuthLayout title="Loading invitation…"><Spinner /></AuthLayout>;

  const heading = `Join ${invite.workspaceName}`;
  const sub = `You have been invited as ${invite.role === 'admin' ? 'an' : 'a'} ${invite.role}. This invitation is for ${invite.email}.`;

  if (user) {
    const matches = user.email?.toLowerCase() === invite.email.toLowerCase();
    return (
      <AuthLayout subtitle={sub} title={heading}>
        {matches ? (
          <div className="grid gap-4"><FormError message={error} /><button className="btn btn-primary h-10" disabled={busy} onClick={accept} type="button">{busy ? <Spinner className="size-4" /> : `Join as ${user.name}`}</button></div>
        ) : (
          <div className="grid gap-4">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">You are signed in as {user.email}. Sign out and use {invite.email} to accept this invitation.</p>
            <button className="btn" onClick={signOut} type="button">Sign out</button>
          </div>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle={sub} title={heading}>
      {invite.hasAccount ? (
        <div className="grid gap-4"><p className="muted text-sm">You already have an account. Sign in to join.</p><LoginPage inviteEmail={invite.email} onDone={accept} /></div>
      ) : (
        <form className="grid gap-4" onSubmit={register}>
          <Field id="name" label="Your name"><input autoComplete="name" autoFocus className="input h-10" id="name" maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} value={form.name} /></Field>
          <Field id="email" label="Email"><input className="input h-10" disabled id="email" value={invite.email} /></Field>
          <Field id="password" label="Choose a password"><PasswordInput autoComplete="new-password" id="password" onChange={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="At least 8 characters" value={form.password} /></Field>
          <FormError message={error} />
          <button className="btn btn-primary h-10" disabled={busy || !form.name.trim() || form.password.length < 8} type="submit">{busy ? <Spinner className="size-4" /> : 'Create account and join'}</button>
        </form>
      )}
    </AuthLayout>
  );
}

/* A signed-in user who belongs to no workspace yet. */
export function WelcomePage() {
  const { user, pendingInvites, signOut, addWorkspace } = useAuth();
  const { navigate } = useRoute();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { workspace } = await api.post('/workspaces', { name });
      addWorkspace(workspace);
      navigate(`/w/${workspace.slug}`, { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <AuthLayout footer={<button className="font-medium text-[#4a7a0a] hover:underline dark:text-[#a6d95a]" onClick={signOut} type="button">Sign out</button>} subtitle={`Signed in as ${user.email}. Create a workspace, or ask an admin to invite you to one.`} title={`Welcome, ${user.name.split(' ')[0]}`}>
      {pendingInvites.length > 0 && <p className="mb-4 rounded-lg bg-[#86bc25]/10 px-3 py-2 text-sm">You have {pendingInvites.length} pending invitation{pendingInvites.length > 1 ? 's' : ''}. Open the invite link you were sent to join.</p>}
      <form className="grid gap-4" onSubmit={create}>
        <Field id="ws" label="Workspace name"><input autoFocus className="input h-10" id="ws" maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. My team" value={name} /></Field>
        <FormError message={error} />
        <button className="btn btn-primary h-10" disabled={busy || !name.trim()} type="submit">Create workspace</button>
      </form>
    </AuthLayout>
  );
}


export function ForgotPage() {
  const { emailEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await api.post('/auth/forgot', { email }); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const back = <Link className="font-medium text-[#4a7a0a] hover:underline dark:text-[#a6d95a]" to="/login">Back to sign in</Link>;
  if (!emailEnabled) {
    return (
      <AuthLayout footer={back} subtitle="Email is not set up for this workspace, so a reset link cannot be sent automatically." title="Reset your password">
        <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">Ask a workspace admin to create a reset link for you. They can do it from Workspace settings, under Members. The link works once and lasts 24 hours.</p>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout footer={back} subtitle="Enter your email and we will send you a link to choose a new password." title="Reset your password">
      {sent ? (
        <p className="rounded-lg bg-[#86bc25]/10 px-3 py-3 text-sm" role="status">If an account exists for <b>{email}</b>, a reset link is on its way. It works for one hour.</p>
      ) : (
        <form className="grid gap-4" onSubmit={submit}>
          <Field id="email" label="Email"><input autoComplete="email" autoFocus className="input h-10" id="email" onChange={(e) => setEmail(e.target.value)} type="email" value={email} /></Field>
          <FormError message={error} />
          <button className="btn btn-primary h-10" disabled={busy || !email} type="submit">{busy ? <Spinner className="size-4" /> : 'Send reset link'}</button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPage({ token }) {
  const { signedIn } = useAuth();
  const { navigate } = useRoute();
  const [state, setState] = useState('checking'); // checking | valid | invalid
  const [pw, setPw] = useState({ next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/auth/reset/${encodeURIComponent(token)}`).then(() => setState('valid')).catch(() => setState('invalid'));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (pw.next !== pw.again) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = await api.post('/auth/reset', { token, password: pw.next });
      signedIn(payload);
      navigate(defaultWorkspacePath(payload.workspaces), { replace: true });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  if (state === 'checking') return <AuthLayout title="Checking your link…"><Spinner /></AuthLayout>;
  if (state === 'invalid') {
    return <AuthLayout subtitle="This reset link is invalid, has already been used, or has expired." title="Link unavailable"><Link className="btn btn-primary w-full" to="/forgot">Get a new link</Link></AuthLayout>;
  }
  return (
    <AuthLayout subtitle="Choose a new password. You will be signed in and every other device will be signed out." title="Choose a new password">
      <form className="grid gap-4" onSubmit={submit}>
        <Field id="pw1" label="New password"><PasswordInput autoComplete="new-password" id="pw1" onChange={(v) => setPw((p) => ({ ...p, next: v }))} placeholder="At least 8 characters" value={pw.next} /></Field>
        <Field id="pw2" label="Repeat new password"><PasswordInput autoComplete="new-password" id="pw2" onChange={(v) => setPw((p) => ({ ...p, again: v }))} value={pw.again} /></Field>
        <FormError message={error} />
        <button className="btn btn-primary h-10" disabled={busy || pw.next.length < 8 || !pw.again} type="submit">{busy ? <Spinner className="size-4" /> : 'Set password and sign in'}</button>
      </form>
    </AuthLayout>
  );
}
