import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Id of the tabpanel this tab shows. */
  panelId: string;
}

export interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface SharedProps<T extends string> {
  label: string;
  value: T;
  onChange(value: T): void;
}

interface TabsProps<T extends string> extends SharedProps<T> {
  kind?: 'tabs';
  options: readonly SegmentedOption<T>[];
}

interface RadiosProps<T extends string> extends SharedProps<T> {
  kind: 'radios';
  options: readonly RadioOption<T>[];
}

type SegmentedProps<T extends string> = TabsProps<T> | RadiosProps<T>;

export const tabId = (panelId: string) => `${panelId}-tab`;

// The radio pattern also moves with ↓ and ↑; tabs keep ← and → only.
function targetIndex(key: string, index: number, count: number, vertical: boolean): number | null {
  if (key === 'ArrowRight' || (vertical && key === 'ArrowDown')) return (index + 1) % count;
  if (key === 'ArrowLeft' || (vertical && key === 'ArrowUp')) return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

function semantics(option: SegmentedOption<string> | RadioOption<string>, selected: boolean) {
  if (!('panelId' in option)) return { role: 'radio', 'aria-checked': selected } as const;
  return {
    role: 'tab',
    id: tabId(option.panelId),
    'aria-selected': selected,
    'aria-controls': option.panelId,
  } as const;
}

/** The thumb is placed by hand: a state would render the whole group on every resize. */
function useThumb(value: string) {
  const group = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = group.current;
    const mark = thumb.current;
    if (!box || !mark) return;
    function place(): void {
      const active = box?.querySelector<HTMLElement>('.segmented-tab[tabindex="0"]');
      if (!active || !mark) return;
      mark.style.width = `${active.offsetWidth}px`;
      mark.style.transform = `translateX(${active.offsetLeft}px)`;
    }
    place();
    // Flush the first position before the transition is switched on: no slide from the corner.
    void mark.offsetWidth;
    mark.dataset.ready = '';
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(box);
    return () => observer.disconnect();
  }, [value]);
  return { group, thumb };
}

/**
 * Tabs, or a radio group, with automatic activation: the arrows move the focus and the
 * selection together.
 */
export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const { label, options, value, onChange } = props;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const { group, thumb } = useThumb(value);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const next = targetIndex(event.key, index, options.length, props.kind === 'radios');
    if (next === null) return;
    const option = options[next];
    if (!option) return;
    event.preventDefault();
    onChange(option.value);
    tabs.current[next]?.focus();
  }

  return (
    <div
      ref={group}
      className="segmented"
      role={props.kind === 'radios' ? 'radiogroup' : 'tablist'}
      aria-label={label}
    >
      <span ref={thumb} className="segmented-thumb" aria-hidden="true" />
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            className="segmented-tab"
            {...semantics(option, selected)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
