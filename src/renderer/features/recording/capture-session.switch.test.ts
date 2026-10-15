// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { CaptureSource, DesktopApi, Meeting } from '../../../shared/contracts';
import { CaptureSession } from './capture-session';
import { display, displayTracks, FakeRecorder, FakeStream } from './capture-session.test-support';
import { INERT_LIVE_TAP } from './live-tap';

const resources = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('./capture-resources', () => ({ openCaptureResources: resources.open }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resources.open.mockReset();
  displayTracks.length = 0;
  FakeRecorder.made.length = 0;
});

/** A screen capture running on a first display, the next one handed out by getDisplayMedia. */
async function startWithDisplay(getDisplayMedia: () => Promise<MediaStream>) {
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const captureResources = {
    display: display(),
    audio: new FakeStream([{}]) as unknown as MediaStream,
    analyser: {},
    live: INERT_LIVE_TAP,
    replaceDisplay: vi.fn(async (next: MediaStream) => {
      captureResources.display = next;
    }),
    dispose: vi.fn(async () => undefined),
  };
  resources.open.mockResolvedValue(captureResources);
  const meeting = { id: 'meeting-1' } as Meeting;
  const api = {
    createMeeting: vi.fn(async () => ({ ok: true, value: meeting })),
    selectSource: vi.fn(async () => ({ ok: true, value: undefined })),
    saveMedia: vi.fn(async () => ({ ok: true, value: undefined })),
    finishMeeting: vi.fn(async () => ({ ok: true, value: meeting })),
    sendPreview: vi.fn(),
  } as unknown as DesktopApi;
  const capture = await CaptureSession.start(api, 'Réunion', {
    screen: true,
    microphone: true,
    systemAudio: false,
    source: { id: 'screen:1:0', name: 'Écran 1', thumbnail: '' },
    onFailure: vi.fn(),
    onEnded: vi.fn(),
  });
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(getDisplayMedia) } });
  return { api, capture };
}

const screen2: CaptureSource = { id: 'screen:2:0', name: 'Écran 2', thumbnail: '' };
const screen3: CaptureSource = { id: 'screen:3:0', name: 'Écran 3', thumbnail: '' };

it('records nothing of a paused passage when the screen switches during the pause', async () => {
  const { api, capture } = await startWithDisplay(async () => display());
  capture.togglePause();
  await capture.switchSource(api, screen2);
  const video = FakeRecorder.made.at(-1);
  expect(video?.stream.getVideoTracks()).toContain(displayTracks[1]);
  expect(video?.state).toBe('paused');
  capture.togglePause();
  expect(video?.state).toBe('recording');
  await capture.stop();
});

it('refuses a switch to another source while one is in flight, and joins the same one', async () => {
  let hand: (stream: MediaStream) => void = () => {};
  const { api, capture } = await startWithDisplay(() => new Promise((resolve) => (hand = resolve)));
  const first = capture.switchSource(api, screen2);
  await expect(capture.switchSource(api, screen3)).rejects.toThrow(
    'Un changement de source est déjà en cours.',
  );
  const same = capture.switchSource(api, screen2);
  await vi.waitFor(() => expect(api.selectSource).toHaveBeenCalledOnce());
  hand(display());
  await Promise.all([first, same]);
  expect(capture.source).toEqual(screen2);
  await capture.stop();
});

it('fails a switch that the stop interrupts, keeping the source', async () => {
  let hand: (stream: MediaStream) => void = () => {};
  const { api, capture } = await startWithDisplay(() => new Promise((resolve) => (hand = resolve)));
  const switched = capture.switchSource(api, screen2);
  await vi.waitFor(() => expect(api.selectSource).toHaveBeenCalledOnce());
  const stopped = capture.stop();
  hand(display());
  await expect(switched).rejects.toThrow('La réunion est en cours de clôture.');
  expect(capture.source?.id).toBe('screen:1:0');
  await stopped;
});
