import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { EmptyState } from '../components/ui.jsx';
import { addDays, diffDays, formatDay, parseISO, toISODate } from '../lib/dates.mjs';
import { readableOn } from '../lib/colors.mjs';
import { useWorkspace } from '../state/workspace.jsx';

const ROW = 36;
const LABEL_W = 260;
const ZOOMS = [['day', 'Day', 36], ['week', 'Week', 16], ['month', 'Month', 6]];
const PAGE = 200;

export default function TimelineView({ tasks, pd, actions, canWrite, onOpen, activeNumber }) {
  const { rev } = useWorkspace();
  const [zoom, setZoom] = useState('week');
  const [relations, setRelations] = useState([]);
  const [drag, setDrag] = useState(null); // { id, mode, delta }
  const [limit, setLimit] = useState(PAGE);
  const [announce, setAnnounce] = useState('');
  const scroller = useRef(null);
  const [viewW, setViewW] = useState(0);
  const px = ZOOMS.find((z) => z[0] === zoom)[2];
  const today = toISODate();

  useEffect(() => {
    api.get(`/projects/${pd.summary.id}/relations`).then((r) => setRelations(r.relations)).catch(() => {});
  }, [pd.summary.id, rev]);

  const { scheduled, unscheduled } = useMemo(() => {
    const top = tasks.filter((t) => !t.parentId);
    const s = []; const u = [];
    for (const t of top) (t.startDate || t.dueDate ? s : u).push(t);
    s.sort((a, b) => (a.startDate || a.dueDate).localeCompare(b.startDate || b.dueDate) || a.number - b.number);
    return { scheduled: s, unscheduled: u };
  }, [tasks]);

  const span = (t) => {
    const start = t.startDate || t.dueDate;
    const end = t.dueDate || t.startDate;
    return { start, end };
  };

  const range = useMemo(() => {
    let lo = today; let hi = today;
    for (const t of scheduled) { const { start, end } = span(t); if (start < lo) lo = start; if (end > hi) hi = end; }
    const min = addDays(lo, -4);
    let max = addDays(hi, 14);
    if (diffDays(max, min) < 35) max = addDays(min, 35);
    // Always at least as wide as the screen, so the grid never stops short of the edge.
    const fill = Math.ceil(Math.max(0, viewW - LABEL_W) / px) + 1;
    const days = Math.max(diffDays(max, min) + 1, fill);
    return { min, max: addDays(min, days - 1), days };
  }, [scheduled, today, viewW, px]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = () => setViewW(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const x = (date) => diffDays(date, range.min) * px;
  const shown = scheduled.slice(0, limit);
  const rowOf = new Map(shown.map((t, i) => [t.id, i]));
  const width = range.days * px;

  // Header cells: months on top, days (or Mondays) below.
  const months = useMemo(() => {
    const out = [];
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.min, i);
      const key = d.slice(0, 7);
      if (!out.length || out[out.length - 1].key !== key) out.push({ key, label: parseISO(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), days: 0 });
      out[out.length - 1].days += 1;
    }
    return out;
  }, [range]);
  const ticks = useMemo(() => {
    const out = [];
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.min, i);
      const monday = (parseISO(d).getDay() + 6) % 7 === 0;
      if (zoom === 'day' || (zoom === 'week' && monday)) out.push({ d, left: i * px, label: String(parseISO(d).getDate()), weekend: [0, 6].includes(parseISO(d).getDay()) });
    }
    return out;
  }, [range, zoom, px]);

  const mondayOffset = (7 - ((parseISO(range.min).getDay() + 6) % 7)) % 7;
  const grid = { backgroundImage: 'linear-gradient(to right, rgba(148,163,184,.28) 1px, transparent 1px)', backgroundSize: `${7 * px}px 100%`, backgroundPosition: `${mondayOffset * px}px 0` };

  useEffect(() => { // start with today in view
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, x(today) - 160);
  }, [zoom, pd.summary.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function datesFor(t, mode, delta) {
    const { start, end } = span(t);
    if (mode === 'move') {
      const out = {};
      if (t.startDate) out.startDate = addDays(t.startDate, delta);
      if (t.dueDate) out.dueDate = addDays(t.dueDate, delta);
      return out;
    }
    if (mode === 'start') { const ns = addDays(start, delta); return { startDate: ns > end ? end : ns }; }
    // With no start date there is nothing to collide with, so the due date just moves.
    const ne = addDays(end, delta);
    return { dueDate: t.startDate && ne < t.startDate ? t.startDate : ne };
  }

  function commit(t, mode, delta) {
    if (!delta || !canWrite) return;
    const changes = datesFor(t, mode, delta);
    const verb = mode === 'move' ? 'Moved' : mode === 'start' ? 'Changed the start of' : 'Changed the end of';
    setAnnounce(`${verb} ${t.projectKey}-${t.number}${changes.dueDate ? `, due ${formatDay(changes.dueDate)}` : ''}${changes.startDate ? `, starts ${formatDay(changes.startDate)}` : ''}`);
    actions.updateOptimistic(t.id, changes).catch(() => {});
  }

  function startDrag(e, t, mode) {
    if (!canWrite || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const origin = e.clientX;
    let delta = 0;
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - origin;
      if (Math.abs(dx) > 3) moved = true;
      delta = Math.round(dx / px);
      setDrag({ id: t.id, mode, delta });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved && mode === 'move') onOpen(t);
      else commit(t, mode, delta);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onKey(e, t) {
    if (e.key === 'Enter') { onOpen(t); return; }
    if (!e.altKey || !['ArrowLeft', 'ArrowRight'].includes(e.key) || !canWrite) return;
    e.preventDefault();
    commit(t, e.shiftKey ? 'end' : 'move', e.key === 'ArrowLeft' ? -1 : 1);
  }

  const barFor = (t) => {
    const { start, end } = span(t);
    let left = x(start);
    let w = (diffDays(end, start) + 1) * px;
    if (drag && drag.id === t.id) {
      const d = drag.delta * px;
      if (drag.mode === 'move') left += d;
      else if (drag.mode === 'start') { left += Math.min(d, w - px); w -= Math.min(d, w - px); } else w = Math.max(px, w + d);
    }
    return { left: left + 2, width: Math.max(w - 4, 14) };
  };

  if (!scheduled.length && !unscheduled.length) return <EmptyState icon="calendar" title="Nothing to show on the timeline">Tasks with a start or due date appear here as bars.</EmptyState>;

  return (
    <div>
      <p aria-live="polite" className="sr-only" role="status">{announce}</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div aria-label="Zoom" className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-[#343b47] dark:bg-[#14171c]" role="radiogroup">
          {ZOOMS.map(([k, label]) => <button aria-checked={zoom === k} className={`h-8 rounded-md px-3 text-xs font-medium ${zoom === k ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'muted'}`} key={k} onClick={() => setZoom(k)} role="radio" type="button">{label}</button>)}
        </div>
        <button className="btn btn-sm" onClick={() => { if (scroller.current) scroller.current.scrollTo({ left: Math.max(0, x(today) - 160), behavior: 'smooth' }); }} type="button">Today</button>
        <p className="faint ml-auto text-xs">{canWrite ? 'Drag a bar to reschedule, drag its edges to resize. Keyboard: Alt+Arrow moves a day, Alt+Shift+Arrow changes the end.' : 'View only.'}</p>
      </div>

      <div className="surface overflow-hidden">
        <div className="max-h-[70vh] overflow-auto" ref={scroller}>
          <div className="relative" style={{ width: LABEL_W + width }}>
            <div className="sticky top-0 z-20 flex border-b border-line bg-white dark:bg-[#14171c]">
              <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line bg-white px-3 pb-2 text-xs font-semibold dark:bg-[#14171c]" style={{ width: LABEL_W }}>Task</div>
              <div className="relative" style={{ width, height: 52 }}>
                <div className="flex h-6 border-b border-line">
                  {months.map((m) => <div className="truncate border-r border-line px-2 text-xs font-semibold leading-6" key={m.key} style={{ width: m.days * px }}>{m.days * px > 70 ? m.label : ''}</div>)}
                </div>
                {ticks.map((t) => <span className={`absolute top-6 text-[10px] leading-5 ${t.weekend ? 'faint' : 'muted'}`} key={t.d} style={{ left: t.left, width: zoom === 'day' ? px : 7 * px, textAlign: zoom === 'day' ? 'center' : 'left', paddingLeft: zoom === 'day' ? 0 : 3 }}>{t.label}</span>)}
              </div>
            </div>

            <div className="relative" role="list" aria-label="Scheduled tasks">
              {shown.map((t) => {
                const bar = barFor(t);
                const st = pd.statusById.get(t.statusId);
                const done = st?.category === 'done';
                const color = st?.color || '#94a3b8';
                const { start, end } = span(t);
                return (
                  <div className={`flex border-b border-line ${t.number === activeNumber ? 'bg-slate-50 dark:bg-[#181c22]' : ''}`} key={t.id} role="listitem" style={{ height: ROW }}>
                    <button className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-white px-3 text-left text-sm hover:bg-slate-50 dark:bg-[#14171c] dark:hover:bg-[#181c22]" onClick={() => onOpen(t)} style={{ width: LABEL_W }} type="button">
                      <span className="faint font-mono text-[11px]">{t.projectKey}-{t.number}</span>
                      <span className={`min-w-0 flex-1 truncate ${done ? 'faint line-through' : ''}`}>{t.title}</span>
                    </button>
                    <div className="relative" style={{ width, ...grid }}>
                      <div
                        aria-label={`${t.projectKey}-${t.number} ${t.title}, ${formatDay(start)} to ${formatDay(end)}${canWrite ? '. Alt plus arrow keys move it.' : ''}`}
                        className={`group absolute top-1.5 flex h-6 select-none items-center overflow-hidden rounded-md text-[11px] font-medium shadow-sm outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-[#86bc25] ${canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${drag?.id === t.id ? 'opacity-80' : ''}`}
                        onClick={() => { if (!canWrite) onOpen(t); }}
                        onKeyDown={(e) => onKey(e, t)}
                        onPointerDown={(e) => startDrag(e, t, 'move')}
                        role="button"
                        style={{ left: bar.left, width: bar.width, background: color, color: readableOn(color), opacity: done ? 0.6 : undefined, touchAction: 'none' }}
                        tabIndex={0}
                      >
                        {canWrite && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-black/20" onPointerDown={(e) => startDrag(e, t, 'start')} />}
                        <span className="truncate px-2.5">{bar.width > 90 ? t.title : bar.width > 46 ? `${t.projectKey}-${t.number}` : ''}</span>
                        {canWrite && <span aria-hidden="true" className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-black/20" onPointerDown={(e) => startDrag(e, t, 'end')} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500/70" style={{ left: LABEL_W + x(today) + px / 2 }} />
              <svg aria-hidden="true" className="pointer-events-none absolute top-0" height={shown.length * ROW} style={{ left: LABEL_W }} width={width}>
                <defs><marker id="arrow" markerHeight="6" markerWidth="6" orient="auto" refX="5" refY="3"><path d="M0,0 L6,3 L0,6 Z" fill="#dc2626" /></marker></defs>
                {relations.filter((r) => r.type === 'blocks' && rowOf.has(r.from) && rowOf.has(r.to)).map((r) => {
                  const a = pd.taskById.get(r.from); const b = pd.taskById.get(r.to);
                  if (!a || !b) return null;
                  const aBar = barFor(a); const bBar = barFor(b);
                  const x1 = aBar.left + aBar.width; const y1 = rowOf.get(r.from) * ROW + ROW / 2;
                  const x2 = bBar.left; const y2 = rowOf.get(r.to) * ROW + ROW / 2;
                  const mid = Math.max(x1 + 10, Math.min(x2 - 10, x1 + 14));
                  const open = pd.statusById.get(a.statusId)?.category !== 'done';
                  return <path d={`M${x1},${y1} H${mid} V${y2} H${x2}`} fill="none" key={r.id} markerEnd="url(#arrow)" opacity={open ? 1 : 0.35} stroke="#dc2626" strokeWidth="1.5" />;
                })}
              </svg>
            </div>
          </div>
        </div>
        {scheduled.length > limit && <button className="faint w-full border-t border-line px-4 py-2.5 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-[#181c22]" onClick={() => setLimit((l) => l + PAGE)} type="button">Show {Math.min(PAGE, scheduled.length - limit)} more ({scheduled.length - limit} hidden)</button>}
        {!scheduled.length && <p className="faint px-4 py-6 text-center text-sm">No task has a date yet. Set one below to place it on the timeline.</p>}
      </div>

      {unscheduled.length > 0 && (
        <section aria-label="Tasks without dates" className="surface mt-4">
          <h3 className="px-4 py-3 text-sm font-semibold">No dates yet <span className="faint font-normal">{unscheduled.length}</span></h3>
          <ul className="divide-y divide-line border-t border-line">
            {unscheduled.slice(0, 50).map((t) => (
              <li className="flex items-center gap-3 px-4 py-2 text-sm" key={t.id}>
                <span className="faint font-mono text-xs">{t.projectKey}-{t.number}</span>
                <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpen(t)} type="button">{t.title}</button>
                {canWrite && <input aria-label={`Due date for ${t.projectKey}-${t.number}`} className="input h-8 w-40 text-xs" onChange={(e) => e.target.value && actions.update(t.id, { dueDate: e.target.value }).catch(() => {})} type="date" />}
                <Icon className="size-4 text-slate-400" name="calendar" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
