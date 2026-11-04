import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { Button, StatusBadge } from '../../components/ui';
import { AnalysisStatus } from './AnalysisStatus';
import { durationLabel, meetingDateLabel } from './detail-format';
import { FolderControl } from './FolderControl';

interface MeetingHeaderProps {
  meeting: Meeting;
  folders: Folder[];
  analyzing: boolean;
  onRename?(): void;
  onMove(folderId: string | null): void;
  onCreateFolder(name: string): Promise<Folder | null>;
}

/** One slot of the meta line: the « · » separator is drawn before the slot, outside any badge. */
function MetaItem({ children }: { children: ReactNode }) {
  return <span className="detail-meta-item">{children}</span>;
}

/** Title, then one meta line. No summary: « Résumé » opens the notes. */
export function MeetingHeader(props: MeetingHeaderProps) {
  const { meeting, folders, analyzing, onMove, onCreateFolder } = props;
  return (
    <header className="detail-header">
      <div className="detail-title-row">
        <h1>{meeting.title}</h1>
        {props.onRename && (
          <Button
            variant="ghost"
            disabled={analyzing || meeting.status === 'recording'}
            onClick={props.onRename}
            aria-label="Renommer la réunion"
            title="Renommer la réunion"
          >
            <Pencil size={16} />
          </Button>
        )}
      </div>
      <div className="detail-meta">
        <MetaItem>
          <FolderControl
            meeting={meeting}
            folders={folders}
            onMove={onMove}
            onCreate={onCreateFolder}
          />
        </MetaItem>
        <MetaItem>{meetingDateLabel(meeting.createdAt)}</MetaItem>
        {meeting.duration > 0 && <MetaItem>{durationLabel(meeting.duration)}</MetaItem>}
        <MetaItem>
          {analyzing ? (
            <AnalysisStatus meeting={meeting} />
          ) : (
            <StatusBadge status={meeting.status} />
          )}
        </MetaItem>
      </div>
    </header>
  );
}
