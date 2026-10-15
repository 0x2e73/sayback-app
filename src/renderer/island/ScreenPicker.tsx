import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, ChevronLeft, Monitor } from 'lucide-react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandScreen } from '../../shared/island';
import { Button } from '../components/ui';
import { useScreenThumbnails, type Thumbnail } from './use-screen-thumbnails';

/** From six screens the row scrolls, faded on its right edge. */
const SCROLLING_FROM = 6;

interface ScreenPickerProps {
  api: Pick<IslandApi, 'screenThumbnails'>;
  screens: readonly IslandScreen[];
  checked: string | null;
  disabled: boolean;
  /** Ready: the checked tile takes the focus and the arrows move it. Recording: mouse only. */
  keyboard: boolean;
  /** `instantly`: Enter or Space rather than a click. */
  onPick(screenId: string, instantly: boolean): void;
  onBack(instantly: boolean): void;
}

/** A click the keyboard fired (Enter, Space) has no mouse press behind it. */
export const fromKeyboard = (event: MouseEvent) => event.detail === 0;

interface ThumbProps {
  thumbnail: Thumbnail;
}

function TileThumb({ thumbnail }: ThumbProps) {
  const [broken, setBroken] = useState(false);
  if (thumbnail.state === 'loading') return <span className="island-tile-thumb skeleton" />;
  if (thumbnail.state === 'missing' || broken) {
    return (
      <span className="island-tile-thumb">
        <Monitor size={20} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="island-tile-thumb">
      <img src={thumbnail.url} alt="" onError={() => setBroken(true)} />
    </span>
  );
}

interface TileProps {
  screen: IslandScreen;
  checked: boolean;
  /** The one tile reached by Tab: the checked one, or the first. */
  tabbable: boolean;
  disabled: boolean;
  thumbnail: Thumbnail;
  onPick(screenId: string, instantly: boolean): void;
}

function ScreenTile({ screen, checked, tabbable, disabled, thumbnail, onPick }: TileProps) {
  return (
    <button
      type="button"
      role="radio"
      className="island-tile"
      aria-checked={checked}
      tabIndex={tabbable ? 0 : -1}
      disabled={disabled}
      data-checked={checked || undefined}
      onClick={(event) => onPick(screen.id, fromKeyboard(event))}
    >
      <span className="island-tile-body">
        <TileThumb thumbnail={thumbnail} />
        {checked && (
          <span className="island-tile-check" aria-hidden="true">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
        <span className="island-tile-name">{screen.name}</span>
      </span>
    </button>
  );
}

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

// The arrows move the focus only: Enter or Space picks, as a click does.
function moveFocus(event: KeyboardEvent<HTMLDivElement>): void {
  const step = STEPS[event.key];
  if (!step) return;
  event.preventDefault();
  const tiles = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const index = tiles.findIndex((tile) => tile === event.target);
  tiles[Math.min(tiles.length - 1, Math.max(0, index + step))]?.focus();
}

/** The screens as tiles, the one in use checked; the same picker in both modes. */
export function ScreenPicker(props: ScreenPickerProps) {
  const { screens, checked, keyboard } = props;
  const thumbnail = useScreenThumbnails(props.api);
  const row = useRef<HTMLDivElement>(null);
  const tabbable = screens.some((screen) => screen.id === checked) ? checked : screens[0]?.id;

  // The tile in use is brought into view, and takes the focus when the keyboard is there.
  useEffect(() => {
    const tile = row.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    tile?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (keyboard) tile?.focus();
    // Mounted at each opening: a pick moves the check, never the focus or the scroll.
  }, [keyboard]);

  return (
    <div className="island-picker" data-picker="">
      <Button
        variant="ghost"
        shape="round"
        className="island-picker-back"
        aria-label="Retour"
        onClick={(event) => props.onBack(fromKeyboard(event))}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Button>
      <div
        ref={row}
        className="island-tiles"
        role="radiogroup"
        aria-label="Écran à enregistrer"
        data-scrolling={screens.length >= SCROLLING_FROM || undefined}
        onKeyDown={moveFocus}
      >
        {screens.map((screen) => (
          <ScreenTile
            key={screen.id}
            screen={screen}
            checked={screen.id === checked}
            tabbable={screen.id === tabbable}
            disabled={props.disabled}
            thumbnail={thumbnail(screen.id)}
            onPick={props.onPick}
          />
        ))}
      </div>
    </div>
  );
}
