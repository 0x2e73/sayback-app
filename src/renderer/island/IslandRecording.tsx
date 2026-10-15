import type { IslandRequest } from '../../shared/island';
import type { RecordingState } from '../../shared/recording-state';
import { LevelMeter, type LevelFeed } from '../components/ui';
import { IslandOpen } from './IslandOpen';
import { useChrono, type Clock } from './use-island';

interface IslandRecordingProps {
  feed: LevelFeed;
  recording: RecordingState;
  receivedAt: number;
  expanded: boolean;
  now: Clock;
  onRequest(request: IslandRequest): void;
}

/** The wings around the notch, and the panel they open into. */
export function IslandRecording(props: IslandRecordingProps) {
  const { recording } = props;
  const chrono = useChrono(recording, props.receivedAt, props.now);
  const paused = recording.recording && recording.paused;
  const stopping = recording.recording && recording.stopping;
  return (
    <>
      <div className="island-compact" aria-hidden="true">
        <span className="island-wing">
          <span className="island-dot" />
          <LevelMeter feed={props.feed} bars={4} />
        </span>
        <span />
        <span className="island-wing island-wing-end">
          <span className="island-chrono island-chrono-compact">{chrono}</span>
        </span>
      </div>
      <IslandOpen
        expanded={props.expanded}
        chrono={chrono}
        paused={paused}
        stopping={stopping}
        onRequest={props.onRequest}
      />
    </>
  );
}
