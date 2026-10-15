import { MAX_PCM_SAMPLES, type LiveTrack } from '../../../shared/live';
import { PCM_PROCESSOR } from './pcm-downsampler';

/** `offset`: where the block starts in the track, in samples, pauses excluded. */
export type PcmSender = (track: LiveTrack, samples: Int16Array, offset: number) => void;

/** Feeds the live transcription from the capture. It never throws: the recording comes first. */
export interface LiveTap {
  /** Sends this stream's audio as `track`, replacing what was attached to it before. */
  attach(track: LiveTrack, stream: MediaStream): void;
  /** While paused, nothing leaves the page. */
  setPaused(paused: boolean): void;
  dispose(): void;
}

interface TrackNodes {
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
}

export const INERT_LIVE_TAP: LiveTap = {
  attach: () => undefined,
  setPaused: () => undefined,
  dispose: () => undefined,
};

// A failing tap degrades to silence; the error is dropped because it could carry audio details.
function contained(action: () => void): void {
  try {
    action();
  } catch {
    // The live text is optional.
  }
}

function createTap(context: AudioContext, send: PcmSender): LiveTap {
  const tracks = new Map<LiveTrack, TrackNodes>();
  // Per track, across a replaced stream: the main process sees a gap when a block goes missing.
  const offsets = new Map<LiveTrack, number>();
  let paused = false;
  let disposed = false;

  function release(track: LiveTrack): void {
    const nodes = tracks.get(track);
    if (!nodes) return;
    tracks.delete(track);
    contained(() => {
      nodes.node.port.onmessage = null;
      nodes.source.disconnect();
      nodes.node.disconnect();
      nodes.node.port.close();
    });
  }

  function forward(track: LiveTrack, data: unknown): void {
    if (paused || disposed || !(data instanceof Int16Array)) return;
    if (data.length === 0 || data.length > MAX_PCM_SAMPLES) return;
    const offset = offsets.get(track) ?? 0;
    offsets.set(track, offset + data.length);
    contained(() => send(track, data, offset));
  }

  function open(track: LiveTrack, stream: MediaStream): void {
    const audio = stream.getAudioTracks();
    if (audio.length === 0) return;
    const node = new AudioWorkletNode(context, PCM_PROCESSOR);
    const source = context.createMediaStreamSource(new MediaStream(audio));
    tracks.set(track, { source, node });
    node.port.onmessage = (event: MessageEvent<unknown>) => forward(track, event.data);
    source.connect(node);
    // The processor writes no output, so this is silent; an unconnected node is not rendered.
    node.connect(context.destination);
  }

  return {
    attach(track, stream) {
      if (disposed) return;
      release(track);
      try {
        open(track, stream);
      } catch {
        // A half-built track must not stay attached.
        release(track);
      }
    },
    setPaused(next) {
      paused = next;
    },
    dispose() {
      disposed = true;
      for (const track of [...tracks.keys()]) release(track);
    },
  };
}

/** Loads the worklet; without it (unsupported, blocked, failed) the tap is inert. */
export async function openLiveTap(
  context: AudioContext,
  send: PcmSender | undefined,
  moduleUrl: string,
): Promise<LiveTap> {
  if (!send) return INERT_LIVE_TAP;
  try {
    await context.audioWorklet.addModule(moduleUrl);
  } catch {
    return INERT_LIVE_TAP;
  }
  return createTap(context, send);
}
