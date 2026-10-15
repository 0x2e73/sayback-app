import type { MouseEvent } from 'react';
import { AppWindow, Check, Monitor } from 'lucide-react';
import type { CaptureSource } from '../../../shared/contracts';

interface SourceOptionProps {
  source: CaptureSource;
  /** A tile for a screen, a slim row for a window. */
  layout: 'tile' | 'row';
  selected: boolean;
  onSelect(id: string): void;
  /** Click, Enter or Space: the choice is final. Moving with the arrows only selects. */
  onConfirm?(): void;
}

export function SourceThumb({ source, layout }: Pick<SourceOptionProps, 'source' | 'layout'>) {
  const Placeholder = layout === 'tile' ? Monitor : AppWindow;
  return (
    <span className="source-thumb" aria-hidden="true">
      {source.thumbnail ? <img src={source.thumbnail} alt="" /> : <Placeholder size={20} />}
    </span>
  );
}

export function SourceOption({ source, layout, selected, onSelect, onConfirm }: SourceOptionProps) {
  // The click an arrow key synthesises targets the input and has no detail: not a confirmation.
  // A click elsewhere in the label selects here, as folding the list would drop the input
  // before the browser passes the click on to it.
  function handleClick(event: MouseEvent<HTMLLabelElement>): void {
    if (event.target instanceof HTMLInputElement) {
      if (event.detail > 0) onConfirm?.();
      return;
    }
    onSelect(source.id);
    onConfirm?.();
  }

  return (
    <label className="source-option" data-layout={layout} onClick={handleClick}>
      <input
        type="radio"
        name="capture-source"
        className="source-input"
        value={source.id}
        checked={selected}
        onChange={() => onSelect(source.id)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          // Enter would submit the form around the picker.
          event.preventDefault();
          onSelect(source.id);
          onConfirm?.();
        }}
      />
      <SourceThumb source={source} layout={layout} />
      <span className="source-name" title={source.name}>
        {source.name}
      </span>
      <Check size={16} className="source-check" aria-hidden="true" />
    </label>
  );
}
