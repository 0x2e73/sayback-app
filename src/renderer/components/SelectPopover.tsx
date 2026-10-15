import { useEffect, useId, type KeyboardEvent, type Ref } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { SelectOption } from './select-options';

function focusElement(element: HTMLElement | null): void {
  element?.focus();
}

interface PopoverProps {
  listId: string;
  labelledBy: string;
  value: string;
  shown: readonly SelectOption[];
  active: number;
  upward: boolean;
  query: string;
  searchLabel: string | undefined;
  emptyMessage: string;
  onQuery(query: string): void;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
  onChoose(option: SelectOption): void;
}

export function SelectPopover(props: PopoverProps) {
  const { listId, value, shown, active, searchLabel } = props;
  const activeId = shown[active] ? `${listId}-${active}` : undefined;
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [listId, active]);
  return (
    <div className="select-popover" data-upward={props.upward ? '' : undefined}>
      {searchLabel !== undefined && (
        <input
          autoFocus
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
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

export function SelectTrigger(props: TriggerProps) {
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
