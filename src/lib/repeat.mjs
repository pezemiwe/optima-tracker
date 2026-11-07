/* The repeat choices offered in the UI, mapped to the server's { freq, interval } shape. */
export const REPEAT_OPTIONS = [
  { key: 'none', label: 'Does not repeat', value: null },
  { key: 'daily', label: 'Every day', value: { freq: 'daily', interval: 1 } },
  { key: 'weekdays', label: 'Every weekday', value: { freq: 'weekdays', interval: 1 } },
  { key: 'weekly', label: 'Every week', value: { freq: 'weekly', interval: 1 } },
  { key: 'biweekly', label: 'Every 2 weeks', value: { freq: 'weekly', interval: 2 } },
  { key: 'monthly', label: 'Every month', value: { freq: 'monthly', interval: 1 } },
];

export function repeatKey(rec) {
  if (!rec) return 'none';
  const hit = REPEAT_OPTIONS.find((o) => o.value && o.value.freq === rec.freq && o.value.interval === (rec.interval || 1));
  return hit ? hit.key : `custom:${rec.freq}:${rec.interval}`;
}
