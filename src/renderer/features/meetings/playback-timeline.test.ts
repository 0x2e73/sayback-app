import { describe, expect, it } from 'vitest';
import type { AudioChunk } from '../../../shared/contracts';
import {
  drivesFromVideo,
  locate,
  playbackSources,
  resumePoint,
  timelineEnd,
  timelineTime,
  videoSource,
  type PlaybackSource,
} from './playback-timeline';

const chunk = (index: number, start: number, duration = 60): AudioChunk => ({
  index,
  start,
  duration,
  transcript: null,
});
const audio = (audioChunks: AudioChunk[], duration = 180) => ({
  id: 'm1',
  hasVideo: false,
  duration,
  audioChunks,
});
const three = playbackSources(audio([chunk(0, 0), chunk(1, 60), chunk(2, 120)]));

describe('playbackSources', () => {
  it('orders the extracts by time without touching the meeting', () => {
    const chunks = [chunk(2, 120), chunk(0, 0), chunk(1, 60)];
    expect(playbackSources(audio(chunks)).map((source) => source.src)).toEqual([
      'meeting-media://local/m1/audio/0',
      'meeting-media://local/m1/audio/1',
      'meeting-media://local/m1/audio/2',
    ]);
    expect(chunks.map((item) => item.index)).toEqual([2, 0, 1]);
  });

  it('leaves out the extracts it cannot place', () => {
    const chunks = [
      chunk(0, 0, 0),
      chunk(1, Number.NaN, 10),
      chunk(2, -1, 10),
      chunk(3, 0, Number.POSITIVE_INFINITY),
      chunk(4, 10, 20),
    ];
    expect(playbackSources(audio(chunks))).toEqual([
      { src: 'meeting-media://local/m1/audio/4', start: 10, duration: 20 },
    ]);
  });

  it('lets the audio extracts drive a meeting that also has a video', () => {
    const meeting = { ...audio([chunk(0, 0), chunk(1, 60)]), hasVideo: true };
    expect(playbackSources(meeting).map((source) => source.src)).toEqual([
      'meeting-media://local/m1/audio/0',
      'meeting-media://local/m1/audio/1',
    ]);
    expect(drivesFromVideo(meeting)).toBe(false);
    expect(videoSource(meeting)).toBe('meeting-media://local/m1/video');
  });

  it('plays the video as the one source when no extract can be played', () => {
    const meeting = { ...audio([chunk(0, 0, 0)]), hasVideo: true, duration: 3130.4 };
    expect(playbackSources(meeting)).toEqual([
      { src: 'meeting-media://local/m1/video', start: 0, duration: 3130.4 },
    ]);
    expect(drivesFromVideo(meeting)).toBe(true);
  });

  it('has no video source for an audio meeting', () => {
    expect(videoSource(audio([chunk(0, 0)]))).toBeNull();
    expect(drivesFromVideo(audio([chunk(0, 0)]))).toBe(false);
  });

  it('has nothing to play without audio', () => {
    expect(playbackSources(audio([]))).toEqual([]);
  });
});

describe('timelineEnd', () => {
  it('covers the last extract and the recorded duration', () => {
    expect(timelineEnd(three, 181.5)).toBe(181.5);
    expect(timelineEnd(three, 100)).toBe(180);
    expect(timelineEnd([], 42)).toBe(42);
    expect(timelineEnd([], Number.NaN)).toBe(0);
  });
});

describe('locate', () => {
  it.each([
    [0, 0, 0],
    [30, 0, 30],
    [60, 1, 0],
    [150, 2, 30],
    [179.5, 2, 59.5],
    [180, 2, 60],
    [500, 2, 60],
    [-4, 0, 0],
    [Number.NaN, 0, 0],
  ])('finds %s s in extract %s at %s s', (at, position, offset) => {
    expect(locate(three, at)).toEqual({ position, offset });
  });

  it('jumps over a missing minute to the next extract', () => {
    const gap = playbackSources(audio([chunk(0, 0), chunk(2, 120)]));
    expect(locate(gap, 59.5)).toEqual({ position: 0, offset: 59.5 });
    expect(locate(gap, 90)).toEqual({ position: 1, offset: 0 });
    expect(locate(gap, 150)).toEqual({ position: 1, offset: 30 });
  });

  it('starts at the first extract when the recording began late', () => {
    const late = playbackSources(audio([chunk(0, 5)]));
    expect(locate(late, 2)).toEqual({ position: 0, offset: 0 });
  });

  it('crosses the tenth of a second between two real extracts', () => {
    const real = playbackSources(
      audio([chunk(0, 0, 60.2), chunk(1, 60.3, 60), chunk(2, 120.4, 61.1)], 181.5),
    );
    expect(locate(real, 60.25)).toEqual({ position: 1, offset: 0 });
    const inside = locate(real, 150);
    expect(inside?.position).toBe(2);
    expect(inside?.offset).toBeCloseTo(29.6);
  });

  it('has no target without sources', () => {
    expect(locate([], 10)).toBeNull();
  });
});

describe('timelineTime', () => {
  const second: PlaybackSource = {
    src: 'meeting-media://local/m1/audio/1',
    start: 60,
    duration: 60,
  };

  it.each([
    [0, 60],
    [12, 72],
    [60, 120],
    [75, 120],
    [-1, 60],
    [Number.NaN, 60],
  ])('maps %s s in the extract to %s s in the meeting', (currentTime, at) => {
    expect(timelineTime(second, currentTime)).toBe(at);
  });
});

describe('resumePoint', () => {
  const base = { sources: three, position: 0, at: 30, duration: 180, failed: false };

  it('carries on where playback stopped', () => {
    expect(resumePoint(base)).toBeNull();
  });

  it('starts over after the end', () => {
    expect(resumePoint({ ...base, position: 2, at: 180 })).toBe(0);
  });

  it('skips an extract that cannot be read', () => {
    expect(resumePoint({ ...base, position: 1, at: 60, failed: true })).toBe(120);
  });

  it('tries the last extract again when nothing follows', () => {
    expect(resumePoint({ ...base, position: 2, at: 120, failed: true })).toBe(120);
  });
});
