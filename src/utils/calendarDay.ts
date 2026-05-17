/** Calendar day in UTC (YYYY-MM-DD), stable for timeline and filters. */
export function utcCalendarDay(iso: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Noon UTC for a calendar day — safe anchor for sliders and labels. */
export function utcNoonDate(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00.000Z`);
}
