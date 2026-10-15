import { useState } from 'react';
import type { DesktopApi, Folder, Meeting } from '../../../shared/contracts';
import { AnalysisLine } from './AnalysisStatus';
import { DeleteMeetingDialog } from './DeleteMeetingDialog';
import { DetailNotices } from './DetailNotices';
import { detailNotices } from './detail-notices';
import { MeetingActions } from './MeetingActions';
import { MeetingContent } from './MeetingContent';
import { MeetingHeader } from './MeetingHeader';
import { NotesView } from './NotesView';
import { PlaybackBar } from './PlaybackBar';
import { Transcript } from './Transcript';
import { useDetailView } from './use-detail-view';
import { useMediaPlayback } from './use-media-playback';
import { VideoBlock } from './VideoBlock';
import { useMeetingActions } from './use-meeting-actions';

interface MeetingDetailProps {
  meeting: Meeting;
  api: DesktopApi;
  folders: Folder[];
  onUpdate(meeting: Meeting): void;
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
  onCreateFolder(name: string): Promise<Folder | null>;
  onDeleted(): void;
  onSettings(): void;
}

export function MeetingDetail(props: MeetingDetailProps) {
  const { meeting, api, onUpdate, onDeleted } = props;
  const actions = useMeetingActions({ api, meeting, onUpdate, onDeleted });
  const playback = useMediaPlayback(meeting);
  const view = useDetailView(playback.playAt);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const analyze = () => void actions.analyze();

  const header = (
    <>
      <MeetingHeader
        meeting={meeting}
        folders={props.folders}
        analyzing={actions.analyzing}
        onMove={(folderId) => void props.onMove(meeting.id, folderId)}
        onCreateFolder={props.onCreateFolder}
      />
      <DetailNotices
        notices={detailNotices(meeting, actions.error, actions.analyzing)}
        canRetry={meeting.audioChunks.length > 0}
        onRetry={analyze}
      />
      {meeting.hasVideo && <VideoBlock playback={playback} />}
    </>
  );

  return (
    <div className="meeting-detail">
      {actions.analyzing && <AnalysisLine meeting={meeting} />}
      <MeetingContent
        header={header}
        view={view}
        notes={
          <NotesView
            meeting={meeting}
            currentTime={playback.clock.now}
            analyzing={actions.analyzing}
            saving={actions.saving}
            clarifyError={actions.clarifyError}
            onAnalyze={analyze}
            onSettings={props.onSettings}
            onTimestamp={view.openPassage}
            onClarify={actions.clarify}
          />
        }
        transcript={
          <Transcript
            meeting={meeting}
            clock={playback.clock}
            onSeek={view.transcript.onSeek}
            search={view.transcript.search}
            onSearch={view.transcript.onSearch}
          />
        }
      />
      <footer className="playback-bar">
        <PlaybackBar playback={playback} />
        <MeetingActions
          meeting={meeting}
          busy={actions.analyzing}
          onDelete={() => setConfirmDelete(true)}
        />
      </footer>
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
