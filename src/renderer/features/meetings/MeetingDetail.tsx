import { useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DesktopApi, Meeting } from '../../../shared/contracts';
import { Button, Notice } from '../../components/ui';
import type { PlayerHandle } from './MediaPlayer';
import { MeetingHeader } from './MeetingHeader';
import { MeetingContent } from './MeetingContent';
import { MeetingContext } from './MeetingContext';
import { DeleteMeetingDialog } from './DeleteMeetingDialog';
import { useMeetingActions } from './use-meeting-actions';
import { downloadMeeting } from './download-meeting';

interface MeetingDetailProps {
  meeting: Meeting;
  api: DesktopApi;
  onUpdate(meeting: Meeting): void;
  onBack(): void;
  onSettings(): void;
}

export function MeetingDetail(props: MeetingDetailProps) {
  const { meeting, api, onUpdate, onBack, onSettings } = props;
  const [at, setAt] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const player = useRef<PlayerHandle>(null);
  const actions = useMeetingActions({ api, meeting, onUpdate, onDeleted: onBack });
  const error = actions.error || meeting.error;

  function seek(seconds: number) {
    setAt(seconds);
    player.current?.seek(seconds);
  }

  return (
    <div className="detail-page">
      <Button variant="ghost" className="back-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Toutes les réunions
      </Button>
      <MeetingHeader
        meeting={meeting}
        busy={actions.analyzing}
        onExport={() => downloadMeeting(meeting)}
        onDelete={() => setConfirmDelete(true)}
      />
      {error && <Notice>{error}</Notice>}
      <div className="detail-grid">
        <MeetingContent
          meeting={meeting}
          at={at}
          analyzing={actions.analyzing}
          onAnalyze={() => void actions.analyze()}
          onSettings={onSettings}
          onSeek={seek}
        />
        <MeetingContext
          meeting={meeting}
          playerRef={player}
          at={at}
          analyzing={actions.analyzing}
          saving={actions.saving}
          onTime={setAt}
          onSeek={seek}
          onClarify={actions.clarify}
        />
      </div>
      {confirmDelete && (
        <DeleteMeetingDialog
          busy={actions.deleting}
          onClose={() => setConfirmDelete(false)}
          onDelete={actions.remove}
        />
      )}
    </div>
  );
}
