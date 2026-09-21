// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { CaptureSession } from './capture-session';
import type { CaptureSource, DesktopApi, Meeting } from '../../../shared/contracts';

const displayTracks: Array<{ stop: () => void; onended: (() => void) | null }> = [];
const resources = vi.hoisted(() => ({ open: vi.fn() }));
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
