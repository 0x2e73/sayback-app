import type { CaptureSource, DesktopApi } from '../../../shared/contracts';
import { openLiveTap, type LiveTap } from './live-tap';
import { PCM_WORKLET_URL } from './pcm-worklet-url';

export interface CaptureOptions {
  screen: boolean;
  microphone: boolean;
  systemAudio: boolean;
  source?: CaptureSource;
  onFailure(error: Error): void;
  onEnded(): void;
}

export interface CaptureResources {
  display?: MediaStream;
  audio: MediaStream;
  analyser: AnalyserNode;
  live: LiveTap;
  replaceDisplay(display: MediaStream): Promise<void>;
  dispose(): Promise<void>;
}

const REFUSALS = ['NotAllowedError', 'NotReadableError'];
const REFUSAL_MESSAGE =
  'Capture refusée ou indisponible. Autorisez l’écran et le microphone dans les réglages système, puis réessayez.';

/**
 * A capture the browser refused or could not open, with the device it hit: a start from the
 * island answers with an error code, the dialog shows the message.
 */
export class CaptureFailure extends Error {
  constructor(
    readonly device: 'screen' | 'microphone',
    /** The DOMException name: a refusal reads the same for both devices, anything else as is. */
    readonly reason: string,
    detail = reason,
  ) {
    super(REFUSALS.includes(reason) ? REFUSAL_MESSAGE : detail);
  }
}

async function captureOf<T>(device: CaptureFailure['device'], open: () => Promise<T>): Promise<T> {
  try {
    return await open();
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    throw new CaptureFailure(device, error.name, error.message);
  }
}

function stopTracks(streams: MediaStream[]): void {
  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop();
  }
}

async function acquireStreams(options: CaptureOptions, streams: MediaStream[]) {
  let display: MediaStream | undefined;
  let microphone: MediaStream | undefined;
  if (options.screen) {
    display = await captureOf('screen', () =>
      navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: options.systemAudio,
      }),
    );
    streams.push(display);
    if (options.systemAudio && !display.getAudioTracks().length) {
      throw new Error(
        'Le son système est indisponible. Vérifiez les permissions ou désactivez cette source.',
      );
    }
  }
  if (options.microphone) {
    microphone = await captureOf('microphone', () =>
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      }),
    );
    streams.push(microphone);
    // A dead microphone is a failure, not a silence. The display's own audio ends with its
    // video track, which already stops the meeting.
    for (const track of microphone.getAudioTracks()) {
      track.onended = () => options.onFailure(new Error('Le microphone s’est arrêté.'));
    }
  }
  return { display, microphone };
}

/** How long the audio may take to start before the opening gives up. */
export const AUDIO_START_TIMEOUT = 3_000;
const SILENT_AUDIO = 'Le son ne peut pas être enregistré pour l’instant. Réessayez.';

/**
 * The recorders take their audio from this context: left suspended, the meeting would be silent.
 * A browser that waits for a gesture never settles `resume()`, which would hold the opening.
 */
async function startAudio(context: AudioContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, AUDIO_START_TIMEOUT);
  });
  try {
    await Promise.race([context.resume(), timeout]);
  } finally {
    clearTimeout(timer);
  }
  if (context.state !== 'running') throw new Error(SILENT_AUDIO);
}

function mixAudio(context: AudioContext, streams: MediaStream[]) {
  const destination = context.createMediaStreamDestination();
  const sources = new Map<MediaStream, MediaStreamAudioSourceNode>();
  for (const stream of streams) {
    if (!stream.getAudioTracks().length) continue;
    const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    source.connect(destination);
    sources.set(stream, source);
  }
  const analyser = context.createAnalyser();
  // About 43 ms of sound at 48 kHz: a steady reading of the level ten times a second.
  analyser.fftSize = 2048;
  context.createMediaStreamSource(destination.stream).connect(analyser);
  return { audio: destination.stream, analyser, destination, sources };
}

export async function openCaptureResources(
  options: CaptureOptions,
  api?: Pick<DesktopApi, 'sendPcm'>,
): Promise<CaptureResources> {
  const streams: MediaStream[] = [];
  let context: AudioContext | undefined;
  try {
    if (!options.microphone && !(options.screen && options.systemAudio)) {
      throw new Error('Choisissez au moins une source audio.');
    }
    const acquired = await acquireStreams(options, streams);
    let display = acquired.display;
    const audioContext = new AudioContext();
    context = audioContext;
    await startAudio(audioContext);
    const { audio, analyser, destination, sources } = mixAudio(audioContext, streams);
    const live = await openLiveTap(
      audioContext,
      api && ((track, samples, offset) => api.sendPcm(track, samples, offset)),
      PCM_WORKLET_URL,
    );
    // A track the user turned off is never attached, so nothing is sent for it.
    if (acquired.microphone) live.attach('microphone', acquired.microphone);
    if (display && options.systemAudio) live.attach('system', display);
    const captureResources: CaptureResources = {
      display,
      audio,
      analyser,
      live,
      async replaceDisplay(next) {
        if (options.systemAudio && !next.getAudioTracks().length) {
          throw new Error(
            'Cette source ne fournit pas de son système. La capture actuelle continue.',
          );
        }
        const nextSource = options.systemAudio
          ? audioContext.createMediaStreamSource(new MediaStream(next.getAudioTracks()))
          : undefined;
        nextSource?.connect(destination);
        if (display) {
          sources.get(display)?.disconnect();
          stopTracks([display]);
          streams.splice(streams.indexOf(display), 1);
        }
        display = next;
        streams.push(next);
        if (nextSource) sources.set(next, nextSource);
        captureResources.display = next;
        if (nextSource) live.attach('system', next);
      },
      async dispose() {
        live.dispose();
        stopTracks([...streams, audio]);
        await audioContext.close();
      },
    };
    return captureResources;
  } catch (error) {
    stopTracks(streams);
    await context?.close();
    throw error;
  }
}
