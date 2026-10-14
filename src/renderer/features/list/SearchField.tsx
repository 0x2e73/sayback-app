import { useRef } from 'react';
import { Search } from 'lucide-react';
import { useFindShortcut } from './find-shortcut';

interface SearchFieldProps {
  query: string;
  disabled: boolean;
  onQuery(query: string): void;
}

export function SearchField({ query, disabled, onQuery }: SearchFieldProps) {
  const field = useRef<HTMLInputElement>(null);
  useFindShortcut(field);
  return (
    <label className="search list-search">
      <Search size={14} aria-hidden="true" />
      <input
        ref={field}
        type="search"
        aria-label="Rechercher une réunion"
        placeholder="Rechercher…"
        value={query}
        disabled={disabled}
        onChange={(event) => onQuery(event.target.value)}
      />
    </label>
  );
}
