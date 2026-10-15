import { useRef } from 'react';
import { Search } from 'lucide-react';
import { useFindShortcut } from './find-shortcut';

interface SearchFieldProps {
  query: string;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** Slimmer field for a narrow header. */
  compact?: boolean;
  /** Takes Cmd+F (Ctrl+F elsewhere): one field per screen should ask for it. */
  findShortcut?: boolean;
  onQuery(query: string): void;
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
  useFindShortcut(field, undefined, findShortcut);
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
        onChange={(event) => props.onQuery(event.target.value)}
      />
    </label>
  );
}
