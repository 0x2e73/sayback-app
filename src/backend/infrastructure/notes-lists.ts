import type { NoteItem } from '../../shared/contracts';

// Contract maxima of `notesSchema` (src/shared/validation.ts): 30 items per list, 20 ids per item.
export const MAX_LIST_ITEMS = 30;
export const MAX_ITEM_SOURCES = 20;

// qwen3.5:4b sometimes states the absence of a decision or an action as an item of its own. Only an
// item that says that and nothing else is dropped: the whole text must match, so « Pas de décision
// avant le comité du 12 juin » (a deferral) or « Aucun actionnaire ne sera dilué » stay.
const APOSTROPHE = "[’']";
const ABSENCE_FILLERS = [
  'formelles?',
  'explicites?',
  'concrètes?',
  'claires?',
  'particulières?',
  'précises?',
  'prises?',
  'retenues?',
  'identifiées?',
  'assignées?',
  'mentionnées?',
  `n${APOSTROPHE}a été (?:prise|actée|décidée|assignée|retenue|identifiée)`,
  `n${APOSTROPHE}ont été (?:prises|actées|décidées|assignées|retenues|identifiées)`,
  `n${APOSTROPHE}est ressortie`,
  'à (?:retenir|signaler|noter)',
  'pour cette partie',
  'dans cet extrait',
  'lors de cet échange',
];
const ABSENCE = new RegExp(
  [
    `^(?:il n${APOSTROPHE}y a\\s+)?`,
    `(?:aucune?|pas\\s+de|pas\\s+d${APOSTROPHE})\\s*`,
    '(?:nouvelles?\\s+)?',
    '(?:décisions?|actions?|tâches?)(?![\\p{L}\\p{N}])',
    `(?:\\s+(?:${ABSENCE_FILLERS.join('|')}))*`,
    '\\s*[.!…]*\\s*$',
  ].join(''),
  'iu',
);

export function statesAbsence(text: string): boolean {
  return ABSENCE.test(text.trim());
}

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
  for (const item of lists.flat().filter((candidate) => !statesAbsence(candidate.text))) {
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
