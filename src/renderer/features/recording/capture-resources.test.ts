// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { AUDIO_START_TIMEOUT, CaptureFailure, openCaptureResources } from './capture-resources';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface AudioStart {
  /** What the context reads after `resume()`. */
  state?: AudioContextState;
  /** `resume()` that never settles, as when the browser waits for a gesture. */
  hangs?: boolean;
  close?: () => Promise<void>;
}

function stubAudio(track: { onended: (() => void) | null; stop(): void }, start: AudioStart = {}) {
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  class FakeContext {
    state: AudioContextState = 'suspended';
    resume = () => {
      if (start.hangs) return new Promise<void>(() => undefined);
      this.state = start.state ?? 'running';
      return Promise.resolve();
    };
    close = start.close ?? (async () => undefined);
    createMediaStreamDestination = () => ({ stream: { getTracks: () => [] } });
    createMediaStreamSource = () => node;
    createAnalyser = () => ({ fftSize: 0 });
  }
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal(
    'MediaStream',
    class {
      getAudioTracks = () => [track];
      getTracks = () => [track];
    },
  );
  const microphone = new (globalThis.MediaStream as new () => MediaStream)();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => microphone) } });
}

const refusal =
  'Capture refusée ou indisponible. Autorisez l’écran et le microphone dans les réglages système, puis réessayez.';

it.each([
  ['screen', true],
  ['microphone', false],
] as const)('names the %s when the system refuses it', async (device, screen) => {
  stubAudio({ onended: null, stop: vi.fn() });
  const denied = vi.fn(async () => {
    throw new DOMException('Permission denied', 'NotAllowedError');
  });
  vi.stubGlobal('navigator', {
    mediaDevices: screen
      ? { getDisplayMedia: denied }
      : { getUserMedia: denied, getDisplayMedia: vi.fn() },
  });
  const opening = openCaptureResources({
    screen,
    microphone: !screen,
    systemAudio: screen,
    onFailure: vi.fn(),
    onEnded: vi.fn(),
  });
  await expect(opening).rejects.toBeInstanceOf(CaptureFailure);
  await expect(opening).rejects.toMatchObject({
    device,
    reason: 'NotAllowedError',
    message: refusal,
  });
});

it('keeps the message of a capture that is missing rather than refused', async () => {
  stubAudio({ onended: null, stop: vi.fn() });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getDisplayMedia: vi.fn(async () => {
        throw new DOMException('Requested device not found', 'NotFoundError');
      }),
    },
  });
  const opening = openCaptureResources({
    screen: true,
    microphone: false,
    systemAudio: true,
    onFailure: vi.fn(),
    onEnded: vi.fn(),
  });
  await expect(opening).rejects.toMatchObject({
    device: 'screen',
    reason: 'NotFoundError',
    message: 'Requested device not found',
  });
});

it('reports a dead microphone track as a failure', async () => {
  const track = { onended: null as (() => void) | null, stop: vi.fn() };
  stubAudio(track);
  const onFailure = vi.fn();
  await openCaptureResources({
    screen: false,
    microphone: true,
    systemAudio: false,
    onFailure,
    onEnded: vi.fn(),
  });
  expect(onFailure).not.toHaveBeenCalled();
  track.onended?.();
  expect(onFailure).toHaveBeenCalledWith(new Error('Le microphone s’est arrêté.'));
});

const microphoneOnly = {
  screen: false,
  microphone: true,
  systemAudio: false,
  onFailure: vi.fn(),
  onEnded: vi.fn(),
};
const silentAudio = 'Le son ne peut pas être enregistré pour l’instant. Réessayez.';

// The recorders take the mixed audio from this context: suspended, the meeting would be silent.
it('refuses to record when the audio does not run', async () => {
  const track = { onended: null, stop: vi.fn() };
  const close = vi.fn(async () => undefined);
  stubAudio(track, { state: 'suspended', close });
  await expect(openCaptureResources(microphoneOnly)).rejects.toThrow(silentAudio);
  expect(track.stop).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});

it('gives up when the audio never starts, instead of waiting for ever', async () => {
  vi.useFakeTimers();
  const track = { onended: null, stop: vi.fn() };
  stubAudio(track, { hangs: true });
  const opening = openCaptureResources(microphoneOnly);
  const outcome = expect(opening).rejects.toThrow(silentAudio);
  await vi.advanceTimersByTimeAsync(AUDIO_START_TIMEOUT);
  await outcome;
  expect(track.stop).toHaveBeenCalled();
});
