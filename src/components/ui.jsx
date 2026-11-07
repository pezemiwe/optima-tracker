import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { readableOn } from '../lib/colors.mjs';
import { priorityMeta } from '../lib/filters.mjs';

/* ---------- small hooks ---------- */
export function useLocalStorage(key, initial) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : JSON.parse(raw);
    } catch { return initial; }
  };
  const [value, setValue] = useState(read);
  const [loadedKey, setLoadedKey] = useState(key);
  // A different key means a different record (e.g. another project): load it instead of keeping the old value.
  if (loadedKey !== key) {
    setLoadedKey(key);
    setValue(read());
  }
  const set = useCallback((next) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* storage is optional */ }
      return resolved;
    });
  }, [key]);
  return [value, set];
}

export function useEscape(handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') handler(event); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, active]);
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/* ---------- simple visuals ---------- */
export function Spinner({ className = 'size-5' }) {
  return <span aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-slate-300 border-t-[#86bc25] ${className}`} role="status" />;
}

export function FullPageSpinner() {
  return <div className="grid min-h-screen place-items-center"><Spinner className="size-8" /></div>;
}

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';

export function Avatar({ user, size = 24, className = '' }) {
  const name = user?.name || 'Unassigned';
  if (!user) {
    return <span aria-label="Unassigned" className={`grid shrink-0 place-items-center rounded-full border border-dashed border-slate-400 text-slate-500 dark:border-slate-500 ${className}`} role="img" style={{ width: size, height: size }} title="Unassigned"><Icon className="size-3" name="user" /></span>;
  }
  return (
    <span aria-label={name} className={`grid shrink-0 place-items-center rounded-full font-semibold ${className}`} role="img" style={{ width: size, height: size, background: user.color || '#64748b', color: readableOn(user.color || '#64748b'), fontSize: Math.max(9, size * 0.4) }} title={name}>
      {initials(name)}
    </span>
  );
}

/* The coloured square with a project's key letters. */
export function KeyBadge({ project, size = 22, className = '' }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-md font-bold ${className}`} style={{ width: size, height: size, background: project.color, color: readableOn(project.color), fontSize: Math.max(9, size * 0.4) }}>
      {project.key.slice(0, size >= 36 ? 3 : 2)}
    </span>
  );
}

export function StatusDot({ color, className = '' }) {
  return <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${className}`} style={{ background: color || '#94a3b8' }} />;
}

export function PriorityIcon({ value, showLabel = false }) {
  const meta = priorityMeta(value);
  return (
    <span className="inline-flex items-center gap-1.5" title={`${meta.label} priority`}>
      <Icon className="size-3.5" name="flag" style={{ color: meta.color }} />
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

export function LabelChip({ label }) {
  return (
    <span className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[color-mix(in_srgb,var(--lc)_45%,black)] dark:text-[color-mix(in_srgb,var(--lc)_45%,white)]" style={{ background: `${label.color}2e`, '--lc': label.color }}>
      <span className="truncate">{label.name}</span>
    </span>
  );
}

export function EmptyState({ icon = 'folder', title, children, action }) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-[#1b2028]"><Icon className="size-6" name={icon} /></span>
        <p className="mt-4 font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {children && <p className="muted mx-auto mt-1 max-w-sm text-sm">{children}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

/* ---------- popover (portal + fixed positioning so tables never clip it) ---------- */
export function Popover({ trigger, children, align = 'left', width, className = '', onOpenChange, disabled = false }) {
  const [open, setOpenState] = useState(false);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const setOpen = useCallback((next) => {
    setOpenState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved !== prev) onOpenChange?.(resolved);
      return resolved;
    });
  }, [onOpenChange]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  const place = useCallback(() => {
    const el = triggerRef.current;
    const menu = menuRef.current;
    if (!el || !menu) return;
    const r = el.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    setPos({ top, left });
  }, [align]);

  useLayoutEffect(() => { if (open) place(); }, [open, place, children]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); triggerRef.current?.focus?.(); } };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, setOpen]);

  return (
    <>
      {trigger({
        ref: triggerRef,
        open,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        disabled,
        onClick: (event) => { event.stopPropagation(); if (!disabled) setOpen((o) => !o); },
      })}
      {open && createPortal(
        <div className={`menu animate-pop ${className}`} ref={menuRef} role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left, width }}>
          {typeof children === 'function' ? children(close) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

function OptionList({ options, isSelected, onPick, searchable, emptyText = 'Nothing found', multi = false }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  return (
    <div>
      {searchable && (
        <div className="p-1 pb-1.5">
          <input autoFocus className="input h-8 text-xs" onChange={(e) => setQ(e.target.value)} placeholder="Search…" value={q} />
        </div>
      )}
      <div className="max-h-64 overflow-y-auto">
        {shown.map((o) => (
          <button aria-selected={isSelected(o.value)} className="menu-item" key={String(o.value)} onClick={() => onPick(o)} role={multi ? 'menuitemcheckbox' : 'menuitem'} type="button">
            {multi && (
              <span className={`grid size-4 shrink-0 place-items-center rounded border ${isSelected(o.value) ? 'border-[#86bc25] bg-[#86bc25] text-slate-950' : 'border-slate-300 dark:border-slate-600'}`}>
                {isSelected(o.value) && <Icon className="size-3" name="check" strokeWidth="3" />}
              </span>
            )}
            {o.node}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {!multi && isSelected(o.value) && <Icon className="size-4 text-[#4a7a0a] dark:text-[#a6d95a]" name="check" />}
          </button>
        ))}
        {!shown.length && <p className="faint px-3 py-2 text-xs">{emptyText}</p>}
      </div>
    </div>
  );
}

/* options: [{ value, label, node? }]. `trigger` lets callers fully style the button. */
export function Select({ value, onChange, options, searchable = false, disabled = false, align = 'left', width, placeholder = 'Select…', className = 'btn', children, ariaLabel }) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover align={align} disabled={disabled} width={width || 220} trigger={(p) => (
      <button {...p} aria-label={ariaLabel} className={`${className} ${p.open ? 'ring-2 ring-[#86bc25]/40' : ''}`} type="button">
        {children ? children(current) : (
          <>
            {current?.node}
            <span className="min-w-0 flex-1 truncate text-left">{current ? current.label : <span className="faint">{placeholder}</span>}</span>
            <Icon className="size-3.5 shrink-0 text-slate-400" name="chevronDown" />
          </>
        )}
      </button>
    )}
    >
      {(close) => (
        <OptionList isSelected={(v) => v === value} onPick={(o) => { onChange(o.value); close(); }} options={options} searchable={searchable} />
      )}
    </Popover>
  );
}

