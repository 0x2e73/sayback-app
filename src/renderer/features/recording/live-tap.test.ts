// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LiveTrack } from '../../../shared/live';
import { INERT_LIVE_TAP, openLiveTap, type LiveTap } from './live-tap';

interface FakeNode {
  port: { onmessage: ((event: { data: unknown }) => void) | null; close: () => void };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

const nodes: FakeNode[] = [];
const sources: Array<{ connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> =
  [];

class FakeWorkletNode implements FakeNode {
  port = { onmessage: null as ((event: { data: unknown }) => void) | null, close: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
  constructor(
    readonly context: unknown,
    readonly name: string,
  ) {
    nodes.push(this);
  }
}

class FakeStream {
  constructor(private readonly audio: unknown[]) {}
  getAudioTracks() {
    return this.audio;
  }
}

function stream(withAudio = true): MediaStream {
  return new FakeStream(withAudio ? [{}] : []) as unknown as MediaStream;
}

function context(addModule = vi.fn(async () => undefined)) {
  return {
    audioWorklet: { addModule },
    destination: {},
    createMediaStreamSource: vi.fn(() => {
      const source = { connect: vi.fn(), disconnect: vi.fn() };
      sources.push(source);
      return source;
    }),
  } as unknown as AudioContext;
}

async function open(send = vi.fn(), audioContext = context()): Promise<LiveTap> {
  return openLiveTap(audioContext, send, '/assets/pcm-worklet.js');
}

function emit(node: FakeNode | undefined, data: unknown): void {
  node?.port.onmessage?.({ data });
}

beforeEach(() => {
  nodes.length = 0;
  sources.length = 0;
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('MediaStream', FakeStream);
});

afterEach(() => vi.unstubAllGlobals());

it('loads the worklet from its asset url and renders each attached track', async () => {
  const addModule = vi.fn(async () => undefined);
  const tap = await open(vi.fn(), context(addModule));
  tap.attach('microphone', stream());
  expect(addModule).toHaveBeenCalledWith('/assets/pcm-worklet.js');
  expect(nodes[0]).toMatchObject({ name: 'sayback-pcm' });
  expect(sources[0]?.connect).toHaveBeenCalledWith(nodes[0]);
  expect(nodes[0]?.connect).toHaveBeenCalled();
});

it('routes each block to the track it came from', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('microphone', stream());
  tap.attach('system', stream());
  const first = new Int16Array(3_200);
  const second = new Int16Array(3_200).fill(7);
  emit(nodes[1], second);
  emit(nodes[0], first);
  expect(send.mock.calls).toEqual([
    ['system', second, 0],
    ['microphone', first, 0],
  ]);
});

it('numbers the samples of each track, pauses excluded, across a replaced stream', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('microphone', stream());
  emit(nodes[0], new Int16Array(3_200));
  tap.setPaused(true);
  emit(nodes[0], new Int16Array(3_200));
  tap.setPaused(false);
  tap.attach('microphone', stream());
  emit(nodes[1], new Int16Array(1_000));
  emit(nodes[1], new Int16Array(3_200));
  expect(send.mock.calls.map(([, , offset]) => offset as number)).toEqual([0, 3_200, 4_200]);
});

it('sends nothing for a track that was never attached or has no audio', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('system', stream(false));
  expect(nodes).toHaveLength(0);
  tap.attach('microphone', stream());
  emit(nodes[0], new Int16Array(3_200));
  expect(send.mock.calls.map(([track]) => track as LiveTrack)).toEqual(['microphone']);
});

it('sends nothing while paused and again after resume', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('microphone', stream());
  tap.setPaused(true);
  emit(nodes[0], new Int16Array(3_200));
  expect(send).not.toHaveBeenCalled();
  tap.setPaused(false);
  emit(nodes[0], new Int16Array(3_200));
  expect(send).toHaveBeenCalledOnce();
});

it('replaces the previous stream of a track and releases its nodes', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('system', stream());
  tap.attach('system', stream());
  expect(nodes[0]?.disconnect).toHaveBeenCalled();
  expect(nodes[0]?.port.onmessage).toBeNull();
  emit(nodes[1], new Int16Array(3_200));
  expect(send).toHaveBeenCalledOnce();
});

it('drops messages that are not a bounded Int16 block', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('microphone', stream());
  emit(nodes[0], new Float32Array(3_200));
  emit(nodes[0], new Int16Array(0));
  emit(nodes[0], new Int16Array(16_001));
  emit(nodes[0], 'x');
  expect(send).not.toHaveBeenCalled();
});

it('stops sending and releases every node on dispose, and ignores later attaches', async () => {
  const send = vi.fn();
  const tap = await open(send);
  tap.attach('microphone', stream());
  tap.attach('system', stream());
  tap.dispose();
  expect(nodes.every((node) => node.disconnect.mock.calls.length > 0)).toBe(true);
  expect(sources.every((source) => source.disconnect.mock.calls.length > 0)).toBe(true);
  emit(nodes[0], new Int16Array(3_200));
  tap.attach('microphone', stream());
  expect(nodes).toHaveLength(2);
  expect(send).not.toHaveBeenCalled();
  expect(() => tap.dispose()).not.toThrow();
});

it('degrades to an inert tap when the worklet cannot load', async () => {
  const failing = vi.fn(async () => {
    throw new Error('blocked by CSP');
  });
  const tap = await open(vi.fn(), context(failing));
  expect(tap).toBe(INERT_LIVE_TAP);
  expect(() => tap.attach('microphone', stream())).not.toThrow();
});

it('is inert when there is no sender', async () => {
  const tap = await openLiveTap(context(), undefined, '/x.js');
  expect(tap).toBe(INERT_LIVE_TAP);
});

it('contains a sender that throws', async () => {
  const send = vi.fn(() => {
    throw new Error('ipc closed');
  });
  const tap = await open(send);
  tap.attach('microphone', stream());
  expect(() => emit(nodes[0], new Int16Array(3_200))).not.toThrow();
  expect(send).toHaveBeenCalledOnce();
});

it('contains a node that cannot be built and leaves no half-attached track', async () => {
  const tap = await open();
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      constructor() {
        throw new Error('unsupported');
      }
    },
  );
  expect(() => tap.attach('microphone', stream())).not.toThrow();
  expect(() => tap.dispose()).not.toThrow();
});

it('releases a track whose wiring fails midway, without throwing', async () => {
  const send = vi.fn();
  const audioContext = context();
  vi.mocked(audioContext.createMediaStreamSource).mockImplementation(() => {
    throw new Error('bad stream');
  });
  const tap = await open(send, audioContext);
  expect(() => tap.attach('system', stream())).not.toThrow();
  expect(() => tap.dispose()).not.toThrow();
  expect(send).not.toHaveBeenCalled();
});
