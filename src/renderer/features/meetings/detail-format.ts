import { chronoLabel } from '../../../shared/format';

const mediumDate = new Intl.DateTimeFormat('fr-CH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function meetingDateLabel(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? 'Date inconnue' : mediumDate.format(date);
}

/** The length in the meta line: « 45 s », « 52 min », « 1 h 02 ». */
export function durationLabel(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (total < 60) return `${Math.floor(total)} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Note timestamps drop the leading zero: « 4:12 », « 0:31 »; from one hour, « 1:02:03 ». */
export function shortTimeLabel(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (total >= 3600) return chronoLabel(total);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
