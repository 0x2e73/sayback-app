import { homedir } from 'node:os';
import { join } from 'node:path';
import { LiveTranscription } from '../backend/application/live-transcription';
import { liveWhisperModel, whisperModelFolders } from '../backend/infrastructure/local-setup';
import { locateBinary } from '../backend/infrastructure/local-whisper';
import { WhisperServer } from '../backend/infrastructure/whisper-server';
import {
  WhisperServerClient,
  whisperServerHealthy,
} from '../backend/infrastructure/whisper-server-client';
import { createPidFile, reapOrphan } from '../backend/infrastructure/whisper-server-pid';
import {
  freeLoopbackPort,
  requestToken,
  spawnQuiet,
} from '../backend/infrastructure/whisper-server-process';
import { createPcmGate } from './live-pcm-gate';
import { createLiveServices, type LiveServices } from './live-services';
import { createLiveTranscriptHub, type LiveTranscriptHub } from './live-transcript-hub';
import type { RecordingStateHub } from './recording-state-hub';

export interface LiveComposition {
  live: LiveServices;
  /** What the island subscribes to. */
  transcript: LiveTranscriptHub;
}

/** The live engine with its real adapters; `chosenModel` is the model of the settings. */
export function composeLive(
  recording: Pick<RecordingStateHub, 'subscribe'>,
  dataRoot: string,
  chosenModel: () => string,
): LiveComposition {
  const transcript = createLiveTranscriptHub();
  const pids = createPidFile(join(dataRoot, 'live-engine.pid'));
  // Reads the file before any server of this run can write it.
  reapOrphan(pids).catch(() => undefined);
  const server = new WhisperServer({
    spawn: spawnQuiet,
    freePort: freeLoopbackPort,
    token: requestToken,
    healthy: (baseUrl, signal) => whisperServerHealthy(baseUrl, signal),
    pids,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => performance.now(),
    onAvailability: (availability) => transcript.setAvailability(availability),
  });
  const engine = new WhisperServerClient(() => server.baseUrl());
  const live = createLiveServices({
    recording,
    transcript,
    transcription: new LiveTranscription(engine, transcript),
    server,
    gate: createPcmGate(),
    binary: () => locateBinary('whisper-server'),
    model: () => liveWhisperModel(chosenModel(), whisperModelFolders(homedir())),
  });
  return { live, transcript };
}
