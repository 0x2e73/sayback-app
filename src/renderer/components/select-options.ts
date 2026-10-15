export interface SelectOption {
  value: string;
  label: string;
}

/** The key's effect on the highlighted option, or null when it is not a navigation key. */
export function movedTo(
  key: string,
  active: number,
  last: number,
  searchable: boolean,
): number | null {
  if (key === 'ArrowDown') return Math.min(active + 1, last);
  if (key === 'ArrowUp') return Math.max(active - 1, 0);
  if (searchable) return null;
  if (key === 'Home') return 0;
  return key === 'End' ? last : null;
}

export function customOption(query: string, options: readonly SelectOption[]): SelectOption[] {
  const text = query.trim();
  if (!text || options.some((option) => option.value === text)) return [];
  return [{ value: text, label: `Utiliser « ${text} »` }];
}

export function matching(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = query.trim().toLowerCase();
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

export function visibleOptions(
  options: readonly SelectOption[],
  query: string,
  searchable: boolean,
  allowCustom: boolean,
): SelectOption[] {
  return [
    ...matching(options, searchable ? query : ''),
    ...(allowCustom ? customOption(query, options) : []),
  ];
}

export function selectedIndex(options: readonly SelectOption[], value: string): number {
  return Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
}

/** Room the popover needs below the trigger before it opens upward instead. */
const POPOVER_SPACE = 288;

export function opensUpward(trigger: HTMLElement | null): boolean {
  if (!trigger) return false;
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  return below < POPOVER_SPACE && rect.top > below;
}

export type KeyOutcome =
  { kind: 'move'; to: number } | { kind: 'close' | 'choose' | 'swallow' | 'tab' } | null;

/** What a key does to an open list; null when it is not the list's. */
export function keyOutcome(
  key: string,
  active: number,
  count: number,
  searchable: boolean,
): KeyOutcome {
  const to = movedTo(key, active, Math.max(count - 1, 0), searchable);
  if (to !== null) return { kind: 'move', to };
  if (key === 'Escape') return { kind: 'close' };
  if (key === 'Tab') return { kind: 'tab' };
  const confirms = key === 'Enter' || (key === ' ' && !searchable);
  if (confirms && count > 0) return { kind: 'choose' };
  // Enter in the search field must never submit the form around it.
  return key === 'Enter' ? { kind: 'swallow' } : null;
}
