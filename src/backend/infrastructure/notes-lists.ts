import type { NoteItem } from '../../shared/contracts';

// Contract maxima of `notesSchema` (src/shared/validation.ts): 30 items per list, 20 ids per item.
export const MAX_LIST_ITEMS = 30;
export const MAX_ITEM_SOURCES = 20;

function sameItem(text: string): string {
  const key = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return key || text;
}

/**
 * Decisions and actions are never rewritten by the model after the map step: the items of every
 * slice, in chronological order, one item per distinct text (case, spacing and punctuation aside),
 * with the union of their ids.
 */
export function concatenateItems(
  lists: NoteItem[][],
  onCut: (dropped: number) => void = () => undefined,
): NoteItem[] {
  const byText = new Map<string, NoteItem>();
  for (const item of lists.flat()) {
    const key = sameItem(item.text);
    const known = byText.get(key);
    if (!known) {
      byText.set(key, { text: item.text, sourceIds: [...new Set(item.sourceIds)] });
      continue;
    }
    known.sourceIds = [...new Set([...known.sourceIds, ...item.sourceIds])];
  }
  if (byText.size > MAX_LIST_ITEMS) onCut(byText.size - MAX_LIST_ITEMS);
  return [...byText.values()]
    .slice(0, MAX_LIST_ITEMS)
    .map((item) => ({ ...item, sourceIds: item.sourceIds.slice(0, MAX_ITEM_SOURCES) }));
}
