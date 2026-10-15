import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEVEL_ATTACK } from './level-scale';
import { RecordingFeed, type LevelSource } from './recording-feed';

/** A steady tone whose RMS is `rms`: a square wave of that amplitude. */
function fakeSource(rms: number): LevelSource & { paused: boolean } {
  return {
    paused: false,
    analyser: {
      fftSize: 4,
      getFloatTimeDomainData: (data: Float32Array) => {
        data.forEach((_, index) => (data[index] = index % 2 ? rms : -rms));
      },
    },
  };
}

// -35 dBFS, normal speech: half way up the meter once settled.
const SPEECH = 10 ** (-35 / 20);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RecordingFeed', () => {
  it('sends the level ten times a second, rising fast towards the speech level', () => {
    const send = vi.fn();
    const feed = new RecordingFeed(fakeSource(SPEECH), send);
    feed.start();
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenLastCalledWith(expect.closeTo(0.5 * LEVEL_ATTACK, 5));
    vi.advanceTimersByTime(900);
    expect(send).toHaveBeenCalledTimes(10);
    expect(send).toHaveBeenLastCalledWith(expect.closeTo(0.5, 3));
    feed.stop();
  });

  it('sends silence at once while paused, and reports no signal meanwhile', () => {
    const send = vi.fn();
    const source = fakeSource(0.5);
    source.paused = true;
    const feed = new RecordingFeed(source, send);
    const signal = vi.fn();
    feed.onSignal(signal);
    feed.start();
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledWith(0);
    expect(signal).not.toHaveBeenCalled();
    feed.stop();
  });

  it('tells a quiet room from digital silence', () => {
    const quiet = new RecordingFeed(fakeSource(10 ** (-70 / 20)), vi.fn());
    const silent = new RecordingFeed(fakeSource(0), vi.fn());
    const levels: number[] = [];
    const signals: boolean[] = [];
    quiet.onLevel((level) => levels.push(level));
    quiet.onSignal((present) => signals.push(present));
    silent.onSignal((present) => signals.push(present));
    quiet.start();
    silent.start();
    vi.advanceTimersByTime(100);
    expect(levels).toEqual([0]);
    expect(signals).toEqual([true, false]);
    quiet.stop();
    silent.stop();
  });

  it('tells its listeners until they leave', () => {
    const feed = new RecordingFeed(fakeSource(1), vi.fn());
    const seen: number[] = [];
    const leave = feed.onLevel((level) => seen.push(level));
    feed.start();
    vi.advanceTimersByTime(200);
    leave();
    vi.advanceTimersByTime(500);
    expect(seen).toHaveLength(2);
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
    const feed = new RecordingFeed(fakeSource(0.1), send);
    const seen: number[] = [];
    feed.onLevel((level) => seen.push(level));
    feed.start();
    vi.advanceTimersByTime(300);
    expect(seen).toHaveLength(3);
    feed.stop();
  });
});
