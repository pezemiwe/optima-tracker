export function describeRecurrence(rec) {
  if (!rec) return 'does not repeat';
  const n = rec.interval || 1;
  if (rec.freq === 'weekdays') return 'every weekday';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[rec.freq];
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}
