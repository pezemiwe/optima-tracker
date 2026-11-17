import Icon from './Icon.jsx';
import { initials } from '../utils.js';

const workstreamColors = [
  'bg-lime-500/20 text-lime-400',
  'bg-blue-500/20 text-blue-400',
  'bg-amber-500/20 text-amber-400',
  'bg-violet-500/20 text-violet-400',
  'bg-teal-500/20 text-teal-400',
  'bg-rose-500/20 text-rose-400',
  'bg-slate-500/25 text-slate-300',
];
const personColors = ['bg-lime-700', 'bg-teal-600', 'bg-violet-500', 'bg-slate-500', 'bg-teal-700', 'bg-slate-600', 'bg-sky-600', 'bg-amber-600'];

function FilterButton({ active, collapsed, count, label, onClick, color = 'bg-slate-500/25 text-slate-300', badge, round = false }) {
  return (
    <button
      aria-pressed={active}
      className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition ${active ? 'bg-[#1d232b] text-white' : 'text-slate-300 hover:bg-[#161a20]'} ${collapsed ? 'justify-center px-0' : ''}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      type="button"
    >
      <span className={`grid size-7 shrink-0 place-items-center text-[10px] font-semibold ${round ? 'rounded-full text-white' : 'rounded-md'} ${color}`}>{badge}</span>
      {!collapsed && <><span className="min-w-0 flex-1 truncate">{label}</span><span className="font-mono text-xs text-slate-500">{count}</span></>}
    </button>
  );
}

export default function Sidebar({ tasks, workstreams, owners, workstream, owner, onWorkstream, onOwner, onAddWorkstream, onAddOwner, onManageOptions, theme, onTheme, collapsed = false, onCollapse }) {
  const countsFor = (property, value) => tasks.filter((task) => property === 'all' || task[property] === value).length;
  const workstreamTasks = workstream === 'all' ? tasks : tasks.filter((task) => task.ws === workstream);
  const heading = 'px-3 pb-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500';
  const addButton = 'grid size-7 shrink-0 place-items-center rounded-md bg-[#86bc25] text-slate-950 transition-colors hover:bg-[#97cf2e]';

  return (
    <aside className="flex h-full flex-col border-r border-[#1b2027] bg-[#0b0d10] text-slate-100">
      <div className={`flex h-[72px] shrink-0 items-center gap-3 border-b border-[#1b2027] ${collapsed ? 'justify-center' : 'px-5'}`}>
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-[#86bc25] after:absolute after:size-2.5 after:rounded-full after:bg-black" />
        {!collapsed && <span className="font-semibold tracking-tight">Optima Close-out</span>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className={`${heading} flex items-center justify-between pt-4`}>
          {!collapsed && <span>Workstreams</span>}
          <button aria-label="Add workstream" className={addButton} onClick={onAddWorkstream} title={collapsed ? 'Add workstream' : undefined} type="button">
            <Icon className="size-4" name="add" />
          </button>
        </div>
        <FilterButton active={workstream === 'all'} badge={<Icon className="size-4" name="grid" />} collapsed={collapsed} count={countsFor('all')} label="All workstreams" onClick={() => onWorkstream('all')} />
        {workstreams.map((item, index) => (
          <FilterButton
            active={workstream === item}
            badge={item.slice(0, 2).toUpperCase()}
            collapsed={collapsed}
            color={workstreamColors[index % workstreamColors.length]}
            count={countsFor('ws', item)}
            key={item}
            label={item}
            onClick={() => onWorkstream(workstream === item ? 'all' : item)}
          />
        ))}
        <div className={`${heading} flex items-center justify-between pt-7`}>
          {!collapsed && <span>Team</span>}
          <button aria-label="Add team owner" className={addButton} onClick={onAddOwner} title={collapsed ? 'Add team owner' : undefined} type="button">
            <Icon className="size-4" name="add" />
          </button>
        </div>
        <div className={collapsed ? 'mt-4' : ''}>
          <FilterButton active={owner === 'all'} badge={<Icon className="size-4" name="user" />} collapsed={collapsed} color="bg-slate-500" count={workstreamTasks.length} label="Everyone" onClick={() => onOwner('all')} round />
          {owners.map((person, index) => (
            <FilterButton
              active={owner === person}
              badge={initials(person)}
              collapsed={collapsed}
              color={personColors[index % personColors.length]}
              count={workstreamTasks.filter((task) => task.owner === person).length}
              key={person}
              label={person}
              onClick={() => onOwner(owner === person ? 'all' : person)}
              round
            />
          ))}
          {workstreamTasks.some((task) => !task.owner) && (
            <FilterButton active={owner === '__none'} badge="?" collapsed={collapsed} color="bg-slate-600" count={workstreamTasks.filter((task) => !task.owner).length} label="Unassigned" onClick={() => onOwner(owner === '__none' ? 'all' : '__none')} round />
          )}
        </div>
      </div>
      <div className="border-t border-[#1b2027] p-3">
        <button
          aria-label="Manage workstreams and team owners"
          className={`mb-2 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-slate-300 hover:bg-[#161a20] ${collapsed ? 'justify-center px-0' : ''}`}
          onClick={onManageOptions}
          title={collapsed ? 'Manage lists' : undefined}
          type="button"
        >
          <Icon className="size-4" name="list" />{!collapsed && 'Manage lists'}
        </button>
        <div className={`grid gap-1 rounded-lg bg-[#14181d] p-1 ${collapsed ? '' : 'grid-cols-2'}`}>
          {(collapsed ? [theme === 'dark' ? 'light' : 'dark'] : ['light', 'dark']).map((mode) => (
            <button aria-label={`${mode} theme`} aria-pressed={theme === mode} className={`flex h-9 items-center justify-center gap-2 rounded-md text-sm ${theme === mode && !collapsed ? 'bg-[#2a313b] text-white' : 'text-slate-400'}`} key={mode} onClick={() => onTheme(mode)} type="button">
              <Icon className="size-4" name={mode === 'light' ? 'sun' : 'moon'} />{!collapsed && (mode === 'light' ? 'Light' : 'Dark')}
            </button>
          ))}
        </div>
        {onCollapse && (
          <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`mt-2 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-slate-300 hover:bg-[#161a20] ${collapsed ? 'justify-center px-0' : ''}`} onClick={onCollapse} type="button">
            <Icon className="size-4" name={collapsed ? 'chevronRight' : 'chevronLeft'} />{!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </aside>
  );
}
