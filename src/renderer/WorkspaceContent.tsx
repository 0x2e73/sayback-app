import type { ComponentProps } from 'react';
import type { DesktopApi, Meeting } from '../shared/contracts';
import type { WorkspaceSection } from './components/Sidebar';
import { LibraryPage } from './features/library/LibraryPage';
import { MeetingDetail } from './features/meetings/MeetingDetail';
import { RecordingView } from './features/recording/RecordingView';
import type { CaptureSession } from './features/recording/capture-session';
import { SettingsView } from './features/settings/SettingsView';

interface WorkspaceContentProps extends ComponentProps<typeof LibraryPage> {
  api: DesktopApi;
  section: WorkspaceSection;
  selected?: Meeting;
  capture: CaptureSession | null;
  stopping: boolean;
  onStop(): void;
  onUpdate(meeting: Meeting): void;
  onBack(): void;
  onSettings(): void;
  onShowOnboarding(): void;
}

export function WorkspaceContent(props: WorkspaceContentProps) {
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
  if (props.section === 'settings') {
    return <SettingsView api={props.api} onShowOnboarding={props.onShowOnboarding} />;
  }
  if (props.selected) {
    return (
      <MeetingDetail
        key={props.selected.id}
        meeting={props.selected}
        api={props.api}
        folders={props.folders}
        onUpdate={props.onUpdate}
        onMove={props.onMoveMeeting}
        onDeleted={props.onBack}
        onSettings={props.onSettings}
      />
    );
  }
  return (
    <LibraryPage
      meetings={props.meetings}
      folders={props.folders}
      onCreateFolder={props.onCreateFolder}
      onRenameFolder={props.onRenameFolder}
      onDeleteFolder={props.onDeleteFolder}
      onMoveMeeting={props.onMoveMeeting}
      loading={props.loading}
      onNew={props.onNew}
      onOpen={props.onOpen}
    />
  );
}
