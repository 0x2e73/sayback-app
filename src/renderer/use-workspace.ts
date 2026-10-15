import { useCallback, useState } from 'react';
import type { DesktopApi, Meeting } from '../shared/contracts';
import { sortNewestFirst } from './features/list/date-groups';
import { neighbourAfter, resolveSelection } from './features/list/selection';
import { useListFilter } from './features/list/use-list-filter';
import { useFolders } from './features/list/use-folders';
import { useMeetings } from './features/list/use-meetings';
import { useAutoAnalysis } from './features/meetings/use-auto-analysis';
import { useRecording } from './features/recording/use-recording';
import { useUpdateInstall } from './features/updates/use-update-install';
import { useUpdateStatus } from './features/updates/use-update-status';
import { useRecordingEntry } from './use-recording-entry';
import { workspaceNotice } from './workspace-notice';

export type CardView = 'meeting' | 'settings';

export function useWorkspace(api: DesktopApi) {
  const library = useMeetings(api);
  const folders = useFolders(api, library.update, library.refresh);
  const analysis = useAutoAnalysis(api, library.update);
  const updateStatus = useUpdateStatus(api);
  const updateInstall = useUpdateInstall(api, updateStatus);
  const filter = useListFilter(library.meetings, folders.folders);
  const [card, setCard] = useState<CardView>('meeting');
  const [chosenId, setChosenId] = useState<string | null>(null);
  const { run: runAutoAnalysis } = analysis;
  const updateMeeting = library.update;
  const { clear: clearFilter } = filter;
  const onFinished = useCallback(
    (meeting: Meeting, autoAnalyze: boolean) => {
      updateMeeting(meeting);
      // A new meeting must be listed: the filter that would hide it is dropped.
      clearFilter();
      setChosenId(meeting.id);
      setCard('meeting');
      if (autoAnalyze) runAutoAnalysis(meeting);
    },
    [clearFilter, runAutoAnalysis, updateMeeting],
  );
  const recording = useRecording(api, onFinished);
  const entry = useRecordingEntry(api, recording, analysis.clearError);

  const selected = resolveSelection(filter.visible, chosenId);

  // Leaves the card on the row that takes the deleted one's place in the list.
  function deleted(id: string): void {
    const shown = sortNewestFirst(filter.visible).map((meeting) => meeting.id);
    setChosenId(neighbourAfter(shown, id));
    library.remove(id);
  }

  function select(id: string): void {
    setChosenId(id);
    setCard('meeting');
  }

  return {
    library,
    folders,
    filter,
    recording,
    update: {
      status: updateStatus,
      busy: updateInstall.busy,
      onInstall: () => void updateInstall.install(),
    },
    card,
    newMeeting: entry.newMeeting,
    selected,
    notice: workspaceNotice({
      recording: recording.interrupted ? '' : recording.error,
      analysis: analysis.error,
      library: library.error,
      folders: folders.error,
      update: updateInstall.error,
    }),
    start: entry.start,
    select,
    deleted,
    toggleSettings: () => setCard((current) => (current === 'settings' ? 'meeting' : 'settings')),
    showSettings: () => setCard('settings'),
    openNewMeeting: entry.openNewMeeting,
    closeNewMeeting: entry.closeNewMeeting,
    configureAnalysis: () => {
      entry.closeNewMeeting();
      setCard('settings');
    },
  };
}
