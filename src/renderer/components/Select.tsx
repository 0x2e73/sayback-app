import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type Ref } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onChange(value: string): void;
  /** Id of the visible label; the chosen value is read after it. */
  labelledBy: string;
  placeholder: string;
  /** Shown instead of the list when nothing matches. */
  emptyMessage: string;
  id?: string;
  disabled?: boolean;
  /** Adds a search field above the list; its text is the field's accessible name. */
  searchLabel?: string;
  /** Lets a search that matches nothing be used as the value. */
  allowCustom?: boolean;
}

/** The key's effect on the highlighted option, or null when it is not a navigation key. */
function movedTo(key: string, active: number, last: number, searchable: boolean): number | null {
  if (key === 'ArrowDown') return Math.min(active + 1, last);
  if (key === 'ArrowUp') return Math.max(active - 1, 0);
  if (searchable) return null;
  if (key === 'Home') return 0;
  return key === 'End' ? last : null;
}

function customOption(query: string, options: readonly SelectOption[]): SelectOption[] {
  const text = query.trim();
  if (!text || options.some((option) => option.value === text)) return [];
  return [{ value: text, label: `Utiliser « ${text} »` }];
}

function matching(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = query.trim().toLowerCase();
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

function visibleOptions(
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

function selectedIndex(options: readonly SelectOption[], value: string): number {
  return Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
}

function focusElement(element: HTMLElement | null): void {
  element?.focus();
}

function scrollIntoView(element: HTMLElement | null): void {
  element?.scrollIntoView?.({ block: 'nearest' });
}

interface PopoverProps {
  listId: string;
  labelledBy: string;
  value: string;
  shown: readonly SelectOption[];
  active: number;
  query: string;
  searchLabel: string | undefined;
  emptyMessage: string;
  onQuery(query: string): void;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
  onChoose(option: SelectOption): void;
}

function SelectPopover(props: PopoverProps) {
  const { listId, value, shown, active, searchLabel } = props;
  const activeId = shown[active] ? `${listId}-${active}` : undefined;
  return (
    <div className="select-popover">
      {searchLabel !== undefined && (
        <input
          autoFocus
          type="search"
          className="select-search"
          aria-label={searchLabel}
          aria-controls={listId}
          aria-activedescendant={activeId}
          placeholder="Rechercher…"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          onKeyDown={props.onKeyDown}
        />
      )}
      {/* The list itself takes the focus when there is no search field. */}
      <div
        id={listId}
        className="select-list"
        role="listbox"
        tabIndex={-1}
        ref={searchLabel === undefined ? focusElement : null}
        aria-labelledby={props.labelledBy}
        aria-activedescendant={activeId}
        onKeyDown={props.onKeyDown}
      >
        {shown.map((option, index) => (
          <button
            key={option.value}
            id={`${listId}-${index}`}
            ref={index === active ? scrollIntoView : null}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={option.value === value}
            className="select-option"
            data-active={index === active ? '' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onChoose(option)}
          >
            <span>{option.label}</span>
            {option.value === value && <Check size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
      {!shown.length && <p className="select-empty caption">{props.emptyMessage}</p>}
    </div>
  );
}

interface TriggerProps {
  id: string | undefined;
  disabled: boolean | undefined;
  open: boolean;
  listId: string;
  labelledBy: string;
  text: string;
  /** The text stands in for a missing choice. */
  placeholder: boolean;
  ref: Ref<HTMLButtonElement>;
  onToggle(): void;
  onOpen(): void;
}

function SelectTrigger(props: TriggerProps) {
  const valueId = useId();
  return (
    <button
      ref={props.ref}
      id={props.id}
      type="button"
      className="select-trigger"
      disabled={props.disabled}
      aria-haspopup="listbox"
      aria-expanded={props.open}
      aria-controls={props.open ? props.listId : undefined}
      aria-labelledby={`${props.labelledBy} ${valueId}`}
      onClick={props.onToggle}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' || props.open) return;
        event.preventDefault();
        props.onOpen();
      }}
    >
      <span id={valueId} className="select-value" data-empty={props.placeholder ? '' : undefined}>
        {props.text}
      </span>
      <ChevronsUpDown size={16} aria-hidden="true" />
    </button>
  );
}

export function Select(props: SelectProps) {
  const { value, options, labelledBy, placeholder, searchLabel } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const searchable = searchLabel !== undefined;
  const shown = visibleOptions(options, query, searchable, props.allowCustom === true);
  const chosen = options.find((option) => option.value === value);

  function show() {
    setQuery('');
    setActive(selectedIndex(options, value));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(option: SelectOption) {
    props.onChange(option.value);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const moved = movedTo(event.key, active, Math.max(shown.length - 1, 0), searchable);
    const picked = shown[active];
    if (moved !== null) setActive(moved);
    else if (event.key === 'Escape') close();
    else if (picked && (event.key === 'Enter' || (event.key === ' ' && !searchable))) {
      choose(picked);
    } else {
      // Tab leaves the control and closes the list; any other key is not ours.
      if (event.key === 'Tab') setOpen(false);
      return;
    }
    event.preventDefault();
  }

  return (
    <div
      className="select"
      ref={root}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!root.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <SelectTrigger
        ref={trigger}
        id={props.id}
        disabled={props.disabled}
        open={open}
        listId={listId}
        labelledBy={labelledBy}
        text={chosen?.label ?? (value || placeholder)}
        placeholder={chosen === undefined}
        onToggle={() => (open ? setOpen(false) : show())}
        onOpen={show}
      />
      {open && (
        <SelectPopover
          listId={listId}
          labelledBy={labelledBy}
          value={value}
          shown={shown}
          active={active}
          query={query}
          searchLabel={searchLabel}
          emptyMessage={props.emptyMessage}
          onQuery={(text) => {
            setQuery(text);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          onChoose={choose}
        />
      )}
    </div>
  );
}
