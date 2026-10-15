import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Point } from './island-geometry';
import {
  hoverFor,
  nextHover,
  READY_HOVER,
  RECORDING_HOVER,
  startIslandHover,
  type HoverArea,
  type HoverState,
} from './island-hover';

const compact = { x: 706, y: 0, width: 388, height: 38 };
const area: HoverArea = {
  open: { x: 620, y: 0, width: 560, height: 240 },
  reach: { x: 698, y: 0, width: 404, height: 46 },
};
const inCompact = { x: 900, y: 10 };
const besideWing = { x: 700, y: 42 };
const inOpenOnly = { x: 640, y: 200 };
const away = { x: 100, y: 600 };

describe('nextHover', () => {
  it('never opens on hover, even resting on the wings', () => {
    let state = nextHover({ expanded: false }, inCompact, area, 0);
    state = nextHover(state, inCompact, area, 10_000);
    expect(nextHover(state, inOpenOnly, area, 20_000).expanded).toBe(false);
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

describe('nextHover on the ready island', () => {
  const opened: HoverState = { expanded: true, entered: false };

  it('closes 15 s after opening when the cursor never came', () => {
    let state = nextHover(opened, away, area, 0, READY_HOVER);
    state = nextHover(state, away, area, 14_999, READY_HOVER);
    expect(state.expanded).toBe(true);
    expect(nextHover(state, away, area, 15_000, READY_HOVER).expanded).toBe(false);
  });

  it('closes 3 s after the cursor leaves the open shell, once it has been in', () => {
    let state = nextHover(opened, inOpenOnly, area, 0, READY_HOVER);
    state = nextHover(state, away, area, 1_000, READY_HOVER);
    state = nextHover(state, away, area, 3_999, READY_HOVER);
    expect(state.expanded).toBe(true);
    expect(nextHover(state, away, area, 4_000, READY_HOVER).expanded).toBe(false);
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

  it('reads the cursor every 50 ms, ignores the hover and opens on a click', () => {
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
    vi.advanceTimersByTime(2_000);
    expect(changes).toEqual([]);
    hover.expand();
    vi.advanceTimersByTime(1_000);
    cursor = away;
    vi.advanceTimersByTime(250);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(150);
    expect(changes).toEqual([true, false]);
    hover.stop();
  });

  it('says when the closed wings come within reach and when they leave it', () => {
    const reach: boolean[] = [];
    const hover = startIslandHover({
      cursor: () => cursor,
      area: () => area,
      onChange: (expanded) => changes.push(expanded),
      onReach: (reachable) => reach.push(reachable),
      now: () => Date.now(),
    });
    cursor = besideWing;
    vi.advanceTimersByTime(100);
    cursor = inOpenOnly;
    vi.advanceTimersByTime(100);
    cursor = inCompact;
    vi.advanceTimersByTime(100);
    hover.expand();
    vi.advanceTimersByTime(100);
    expect(reach).toEqual([true, false, true, false]);
    hover.stop();
  });

  it('closes at once when asked, once', () => {
    const hover = start();
    hover.expand();
    hover.collapse();
    hover.collapse();
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
    hover.expand();
    cursor = inOpenOnly;
    vi.advanceTimersByTime(100);
    cursor = away;
    vi.advanceTimersByTime(400);
    expect(changes).toEqual([true, false]);
    hover.stop();
    report.mockRestore();
  });

  it('stops reading the cursor once stopped', () => {
    const hover = start();
    hover.expand();
    hover.stop();
    vi.advanceTimersByTime(20_000);
    expect(changes).toEqual([true]);
  });

  it('stays open while held, then counts the whole delay again', () => {
    let held = true;
    const hover = startIslandHover({
      cursor: () => cursor,
      area: () => area,
      onChange: (expanded) => changes.push(expanded),
      delays: READY_HOVER,
      initial: { expanded: true, entered: true },
      hold: () => held,
      now: () => Date.now(),
    });
    vi.advanceTimersByTime(30_000);
    expect(changes).toEqual([]);
    held = false;
    vi.advanceTimersByTime(2_950);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(changes).toEqual([false]);
    hover.stop();
  });

  it('opens at once when asked, then waits for the cursor as an untouched island', () => {
    const hover = start();
    hover.expand();
    hover.expand();
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(14_900);
    expect(changes).toEqual([true]);
    vi.advanceTimersByTime(200);
    expect(changes).toEqual([true, false]);
    hover.stop();
  });

  it('waits while the island has no place on screen', () => {
    const hover = start(() => null);
    hover.expand();
    vi.advanceTimersByTime(20_000);
    expect(changes).toEqual([true]);
    hover.stop();
  });
});

describe('hoverFor', () => {
  const wiring = {
    shells: () => ({ open: area.open, compact }),
    onChange: () => {},
    onReach: () => {},
    hold: () => false,
  };

  it('keeps the open shell and reaches the wings with their margin', () => {
    expect(hoverFor('recording', { expanded: false }, wiring).area()).toEqual(area);
  });

  it('gives each mode its delays', () => {
    expect(hoverFor('recording', { expanded: false }, wiring).delays).toBe(RECORDING_HOVER);
    expect(hoverFor('ready', { expanded: true }, wiring).delays).toBe(READY_HOVER);
  });
});
