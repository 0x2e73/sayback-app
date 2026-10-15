import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { levelOf, RecordingFeed, type LevelSource } from './recording-feed';

function fakeSource(value: number): LevelSource & { paused: boolean } {
  return {
    paused: false,
    analyser: {
      frequencyBinCount: 4,
      getByteFrequencyData: (data: Uint8Array) => data.fill(value),
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('measures the mean of the spectrum between 0 and 1', () => {
  expect(levelOf(Uint8Array.from([0, 255, 255, 0]))).toBe(0.5);
  expect(levelOf(new Uint8Array(0))).toBe(0);
});

describe('RecordingFeed', () => {
  it('sends the level ten times a second', () => {
    const send = vi.fn();
    const feed = new RecordingFeed(fakeSource(51), send);
    feed.start();
    vi.advanceTimersByTime(1_000);
    expect(send).toHaveBeenCalledTimes(10);
    expect(send).toHaveBeenLastCalledWith(0.2);
    feed.stop();
  });

  it('sends silence while paused', () => {
    const send = vi.fn();
    const source = fakeSource(200);
    source.paused = true;
    const feed = new RecordingFeed(source, send);
    feed.start();
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledWith(0);
    feed.stop();
  });

  it('tells its listeners until they leave', () => {
    const feed = new RecordingFeed(fakeSource(51), vi.fn());
    const seen: number[] = [];
    const leave = feed.onLevel((level) => seen.push(level));
    feed.start();
    vi.advanceTimersByTime(200);
    leave();
    vi.advanceTimersByTime(500);
    expect(seen).toEqual([0.2, 0.2]);
    feed.stop();
  });

  it('runs one timer when started twice, and none once stopped', () => {
    const send = vi.fn();
    const feed = new RecordingFeed(fakeSource(0), send);
    feed.start();
    feed.start();
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledOnce();
    feed.stop();
    vi.advanceTimersByTime(1_000);
    expect(send).toHaveBeenCalledOnce();
  });

  it('keeps measuring when sending fails', () => {
    const send = vi.fn(() => {
      throw new Error('gone');
    });
    const feed = new RecordingFeed(fakeSource(51), send);
    const seen: number[] = [];
    feed.onLevel((level) => seen.push(level));
    feed.start();
    vi.advanceTimersByTime(300);
    expect(seen).toHaveLength(3);
    feed.stop();
  });
});
