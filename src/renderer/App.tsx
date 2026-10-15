import type { DesktopApi } from '../shared/contracts';
import type { WorkspaceNotice } from './workspace-notice';
import { AppShell, focusCardContent } from './components/AppShell';
import { useHeld } from './components/use-held';
import { ErrorBoundary, FloatingNotice } from './components/ui';
import { ListPane } from './features/list/ListPane';
import { Onboarding } from './features/onboarding/Onboarding';
import { useOnboarding } from './features/onboarding/use-onboarding';
import { NewMeetingDialog } from './features/recording/NewMeetingDialog';
import { useFullScreen } from './use-full-screen';
import { useThemeSwitching } from './use-theme-switching';
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

interface NoticeHostProps {
  notice: WorkspaceNotice | null;
  onRetry(): void;
}

// Keeps the last message on screen while the notice fades out.
function NoticeHost({ notice, onRetry }: NoticeHostProps) {
  const shown = useHeld(notice);
  return (
    <FloatingNotice open={notice !== null} retry={shown?.retryList ? onRetry : undefined}>
      {shown?.message}
    </FloatingNotice>
  );
}

export function App({ api }: AppProps) {
  const onboarding = useOnboarding(api);
  useFullScreen(api);
  useThemeSwitching();
  const workspace = useWorkspace(api, onboarding.state === 'done');
  const { library, folders, recording, notice } = workspace;

  if (onboarding.state !== 'done') return <OnboardingScreen api={api} onboarding={onboarding} />;

  // While the card shows the settings, no row stands for it.
  const paneSelection = workspace.card === 'meeting' ? (workspace.selected?.id ?? null) : null;
  const pane = (
    <ErrorBoundary className="list-pane">
      <ListPane
        meetings={library.meetings}
        visibleMeetings={workspace.filter.visible}
        scope={workspace.filter.scope}
        query={workspace.filter.query}
        onScope={workspace.filter.setScope}
        onQuery={workspace.filter.setQuery}
        folders={folders.folders}
        folderActions={folders}
        loading={library.loading}
        selectedId={paneSelection}
        settingsOpen={workspace.card === 'settings'}
        recording={recording.capture}
        update={workspace.update}
        onSelect={workspace.select}
        onToggleSettings={workspace.toggleSettings}
        onNew={workspace.openNewMeeting}
        onShowRecording={focusCardContent}
      />
    </ErrorBoundary>
  );
  const floatingNotice = <NoticeHost notice={notice} onRetry={() => void library.refresh()} />;

  return (
    <AppShell pane={pane} notice={floatingNotice}>
      <ErrorBoundary>
        <WorkspaceContent
          api={api}
          card={workspace.card}
          selected={workspace.selected}
          instant={workspace.instantCard}
          loading={library.loading}
          hasMeetings={library.meetings.length > 0}
          folders={folders.folders}
          capture={recording.capture}
          stopping={recording.stopping}
          recordingFailed={recording.interrupted}
          onOpenInterrupted={recording.openInterrupted}
          onStop={recording.stop}
          onUpdate={library.update}
          onMove={folders.move}
          onCreateFolder={folders.create}
          onDeleted={workspace.deleted}
          onSettings={workspace.showSettings}
          onShowOnboarding={onboarding.reopen}
        />
      </ErrorBoundary>
      <NewMeetingDialog
        open={workspace.newMeeting}
        api={api}
        onClose={workspace.closeNewMeeting}
        onStart={workspace.start}
        onConfigure={workspace.configureAnalysis}
      />
    </AppShell>
  );
}
