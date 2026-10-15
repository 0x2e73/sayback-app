import { describe, expect, it } from 'vitest';
import type { LiveSegment } from '../../shared/live';
import { LiveTranscription, spokenText } from './live-transcription';
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
  return { live, calls, published };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const utterance = () => concat(tone(1_000), silence(1_000));

describe('live transcription', () => {
  it('publishes the text of a closed utterance as a final draft', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('microphone', utterance());
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

    live.push('system', tone(2_000));
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

    live.push('system', tone(2_000));
    live.push('microphone', utterance());
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

    live.push('microphone', concat(utterance(), utterance()));
    calls[0]!.reject(new Error('moteur arrêté'));
    await settle();
    calls[1]!.resolve('Deuxième phrase.');
    await settle();

    expect(published.map((segment) => segment.id)).toEqual(['microphone-1']);
  });

  it('aborts the decode in progress on stop and ignores its late answer', async () => {
    const { live, calls, published } = setup();
    live.start();
    live.push('microphone', utterance());

    live.stop();
    calls[0]!.resolve('trop tard');
    await settle();

    expect(calls[0]!.signal.aborted).toBe(true);
    expect(published).toEqual([]);
  });

  it('ignores audio before the start and after the stop, and an empty block', () => {
    const { live, calls } = setup();

    live.push('microphone', utterance());
    live.start();
    live.push('microphone', new Int16Array(0));
    live.stop();
    live.push('microphone', utterance());
    live.pause();

    expect(calls).toEqual([]);
  });

  it('shows no blank draft, but closes a draft whose final turns out blank', async () => {
    const { live, calls, published } = setup();
    live.start();

    live.push('microphone', utterance());
    calls[0]!.resolve('[BLANK_AUDIO]');
    await settle();
    live.push('system', tone(2_000));
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
    live.push('microphone', utterance());
    live.start();

    live.push('microphone', utterance());
    calls[1]!.resolve('Nouvelle session');
    await settle();

    expect(published.map(({ id, start }) => ({ id, start }))).toEqual([
      { id: 'microphone-0', start: 0 },
    ]);
  });
});

describe('spoken text', () => {
  it('removes the non-speech marks and spaces', () => {
    expect(spokenText(' [BLANK_AUDIO] Oui,\n  bien sûr. [Rires]')).toBe('Oui, bien sûr.');
  });
});
