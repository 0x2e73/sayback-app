import type { IslandApi } from '../../shared/contracts';
import type { IslandLiveSnapshot } from '../../shared/live';
import { IslandPreview } from './IslandPreview';
import { LiveText } from './LiveText';

interface RecordingSceneProps {
  api: Pick<IslandApi, 'onPreview'>;
  /** Absent for a recording of the sound alone: no preview column. */
  source: string | undefined;
  live: IslandLiveSnapshot | null;
}

/** The preview on the left, the live text on the right; either takes the room the other leaves. */
export function RecordingScene({ api, source, live }: RecordingSceneProps) {
  const text = live?.enabled !== false;
  return (
    <div
      className="island-scene"
      data-preview={source !== undefined || undefined}
      data-text={text || undefined}
    >
      {source !== undefined && <IslandPreview api={api} source={source} />}
      {text && <LiveText live={live} />}
    </div>
  );
}