export function MultiSelect({ values, onChange, options, label, searchable = false, align = 'left', className = 'btn', width }) {
  const toggle = (v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <Popover align={align} width={width || 230} trigger={(p) => (
      <button {...p} className={`${className} ${values.length ? 'border-[#86bc25] dark:border-[#86bc25]' : ''}`} type="button">
        <span>{label}</span>
        {values.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-[#86bc25] px-1 text-[11px] font-semibold text-slate-950">{values.length}</span>}
        <Icon className="size-3.5 text-slate-400" name="chevronDown" />
      </button>
    )}
    >
      {() => (
        <div>
          <OptionList isSelected={(v) => values.includes(v)} multi onPick={(o) => toggle(o.value)} options={options} searchable={searchable} />
          {values.length > 0 && <button className="menu-item mt-1 border-t border-line text-xs text-slate-500" onClick={() => onChange([])} type="button">Clear selection</button>}
        </div>
      )}
    </Popover>
  );
}

/* Pick a workspace member (or nobody). */
export function UserSelect({ value, onChange, members, allowNone = true, noneLabel = 'Unassigned', className = 'btn btn-ghost btn-sm', align = 'left', disabled, showName = true }) {
  const options = useMemo(() => [
    ...(allowNone ? [{ value: null, label: noneLabel, node: <Avatar size={20} /> }] : []),
    ...members.map((m) => ({ value: m.id, label: m.name, node: <Avatar size={20} user={m} /> })),
  ], [members, allowNone, noneLabel]);
  const current = members.find((m) => m.id === value);
  return (
    <Select align={align} ariaLabel="Assignee" className={className} disabled={disabled} onChange={onChange} options={options} searchable={members.length > 6} value={value ?? null} width={240}>
      {() => (
        <>
          <Avatar size={20} user={current} />
          {showName && <span className="min-w-0 truncate">{current ? current.name : noneLabel}</span>}
        </>
      )}
    </Select>
  );
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, size = 'md', persistent = false, labelledBy }) {
  const ref = useRef(null);
  useEscape(() => { if (!persistent) onClose?.(); });
  useEffect(() => {
    const previous = document.activeElement;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; previous?.focus?.(); };
  }, []);
  useEffect(() => {
    const first = ref.current?.querySelector('[autofocus], input:not([type=hidden]), textarea, select');
    first?.focus?.();
  }, []);
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !persistent) onClose?.(); }}>
      <div aria-labelledby={labelledBy || 'modal-title'} aria-modal="true" className={`animate-pop my-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#343b47] dark:bg-[#14171c] ${width}`} ref={ref} role="dialog">
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold text-slate-900 dark:text-white" id="modal-title">{title}</h2>
            <button aria-label="Close" className="icon-btn" onClick={onClose} type="button"><Icon name="close" /></button>
          </div>
        )}
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-slate-50 px-5 py-3 dark:bg-[#181c22]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- toasts ---------- */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6500 : 3500);
  }, []);
  const api = useMemo(() => ({
    info: (m) => push(m, 'info'), success: (m) => push(m, 'success'), error: (m) => push(m, 'error'),
  }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[80] grid gap-2" role="status">
        {toasts.map((t) => (
          <div className={`animate-pop pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${t.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950 dark:text-red-100' : t.tone === 'success' ? 'border-lime-200 bg-lime-50 text-lime-900 dark:border-lime-900/60 dark:bg-lime-950 dark:text-lime-100' : 'border-slate-200 bg-white text-slate-800 dark:border-[#343b47] dark:bg-[#181c22] dark:text-slate-100'}`} key={t.id}>
            <Icon className="mt-0.5 size-4 shrink-0" name={t.tone === 'error' ? 'warning' : t.tone === 'success' ? 'checkCircle' : 'bell'} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------- confirm dialog ---------- */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((options) => new Promise((resolve) => setState({ options, resolve })), []);
  const answer = (value) => { state.resolve(value); setState(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          footer={(
            <>
              <button className="btn" onClick={() => answer(false)} type="button">Cancel</button>
              <button autoFocus className={`btn ${state.options.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => answer(true)} type="button">{state.options.confirmLabel || 'Confirm'}</button>
            </>
          )}
          onClose={() => answer(false)}
          size="sm"
          title={state.options.title || 'Are you sure?'}
        >
          <p className="muted text-sm">{state.options.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

/* A text field the user must fill to confirm a destructive action. */
export function TypeToConfirm({ name, onConfirm, onClose, noun }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      footer={(
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-danger" disabled={text !== name || busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }} type="button">Delete {noun}</button>
        </>
      )}
      onClose={onClose}
      size="sm"
      title={`Delete ${noun}`}
    >
      <p className="muted text-sm">This permanently deletes <b className="text-slate-900 dark:text-white">{name}</b> and everything in it. This cannot be undone.</p>
      <label className="field-label mt-4" htmlFor="confirm-name">Type the name to confirm</label>
      <input autoFocus className="input" id="confirm-name" onChange={(e) => setText(e.target.value)} value={text} />
    </Modal>
  );
}
