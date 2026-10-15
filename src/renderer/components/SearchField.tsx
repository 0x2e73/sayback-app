import { useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { useFindShortcut } from './find-shortcut';

interface SearchFieldProps {
  query: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** Slimmer field for a narrow header. */
  compact?: boolean;
  /**
   * Takes Cmd+F (Ctrl+F elsewhere): one field per screen should ask for it. `'first'` claims
   * it before the other fields, for a search that only exists while it is shown.
   */
  findShortcut?: boolean | 'first';
  onQuery(query: string): void;
  onFocus?(event: FocusEvent<HTMLInputElement>): void;
  /** Runs after the field's own handling of Enter. */
  onKeyDown?(event: KeyboardEvent<HTMLInputElement>): void;
}

export function SearchField(props: SearchFieldProps) {
  const {
    query,
    label,
    placeholder = 'Rechercher…',
    disabled = false,
    compact = false,
    findShortcut = false,
  } = props;
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field, undefined, {
    enabled: findShortcut !== false,
    first: findShortcut === 'first',
  });
  return (
    <label className={`search${compact ? ' search-compact' : ''}`}>
      <Search size={14} aria-hidden="true" />
      <input
        ref={field}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onFocus={props.onFocus}
        onChange={(event) => props.onQuery(event.target.value)}
        onKeyDown={(event) => {
          // Enter has nothing left to search: it must not submit the form around the field.
          if (event.key === 'Enter') event.preventDefault();
          props.onKeyDown?.(event);
        }}
      />
    </label>
  );
}
