import { describe, expect, it } from 'vitest';
import { type Condensed, sliceInstruction } from './notes-reduce';
import {
  CONTEXT_TOKENS,
  FRAME_TOKENS,
  MAX_FRAMES_PER_CALL,
  OUTPUT_TOKENS,
  REQUEST_OVERHEAD_TOKENS,
  estimateTokens,
} from './ollama-budget';
import {
  type ChatCall,
  callOf,
  echoNotes,
  fakeOllama,
  ids,
  meetingOf,
  providerOver,
  sliceIds,
  uncitedBlock,
} from './ollama-fake.test-support';

function fits(call: ChatCall): boolean {
  const prompt =
    estimateTokens(call.system + call.user) +
    call.images.length * FRAME_TOKENS +
    REQUEST_OVERHEAD_TOKENS;
  return prompt + OUTPUT_TOKENS <= CONTEXT_TOKENS;
}

function allowedIds(call: ChatCall): string[] {
  const format = call.body.format as {
    properties: {
      keyPoints: { items: { properties: { sourceIds: { items: { enum?: string[] } } } } };
    };
  };
  return format.properties.keyPoints.items.properties.sourceIds.items.enum ?? [];
}

describe('Ollama notes on a short meeting', () => {
  it('makes one call to the native chat API, pinned to the window and without thinking', async () => {
    const { request, calls, spy } = fakeOllama();
    const meeting = meetingOf({ blocks: 3, frames: 1 });

    const notes = await providerOver(request).summarize(meeting);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1]?.[0])).toBe('http://127.0.0.1:11434/api/chat');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toBe(sliceInstruction);
    expect(calls[0]?.images).toEqual([Buffer.from('image').toString('base64')]);
    expect(calls[0]?.body).toMatchObject({
      model: 'qwen3.5:4b',
      stream: false,
      think: false,
      options: { num_ctx: CONTEXT_TOKENS, num_predict: OUTPUT_TOKENS },
    });
    expect(ids(notes)).toEqual(['0-0', '2-0', '0-0', '0-0', '2-0']);
  });

  it('tells the model the limits of its answer and restricts its ids to the meeting', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 3 }));

    expect(calls[0]?.system).toContain('140 caractères');
    expect(calls[0]?.system).toContain('4 décisions, 4 actions');
    expect(allowedIds(callOf(calls, 'single'))).toEqual(['0-0', '1-0', '2-0']);
  });

  it('drops a decision or an action that only states an absence, on the single-call path too', async () => {
    const { request } = fakeOllama((call) => ({
      ...echoNotes(call),
      decisions: [
        { text: 'Aucune décision n’a été prise', sourceIds: ['0-0'] },
        { text: 'Garder mardi', sourceIds: ['1-0'] },
      ],
      actions: [{ text: 'Pas d’action', sourceIds: ['0-0'] }],
    }));

    const notes = await providerOver(request).summarize(meetingOf({ blocks: 3 }));

    expect(notes.decisions).toEqual([{ text: 'Garder mardi', sourceIds: ['1-0'] }]);
    expect(notes.actions).toEqual([]);
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

  it.each(['qwen3-coder:480b-cloud', 'gpt-oss:120b-cloud', 'kimi:cloud'])(
    'refuses the cloud model %s without any request',
    async (model) => {
      const { request, spy } = fakeOllama();

      await expect(
        providerOver(request, model).summarize(meetingOf({ blocks: 2 })),
      ).rejects.toThrow(/cloud/);
      expect(spy).not.toHaveBeenCalled();
    },
  );
});

describe('Ollama notes on a long meeting', () => {
  it('maps slices that each fit the window, then merges the partial notes', async () => {
    const { request, calls } = fakeOllama();
    const meeting = meetingOf({ blocks: 68 });

    const notes = await providerOver(request).summarize(meeting);

    const maps = calls.filter((call) => call.kind === 'map');
    expect(maps.length).toBeGreaterThan(3);
    expect(calls.filter((call) => call.kind === 'reduce').length).toBeGreaterThan(0);
    expect(calls.every(fits)).toBe(true);
    expect(maps.flatMap(sliceIds)).toEqual(meeting.transcript.map((segment) => segment.id));
    expect(notes.keyPoints.flatMap((item) => item.sourceIds)).toEqual(['0-0', '67-0']);
  });

  it('never sends the transcript, decisions or actions to the merge', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const reduces = calls.filter((call) => call.kind === 'reduce');
    for (const call of reduces) {
      expect(call.user).not.toContain('Nous validons');
      expect(call.user).not.toContain('Décision');
      expect(call.user).not.toContain('Action');
      expect(call.user).toContain('"partials"');
    }
    const firstMerge = JSON.parse(reduces[0]?.user ?? '{}') as { partials: Condensed[] };
    expect(firstMerge.partials[0]?.keyPoints[0]?.sourceIds).toEqual(['0-0']);
  });

  it('restricts the ids of each call to those it was shown', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const maps = calls.filter((call) => call.kind === 'map');
    for (const call of maps) expect(allowedIds(call)).toEqual(sliceIds(call));
    const merge = callOf(calls, 'reduce');
    expect(allowedIds(merge)).toContain('0-0');
    expect(allowedIds(merge)).not.toContain(uncitedBlock(68));
  });

  it('asks the model for partial notes about the extract only, citing ids it contains', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68 }));

    const map = calls.find((call) => call.kind === 'map');
    expect(map?.system).toContain('extrait');
    expect(map?.system).toContain('cite uniquement des ids présents dans cet extrait');
    expect(map?.system).toContain(sliceInstruction);
  });

  it('spreads the screen frames over the calls and names the block each one overlaps', async () => {
    const { request, calls } = fakeOllama();

    await providerOver(request).summarize(meetingOf({ blocks: 68, frames: 60 }));

    const maps = calls.filter((call) => call.kind === 'map');
    expect(maps.filter((call) => call.images.length > 0).length).toBeGreaterThan(3);
    expect(Math.max(...maps.map((call) => call.images.length))).toBeLessThanOrEqual(
      MAX_FRAMES_PER_CALL,
    );
    const withImage = maps.find((call) => call.images.length > 0);
    expect(withImage?.user).toMatch(/écran à [\d.]+ secondes \(bloc \d+-0\)/);
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
    expect(notes.keyPoints.flatMap((item) => item.sourceIds)).toEqual(['0-0', '239-0']);
  });

  it('rejects a slice whose notes cite nothing real, before any merge', async () => {
    const { request, calls } = fakeOllama((call) => ({
      summary: 'Extrait',
      keyPoints: [{ text: 'Inventé', sourceIds: [`${sliceIds(call).length}-invented`] }],
      decisions: [],
      actions: [],
      questions: [],
    }));

    await expect(providerOver(request).summarize(meetingOf({ blocks: 68 }))).rejects.toThrow(
      /aucune source réelle/,
    );
    expect(calls.some((call) => call.kind === 'reduce')).toBe(false);
  });
});
