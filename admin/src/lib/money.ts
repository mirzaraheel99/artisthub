/** Money is stored as integer cents everywhere. Never floating point: a reward
 *  ladder that drifts by a cent per row stops reconciling against the till. */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

/** Parses a typed dollar amount into cents. Returns null when unparseable, so
 *  the caller can show a field error rather than silently storing zero. */
export function parseDollars(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** The spread between what a fan sees and what it costs you. This ratio is the
 *  whole economic argument for the programme, so it is shown wherever a reward
 *  is edited. */
export function valueRatio(menuCents: number, costCents: number): string {
  if (costCents <= 0) return '—';
  return `${(menuCents / costCents).toFixed(1)}×`;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** weekday_mask is a bitmask: Mon=1, Tue=2 … Sun=64. */
export function describeWeekdays(mask: number): string {
  const days = DAYS.filter((_, i) => (mask & (1 << i)) !== 0);
  if (days.length === 0) return 'No days';
  if (days.length === 7) return 'Every day';
  return days.join(', ');
}
