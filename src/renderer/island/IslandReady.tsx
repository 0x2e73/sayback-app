import type { TransitionEvent } from 'react';
import { X } from 'lucide-react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandReadyState, IslandRequest } from '../../shared/island';
import { Button } from '../components/ui';
import { SourceChips } from '../features/recording/SourceChips';
import { ReadyScreenLine } from './ReadyScreenLine';
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
  const start = useReadyStart(api, ready, onRequest);
  const reachable = expanded && !leaving;

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
          onClick={() => onRequest('close')}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </header>
      <SourceChips
        selection={start.selection}
        microphoneBlocked={false}
        disabled={start.busy}
        legendHidden
        onToggle={start.toggle}
      />
      <ReadyScreenLine
        screen={ready.screen}
        screenCount={ready.screenCount}
        screenOn={start.selection.screen}
        error={start.error}
        busy={start.busy}
        onRequest={start.request}
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
