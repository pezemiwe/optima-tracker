import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './auth.jsx';
import { useToast } from '../components/ui.jsx';

const WorkspaceContext = createContext(null);
const POLL_MS = 5000;
const RANK = { viewer: 1, member: 2, admin: 3, owner: 4 };

/* Holds the current workspace, its members and projects, and polls for changes made by others. */
export function WorkspaceProvider({ workspace, children }) {
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [rev, setRev] = useState(0);
  const [unread, setUnread] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const revRef = useRef(null);
  const id = workspace.id;

  const loadLists = useCallback(async () => {
    const [m, p] = await Promise.all([api.get(`/workspaces/${id}/members`), api.get(`/workspaces/${id}/projects`)]);
    setMembers(m.members);
    setProjects(p.projects);
  }, [id]);

  /* Checks the revision; when it moved, publishes it so views refetch. */
  const sync = useCallback(async () => {
    const r = await api.get(`/workspaces/${id}/rev`);
    setUnread(r.unread);
    if (r.rev !== revRef.current) {
      revRef.current = r.rev;
      setRev(r.rev);
      await loadLists();
    }
    return r;
  }, [id, loadLists]);

  useEffect(() => {
    let cancelled = false;
    revRef.current = null;
    setReady(false);
    setLoadError(null);
    sync().then(() => { if (!cancelled) setReady(true); }).catch((e) => { if (!cancelled) setLoadError(e); });
    const timer = setInterval(() => { if (!document.hidden) sync().catch(() => {}); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) sync().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [sync]);

  const value = useMemo(() => {
    const role = workspace.role;
    return {
      workspace, members, projects, rev, unread, ready, loadError,
      role,
      canWrite: RANK[role] >= RANK.member,
      isAdmin: RANK[role] >= RANK.admin,
      isOwner: role === 'owner',
      memberById: new Map(members.map((m) => [m.id, m])),
      sync,
      setUnread,
    };
  }, [workspace, members, projects, rev, unread, ready, loadError, sync]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = () => useContext(WorkspaceContext);

/* Loads one project's statuses, labels and tasks, and reloads whenever the workspace revision changes. */
export function useProjectData(projectKey) {
  const { projects, rev, sync, workspace } = useWorkspace();
  const summary = projects.find((p) => p.key === projectKey) || null;
  const projectId = summary?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const seq = useRef(0);

  useEffect(() => { setData(null); setError(null); }, [projectId]);

  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(null);
  const hasData = useRef(false);
  useEffect(() => { hasData.current = Boolean(data); }, [data]);

  /* Loads the project, then its tasks a page at a time. The first load shows tasks as soon as page one arrives. */
  const load = useCallback(async () => {
    if (!projectId) return;
    const mine = ++seq.current;
    const stale = () => mine !== seq.current; // a newer request superseded this one
    try {
      const [p, sp] = await Promise.all([api.get(`/projects/${projectId}`), api.get(`/projects/${projectId}/sprints`)]);
      if (stale()) return;
      const progressive = !hasData.current;
      let tasks = [];
      let after = '';
      for (;;) {
        const t = await api.get(`/projects/${projectId}/tasks?limit=500${after}`);
        if (stale()) return;
        tasks = tasks.concat(t.tasks);
        if (t.total !== undefined) setTotal(t.total);
        const done = !t.next;
        // On refresh keep the old data until everything is in, so the screen never flickers back to a partial list.
        if (progressive || done) setData({ project: p.project, role: p.role, statuses: p.statuses, labels: p.labels, fields: p.fields, sprints: sp.sprints, tasks });
        setLoadingMore(!done);
        if (done) break;
        after = `&after=${encodeURIComponent(t.next)}`;
      }
      setError(null);
    } catch (e) {
      if (mine === seq.current) { setError(e); setLoadingMore(false); }
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load, rev]);

  const derived = useMemo(() => {
    const statuses = data?.statuses || [];
    const labels = data?.labels || [];
    const tasks = data?.tasks || [];
    const sprints = data?.sprints || [];
    return {
      sprintById: new Map(sprints.map((x) => [x.id, x])),
      activeSprint: sprints.find((x) => x.state === 'active') || null,
      statusById: new Map(statuses.map((s) => [s.id, s])),
      statusRank: new Map(statuses.map((s) => [s.id, s.position])),
      labelById: new Map(labels.map((l) => [l.id, l])),
      taskById: new Map(tasks.map((t) => [t.id, t])),
      taskByNumber: new Map(tasks.map((t) => [t.number, t])),
      firstTodo: statuses.find((s) => s.category === 'todo') || statuses[0],
      firstDone: statuses.find((s) => s.category === 'done'),
    };
  }, [data]);

  /* Instant UI feedback before the server answers (drag and drop, checkboxes). */
  const patchLocal = useCallback((taskId, changes) => {
    setData((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t)) } : d));
  }, []);

  return {
    summary, loading: !data && !error && Boolean(summary), error, notFound: !summary, loadingMore, total,
    project: data?.project, role: data?.role, statuses: data?.statuses || [], labels: data?.labels || [], fields: data?.fields || [], sprints: data?.sprints || [], tasks: data?.tasks || [],
    ...derived, workspaceId: workspace.id, reload: load, patchLocal, ready: Boolean(data),
    afterWrite: sync,
  };
}

/* Task mutations with consistent error toasts and refresh. */
export function useTaskActions(pd) {
  const toast = useToast();
  const { user } = useAuth();

  const run = useCallback(async (fn, { quiet = false } = {}) => {
    try {
      const result = await fn();
      await pd.afterWrite();
      return result;
    } catch (e) {
      if (!quiet) toast.error(e.message);
      await pd.reload();
      throw e;
    }
  }, [pd, toast]);

  return useMemo(() => ({
    create: (body) => run(() => api.post(`/projects/${pd.summary.id}/tasks`, body)).then((r) => r.task),
    update: (id, changes) => run(() => api.patch(`/tasks/${id}`, changes)).then((r) => r.task),
    /* Updates the screen first, then confirms with the server. */
    updateOptimistic: (id, changes) => {
      pd.patchLocal(id, changes);
      return run(() => api.patch(`/tasks/${id}`, changes)).then((r) => r.task);
    },
    toggleDone: (task) => {
      const done = pd.statusById.get(task.statusId)?.category === 'done';
      const target = done ? pd.firstTodo : pd.firstDone;
      if (!target) return Promise.resolve();
      return run(() => api.patch(`/tasks/${task.id}`, { statusId: target.id })).then((r) => r.task);
    },
    remove: (id) => run(() => api.del(`/tasks/${id}`)),
    bulk: (ids, changes) => run(() => api.post(`/projects/${pd.summary.id}/tasks/bulk`, { ids, changes })),
    bulkDelete: (ids) => run(() => api.post(`/projects/${pd.summary.id}/tasks/bulk`, { ids, delete: true })),
    me: user,
  }), [run, pd, user]);
}
