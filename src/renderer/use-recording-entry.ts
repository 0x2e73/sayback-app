import { useState } from 'react';
import type { DesktopApi } from '../shared/contracts';
import { answerIslandStart, refuseIslandStart } from './features/recording/island-start';
import type { CaptureSelection } from './features/recording/start-meeting';
import type { useRecording } from './features/recording/use-recording';
import { useMenuBar } from './use-menu-bar';

type Recording = ReturnType<typeof useRecording>;

/** Where a recording begins: the « Nouvelle réunion » dialog, the menu bar and the ready island. */
export function useRecordingEntry(
  api: DesktopApi,
  recording: Recording,
  clearAnalysisError: () => void,
  onboarded: boolean,
) {
  const [newMeeting, setNewMeeting] = useState(false);

  async function start(
    title: string,
    options: CaptureSelection,
    autoAnalyze: boolean,
    deadline?: number,
  ) {
    clearAnalysisError();
    await recording.start(title, options, autoAnalyze, deadline);
    setNewMeeting(false);
  }

  // One recording at a time: the pane is locked meanwhile.
  useMenuBar(api, recording, {
    onNewRecording: () => {
      if (!recording.capture) setNewMeeting(true);
    },
    // During the welcome nothing records: the island hears a failure at once.
    onStartRequest: (request) => {
      if (onboarded) void answerIslandStart(api, request, start);
      else void refuseIslandStart(api, request);
    },
  });

  return {
    newMeeting,
    start,
    openNewMeeting: () => setNewMeeting(true),
    closeNewMeeting: () => setNewMeeting(false),
  };
}
