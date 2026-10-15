import { useCallback, useState } from 'react';
import type { DesktopApi, Meeting } from '../shared/contracts';
import { useListFilter } from './features/list/use-list-filter';
import { useFolders } from './features/list/use-folders';
import { useMeetings } from './features/list/use-meetings';
import { useRowMenu } from './features/list/use-row-menu';
import { useAutoAnalysis } from './features/meetings/use-auto-analysis';
import { useRecording } from './features/recording/use-recording';
import { useUpdateInstall } from './features/updates/use-update-install';
import { useUpdateStatus } from './features/updates/use-update-status';
import { useRecordingEntry } from './use-recording-entry';
import { useSelection } from './use-selection';
import { workspaceNotice } from './workspace-notice';

export type CardView = 'meeting' | 'settings';

/** `onboarded`: the welcome is over; until then the menu bar and the island cannot start. */
export function useWorkspace(api: DesktopApi, onboarded: boolean) {
  const library = useMeetings(api);
  const folders = useFolders(api, library.update, library.refresh);
  const analysis = useAutoAnalysis(api, library.update);
  const updateStatus = useUpdateStatus(api);
  const updateInstall = useUpdateInstall(api, updateStatus);
  const filter = useListFilter(library.meetings, folders.folders);
  const [card, setCard] = useState<CardView>('meeting');
  const selection = useSelection(filter.visible, library.remove);
  const { run: runAutoAnalysis } = analysis;
  const updateMeeting = library.update;
  const { clear: clearFilter } = filter;
  const { choose, deleted } = selection;
  const onFinished = useCallback(
    (meeting: Meeting, autoAnalyze: boolean) => {
      updateMeeting(meeting);
      // A new meeting must be listed: the filter that would hide it is dropped.
      clearFilter();
      choose(meeting.id, false);
      setCard('meeting');
      if (autoAnalyze) runAutoAnalysis(meeting);
    },
    [choose, clearFilter, runAutoAnalysis, updateMeeting],
  );
  const recording = useRecording(api, onFinished);
  const entry = useRecordingEntry(api, recording, analysis.clearError, onboarded);

  const rowMenu = useRowMenu({
    api,
    folders: folders.folders,
    onMove: folders.move,
    onDeleted: deleted,
  });

  function select(id: string, by?: 'keyboard'): void {
    choose(id, by === 'keyboard');
    setCard('meeting');
  }

  return {
    library,
    folders,
    rowMenu,
    filter,
    recording,
    update: {
      status: updateStatus,
      busy: updateInstall.busy,
      onInstall: () => void updateInstall.install(),
    },
    card,
    newMeeting: entry.newMeeting,
    selected: selection.selected,
    instantCard: selection.instantCard,
    notice: workspaceNotice({
      recording: recording.interrupted ? '' : recording.error,
      analysis: analysis.error,
      library: library.error,
      folders: folders.error,
      rowMenu: rowMenu.error,
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
