// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { openCaptureResources } from './capture-resources';

afterEach(() => vi.unstubAllGlobals());

function stubAudio(track: { onended: (() => void) | null; stop(): void }) {
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  class FakeContext {
    resume = async () => undefined;
    close = async () => undefined;
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
