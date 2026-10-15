import { useId, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { keyOutcome, visibleOptions, type SelectOption } from './select-options';
import { useSelectState } from './use-select-state';
import { SelectPopover, SelectTrigger } from './SelectPopover';

export type { SelectOption };

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

export function Select(props: SelectProps) {
  const { value, options, labelledBy, placeholder, searchLabel } = props;
  const { open, setOpen, query, active, setActive, upward, show, search } = useSelectState();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const searchable = searchLabel !== undefined;
  const shown = visibleOptions(options, query, searchable, props.allowCustom === true);
  const chosen = options.find((option) => option.value === value);
  const at = Math.min(active, Math.max(shown.length - 1, 0));

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(option: SelectOption) {
    props.onChange(option.value);
    close();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    // A key that composes text (IME) belongs to the composition, not to the list.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const outcome = keyOutcome(event.key, at, shown.length, searchable);
    const picked = shown[at];
    if (outcome === null) return;
    if (outcome.kind === 'tab') return setOpen(false);
    if (outcome.kind === 'move') setActive(outcome.to);
    if (outcome.kind === 'choose' && picked) choose(picked);
    if (outcome.kind === 'close') {
      // The dialog around the control must not see the key that only folds the list.
      event.stopPropagation();
      close();
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
        onToggle={() => (open ? setOpen(false) : show(options, value, trigger.current))}
        onOpen={() => show(options, value, trigger.current)}
      />
      {open && (
        <SelectPopover
          listId={listId}
          labelledBy={labelledBy}
          value={value}
          shown={shown}
          active={at}
          upward={upward}
          query={query}
          searchLabel={searchLabel}
          emptyMessage={props.emptyMessage}
          onQuery={search}
          onKeyDown={handleKeyDown}
          onChoose={choose}
        />
      )}
    </div>
  );
}
