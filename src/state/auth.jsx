import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0e11' : '#f4f5f7');
}

const storedTheme = () => {
  try { return localStorage.getItem('optima-theme') || 'system'; } catch { return 'system'; }
};

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, workspaces: [], pendingInvites: [], needsSetup: false, error: null });
  const [theme, setThemeState] = useState(storedTheme);

  const goAnonymous = useCallback(async () => {
    let needsSetup = false;
    let emailEnabled = false;
    try { ({ needsSetup, emailEnabled } = await api.get('/auth/status')); } catch { /* keep defaults */ }
    setState({ status: 'anon', user: null, workspaces: [], pendingInvites: [], needsSetup, emailEnabled, error: null });
  }, []);

  const load = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setState({ status: 'ready', needsSetup: false, error: null, ...me });
      if (me.user.theme) setThemeState(me.user.theme);
    } catch (e) {
      if (e.status === 401) await goAnonymous();
      else setState((s) => ({ ...s, status: 'error', error: e.message }));
    }
  }, [goAnonymous]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onSignedOut = () => goAnonymous();
    window.addEventListener('optima:signed-out', onSignedOut);
    return () => window.removeEventListener('optima:signed-out', onSignedOut);
  }, [goAnonymous]);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('optima-theme', theme); } catch { /* optional */ }
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq?.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, [theme]);

  const value = useMemo(() => ({
    ...state,
    theme,
    reload: load,
    /* Called with the payload from login/register/accept-invite. */
    signedIn: (payload) => {
      setState({ status: 'ready', needsSetup: false, error: null, pendingInvites: [], workspaces: [], ...payload });
      if (payload.user?.theme) setThemeState(payload.user.theme);
    },
    signOut: async () => { try { await api.post('/auth/logout'); } catch { /* already signed out */ } await goAnonymous(); },
    setTheme: async (next) => {
      setThemeState(next);
      if (state.user) { try { await api.patch('/auth/me', { theme: next }); } catch { /* local choice still applies */ } }
    },
    updateUser: (user) => setState((s) => ({ ...s, user })),
    addWorkspace: (ws) => setState((s) => ({ ...s, workspaces: [...s.workspaces, ws] })),
    renameWorkspace: (id, name) => setState((s) => ({ ...s, workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)) })),
    removeWorkspace: (id) => setState((s) => ({ ...s, workspaces: s.workspaces.filter((w) => w.id !== id) })),
  }), [state, theme, load, goAnonymous]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
