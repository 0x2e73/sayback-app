import type { Folder, Meeting } from '../../../shared/contracts';
import { StatusBadge } from '../../components/ui';
import { AnalysisStatus } from './AnalysisStatus';
import { durationLabel, meetingDateLabel } from './detail-format';
import { FolderControl } from './FolderControl';

interface MeetingHeaderProps {
  meeting: Meeting;
  folders: Folder[];
  analyzing: boolean;
  onMove(folderId: string | null): void;
  onCreateFolder(name: string): Promise<Folder | null>;
}

/** Title, then one meta line. No summary: « Résumé » opens the notes. */
export function MeetingHeader(props: MeetingHeaderProps) {
  const { meeting, folders, analyzing, onMove, onCreateFolder } = props;
  return (
    <header className="detail-header">
      <h1>{meeting.title}</h1>
      <div className="detail-meta">
        <FolderControl
          meeting={meeting}
          folders={folders}
          onMove={onMove}
          onCreate={onCreateFolder}
        />
        <span>{meetingDateLabel(meeting.createdAt)}</span>
        <span>{durationLabel(meeting.duration)}</span>
        {analyzing ? <AnalysisStatus meeting={meeting} /> : <StatusBadge status={meeting.status} />}
      </div>
    </header>
  );
}
