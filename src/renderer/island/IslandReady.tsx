import type { TransitionEvent } from 'react';
import { X } from 'lucide-react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandReadyState, IslandRequest } from '../../shared/island';
import { Button } from '../components/ui';
import { PickerSwap } from './PickerSwap';
import { ReadySources } from './ReadySources';
import { ScreenPicker } from './ScreenPicker';
import { usePickedScreen, useReadyPicker } from './use-ready-picker';
import { useReadyStart } from './use-ready-start';

interface IslandReadyProps {
  api: IslandApi;
  ready: IslandReadyState;
  expanded: boolean;
  /** The recording runs: this content fades out over the recording one, then goes. */
  leaving: boolean;
  onLeft(): void;
  onRequest(request: IslandRequest): void;
}

// Laid out at its final size like the recording content, revealed by the growing shell.
export function IslandReady({
  api,
  ready,
  expanded,
  leaving,
  onLeft,
  onRequest,
}: IslandReadyProps) {
  const reachable = expanded && !leaving;
  const choice = usePickedScreen(ready);
  const start = useReadyStart(api, ready, choice.screen, onRequest);
  const { picker, change } = useReadyPicker({ ready, start, ...choice, reachable, onRequest });

  // Ended or cancelled, the fade is over; IslandApp also has a timer if neither comes.
  function faded(event: TransitionEvent<HTMLDivElement>): void {
    if (leaving && event.target === event.currentTarget) onLeft();
  }

  return (
    <div
      className="island-panel island-ready"
      inert={!reachable}
      aria-hidden={!reachable}
      onTransitionEnd={faded}
      onTransitionCancel={faded}
    >
      <header className="island-ready-header">
        <h1 className="island-title" title={ready.title}>
          {ready.title}
        </h1>
        <Button
          variant="ghost"
          shape="round"
          className="island-close"
          aria-label="Fermer"
          disabled={start.busy}
          onClick={() => onRequest('close')}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </header>
      <PickerSwap
        open={picker.open}
        instant={picker.instant}
        base={
          <ReadySources
            ready={ready}
            screen={choice.screen}
            start={start}
            onChange={picker.toggle}
            changeRef={change}
          />
        }
        picker={
          <ScreenPicker
            api={api}
            screens={ready.screens}
            checked={picker.checked}
            disabled={start.busy}
            keyboard
            onPick={picker.pick}
            onBack={picker.close}
          />
        }
      />
      <div className="island-actions island-ready-actions">
        <Button
          variant="ghost"
          className="island-open-app"
          disabled={start.busy}
          onClick={() => onRequest('open')}
        >
          Ouvrir SayBack
        </Button>
        <Button shape="pill" busy={start.busy} disabled={!start.canStart} onClick={start.start}>
          Démarrer
        </Button>
      </div>
    </div>
  );
}
