import { useEffect, useMemo } from 'react';
import type { DesktopApi } from '../../../shared/contracts';
import type { CaptureSession } from './capture-session';
import { RecordingFeed } from './recording-feed';

/** The level feed of a running capture: sent to the main process and drawn by the view. */
export function useRecordingFeed(
  api: Pick<DesktopApi, 'sendLevel'>,
  capture: CaptureSession,
): RecordingFeed {
  const feed = useMemo(
    () => new RecordingFeed(capture, (level) => api.sendLevel(level)),
    [api, capture],
  );
  useEffect(() => {
    feed.start();
    return () => feed.stop();
  }, [feed]);
  return feed;
}
