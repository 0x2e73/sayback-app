import { describe, expect, it } from 'vitest';
import type { Notes } from '../../shared/contracts';
import { notesInstruction } from './notes-context';
import {
  CONTEXT_TOKENS,
  FRAME_TOKENS,
  MAX_FRAMES_PER_CALL,
  OUTPUT_TOKENS,
  REQUEST_OVERHEAD_TOKENS,
  estimateTokens,
} from './ollama-budget';
import { type ChatCall, echoNotes, fakeOllama, meetingOf } from './ollama-fake';
import { OllamaNotes } from './ollama-notes';

const media = {
  readAudio: async () => Buffer.from('audio'),
  readFrame: async () => Buffer.from('image'),
};

function providerOver(request: typeof fetch, model = 'qwen3.5:4b'): OllamaNotes {
  return new OllamaNotes(() => model, media, request);
}

function fits(call: ChatCall): boolean {
  const prompt =
    estimateTokens(call.system + call.user) +
    call.images.length * FRAME_TOKENS +
    REQUEST_OVERHEAD_TOKENS;
  return prompt + OUTPUT_TOKENS <= CONTEXT_TOKENS;
}

function ids(notes: Notes): string[] {
  return [notes.keyPoints, notes.decisions, notes.actions, notes.questions]
    .flat()
    .flatMap((item) => item.sourceIds);
}

describe('Ollama notes on a short meeting', () => {
  it('makes one call to the native chat API, pinned to the window and without thinking', async () => {
    const { request, calls, spy } = fakeOllama();
    const meeting = meetingOf({ blocks: 3, frames: 1 });

    const notes = await providerOver(request).summarize(meeting);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1]?.[0])).toBe('http://127.0.0.1:11434/api/chat');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe(notesInstruction);
    expect(calls[0]?.images).toEqual([Buffer.from('image').toString('base64')]);
    expect(calls[0]?.body).toMatchObject({
      model: 'qwen3.5:4b',
      stream: false,
      think: false,
      options: { num_ctx: CONTEXT_TOKENS, num_predict: OUTPUT_TOKENS },
    });
    expect(ids(notes)).toEqual(['0-0', '2-0']);
    expect(calls[0]?.body.format).toMatchObject({
      required: expect.arrayContaining([
        'summary',
        'keyPoints',
        'decisions',
        'actions',
        'questions',
      ]),
      properties: { keyPoints: { items: { required: ['text', 'sourceIds'] } } },
    });
  });

  it('explains when the selected local model cannot read the screen', async () => {
    const { request, spy } = fakeOllama(undefined, ['completion']);

    await expect(
      providerOver(request, 'text-only').summarize(meetingOf({ blocks: 2, frames: 1 })),
    ).rejects.toThrow(/vision/);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('refuses Ollama cloud aliases before sending meeting content', async () => {
    const request = (async () =>
      new Response(
        JSON.stringify({ capabilities: ['completion'], remote_host: 'https://ollama.com' }),
      )) as typeof fetch;

    await expect(
      providerOver(request, 'alias').summarize(meetingOf({ blocks: 2 })),
    ).rejects.toThrow(/cloud/);
  });
});

describe('Ollama notes on a long meeting', () => {
  it('maps slices that each fit the window, then merges the partial notes', async () => {
    const { request, calls } = fakeOllama();
    const meeting = meetingOf({ blocks: 68 });

    const notes = await providerOver(request).summarize(meeting);

    const maps = calls.filter((call) => call.kind === 'map');
    const reduces = calls.filter((call) => call.kind === 'reduce');
    expect(maps.length).toBeGreaterThan(3);
    expect(reduces.length).toBeGreaterThan(0);
    expect(calls.every(fits)).toBe(true);
    const sent = maps.flatMap(
      (call) => (JSON.parse(call.user) as { transcript: Array<{ id: string }> }).transcript,
    );
    expect(sent.map((block) => block.id)).toEqual(meeting.transcript.map((segment) => segment.id));
    expect(ids(notes)).toEqual(['0-0', '67-0']);
  });

  it('never sends the transcript to the merge, only the partial notes', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const reduces = calls.filter((call) => call.kind === 'reduce');
    for (const call of reduces) {
      expect(call.user).not.toContain('Nous validons');
      expect(call.user).toContain('"partials"');
    }
    const firstMerge = JSON.parse(reduces[0]?.user ?? '{}') as { partials: Notes[] };
    expect(firstMerge.partials[0]?.keyPoints[0]?.sourceIds).toEqual(['0-0']);
  });

  it('asks the model for partial notes about the slice only', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const map = calls.find((call) => call.kind === 'map');
    expect(map?.system).toContain('extrait');
    expect(map?.system).toContain(notesInstruction);
  });

  it('spreads the screen frames over the calls and keeps each call inside the window', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68, frames: 60 }));

    const maps = calls.filter((call) => call.kind === 'map');
    expect(maps.filter((call) => call.images.length > 0).length).toBeGreaterThan(3);
    expect(Math.max(...maps.map((call) => call.images.length))).toBeLessThanOrEqual(
      MAX_FRAMES_PER_CALL,
    );
    expect(
      calls.filter((call) => call.kind === 'reduce').every((call) => !call.images.length),
    ).toBe(true);
    expect(calls.every(fits)).toBe(true);
  });

  it('reduces in bounded rounds when the partial notes do not fit one call', async () => {
    const { request, calls } = fakeOllama();
    const meeting = meetingOf({ blocks: 240, blockChars: 1_000 });

    const notes = await providerOver(request).summarize(meeting);

    const maps = calls.filter((call) => call.kind === 'map').length;
    const reduces = calls.filter((call) => call.kind === 'reduce').length;
    expect(maps).toBeGreaterThan(30);
    expect(reduces).toBeLessThanOrEqual(maps);
    expect(calls.every(fits)).toBe(true);
    expect(ids(notes)).toEqual(['0-0', '239-0']);
  });

  it('drops a citation invented by the merge and keeps the real ones', async () => {
    const { request } = fakeOllama((call) => {
      if (call.kind !== 'reduce') return echoOf(call);
      const merged = echoNotes(call);
      const real = merged.keyPoints[0]?.sourceIds ?? [];
      return {
        ...merged,
        decisions: [{ text: 'Inventé', sourceIds: ['999-0'] }],
        actions: [{ text: 'Mélangé', sourceIds: [...real, '999-1'] }],
      };
    });

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    expect(notes.decisions).toEqual([]);
    expect(notes.actions).toEqual([{ text: 'Mélangé', sourceIds: ['0-0'] }]);
    expect(ids(notes)).not.toContain('999-0');
    expect(ids(notes)).not.toContain('999-1');
    expect(notes.keyPoints.length).toBeGreaterThan(0);
  });

  it('rejects a slice whose notes cite nothing real, before any merge', async () => {
    const { request, calls } = fakeOllama((call) => ({
      ...echoOf(call),
      keyPoints: [{ text: 'Inventé', sourceIds: ['999-0'] }],
    }));

    await expect(providerOver(request).summarize(meetingOf({ blocks: 68 }))).rejects.toThrow(
      /aucune source réelle/,
    );
    expect(calls.some((call) => call.kind === 'reduce')).toBe(false);
  });
});

function echoOf(call: ChatCall): Notes {
  const first = (JSON.parse(call.user) as { transcript: Array<{ id: string }> }).transcript[0];
  return {
    summary: 'Extrait',
    keyPoints: [{ text: 'Point', sourceIds: [first?.id ?? ''] }],
    decisions: [],
    actions: [],
    questions: [],
  };
}
