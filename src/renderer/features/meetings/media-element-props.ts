import type { PlaybackController } from './playback-controller';
import type { FollowerVideoProps, MediaElementProps } from './playback-types';

export function mediaElementProps(
  controller: PlaybackController,
  src: string | undefined,
): MediaElementProps {
  return {
    ref: (element) => controller.driver.attach(element),
    src,
    preload: 'metadata',
    onLoadedMetadata: () => controller.loadedMetadata(),
    onTimeUpdate: (event) => controller.timeUpdate(event.currentTarget.currentTime),
    onPlay: () => controller.confirmPlaying(true),
    onPause: () => controller.paused(),
    onEnded: () => controller.ended(),
    onError: () => controller.failed(),
  };
}

export function followerVideoProps(
  controller: PlaybackController,
  src: string,
): FollowerVideoProps {
  return {
    ref: (element) => controller.follower.attach(element),
    src,
    preload: 'metadata',
    muted: true,
    onLoadedMetadata: () => controller.follower.loadedMetadata(),
    onError: () => controller.follower.failed(),
  };
}
