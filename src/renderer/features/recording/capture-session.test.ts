// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { CaptureSession } from './capture-session';
import { INERT_LIVE_TAP, type LiveTap } from './live-tap';
import type { CaptureSource, DesktopApi, Meeting } from '../../../shared/contracts';

const displayTracks: Array<{ stop: () => void; onended: (() => void) | null }> = [];
const resources = vi.hoisted(() => ({ open: vi.fn() }));
const sendPcm = vi.fn();
vi.mock('./capture-resources', () => ({ openCaptureResources: resources.open }));

class FakeStream {
  constructor(private readonly tracks: unknown[]) {}
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter((track) => 'onended' in (track as object));
  }
  getAudioTracks() {
    return this.tracks.filter((track) => !('onended' in (track as object)));
  }
}

class FakeRecorder {
  state = 'inactive';
  ondataavailable?: (event: BlobEvent) => void;
  onerror?: () => void;
  private onStop?: () => void;
  constructor(readonly stream: MediaStream) {}
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  addEventListener(event: string, listener: () => void) {
    if (event === 'stop') this.onStop = listener;
  }
  stop() {
    this.state = 'inactive';
    this.onStop?.();
  }
}

function display() {
  const track = { stop: vi.fn(), onended: null as (() => void) | null };
  displayTracks.push(track);
  return new FakeStream([track]) as unknown as MediaStream;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resources.open.mockReset();
  sendPcm.mockReset();
  displayTracks.length = 0;
});

it('switches the recorded display while keeping the meeting and audio capture active', async () => {
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  const first = display();
  const second = display();
  const audio = new FakeStream([{}]) as unknown as MediaStream;
  const captureResources = {
    display: first,
    audio,
    analyser: {},
    live: INERT_LIVE_TAP,
    replaceDisplay: vi.fn(async (next: MediaStream) => {
      displayTracks[0]?.stop();
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
  } as unknown as DesktopApi;
  const onEnded = vi.fn();
  const capture = await CaptureSession.start(api, 'Réunion', {
    screen: true,
    microphone: true,
    systemAudio: false,
    onFailure: vi.fn(),
    onEnded,
  });
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => second) } });
  const source: CaptureSource = { id: 'screen:2:0', name: 'Deuxième écran', thumbnail: '' };

  await capture.switchSource(api, source);

  expect(api.selectSource).toHaveBeenCalledWith(source.id, false);
  expect(captureResources.replaceDisplay).toHaveBeenCalledWith(second);
  expect(capture.displayStream).toBe(second);
  expect(capture.source).toEqual(source);
  expect(capture.meeting).toBe(meeting);
  expect(onEnded).not.toHaveBeenCalled();
  await capture.stop();
});

async function startWithLimit(
  onEnded: () => void,
  live: LiveTap = INERT_LIVE_TAP,
): Promise<CaptureSession> {
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  resources.open.mockResolvedValue({
    audio: new FakeStream([{}]) as unknown as MediaStream,
    analyser: {},
    live,
    replaceDisplay: vi.fn(),
    dispose: vi.fn(async () => undefined),
  });
  const meeting = { id: 'meeting-1' } as Meeting;
  const api = {
    createMeeting: vi.fn(async () => ({ ok: true, value: meeting })),
    sendPcm,
    saveMedia: vi.fn(async () => ({ ok: true, value: undefined })),
    finishMeeting: vi.fn(async () => ({ ok: true, value: meeting })),
  } as unknown as DesktopApi;
  return CaptureSession.start(api, 'Réunion', {
    screen: false,
    microphone: true,
    systemAudio: false,
    onFailure: vi.fn(),
    onEnded,
  });
}

it('ends the recording after two hours of recorded time, once, with no view to count', async () => {
  vi.useFakeTimers();
  const onEnded = vi.fn();
  const capture = await startWithLimit(onEnded);
  vi.advanceTimersByTime(7200 * 1000 - 1);
  expect(onEnded).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onEnded).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(3600 * 1000);
  expect(onEnded).toHaveBeenCalledOnce();
  await capture.stop();
  vi.useRealTimers();
});

it('does not count the time spent paused, and re-arms on resume', async () => {
  vi.useFakeTimers();
  const onEnded = vi.fn();
  const capture = await startWithLimit(onEnded);
  vi.advanceTimersByTime(3600 * 1000);
  capture.togglePause();
  vi.advanceTimersByTime(5 * 3600 * 1000);
  expect(onEnded).not.toHaveBeenCalled();
  capture.togglePause();
  vi.advanceTimersByTime(3600 * 1000 - 1);
  expect(onEnded).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onEnded).toHaveBeenCalledOnce();
  await capture.stop();
  vi.useRealTimers();
});

it('clears the limit when the recording stops', async () => {
  vi.useFakeTimers();
  const onEnded = vi.fn();
  const capture = await startWithLimit(onEnded);
  await capture.stop();
  vi.advanceTimersByTime(3 * 3600 * 1000);
  expect(onEnded).not.toHaveBeenCalled();
  vi.useRealTimers();
});

it('pauses and resumes the live tap with the recording and disposes it through the resources', async () => {
  const live = { attach: vi.fn(), setPaused: vi.fn(), dispose: vi.fn() };
  const capture = await startWithLimit(vi.fn(), live);
  capture.togglePause();
  expect(live.setPaused).toHaveBeenLastCalledWith(true);
  capture.togglePause();
  expect(live.setPaused).toHaveBeenLastCalledWith(false);
  await capture.stop();
});

it('hands the capture the desktop api for the live blocks', async () => {
  await startWithLimit(vi.fn());
  expect(resources.open.mock.calls[0]?.[1]).toMatchObject({ sendPcm });
});
