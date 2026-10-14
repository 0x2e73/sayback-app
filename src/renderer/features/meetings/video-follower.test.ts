import { describe, expect, it, vi, type Mock } from 'vitest';
import { VideoFollower, type VideoLike } from './video-follower';

interface FakeVideo extends VideoLike {
  ended: boolean;
  play: Mock<() => Promise<void>>;
  pause: Mock<() => void>;
}

function fakeVideo(play: () => Promise<void> = async () => undefined): FakeVideo {
  return { currentTime: 0, ended: false, play: vi.fn(play), pause: vi.fn() };
}

function readyFollower(video: FakeVideo) {
  const follower = new VideoFollower();
  follower.attach(video);
  follower.loadedMetadata();
  return follower;
}

describe('VideoFollower', () => {
  it('follows the play and pause of the audio', () => {
    const video = fakeVideo();
    const follower = readyFollower(video);
    follower.setPlaying(true);
    follower.setPlaying(false);
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
  });

  it('moves to the position of every seek', () => {
    const video = fakeVideo();
    readyFollower(video).seek(125);
    expect(video.currentTime).toBe(125);
  });

  it('keeps a seek and a play asked before the metadata', () => {
    const video = fakeVideo();
    const follower = new VideoFollower();
    follower.attach(video);
    follower.seek(40);
    follower.setPlaying(true);
    expect(video.currentTime).toBe(0);
    expect(video.play).not.toHaveBeenCalled();
    follower.loadedMetadata();
    expect(video.currentTime).toBe(40);
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('puts the video back on the audio only when it drifts by more than half a second', () => {
    const video = fakeVideo();
    const follower = readyFollower(video);
    video.currentTime = 10;
    follower.drift(10.4);
    expect(video.currentTime).toBe(10);
    follower.drift(11);
    expect(video.currentTime).toBe(11);
  });

  it('leaves a video that ended before the audio on its last frame', () => {
    const video = fakeVideo();
    const follower = readyFollower(video);
    video.currentTime = 30;
    video.ended = true;
    follower.drift(45);
    expect(video.currentTime).toBe(30);
  });

  it('gives up on a video that failed', () => {
    const video = fakeVideo();
    const follower = readyFollower(video);
    follower.failed();
    follower.seek(20);
    follower.setPlaying(true);
    follower.drift(50);
    expect(video.currentTime).toBe(0);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('swallows a play the browser refuses', async () => {
    const video = fakeVideo(() => Promise.reject(new DOMException('refused', 'NotAllowedError')));
    readyFollower(video).setPlaying(true);
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledOnce();
  });

  it('still pauses the element after React detached its ref', () => {
    const video = fakeVideo();
    const follower = readyFollower(video);
    follower.attach(null);
    follower.stop();
    expect(video.pause).toHaveBeenCalledOnce();
  });
});
