// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../shared/contracts';
import type { RecordingRequest } from '../shared/recording-state';
import { App } from './App';
import { startFromDialog } from './new-meeting-harness';
import { apiFor, meetingFixture, ok, settings } from './test-api';

const capture = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('./features/recording/capture-session', () => ({
  CaptureSession: { start: capture.start },
}));

const finished = meetingFixture('rec', 'Revue du vendredi', '2026-10-14T09:00:00Z');

class FakeSession {
  elapsed = 90;
  paused = false;
  displayStream = null;
  source = undefined;
  meeting = { ...finished, status: 'recording' as const };
  analyser = { frequencyBinCount: 4, getByteFrequencyData: () => {} };
  stop = vi.fn(async () => finished);
  pauseListeners = new Set<() => void>();
  togglePause = vi.fn(() => {
    this.paused = !this.paused;
    this.pauseListeners.forEach((listener) => listener());
  });
  onPauseChange(listener: () => void) {
    this.pauseListeners.add(listener);
    return () => this.pauseListeners.delete(listener);
  }
  onSourceChange = () => () => false;
  sourceVersion = 0;
}

interface Fixture {
  api: DesktopApi;
  announce: ReturnType<typeof vi.fn>;
  unsubscribed: ReturnType<typeof vi.fn>;
  newRecording(): void;
  request(request: RecordingRequest): void;
}

function menuBarApi(): Fixture {
  const listeners: { create(): void; request(request: RecordingRequest): void } = {
    create: () => {},
    request: () => {},
  };
  const announce = vi.fn(() => ok(undefined));
  const unsubscribed = vi.fn();
  const api = apiFor([]);
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
  api.getSources = () =>
    ok([{ id: 'screen:1:0', name: 'Écran', thumbnail: 'data:image/png;base64,a' }]);
  api.processMeeting = () => ok({ ...finished, status: 'ready' });
  api.announceRecordingState = announce;
  api.onMenuBarNewRecording = (listener) => {
    listeners.create = listener;
    return unsubscribed;
  };
  api.onRecordingRequest = (listener) => {
    listeners.request = listener;
    return unsubscribed;
  };
  return {
    api,
    announce,
    unsubscribed,
    newRecording: () => act(() => listeners.create()),
    request: (request) => act(() => listeners.request(request)),
  };
}

let session: FakeSession;
beforeEach(() => {
  session = new FakeSession();
  capture.start.mockReset();
  capture.start.mockResolvedValue(session);
});
afterEach(cleanup);

describe('Menu bar events in the page', () => {
  it('opens the new meeting dialog on « Nouvel enregistrement… »', async () => {
    const menu = menuBarApi();
    render(<App api={menu.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    expect(screen.queryByRole('dialog', { name: 'Nouvelle réunion' })).not.toBeInTheDocument();
    menu.newRecording();
    expect(await screen.findByRole('dialog', { name: 'Nouvelle réunion' })).toBeInTheDocument();
  });

  it('announces the recording, stops it on « Arrêter l’enregistrement », then announces the end', async () => {
    const user = userEvent.setup();
    const menu = menuBarApi();
    render(<App api={menu.api} />);
    expect(menu.announce).toHaveBeenCalledWith({ recording: false });
    menu.newRecording();
    await startFromDialog(user, 'Revue du vendredi');
    await waitFor(() =>
      expect(menu.announce).toHaveBeenLastCalledWith({
        recording: true,
        elapsed: 90,
        paused: false,
        stopping: false,
      }),
    );
    menu.request('stop');
    await waitFor(() => expect(session.stop).toHaveBeenCalledOnce());
    await waitFor(() => expect(menu.announce).toHaveBeenLastCalledWith({ recording: false }));
  });

  it('announces every pause and resume with the time recorded so far', async () => {
    const user = userEvent.setup();
    const menu = menuBarApi();
    render(<App api={menu.api} />);
    menu.newRecording();
    await startFromDialog(user, 'Revue du vendredi');
    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(menu.announce).toHaveBeenLastCalledWith({
      recording: true,
      elapsed: 90,
      paused: true,
      stopping: false,
    });
    await user.click(screen.getByRole('button', { name: 'Reprendre' }));
    expect(menu.announce).toHaveBeenLastCalledWith({
      recording: true,
      elapsed: 90,
      paused: false,
      stopping: false,
    });
  });

  it('announces the closing of the recording until its files are finished', async () => {
    const user = userEvent.setup();
    const menu = menuBarApi();
    let finish: (meeting: typeof finished) => void = () => {};
    session.stop.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    render(<App api={menu.api} />);
    menu.newRecording();
    await startFromDialog(user, 'Revue du vendredi');
    await user.click(await screen.findByRole('button', { name: 'Terminer la réunion' }));
    await waitFor(() =>
      expect(menu.announce).toHaveBeenLastCalledWith(expect.objectContaining({ stopping: true })),
    );
    await act(async () => finish(finished));
    await waitFor(() => expect(menu.announce).toHaveBeenLastCalledWith({ recording: false }));
  });

  it('pauses and resumes on request, and the recording view follows', async () => {
    const user = userEvent.setup();
    const menu = menuBarApi();
    render(<App api={menu.api} />);
    menu.newRecording();
    await startFromDialog(user, 'Revue du vendredi');
    await screen.findByRole('button', { name: 'Pause' });
    menu.request('pause');
    menu.request('pause');
    expect(session.togglePause).toHaveBeenCalledOnce();
    expect(screen.getByText('En pause')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reprendre' })).toBeInTheDocument();
    menu.request('resume');
    menu.request('resume');
    expect(session.togglePause).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it.each(['pause', 'resume', 'stop'] as const)(
    'ignores a %s request when nothing is recording',
    async (request) => {
      const menu = menuBarApi();
      render(<App api={menu.api} />);
      await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
      expect(() => menu.request(request)).not.toThrow();
      expect(session.stop).not.toHaveBeenCalled();
      expect(session.togglePause).not.toHaveBeenCalled();
    },
  );

  it('stops listening when the page unmounts', async () => {
    const menu = menuBarApi();
    const { unmount } = render(<App api={menu.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    unmount();
    expect(menu.unsubscribed).toHaveBeenCalledTimes(2);
  });
});
