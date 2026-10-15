import type { Ref } from 'react';
import type { IslandReadyState, IslandScreen } from '../../shared/island';
import { SourceChips } from '../features/recording/SourceChips';
import { ReadyScreenLine } from './ReadyScreenLine';
import type { ReadyStart } from './use-ready-start';

interface ReadySourcesProps {
  ready: IslandReadyState;
  /** The screen checked last in the picker, or main's. */
  screen: IslandScreen | null;
  start: ReadyStart;
  /** « Changer d'écran »: opens the picker in their place. */
  onChange(instantly: boolean): void;
  changeRef: Ref<HTMLButtonElement>;
}

/** The chips and the screen line: what the picker replaces. */
export function ReadySources({ ready, screen, start, onChange, changeRef }: ReadySourcesProps) {
  return (
    <div className="island-ready-sources">
      <SourceChips
        selection={start.selection}
        microphoneBlocked={false}
        disabled={start.busy}
        legendHidden
        onToggle={start.toggle}
      />
      <ReadyScreenLine
        screen={screen}
        screenCount={ready.screens.length}
        screenOn={start.selection.screen}
        error={start.error}
        busy={start.busy}
        onRequest={start.request}
        onChange={onChange}
        changeRef={changeRef}
      />
    </div>
  );
}
