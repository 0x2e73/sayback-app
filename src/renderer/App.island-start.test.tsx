// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../shared/contracts';
import type { RecordingStartRequest } from '../shared/recording-start';
import { App } from './App';
import { CaptureFailure, type CaptureOptions } from './features/recording/capture-resources';
import { apiFor, meetingFixture, ok, settings } from './test-api';

const capture = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('./features/recording/capture-session', () => ({
  CaptureSession: { start: capture.start },
}));

const finished = meetingFixture('rec', 'Réunion du 15 octobre, 11 h 42', '2026-10-15T09:42:00Z');
const main = { id: 'screen:1:0', name: 'Écran 1', thumbnail: '', primary: true };

const fakeSession = () => ({
  elapsed: 0,
  paused: false,
  displayStream: null,
  source: main,
  audioSources: { microphone: true, systemAudio: true },
  meeting: { ...finished, status: 'recording' as const },
  analyser: { frequencyBinCount: 4, getByteFrequencyData: () => {} },
  stop: vi.fn(async () => finished),
  onPauseChange: () => () => {},
});

const request: RecordingStartRequest = {
  id: 'start-1',
  deadline: Date.now() + 195_000,
  title: 'Réunion du 15 octobre, 11 h 42',
  selection: { microphone: true, systemAudio: true, screen: true, screenId: 'screen:1:0' },
};

interface Fixture {
  api: DesktopApi;
  order: string[];
  answer: ReturnType<typeof vi.fn<DesktopApi['answerStartRequest']>>;
  acknowledge: ReturnType<typeof vi.fn<DesktopApi['acknowledgeStartRequest']>>;
  announce: ReturnType<typeof vi.fn<DesktopApi['announceRecordingState']>>;
  remember: ReturnType<typeof vi.fn<DesktopApi['setCapturePrefs']>>;
  ask(request: RecordingStartRequest): Promise<void>;
}

function islandStartApi(): Fixture {
  let listener: (request: RecordingStartRequest) => void = () => {};
  const order: string[] = [];
  const api = apiFor([]);
  api.selectSource = vi.fn<DesktopApi['selectSource']>(() => {
    order.push('select');
    return ok(undefined);
  });
  api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
  api.getSources = () => {
    order.push('sources');
    return ok([main]);
  };
  const announce = vi.fn<DesktopApi['announceRecordingState']>(() => {
    order.push('announce');
    return ok(undefined);
  });
  api.announceRecordingState = announce;
  const acknowledge = vi.fn<DesktopApi['acknowledgeStartRequest']>((id) => {
    order.push(`ack ${id}`);
  });
  api.acknowledgeStartRequest = acknowledge;
  api.onStartRequest = (next) => {
    order.push('subscribe');
    listener = next;
    return () => {};
  };
  const answer = vi.fn<DesktopApi['answerStartRequest']>(() => ok(undefined));
  const remember = vi.fn<DesktopApi['setCapturePrefs']>(() => ok(undefined));
  api.answerStartRequest = answer;
  api.setCapturePrefs = remember;
  return {
    api,
    order,
    answer,
    acknowledge,
    announce,
    remember,
    ask: (next) => act(async () => listener(next)),
  };
}

beforeEach(() => {
  capture.start.mockReset();
  capture.start.mockImplementation(async () => fakeSession());
});
afterEach(cleanup);

