/* Turns an activity row into a short sentence. */
import { formatDuration, formatDay } from './dates.mjs';

const show = (v) => (v === null || v === undefined || v === '' ? 'none' : v);

export function describeActivity(a) {
  const d = a.detail || {};
  switch (a.action) {
    case 'task.created': return `created this task${d.key ? ` (${d.key})` : ''}`;
    case 'task.deleted': return `deleted ${d.key || 'a task'}${d.title ? `: ${d.title}` : ''}`;
    case 'task.bulk_deleted': return `deleted ${d.count} tasks`;
    case 'task.status': return `moved this from ${d.from} to ${d.to}`;
    case 'task.title': return `renamed this from “${d.from}” to “${d.to}”`;
    case 'task.description': return 'updated the description';
    case 'task.priority': return `changed priority from ${d.from} to ${d.to}`;
    case 'task.assignee': return d.to ? `assigned this to ${d.to}${d.from ? ` (was ${d.from})` : ''}` : `unassigned this${d.from ? ` from ${d.from}` : ''}`;
    case 'task.startDate': return `changed the start date from ${d.from ? formatDay(d.from) : 'none'} to ${d.to ? formatDay(d.to) : 'none'}`;
    case 'task.dueDate': return `changed the due date from ${d.from ? formatDay(d.from) : 'none'} to ${d.to ? formatDay(d.to) : 'none'}`;
    case 'task.dueTime': return `changed the due time to ${show(d.to)}`;
    case 'task.estimate': return `changed the estimate to ${d.to == null ? 'none' : formatDuration(d.to)}`;
    case 'task.labels': {
      const parts = [];
      if (d.added && d.added.length) parts.push(`added ${d.added.join(', ')}`);
      if (d.removed && d.removed.length) parts.push(`removed ${d.removed.join(', ')}`);
      return `${parts.join(' and ')} (labels)`;
    }
    case 'task.commented': return 'commented';
    case 'task.points': return `changed the story points to ${d.to == null ? 'none' : d.to}`;
    case 'task.sprint': return d.to ? `moved this into ${d.to}${d.from ? ` (from ${d.from})` : ''}` : `moved this to the backlog${d.from ? ` (from ${d.from})` : ''}`;
    case 'task.recurrence': return `set this to repeat: ${d.to}`;
    case 'task.recurred': return `created the next occurrence, ${d.key}, due ${d.due}`;
    case 'task.custom': return `set ${d.name} to ${d.to === null || d.to === undefined ? 'empty' : String(d.to)}`;
    case 'sprint.created': return `planned the sprint ${d.name}`;
    case 'sprint.started': return `started the sprint ${d.name}`;
    case 'sprint.completed': return `completed the sprint ${d.name} (${d.done} done, ${d.moved} carried over)`;
    case 'sprint.deleted': return `deleted the sprint ${d.name}`;
    case 'task.attachment': return `attached the file ${d.name}`;
    case 'task.attachment_removed': return `removed the file ${d.name}`;
    case 'task.relation': return `linked this task: ${{ blocks: 'blocks', relates: 'relates to', duplicates: 'duplicates' }[d.type] || d.type} ${d.other}`;
    case 'task.link': return `attached a link: ${d.name}`;
    case 'project.created': return `created the project ${d.name}`;
    case 'project.updated': return `updated the project ${d.name}`;
    case 'project.archived': return `archived the project ${d.name}`;
    case 'project.restored': return `restored the project ${d.name}`;
    case 'project.deleted': return `deleted the project ${d.name}`;
    case 'project.imported': return `imported ${d.tasks} tasks from the original close-out checklist`;
    case 'workspace.created': return `created the workspace ${d.name}`;
    case 'member.invited': return `invited ${d.email} as ${d.role}`;
    case 'member.joined': return `${d.name} joined as ${d.role}`;
    case 'member.role': return `changed ${d.name} from ${d.from} to ${d.to}`;
    case 'member.removed': return `removed ${d.name || 'a member'}`;
    case 'member.left': return 'left the workspace';
    default: return a.action;
  }
}

/* Names of members mentioned in a comment body ("@Tosin Ilesanmi"). */
export function mentionedIds(body, members) {
  // Longest names first, and blank out each match, so "@Tosin Ilesanmi" does not also mention a member named "Tosin".
  let rest = body.toLowerCase();
  const found = [];
  for (const m of [...members].sort((x, y) => y.name.length - x.name.length)) {
    const token = `@${m.name.toLowerCase()}`;
    if (rest.includes(token)) {
      found.push(m.id);
      rest = rest.split(token).join(' ');
    }
  }
  return found;
}

/* Splits text into [{text, mention}] so @names can be highlighted. With one capture group, matches land at odd indices. */
export function splitMentions(body, members) {
  const names = members.map((m) => m.name).sort((a, b) => b.length - a.length);
  if (!names.length) return [{ text: body, mention: false }];
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(@(?:${esc.join('|')}))`, 'i');
  return body.split(re).map((text, i) => ({ text, mention: i % 2 === 1 })).filter((p) => p.text !== '');
}
