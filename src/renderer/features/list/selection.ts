import type { Meeting } from '../../../shared/contracts';
import { sortNewestFirst } from './date-groups';

type Selectable = Pick<Meeting, 'id' | 'createdAt'>;

/** The chosen meeting while it is listed, otherwise the most recent one of the list. */
export function resolveSelection<T extends Selectable>(
  visible: readonly T[],
  chosenId: string | null,
): T | undefined {
  const chosen = visible.find((meeting) => meeting.id === chosenId);
  return chosen ?? sortNewestFirst(visible)[0];
}

/** Up and down in the visible order, stopping at both ends. Off the list: the near end. */
export function adjacentId(
  ids: readonly string[],
  currentId: string | null,
  step: 1 | -1,
): string | null {
  const index = currentId === null ? -1 : ids.indexOf(currentId);
  if (index === -1) return (step === 1 ? ids[0] : ids.at(-1)) ?? null;
  const next = Math.min(Math.max(index + step, 0), ids.length - 1);
  return ids[next] ?? null;
}

/** The row to select once `removedId` is gone: the next one, otherwise the previous one. */
export function neighbourAfter(ids: readonly string[], removedId: string): string | null {
  const index = ids.indexOf(removedId);
  if (index === -1) return null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}

/** The row a key leads to; null when the list has no use for that key. */
export function targetForKey(
  key: string,
  ids: readonly string[],
  selectedId: string | null,
  focusedId: string | null,
): string | null {
  if (key === 'ArrowDown') return adjacentId(ids, selectedId, 1);
  if (key === 'ArrowUp') return adjacentId(ids, selectedId, -1);
  if (key === 'Home') return ids[0] ?? null;
  if (key === 'End') return ids.at(-1) ?? null;
  const activates = key === 'Enter' || key === ' ';
  return activates && focusedId !== null && ids.includes(focusedId) ? focusedId : null;
}
