export const WORKSTREAMS = ['OPEX', 'DAMS', 'Print-Paper', 'BRD', 'Environment', 'Testing', 'Other'];
export const TEAM = ['Tosin Ilesanmi', 'Olamide Aladeyelu', 'Paul Ezemiwe', 'Samuel Kolajo', 'Onyenze Chibueze', 'Iyinoluwa Oluwalade'];
export const STATUSES = [
  { value: 'todo', label: 'To do', color: 'slate' },
  { value: 'doing', label: 'In progress', color: 'blue' },
  { value: 'done', label: 'Done', color: 'green' },
  { value: 'merged', label: 'Merged', color: 'violet' },
  { value: 'closed', label: 'Closed', color: 'slate' },
];
export const PRIORITIES = ['high', 'med', 'low'];
export const isFinished = (status) => ['done', 'merged', 'closed'].includes(status);

export function toDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDate(value, offset) {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(year, month - 1, day + offset);
  return toDateInput(next);
}

export function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
}

export function isOverdue(task, now = new Date()) {
  if (!task.due || isFinished(task.status)) return false;
  const today = toDateInput(now);
  if (task.day < today) return true;
  if (task.day > today) return false;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return task.due < currentTime;
}

export function taskNumber(task) {
  return `T-${String(task.n || 0).padStart(3, '0')}`;
}
