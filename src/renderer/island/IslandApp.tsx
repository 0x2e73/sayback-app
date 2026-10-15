import { useState, type CSSProperties } from 'react';
import type { IslandApi } from '../../shared/contracts';
import type { IslandRequest, IslandShape } from '../../shared/island';
import { IslandReady } from './IslandReady';
import { IslandRecording } from './IslandRecording';
import { monotonic, useIsland, type Clock, type IslandView } from './use-island';

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
  api: IslandApi;
  view: IslandView;
  now: Clock;
  onRequest(request: IslandRequest): void;
}

// One shell for both modes: the ready content stays mounted, with its chips and busy state,
// while it fades out over the recording content.
function IslandShell({ api, view, now, onRequest }: IslandShellProps) {
  const { snapshot, ready } = view;
  const [handedOver, setHandedOver] = useState(false);
  const { recording, shape } = snapshot;
  const recordingMode = snapshot.mode === 'recording';
  const arriving = recordingMode && ready !== null;
  return (
    <main
      className="island"
      aria-label="SayBack"
      data-mode={snapshot.mode}
      data-kind={shape.kind}
      data-expanded={view.expanded || undefined}
      data-paused={(recording.recording && recording.paused) || undefined}
      data-arriving={arriving || undefined}
    >
      <div className="island-shell" style={shapeStyle(shape)}>
        {ready && !(arriving && handedOver) && (
          <IslandReady
            api={api}
            ready={ready}
            expanded={view.expanded}
            leaving={recordingMode}
            onLeft={() => setHandedOver(true)}
            onRequest={onRequest}
          />
        )}
        {recordingMode && (
          <IslandRecording
            feed={api}
            recording={recording}
            receivedAt={view.receivedAt}
            expanded={view.expanded}
            now={now}
            onRequest={onRequest}
          />
        )}
      </div>
    </main>
  );
}

export function IslandApp({ api, now = monotonic }: IslandAppProps) {
  const { view, request } = useIsland(api, now);
  if (!view) return null;
  const { snapshot } = view;
  if (snapshot.mode === 'recording' && !snapshot.recording.recording) return null;
  return <IslandShell api={api} view={view} now={now} onRequest={request} />;
}
