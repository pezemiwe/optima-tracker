import { useMemo, useState } from 'react';
import { api } from '../api.js';
import Burndown from '../components/Burndown.jsx';
import Icon from '../components/Icon.jsx';
import { BlockedBadge, StatusSelect } from '../components/TaskBits.jsx';
import { EmptyState, Modal, PriorityIcon, Select, UserSelect, useConfirm, useToast } from '../components/ui.jsx';
import { formatDay } from '../lib/dates.mjs';
import { useWorkspace } from '../state/workspace.jsx';

const PAGE = 100;
const STATE_CHIP = { active: 'bg-[#86bc25]/20 text-[#2c4a06] dark:text-[#a6d95a]', planned: 'bg-slate-100 text-slate-700 dark:bg-[#242a33] dark:text-slate-300', completed: 'bg-slate-100 text-slate-700 dark:bg-[#242a33] dark:text-slate-300' };

function SprintModal({ sprint, onSave, onClose }) {
  const [form, setForm] = useState({ name: sprint?.name || '', goal: sprint?.goal || '', startDate: sprint?.startDate || '', endDate: sprint?.endDate || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await onSave({ name: form.name, goal: form.goal, startDate: form.startDate || null, endDate: form.endDate || null }); } catch (err) { setError(err.message); setBusy(false); }
  }
  return (
    <Modal footer={<><button className="btn" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" disabled={!form.name.trim() || busy} form="sprint-form" type="submit">{sprint ? 'Save sprint' : 'Create sprint'}</button></>} onClose={onClose} size="sm" title={sprint ? 'Edit sprint' : 'New sprint'}>
      <form className="grid gap-4" id="sprint-form" onSubmit={submit}>
        <div><label className="field-label" htmlFor="sp-name">Name</label><input autoFocus className="input" id="sp-name" maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sprint 4" value={form.name} /></div>
        <div><label className="field-label" htmlFor="sp-goal">Goal <span className="faint">(optional)</span></label><textarea className="input" id="sp-goal" maxLength={500} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} value={form.goal} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="field-label" htmlFor="sp-start">Start</label><input className="input" id="sp-start" max={form.endDate || undefined} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} type="date" value={form.startDate} /></div>
          <div><label className="field-label" htmlFor="sp-end">End</label><input className="input" id="sp-end" min={form.startDate || undefined} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} type="date" value={form.endDate} /></div>
        </div>
        <p className="faint text-xs">Leave the dates empty to set them when you start the sprint (two weeks by default).</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

