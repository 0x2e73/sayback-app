import { useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { NotesProvider } from '../../../shared/contracts';

interface ModelSelectProps {
  provider: NotesProvider;
  value: string;
  models: string[];
  onChange(value: string): void;
}

interface ModelOptionsProps {
  provider: NotesProvider;
  models: string[];
  filtered: string[];
  value: string;
  active: number;
  onChoose(model: string): void;
}

function ModelOptions({ provider, models, filtered, value, active, onChoose }: ModelOptionsProps) {
  let emptyMessage = 'Enregistrez votre clé pour charger les modèles.';
  if (provider === 'ollama') emptyMessage = 'Aucun modèle Ollama installé.';
  if (models.length) emptyMessage = 'Aucun modèle trouvé.';
  return (
    <div className="model-select-list" role="listbox" aria-label={`Modèles ${provider}`}>
      {filtered.map((model, index) => (
        <button
          key={model}
          type="button"
          role="option"
          aria-selected={model === value}
          className={index === active ? 'active' : ''}
          onClick={() => onChoose(model)}
        >
          <span>{model}</span>
          {model === value && <Check size={15} />}
        </button>
      ))}
      {!filtered.length && <p className="caption">{emptyMessage}</p>}
    </div>
  );
}

export function ModelSelect({ provider, value, models, onChange }: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const filtered = models.filter((model) => model.toLowerCase().includes(query.toLowerCase()));

  function choose(model: string) {
    onChange(model);
    setOpen(false);
    setQuery('');
    root.current?.querySelector('button')?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!root.current?.contains(event.relatedTarget)) setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      root.current?.querySelector('button')?.focus();
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    }
    if (event.key === 'Enter' && filtered[active]) {
      event.preventDefault();
      choose(filtered[active]);
    }
  }

  return (
    <div className="model-select" ref={root} onBlur={handleBlur}>
      <button
        type="button"
        className="model-select-trigger"
        aria-label={`Modèle pour les notes : ${value || 'aucun modèle choisi'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setActive(0);
          setOpen((current) => !current);
        }}
      >
        <span>{value || 'Choisir un modèle'}</span>
        <ChevronsUpDown size={16} />
      </button>
      {open && (
        <div className="model-select-popover">
          <input
            autoFocus
            type="search"
            aria-label="Rechercher un modèle"
            placeholder="Rechercher un modèle…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <ModelOptions
            provider={provider}
            models={models}
            filtered={filtered}
            value={value}
            active={active}
            onChoose={choose}
          />
        </div>
      )}
    </div>
  );
}
