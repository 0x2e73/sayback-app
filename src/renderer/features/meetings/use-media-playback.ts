import { useEffect, useState } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { followerVideoProps, mediaElementProps } from './media-element-props';
import { MediaDriver } from './media-driver';
import { INITIAL_VIEW, PlaybackController } from './playback-controller';
import { drivesFromVideo, playbackSources, timelineEnd, videoSource } from './playback-timeline';
import type { Playback } from './playback-types';
import { VideoFollower } from './video-follower';

export type { FollowerVideoProps, MediaElementProps, Playback } from './playback-types';

export function useMediaPlayback(meeting: Meeting): Playback {
  // Rebuilt each render: the 2 s poll hands over equal sources, so `src` does not change.
  const sources = playbackSources(meeting);
  const duration = timelineEnd(sources, meeting.duration);
  const [view, setView] = useState(INITIAL_VIEW);
  const [controller] = useState(
    () => new PlaybackController(new MediaDriver(), new VideoFollower(), setView),
  );
  const video = videoSource(meeting);
  const onVideo = drivesFromVideo(meeting);

  useEffect(() => controller.setSources(sources, duration));
  useEffect(() => () => controller.stop(), [controller]);

  return {
    available: sources.length > 0,
    playing: view.playing,
    failed: view.failed,
    at: view.at,
    duration,
    timeline: onVideo ? 'video' : 'audio',
    mediaProps: mediaElementProps(controller, sources[view.position]?.src),
    videoProps: video && !onVideo ? followerVideoProps(controller, video) : null,
    toggle: () => controller.toggle(),
    seek: (time) => controller.seek(time),
    playAt: (time) => controller.goTo(time, true),
  };
}
