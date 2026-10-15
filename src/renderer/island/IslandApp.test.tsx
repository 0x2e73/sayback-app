// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recording, shape, shown } from './island-fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('IslandApp', () => {
  it('counts the chrono on from the announced time', async () => {
    await shown({ recording: recording(), expanded: true, shape, mode: 'recording' });
    expect(screen.getByRole('timer')).toHaveTextContent('00:12');
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:14');
  });

  it('freezes the chrono while paused', async () => {
    const island = await shown({
      recording: recording(),
      expanded: true,
      shape,
      mode: 'recording',
    });
    island.push({
      recording: recording({ elapsed: 20, paused: true }),
      expanded: true,
      shape,
      mode: 'recording',
    });
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:20');
    expect(screen.getByText('En pause')).toBeInTheDocument();
  });

  it('keeps its buttons out of reach until it opens', async () => {
    const island = await shown({
      recording: recording(),
      expanded: false,
      shape,
      mode: 'recording',
    });
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    island.expand(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByText('Le texte en direct arrive bientôt.')).toBeInTheDocument();
  });

  it('asks the main process to pause, resume and stop', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const island = await shown({
      recording: recording(),
      expanded: true,
      shape,
      mode: 'recording',
    });
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(island.request).toHaveBeenLastCalledWith('pause');
    island.push({
      recording: recording({ paused: true }),
      expanded: true,
      shape,
      mode: 'recording',
    });
    await user.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(island.request).toHaveBeenLastCalledWith('resume');
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(island.request).not.toHaveBeenCalledWith('stop');
    await user.click(screen.getByRole('button', { name: 'Confirmer l’arrêt' }));
    expect(island.request).toHaveBeenLastCalledWith('stop');
  });

  it('asks for a second click within 3 s before stopping', async () => {
    const island = await shown({
      recording: recording(),
      expanded: true,
      shape,
      mode: 'recording',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(screen.getByRole('button', { name: 'Confirmer l’arrêt' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(screen.queryByRole('button', { name: 'Confirmer l’arrêt' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(island.request).not.toHaveBeenCalled();
  });

  it('forgets a pending confirmation when it closes', async () => {
    const island = await shown({
      recording: recording(),
      expanded: true,
      shape,
      mode: 'recording',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    island.expand(false);
    island.expand(true);
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument();
  });

  it('locks pause and shows the end in progress while the recording closes', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const island = await shown({
      recording: recording({ stopping: true }),
      expanded: true,
      shape,
      mode: 'recording',
    });
    expect(screen.getByText('Arrêt en cours…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(island.request).not.toHaveBeenCalled();
  });

  it('raises the level bars as the level arrives', async () => {
    const island = await shown({
      recording: recording(),
      expanded: false,
      shape,
      mode: 'recording',
    });
    const bars = [...screen.getByTestId('level-meter').children] as HTMLElement[];
    expect(bars).toHaveLength(4);
    island.level(1);
    expect(bars[1]?.style.transform).toBe('scaleY(1.000)');
  });

  it('draws nothing once the recording is over', async () => {
    const island = await shown({
      recording: recording(),
      expanded: false,
      shape,
      mode: 'recording',
    });
    island.push({ recording: { recording: false }, expanded: false, shape, mode: 'recording' });
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});
