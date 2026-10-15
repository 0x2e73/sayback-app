import { describe, expect, it, vi } from 'vitest';
import type { RegisterHandler } from './ipc';
import {
  createRecordingStateHub,
  registerRecordingState,
  type RecordingPage,
  type RecordingSnapshot,
} from './recording-state-hub';

const running = { recording: true, elapsed: 10, paused: false, stopping: false } as const;

function fakeClock(start = 1_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

function fakePage() {
  const listeners = new Map<string, () => void>();
  const page: RecordingPage = {
    on: (event, listener) => listeners.set(event, listener),
  };
  return { page, fire: (event: string) => listeners.get(event)?.() };
}

describe('createRecordingStateHub', () => {
  it('starts at rest', () => {
    const hub = createRecordingStateHub(fakeClock().now);
    expect(hub.current().state).toEqual({ recording: false });
    expect(hub.elapsed()).toBe(0);
  });

  it('stamps each state with the monotonic clock and tells every subscriber', () => {
    const clock = fakeClock();
    const hub = createRecordingStateHub(clock.now);
    const seen: RecordingSnapshot[] = [];
    hub.subscribe((snapshot) => seen.push(snapshot));
    clock.advance(500);
    hub.publish(running);
    expect(seen).toEqual([{ state: running, receivedAt: 1_500 }]);
    clock.advance(2_000);
    expect(hub.elapsed()).toBe(12);
  });

  it('freezes the elapsed time during a pause and while the recording closes', () => {
    const clock = fakeClock();
    const hub = createRecordingStateHub(clock.now);
    hub.publish({ ...running, paused: true });
    clock.advance(60_000);
    expect(hub.elapsed()).toBe(10);
    hub.publish({ ...running, elapsed: 14, stopping: true });
    clock.advance(5_000);
    expect(hub.elapsed()).toBe(14);
    expect(hub.current().state).toMatchObject({ stopping: true });
  });

  it('stops telling a subscriber that left', () => {
    const hub = createRecordingStateHub(fakeClock().now);
    const listener = vi.fn();
    const leave = hub.subscribe(listener);
    leave();
    hub.publish(running);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each(['render-process-gone', 'destroyed'])(
    'goes back to rest when the page is %s during a recording',
    (event) => {
      const hub = createRecordingStateHub(fakeClock().now);
      const { page, fire } = fakePage();
      const listener = vi.fn();
      hub.watch(page);
      hub.publish(running);
      hub.subscribe(listener);
      fire(event);
      expect(hub.current().state).toEqual({ recording: false });
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ state: { recording: false } }),
      );
    },
  );

  it('stays quiet when the page goes away at rest', () => {
    const hub = createRecordingStateHub(fakeClock().now);
    const { page, fire } = fakePage();
    const listener = vi.fn();
    hub.watch(page);
    hub.subscribe(listener);
    fire('destroyed');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('registerRecordingState', () => {
  function registered() {
    const publish = vi.fn();
    const ready = vi.fn();
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const handle: RegisterHandler = (channel, action) => {
      handlers.set(channel, action);
    };
    registerRecordingState(handle, { publish }, ready);
    const call = (input: unknown) => handlers.get('recording:state')?.(input);
    return { publish, ready, call };
  }

  it('publishes a valid announcement and tells the page is ready', () => {
    const { publish, ready, call } = registered();
    call({ recording: true, elapsed: 12.5, paused: true, stopping: false });
    call({ recording: false });
    expect(publish.mock.calls).toEqual([
      [{ recording: true, elapsed: 12.5, paused: true, stopping: false }],
      [{ recording: false }],
    ]);
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
    null,
    {},
    'recording',
    { recording: 'yes' },
    { recording: true },
    { recording: true, elapsed: 3, paused: false },
    { recording: true, paused: false, stopping: false },
    { recording: true, elapsed: -1, paused: false, stopping: false },
    { recording: true, elapsed: '3', paused: false, stopping: false },
    { recording: true, elapsed: Infinity, paused: false, stopping: false },
    { recording: true, elapsed: 1e9, paused: false, stopping: false },
    { recording: true, elapsed: 3, paused: 'no', stopping: false },
    { recording: true, elapsed: 3, paused: false, stopping: 'yes' },
  ])('refuses %j without publishing', (input) => {
    const { publish, ready, call } = registered();
    expect(() => call(input)).toThrow();
    expect(publish).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();
  });
});
