import type { CaptureSource } from '../../../shared/contracts';

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
  replaceDisplay(display: MediaStream): Promise<void>;
  dispose(): Promise<void>;
}

function stopTracks(streams: MediaStream[]): void {
  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop();
  }
}

async function acquireStreams(options: CaptureOptions, streams: MediaStream[]) {
  let display: MediaStream | undefined;
  if (options.screen) {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: options.systemAudio,
    });
    streams.push(display);
    if (options.systemAudio && !display.getAudioTracks().length) {
      throw new Error(
        'Le son système est indisponible. Vérifiez les permissions ou désactivez cette source.',
      );
    }
  }
  if (options.microphone) {
    const microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    streams.push(microphone);
    // A dead microphone is a failure, not a silence. The display's own audio ends with its
    // video track, which already stops the meeting.
    for (const track of microphone.getAudioTracks()) {
      track.onended = () => options.onFailure(new Error('Le microphone s’est arrêté.'));
    }
  }
  return display;
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
  analyser.fftSize = 256;
  context.createMediaStreamSource(destination.stream).connect(analyser);
  return { audio: destination.stream, analyser, destination, sources };
}

export async function openCaptureResources(options: CaptureOptions): Promise<CaptureResources> {
  const streams: MediaStream[] = [];
  let context: AudioContext | undefined;
  try {
    if (!options.microphone && !(options.screen && options.systemAudio)) {
      throw new Error('Choisissez au moins une source audio.');
    }
    let display = await acquireStreams(options, streams);
    const audioContext = new AudioContext();
    context = audioContext;
    await audioContext.resume();
    const { audio, analyser, destination, sources } = mixAudio(audioContext, streams);
    const captureResources: CaptureResources = {
      display,
      audio,
      analyser,
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
      },
      async dispose() {
        stopTracks([...streams, audio]);
        await audioContext.close();
      },
    };
    return captureResources;
  } catch (error) {
    stopTracks(streams);
    await context?.close();
    if (
      error instanceof DOMException &&
      ['NotAllowedError', 'NotReadableError'].includes(error.name)
    ) {
      throw new Error(
        'Capture refusée ou indisponible. Autorisez l’écran et le microphone dans les réglages système, puis réessayez.',
      );
    }
    throw error;
  }
}
