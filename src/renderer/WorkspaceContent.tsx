import type { DesktopApi, Folder, Meeting } from '../shared/contracts';
import { EmptyState } from './components/ui';
import { MeetingDetail } from './features/meetings/MeetingDetail';
import { RecordingView } from './features/recording/RecordingView';
import type { CaptureSession } from './features/recording/capture-session';
import { SettingsView } from './features/settings/SettingsView';
import type { CardView } from './use-workspace';

interface WorkspaceContentProps {
  api: DesktopApi;
  card: CardView;
  selected?: Meeting;
  loading: boolean;
  folders: Folder[];
  capture: CaptureSession | null;
  stopping: boolean;
  onStop(): void;
  onUpdate(meeting: Meeting): void;
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
  onDeleted(meetingId: string): void;
  onSettings(): void;
  onShowOnboarding(): void;
}

export function WorkspaceContent(props: WorkspaceContentProps) {
  const { selected } = props;
  if (props.capture) {
    return (
      <RecordingView
        api={props.api}
        capture={props.capture}
        onStop={props.onStop}
        stopping={props.stopping}
      />
    );
  }
  if (props.card === 'settings') {
    return <SettingsView api={props.api} onShowOnboarding={props.onShowOnboarding} />;
  }
  if (selected) {
    return (
      <MeetingDetail
        key={selected.id}
        meeting={selected}
        api={props.api}
        folders={props.folders}
        onUpdate={props.onUpdate}
        onMove={props.onMove}
        onDeleted={() => props.onDeleted(selected.id)}
        onSettings={props.onSettings}
      />
    );
  }
  if (props.loading) return null;
  return <EmptyState title="Enregistrez votre première réunion" />;
}
