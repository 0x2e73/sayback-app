import { timeLabel } from '../../../shared/format';
import type { RefObject } from 'react';
import type { Meeting } from '../../../shared/contracts';

import { Clarifications } from './Clarifications';
import { MediaPlayer, type PlayerHandle } from './MediaPlayer';

interface MeetingContextProps {
  meeting: Meeting;
  playerRef: RefObject<PlayerHandle | null>;
  at: number;
  analyzing: boolean;
  saving: boolean;
  onTime(at: number): void;
  onSeek(at: number): void;
  onClarify(at: number, text: string): Promise<boolean>;
}

export function MeetingContext(props: MeetingContextProps) {
  return (
    <aside className="context-panel">
      <div className="panel-title">
        <h2>Le contexte</h2>
        <span className="caption">{timeLabel(props.at)}</span>
      </div>
      <MediaPlayer ref={props.playerRef} meeting={props.meeting} onTime={props.onTime} />
      <Clarifications
        meeting={props.meeting}
        at={props.at}
        disabled={props.analyzing}
        saving={props.saving}
        onTimestamp={(at) => props.onSeek(at)}
        onSubmit={props.onClarify}
      />
    </aside>
  );
}
