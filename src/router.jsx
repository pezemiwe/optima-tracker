import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* A small History-API router: no dependency, supports params and query strings. */
const RouteContext = createContext(null);

function readLocation() {
  return { path: window.location.pathname, search: window.location.search };
}

export function Router({ children }) {
  const [loc, setLoc] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLoc(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    const next = `${url.pathname}${url.search}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', next);
    setLoc(readLocation());
    // Moving to a new page should start at the top; tab changes within a page keep the position.
    if (!replace && url.pathname !== loc.path) window.scrollTo(0, 0);
  }, [loc.path]);

  const value = useMemo(() => ({
    path: loc.path,
    query: new URLSearchParams(loc.search),
    navigate,
  }), [loc, navigate]);

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

export function useRoute() {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used inside <Router>.');
  return ctx;
}

/* Matches '/w/:ws/p/:key/*' style patterns. Returns params or null. */
export function matchPath(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') { params.rest = s.slice(i).join('/'); return params; }
    if (i >= s.length) return null;
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return p.length === s.length ? params : null;
}

export function Link({ to, children, replace, onClick, ...rest }) {
  const { navigate } = useRoute();
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || rest.target === '_blank') return;
        event.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

/* Sets one query parameter without losing the rest. */
export function useQueryParam(name) {
  const { path, query, navigate } = useRoute();
  const value = query.get(name);
  const set = useCallback((next, opts) => {
    const q = new URLSearchParams(window.location.search);
    if (next === null || next === undefined || next === '') q.delete(name);
    else q.set(name, next);
    const s = q.toString();
    navigate(`${path}${s ? `?${s}` : ''}`, opts);
  }, [name, navigate, path]);
  return [value, set];
}
