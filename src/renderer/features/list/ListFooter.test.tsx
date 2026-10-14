// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ListFooter } from './ListFooter';

const update = { status: null, busy: false, onInstall: vi.fn() };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('offers the settings and the recording action', () => {
  const onNew = vi.fn();
  const onToggleSettings = vi.fn();
  render(
    <ListFooter
      recording={null}
      update={update}
      settingsOpen
      onToggleSettings={onToggleSettings}
      onNew={onNew}
      onShowRecording={vi.fn()}
    />,
  );
  const settings = screen.getByRole('button', { name: 'Paramètres' });
  expect(settings).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(settings);
  fireEvent.click(screen.getByRole('button', { name: 'Démarrer l’enregistrement' }));
  expect(onToggleSettings).toHaveBeenCalledOnce();
  expect(onNew).toHaveBeenCalledOnce();
});

it('shows the running recording and keeps the settings shut', () => {
  vi.useFakeTimers();
  const clock = { elapsed: 0 };
  const onShowRecording = vi.fn();
  render(
    <ListFooter
      recording={clock}
      update={update}
      settingsOpen={false}
      onToggleSettings={vi.fn()}
      onNew={vi.fn()}
      onShowRecording={onShowRecording}
    />,
  );
  clock.elapsed = 723;
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
  fireEvent.click(screen.getByRole('button', { name: 'En cours · 12:03' }));
  expect(onShowRecording).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Paramètres' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Démarrer l’enregistrement' })).toBeNull();
});
