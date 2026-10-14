import { useCallback, useState } from 'react';
import type { DesktopApi, Meeting } from '../shared/contracts';
import { resolveSelection } from './features/list/selection';
import { useFolders } from './features/list/use-folders';
import { useMeetings } from './features/list/use-meetings';
import { useAutoAnalysis } from './features/meetings/use-auto-analysis';
import type { CaptureOptions } from './features/recording/capture-session';
import { useRecording } from './features/recording/use-recording';
import { workspaceNotice } from './workspace-notice';

export type CardView = 'meeting' | 'settings';
type StartOptions = Omit<CaptureOptions, 'onFailure' | 'onEnded'>;

export function useWorkspace(api: DesktopApi) {
  const library = useMeetings(api);
  const folders = useFolders(api, library.update, library.refresh);
  const analysis = useAutoAnalysis(api, library.update);
  const [card, setCard] = useState<CardView>('meeting');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [newMeeting, setNewMeeting] = useState(false);
  const { run: runAutoAnalysis } = analysis;
  const updateMeeting = library.update;
  const onFinished = useCallback(
    (meeting: Meeting, autoAnalyze: boolean) => {
      updateMeeting(meeting);
      setChosenId(meeting.id);
      setCard('meeting');
      if (autoAnalyze) runAutoAnalysis(meeting);
    },
    [runAutoAnalysis, updateMeeting],
  );
  const recording = useRecording(api, onFinished);

  async function start(title: string, options: StartOptions, autoAnalyze: boolean) {
    analysis.clearError();
    await recording.start(title, options, autoAnalyze);
    setNewMeeting(false);
  }

  function select(id: string): void {
    setChosenId(id);
    setCard('meeting');
  }

  return {
    library,
    folders,
    recording,
    card,
    newMeeting,
    selected: resolveSelection(library.meetings, chosenId),
    notice: workspaceNotice({
      recording: recording.error,
      analysis: analysis.error,
      library: library.error,
      folders: folders.error,
    }),
    start,
    select,
    toggleSettings: () => setCard((current) => (current === 'settings' ? 'meeting' : 'settings')),
    showSettings: () => setCard('settings'),
    openNewMeeting: () => setNewMeeting(true),
    closeNewMeeting: () => setNewMeeting(false),
  };
}
