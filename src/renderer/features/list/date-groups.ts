import type { Meeting } from '../../../shared/contracts';

export interface DateGroup<T> {
  key: string;
  label: string;
  items: T[];
}

type Dated = Pick<Meeting, 'createdAt'>;
type Heading = Omit<DateGroup<never>, 'items'>;

const timeFormat = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short' });
const fullDayFormat = new Intl.DateTimeFormat('fr-CH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const monthFormat = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric' });

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Calendar arithmetic, not milliseconds: the day the clocks change lasts 23 or 25 hours.
function daysBefore(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
}

// fr-CH weeks start on Monday; getDay() counts from Sunday.
function startOfWeek(day: Date): Date {
  return daysBefore(day, (day.getDay() + 6) % 7);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr-CH') + text.slice(1);
}

const UNKNOWN: Heading = { key: 'unknown', label: 'Date inconnue' };

function isReadable(createdAt: string): boolean {
  return !Number.isNaN(Date.parse(createdAt));
}

function heading(createdAt: string, now: Date): Heading {
  if (!isReadable(createdAt)) return UNKNOWN;
  const date = new Date(createdAt);
  const today = startOfDay(now);
  if (date >= today) return { key: 'today', label: 'Aujourd’hui' };
  if (date >= daysBefore(today, 1)) return { key: 'yesterday', label: 'Hier' };
  if (date >= startOfWeek(today)) return { key: 'week', label: 'Cette semaine' };
  if (date >= new Date(now.getFullYear(), now.getMonth(), 1)) {
    return { key: 'month', label: 'Ce mois-ci' };
  }
  return { key: monthKey(date), label: capitalise(monthFormat.format(date)) };
}

/** Newest first; the unreadable dates come last. */
export function sortNewestFirst<T extends Dated>(items: readonly T[]): T[] {
  const time = (item: T) => (isReadable(item.createdAt) ? Date.parse(item.createdAt) : -Infinity);
  return [...items].sort((a, b) => {
    if (time(a) === time(b)) return 0;
    return time(b) > time(a) ? 1 : -1;
  });
}

/** Newest first. A date ahead of the clock counts as today. */
export function groupByDate<T extends Dated>(items: readonly T[], now: Date): DateGroup<T>[] {
  const sorted = sortNewestFirst(items);
  const groups: DateGroup<T>[] = [];
  for (const item of sorted) {
    const { key, label } = heading(item.createdAt, now);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label, items: [item] });
  }
  return groups;
}

/** Never a bare time for a day that has not come yet. */
export function formatRowDate(createdAt: string, now: Date): string {
  if (!isReadable(createdAt)) return '—';
  const date = new Date(createdAt);
  const today = startOfDay(now);
  if (date >= daysBefore(today, -1)) return fullDayFormat.format(date);
  if (date >= today) return timeFormat.format(date);
  if (date >= daysBefore(today, 1)) return 'Hier';
  if (date.getFullYear() === now.getFullYear()) return dayFormat.format(date);
  return fullDayFormat.format(date);
}
