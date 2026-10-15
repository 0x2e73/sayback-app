import { describe, expect, it, vi } from 'vitest';
import type { RecordingState } from '../shared/recording-state';
import { createLiveServices } from './live-services';
import { createPcmGate } from './live-pcm-gate';
import { createLiveTranscriptHub } from './live-transcript-hub';
import { createRecordingStateHub } from './recording-state-hub';

const recordingState = (
  paused = false,
  stopping = false,
): Extract<RecordingState, { recording: true }> => ({
  recording: true,
  elapsed: 0,
  paused,
  stopping,
});

function setup(binary: string | null = '/opt/homebrew/bin/whisper-server', model = 'base.bin') {
  const recording = createRecordingStateHub(() => 0);
  const transcript = createLiveTranscriptHub();
  const transcription = {
    start: vi.fn(),
    push: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    setEngineReady: vi.fn(),
  };
  const server = {
    start: vi.fn(() => transcript.setAvailability({ state: 'ready' })),
    stop: vi.fn(async () => transcript.setAvailability({ state: 'off' })),
  };
  let time = 0;
  const live = createLiveServices({
    recording,
    transcript,
    transcription,
    server,
    gate: createPcmGate(() => time),
    binary: () => binary ?? undefined,
    model: () => model,
  });
  const advance = (ms: number) => (time += ms);
  return { recording, transcript, transcription, server, live, advance };
}

const block = { track: 'microphone' as const, offset: 0, samples: new Int16Array(3_200) };

describe('live services', () => {
  it('starts the server with the recording and passes the audio on', () => {
    const { recording, server, transcription, live } = setup();

    recording.publish(recordingState());
    live.pcm(block);

    expect(server.start).toHaveBeenCalledWith('/opt/homebrew/bin/whisper-server', 'base.bin');
    expect(transcription.start).toHaveBeenCalledTimes(1);
    expect(transcription.push).toHaveBeenCalledWith('microphone', block.samples, 0);
  });

  it('starts once however many states the recording announces', () => {
    const { recording, server } = setup();

    recording.publish(recordingState());
    recording.publish({ ...recordingState(), elapsed: 3 });

    expect(server.start).toHaveBeenCalledTimes(1);
  });

  it('closes the open utterances on pause, keeps the server warm and drops paused audio', () => {
    const { recording, server, transcription, live } = setup();
    recording.publish(recordingState());

    recording.publish(recordingState(true));
    live.pcm(block);
    recording.publish(recordingState(false));

    expect(transcription.pause).toHaveBeenCalledTimes(1);
    expect(transcription.push).not.toHaveBeenCalled();
    expect(server.stop).not.toHaveBeenCalled();
    expect(server.start).toHaveBeenCalledTimes(1);
  });

  it('ends the server as soon as the stop is asked and clears the draft at the end', () => {
    const { recording, transcript, server, transcription, live } = setup();
    recording.publish(recordingState());
    transcript.publish({
      id: 'microphone-0',
      track: 'microphone',
      text: 'Bonjour',
      start: 0,
      end: 1,
      final: true,
      revision: 0,
    });

    recording.publish(recordingState(false, true));
    live.pcm(block);
    expect(server.stop).toHaveBeenCalledTimes(1);
    expect(transcription.stop).toHaveBeenCalledTimes(1);
    expect(transcription.push).not.toHaveBeenCalled();
    expect(transcript.snapshot().segments).toHaveLength(1);

    recording.publish({ recording: false });
    expect(server.stop).toHaveBeenCalledTimes(1);
    expect(transcript.snapshot().segments).toEqual([]);
  });

  it('stops the server when the main page goes away mid-recording', () => {
    const { recording, server } = setup();
    const page = { handlers: new Map<string, () => void>() };
    recording.watch({ on: (event, listener) => page.handlers.set(event, listener) });
    recording.publish(recordingState());

    page.handlers.get('render-process-gone')?.();

    expect(server.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 'base.bin', 'no-binary'],
    ['/opt/homebrew/bin/whisper-server', '', 'no-model'],
  ])('says the live is unavailable without binary or model (%s, %j)', (binary, model, reason) => {
    const { recording, transcript, server, transcription, live } = setup(binary, model);

    recording.publish(recordingState());
    live.pcm(block);

    expect(transcript.snapshot().availability).toEqual({ state: 'unavailable', reason });
    expect(server.start).not.toHaveBeenCalled();
    expect(transcription.push).not.toHaveBeenCalled();
  });

  it('drops the audio of a live that failed', () => {
    const { recording, transcript, transcription, live } = setup();
    recording.publish(recordingState());

    transcript.setAvailability({ state: 'unavailable', reason: 'engine-failed' });
    live.pcm(block);

    expect(transcription.push).not.toHaveBeenCalled();
  });

  it('drops audio beyond the burst of its track', () => {
    const { recording, transcription, live, advance } = setup();
    recording.publish(recordingState());

    for (let index = 0; index < 20; index += 1) live.pcm(block);
    advance(1_000);
    live.pcm(block);

    expect(transcription.push).toHaveBeenCalledTimes(16);
  });

  it('saves no rate credit during a pause', () => {
    const { recording, transcription, live, advance } = setup();
    recording.publish(recordingState());
    for (let index = 0; index < 15; index += 1) live.pcm(block);

    recording.publish(recordingState(true));
    advance(60_000);
    recording.publish(recordingState(false));
    live.pcm(block);

    expect(transcription.push).toHaveBeenCalledTimes(15);
  });

  it('ignores audio outside a recording', () => {
    const { transcription, live } = setup();

    live.pcm(block);

    expect(transcription.push).not.toHaveBeenCalled();
  });

  it('ends the server on quit', async () => {
    const { recording, server, live } = setup();
    recording.publish(recordingState());

    await live.shutdown();
    live.pcm(block);

    expect(server.stop).toHaveBeenCalledTimes(1);
  });
  it('holds the decoding until the server answers, and again while it restarts', () => {
    const { recording, transcript, transcription } = setup();

    recording.publish(recordingState());
    transcript.setAvailability({ state: 'starting' });

    expect(transcription.setEngineReady.mock.calls).toEqual([[true], [false]]);
  });
  it('ignores a late state from the page once quit began', async () => {
    const { recording, server, live } = setup();
    await live.shutdown();

    recording.publish(recordingState());

    expect(server.start).not.toHaveBeenCalled();
  });
});
