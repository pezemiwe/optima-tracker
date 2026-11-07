import { useEffect } from 'react';
import { EmptyState, FullPageSpinner, ConfirmProvider, ToastProvider } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Inbox from './pages/Inbox.jsx';
import MyTasks from './pages/MyTasks.jsx';
import Account from './pages/Account.jsx';
import ProjectSettings from './pages/ProjectSettings.jsx';
import WorkspaceSettings from './pages/WorkspaceSettings.jsx';
import { defaultWorkspacePath, ForgotPage, InvitePage, LoginPage, ResetPage, SetupPage, WelcomePage } from './pages/auth.jsx';
import { Link, matchPath, Router, useRoute } from './router.jsx';
import { AuthProvider, useAuth } from './state/auth.jsx';
import { useWorkspace, WorkspaceProvider } from './state/workspace.jsx';
import ProjectPage from './views/ProjectPage.jsx';
import Shell from './components/Shell.jsx';

const VIEWS = ['list', 'board', 'backlog', 'timeline', 'calendar', 'daily'];

function Redirect({ to }) {
  const { navigate } = useRoute();
  useEffect(() => { navigate(to, { replace: true }); }, [to, navigate]);
  return <FullPageSpinner />;
}

function WorkspaceRoutes({ slug }) {
  const { workspaces } = useAuth();
  const { path } = useRoute();
  const ws = workspaces.find((w) => w.slug === slug);
  if (!ws) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f5f7] dark:bg-[#0c0e11]">
        <EmptyState action={<Link className="btn btn-primary" to="/">Go to my workspaces</Link>} icon="folder" title="Workspace not found">It may have been deleted, or you may not be a member.</EmptyState>
      </div>
    );
  }
  return (
    <WorkspaceProvider key={ws.id} workspace={ws}>
      <WorkspaceScreen path={path} slug={slug} />
    </WorkspaceProvider>
  );
}


function WorkspaceScreen({ path, slug }) {
  const { ready, loadError, workspace } = useWorkspace();
  useEffect(() => { try { localStorage.setItem('optima-last-ws', slug); } catch { /* optional */ } }, [slug]);
  if (loadError) {
    return <div className="grid min-h-screen place-items-center bg-[#f4f5f7] dark:bg-[#0c0e11]"><EmptyState action={<button className="btn btn-primary" onClick={() => window.location.reload()} type="button">Reload</button>} icon="warning" title="Could not load this workspace">{loadError.message}</EmptyState></div>;
  }
  if (!ready) return <FullPageSpinner />;

  const base = `/w/${slug}`;
  if (path === base || path === `${base}/`) return <Home />;
  if (path === `${base}/my-tasks`) return <MyTasks />;
  if (path === `${base}/inbox`) return <Inbox />;
  if (path === `${base}/settings`) return <WorkspaceSettings />;
  const p = matchPath('/w/:ws/p/:key', path);
  if (p) return <Redirect to={`${base}/p/${p.key}/list`} />;
  const ps = matchPath('/w/:ws/p/:key/settings', path);
  if (ps) return <ProjectSettings projectKey={ps.key} />;
  const pv = matchPath('/w/:ws/p/:key/:view', path);
  if (pv && VIEWS.includes(pv.view)) return <ProjectPage key={pv.key} projectKey={pv.key} view={pv.view} />;
  return (
    <Shell crumbs={[{ label: 'Not found' }]}>
      <EmptyState action={<Link className="btn btn-primary" to={base}>Back to home</Link>} icon="search" title="Page not found">There is nothing at {path} in {workspace.name}.</EmptyState>
    </Shell>
  );
}

function Routes() {
  const { status, user, needsSetup, workspaces, error, reload } = useAuth();
  const { path } = useRoute();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'error') {
    return <div className="grid min-h-screen place-items-center"><EmptyState action={<button className="btn btn-primary" onClick={reload} type="button">Try again</button>} icon="warning" title="Could not reach the server">{error}</EmptyState></div>;
  }

  const invite = matchPath('/invite/:token', path);
  if (invite) return <InvitePage token={invite.token} />;
  const reset = matchPath('/reset/:token', path);
  if (reset) return <ResetPage token={reset.token} />;

  if (!user) {
    if (path === '/forgot') return <ForgotPage />;
    if (path === '/setup' || (needsSetup && path !== '/login')) return <SetupPage />;
    return <LoginPage />;
  }

  if (path === '/account') return <Account />;
  if (path === '/welcome') return workspaces.length ? <Redirect to={defaultWorkspacePath(workspaces)} /> : <WelcomePage />;
  const ws = matchPath('/w/:slug/*', path) || matchPath('/w/:slug', path);
  if (ws) return <WorkspaceRoutes slug={ws.slug} />;
  // '/', '/login', '/setup' and anything unknown land on the default workspace.
  return <Redirect to={defaultWorkspacePath(workspaces)} />;
}

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Routes />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </Router>
  );
}
