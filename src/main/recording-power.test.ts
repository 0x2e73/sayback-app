import { describe, expect, it, vi } from 'vitest';
import type { RecordingState } from '../shared/recording-state';
import { createRecordingPower, type PowerPorts } from './recording-power';
import { createRecordingStateHub } from './recording-state-hub';

const running: RecordingState = { recording: true, elapsed: 1, paused: false, stopping: false };

function fixture(alive = true) {
  const page = { setBackgroundThrottling: vi.fn(), isDestroyed: () => !alive };
  const ports: PowerPorts = {
    page: () => page,
    blocker: { start: vi.fn(() => 7), stop: vi.fn() },
  };
  const follow = createRecordingPower(ports);
  const announce = (state: RecordingState) => follow({ state, receivedAt: 0 });
  return { page, ports, announce };
}

describe('createRecordingPower', () => {
  it('keeps the page running and the app awake while recording', () => {
    const { page, ports, announce } = fixture();
    announce(running);
    expect(page.setBackgroundThrottling).toHaveBeenCalledWith(false);
    expect(ports.blocker.start).toHaveBeenCalledWith('prevent-app-suspension');
  });

  it('acts once for every state of the same recording', () => {
    const { page, ports, announce } = fixture();
    announce(running);
    announce({ ...running, paused: true } as RecordingState);
    announce({ ...running, stopping: true } as RecordingState);
    expect(page.setBackgroundThrottling).toHaveBeenCalledOnce();
    expect(ports.blocker.start).toHaveBeenCalledOnce();
  });

  it('restores throttling and releases the blocker at the end', () => {
    const { page, ports, announce } = fixture();
    announce(running);
    announce({ recording: false });
    expect(page.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    expect(ports.blocker.stop).toHaveBeenCalledWith(7);
  });

  it('releases the blocker even when the page is already gone', () => {
    const page = { setBackgroundThrottling: vi.fn(), isDestroyed: () => false };
    let current: typeof page | null = page;
    const blocker = { start: vi.fn(() => 3), stop: vi.fn() };
    const follow = createRecordingPower({ page: () => current, blocker });
    follow({ state: running, receivedAt: 0 });
    current = null;
    follow({ state: { recording: false }, receivedAt: 0 });
    expect(blocker.stop).toHaveBeenCalledWith(3);
    expect(page.setBackgroundThrottling).toHaveBeenCalledOnce();
  });

  it('never touches a destroyed page', () => {
    const { page, ports, announce } = fixture(false);
    announce(running);
    announce({ recording: false });
    expect(page.setBackgroundThrottling).not.toHaveBeenCalled();
    expect(ports.blocker.stop).toHaveBeenCalledWith(7);
  });

  it('does nothing at rest', () => {
    const { page, ports, announce } = fixture();
    announce({ recording: false });
    expect(page.setBackgroundThrottling).not.toHaveBeenCalled();
    expect(ports.blocker.stop).not.toHaveBeenCalled();
  });
});

describe('createRecordingPower on the recording state hub', () => {
  function wired() {
    const listeners = new Map<string, () => void>();
    let destroyed = false;
    const page = {
      setBackgroundThrottling: vi.fn(),
      isDestroyed: () => destroyed,
      on: (event: string, listener: () => void) => listeners.set(event, listener),
    };
    const blocker = { start: vi.fn(() => 5), stop: vi.fn() };
    const hub = createRecordingStateHub(() => 0);
    hub.watch(page);
    hub.subscribe(createRecordingPower({ page: () => page, blocker }));
    const fire = (event: string) => {
      if (event === 'destroyed') destroyed = true;
      listeners.get(event)?.();
    };
    return { hub, page, blocker, fire };
  }

  it('runs the hidden page at full speed while recording, and restores it on stop', () => {
    const { hub, page, blocker } = wired();
    hub.publish(running);
    expect(page.setBackgroundThrottling).toHaveBeenLastCalledWith(false);
    hub.publish({ recording: false });
    expect(page.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    expect(blocker.stop).toHaveBeenCalledWith(5);
  });

  it('restores throttling when the page crashes during a recording', () => {
    const { hub, page, blocker, fire } = wired();
    hub.publish(running);
    fire('render-process-gone');
    expect(page.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    expect(blocker.stop).toHaveBeenCalledWith(5);
  });

  it('lets the app sleep again when the window is destroyed during a recording', () => {
    const { hub, page, blocker, fire } = wired();
    hub.publish(running);
    fire('destroyed');
    expect(blocker.stop).toHaveBeenCalledWith(5);
    expect(page.setBackgroundThrottling).toHaveBeenCalledOnce();
  });
});
