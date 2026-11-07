import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { useDebounced, useEscape } from './ui.jsx';
import { useRoute } from '../router.jsx';
import { useAuth } from '../state/auth.jsx';
import { useWorkspace } from '../state/workspace.jsx';
import { useShell } from './shellContext.js';

export default function CommandPalette({ onClose }) {
  const { workspace, projects, canWrite, isAdmin } = useWorkspace();
  const { navigate } = useRoute();
  const { theme, setTheme } = useAuth();
  const { openNewTask, openNewProject, openHelp } = useShell();
  const [q, setQ] = useState('');
  const [tasks, setTasks] = useState([]);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const debounced = useDebounced(q.trim(), 200);
  useEscape(onClose);

  useEffect(() => {
    if (debounced.length < 2) { setTasks([]); return undefined; }
    let cancelled = false;
    api.get(`/workspaces/${workspace.id}/search?q=${encodeURIComponent(debounced)}`).then((r) => { if (!cancelled) setTasks(r.tasks); }).catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, [debounced, workspace.id]);

  const base = `/w/${workspace.slug}`;
  const items = useMemo(() => {
    const go = (to) => () => navigate(to);
    const all = [
      ...(canWrite ? [{ group: 'Actions', label: 'Create task', icon: 'add', hint: 'N', run: () => openNewTask() }] : []),
      ...(canWrite ? [{ group: 'Actions', label: 'Create project', icon: 'folder', run: openNewProject }] : []),
      { group: 'Actions', label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: theme === 'dark' ? 'sun' : 'moon', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
      { group: 'Actions', label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: openHelp },
      { group: 'Go to', label: 'Home', icon: 'home', run: go(base) },
      { group: 'Go to', label: 'My tasks', icon: 'checkCircle', run: go(`${base}/my-tasks`) },
      { group: 'Go to', label: 'Inbox', icon: 'inbox', run: go(`${base}/inbox`) },
      { group: 'Go to', label: isAdmin ? 'Workspace settings' : 'Members', icon: 'settings', run: go(`${base}/settings`) },
      { group: 'Go to', label: 'Profile and password', icon: 'user', run: go('/account') },
      ...projects.filter((p) => !p.archived).flatMap((p) => [
        { group: 'Projects', label: p.name, sub: p.key, color: p.color, run: go(`${base}/p/${p.key}/list`) },
      ]),
    ];
    const needle = q.trim().toLowerCase();
    const matched = needle ? all.filter((i) => `${i.label} ${i.sub || ''}`.toLowerCase().includes(needle)) : all;
    const taskItems = tasks.map((t) => ({
      group: 'Tasks', label: t.title, sub: `${t.projectKey}-${t.number}`, tag: t.statusName, icon: t.category === 'done' ? 'checkCircle' : 'circle',
      run: () => navigate(`${base}/p/${t.projectKey}/list?task=${t.number}`),
    }));
    return [...taskItems, ...matched];
  }, [q, tasks, projects, canWrite, isAdmin, base, navigate, theme, setTheme, openNewTask, openNewProject, openHelp]);

  useEffect(() => { setActive(0); }, [q, tasks]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (item) => { onClose(); setTimeout(item.run, 0); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); pick(items[active]); }
  };

  let lastGroup = null;
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-start justify-center bg-slate-950/50 p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-label="Command palette" aria-modal="true" className="animate-pop w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#343b47] dark:bg-[#14171c]" role="dialog">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon className="size-5 text-slate-400" name="search" />
          <input aria-activedescendant={`cmd-${active}`} aria-controls="cmd-list" autoFocus className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400" onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search tasks, jump to a project, or run a command…" role="combobox" aria-expanded="true" value={q} />
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2" id="cmd-list" ref={listRef} role="listbox">
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? <p className="faint px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider" key={`h-${item.group}`}>{item.group}</p> : null;
            lastGroup = item.group;
            return (
              <div key={`${item.group}-${item.label}-${i}`}>
                {header}
                <button aria-selected={i === active} className="menu-item" data-active={i === active} id={`cmd-${i}`} onClick={() => pick(item)} onMouseMove={() => setActive(i)} role="option" type="button">
                  {item.color ? <span className="size-4 rounded" style={{ background: item.color }} /> : <Icon className="size-4 text-slate-400" name={item.icon || 'circle'} />}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="faint font-mono text-xs">{item.sub}</span>}
                  {item.tag && <span className="chip">{item.tag}</span>}
                  {item.hint && <span className="kbd">{item.hint}</span>}
                </button>
              </div>
            );
          })}
          {!items.length && <p className="muted px-3 py-8 text-center text-sm">No results for “{q}”.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
