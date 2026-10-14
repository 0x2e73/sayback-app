import { useCallback, useState } from 'react';
import type { DesktopApi, Meeting } from '../shared/contracts';
import { AppShell } from './components/AppShell';
import type { WorkspaceSection } from './components/Sidebar';
import { Notice } from './components/ui';
import { useMeetings } from './features/list/use-meetings';
import { useFolders } from './features/list/use-folders';
import { useAutoAnalysis } from './features/meetings/use-auto-analysis';
import { Onboarding } from './features/onboarding/Onboarding';
import { useOnboarding } from './features/onboarding/use-onboarding';
import { useFullScreen } from './use-full-screen';
import { NewMeetingDialog } from './features/recording/NewMeetingDialog';
import { useRecording } from './features/recording/use-recording';
import type { CaptureOptions } from './features/recording/capture-session';
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
  const library = useMeetings(api);
  const folders = useFolders(api, library.update, library.refresh);
  const updateMeeting = library.update;
  const {
    run: runAutoAnalysis,
    error: analysisError,
    clearError,
  } = useAutoAnalysis(api, updateMeeting);
  const [section, setSection] = useState<WorkspaceSection>('library');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newMeeting, setNewMeeting] = useState(false);
  const onFinished = useCallback(
    (meeting: Meeting, autoAnalyze: boolean) => {
      updateMeeting(meeting);
      setSelectedId(meeting.id);
      setSection('library');
      if (autoAnalyze) runAutoAnalysis(meeting);
    },
    [runAutoAnalysis, updateMeeting],
  );
  const recording = useRecording(api, onFinished);
  const selected = library.meetings.find((meeting) => meeting.id === selectedId);
  const error = recording.error || analysisError || library.error || folders.error;

  function navigate(next: WorkspaceSection) {
    setSection(next);
    setSelectedId(null);
    if (next === 'library') void library.refresh();
  }

  async function start(
    title: string,
    options: Omit<CaptureOptions, 'onFailure' | 'onEnded'>,
    autoAnalyze: boolean,
  ) {
    clearError();
    await recording.start(title, options, autoAnalyze);
    setNewMeeting(false);
  }

  if (onboarding.state !== 'done') return <OnboardingScreen api={api} onboarding={onboarding} />;

  return (
    <AppShell
      section={section}
      recording={Boolean(recording.capture)}
      count={library.meetings.length}
      onNavigate={navigate}
    >
      {error && (
        <Notice retry={library.error ? () => void library.refresh() : undefined}>{error}</Notice>
      )}
      <WorkspaceContent
        api={api}
        section={section}
        selected={selected}
        capture={recording.capture}
        stopping={recording.stopping}
        onStop={recording.stop}
        meetings={library.meetings}
        folders={folders.folders}
        onCreateFolder={folders.create}
        onRenameFolder={folders.rename}
        onDeleteFolder={folders.remove}
        onMoveMeeting={folders.move}
        loading={library.loading}
        onNew={() => setNewMeeting(true)}
        onOpen={(meeting) => setSelectedId(meeting.id)}
        onUpdate={library.update}
        onBack={() => navigate('library')}
        onSettings={() => navigate('settings')}
        onShowOnboarding={onboarding.reopen}
      />
      {newMeeting && (
        <NewMeetingDialog api={api} onClose={() => setNewMeeting(false)} onStart={start} />
      )}
    </AppShell>
  );
}
