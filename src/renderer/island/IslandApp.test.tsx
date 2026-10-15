// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IslandApi } from '../../shared/contracts';
import type { IslandSnapshot } from '../../shared/island';
import type { RecordingState } from '../../shared/recording-state';
import { IslandApp } from './IslandApp';

const shape: IslandSnapshot['shape'] = {
  kind: 'notch',
  barHeight: 38,
  notchWidth: 220,
  compactWidth: 388,
  openWidth: 560,
  openHeight: 240,
};

const recording = (extra: Partial<RecordingState> = {}): RecordingState =>
  ({ recording: true, elapsed: 12, paused: false, stopping: false, ...extra }) as RecordingState;

function fakeIsland(first: IslandSnapshot) {
  const listeners: {
    state(snapshot: IslandSnapshot): void;
    expanded(expanded: boolean): void;
    level: Set<(level: number) => void>;
  } = { state: () => {}, expanded: () => {}, level: new Set() };
  const request = vi.fn<IslandApi['request']>(async () => ({ ok: true, value: undefined }));
  const api: IslandApi = {
    ready: async () => ({ ok: true, value: first }),
    request,
    onState: (listener) => {
      listeners.state = listener;
      return () => {};
    },
    onExpanded: (listener) => {
      listeners.expanded = listener;
      return () => {};
    },
    onLevel: (listener) => {
      listeners.level.add(listener);
      return () => listeners.level.delete(listener);
    },
  };
  return {
    api,
    request,
    push: (snapshot: IslandSnapshot) => act(() => listeners.state(snapshot)),
    expand: (expanded: boolean) => act(() => listeners.expanded(expanded)),
    level: (value: number) => act(() => listeners.level.forEach((listener) => listener(value))),
  };
}

async function shown(snapshot: IslandSnapshot) {
  const island = fakeIsland(snapshot);
  render(<IslandApp api={island.api} now={() => Date.now()} />);
  await act(async () => {});
  return island;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('IslandApp', () => {
  it('counts the chrono on from the announced time', async () => {
    await shown({ recording: recording(), expanded: true, shape });
    expect(screen.getByRole('timer')).toHaveTextContent('00:12');
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:14');
  });

  it('freezes the chrono while paused', async () => {
    const island = await shown({ recording: recording(), expanded: true, shape });
    island.push({ recording: recording({ elapsed: 20, paused: true }), expanded: true, shape });
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(screen.getByText('En pause')).toBeInTheDocument();
  });

  it('keeps its buttons out of reach until it opens', async () => {
    const island = await shown({ recording: recording(), expanded: false, shape });
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    island.expand(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByText('Le texte en direct arrive bientôt.')).toBeInTheDocument();
  });

  it('asks the main process to pause, resume and stop', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const island = await shown({ recording: recording(), expanded: true, shape });
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(island.request).toHaveBeenLastCalledWith('pause');
    island.push({ recording: recording({ paused: true }), expanded: true, shape });
    await user.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(island.request).toHaveBeenLastCalledWith('resume');
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(island.request).toHaveBeenLastCalledWith('stop');
  });

  it('locks pause and shows the end in progress while the recording closes', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const island = await shown({ recording: recording({ stopping: true }), expanded: true, shape });
    expect(screen.getByText('Arrêt en cours…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(island.request).not.toHaveBeenCalled();
  });

  it('raises the level bars as the level arrives', async () => {
    const island = await shown({ recording: recording(), expanded: false, shape });
    const bars = [...screen.getByTestId('level-meter').children] as HTMLElement[];
    expect(bars).toHaveLength(4);
    island.level(1);
    expect(bars[1]?.style.transform).toBe('scaleY(1.000)');
  });

  it('draws nothing once the recording is over', async () => {
    const island = await shown({ recording: recording(), expanded: false, shape });
    island.push({ recording: { recording: false }, expanded: false, shape });
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});
