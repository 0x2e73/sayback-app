import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Point } from './island-geometry';
import { nextHover, startIslandHover, type HoverArea } from './island-hover';

const area: HoverArea = {
  compact: { x: 706, y: 0, width: 388, height: 38 },
  open: { x: 620, y: 0, width: 560, height: 240 },
};
const inCompact = { x: 900, y: 10 };
const inOpenOnly = { x: 640, y: 200 };
const away = { x: 100, y: 600 };

describe('nextHover', () => {
  it('opens after 120 ms in the compact shell', () => {
    let state = nextHover({ expanded: false }, inCompact, area, 0);
    state = nextHover(state, inCompact, area, 119);
    expect(state.expanded).toBe(false);
    expect(nextHover(state, inCompact, area, 120).expanded).toBe(true);
  });

  it('starts counting again when the cursor leaves the compact shell', () => {
    let state = nextHover({ expanded: false }, inCompact, area, 0);
    state = nextHover(state, away, area, 100);
    state = nextHover(state, inCompact, area, 150);
    expect(nextHover(state, inCompact, area, 200).expanded).toBe(false);
  });

  it('never opens from the open area alone', () => {
    const state = nextHover({ expanded: false }, inOpenOnly, area, 0);
    expect(nextHover(state, inOpenOnly, area, 1_000).expanded).toBe(false);
  });

  it('stays open anywhere in the open shell and closes 300 ms after leaving it', () => {
    let state = nextHover({ expanded: true }, inOpenOnly, area, 0);
    state = nextHover(state, away, area, 50);
    state = nextHover(state, away, area, 349);
    expect(state.expanded).toBe(true);
    expect(nextHover(state, away, area, 350).expanded).toBe(false);
  });

  it('cancels the closing when the cursor comes back', () => {
    let state = nextHover({ expanded: true }, away, area, 0);
    state = nextHover(state, inOpenOnly, area, 200);
    state = nextHover(state, away, area, 250);
    expect(nextHover(state, away, area, 500).expanded).toBe(true);
  });
});

describe('startIslandHover', () => {
  let cursor: Point = away;
  const changes: boolean[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    cursor = away;
    changes.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  function start(currentArea: () => HoverArea | null = () => area) {
    return startIslandHover({
      cursor: () => cursor,
      area: currentArea,
      onChange: (expanded) => changes.push(expanded),
      now: () => Date.now(),
    });
  }

  it('reads the cursor every 50 ms and reports each change once', () => {
    const read = vi.fn(() => cursor);
    const hover = startIslandHover({
      cursor: read,
      area: () => area,
      onChange: (expanded) => changes.push(expanded),
      now: () => Date.now(),
    });
    vi.advanceTimersByTime(500);
    expect(read).toHaveBeenCalledTimes(10);
    cursor = inCompact;
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(1_000);
    cursor = away;
    vi.advanceTimersByTime(250);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(150);
    expect(changes).toEqual([true, false]);
    hover.stop();
  });

  it('keeps polling after a failed read, and reports it', () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const hover = startIslandHover({
      cursor: () => {
        if (fail) throw new Error('no cursor');
        return cursor;
      },
      area: () => area,
      onChange: (expanded) => changes.push(expanded),
      now: () => Date.now(),
    });
    expect(() => vi.advanceTimersByTime(50)).not.toThrow();
    expect(report).toHaveBeenCalledOnce();
    fail = false;
    cursor = inCompact;
    vi.advanceTimersByTime(250);
    expect(changes).toEqual([true]);
    hover.stop();
    report.mockRestore();
  });

  it('stops reading the cursor once stopped', () => {
    const hover = start();
    hover.stop();
    cursor = inCompact;
    vi.advanceTimersByTime(1_000);
    expect(changes).toEqual([]);
  });

  it('waits while the island has no place on screen', () => {
    const hover = start(() => null);
    cursor = inCompact;
    vi.advanceTimersByTime(1_000);
    expect(changes).toEqual([]);
    hover.stop();
  });
});
