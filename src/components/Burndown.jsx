import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Spinner } from './ui.jsx';
import { formatDay } from '../lib/dates.mjs';

/* Remaining work per day against the ideal line. Plain SVG, no chart library. */
export default function Burndown({ sprintId, refreshKey }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get(`/sprints/${sprintId}/burndown`).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setData({ days: [], total: 0, unit: 'tasks' }); });
    return () => { cancelled = true; };
  }, [sprintId, refreshKey]);

  if (!data) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (!data.days.length) return <p className="faint py-6 text-center text-sm">Give the sprint a start and end date to see its burndown.</p>;

  const W = 560; const H = 170;
  const pad = { l: 34, r: 10, t: 10, b: 24 };
  const max = Math.max(data.total, 1);
  const n = data.days.length;
  const x = (i) => pad.l + (n === 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (val) => pad.t + (1 - val / max) * (H - pad.t - pad.b);
  const ideal = data.days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.ideal).toFixed(1)}`).join(' ');
  const actualPts = data.days.map((d, i) => (d.remaining === null ? null : [x(i), y(d.remaining)])).filter(Boolean);
  const actual = actualPts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = [...data.days].reverse().find((d) => d.remaining !== null);
  const summary = `Burndown: ${last ? last.remaining : data.total} of ${data.total} ${data.unit} remaining`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  return (
    <figure className="m-0">
      <svg aria-label={summary} className="h-auto w-full max-w-[560px]" role="img" viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="stroke-slate-200 dark:stroke-[#2b313b]" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="fill-slate-600 text-[10px] dark:fill-slate-400" textAnchor="end" x={pad.l - 6} y={y(t) + 3}>{t}</text>
          </g>
        ))}
        <path className="stroke-slate-400" d={ideal} fill="none" strokeDasharray="4 4" strokeWidth="1.5" />
        {actual && <path d={actual} fill="none" stroke="#65a30d" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />}
        {actualPts.length > 0 && <circle cx={actualPts[actualPts.length - 1][0]} cy={actualPts[actualPts.length - 1][1]} fill="#65a30d" r="3.5" />}
        <text className="fill-slate-600 text-[10px] dark:fill-slate-400" x={pad.l} y={H - 6}>{formatDay(data.days[0].date)}</text>
        <text className="fill-slate-600 text-[10px] dark:fill-slate-400" textAnchor="end" x={W - pad.r} y={H - 6}>{formatDay(data.days[n - 1].date)}</text>
      </svg>
      <figcaption className="muted mt-1 flex flex-wrap gap-x-4 text-xs">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-[#65a30d] align-middle" />Remaining {data.unit}</span>
        <span><span className="mr-1 inline-block h-0 w-4 border-t-2 border-dashed border-slate-400 align-middle" />Ideal</span>
        <span className="ml-auto font-medium">{last ? last.remaining : data.total} of {data.total} left</span>
      </figcaption>
    </figure>
  );
}
