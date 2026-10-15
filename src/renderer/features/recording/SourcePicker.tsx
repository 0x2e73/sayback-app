import { useState } from 'react';
import type { CaptureSource } from '../../../shared/contracts';
import { SearchField } from '../../components/ui';
import { SourceOption } from './SourceOption';

/** From this many windows on, a search field helps. */
const SEARCH_FROM = 8;

interface SourcePickerProps {
  sources: CaptureSource[];
  selectedId: string;
  onSelect(id: string): void;
  onConfirm?(): void;
}

const isScreen = (source: CaptureSource) => source.id.startsWith('screen:');

function matches(source: CaptureSource, query: string): boolean {
  return source.name.toLowerCase().includes(query.trim().toLowerCase());
}

function Screens({ sources, selectedId, onSelect, onConfirm }: SourcePickerProps) {
  if (!sources.length) return null;
  return (
    <fieldset className="source-group">
      <legend>Écrans</legend>
      <div className="source-tiles">
        {sources.map((source) => (
          <SourceOption
            key={source.id}
            source={source}
            layout="tile"
            selected={source.id === selectedId}
            onSelect={onSelect}
            onConfirm={onConfirm}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Windows({ sources, selectedId, onSelect, onConfirm }: SourcePickerProps) {
  const [query, setQuery] = useState('');
  if (!sources.length) return null;
  const shown = sources.filter((source) => matches(source, query));
  return (
    <fieldset className="source-group">
      <legend>Fenêtres</legend>
      {sources.length >= SEARCH_FROM && (
        <SearchField label="Rechercher une fenêtre" query={query} onQuery={setQuery} />
      )}
      <div className="source-rows">
        {shown.map((source) => (
          <SourceOption
            key={source.id}
            source={source}
            layout="row"
            selected={source.id === selectedId}
            onSelect={onSelect}
            onConfirm={onConfirm}
          />
        ))}
        {!shown.length && <p className="caption">Aucune fenêtre pour « {query.trim()} ».</p>}
      </div>
    </fieldset>
  );
}

/** Screens as tiles, windows as rows: one radio group, so the arrows cross from one to the other. */
export function SourcePicker(props: SourcePickerProps) {
  return (
    <div className="source-picker">
      <Screens {...props} sources={props.sources.filter(isScreen)} />
      <Windows {...props} sources={props.sources.filter((source) => !isScreen(source))} />
    </div>
  );
}
