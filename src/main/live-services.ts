import type { LiveTranscription } from '../backend/application/live-transcription';
import type { WhisperServer } from '../backend/infrastructure/whisper-server';
import type { LivePcm } from '../shared/live';
import type { RecordingState } from '../shared/recording-state';
import type { PcmGate } from './live-pcm-gate';
import type { LiveTranscriptHub } from './live-transcript-hub';
import type { RecordingStateHub } from './recording-state-hub';

export interface LiveServicesPorts {
  recording: Pick<RecordingStateHub, 'subscribe'>;
  transcript: Pick<LiveTranscriptHub, 'setAvailability' | 'clear' | 'snapshot' | 'subscribe'>;
  transcription: Pick<LiveTranscription, 'start' | 'push' | 'pause' | 'stop' | 'setEngineReady'>;
  server: Pick<WhisperServer, 'start' | 'stop'>;
  gate: PcmGate;
  /** The `whisper-server` executable, read at each recording start. */
  binary(): string | undefined;
  /** The model path, or '' when none is installed. */
  model(): string;
}

export interface LiveServices {
  /** A validated block from the main page; dropped unless the live is listening. */
  pcm(input: LivePcm): void;
  /** On quit: the server is gone when this resolves. */
  shutdown(): Promise<void>;
}

type Phase = 'off' | 'listening' | 'paused';

// Stop asked: the server goes at once, so the final local transcription has the whole machine.
function phaseOf(state: RecordingState): Phase {
  if (!state.recording || state.stopping) return 'off';
  return state.paused ? 'paused' : 'listening';
}

/**
 * Runs the live with the recording: the server starts with it, stays warm through a pause and
 * goes when the stop is asked. Nothing here can stop or delay the recording.
 */
export function createLiveServices(ports: LiveServicesPorts): LiveServices {
  let phase: Phase = 'off';
  // After quit began, a late state from a dying page must not start a server again.
  let closed = false;

  function begin(): void {
    ports.gate.reset();
    const binary = ports.binary();
    const model = ports.model();
    if (!binary)
      return ports.transcript.setAvailability({ state: 'unavailable', reason: 'no-binary' });
    if (!model)
      return ports.transcript.setAvailability({ state: 'unavailable', reason: 'no-model' });
    ports.transcription.start();
    ports.server.start(binary, model);
  }

  function end(): Promise<void> {
    ports.transcription.stop();
    return ports.server.stop();
  }

  function follow(state: RecordingState): void {
    if (closed) return;
    if (!state.recording) ports.transcript.clear();
    const next = phaseOf(state);
    if (next === phase) return;
    const previous = phase;
    phase = next;
    if (next === 'off') {
      end().catch((error: unknown) => console.error('[live] the engine did not stop', error));
      return;
    }
    if (previous === 'off') begin();
    ports.gate.setPaused(next === 'paused');
    if (next === 'paused') ports.transcription.pause();
  }

  ports.recording.subscribe(({ state }) => follow(state));
  // Utterances wait while the model loads or the server restarts.
  ports.transcript.subscribe((event) => {
    if (event.kind !== 'availability') return;
    ports.transcription.setEngineReady(event.availability.state === 'ready');
  });

  return {
    pcm({ track, samples, offset }) {
      if (phase !== 'listening') return;
      const { state } = ports.transcript.snapshot().availability;
      if (state !== 'starting' && state !== 'ready') return;
      if (ports.gate.admit(track, samples.length)) ports.transcription.push(track, samples, offset);
    },
    shutdown() {
      closed = true;
      phase = 'off';
      return end();
    },
  };
}
