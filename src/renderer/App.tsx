import type { DesktopApi } from '../shared/contracts';
import { AppShell, focusCardContent } from './components/AppShell';
import { Notice } from './components/ui';
import { ListPane } from './features/list/ListPane';
import { Onboarding } from './features/onboarding/Onboarding';
import { useOnboarding } from './features/onboarding/use-onboarding';
import { NewMeetingDialog } from './features/recording/NewMeetingDialog';
import { useFullScreen } from './use-full-screen';
import { useWorkspace } from './use-workspace';
import { WorkspaceContent } from './WorkspaceContent';

interface AppProps {
  api: DesktopApi;
}

function StartupScreen() {
  return (
    <div className="startup-screen" role="status">
      <div className="window-band window-band-fixed" aria-hidden="true" />
      Ouverture de SayBack…
    </div>
  );
}

interface OnboardingScreenProps {
  api: DesktopApi;
  onboarding: ReturnType<typeof useOnboarding>;
}

function OnboardingScreen({ api, onboarding }: OnboardingScreenProps) {
  if (onboarding.state === 'loading') return <StartupScreen />;
  return (
    <Onboarding
      api={api}
      busy={onboarding.busy}
      error={onboarding.error}
      onComplete={onboarding.complete}
    />
  );
}

export function App({ api }: AppProps) {
  const onboarding = useOnboarding(api);
  useFullScreen(api);
  const workspace = useWorkspace(api);
  const { library, folders, recording, notice } = workspace;

  if (onboarding.state !== 'done') return <OnboardingScreen api={api} onboarding={onboarding} />;

  const pane = (
    <ListPane
      meetings={library.meetings}
      folders={folders.folders}
      folderActions={folders}
      loading={library.loading}
      selectedId={workspace.selected?.id ?? null}
      settingsOpen={workspace.card === 'settings'}
      recording={recording.capture}
      onSelect={workspace.select}
      onToggleSettings={workspace.toggleSettings}
      onNew={workspace.openNewMeeting}
      onShowRecording={focusCardContent}
    />
  );
  const floatingNotice = notice && (
    <Notice floating retry={notice.retryList ? () => void library.refresh() : undefined}>
      {notice.message}
    </Notice>
  );

  return (
    <AppShell pane={pane} notice={floatingNotice}>
      <WorkspaceContent
        api={api}
        card={workspace.card}
        selected={workspace.selected}
        loading={library.loading}
        folders={folders.folders}
        capture={recording.capture}
        stopping={recording.stopping}
        onStop={recording.stop}
        onUpdate={library.update}
        onMove={folders.move}
        onDeleted={library.remove}
        onSettings={workspace.showSettings}
        onShowOnboarding={onboarding.reopen}
      />
      {workspace.newMeeting && (
        <NewMeetingDialog api={api} onClose={workspace.closeNewMeeting} onStart={workspace.start} />
      )}
    </AppShell>
  );
}