function CompleteModal({ sprint, openCount, planned, onComplete, onClose }) {
  const [target, setTarget] = useState(null);
  const options = [{ value: null, label: 'Back to the backlog' }, ...planned.map((s) => ({ value: s.id, label: `Move to ${s.name}` }))];
  return (
    <Modal footer={<><button className="btn" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" onClick={() => onComplete(target)} type="button">Complete sprint</button></>} onClose={onClose} size="sm" title={`Complete ${sprint.name}`}>
      <p className="muted text-sm">{openCount === 0 ? 'Every task in this sprint is done.' : `${openCount} ${openCount === 1 ? 'task is' : 'tasks are'} not finished.`} A snapshot of the sprint is kept for its history.</p>
      {openCount > 0 && <div className="mt-4"><span className="field-label">Move unfinished tasks</span><Select ariaLabel="Where unfinished tasks go" className="btn w-full justify-between" onChange={setTarget} options={options} value={target} /></div>}
    </Modal>
  );
}

function Row({ task, pd, actions, canWrite, onOpen, sprintOptions, dragging, onDragStart, onDragEnd }) {
  const { members } = useWorkspace();
  const done = pd.statusById.get(task.statusId)?.category === 'done';
  const [points, setPoints] = useState(task.points ?? '');
  const savePoints = () => {
    const next = points === '' ? null : Math.max(0, Math.min(1000, parseInt(points, 10) || 0));
    if (next !== task.points) actions.update(task.id, { points: next }).catch(() => {});
  };
  return (
    <div
      className={`group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-[#181c22] sm:grid-cols-[64px_minmax(0,1fr)_150px_32px_64px_150px] ${dragging ? 'opacity-40' : ''}`}
      draggable={canWrite}
      onClick={() => onOpen(task)}
      onDragEnd={onDragEnd}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(task); }}
      role="listitem"
      tabIndex={0}
    >
      <span className="faint hidden font-mono text-xs sm:block">{task.projectKey}-{task.number}</span>
      <span className="flex min-w-0 items-center gap-2"><PriorityIcon value={task.priority} /><span className={`truncate font-medium ${done ? 'faint line-through' : ''}`}>{task.title}</span><BlockedBadge task={task} /></span>
      <span className="hidden sm:block" onClick={(e) => e.stopPropagation()}>{canWrite && <StatusSelect className="btn btn-ghost btn-sm -ml-2 max-w-full" onChange={(statusId) => actions.update(task.id, { statusId }).catch(() => {})} statuses={pd.statuses} value={task.statusId} />}</span>
      <span className="flex justify-center" onClick={(e) => e.stopPropagation()}><UserSelect className="rounded-full" disabled={!canWrite} members={members} onChange={(assigneeId) => actions.update(task.id, { assigneeId }).catch(() => {})} showName={false} value={task.assigneeId} /></span>
      <span className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
        <input aria-label={`Story points for ${task.projectKey}-${task.number}`} className="input h-8 w-14 px-2 text-center text-xs" disabled={!canWrite} inputMode="numeric" onBlur={savePoints} onChange={(e) => setPoints(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="pts" value={points} />
      </span>
      <span className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
        <Select ariaLabel={`Sprint for ${task.projectKey}-${task.number}`} className="btn btn-ghost btn-sm w-full justify-between" disabled={!canWrite} onChange={(sprintId) => actions.update(task.id, { sprintId }).catch(() => {})} options={sprintOptions} value={task.sprintId || null} />
      </span>
    </div>
  );
}

function Section({ title, subtitle, chip, stats, actions, tasks, pd, actionsApi, canWrite, onOpen, sprintOptions, dropId, dragId, setDragId, onDropTask, emptyText, children, collapsible }) {
  const [over, setOver] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(!collapsible);
  return (
    <section
      aria-label={title}
      className={`surface mb-4 overflow-hidden transition ${over ? 'ring-2 ring-[#86bc25]' : ''}`}
      onDragLeave={() => setOver(false)}
      onDragOver={(e) => { if (dragId && dropId !== undefined) { e.preventDefault(); setOver(true); } }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (dragId && dropId !== undefined) onDropTask(dragId, dropId); }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-slate-50/70 px-4 py-3 dark:bg-[#181c22]/70">
        {collapsible && <button aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`} className="icon-btn size-6" onClick={() => setOpen((o) => !o)} type="button"><Icon className="size-4" name={open ? 'chevronDown' : 'chevronRight'} /></button>}
        <h3 className="font-semibold">{title}</h3>
        {chip && <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${STATE_CHIP[chip]}`}>{chip}</span>}
        {subtitle && <span className="muted text-xs">{subtitle}</span>}
        <span className="faint text-xs">{stats}</span>
        <span className="ml-auto flex flex-wrap gap-2">{actions}</span>
      </header>
      {children}
      {open && (
        <div aria-label={`${title} tasks`} role="list">
          {tasks.slice(0, limit).map((t) => (
            <Row actions={actionsApi} canWrite={canWrite} dragging={dragId === t.id} key={t.id} onDragEnd={() => setDragId(null)} onDragStart={(task) => setDragId(task.id)} onOpen={onOpen} pd={pd} sprintOptions={sprintOptions} task={t} />
          ))}
          {tasks.length > limit && <button className="faint w-full border-t border-line px-4 py-2.5 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-[#181c22]" onClick={() => setLimit((l) => l + PAGE)} type="button">Show {Math.min(PAGE, tasks.length - limit)} more ({tasks.length - limit} hidden)</button>}
          {!tasks.length && <p className="faint border-t border-line px-4 py-5 text-center text-sm">{emptyText}</p>}
        </div>
      )}
    </section>
  );
}

export default function BacklogView({ tasks, pd, actions, canWrite, onOpen }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [dragId, setDragId] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'new' | 'edit' | 'complete', sprint }
  const [showBurndown, setShowBurndown] = useState(true);
  const [tick, setTick] = useState(0);

  const top = useMemo(() => tasks.filter((t) => !t.parentId), [tasks]);
  const bySprint = useMemo(() => {
    const map = new Map();
    for (const t of top) { if (!map.has(t.sprintId || null)) map.set(t.sprintId || null, []); map.get(t.sprintId || null).push(t); }
    return map;
  }, [top]);
  const sprintOptions = useMemo(() => [{ value: null, label: 'Backlog' }, ...pd.sprints.filter((s) => s.state !== 'completed').map((s) => ({ value: s.id, label: s.name }))], [pd.sprints]);
  const planned = pd.sprints.filter((s) => s.state === 'planned');
  const writable = canWrite && !pd.project?.archived;

  async function run(fn, ok) {
    try { await fn(); await pd.afterWrite(); await pd.reload(); setTick((n) => n + 1); if (ok) toast.success(ok); } catch (e) { toast.error(e.message); await pd.reload(); }
  }
  const assign = (taskId, sprintId) => {
    const task = pd.taskById.get(taskId);
    setDragId(null);
    if (!task || task.sprintId === (sprintId || null) || task.parentId) return;
    pd.patchLocal(taskId, { sprintId: sprintId || null });
    run(() => api.patch(`/tasks/${taskId}`, { sprintId: sprintId || null }));
  };

  const sprintStats = (s) => `${s.taskCount} ${s.taskCount === 1 ? 'task' : 'tasks'} · ${s.doneCount} done${s.points ? ` · ${s.donePoints}/${s.points} pts` : ''}`;
  const sprintDates = (s) => (s.startDate && s.endDate ? `${formatDay(s.startDate)} – ${formatDay(s.endDate)}` : 'No dates yet');
  const live = pd.sprints.filter((s) => s.state !== 'completed');
  const finished = pd.sprints.filter((s) => s.state === 'completed');

  async function completeSprint(sprint, moveTo) {
    setModal(null);
    await run(() => api.post(`/sprints/${sprint.id}/complete`, { moveTo }), `Completed ${sprint.name}`);
  }
  async function removeSprint(s) {
    const ok = await confirm({ title: `Delete ${s.name}?`, message: s.taskCount ? `Its ${s.taskCount} tasks go back to the backlog.` : 'It has no tasks.', confirmLabel: 'Delete sprint', danger: true });
    if (ok) run(() => api.del(`/sprints/${s.id}`));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="muted text-sm">Plan the work: drag tasks into a sprint, give them story points, then start the sprint.</p>
        {writable && <button className="btn btn-primary ml-auto" onClick={() => setModal({ type: 'new' })} type="button"><Icon className="size-4" name="add" />New sprint</button>}
      </div>

      {live.map((s) => (
        <Section
          actions={writable && (
            <>
              {s.state === 'planned' && <button className="btn btn-sm btn-primary" onClick={() => run(() => api.post(`/sprints/${s.id}/start`), `Started ${s.name}`)} type="button">Start sprint</button>}
              {s.state === 'active' && <button className="btn btn-sm btn-primary" onClick={() => setModal({ type: 'complete', sprint: s })} type="button">Complete sprint</button>}
              {s.state === 'active' && <button aria-pressed={showBurndown} className="btn btn-sm" onClick={() => setShowBurndown((b) => !b)} type="button">Burndown</button>}
              <button aria-label={`Edit ${s.name}`} className="icon-btn" onClick={() => setModal({ type: 'edit', sprint: s })} type="button"><Icon name="edit" /></button>
              {s.state === 'planned' && <button aria-label={`Delete ${s.name}`} className="icon-btn" onClick={() => removeSprint(s)} type="button"><Icon name="trash" /></button>}
            </>
          )}
          actionsApi={actions}
          canWrite={writable}
          chip={s.state}
          dragId={dragId}
          dropId={s.id}
          emptyText="Drag tasks here, or use the Sprint menu on any task."
          key={s.id}
          onDropTask={assign}
          onOpen={onOpen}
          pd={pd}
          setDragId={setDragId}
          sprintOptions={sprintOptions}
          stats={sprintStats(s)}
          subtitle={`${sprintDates(s)}${s.goal ? ` · ${s.goal}` : ''}`}
          tasks={bySprint.get(s.id) || []}
          title={s.name}
        >
          {s.state === 'active' && showBurndown && <div className="border-t border-line px-4 py-3"><Burndown refreshKey={tick + (pd.tasks.length)} sprintId={s.id} /></div>}
        </Section>
      ))}

      <Section
        actionsApi={actions}
        canWrite={writable}
        dragId={dragId}
        dropId={null}
        emptyText="The backlog is empty."
        onDropTask={assign}
        onOpen={onOpen}
        pd={pd}
        setDragId={setDragId}
        sprintOptions={sprintOptions}
        stats={`${(bySprint.get(null) || []).length} tasks${(bySprint.get(null) || []).reduce((n, t) => n + (t.points || 0), 0) ? ` · ${(bySprint.get(null) || []).reduce((n, t) => n + (t.points || 0), 0)} pts` : ''}`}
        subtitle="Not in any sprint"
        tasks={bySprint.get(null) || []}
        title="Backlog"
      />

      {finished.length > 0 && (
        <>
          <h3 className="faint mb-2 mt-6 text-xs font-semibold uppercase tracking-wider">Completed sprints</h3>
          {finished.map((s) => (
            <Section actionsApi={actions} canWrite={false} chip="completed" collapsible key={s.id} onOpen={onOpen} pd={pd} setDragId={setDragId} sprintOptions={sprintOptions} stats={sprintStats(s)} subtitle={`${sprintDates(s)}${s.summary ? ` · ${s.summary.moved} carried over to ${s.summary.movedTo}` : ''}`} tasks={bySprint.get(s.id) || []} title={s.name}>
              {s.summary && <div className="border-t border-line px-4 py-3"><Burndown sprintId={s.id} /></div>}
            </Section>
          ))}
        </>
      )}

      {!pd.sprints.length && !top.length && <EmptyState icon="layers" title="Nothing to plan yet">Create tasks first, then group them into sprints here.</EmptyState>}

      {modal?.type === 'new' && <SprintModal onClose={() => setModal(null)} onSave={async (body) => { await api.post(`/projects/${pd.summary.id}/sprints`, body); setModal(null); await pd.afterWrite(); await pd.reload(); }} />}
      {modal?.type === 'edit' && <SprintModal onClose={() => setModal(null)} onSave={async (body) => { await api.patch(`/sprints/${modal.sprint.id}`, body); setModal(null); await pd.afterWrite(); await pd.reload(); setTick((n) => n + 1); }} sprint={modal.sprint} />}
      {modal?.type === 'complete' && <CompleteModal onClose={() => setModal(null)} onComplete={(moveTo) => completeSprint(modal.sprint, moveTo)} openCount={(bySprint.get(modal.sprint.id) || []).filter((t) => pd.statusById.get(t.statusId)?.category !== 'done').length} planned={planned} sprint={modal.sprint} />}
    </div>
  );
}
