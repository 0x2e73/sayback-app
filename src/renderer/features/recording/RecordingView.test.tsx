// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../../../shared/contracts';
import type { CaptureSession } from './capture-session';
import { RecordingView } from './RecordingView';

afterEach(cleanup);

function fakeCapture(changes: Partial<Record<'paused' | 'elapsed', number | boolean>> = {}) {
  return {
    elapsed: 3725,
    paused: false,
    displayStream: null,
    source: undefined,
    meeting: { title: 'Revue du vendredi' },
    analyser: { frequencyBinCount: 4, getByteFrequencyData: () => {} },
    togglePause: vi.fn(),
    onPauseChange: () => () => {},
    ...changes,
  } as unknown as CaptureSession;
}

const api = { sendLevel: vi.fn() } as unknown as DesktopApi;

function view(props: { stopping?: boolean; failed?: boolean; capture?: CaptureSession } = {}) {
  const onStop = vi.fn();
  const onOpenInterrupted = vi.fn();
  render(
    <RecordingView
      api={api}
      capture={props.capture ?? fakeCapture()}
      onStop={onStop}
      stopping={props.stopping ?? false}
      failed={props.failed ?? false}
      onOpenInterrupted={onOpenInterrupted}
    />,
  );
  return { onStop, onOpenInterrupted };
}

it('shows the title, the running state and the two-hour limit', () => {
  view();
  expect(screen.getByRole('heading', { level: 1, name: 'Revue du vendredi' })).toBeInTheDocument();
  expect(screen.getByText('Enregistrement en cours')).toBeInTheDocument();
  expect(
    screen.getByText('L’enregistrement s’arrête de lui-même au bout de 2 heures.'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
});

it('names the pause and offers to resume', async () => {
  const capture = fakeCapture({ paused: true });
  view({ capture });
  expect(screen.getByText('En pause')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Reprendre' }));
  expect(capture.togglePause).toHaveBeenCalledOnce();
});

it('stops from the main action', async () => {
  const { onStop } = view();
  await userEvent.click(screen.getByRole('button', { name: 'Terminer la réunion' }));
  expect(onStop).toHaveBeenCalledOnce();
});

it('shows the finalization and freezes the actions while stopping', () => {
  view({ stopping: true });
  expect(screen.getByText('Finalisation…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Terminer la réunion' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
});

it('opens the meeting from the interruption, not by stopping again', async () => {
  const { onStop, onOpenInterrupted } = view({ failed: true });
  expect(screen.queryByRole('button', { name: 'Terminer la réunion' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Ouvrir la réunion' }));
  expect(onOpenInterrupted).toHaveBeenCalledOnce();
  expect(onStop).not.toHaveBeenCalled();
});

it('says what was kept when the recording broke off', () => {
  view({ failed: true, stopping: true });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'L’enregistrement s’est interrompu. Ce qui a été capturé est conservé.',
  );
  expect(screen.getByRole('button', { name: 'Ouvrir la réunion' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
});
