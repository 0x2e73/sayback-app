import { useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, SearchField } from '../../components/ui';
import type { FoundMatches } from './use-transcript-search';

interface TranscriptSearchBarProps {
  found: FoundMatches;
}

function giveFocusBack(previous: HTMLElement | null, field: HTMLInputElement): void {
  if (previous?.isConnected) previous.focus();
  else field.blur();
}

export function TranscriptSearchBar({ found }: TranscriptSearchBarProps) {
  const before = useRef<HTMLElement | null>(null);
  const empty = found.result.matches.length === 0;

  function rememberFocus(event: FocusEvent<HTMLInputElement>): void {
    before.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      found.step(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    found.setQuery('');
    giveFocusBack(before.current, event.currentTarget);
  }

  return (
    <div className="transcript-search">
      {/* Shown, the transcript takes Cmd+F before the list pane (find-shortcut.ts). */}
      <SearchField
        query={found.query}
        label="Chercher dans la transcription"
        placeholder="Chercher dans la transcription…"
        findShortcut="first"
        onQuery={found.setQuery}
        onFocus={rememberFocus}
        onKeyDown={onKeyDown}
      />
      <span className="transcript-search-count" aria-live="polite">
        {found.label}
      </span>
      <Button
        variant="ghost"
        shape="round"
        aria-label="Résultat précédent"
        title="Résultat précédent"
        disabled={empty}
        onClick={() => found.step(-1)}
      >
        <ChevronUp size={16} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        shape="round"
        aria-label="Résultat suivant"
        title="Résultat suivant"
        disabled={empty}
        onClick={() => found.step(1)}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
