import { describe, expect, it } from 'vitest';
import type { LiveSegment } from '../../shared/live';
import { LiveTranscription } from './live-transcription';
import { concat, silence, tone } from './live-test-signals';
import type { LiveEngine } from './ports';

interface Call {
  samples: Int16Array;
  signal: AbortSignal;
  resolve(text: string): void;
  reject(error: Error): void;
}

/** An engine answering only when the test says so. */
function controlledEngine() {
  const calls: Call[] = [];
  const engine: LiveEngine = {
    transcribe: (samples, signal) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ samples, signal, resolve, reject });
      }),
  };
  return { engine, calls };
}

function setup() {
  const { engine, calls } = controlledEngine();
  const published: LiveSegment[] = [];
  const live = new LiveTranscription(engine, { publish: (segment) => published.push(segment) });
  live.setEngineReady(true);
  return { live, calls, published };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const utterance = () => concat(tone(1_000), silence(1_000));

describe('live transcription', () => {
  it('publishes the text of a closed utterance as a final draft', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('microphone', utterance(), 0);
    calls[0]!.resolve(' Bonjour à tous.\n');
    await settle();

    expect(calls[0]!.samples).toHaveLength(1.2 * 16_000);
    expect(published).toEqual([
      {
        id: 'microphone-0',
        track: 'microphone',
        text: 'Bonjour à tous.',
        start: 0,
        end: 1.2,
        final: true,
        revision: 0,
      },
    ]);
  });

  it('numbers the revisions of an utterance from its partials to its final', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('system', tone(2_000), 0);
    calls[0]!.resolve('Bonjour');
    await settle();
    live.pause();
    calls[1]!.resolve('Bonjour à tous');
    await settle();

    expect(published.map(({ id, final, revision }) => ({ id, final, revision }))).toEqual([
      { id: 'system-0', final: false, revision: 0 },
      { id: 'system-0', final: true, revision: 1 },
    ]);
  });

  it('decodes one utterance at a time, finals first', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('system', tone(2_000), 0);
    live.push('microphone', utterance(), 0);
    expect(calls).toHaveLength(1);
    calls[0]!.resolve('partiel');
    await settle();
    calls[1]!.resolve('définitif');
    await settle();

    expect(published.map((segment) => segment.id)).toEqual(['system-0', 'microphone-0']);
  });

  it('drops a failed decode and goes on with the next utterance', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('microphone', concat(utterance(), utterance()), 0);
    calls[0]!.reject(new Error('moteur arrêté'));
    await settle();
    calls[1]!.resolve('Deuxième phrase.');
    await settle();

    expect(published.map((segment) => segment.id)).toEqual(['microphone-1']);
  });

  it('keeps the last draft as the final when the final decode fails', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('microphone', tone(2_000), 0);
    calls[0]!.resolve('Bonjour à');
    await settle();
    live.pause();
    calls[1]!.reject(new Error('moteur arrêté'));
    await settle();

    expect(published.map(({ text, final, revision }) => ({ text, final, revision }))).toEqual([
      { text: 'Bonjour à', final: false, revision: 0 },
      { text: 'Bonjour à', final: true, revision: 1 },
    ]);
  });

  it('keeps speech heard while the model loads and decodes it once the engine answers', async () => {
    const { live, calls, published } = setup();
    live.setEngineReady(false);
    live.start();

    live.push('microphone', utterance(), 0);
    expect(calls).toEqual([]);
    live.setEngineReady(true);
    calls[0]!.resolve('Pendant le chargement.');
    await settle();

    expect(published.map((segment) => segment.text)).toEqual(['Pendant le chargement.']);
  });

  it('gives up the oldest final beyond three per track and closes its draft with the last text', async () => {
    const { live, calls, published } = setup();
    live.start();
    live.push('system', tone(2_000), 0);
    calls[0]!.resolve('Premier brouillon');
    await settle();
    live.setEngineReady(false);

    live.pause();
    for (const offset of [32_000, 64_000, 96_000]) live.push('system', utterance(), offset);

    expect(published.map(({ id, text, final }) => ({ id, text, final }))).toEqual([
      { id: 'system-0', text: 'Premier brouillon', final: false },
      { id: 'system-0', text: 'Premier brouillon', final: true },
    ]);
  });

  it('aborts the decode in progress on stop and ignores its late answer', async () => {
    const { live, calls, published } = setup();
    live.start();
    live.push('microphone', utterance(), 0);

    live.stop();
    calls[0]!.resolve('trop tard');
    await settle();

    expect(calls[0]!.signal.aborted).toBe(true);
    expect(published).toEqual([]);
  });

  it('ignores audio before the start and after the stop, and an empty block', () => {
    const { live, calls } = setup();

    live.push('microphone', utterance(), 0);
    live.start();
    live.push('microphone', new Int16Array(0), 0);
    live.stop();
    live.push('microphone', utterance(), 0);
    live.pause();

    expect(calls).toEqual([]);
  });

  it('shows no blank draft, but closes a draft whose final turns out blank', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('microphone', utterance(), 0);
    calls[0]!.resolve('[BLANK_AUDIO]');
    await settle();
    live.push('system', tone(2_000), 0);
    calls[1]!.resolve('Euh');
    await settle();
    live.pause();
    calls[2]!.resolve(' [Musique] ');
    await settle();

    expect(published.map(({ id, text, final }) => ({ id, text, final }))).toEqual([
      { id: 'system-0', text: 'Euh', final: false },
      { id: 'system-0', text: '', final: true },
    ]);
  });

  it('starts every session from the first utterance again', async () => {
    const { live, calls, published } = setup();
    live.start();
    live.push('microphone', utterance(), 0);
    live.start();

    live.push('microphone', utterance(), 0);
    calls[1]!.resolve('Nouvelle session');
    await settle();

    expect(published.map(({ id, start }) => ({ id, start }))).toEqual([
      { id: 'microphone-0', start: 0 },
    ]);
  });
});
