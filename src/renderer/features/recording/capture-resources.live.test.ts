// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openCaptureResources } from './capture-resources';

const tap = vi.hoisted(() => ({
  attach: vi.fn(),
  setPaused: vi.fn(),
  dispose: vi.fn(),
  open: vi.fn(),
}));
vi.mock('./live-tap', () => ({ openLiveTap: tap.open }));
vi.mock('./pcm-worklet-url', () => ({ PCM_WORKLET_URL: '/assets/pcm-worklet.js' }));

class FakeStream {
  constructor(readonly name = 'stream') {}
  getAudioTracks = () => [{ stop: vi.fn(), onended: null }];
  getTracks = () => this.getAudioTracks();
}

const microphone = new FakeStream('microphone');
const display = new FakeStream('display');

beforeEach(() => {
  tap.open.mockResolvedValue(tap);
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal(
    'AudioContext',
    class {
      // A new context starts suspended; the capture only opens once `resume()` runs it.
      state: AudioContextState = 'suspended';
      resume = async () => {
        this.state = 'running';
      };
      close = async () => undefined;
      createMediaStreamDestination = () => ({ stream: new FakeStream('mix') });
      createMediaStreamSource = () => node;
      createAnalyser = () => ({ fftSize: 0 });
    },
  );
  vi.stubGlobal('MediaStream', FakeStream);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => microphone),
      getDisplayMedia: vi.fn(async () => display),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const callbacks = { onFailure: vi.fn(), onEnded: vi.fn() };

it('attaches the microphone and the display audio to their own tracks', async () => {
  const api = { sendPcm: vi.fn() };
  await openCaptureResources(
    { screen: true, microphone: true, systemAudio: true, ...callbacks },
    api,
  );
  const block = new Int16Array(3_200);
  const send = tap.open.mock.calls[0]?.[1] as (
    track: 'system',
    samples: Int16Array,
    offset: number,
  ) => void;
  send('system', block, 6_400);
  expect(api.sendPcm).toHaveBeenCalledWith('system', block, 6_400);
  expect(tap.open.mock.calls[0]?.[2]).toBe('/assets/pcm-worklet.js');
  expect(tap.attach).toHaveBeenCalledWith('microphone', microphone);
  expect(tap.attach).toHaveBeenCalledWith('system', display);
});

it('attaches nothing for a source the user turned off', async () => {
  await openCaptureResources(
    { screen: true, microphone: false, systemAudio: false, ...callbacks },
    { sendPcm: vi.fn() },
  ).catch(() => undefined);
  expect(tap.attach).not.toHaveBeenCalled();
  await openCaptureResources(
    { screen: true, microphone: true, systemAudio: false, ...callbacks },
    { sendPcm: vi.fn() },
  );
  expect(tap.attach.mock.calls.map(([track]) => track)).toEqual(['microphone']);
});

it('moves the system track to the new display and disposes the tap with the capture', async () => {
  const resources = await openCaptureResources(
    { screen: true, microphone: false, systemAudio: true, ...callbacks },
    { sendPcm: vi.fn() },
  );
  const next = new FakeStream('next');
  await resources.replaceDisplay(next as unknown as MediaStream);
  expect(tap.attach).toHaveBeenLastCalledWith('system', next);
  expect(resources.live).toBe(tap);
  await resources.dispose();
  expect(tap.dispose).toHaveBeenCalledOnce();
});
