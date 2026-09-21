import { timeLabel } from '../../../shared/format';
import type { RefObject } from 'react';
import type { Meeting } from '../../../shared/contracts';

import { ClarificationForm } from './ClarificationForm';
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
      <ClarificationForm
        duration={props.meeting.duration}
        at={props.at}
        disabled={props.analyzing}
        saving={props.saving}
        onTime={props.onTime}
        onSubmit={props.onClarify}
      />
      {props.meeting.clarifications.length > 0 && (
        <div className="clarifications">
          <h3>Précisions ajoutées</h3>
          {props.meeting.clarifications.map((item) => (
            <div className="clarification" key={item.id}>
              <button className="timestamp-link" onClick={() => props.onSeek(item.at)}>
                {timeLabel(item.at)}
              </button>
              <p>{item.text}</p>
              <span className="caption">Ajout manuel</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
