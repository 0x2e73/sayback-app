import { useEffect, useMemo, useState } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { followerVideoProps, mediaElementProps } from './media-element-props';
import { MediaDriver } from './media-driver';
import { createPlaybackClock } from './playback-clock';
import { INITIAL_STATE, PlaybackController } from './playback-controller';
import { drivesFromVideo, playbackSources, timelineEnd, videoSource } from './playback-timeline';
import type { Playback } from './playback-types';
import { VideoFollower } from './video-follower';

export type { FollowerVideoProps, MediaElementProps, Playback } from './playback-types';

export function useMediaPlayback(meeting: Meeting): Playback {
  // Rebuilt each render: the 2 s poll hands over equal sources, so `src` does not change.
  const sources = playbackSources(meeting);
  const duration = timelineEnd(sources, meeting.duration);
  const [state, setState] = useState(INITIAL_STATE);
  const [clock] = useState(() => createPlaybackClock());
  const [controller] = useState(
    () => new PlaybackController(new MediaDriver(), new VideoFollower(), clock, setState),
  );
  // Stable: the memoised transcript turns receive them.
  const actions = useMemo(
    () => ({
      toggle: () => controller.toggle(),
      seek: (time: number) => controller.seek(time),
      playAt: (time: number) => controller.goTo(time, true),
    }),
    [controller],
  );
  const video = videoSource(meeting);
  const onVideo = drivesFromVideo(meeting);

  useEffect(() => controller.setSources(sources, duration));
  useEffect(() => () => controller.stop(), [controller]);

  return {
    available: sources.length > 0,
    playing: state.playing,
    failed: state.failed,
    clock,
    duration,
    timeline: onVideo ? 'video' : 'audio',
    mediaProps: mediaElementProps(controller, sources[state.position]?.src),
    videoProps: video && !onVideo ? followerVideoProps(controller, video) : null,
    ...actions,
  };
}
