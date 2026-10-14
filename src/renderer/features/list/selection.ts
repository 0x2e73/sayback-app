import type { Meeting } from '../../../shared/contracts';

type Selectable = Pick<Meeting, 'id' | 'createdAt'>;

/** The chosen meeting while it exists, otherwise the most recent one. */
export function resolveSelection<T extends Selectable>(
  meetings: readonly T[],
  chosenId: string | null,
): T | undefined {
  const chosen = meetings.find((meeting) => meeting.id === chosenId);
  if (chosen) return chosen;
  return meetings.reduce<T | undefined>((latest, meeting) => {
    if (!latest || Date.parse(meeting.createdAt) > Date.parse(latest.createdAt)) return meeting;
    return latest;
  }, undefined);
}

/** Up and down in the visible order, stopping at both ends. */
export function adjacentId(
  ids: readonly string[],
  currentId: string | null,
  step: 1 | -1,
): string | null {
  const index = currentId === null ? -1 : ids.indexOf(currentId);
  if (index === -1) return ids[0] ?? null;
  const next = Math.min(Math.max(index + step, 0), ids.length - 1);
  return ids[next] ?? null;
}
