import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import CommandPalette from './CommandPalette.jsx';
import NewTaskModal from './NewTaskModal.jsx';
import { BellButton } from './Notifications.jsx';
import { NewProjectModal, NewWorkspaceModal } from './ProjectModals.jsx';
import { Avatar, Modal, Popover, useLocalStorage } from './ui.jsx';
import { ShellContext, useShell } from './shellContext.js';
import { Link, matchPath, useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useWorkspace } from '../state/workspace.jsx';


const SHORTCUTS = [
  ['N', 'Create a task'], ['/', 'Focus search'], ['Ctrl K', 'Open the command palette'], ['[', 'Collapse or expand the sidebar'],
  ['?', 'Show this list'], ['Esc', 'Close dialogs and menus'], ['Ctrl Enter', 'Save in a form'],
];

function ShortcutsModal({ onClose }) {
  return (
    <Modal onClose={onClose} size="sm" title="Keyboard shortcuts">
      <dl className="grid gap-2">
        {SHORTCUTS.map(([k, label]) => (
          <div className="flex items-center justify-between text-sm" key={k}>
            <dt className="muted">{label}</dt>
            <dd className="flex gap-1">{k.split(' ').map((part) => <span className="kbd" key={part}>{part}</span>)}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

function NavLink({ to, icon, label, badge, collapsed, active }) {
  return (
    <Link aria-current={active ? 'page' : undefined} className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition ${active ? 'bg-[#1d232b] text-white' : 'text-slate-300 hover:bg-[#161a20]'} ${collapsed ? 'justify-center px-0' : ''}`} title={collapsed ? label : undefined} to={to}>
      <Icon className="size-[18px] shrink-0" name={icon} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && badge > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#86bc25] px-1.5 text-[11px] font-semibold text-slate-950">{badge}</span>}
    </Link>
  );
}

function WorkspaceSwitcher({ collapsed }) {
  const { workspaces } = useAuth();
  const { workspace } = useWorkspace();
  const { navigate } = useRoute();
  const { openNewWorkspace } = useShell();
  return (
    <Popover className="!bg-[#14181d] !border-[#2a313b] text-slate-100" trigger={(p) => (
      <button {...p} className={`flex h-[60px] w-full items-center gap-3 border-b border-[#1b2027] px-4 text-left hover:bg-[#12151a] ${collapsed ? 'justify-center px-0' : ''}`} type="button">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#86bc25] text-sm font-bold text-slate-950">{workspace.name.slice(0, 1).toUpperCase()}</span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{workspace.name}</span><span className="block text-xs capitalize text-slate-500">{workspace.role}</span></span>
            <Icon className="size-4 text-slate-500" name="chevronDown" />
          </>
        )}
      </button>
    )}
    width={248}
    >
      {(close) => (
        <div>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workspaces</p>
          {workspaces.map((w) => (
            <button className="menu-item !text-slate-200 hover:!bg-[#242a33]" key={w.id} onClick={() => { close(); navigate(`/w/${w.slug}`); }} type="button">
              <span className="grid size-6 place-items-center rounded-md bg-[#86bc25]/20 text-xs font-bold text-[#a6d95a]">{w.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Icon className="size-4 text-[#a6d95a]" name="check" />}
            </button>
          ))}
          <button className="menu-item mt-1 border-t border-[#2a313b] !text-slate-200 hover:!bg-[#242a33]" onClick={() => { close(); openNewWorkspace(); }} type="button"><Icon name="add" />New workspace</button>
        </div>
      )}
    </Popover>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate }) {
  const { workspace, projects, unread, canWrite, isAdmin } = useWorkspace();
  const { path } = useRoute();
  const { openNewProject } = useShell();
  const base = `/w/${workspace.slug}`;
  const live = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  const [showArchived, setShowArchived] = useLocalStorage('optima-show-archived', false);
  const heading = 'px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500';
  return (
    <aside className="flex h-full flex-col border-r border-[#1b2027] bg-[#0b0d10] text-slate-100" onClick={(e) => { if (e.target.closest('a')) onNavigate?.(); }}>
      <WorkspaceSwitcher collapsed={collapsed} />
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
        <NavLink active={path === base} collapsed={collapsed} icon="home" label="Home" to={base} />
        <NavLink active={path.startsWith(`${base}/my-tasks`)} collapsed={collapsed} icon="checkCircle" label="My tasks" to={`${base}/my-tasks`} />
        <NavLink active={path.startsWith(`${base}/inbox`)} badge={unread} collapsed={collapsed} icon="inbox" label="Inbox" to={`${base}/inbox`} />

        {!collapsed && (
          <div className="flex items-center justify-between pr-1">
            <p className={heading}>Projects</p>
            {canWrite && <button aria-label="New project" className="mt-3 grid size-6 place-items-center rounded-md text-slate-400 hover:bg-[#1d232b] hover:text-white" onClick={openNewProject} type="button"><Icon className="size-4" name="add" /></button>}
          </div>
        )}
        {collapsed && <div className="my-3 border-t border-[#1b2027]" />}
        {live.map((p) => {
          const active = path.startsWith(`${base}/p/${p.key}`);
          return (
            <Link aria-current={active ? 'page' : undefined} className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition ${active ? 'bg-[#1d232b] text-white' : 'text-slate-300 hover:bg-[#161a20]'} ${collapsed ? 'justify-center px-0' : ''}`} key={p.id} title={collapsed ? p.name : undefined} to={`${base}/p/${p.key}/list`}>
              <span className="grid size-[22px] shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: p.color }}>{p.key.slice(0, 2)}</span>
              {!collapsed && <><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="font-mono text-[11px] text-slate-500">{p.taskCount}</span></>}
            </Link>
          );
        })}
        {!live.length && !collapsed && (
          canWrite
            ? <button className="mx-3 mt-1 text-left text-xs text-slate-500 hover:text-slate-300" onClick={openNewProject} type="button">No projects yet. Create one</button>
            : <p className="mx-3 mt-1 text-xs text-slate-500">No projects yet.</p>
        )}
        {archived.length > 0 && !collapsed && (
          <>
            <button className="mt-3 flex w-full items-center gap-2 px-3 py-1 text-xs text-slate-500 hover:text-slate-300" onClick={() => setShowArchived((v) => !v)} type="button">
              <Icon className="size-3.5" name={showArchived ? 'chevronDown' : 'chevronRight'} />Archived ({archived.length})
            </button>
            {showArchived && archived.map((p) => (
              <Link className="flex h-8 items-center gap-3 rounded-lg px-3 text-sm text-slate-500 hover:bg-[#161a20]" key={p.id} to={`${base}/p/${p.key}/list`}>
                <span className="grid size-[18px] place-items-center rounded text-[9px] font-bold text-white opacity-60" style={{ background: p.color }}>{p.key.slice(0, 2)}</span>
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-[#1b2027] p-3">
        <NavLink active={path.startsWith(`${base}/settings`)} collapsed={collapsed} icon={isAdmin ? 'settings' : 'users'} label={isAdmin ? 'Workspace settings' : 'Members'} to={`${base}/settings`} />
        <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`mt-1 hidden h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-[#161a20] lg:flex ${collapsed ? 'justify-center px-0' : ''}`} onClick={onToggle} type="button">
          <Icon className="size-[18px]" name={collapsed ? 'chevronRight' : 'chevronLeft'} />{!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}

function UserMenu() {
  const { user, theme, setTheme, signOut } = useAuth();
  const { navigate } = useRoute();
  const { openHelp } = useShell();
  return (
    <Popover align="right" trigger={(p) => (
      <button {...p} aria-label="Account menu" className="rounded-full ring-offset-2 hover:ring-2 hover:ring-slate-300 dark:ring-offset-[#0c0e11] dark:hover:ring-slate-600" type="button"><Avatar size={36} user={user} /></button>
    )}
    width={240}
    >
      {(close) => (
        <div>
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="muted truncate text-xs">{user.email}</p>
          </div>
          <button className="menu-item mt-1" onClick={() => { close(); navigate('/account'); }} type="button"><Icon name="user" />Profile and password</button>
          <div className="px-2.5 py-2">
            <p className="faint mb-1.5 text-[11px] font-semibold uppercase tracking-wider">Theme</p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#14171c]">
              {[['system', 'Auto', 'layers'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([value, label, icon]) => (
                <button aria-pressed={theme === value} className={`flex h-7 items-center justify-center gap-1 rounded-md text-xs ${theme === value ? 'bg-white font-medium shadow-sm dark:bg-[#2a313b] dark:text-white' : 'muted'}`} key={value} onClick={() => setTheme(value)} type="button"><Icon className="size-3.5" name={icon} />{label}</button>
              ))}
            </div>
          </div>
          <button className="menu-item" onClick={() => { close(); openHelp(); }} type="button"><Icon name="keyboard" />Keyboard shortcuts</button>
          <button className="menu-item border-t border-line" onClick={() => { close(); signOut(); }} type="button"><Icon name="logout" />Sign out</button>
        </div>
      )}
    </Popover>
  );
}

export default function Shell({ crumbs = [], children, actions }) {
  const { workspace, canWrite, projects } = useWorkspace();
  const { navigate, path } = useRoute();
  const [collapsed, setCollapsed] = useLocalStorage('optima-sidebar-collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState(null); // { type, defaults }
  const [palette, setPalette] = useState(false);

  // New tasks default to the project being viewed, else the one used last.
  const currentKey = (matchPath('/w/:ws/p/:key/*', path) || matchPath('/w/:ws/p/:key', path))?.key;
  const currentProjectId = projects.find((p) => p.key === currentKey && !p.archived)?.id;
  const openNewTask = useCallback((defaults = {}) => {
    if (!canWrite) return;
    let last = null;
    try { last = localStorage.getItem('optima-last-project'); } catch { /* optional */ }
    const fallback = projects.find((p) => p.id === last && !p.archived)?.id;
    setModal({ type: 'task', defaults: { projectId: currentProjectId || fallback, ...defaults } });
  }, [canWrite, currentProjectId, projects]);
  const ctx = useMemo(() => ({
    openNewTask,
    openNewProject: () => setModal({ type: 'project' }),
    openNewWorkspace: () => setModal({ type: 'workspace' }),
    openHelp: () => setModal({ type: 'help' }),
    openPalette: () => setPalette(true),
  }), [openNewTask]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); openNewTask(); }
      else if (e.key === '/') { e.preventDefault(); document.querySelector('[data-search]')?.focus(); }
      else if (e.key === '?') { e.preventDefault(); setModal({ type: 'help' }); }
      else if (e.key === '[') {
        if (window.matchMedia('(min-width: 1024px)').matches) setCollapsed((v) => !v);
        else setMobileOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNewTask, setCollapsed]);

  const close = () => setModal(null);
  return (
    <ShellContext.Provider value={ctx}>
      <div className={`min-h-screen bg-[#f4f5f7] text-slate-900 dark:bg-[#0c0e11] dark:text-slate-100 lg:grid ${collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[264px_minmax(0,1fr)]'}`}>
        <div className="hidden h-screen lg:sticky lg:top-0 lg:block"><Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} /></div>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} type="button" />
            <div className="animate-slide-in relative h-full w-[272px]"><Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} /></div>
          </div>
        )}
        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-line bg-[#f4f5f7]/90 px-4 backdrop-blur dark:bg-[#0c0e11]/90 lg:px-8">
            <button aria-label="Open navigation" className="icon-btn size-9 lg:hidden" onClick={() => setMobileOpen(true)} type="button"><Icon name="menu" /></button>
            <nav aria-label="Breadcrumb" className="muted mr-auto flex min-w-0 items-center gap-2 text-sm">
              <Link className="hidden truncate hover:text-slate-900 dark:hover:text-white sm:inline" to={`/w/${workspace.slug}`}>{workspace.name}</Link>
              {crumbs.map((c, i) => (
                <span className="flex min-w-0 items-center gap-2" key={`${c.label}-${i}`}>
                  <span className="faint hidden sm:inline">/</span>
                  {c.to && i < crumbs.length - 1 ? <Link className="truncate hover:text-slate-900 dark:hover:text-white" to={c.to}>{c.label}</Link> : <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{c.label}</span>}
                </span>
              ))}
            </nav>
            <button aria-label="Search" className="btn hidden w-56 justify-start gap-2 text-slate-500 md:inline-flex" onClick={() => setPalette(true)} type="button">
              <Icon className="size-4" name="search" /><span className="flex-1 text-left font-normal">Search…</span><span className="kbd">Ctrl K</span>
            </button>
            <button aria-label="Search" className="icon-btn size-9 md:hidden" onClick={() => setPalette(true)} type="button"><Icon name="search" /></button>
            {actions}
            {canWrite && <button className="btn btn-primary" disabled={!projects.some((p) => !p.archived)} onClick={() => openNewTask()} type="button"><Icon name="add" /><span className="hidden sm:inline">New task</span></button>}
            <BellButton />
            <UserMenu />
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      {modal?.type === 'task' && <NewTaskModal defaults={modal.defaults} onClose={close} onCreated={(task, project) => { if (modal.defaults?.openAfter) navigate(`/w/${workspace.slug}/p/${project.key}/list?task=${task.number}`); }} />}
      {modal?.type === 'project' && <NewProjectModal onClose={close} />}
      {modal?.type === 'workspace' && <NewWorkspaceModal onClose={close} />}
      {modal?.type === 'help' && <ShortcutsModal onClose={close} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </ShellContext.Provider>
  );
}
