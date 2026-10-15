import type { CSSProperties } from 'react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandShape } from '../../shared/island';
import { LevelMeter, type LevelFeed } from '../components/ui';
import { IslandOpen } from './IslandOpen';
import { monotonic, useChrono, useIsland, type Clock, type IslandView } from './use-island';

interface IslandAppProps {
  api: IslandApi;
  now?: Clock;
}

type ShapeStyle = CSSProperties & Record<`--${string}`, string>;

// The sizes come from the geometry of the main process, through the declared island tokens.
function shapeStyle(shape: IslandShape): ShapeStyle {
  return {
    '--island-bar-height': `${shape.barHeight}px`,
    '--island-notch-width': `${shape.notchWidth}px`,
    '--island-compact-width': `${shape.compactWidth}px`,
    '--island-open-width': `${shape.openWidth}px`,
    '--island-open-height': `${shape.openHeight}px`,
  };
}

interface IslandShellProps {
  feed: LevelFeed;
  view: IslandView;
  now: Clock;
  onRequest: ReturnType<typeof useIsland>['request'];
}

function IslandShell({ feed, view, now, onRequest }: IslandShellProps) {
  const { recording, shape } = view.snapshot;
  const chrono = useChrono(recording, view.receivedAt, now);
  const paused = recording.recording && recording.paused;
  const stopping = recording.recording && recording.stopping;
  return (
    <main
      className="island"
      aria-label="SayBack"
      data-kind={shape.kind}
      data-expanded={view.expanded || undefined}
      data-paused={paused || undefined}
    >
      <div className="island-shell" style={shapeStyle(shape)}>
        <div className="island-compact" aria-hidden="true">
          <span className="island-wing">
            <span className="island-dot" />
            <LevelMeter feed={feed} bars={4} />
          </span>
          <span />
          <span className="island-wing island-wing-end">
            <span className="island-chrono island-chrono-compact">{chrono}</span>
          </span>
        </div>
        <IslandOpen
          expanded={view.expanded}
          chrono={chrono}
          paused={paused}
          stopping={stopping}
          onRequest={onRequest}
        />
      </div>
    </main>
  );
}

export function IslandApp({ api, now = monotonic }: IslandAppProps) {
  const { view, request } = useIsland(api, now);
  if (!view?.snapshot.recording.recording) return null;
  return <IslandShell feed={api} view={view} now={now} onRequest={request} />;
}
