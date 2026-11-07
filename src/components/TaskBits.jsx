import { useMemo } from 'react';
import Icon from './Icon.jsx';
import { LabelChip, MultiSelect, PriorityIcon, Select, StatusDot } from './ui.jsx';
import { dueInfo } from '../lib/dates.mjs';
import { PRIORITIES } from '../lib/filters.mjs';

const TONES = {
  overdue: 'text-red-600 dark:text-red-400',
  today: 'text-amber-600 dark:text-amber-400',
  soon: 'text-slate-700 dark:text-slate-200',
  later: 'text-slate-500 dark:text-slate-400',
  done: 'text-slate-400 dark:text-slate-500',
};

export function DueBadge({ task, done, showTime = true }) {
  const info = dueInfo(task.dueDate, done);
  if (!info) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${TONES[info.tone]}`} title={`Due ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ''}`}>
      <Icon className="size-3.5" name={info.tone === 'overdue' ? 'warning' : 'calendar'} />
      {info.text}{showTime && task.dueTime ? ` ${task.dueTime}` : ''}
    </span>
  );
}

export function SubtaskProgress({ task }) {
  if (!task.subtaskCount) return null;
  return (
    <span className="faint inline-flex items-center gap-1 text-xs" title={`${task.subtaskDone} of ${task.subtaskCount} subtasks done`}>
      <Icon className="size-3.5" name="subtask" />{task.subtaskDone}/{task.subtaskCount}
    </span>
  );
}

export function TaskCounters({ task }) {
  return (
    <>
      {task.commentCount > 0 && <span className="faint inline-flex items-center gap-1 text-xs" title={`${task.commentCount} comments`}><Icon className="size-3.5" name="comment" />{task.commentCount}</span>}
      {task.linkCount > 0 && <span className="faint inline-flex items-center gap-1 text-xs" title={`${task.linkCount} links`}><Icon className="size-3.5" name="link" />{task.linkCount}</span>}
    </>
  );
}

export function StatusSelect({ value, statuses, onChange, disabled, className = 'btn btn-ghost btn-sm', width = 200 }) {
  const options = useMemo(() => statuses.map((s) => ({ value: s.id, label: s.name, node: <StatusDot color={s.color} /> })), [statuses]);
  return (
    <Select ariaLabel="Status" className={className} disabled={disabled} onChange={onChange} options={options} value={value} width={width}>
      {(current) => (
        <>
          <StatusDot color={current?.node?.props?.color} />
          <span className="min-w-0 truncate">{current?.label || 'Status'}</span>
        </>
      )}
    </Select>
  );
}

export function PrioritySelect({ value, onChange, disabled, className = 'btn btn-ghost btn-sm', showLabel = true }) {
  const options = useMemo(() => PRIORITIES.map((p) => ({ value: p.value, label: p.label, node: <Icon className="size-3.5" name="flag" style={{ color: p.color }} /> })), []);
  return (
    <Select ariaLabel="Priority" className={className} disabled={disabled} onChange={onChange} options={options} value={value} width={170}>
      {() => <PriorityIcon showLabel={showLabel} value={value} />}
    </Select>
  );
}

export function LabelSelect({ value, labels, onChange, disabled, className = 'btn btn-ghost btn-sm' }) {
  const options = useMemo(() => labels.map((l) => ({ value: l.id, label: l.name, node: <StatusDot color={l.color} /> })), [labels]);
  const chosen = labels.filter((l) => value.includes(l.id));
  return (
    <MultiSelect className={className} label={chosen.length ? 'Edit' : 'Add labels'} onChange={onChange} options={options} searchable={labels.length > 6} values={disabled ? [] : value}>
    </MultiSelect>
  );
}

export function LabelList({ ids, labelById, max = 3 }) {
  const labels = ids.map((id) => labelById.get(id)).filter(Boolean);
  if (!labels.length) return null;
  return (
    <>
      {labels.slice(0, max).map((l) => <LabelChip key={l.id} label={l} />)}
      {labels.length > max && <span className="faint text-[11px]">+{labels.length - max}</span>}
    </>
  );
}

/* Native date input with a clear button; keeps values as YYYY-MM-DD strings. */
export function DateField({ value, onChange, disabled, min, max, ariaLabel, className = '' }) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <input aria-label={ariaLabel} className="input h-8 pr-12 text-xs" disabled={disabled} max={max} min={min} onChange={(e) => onChange(e.target.value || null)} type="date" value={value || ''} />
      {value && !disabled && <button aria-label="Clear date" className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={() => onChange(null)} type="button"><Icon className="size-3" name="close" /></button>}
    </span>
  );
}

export function Checkbox({ checked, onChange, label, disabled, className = '' }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-[#86bc25] bg-[#86bc25] text-slate-950' : 'border-slate-300 hover:border-[#86bc25] dark:border-slate-600'} ${className}`}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      role="checkbox"
      type="button"
    >
      {checked && <Icon className="size-3" name="check" strokeWidth="3" />}
    </button>
  );
}