describe('a start asked by the island', () => {
  it('listens before telling the main process the page is there', async () => {
    const island = islandStartApi();
    render(<App api={island.api} />);
    await waitFor(() => expect(island.order).toContain('announce'));
    expect(island.order[0]).toBe('subscribe');
  });

  it('starts the recording, remembers the choices, then answers ok', async () => {
    const island = islandStartApi();
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask(request);
    await waitFor(() => expect(island.answer).toHaveBeenCalledWith('start-1', { ok: true }));
    expect(island.api.selectSource).toHaveBeenCalledWith('screen:1:0', true);
    expect(capture.start).toHaveBeenCalledWith(
      island.api,
      'Réunion du 15 octobre, 11 h 42',
      expect.objectContaining({ microphone: true, systemAudio: true, screen: true, source: main }),
    );
    expect(island.remember).toHaveBeenCalledWith(
      expect.objectContaining({ screen: true, screenId: 'screen:1:0' }),
    );
    expect(screen.queryByRole('dialog', { name: 'Nouvelle réunion' })).not.toBeInTheDocument();
  });

  it('answers screen-denied when the capture is refused and the screens are gone', async () => {
    const island = islandStartApi();
    const listings = [ok([main])];
    island.api.getSources = () => listings.shift() ?? ok([]);
    island.api.getCapturePermission = () => ok('denied');
    capture.start.mockRejectedValueOnce(new CaptureFailure('screen', 'NotAllowedError'));
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask(request);
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-1', { ok: false, error: 'screen-denied' }),
    );
    expect(island.remember).not.toHaveBeenCalled();
  });

  it('acknowledges the request before anything is awaited', async () => {
    const island = islandStartApi();
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    island.order.length = 0;
    await island.ask(request);
    expect(island.order[0]).toBe('ack start-1');
    await waitFor(() => expect(island.answer).toHaveBeenCalledWith('start-1', { ok: true }));
  });

  it('stops a capture that opens after the deadline and answers failed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const island = islandStartApi();
    const late = fakeSession();
    let open: () => void = () => {};
    capture.start.mockImplementationOnce(
      () => new Promise((resolve) => (open = () => resolve(late))),
    );
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask({ ...request, deadline: Date.now() + 195_000 });
    await waitFor(() => expect(capture.start).toHaveBeenCalledOnce());
    vi.setSystemTime(Date.now() + 196_000);
    await act(async () => open());
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-1', { ok: false, error: 'failed' }),
    );
    expect(late.stop).toHaveBeenCalledOnce();
    expect(island.remember).not.toHaveBeenCalled();
    expect(island.announce).not.toHaveBeenCalledWith(expect.objectContaining({ recording: true }));
    vi.useRealTimers();
  });

  it('answers failed when the screen cannot be chosen, and remembers nothing', async () => {
    const island = islandStartApi();
    island.api.selectSource = () => Promise.resolve({ ok: false, error: 'Source invalide.' });
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask(request);
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-1', { ok: false, error: 'failed' }),
    );
    expect(capture.start).not.toHaveBeenCalled();
    expect(island.remember).not.toHaveBeenCalled();
  });

  it('refuses a start during the welcome', async () => {
    const island = islandStartApi();
    island.api.getSettings = () => ok({ ...settings, onboardingCompleted: false });
    render(<App api={island.api} />);
    await waitFor(() => expect(island.order).toContain('announce'));
    await island.ask(request);
    expect(island.acknowledge).toHaveBeenCalledWith('start-1');
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-1', { ok: false, error: 'failed' }),
    );
    expect(capture.start).not.toHaveBeenCalled();
  });

  it('answers failed while a recording already runs', async () => {
    const island = islandStartApi();
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask(request);
    await waitFor(() => expect(island.answer).toHaveBeenCalledWith('start-1', { ok: true }));
    await island.ask({ ...request, id: 'start-2' });
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-2', { ok: false, error: 'failed' }),
    );
    expect(capture.start).toHaveBeenCalledOnce();
  });

  it('answers interrupted while an interrupted recording waits to be seen', async () => {
    const island = islandStartApi();
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask(request);
    await waitFor(() => expect(island.answer).toHaveBeenCalledWith('start-1', { ok: true }));
    const [, , options] = capture.start.mock.calls[0] as [unknown, unknown, CaptureOptions];
    await act(async () => options.onFailure(new Error('Le microphone s’est arrêté.')));
    await island.ask({ ...request, id: 'start-2' });
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-2', { ok: false, error: 'interrupted' }),
    );
    expect(capture.start).toHaveBeenCalledOnce();
  });

  it('answers failed to a second request that arrives during the first start', async () => {
    const island = islandStartApi();
    let open: () => void = () => {};
    capture.start.mockImplementationOnce(
      () => new Promise((resolve) => (open = () => resolve(fakeSession()))),
    );
    render(<App api={island.api} />);
    await screen.findByRole('button', { name: 'Démarrer l’enregistrement' });
    await island.ask(request);
    await island.ask({ ...request, id: 'start-2' });
    await waitFor(() =>
      expect(island.answer).toHaveBeenCalledWith('start-2', { ok: false, error: 'failed' }),
    );
    await act(async () => open());
    await waitFor(() => expect(island.answer).toHaveBeenCalledWith('start-1', { ok: true }));
    expect(capture.start).toHaveBeenCalledOnce();
    // Refused before choosing a source: main keeps the first start's screen.
    expect(island.api.selectSource).toHaveBeenCalledOnce();
  });
});
